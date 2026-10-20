/**
 * Make the preview pictures the Animate style picker shows for each free effect, using the worker's own effect code.
 *   npm run style-previews -w @spikecut/web -- <photo.jpg> [outDir]
 * Use a photo you own (a portrait works best). Writes <outDir>/<styleId>.jpg, default public/styles/.
 * AI styles get no preview — making one would cost fal credits.
 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { cartoonStyles } from '../src/lib/animatePresets'
import { tools } from '../server/worker/config'
import { colourGrade, drawnLook } from '../server/worker/effects'
import { run } from '../server/worker/exec'

const [photo, outArg] = process.argv.slice(2)
if (!photo) {
  console.error('Usage: npm run style-previews -w @spikecut/web -- <photo.jpg> [outDir]')
  process.exit(1)
}
const outDir = resolve(outArg ?? 'public/styles')
const work = await mkdtemp(join(tmpdir(), 'spikecut-previews-'))
await mkdir(outDir, { recursive: true })

try {
  // The effects work on video, so turn the photo into a short clip, cropped to the picker's 3:4 card.
  const clip = join(work, 'photo.mp4')
  await run(tools.ffmpeg, [
    '-y', '-v', 'error', '-loop', '1', '-i', resolve(photo), '-t', '1', '-r', '15',
    '-vf', 'crop=min(iw\\,ih*3/4):min(ih\\,iw*4/3),scale=540:720,format=yuv420p', '-c:v', 'libx264', clip,
  ])

  for (const style of cartoonStyles) {
    const video = join(work, `${style.id}.mp4`)
    if (style.engine === 'grade') await colourGrade(style.id, clip, video, 1, () => {})
    else if (style.engine === 'draw') await drawnLook(style.id, clip, video, () => {})
    else if (style.engine === 'local') {
      await run(tools.python, [join(tools.pyDir, 'light_filter.py'), clip, video, tools.lightFilterModels, tools.faceModel, tools.ffmpeg])
    } else continue
    await run(tools.ffmpeg, ['-y', '-v', 'error', '-ss', '0.5', '-i', video, '-frames:v', '1', '-vf', 'scale=300:400', '-q:v', '4', join(outDir, `${style.id}.jpg`)])
    console.log(`✓ ${style.id}.jpg`)
  }
} finally {
  await rm(work, { recursive: true, force: true })
}
