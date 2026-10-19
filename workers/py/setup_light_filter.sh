#!/usr/bin/env bash
# Installs the Animate "Light filter" models: DCT-Net 3D (Alibaba DAMO, Apache-2.0) from ModelScope,
# converted from TensorFlow to ONNX once so the worker only needs onnxruntime.
#   bash workers/py/setup_light_filter.sh
# Needs python3.12 (TensorFlow has no wheels for newer Pythons yet). The converter venv is thrown away after.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${LIGHT_FILTER_MODELS:-$ROOT/.models/dctnet/3d}"
REPO="https://modelscope.cn/api/v1/models/damo/cv_unet_person-image-cartoon-3d_compound-models/repo?Revision=master&FilePath="
PY312="$(command -v python3.12 || true)"

if [[ -f "$OUT/cartoon_bg.onnx" && -f "$OUT/cartoon_h.onnx" ]]; then
  echo "Light filter models already in $OUT"
else
  [[ -n "$PY312" ]] || { echo "python3.12 is needed for the one-off conversion (brew install python@3.12)"; exit 1; }
  mkdir -p "$OUT"
  for f in cartoon_bg cartoon_h; do
    [[ -f "$OUT/$f.pb" ]] || curl -fSL -o "$OUT/$f.pb" "$REPO$f.pb"
  done

  CONV="$(mktemp -d)"
  trap 'rm -rf "$CONV"' EXIT
  "$PY312" -m venv "$CONV/venv"
  "$CONV/venv/bin/pip" install -q "tensorflow==2.18.*" tf2onnx onnx
  for f in cartoon_bg cartoon_h; do
    (cd "$CONV" && "$CONV/venv/bin/python" -I -m tf2onnx.convert --graphdef "$OUT/$f.pb" \
      --inputs input_image:0 --outputs output_image:0 --opset 17 --output "$OUT/$f.onnx")
  done
  echo "Converted models are in $OUT"
fi

# The worker's own venv runs them. onnx lets light_filter.py pin the graphs to each video's size (~5x faster on CoreML).
"$ROOT/workers/py/.venv/bin/pip" install -q onnxruntime onnx
echo "Done — restart the worker."
