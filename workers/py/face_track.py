"""
Find where the main face sits horizontally in a slice of a video, so the 9:16 crop can follow it.
Uses OpenCV's YuNet face detector (a small ONNX model).

Usage:  python face_track.py <video> <start_seconds> <end_seconds> <yunet_model.onnx>
Prints JSON: {"cx": 0.0-1.0 | null, "width": int, "height": int, "sampled": int, "found": int}
"""

import json
import statistics
import sys

import cv2

SAMPLES_PER_SECOND = 2
DETECT_WIDTH = 640
MIN_CONFIDENCE = 0.75


def main() -> None:
    path, start, end, model = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        print(json.dumps({"error": f"cannot open {path}"}))
        sys.exit(1)

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    # Detect on a downscaled frame — much faster, plenty for locating a face.
    scale = DETECT_WIDTH / max(width, 1)
    det_size = (DETECT_WIDTH, max(1, round(height * scale)))
    detector = cv2.FaceDetectorYN.create(model, "", det_size, MIN_CONFIDENCE, 0.3, 50)

    centers: list[float] = []
    sampled = 0
    t = start
    step = 1 / SAMPLES_PER_SECOND
    while t < end:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, frame = cap.read()
        t += step
        if not ok:
            continue
        sampled += 1
        _, faces = detector.detect(cv2.resize(frame, det_size))
        if faces is not None and len(faces):
            # Each row: x, y, w, h, landmarks..., score. The largest face is usually the speaker.
            x, _, w, _ = max(faces, key=lambda f: f[2] * f[3])[:4]
            centers.append(float((x + w / 2) / det_size[0]))

    cap.release()
    # Median is robust to the odd false detection and keeps the crop steady.
    cx = statistics.median(centers) if len(centers) >= max(2, sampled // 6) else None
    print(json.dumps({"cx": cx, "width": width, "height": height, "sampled": sampled, "found": len(centers)}))


if __name__ == "__main__":
    main()
