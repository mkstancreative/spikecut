import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Paths to the media toolchain. Defaults match the local Mac setup; override via .env.local on the worker host.
const repoRoot = resolve(process.cwd(), '../..')

const firstExisting = (...paths: string[]) => paths.find((p) => existsSync(p)) ?? paths[0]

export const tools = {
  ffmpeg: process.env.FFMPEG_BIN?.trim() || 'ffmpeg',
  ffprobe: process.env.FFPROBE_BIN?.trim() || 'ffprobe',
  ytdlp: process.env.YTDLP_BIN?.trim() || 'yt-dlp',
  whisper: process.env.WHISPER_BIN?.trim() || 'whisper-cli',
  whisperModel: process.env.WHISPER_MODEL?.trim() || join(repoRoot, '.models/ggml-base.en.bin'),
  python: process.env.PYTHON_BIN?.trim() || join(repoRoot, 'workers/py/.venv/bin/python'),
  pyDir: join(repoRoot, 'workers/py'),
  faceModel: process.env.FACE_MODEL?.trim() || join(repoRoot, '.models/face_detection_yunet_2023mar.onnx'),
  captionFont:
    process.env.CAPTION_FONT?.trim() ||
    firstExisting(
      '/System/Library/Fonts/Supplemental/Arial Black.ttf',
      '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    ),
}

// Source videos are cached briefly so several clips can be cut from one download, then deleted.
export const mediaDir = process.env.MEDIA_CACHE_DIR?.trim() || join(tmpdir(), 'spikecut-media')
export const SOURCE_TTL_MS = 6 * 60 * 60 * 1000
export const MAX_SOURCE_SECONDS = Number(process.env.MAX_ANALYZE_SECONDS ?? 3 * 60 * 60)
export const cacheHome = join(homedir(), '.cache', 'spikecut')
