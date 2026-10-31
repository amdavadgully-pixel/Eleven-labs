#!/usr/bin/env bash
# Downloads the Kokoro-82M ONNX model (~325 MB) and voice pack (~28 MB).
set -euo pipefail
DIR="${VF_MODELS_DIR:-$(cd "$(dirname "$0")/.." && pwd)/models}"
BASE="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
mkdir -p "$DIR"
for f in kokoro-v1.0.onnx voices-v1.0.bin; do
  if [ -s "$DIR/$f" ]; then echo "✓ $f already present"; continue; fi
  echo "↓ $f"; curl -fL --retry 3 -o "$DIR/$f.part" "$BASE/$f" && mv "$DIR/$f.part" "$DIR/$f"
done
echo "Models ready in $DIR"
