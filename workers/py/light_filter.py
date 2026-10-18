"""
"Light filter" cartoon look for Animate: DCT-Net's 3D style (Alibaba DAMO, Apache-2.0) run frame by frame.
The whole frame goes through the background model; the largest face also goes through the head model and is
feathered back in. Output is a silent H.264 MP4 — the worker muxes the original audio back on.

Usage:  python light_filter.py <video> <out.mp4> <model_dir> <yunet.onnx> <ffmpeg>
model_dir holds cartoon_bg.onnx and cartoon_h.onnx (see setup_light_filter.sh).
Prints "PROGRESS <done> <total>" lines while it works.
"""

import subprocess
import sys

import cv2
import numpy as np
import onnxruntime as ort

SHORT_SIDE = 540  # CoreML runs ~0.3 s a frame at this size on an M1 Pro; 720p is ~3x slower
OUT_FPS = 15  # cartoons read fine at 15 fps, and it halves the work
HEAD_SIZE = 288
MIN_FACE = 64  # px at working size; smaller faces just get the background pass
FACE_EVERY = 3  # re-detect every few frames and reuse the box in between


def session(path):
    # CoreML on Apple silicon, CPU elsewhere (or if CoreML can't take the graph).
    return ort.InferenceSession(path, providers=["CoreMLExecutionProvider", "CPUExecutionProvider"])


def run(sess, bgr):
    # The graphs normalise internally: they take float BGR 0–255 (H, W, 3) and return the same.
    out = sess.run(None, {sess.get_inputs()[0].name: bgr.astype(np.float32)})[0]
    return np.squeeze(out).clip(0, 255)


def head_box(face, w, h):
    x, y, fw, fh = face[:4]
    side = max(fw, fh) * 1.9
    cx, cy = x + fw / 2, y + fh / 2 - fh * 0.1
    x0, y0 = int(max(0, cx - side / 2)), int(max(0, cy - side / 2))
    return x0, y0, int(min(w, x0 + side)), int(min(h, y0 + side))


def main() -> None:
    src, out, model_dir, yunet, ffmpeg = sys.argv[1:6]
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

    # Working size: short side 540, both sides multiples of 16 (the networks downsample 4x twice).
    scale = SHORT_SIDE / min(sw, sh)
    w, h = int(sw * scale) // 16 * 16, int(sh * scale) // 16 * 16
    bg, hd = session(f"{model_dir}/cartoon_bg.onnx"), session(f"{model_dir}/cartoon_h.onnx")
    detector = cv2.FaceDetectorYN.create(yunet, "", (w, h), 0.8, 0.3, 20)

    enc = subprocess.Popen(
        [ffmpeg, "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", str(OUT_FPS), "-i", "-",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out],
        stdin=subprocess.PIPE,
    )
    total = max(1, round(total_src * OUT_FPS / src_fps))
    step = src_fps / OUT_FPS
    next_frame, idx, done, box = 0.0, 0, 0, None
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        idx += 1
        if idx - 1 < next_frame:
            continue  # drop source frames down to OUT_FPS
        next_frame += step
        small = cv2.resize(frame, (w, h), interpolation=cv2.INTER_AREA)
        toon = run(bg, small)

        if done % FACE_EVERY == 0:
            _, faces = detector.detect(small)
            big = max(faces, key=lambda f: f[2]) if faces is not None else None
            box = head_box(big, w, h) if big is not None and big[2] >= MIN_FACE else None
        if box:
            x0, y0, x1, y1 = box
            crop = small[y0:y1, x0:x1]
            head = cv2.resize(run(hd, cv2.resize(crop, (HEAD_SIZE, HEAD_SIZE))), (x1 - x0, y1 - y0))
            mask = np.zeros((y1 - y0, x1 - x0), np.float32)
            cv2.ellipse(mask, ((x1 - x0) // 2, (y1 - y0) // 2), (int((x1 - x0) * 0.42), int((y1 - y0) * 0.47)), 0, 0, 360, 1, -1)
            mask = cv2.GaussianBlur(mask, (0, 0), max(1, (x1 - x0) * 0.06))[..., None]
            toon[y0:y1, x0:x1] = head * mask + toon[y0:y1, x0:x1] * (1 - mask)

        enc.stdin.write(toon.astype(np.uint8).tobytes())
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
