/**
 * Clip worker: claims jobs from the Postgres queue and runs them one at a time.
 *   analyze → download source, transcribe, score moments
 *   render  → cut, reframe 9:16, caption, upload to Storage
 *   cartoonify → restyle an uploaded video as a cartoon (local Light filter or fal.ai), upload to Storage
 * Runs locally via `npm run dev`; in production it moves to the worker host.
 */
import { mkdir, readFile, rm } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { refundCredits } from '../clips'
import { pickSegments, readSegments, segmentsToVideo, sessionDir } from '../live/segments'
import { supabaseAdmin } from '../supabase'
import { mediaDir, MAX_SOURCE_SECONDS, tools } from './config'
import { cleanupSources, downloadSource, extractAudio, loudness, probeDuration, transcribe } from './media'
import { cartoonify, failCartoon, type CartoonJob } from './cartoon'
import { publishDue } from './publisher'
import { renderClip } from './render'
import { findMoments } from './scoring'

type Job = { id: string; workspace_id: string; type: 'analyze' | 'render' | 'cartoonify'; payload: Record<string, string>; attempts: number }

const WORKER_ID = `${hostname()}-${process.pid}`
const IDLE_MS = 3000
const db = supabaseAdmin()

let lastProgressAt = 0
async function progress(jobId: string, pct: number, message: string, force = false) {
  // Throttle DB writes; the UI polls every few seconds anyway.
  if (!force && Date.now() - lastProgressAt < 1000) return
  lastProgressAt = Date.now()
  await db.from('jobs').update({ progress: Math.round(pct), message }).eq('id', jobId)
}

async function setStream(streamId: string, analysis_status: string, analysis_message: string, extra: object = {}) {
  await db.from('streams').update({ analysis_status, analysis_message, ...extra }).eq('id', streamId)
}

// ── Analyze

async function analyze(job: Job) {
  const streamId = job.payload.streamId
  const { data: stream } = await db.from('streams').select('id, url, title, duration_seconds').eq('id', streamId).single()
  if (!stream) throw new Error('Video no longer exists')

  const work = join(mediaDir, `job-${job.id}`)
  await mkdir(work, { recursive: true })
  try {
    const step = async (pct: number, message: string) => {
      await progress(job.id, pct, message, true)
      await setStream(streamId, 'running', message)
    }

    // Overall bar: download 0–30 · audio 30–35 · transcribe 35–85 · scoring 85–100
    await step(1, 'Downloading video · 0%')
    const source = await downloadSource(stream.url, streamId, (p, detail = '') => {
      const message = `Downloading video · ${Math.round(p)}%${detail}`
      progress(job.id, 1 + p * 0.29, message)
      setStream(streamId, 'running', message)
    })
    const duration = await probeDuration(source)
    if (duration > MAX_SOURCE_SECONDS) throw new Error(`Video is longer than ${Math.round(MAX_SOURCE_SECONDS / 3600)}h`)

    await step(30, 'Extracting audio · 100% downloaded')
    const wav = await extractAudio(source, work)

    await step(35, 'Transcribing speech · 0%')
    const transcript = await transcribe(wav, work, (p) => {
      const pct = 35 + p * 0.5 // whisper reports 0–100
      progress(job.id, pct, `Transcribing speech · ${p}%`)
      setStream(streamId, 'running', `Transcribing speech · ${p}%`)
    })

    await step(88, 'Finding the best moments')
    const moments = await findMoments(transcript, await loudness(wav), duration, { title: stream.title ?? undefined })

    // Replace previous un-rendered detections; keep anything already turned into a clip.
    await db.from('moments').delete().eq('stream_id', streamId).in('status', ['detected', 'failed'])
    if (moments.length) {
      const { error } = await db.from('moments').insert(
        moments.map((m) => ({
          workspace_id: job.workspace_id,
          stream_id: streamId,
          start_seconds: +m.start.toFixed(2),
          end_seconds: +m.end.toFixed(2),
          score: m.score,
          title: m.title,
          transcript: m.transcript,
          signals: m.signals,
        })),
      )
      if (error) throw error
    }

    const message = moments.length
      ? `${moments.length} moment${moments.length === 1 ? '' : 's'} found`
      : transcript.words.length < 20
        ? 'Not enough speech to find moments'
        : 'No strong moments found'
    await setStream(streamId, 'done', message, { analyzed_at: new Date().toISOString() })
    await progress(job.id, 100, message, true)
  } finally {
    await rm(work, { recursive: true, force: true }) // audio + transcript are temporary
  }
}

// ── Render

// Credits are reserved when the render is queued (ref render:<jobId>); give it back on failure.
const refund = (job: Job) => refundCredits(job.workspace_id, 1, `refund:render:${job.id}`)

