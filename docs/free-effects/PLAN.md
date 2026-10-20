# Free effects for Animate — plan

Status (2026-10-20): **steps 1–3 built**. Free effects cost 0 credits and stay on paid plans only (decided).
Live: Teal & orange, Golden hour, Vintage film, Noir (FFmpeg); Watercolor, Pencil sketch (OpenCV, `workers/py/effects.py`).
Previews: run `npm run style-previews -w @spikecut/web -- <your-photo.jpg>` to fill `apps/web/public/styles/`.
Still to do: step 4 (Comic ink tuning, skin-safe Posterize / Pop art).

Goal: give Animate a set of no-AI effects (colour grades and drawn looks) made with FFmpeg and OpenCV. They cost nothing per video except our own worker time, so the free tier feels more valuable. They won't match the fal.ai AI styles, and they aren't meant to.

## What the test showed

Eight effects were tried on a frame from one of our uploaded videos. See [test-sheet.jpg](test-sheet.jpg); the code is in [prototype.py](prototype.py).
Everything needed is already on the worker: FFmpeg 9, OpenCV 5 (`opencv-python-headless`), NumPy and Pillow in `workers/py/.venv`.

| Effect | How it looked | Speed per frame (540×304) | Verdict |
|---|---|---|---|
| Watercolor / painted (`cv2.stylization`) | Clean outlines, flat painted colour — the most "cartoon" one | 67 ms | Ship |
| Pencil sketch (`cv2.pencilSketch`) | Crisp black-and-white drawing | 26 ms | Ship |
| Teal & orange (curves + saturation) | Cinematic, skin stays natural | 1 ms | Ship |
| Vintage film (sepia + vignette + grain) | Classic old-film look | 4 ms | Ship |
| Noir (CLAHE + contrast curve) | High-contrast black and white | 1 ms | Ship |
| Comic ink (bilateral + colour steps + edge mask) | Strong outlines but blotchy colour patches | 8 ms | Tune first |
| Posterize / Pop art (k-means colours) | **Turned dark skin red**: merged skin with the red background | 35–40 ms | Don't ship as-is |

- An FFmpeg-only colour grade (curves + eq + vignette) processed 10 s of video at 960p in about 1.1 s, roughly 10× faster than real time.
- The OpenCV drawn looks take about 1–4 minutes per minute of video.
- Bug found and fixed in the prototype: comic colour steps overflowed past 255 and wrapped to green. Clamp before converting back to 8-bit.

## Two problems to solve

1. **Skin tone.** Effects that cut the picture down to a few colours (posterize, pop art, k-means) can swap skin for a background colour. They need a face-aware palette that keeps the skin cluster (the YuNet face model in `.models/` is already used by `light_filter.py`), or they shouldn't ship.
2. **Flicker.** Per-frame effects shimmer in video. `workers/py/light_filter.py` already fixes this with optical-flow blending against the previous frame, plus a scene-cut reset. Reuse it. For palette effects, keep one palette per scene instead of recomputing it every frame.

## Steps

1. **Colour grades (FFmpeg only).**
   - Teal & orange, Vintage film, Noir, plus one or two more (warm "golden hour", cool "night").
   - Each is a single FFmpeg filter chain: no Python, about 10× real time.
   - Lowest risk; do this first.
2. **Drawn looks (OpenCV).**
   - New `workers/py/effects.py`, built like `light_filter.py`: read frames from an FFmpeg pipe, print `PROGRESS <done> <total>`, output a silent H.264 MP4. The worker already muxes the original audio back on.
   - Reuse the anti-flicker blending.
   - Ship Watercolor and Pencil sketch first; Comic ink once it's tuned (cleaner colour steps in LAB, thicker and smoother edges).
3. **Wiring.**
   - `apps/web/src/lib/animatePresets.ts`: give each style an engine, e.g. `'fal' | 'local' | 'ffmpeg' | 'opencv'`, plus the effect name or filter chain. Update `creditsFor` with the chosen price.
   - `apps/web/server/worker/cartoon.ts`: `cartoonify()` picks the runner by engine. Today it's `lightFilter()` or `aiRestyle()`; add `ffmpegEffect()` and `opencvEffect()`.
   - `apps/web/src/components/app/StylePicker.tsx`: split into **AI styles** and **Free effects**, each with a small preview image. Generate the previews once from a demo frame and store them in `apps/web/public/`.
   - `apps/web/server/app.ts` → `checkStyle`: the new engines need no fal key.
4. **Later (optional).** Posterize and Pop art with skin-safe colours.

## Decisions (made 2026-10-20: 0 credits, paid plans only)

- **Credits:** should free effects cost **0 credits**? Today even the Light filter costs 1 credit (`creditsFor`) while the picker shows a "Free" badge, so fix that either way.
- **Free-plan users:** Animate currently needs a paid plan or Day Pass (`requireActivePlan` in `server/app.ts`). Should users with no plan be allowed free effects, maybe with a daily limit?

## Related context

- fal.ai has no free tier (prepaid credits; new accounts get a small trial credit). That's why the AI styles cost 1 credit per started minute.
- Puter.js was looked at and ruled out: its "user pays" model means a second bill for customers, it runs only in the browser, and it has no video-to-video restyle.
