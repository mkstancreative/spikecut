import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { mediaDir, SOURCE_TTL_MS, tools } from './config'
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

/** Word-level transcript via whisper.cpp (one word per segment). */
export async function transcribe(wav: string, outDir: string, onProgress?: (pct: number) => void): Promise<Word[]> {
  const base = join(outDir, 'transcript')
  await run(
    tools.whisper,
    ['-m', tools.whisperModel, '-f', wav, '-ml', '1', '-sow', '-oj', '-of', base, '-pp', '-np'],
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
  return json.transcription
    .map((s) => ({ start: s.offsets.from / 1000, end: s.offsets.to / 1000, text: s.text.trim() }))
    .filter((w) => w.text && !/^\[.*\]$|^\(.*\)$/.test(w.text)) // drop [Music], (laughs) style tokens
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
