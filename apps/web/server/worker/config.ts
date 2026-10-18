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
  // large-v3-turbo is far more accurate than base.en (accents, crosstalk, music beds) and still fast on Metal.
  whisperModel:
    process.env.WHISPER_MODEL?.trim() ||
    firstExisting(join(repoRoot, '.models/ggml-large-v3-turbo-q5_0.bin'), join(repoRoot, '.models/ggml-base.en.bin')),
  // Silero VAD: whisper only decodes speech, so music/silence can't trigger hallucinated text. Optional.
  vadModel: process.env.WHISPER_VAD_MODEL?.trim() || join(repoRoot, '.models/ggml-silero-v5.1.2.bin'),
  python: process.env.PYTHON_BIN?.trim() || join(repoRoot, 'workers/py/.venv/bin/python'),
  pyDir: join(repoRoot, 'workers/py'),
  faceModel: process.env.FACE_MODEL?.trim() || join(repoRoot, '.models/face_detection_yunet_2023mar.onnx'),
  // Animate "Light filter": DCT-Net 3D converted to ONNX by workers/py/setup_light_filter.sh.
  lightFilterModels: process.env.LIGHT_FILTER_MODELS?.trim() || join(repoRoot, '.models/dctnet/3d'),
  captionFont:
    process.env.CAPTION_FONT?.trim() ||
    firstExisting(
      '/System/Library/Fonts/Supplemental/Arial Black.ttf',
      '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    ),
}

// YouTube often demands sign-in ("confirm you're not a bot") from server IPs. Point yt-dlp at a cookies.txt export
// (YTDLP_COOKIES) or let it read a logged-in local browser (YTDLP_COOKIES_FROM_BROWSER=chrome|safari|firefox|…).
export function ytdlpAuthArgs(): string[] {
  const file = process.env.YTDLP_COOKIES?.trim()
  if (file) return ['--cookies', file]
  const browser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim()
  if (browser) return ['--cookies-from-browser', browser]
  return []
}

// Source videos are cached briefly so several clips can be cut from one download, then deleted.
export const mediaDir = process.env.MEDIA_CACHE_DIR?.trim() || join(tmpdir(), 'spikecut-media')
export const SOURCE_TTL_MS = 6 * 60 * 60 * 1000
export const MAX_SOURCE_SECONDS = Number(process.env.MAX_ANALYZE_SECONDS ?? 3 * 60 * 60)
export const cacheHome = join(homedir(), '.cache', 'spikecut')
