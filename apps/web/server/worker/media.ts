import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { availableParallelism } from 'node:os'
import { extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { supabaseAdmin } from '../supabase'
import { mediaDir, SOURCE_TTL_MS, tools, ytdlpAuthArgs } from './config'
import { run } from './exec'

export type Word = { start: number; end: number; text: string }

export async function sourcePath(streamId: string) {
  await mkdir(mediaDir, { recursive: true })
  return join(mediaDir, `${streamId}.mp4`)
}

/** Download (or reuse) the source video at up to 1080p. */
export type ProgressFn = (pct: number, detail?: string) => void

/**
 * yt-dlp downloads video and audio as separate files and reports each 0→100%,
 * so we fold them into one overall percentage.
 */
export async function downloadSource(url: string, streamId: string, onProgress?: ProgressFn) {
  const out = await sourcePath(streamId)
  if (existsSync(out)) return out
  let parts = 1
  let part = -1
  await run(
    tools.ytdlp,
    [
      ...ytdlpAuthArgs(),
      '--no-playlist',
      '--no-warnings',
      '--newline',
      '--progress-template', 'download:SC|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
      '-f', 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/b',
      '--merge-output-format', 'mp4',
      '-o', out,
      url,
    ],
    {
      onStdout: (line) => {
        const formats = line.match(/Downloading \d+ format\(s\): (\S+)/)
        if (formats) parts = formats[1].split('+').length
        if (line.includes('[download] Destination:')) part++
        const m = line.match(/^SC\|\s*([\d.]+)%\|\s*(\S+)\|\s*(\S+)/)
        if (m) {
          const overall = ((Math.max(0, part) + Number(m[1]) / 100) / parts) * 100
          const speed = m[2].includes('N/A') ? '' : ` · ${m[2]}`
          const eta = /^\d/.test(m[3]) ? ` · ${m[3]} left` : ''
          onProgress?.(Math.min(100, overall), `${speed}${eta}`)
        }
      },
    },
  ).catch(async (e) => {
    await rm(out, { force: true })
    throw e
  })
  onProgress?.(100)
  return out
}

/** Fetch (or reuse) a video the user uploaded to the uploads bucket, streamed to disk so big files are fine. */
export async function fetchUpload(storagePath: string, streamId: string, onProgress?: ProgressFn) {
  await mkdir(mediaDir, { recursive: true })
  const out = join(mediaDir, `upload-${streamId}${extname(storagePath) || '.mp4'}`)
  if (existsSync(out)) return out
  const { data, error } = await supabaseAdmin().storage.from('uploads').createSignedUrl(storagePath, 60 * 60)
  if (error) throw new Error(`Upload is missing: ${error.message}`)
  const res = await fetch(data.signedUrl)
  if (!res.ok || !res.body) throw new Error(`Couldn’t read the upload (${res.status})`)

  const total = Number(res.headers.get('content-length')) || 0
  let got = 0
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctl) {
      got += chunk.byteLength
      if (total) onProgress?.((got / total) * 100, ` · ${(got / 1e6).toFixed(0)} of ${(total / 1e6).toFixed(0)} MB`)
      ctl.enqueue(chunk)
    },
  })
  const partial = `${out}.part`
  try {
    await pipeline(Readable.fromWeb(res.body.pipeThrough(counter) as NodeReadableStream), createWriteStream(partial))
    await rename(partial, out)
  } catch (e) {
    await rm(partial, { force: true })
    throw e
  }
  onProgress?.(100)
  return out
}

/** A post's title (or caption) without downloading it — also fails fast on private or removed posts. */
export async function probeTitle(url: string): Promise<string | null> {
  const out = await run(tools.ytdlp, [...ytdlpAuthArgs(), '--no-playlist', '--no-warnings', '--skip-download', '--print', '%(title)s', url])
  const title = out.trim().split('\n')[0]?.trim()
  return title && title !== 'NA' ? title.slice(0, 200) : null
}

