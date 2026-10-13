/**
 * Live recorder: records every live stream from creators with "Record live streams" on, and every
 * ANALYZE_EVERY seconds scores the newest stretch for moments (optionally auto-queuing clips).
 * Runs locally via `npm run dev`; in production it moves to the worker host alongside the clip worker.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { queueRender } from '../clips'
import { getEntitlements } from '../entitlements'
import { supabaseAdmin } from '../supabase'
import { mediaDir, tools } from '../worker/config'
import { run } from '../worker/exec'
import { loudness, transcribe } from '../worker/media'
import { detectMoments } from '../worker/scoring'
import { pickSegments, readSegments, segmentsToWav, sessionDir } from './segments'

const TICK_MS = 15_000
const ANALYZE_EVERY = Number(process.env.LIVE_ANALYZE_SECONDS ?? 120) // seconds of new footage per analysis
const OVERLAP = 30 // re-read the end of the previous window so moments spanning the boundary aren't missed
const KEEP_SECONDS = 2 * 60 * 60 // rolling buffer: older chunks are deleted while the stream continues
const db = supabaseAdmin()

type Session = {
  id: string
  streamId: string
  creatorId: string
  workspaceId: string
  title: string
  dir: string
  ffmpeg: ChildProcess
  analyzedTo: number
  analyzing: boolean
  stopping: boolean
}

const sessions = new Map<string, Session>() // keyed by stream id
const log = (...a: unknown[]) => console.log('[live]', ...a)

// ── Recording

async function resolveMediaUrl(pageUrl: string): Promise<string> {
  // Ask yt-dlp for the stream's HLS URL (≤720p is plenty for vertical clips and keeps CPU low).
  const out = await run(tools.ytdlp, ['-g', '--no-warnings', '-f', 'best[height<=720]/best', pageUrl])
  const url = out.trim().split('\n')[0]
  if (!url) throw new Error('No playable stream URL found')
  return url
}

async function start(stream: { id: string; url: string; title: string | null; creator_id: string; workspace_id: string }) {
  const { data: row, error } = await db
    .from('live_sessions')
    .insert({ workspace_id: stream.workspace_id, stream_id: stream.id, creator_id: stream.creator_id, message: 'Connecting to stream' })
    .select('id')
    .single()
  if (error) throw error
  const dir = sessionDir(stream.id, row.id)
  await mkdir(dir, { recursive: true })

  let mediaUrl: string
  try {
    mediaUrl = await resolveMediaUrl(stream.url)
  } catch (e) {
    await db.from('live_sessions').update({ status: 'failed', ended_at: new Date().toISOString(), error: (e as Error).message.slice(0, 500) }).eq('id', row.id)
    throw e
  }

  // Stream-copy into ~10s chunks; segments.csv records each chunk's start/end on the recording timeline.
  const ffmpeg = spawn(
    tools.ffmpeg,
    ['-hide_banner', '-loglevel', 'error', '-i', mediaUrl, '-map', '0:v:0?', '-map', '0:a:0?', '-c', 'copy',
     '-f', 'segment', '-segment_time', '10', '-segment_format', 'mpegts', '-reset_timestamps', '1',
     '-segment_list', join(dir, 'segments.csv'), '-segment_list_type', 'csv', join(dir, 'seg_%06d.ts')],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  const session: Session = {
    id: row.id,
    streamId: stream.id,
    creatorId: stream.creator_id,
    workspaceId: stream.workspace_id,
    title: stream.title ?? 'Live stream',
    dir,
    ffmpeg,
    analyzedTo: 0,
    analyzing: false,
    stopping: false,
  }
  let stderr = ''
  ffmpeg.stderr?.on('data', (d) => (stderr = (stderr + d).slice(-1000)))
  ffmpeg.on('close', async (code) => {
    sessions.delete(stream.id)
    // A clean stop is ours; anything else (stream ended, URL expired, network) ends this session.
    // If the creator is still live, the next tick starts a fresh session.
    await analyze(session, true).catch(() => {})
    await db
      .from('live_sessions')
      .update({
        status: session.stopping || code === 0 ? 'stopped' : 'failed',
        ended_at: new Date().toISOString(),
        message: session.stopping ? 'Stream ended' : 'Recording stopped',
        ...(code && !session.stopping ? { error: stderr.trim().split('\n').pop()?.slice(0, 500) ?? `ffmpeg exited ${code}` } : {}),
      })
      .eq('id', session.id)
    log(`stopped recording "${session.title}" (exit ${code})`)
  })
  sessions.set(stream.id, session)
  await db.from('live_sessions').update({ message: 'Recording' }).eq('id', row.id)
  log(`recording "${session.title}"`)
}

function stop(session: Session) {
  session.stopping = true
  session.ffmpeg.kill('SIGINT') // lets ffmpeg finish the current chunk cleanly
}

// ── Analysis

async function analyze(session: Session, final = false) {
  if (session.analyzing) return
  const segments = await readSegments(session.dir)
  const captured = segments.at(-1)?.end ?? 0
  await db.from('live_sessions').update({ seconds_captured: captured }).eq('id', session.id)
  if (!final && captured - session.analyzedTo < ANALYZE_EVERY) return
  if (captured - session.analyzedTo < 15) return

  session.analyzing = true
  const from = Math.max(0, session.analyzedTo - OVERLAP)
  const window = pickSegments(segments, from, captured)
  const work = join(mediaDir, `live-work-${session.id}-${Date.now()}`)
  await mkdir(work, { recursive: true })
  try {
    const offset = window[0].start
    const wav = await segmentsToWav(window, work)
    const words = (await transcribe(wav, work)).map((w) => ({ ...w, start: w.start + offset, end: w.end + offset }))
    // Pad loudness so its index lines up with absolute recording time.
    const db0 = await loudness(wav)
    const padded = [...Array(Math.round(offset / 0.5)).fill(-90), ...db0]
    const found = detectMoments(words, padded, captured, { scale: 'absolute', maxMoments: 3 })
      .filter((m) => m.end > from + 5) // only moments that are actually in this window

    // Skip anything overlapping a moment we already stored for this recording.
    const { data: existing } = await db.from('moments').select('start_seconds, end_seconds').eq('stream_id', session.streamId).contains('signals', { live: { sessionId: session.id } })
    const fresh = found.filter((m) => !(existing ?? []).some((e) => m.start < Number(e.end_seconds) && m.end > Number(e.start_seconds)))

    if (fresh.length) {
      const { data: inserted, error } = await db
        .from('moments')
        .insert(
          fresh.map((m) => ({
            workspace_id: session.workspaceId,
            stream_id: session.streamId,
            start_seconds: +m.start.toFixed(2),
            end_seconds: +m.end.toFixed(2),
            score: m.score,
            title: m.title,
            transcript: m.transcript,
            signals: { ...m.signals, live: { sessionId: session.id } },
          })),
        )
        .select('id, score')
      if (error) throw error

      const { data: creator } = await db.from('creators').select('auto_clip, auto_clip_min_score').eq('id', session.creatorId).single()
      if (creator?.auto_clip) {
        for (const m of inserted ?? []) {
          if (m.score < creator.auto_clip_min_score) continue
          await queueRender(session.workspaceId, m.id).catch((e) => log('auto-clip skipped:', (e as Error).message))
        }
      }
    }

    session.analyzedTo = captured
    const { data: s } = await db.from('live_sessions').select('moments_found').eq('id', session.id).single()
    await db
      .from('live_sessions')
      .update({
        seconds_analyzed: captured,
        last_analyzed_at: new Date().toISOString(),
        moments_found: (s?.moments_found ?? 0) + fresh.length,
      })
      .eq('id', session.id)
    log(`analysed ${Math.round(captured - from)}s of "${session.title}" → ${fresh.length} new moment(s)`)
  } finally {
    session.analyzing = false
    await rm(work, { recursive: true, force: true })
  }

  // Rolling buffer: drop chunks older than KEEP_SECONDS (clips from them can no longer be rendered).
  for (const s of segments) if (s.end < captured - KEEP_SECONDS) await rm(s.file, { force: true })
}

// ── Loop

const paidCache = new Map<string, { ok: boolean; at: number }>()
async function hasPlan(workspaceId: string) {
  const hit = paidCache.get(workspaceId)
  if (hit && Date.now() - hit.at < 60_000) return hit.ok
  const ok = (await getEntitlements(workspaceId).catch(() => null))?.planId !== 'free'
  paidCache.set(workspaceId, { ok, at: Date.now() })
  return ok
}

async function tick() {
  const { data: live, error } = await db
    .from('streams')
    .select('id, url, title, creator_id, workspace_id, creators!inner(capture_live, active)')
    .eq('status', 'live')
    .eq('creators.capture_live', true)
    .eq('creators.active', true)
  if (error) throw error

  const wanted = new Set<string>()
  for (const s of live ?? []) {
    if (!(await hasPlan(s.workspace_id))) continue
    wanted.add(s.id)
    if (!sessions.has(s.id)) await start(s).catch((e) => log(`couldn't start "${s.title}":`, (e as Error).message))
  }
  for (const [streamId, session] of sessions) {
    if (!wanted.has(streamId)) stop(session)
    else analyze(session).catch((e) => log('analysis failed:', (e as Error).message))
  }
}

async function recoverStale() {
  // Sessions left "recording" by a previous run can't be resumed (the ffmpeg process is gone).
  await db.from('live_sessions').update({ status: 'stopped', ended_at: new Date().toISOString(), message: 'Recorder restarted' }).eq('status', 'recording')
}

async function main() {
  log(`ready · analysing every ${ANALYZE_EVERY}s of new footage`)
  await recoverStale()
  for (;;) {
    await tick().catch((e) => log('tick failed:', (e as Error).message ?? e))
    await new Promise((r) => setTimeout(r, TICK_MS))
  }
}

process.on('SIGINT', () => {
  for (const s of sessions.values()) stop(s)
  setTimeout(() => process.exit(0), 1500)
})

main()
