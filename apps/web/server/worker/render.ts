import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tools } from './config.js'
import { run } from './exec.js'

const OUT_W = 1080
const OUT_H = 1920
const CAPTION_Y = 1180 // top of the caption band (lower third, clear of platform UI)

type FaceInfo = { cx: number | null; width: number; height: number; sampled: number; found: number }

export async function trackFace(video: string, start: number, end: number): Promise<FaceInfo> {
  const out = await run(tools.python, [join(tools.pyDir, 'face_track.py'), video, String(start), String(end), tools.faceModel])
  return JSON.parse(out.trim().split('\n').pop()!)
}

/**
 * Cut [start, end] from the source, crop to 9:16 around the speaker, burn in word-by-word captions,
 * and write an H.264 MP4 plus a JPEG thumbnail.
 */
export async function renderClip(opts: {
  source: string
  start: number
  end: number
  words: [number, number, string][] // absolute source times
  workDir: string
  onProgress?: (pct: number, stage: string) => void
}) {
  const { source, start, end, workDir } = opts
  const report = opts.onProgress ?? (() => {})
  const duration = +(end - start).toFixed(3)

  report(0, 'Finding the speaker')
  const face = await trackFace(source, start, end)
  const srcW = face.width
  const srcH = face.height

  // Crop window: full height, 9:16 width, centred on the face (or the frame centre).
  let crop = `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,crop=${OUT_W}:${OUT_H}`
  if (srcW / srcH > 9 / 16) {
    const cw = Math.floor((srcH * 9) / 16 / 2) * 2
    const centre = (face.cx ?? 0.5) * srcW
    const x = Math.round(Math.min(Math.max(centre - cw / 2, 0), srcW - cw))
    crop = `crop=${cw}:${srcH}:${x}:0,scale=${OUT_W}:${OUT_H}:flags=lanczos`
  }

  // Captions: times relative to the clip.
  const rel = opts.words
    .filter(([s, e]) => e > start && s < end)
    .map(([s, e, t]) => [Math.max(0, +(s - start).toFixed(3)), Math.min(duration, +(e - start).toFixed(3)), t])
  report(20, 'Drawing captions')
  const wordsFile = join(workDir, 'words.json')
  await writeFile(wordsFile, JSON.stringify(rel))
  const captionDir = join(workDir, 'captions')
  const playlist = (
    await run(tools.python, [join(tools.pyDir, 'captions.py'), wordsFile, captionDir, String(duration), tools.captionFont])
  ).trim()

  const video = join(workDir, 'clip.mp4')
  report(30, 'Encoding video')
  await run(tools.ffmpeg, [
    '-y', '-v', 'error', '-nostats', '-progress', 'pipe:1',
    '-ss', String(start), '-t', String(duration), '-i', source,
    '-f', 'concat', '-safe', '0', '-i', playlist,
    '-filter_complex',
    `[0:v]${crop},setsar=1,fps=30[bg];[1:v]format=rgba[cap];[bg][cap]overlay=0:${CAPTION_Y}:eof_action=pass:format=auto[v]`,
    '-map', '[v]', '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-maxrate', '8M', '-bufsize', '12M', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
    '-movflags', '+faststart',
    '-t', String(duration),
    video,
  ], {
    // ffmpeg -progress emits out_time_us=… as it encodes.
    onStdout: (line) => {
      const m = line.match(/^out_time_us=(\d+)/)
      if (m) report(30 + Math.min(1, Number(m[1]) / 1e6 / duration) * 70, 'Encoding video')
    },
  })

  const thumbnail = join(workDir, 'thumb.jpg')
  await run(tools.ffmpeg, ['-y', '-v', 'error', '-ss', String(Math.min(1.5, duration / 3)), '-i', video, '-frames:v', '1', '-q:v', '4', thumbnail])

  return { video, thumbnail, duration, width: OUT_W, height: OUT_H, face }
}
