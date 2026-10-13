import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mediaDir, tools } from '../worker/config'
import { run } from '../worker/exec'

/**
 * A live recording is a folder of ~10s MPEG-TS chunks plus ffmpeg's segment list (filename,start,end),
 * which gives each chunk's exact position on the recording timeline.
 */
export type Segment = { file: string; start: number; end: number }

export const sessionDir = (streamId: string, sessionId: string) => join(mediaDir, 'live', streamId, sessionId)

export async function readSegments(dir: string): Promise<Segment[]> {
  const list = join(dir, 'segments.csv')
  if (!existsSync(list)) return []
  return (await readFile(list, 'utf8'))
    .split('\n')
    .map((line) => line.trim().split(','))
    .filter((p) => p.length >= 3 && p[0])
    .map(([file, start, end]) => ({ file: join(dir, file), start: Number(start), end: Number(end) }))
    .filter((s) => existsSync(s.file))
}

/** Chunks overlapping [from, to] — the window we analyse or cut a clip from. */
export function pickSegments(segments: Segment[], from: number, to: number) {
  return segments.filter((s) => s.end > from && s.start < to)
}

async function concatList(segments: Segment[], workDir: string, name: string) {
  const list = join(workDir, `${name}.txt`)
  await writeFile(list, segments.map((s) => `file '${s.file.replaceAll("'", "'\\''")}'`).join('\n'))
  return list
}

/** 16 kHz mono WAV of the chunks (for transcription + loudness). */
export async function segmentsToWav(segments: Segment[], workDir: string) {
  const wav = join(workDir, 'window.wav')
  await run(tools.ffmpeg, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', await concatList(segments, workDir, 'audio'), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav])
  return wav
}

/** Stitch chunks into one MP4 (stream copy, no re-encode) for the clip renderer. */
export async function segmentsToVideo(segments: Segment[], workDir: string) {
  const out = join(workDir, 'live-source.mp4')
  await run(tools.ffmpeg, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', await concatList(segments, workDir, 'video'), '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', out])
  return out
}
