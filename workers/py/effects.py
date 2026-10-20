"""
Free drawn looks for Animate (no AI): OpenCV run frame by frame, smoothed over time with the Light filter's
optical-flow Stabilizer so the drawing doesn't shimmer. Output is a silent H.264 MP4 — the worker muxes the
original audio back on.

Usage:  python effects.py <effect> <video> <out.mp4> <ffmpeg>
Effects: watercolor, sketch. Prints "PROGRESS <done> <total>" lines while it works.
"""

import subprocess
import sys

import cv2
import numpy as np

from light_filter import Stabilizer, frames

SHORT_SIDE = 540  # drawn looks don't need more detail, and stylization slows down fast with size
OUT_FPS = 15  # a drawn look reads fine at 15 fps, and it halves the work


def watercolor(frame):
    # Painted at two-thirds size and scaled back up: looks the same (it's soft anyway) and is over 2x faster.
    h, w = frame.shape[:2]
    small = cv2.resize(frame, (w * 2 // 3, h * 2 // 3), interpolation=cv2.INTER_AREA)
    painted = cv2.stylization(small, sigma_s=40, sigma_r=0.45)
    return cv2.resize(painted, (w, h), interpolation=cv2.INTER_CUBIC)


def sketch(frame):
    gray, _ = cv2.pencilSketch(frame, sigma_s=50, sigma_r=0.07, shade_factor=0.05)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


EFFECTS = {"watercolor": watercolor, "sketch": sketch}


def main() -> None:
    name, src, out, ffmpeg = sys.argv[1:5]
    effect = EFFECTS.get(name)
    if not effect:
        sys.exit(f"unknown effect {name}")
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        sys.exit(f"cannot open {src}")
    # Size from a decoded frame, not the container: phone videos carry a rotation that OpenCV applies on read.
    ok, first = cap.read()
    if not ok:
        sys.exit("no frames could be read from the video")
    sh, sw = first.shape[:2]
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_src = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1

    scale = min(1.0, SHORT_SIDE / min(sw, sh))
    w, h = int(sw * scale) // 2 * 2, int(sh * scale) // 2 * 2
    fps = min(OUT_FPS, src_fps)
    stabilize = Stabilizer(w, h)

    enc = subprocess.Popen(
        [ffmpeg, "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out],
        stdin=subprocess.PIPE,
    )
    total = max(1, round(total_src * fps / src_fps))
    done = 0
    for small in frames(cap, w, h, src_fps / fps):
        drawn = stabilize(small, effect(small).astype(np.float32))
        enc.stdin.write(np.clip(drawn, 0, 255).astype(np.uint8).tobytes())
        done += 1
        if done % 15 == 0 or done == total:
            print(f"PROGRESS {done} {total}", flush=True)

    enc.stdin.close()
    if enc.wait() != 0:
        sys.exit("encoding failed")
    if not done:
        sys.exit("no frames could be read from the video")
    print(f"PROGRESS {total} {total}", flush=True)


if __name__ == "__main__":
    main()
