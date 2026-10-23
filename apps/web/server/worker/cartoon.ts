/**
 * Animate: turn an uploaded video into a cartoon.
 *   Light filter → DCT-Net 3D on this machine (workers/py/light_filter.py), free
 *   Free effects → FFmpeg colour grades and OpenCV drawn looks (./effects.ts), free
 *   AI styles    → fal.ai Lucy Restyle (paid per second, see animatePresets.creditsFor)
 * Either way the restyled picture gets the original audio back, then lands in the clips bucket as a
 * whole-video moment + clip, so publishing and scheduling work exactly like any other clip.
 */
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { cartoonStyle, creditsFor, MAX_CARTOON_SECONDS, type CartoonStyleId } from '../../src/lib/animatePresets.js'
import { refundCredits } from '../clips.js'
import { supabaseAdmin } from '../supabase.js'
import { mediaDir, tools } from './config.js'
import { run } from './exec.js'
import { falEnabled, falResult, falStatus, falSubmit, LUCY_RESTYLE, type FalRequest } from './fal.js'
import { colourGrade, drawnLook } from './effects.js'
import { downloadSource, fetchUpload, probeDuration, probeSize, probeTitle } from './media.js'

export type CartoonJob = {
  id: string
  workspace_id: string
  payload: { streamId: string; style: CartoonStyleId; details?: string; fal?: FalRequest }
}
type Progress = (jobId: string, pct: number, message: string, force?: boolean) => Promise<void>

const db = supabaseAdmin()
const FAL_POLL_MS = 5000
const FAL_TIMEOUT_MS = 60 * 60 * 1000
const chargeRef = (job: CartoonJob) => `cartoon:${job.id}`

async function setStream(streamId: string, analysis_status: string, analysis_message: string, extra: object = {}) {
  await db.from('streams').update({ analysis_status, analysis_message, ...extra }).eq('id', streamId)
}