async function render(job: Job) {
  const momentId = job.payload.momentId
  const { data: moment } = await db
    .from('moments')
    .select('id, stream_id, start_seconds, end_seconds, signals, streams(url)')
    .eq('id', momentId)
    .single()
  if (!moment) throw new Error('Moment no longer exists')
  const streamUrl = (moment.streams as unknown as { url: string }).url

  const { data: clip, error: clipErr } = await db
    .from('clips')
    .upsert(
      { workspace_id: job.workspace_id, moment_id: momentId, stream_id: moment.stream_id, status: 'rendering', error: null, updated_at: new Date().toISOString() },
      { onConflict: 'moment_id' },
    )
    .select('id')
    .single()
  if (clipErr) throw clipErr
  await db.from('moments').update({ status: 'rendering' }).eq('id', momentId)

  const work = join(mediaDir, `job-${job.id}`)
  await mkdir(work, { recursive: true })
  try {
    // Overall bar: source 0–25 · speaker + captions + encode 25–90 · upload 90–100
    await progress(job.id, 1, 'Preparing source video', true)
    const signals = moment.signals as { words?: [number, number, string][]; live?: { sessionId: string } }
    let start = Number(moment.start_seconds)
    let end = Number(moment.end_seconds)
    let words = signals.words ?? []
    let source: string

    if (signals.live) {
      // Live moment: stitch the recorded chunks around it instead of downloading anything.
      const segs = pickSegments(await readSegments(sessionDir(moment.stream_id, signals.live.sessionId)), start - 1, end + 1)
      if (!segs.length) throw new Error('The live recording for this moment has expired')
      source = await segmentsToVideo(segs, work)
      const offset = segs[0].start
      start -= offset
      end -= offset
      words = words.map(([s, e, t]) => [s - offset, e - offset, t])
      await progress(job.id, 25, 'Live footage ready', true)
    } else {
      source = await downloadSource(streamUrl, moment.stream_id, (p, detail = '') =>
        progress(job.id, 1 + p * 0.24, `Downloading source · ${Math.round(p)}%${detail}`),
      )
    }

    await progress(job.id, 25, 'Finding the speaker', true)
    const out = await renderClip({
      onProgress: (p, stage) => progress(job.id, 25 + p * 0.65, `${stage} · ${Math.round(p)}%`),
      source,
      start,
      end,
      words,
      workDir: work,
    })

    await progress(job.id, 90, 'Uploading clip', true)
    const base = `${job.workspace_id}/${clip.id}`
    for (const [file, path, contentType] of [
      [out.video, `${base}.mp4`, 'video/mp4'],
      [out.thumbnail, `${base}.jpg`, 'image/jpeg'],
    ] as const) {
      const { error } = await db.storage.from('clips').upload(path, await readFile(file), { contentType, upsert: true })
      if (error) throw new Error(`Upload failed: ${error.message}`)
    }

    await db
      .from('clips')
      .update({
        status: 'ready',
        video_path: `${base}.mp4`,
        thumbnail_path: `${base}.jpg`,
        duration_seconds: out.duration,
        width: out.width,
        height: out.height,
        updated_at: new Date().toISOString(),
      })
      .eq('id', clip.id)
    await db.from('moments').update({ status: 'rendered' }).eq('id', momentId)
    await progress(job.id, 100, out.face.cx == null ? 'Clip ready (no face found — centred crop)' : 'Clip ready', true)
  } catch (e) {
    await db.from('clips').update({ status: 'failed', error: (e as Error).message.slice(0, 500) }).eq('id', clip.id)
    throw e
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

// ── Loop

async function fail(job: Job, e: unknown) {
  const message = (e as Error).message?.slice(0, 500) ?? String(e)
  console.error(`[worker] ${job.type} ${job.id} failed:`, message)
  await db.from('jobs').update({ status: 'failed', message, finished_at: new Date().toISOString() }).eq('id', job.id)
  if (job.type === 'analyze') await setStream(job.payload.streamId, 'failed', message)
  if (job.type === 'render') {
    await db.from('moments').update({ status: 'failed' }).eq('id', job.payload.momentId)
    await refund(job)
  }
  if (job.type === 'cartoonify') await failCartoon(job as unknown as CartoonJob, message)
}

async function runOne(): Promise<boolean> {
  const { data, error } = await db.rpc('claim_job', { worker: WORKER_ID })
  if (error) throw error
  const job = (data as Job[])[0]
  if (!job) return false

  const started = Date.now()
  console.log(`[worker] ${job.type} ${job.id} started`)
  try {
    if (job.type === 'analyze') await analyze(job)
    else if (job.type === 'cartoonify') await cartoonify(job as unknown as CartoonJob, progress)
    else await render(job)
    await db.from('jobs').update({ status: 'done', progress: 100, finished_at: new Date().toISOString() }).eq('id', job.id)
    console.log(`[worker] ${job.type} ${job.id} done in ${Math.round((Date.now() - started) / 1000)}s`)
  } catch (e) {
    await fail(job, e)
  }
  return true
}

async function recoverInterrupted() {
  // A restart mid-job leaves it "running"; with a single local worker it's safe to re-queue.
  const { data } = await db.from('jobs').update({ status: 'queued', locked_by: null }).eq('status', 'running').select('id')
  if (data?.length) console.log(`[worker] re-queued ${data.length} interrupted job(s)`)
}

async function main() {
  console.log(`[worker] ${WORKER_ID} ready · whisper model ${tools.whisperModel.split('/').pop()} · cache ${mediaDir}`)
  await recoverInterrupted()
  let lastCleanup = 0
  for (;;) {
    try {
      if (Date.now() - lastCleanup > 10 * 60 * 1000) {
        await cleanupSources()
        lastCleanup = Date.now()
      }
      // Scheduled posts go out between clip jobs so a long render never delays them by much.
      const posted = await publishDue().catch((e) => {
        console.error('[publisher] loop error:', (e as Error).message ?? e)
        return 0
      })
      const worked = await runOne()
      if (!worked && !posted) await new Promise((r) => setTimeout(r, IDLE_MS))
    } catch (e) {
      console.error('[worker] loop error:', (e as Error).message ?? e)
      await new Promise((r) => setTimeout(r, IDLE_MS * 3))
    }
  }
}

main()
