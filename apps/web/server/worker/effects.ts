/**
 * Animate's free effects — no AI, run on this worker:
 *   colour grades → one FFmpeg filter chain, roughly 10× faster than real time
 *   drawn looks   → OpenCV frame by frame in workers/py/effects.py, with the Light filter's anti-flicker blending
 * Both write a silent MP4; cartoonify() adds the original audio back.
 */
import { join } from 'node:path'
import type { CartoonStyleId } from '../../src/lib/animatePresets'
import { tools } from './config'
import { run } from './exec'

type Progress = (pct: number) => void

// Tuned on real selfie footage so skin stays natural (see docs/free-effects/test-sheet.jpg).
const grades: Partial<Record<CartoonStyleId, string>> = {
  teal: "curves=r='0/0 0.25/0.2 0.6/0.68 1/1':g='0/0.06 0.5/0.5 1/0.96':b='0/0.22 0.3/0.34 0.65/0.58 1/0.82',eq=saturation=1.3:contrast=1.08",
  golden: "colortemperature=temperature=3600,curves=all='0/0.04 0.5/0.56 1/1',eq=saturation=1.2:contrast=1.04,vignette=angle=PI/5",
  vintage:
    "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,curves=all='0/0.07 1/0.93',noise=alls=12:allf=t,vignette=angle=PI/4",
  noir: "format=gray,curves=all='0/0 0.27/0.12 0.7/0.86 1/1',unsharp=5:5:0.8,vignette=angle=PI/5",
}

// Short side at most 1080 (even sizes for H.264), at most 30 fps.
const FIT = "scale=w='if(lt(iw,ih),min(iw,1080),-2)':h='if(lt(iw,ih),-2,min(ih,1080))'"

export async function colourGrade(style: CartoonStyleId, source: string, out: string, duration: number, onProgress: Progress) {
  const chain = grades[style]
  if (!chain) throw new Error(`No colour grade called ${style}`)
  await run(
    tools.ffmpeg,
    [
      '-y', '-v', 'error', '-nostats', '-progress', 'pipe:1', '-i', source,
      '-vf', `${FIT},${chain},format=yuv420p`, '-fpsmax', '30', '-an',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', out,
    ],
    {
      onStdout: (line) => {
        const m = line.match(/^out_time_us=(\d+)/)
        if (m && duration > 0) onProgress(Math.min(100, Number(m[1]) / 1e6 / duration * 100))
      },
    },
  )
}

export async function drawnLook(style: CartoonStyleId, source: string, out: string, onProgress: Progress) {
  await run(tools.python, [join(tools.pyDir, 'effects.py'), style, source, out, tools.ffmpeg], {
    onStdout: (line) => {
      const m = line.match(/^PROGRESS (\d+) (\d+)/)
      if (m) onProgress((Number(m[1]) / Number(m[2])) * 100)
    },
  })
}