async function download(url: string, out: string) {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Couldn’t download the cartoon (${res.status})`)
  await pipeline(Readable.fromWeb(res.body as NodeReadableStream), createWriteStream(out))
}

/** The free engine: DCT-Net 3D frame by frame, a little over real time on an M1 Pro. */
async function lightFilter(job: CartoonJob, source: string, out: string, progress: Progress) {
  const models = tools.lightFilterModels
  if (!existsSync(join(models, 'cartoon_bg.onnx')) || !existsSync(join(models, 'cartoon_h.onnx'))) {
    throw new Error('The Light filter models aren’t installed on the worker — run workers/py/setup_light_filter.sh')
  }
  await run(tools.python, [join(tools.pyDir, 'light_filter.py'), source, out, models, tools.faceModel, tools.ffmpeg], {
    onStdout: (line) => {
      const m = line.match(/^PROGRESS (\d+) (\d+)/)
      if (m) {
        const pct = (Number(m[1]) / Number(m[2])) * 100
        progress(job.id, 12 + pct * 0.76, `Cartoonifying · ${Math.round(pct)}%`)
      }
    },
  })
}

/** fal fetches the source itself, so a pasted link's download is copied into the uploads bucket first. */
async function storedSource(job: CartoonJob, stream: { id: string; source_path: string | null }, source: string) {
  if (stream.source_path) return stream.source_path
  const path = `${job.workspace_id}/${stream.id}.mp4`
  const { error } = await db.storage.from('uploads').upload(path, await readFile(source), { contentType: 'video/mp4', upsert: true })
  if (error) throw new Error(`Couldn’t store the video for the AI: ${error.message}`)
  await db.from('streams').update({ source_path: path }).eq('id', stream.id)
  return path
}

/** The paid engine. The fal request is saved on the job, so a worker restart picks it up instead of paying twice. */
async function aiRestyle(job: CartoonJob, sourcePath: string, prompt: string, out: string, duration: number, progress: Progress) {
  let req = job.payload.fal
  if (!req) {
    // fal fetches the source itself; give it a link that outlives its queue.
    const { data, error } = await db.storage.from('uploads').createSignedUrl(sourcePath, 6 * 60 * 60)
    if (error) throw new Error(`Upload is missing: ${error.message}`)
    req = await falSubmit(LUCY_RESTYLE, { video_url: data.signedUrl, prompt, seed: 42, resolution: '720p', enhance_prompt: true })
    job.payload.fal = req
    await db.from('jobs').update({ payload: job.payload }).eq('id', job.id)
  }

  const started = Date.now()
  // fal doesn't report a percentage, so ease towards 88% over a rough guess of how long it takes.
  const guessMs = Math.max(60_000, duration * 3000)
  for (;;) {
    const s = await falStatus(req)
    if (s.status === 'COMPLETED') break
    if (Date.now() - started > FAL_TIMEOUT_MS) throw new Error('The AI took more than an hour — try again or pick a shorter video')
    if (s.status === 'IN_QUEUE') {
      await progress(job.id, 12, `Waiting for the AI${s.queuePosition ? ` · ${s.queuePosition} ahead` : ''}`, true)
    } else {
      const pct = 1 - Math.exp(-(Date.now() - started) / guessMs)
      await progress(job.id, 15 + pct * 73, 'Cartoonifying with AI', true)
    }
    await new Promise((r) => setTimeout(r, FAL_POLL_MS))
  }
  const { videoUrl } = await falResult(req)
  await download(videoUrl, out)
}

export async function cartoonify(job: CartoonJob, progress: Progress) {
  const { streamId } = job.payload
  const style = cartoonStyle(job.payload.style)
  if (!style) throw new Error('Unknown style')
  if (style.engine === 'fal' && !falEnabled()) throw new Error('AI styles aren’t set up on the worker yet (FAL_KEY is empty)')

  const { data: stream } = await db.from('streams').select('id, title, url, platform, source_path').eq('id', streamId).single()
  if (!stream) throw new Error('Upload no longer exists')
  const fromLink = !stream.source_path

  const work = join(mediaDir, `job-${job.id}`)
  await mkdir(work, { recursive: true })
  try {
    // Overall bar: fetch 0–10 · charge + set up 10–12 · cartoonify 12–88 · audio, upload 88–100
    const step = async (pct: number, message: string) => {
      await progress(job.id, pct, message, true)
      await setStream(streamId, 'running', message)
    }
    let source: string
    if (fromLink) {
      // Pasted link: look it up (real title, and a clear error for private/removed posts), then download with yt-dlp.
      await step(1, 'Looking up the link')
      const title = await probeTitle(stream.url).catch((e: Error) => {
        throw new Error(`Couldn’t open that link — it may be private, removed or need a login (${e.message.split('\n').pop()?.slice(0, 160)})`)
      })
      if (title && stream.platform === 'link') {
        stream.title = title
        await db.from('streams').update({ title }).eq('id', streamId)
      }
      source = await downloadSource(stream.url, streamId, (p, detail = '') =>
        progress(job.id, 1 + p * 0.09, `Downloading the video · ${Math.round(p)}%${detail}`),
      )
    } else {
      await step(1, 'Fetching your video')
      source = await fetchUpload(stream.source_path!, streamId, (p) => progress(job.id, 1 + p * 0.09, `Fetching your video · ${Math.round(p)}%`))
    }
    const duration = await probeDuration(source)
    await db.from('streams').update({ duration_seconds: Math.round(duration) }).eq('id', streamId)
    if (duration > MAX_CARTOON_SECONDS) throw new Error(`Videos can be up to ${MAX_CARTOON_SECONDS / 60} minutes`)

    // Charged once per job (the RPC ignores a repeat of the same ref), refunded by failCartoon. Free styles skip it.
    const cost = creditsFor(style.id, duration)
    if (cost > 0) {
      const { data: charged, error: spendErr } = await db.rpc('spend_credits', { ws: job.workspace_id, n: cost, spend_ref: chargeRef(job) })
      if (spendErr) throw spendErr
      if (!charged) throw new Error(`This video needs ${cost} credit${cost === 1 ? '' : 's'} — top up and press Retry`)
    }

    // A whole-video moment + clip, reused on retry, so the clip shows up (rendering) straight away.
    const { data: existing } = await db.from('moments').select('id').eq('stream_id', streamId).limit(1).maybeSingle()
    let momentId = existing?.id as string | undefined
    if (momentId) {
      await db.from('moments').update({ status: 'rendering', end_seconds: +duration.toFixed(2) }).eq('id', momentId)
    } else {
      const { data: m, error } = await db
        .from('moments')
        .insert({ workspace_id: job.workspace_id, stream_id: streamId, start_seconds: 0, end_seconds: +duration.toFixed(2), score: 0, title: stream.title, signals: {}, status: 'rendering' })
        .select('id')
        .single()
      if (error) throw error
      momentId = m.id as string
    }
    const { data: clip, error: clipErr } = await db
      .from('clips')
      .upsert(
        { workspace_id: job.workspace_id, moment_id: momentId, stream_id: streamId, status: 'rendering', style: 'cartoon', preset: style.id, error: null, updated_at: new Date().toISOString() },
        { onConflict: 'moment_id' },
      )
      .select('id')
      .single()
    if (clipErr) throw clipErr

    await step(12, style.engine === 'fal' ? 'Sending to the AI' : `Applying ${style.label} · 0%`)
    const toon = join(work, 'toon.mp4')
    const effectProgress = (verb: string) => (pct: number) => progress(job.id, 12 + pct * 0.76, `${verb} · ${Math.round(pct)}%`)
    if (style.engine === 'fal') {
      const details = job.payload.details?.trim()
      await aiRestyle(job, await storedSource(job, stream, source), details ? `${style.prompt}. ${details}` : style.prompt!, toon, duration, progress)
    } else if (style.engine === 'grade') {
      await colourGrade(style.id, source, toon, duration, effectProgress('Colour grading'))
    } else if (style.engine === 'draw') {
      await drawnLook(style.id, source, toon, effectProgress('Drawing'))
    } else {
      await lightFilter(job, source, toon, progress)
    }

    await step(88, 'Adding the sound back')
    const video = join(work, 'cartoon.mp4')
    await run(tools.ffmpeg, [
      '-y', '-v', 'error', '-i', toon, '-i', source,
      '-map', '0:v:0', '-map', '1:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest',
      '-movflags', '+faststart', video,
    ])
    const thumbnail = join(work, 'thumb.jpg')
    await run(tools.ffmpeg, ['-y', '-v', 'error', '-ss', String(Math.min(1.5, duration / 3)), '-i', video, '-frames:v', '1', '-q:v', '4', thumbnail])
    const size = await probeSize(video)

    await step(92, 'Saving your cartoon')
    const base = `${job.workspace_id}/${clip.id}`
    for (const [file, path, contentType] of [
      [video, `${base}.mp4`, 'video/mp4'],
      [thumbnail, `${base}.jpg`, 'image/jpeg'],
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
        duration_seconds: +(await probeDuration(video)).toFixed(2),
        width: size.width,
        height: size.height,
        updated_at: new Date().toISOString(),
      })
      .eq('id', clip.id)
    await db.from('moments').update({ status: 'rendered' }).eq('id', momentId)
    await setStream(streamId, 'done', `${style.label} ready`, { analyzed_at: new Date().toISOString() })
    await progress(job.id, 100, 'Cartoon ready', true)
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/** Mark the upload and its clip failed, and give back whatever this job was charged. */
export async function failCartoon(job: CartoonJob, message: string) {
  const { streamId } = job.payload
  await setStream(streamId, 'failed', message)
  const { data: moments } = await db.from('moments').select('id').eq('stream_id', streamId)
  const ids = moments?.map((m) => m.id) ?? []
  if (ids.length) {
    await db.from('moments').update({ status: 'failed' }).in('id', ids)
    await db.from('clips').update({ status: 'failed', error: message }).in('moment_id', ids).eq('status', 'rendering')
  }
  const { data: spend } = await db.from('credit_spends').select('amount').eq('ref', chargeRef(job)).maybeSingle()
  if (spend?.amount) await refundCredits(job.workspace_id, spend.amount, `refund:${chargeRef(job)}`)
}
