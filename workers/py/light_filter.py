"""
"Light filter" cartoon look for Animate: DCT-Net's 3D style (Alibaba DAMO, Apache-2.0) run frame by frame.
The whole frame goes through the background model; up to three tracked faces also go through the head model and
are feathered back in. Each frame is blended with the previous one, warped along optical flow, to stop the shimmer
per-frame stylising otherwise gives. Output is a silent H.264 MP4 — the worker muxes the original audio back on.

Usage:  python light_filter.py <video> <out.mp4> <model_dir> <yunet.onnx> <ffmpeg>
model_dir holds cartoon_bg.onnx and cartoon_h.onnx (see setup_light_filter.sh).
Prints "PROGRESS <done> <total>" lines while it works.
"""

import os
import queue
import subprocess
import sys
import threading

import cv2
import numpy as np
import onnxruntime as ort

SHORT_SIDE = 540  # ~0.06 s a frame with fixed-shape graphs on CoreML (M1 Pro)
OUT_FPS = 15  # cartoons read fine at 15 fps, and it halves the work
HEAD_SIZE = 288
MIN_FACE = 64  # px at working size; smaller faces just get the background pass
MAX_FACES = 3
FACE_EVERY = 2  # re-detect every few frames and reuse the tracks in between
FACE_SMOOTH = 0.5  # how far a track moves toward each new detection
FACE_HOLD = 4  # detections a track survives without a match, fading out, before it's dropped
FADE_IN, FADE_OUT = 1 / 3, 1 / 6  # head blend weight change per frame
BLEND = 0.6  # most of the previous frame kept where the flow explains the motion…
FLOW_ERR = 12.0  # …falling to none once the warped previous frame is this far off (grey levels)
CUT_DIFF = 30.0  # mean grey change that counts as a cut: start fresh


def static_model(model_dir, name, w, h):
    """
    The converted graphs have dynamic H×W, which CoreML can't plan for, so it runs ~5x slower. Pin the input to this
    video's working size (cached per size); fall back to the dynamic graph if the onnx package isn't there.
    """
    dynamic = f"{model_dir}/{name}.onnx"
    path = f"{model_dir}/static/{name}_{w}x{h}.onnx"
    if os.path.exists(path):
        return path
    try:
        import onnx
        from onnx import shape_inference

        model = onnx.load(dynamic)
        dims = model.graph.input[0].type.tensor_type.shape.dim
        dims[0].dim_value, dims[1].dim_value = h, w
        for o in model.graph.output:
            o.type.tensor_type.shape.ClearField("dim")
        del model.graph.value_info[:]
        model = shape_inference.infer_shapes(model, data_prop=True)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = f"{path}.{os.getpid()}.tmp"  # another job may be writing the same size
        onnx.save(model, tmp)
        os.replace(tmp, path)
        return path
    except Exception as e:  # noqa: BLE001 — a slower run beats a failed one
        print(f"light_filter: using the dynamic {name} graph ({e})", file=sys.stderr)
        return dynamic


def session(path, cache):
    # CUDA on GPU workers, CoreML on Apple silicon, CPU otherwise (or for whatever a provider can't take).
    available = ort.get_available_providers()
    providers = []
    if "CUDAExecutionProvider" in available:
        providers.append("CUDAExecutionProvider")
    if "CoreMLExecutionProvider" in available:
        providers.append(("CoreMLExecutionProvider", {"ModelFormat": "MLProgram", "MLComputeUnits": "ALL", "ModelCacheDirectory": cache}))
    providers.append("CPUExecutionProvider")
    sess = ort.InferenceSession(path, providers=providers)
    print(f"light_filter: {os.path.basename(path)} on {sess.get_providers()[0]}", file=sys.stderr)
    return sess


def run(sess, bgr):
    # The graphs normalise internally: they take float BGR 0–255 (H, W, 3) and return the same.
    out = sess.run(None, {sess.get_inputs()[0].name: bgr.astype(np.float32, copy=False)})[0]
    return np.squeeze(out).clip(0, 255)


def frames(cap, w, h, step):
    """Decode, drop to OUT_FPS and shrink on a thread so it overlaps inference."""
    q = queue.Queue(maxsize=8)

    def read():
        next_frame, idx = 0.0, 0
        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                idx += 1
                if idx - 1 < next_frame:
                    continue
                next_frame += step
                q.put(cv2.resize(frame, (w, h), interpolation=cv2.INTER_AREA))
        finally:
            q.put(None)

    threading.Thread(target=read, daemon=True).start()
    while (frame := q.get()) is not None:
        yield frame