/** 16 kHz mono WAV — what whisper.cpp wants, and easy to measure loudness from. */
export async function extractAudio(video: string, outDir: string) {
  const wav = join(outDir, 'audio.wav')
  await run(tools.ffmpeg, ['-y', '-v', 'error', '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav])
  return wav
}

export async function probeDuration(file: string): Promise<number> {
  const out = await run(tools.ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])
  return Number(out.trim())
}

export async function probeSize(file: string): Promise<{ width: number; height: number }> {
  // Rotation metadata (phone videos) swaps the displayed width and height.
  const out = await run(tools.ffprobe, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:stream_side_data=rotation', '-of', 'json', file,
  ])
  const s = (JSON.parse(out) as { streams: { width: number; height: number; side_data_list?: { rotation?: number }[] }[] }).streams[0]
  const rotated = Math.abs(s.side_data_list?.find((d) => d.rotation != null)?.rotation ?? 0) % 180 === 90
  return rotated ? { width: s.height, height: s.width } : { width: s.width, height: s.height }
}

/** Non-speech moments whisper tags, e.g. "(laughing)" or "[applause]" — strong clip signals. */
export type AudioEvent = { at: number; kind: 'laughter' | 'applause' | 'cheering' }
export type Transcript = { words: Word[]; events: AudioEvent[] }

const EVENT_KINDS: [RegExp, AudioEvent['kind']][] = [
  [/laugh|chuckl|giggl/i, 'laughter'],
  [/applau|clap/i, 'applause'],
  [/cheer|crowd|whoop/i, 'cheering'],
]

/** Word-level transcript via whisper.cpp (one word per segment). */
export async function transcribe(wav: string, outDir: string, onProgress?: (pct: number) => void): Promise<Transcript> {
  const base = join(outDir, 'transcript')
  const vad = existsSync(tools.vadModel) ? ['--vad', '-vm', tools.vadModel] : []
  await run(
    tools.whisper,
    [
      '-m', tools.whisperModel, '-f', wav, '-ml', '1', '-sow',
      // Don't condition on previous text: stops one hallucinated line repeating for minutes.
      '-mc', '0',
      '-t', String(Math.min(8, Math.max(2, availableParallelism() - 2))),
      ...vad,
      '-oj', '-of', base, '-pp', '-np',
    ],
    {
      onStderr: (line) => {
        const m = line.match(/progress\s*=\s*(\d+)%/)
        if (m) onProgress?.(Number(m[1]))
      },
    },
  )
  const json = JSON.parse(await readFile(`${base}.json`, 'utf8')) as {
    transcription: { offsets: { from: number; to: number }; text: string }[]
  }
  // Tags like "(speaking in foreign language)" arrive split across several word segments, so walk them
  // as a stream: anything inside (...) or [...] is dropped from the words and kept as an event if it's a reaction.
  const words: Word[] = []
  const events: AudioEvent[] = []
  let tag: { at: number; text: string } | null = null
  for (const s of json.transcription) {
    const text = s.text.trim()
    if (!text) continue
    const at = s.offsets.from / 1000
    if (!tag && /^[([]/.test(text)) tag = { at, text: '' }
    if (tag) {
      tag.text += ` ${text}`
      if (/[)\]][.,!?]*$/.test(text)) {
        const kind = EVENT_KINDS.find(([re]) => re.test(tag!.text))?.[1]
        if (kind) events.push({ at: tag.at, kind })
        tag = null
      }
      continue
    }
    words.push({ start: at, end: s.offsets.to / 1000, text })
  }
  return { words, events }
}

/** Loudness in dBFS for each window of `windowSec`, read straight from the 16-bit PCM WAV. */
export async function loudness(wav: string, windowSec = 0.5): Promise<number[]> {
  const buf = await readFile(wav)
  const dataStart = buf.indexOf('data') + 8 // skip RIFF header
  const samples = new Int16Array(buf.buffer, buf.byteOffset + dataStart, Math.floor((buf.length - dataStart) / 2))
  const per = Math.round(16000 * windowSec)
  const out: number[] = []
  for (let i = 0; i < samples.length; i += per) {
    let sum = 0
    const end = Math.min(i + per, samples.length)
    for (let j = i; j < end; j++) sum += samples[j] * samples[j]
    const rms = Math.sqrt(sum / Math.max(1, end - i)) / 32768
    out.push(20 * Math.log10(rms + 1e-9))
  }
  return out
}

/** Delete cached source videos older than the TTL — media is only kept temporarily. */
export async function cleanupSources() {
  if (!existsSync(mediaDir)) return
  const now = Date.now()
  for (const name of await readdir(mediaDir)) {
    const p = join(mediaDir, name)
    const s = await stat(p).catch(() => null)
    if (s && now - s.mtimeMs > SOURCE_TTL_MS) await rm(p, { recursive: true, force: true })
  }
}
