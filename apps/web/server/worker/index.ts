/**
 * Clip worker: claims jobs from the Postgres queue and runs them one at a time.
 *   analyze → download source, transcribe, score moments
 *   render  → cut, reframe 9:16, caption, upload to Storage
 * Runs locally via `npm run dev`; in production it moves to the worker host.
 */
import { mkdir, readFile, rm } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { supabaseAdmin } from '../supabase'
import { mediaDir, MAX_SOURCE_SECONDS, tools } from './config'
import { cleanupSources, downloadSource, extractAudio, loudness, probeDuration, transcribe } from './media'
import { renderClip } from './render'
import { detectMoments } from './scoring'

type Job = { id: string; workspace_id: string; type: 'analyze' | 'render'; payload: Record<string, string>; attempts: number }

const WORKER_ID = `${hostname()}-${process.pid}`
const IDLE_MS = 3000
const db = supabaseAdmin()

let lastProgressAt = 0
async function progress(jobId: string, pct: number, message: string, force = false) {
  // Throttle DB writes; the UI polls every few seconds anyway.
  if (!force && Date.now() - lastProgressAt < 1500) return
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

    await step(5, 'Downloading video')
    const source = await downloadSource(stream.url, streamId)
    const duration = await probeDuration(source)
    if (duration > MAX_SOURCE_SECONDS) throw new Error(`Video is longer than ${Math.round(MAX_SOURCE_SECONDS / 3600)}h`)

    await step(30, 'Extracting audio')
    const wav = await extractAudio(source, work)

    await step(35, 'Transcribing speech')
    const words = await transcribe(wav, work, (p) => {
      const pct = 35 + p * 0.5
      progress(job.id, pct, `Transcribing speech · ${p}%`)
      setStream(streamId, 'running', `Transcribing speech · ${p}%`)
    })

    await step(88, 'Scoring moments')
    const moments = detectMoments(words, await loudness(wav), duration)

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
      : words.length < 20
        ? 'Not enough speech to find moments'
        : 'No strong moments found'
    await setStream(streamId, 'done', message, { analyzed_at: new Date().toISOString() })
    await progress(job.id, 100, message, true)
  } finally {
    await rm(work, { recursive: true, force: true }) // audio + transcript are temporary
  }
}

// ── Render

async function refund(job: Job) {
  // Credits are reserved when the render is queued (ref render:<jobId>); give it back on failure.
  const { data: grants } = await db
    .from('credit_grants')
    .select('expires_at')
    .eq('workspace_id', job.workspace_id)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
  const expires = grants?.[0]?.expires_at ?? new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  await db.from('credit_grants').upsert(
    { workspace_id: job.workspace_id, source: 'refund', source_ref: `refund:render:${job.id}`, amount: 1, remaining: 1, expires_at: expires },
    { onConflict: 'source_ref', ignoreDuplicates: true },
  )
}

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
    await progress(job.id, 10, 'Fetching source video', true)
    const source = await downloadSource(streamUrl, moment.stream_id)

    await progress(job.id, 30, 'Reframing and captioning', true)
    const out = await renderClip({
      source,
      start: Number(moment.start_seconds),
      end: Number(moment.end_seconds),
      words: (moment.signals as { words: [number, number, string][] }).words ?? [],
      workDir: work,
    })

    await progress(job.id, 85, 'Uploading clip', true)
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
      const worked = await runOne()
      if (!worked) await new Promise((r) => setTimeout(r, IDLE_MS))
    } catch (e) {
      console.error('[worker] loop error:', (e as Error).message ?? e)
      await new Promise((r) => setTimeout(r, IDLE_MS * 3))
    }
  }
}

main()