class Stabilizer:
    """Blends each stylised frame with the previous output, warped onto it by optical flow."""

    def __init__(self, w, h):
        self.dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_ULTRAFAST)
        self.gx, self.gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
        self.prev_gray = self.prev_out = None

    def __call__(self, small, toon):
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        prev_gray, prev_out = self.prev_gray, self.prev_out
        self.prev_gray = gray
        if prev_gray is None or cv2.absdiff(gray, prev_gray).mean() > CUT_DIFF:
            self.prev_out = toon
            return toon
        flow = self.dis.calc(gray, prev_gray, None)  # where each pixel of this frame was in the last one
        mx, my = self.gx + flow[..., 0], self.gy + flow[..., 1]
        warped_gray = cv2.remap(prev_gray, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        err = cv2.GaussianBlur(cv2.absdiff(gray, warped_gray).astype(np.float32), (0, 0), 2)
        a = (BLEND * np.clip(1 - err / FLOW_ERR, 0, 1))[..., None]
        warped = cv2.remap(prev_out, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        self.prev_out = toon * (1 - a) + warped * a
        return self.prev_out


class Track:
    def __init__(self, square):
        self.cx, self.cy, self.side = square
        self.weight, self.missed = 0.0, 0

    def iou(self, square):
        cx, cy, side = square
        ix = max(0, min(self.cx + self.side / 2, cx + side / 2) - max(self.cx - self.side / 2, cx - side / 2))
        iy = max(0, min(self.cy + self.side / 2, cy + side / 2) - max(self.cy - self.side / 2, cy - side / 2))
        inter = ix * iy
        return inter / (self.side**2 + side**2 - inter)

    def follow(self, square):
        k = FACE_SMOOTH
        self.cx, self.cy, self.side = (v + k * (n - v) for v, n in zip((self.cx, self.cy, self.side), square))
        self.missed = 0


def head_square(face):
    x, y, fw, fh = face[:4]
    return x + fw / 2, y + fh / 2 - fh * 0.1, max(fw, fh) * 1.9


def update_tracks(tracks, faces):
    squares = sorted((head_square(f) for f in faces if f[2] >= MIN_FACE), key=lambda s: -s[2])[:MAX_FACES] if faces is not None else []
    free = list(tracks)
    for sq in squares:
        best = max(free, key=lambda t: t.iou(sq), default=None)
        if best and best.iou(sq) > 0.2:
            best.follow(sq)
            free.remove(best)
        else:
            tracks.append(Track(sq))
    for t in free:
        t.missed += 1
    tracks[:] = sorted((t for t in tracks if t.missed <= FACE_HOLD), key=lambda t: -t.side)[:MAX_FACES]


def paste_head(hd, small, toon, t):
    h, w = small.shape[:2]
    side = int(round(t.side))
    x0, y0 = int(round(t.cx - side / 2)), int(round(t.cy - side / 2))
    fx0, fy0, fx1, fy1 = max(0, x0), max(0, y0), min(w, x0 + side), min(h, y0 + side)
    if (fx1 - fx0) * (fy1 - fy0) < side * side / 2:
        return  # mostly off-frame
    # Keep the crop square near the edges (reflecting the frame) so the head isn't squashed into the model.
    crop = cv2.copyMakeBorder(small[fy0:fy1, fx0:fx1], fy0 - y0, y0 + side - fy1, fx0 - x0, x0 + side - fx1, cv2.BORDER_REFLECT_101)
    head = cv2.resize(run(hd, cv2.resize(crop, (HEAD_SIZE, HEAD_SIZE), interpolation=cv2.INTER_AREA)), (side, side))
    mask = np.zeros((side, side), np.float32)
    cv2.ellipse(mask, (side // 2, side // 2), (int(side * 0.42), int(side * 0.47)), 0, 0, 360, t.weight, -1)
    mask = cv2.GaussianBlur(mask, (0, 0), max(1, side * 0.06))[..., None]
    sy, sx = slice(fy0 - y0, fy1 - y0), slice(fx0 - x0, fx1 - x0)
    toon[fy0:fy1, fx0:fx1] = head[sy, sx] * mask[sy, sx] + toon[fy0:fy1, fx0:fx1] * (1 - mask[sy, sx])


def main() -> None:
    src, out, model_dir, yunet, ffmpeg = sys.argv[1:6]
    ort.set_default_logger_severity(3)
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
    cache = f"{model_dir}/coreml-cache"
    bg = session(static_model(model_dir, "cartoon_bg", w, h), cache)
    hd = session(static_model(model_dir, "cartoon_h", HEAD_SIZE, HEAD_SIZE), cache)
    detector = cv2.FaceDetectorYN.create(yunet, "", (w, h), 0.8, 0.3, 20)
    stabilize = Stabilizer(w, h)

    enc = subprocess.Popen(
        [ffmpeg, "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", str(OUT_FPS), "-i", "-",
         "-vf", "unsharp=5:5:0.6:5:5:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
         "-movflags", "+faststart", out],
        stdin=subprocess.PIPE,
    )
    total = max(1, round(total_src * OUT_FPS / src_fps))
    done, tracks = 0, []
    for small in frames(cap, w, h, src_fps / OUT_FPS):
        toon = run(bg, small)

        if done % FACE_EVERY == 0:
            update_tracks(tracks, detector.detect(small)[1])
        for t in tracks:
            t.weight = min(1.0, t.weight + FADE_IN) if t.missed == 0 else max(0.0, t.weight - FADE_OUT)
            if t.weight > 0:
                paste_head(hd, small, toon, t)

        toon = stabilize(small, toon)
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
