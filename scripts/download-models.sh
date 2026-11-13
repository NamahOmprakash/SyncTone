#!/usr/bin/env bash
# ==============================================================================
# SyncTone — Idempotent ONNX TTS Model Weights Downloader
#
# Downloads and caches required neural TTS models into the models_cache volume:
# 1. Kokoro-82M v1.0 (onnx weights + voices.bin + v0.19 backward compatibility)
# 2. Paradee-8M-v1.2 (int8 quantized ONNX weights ~8.5MB + voices.json)
# ==============================================================================

set -euo pipefail

TARGET_DIR="${1:-${MODELS_CACHE_DIR:-novel-audio-synthesizer/kokoro-tts-backend/models_cache}}"
mkdir -p "${TARGET_DIR}"
cd "${TARGET_DIR}"

echo "================================================================="
echo "SyncTone Neural TTS Model Cache Setup"
echo "Target Directory: $(pwd)"
echo "================================================================="

download_file() {
  local filename="$1"
  local url="$2"
  local min_size_bytes="$3"

  if [ -f "${filename}" ] && [ "$(wc -c < "${filename}")" -ge "${min_size_bytes}" ]; then
    echo "✓ ${filename} already exists and is valid ($(du -h "${filename}" | cut -f1)). Skipping download."
    return 0
  fi

  echo "⬇ Downloading ${filename}..."
  rm -f "${filename}.tmp"
  curl -f -L --retry 3 --retry-delay 2 --progress-bar -o "${filename}.tmp" "${url}"

  local downloaded_size
  downloaded_size=$(wc -c < "${filename}.tmp")
  if [ "${downloaded_size}" -lt "${min_size_bytes}" ]; then
    echo "✗ Error: Downloaded ${filename} is corrupt or smaller than expected (${downloaded_size} < ${min_size_bytes} bytes)."
    rm -f "${filename}.tmp"
    return 1
  fi

  mv "${filename}.tmp" "${filename}"
  echo "✓ Successfully saved ${filename} ($(du -h "${filename}" | cut -f1))."
}

# 1. Kokoro-82M v1.0 ONNX model weights (~330 MB)
download_file \
  "kokoro-v1.0.onnx" \
  "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx" \
  100000000

# 2. Kokoro-82M v1.0 voice vectors (~21 MB)
download_file \
  "voices-v1.0.bin" \
  "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin" \
  10000000

# Backward compatibility symlinks / aliases for existing codebase references (v0.19)
if [ ! -f "kokoro-v0_19.onnx" ]; then
  ln -sf "kokoro-v1.0.onnx" "kokoro-v0_19.onnx"
  echo "✓ Created backward-compatibility symlink: kokoro-v0_19.onnx -> kokoro-v1.0.onnx"
fi

if [ ! -f "voices.bin" ]; then
  ln -sf "voices-v1.0.bin" "voices.bin"
  echo "✓ Created backward-compatibility symlink: voices.bin -> voices-v1.0.bin"
fi

# 3. Paradee-8M-v1.2 int8 quantized ONNX model weights (~8.5 MB)
download_file \
  "paradee-v1.2-int8.onnx" \
  "https://huggingface.co/sahilmahendrakar/Paradee-8M-v1.2/resolve/main/onnx/paradee_int8.onnx" \
  5000000

# 4. Voice catalog JSON metadata (~200 KB)
download_file \
  "voices.json" \
  "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/voices.json" \
  10000

if [ ! -f "paradee-voices.json" ]; then
  ln -sf "voices.json" "paradee-voices.json"
  echo "✓ Created symlink: paradee-voices.json -> voices.json"
fi

echo "================================================================="
echo "✓ All ONNX neural TTS models and voice vectors ready in $(pwd):"
ls -lh
echo "================================================================="
