#!/usr/bin/env bash
# Puts the on-device models and the MediaPipe WASM runtime where the app expects them.
#
# Everything the scan uses is served from our own origin, never a CDN. That is not a
# preference, it is the invariant the whole privacy claim rests on: the frame she is
# looking at never leaves the phone, and neither does a request that would say she is
# being scanned right now.
set -euo pipefail
cd "$(dirname "$0")/.."

MODELS=public/models
WASM=public/mediapipe
mkdir -p "$MODELS" "$WASM"

base=https://storage.googleapis.com/mediapipe-models

# 468 face landmarks, so the mesh she sees is the geometry we actually read. ~3.8MB.
curl -sSL -o "$MODELS/face_landmarker.task" \
  "$base/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"

# Hair, on its own. The multiclass selfie segmenter also does hair but weighs 16MB for
# five classes we do not need; this one is 780KB and does the one job. ~0.8MB.
curl -sSL -o "$MODELS/hair_segmenter.tflite" \
  "$base/image_segmenter/hair_segmenter/float32/latest/hair_segmenter.tflite"

# The runtime ships inside the npm package, so it is a copy rather than a download.
cp node_modules/@mediapipe/tasks-vision/wasm/* "$WASM/"

# The GenAI runtime, for Ask Oira's on-device model. Vendored for the same reason as
# everything above: a CSP of `default-src 'self'` cannot fetch a runtime from a CDN, and we
# would not want it to.
#
# The package ships three builds of the same 27MB runtime: SIMD, SIMD+threads, and a nosimd
# fallback, 79MB for the set. Only the plain SIMD build is copied. FilesetResolver picks by
# feature detection and every phone that can run this model at all has SIMD, so shipping the
# other two would be 54MB of dead weight on a CDN and in a service worker cache. If a device
# ever turns up that needs nosimd, copy it too rather than copying all three by reflex.
#
# This is the RUNTIME only. The Gemma weights are a separate ~3GB file that is not fetched
# here and does not belong in public/ at all: they are served from models.myoira.com, our
# own box, because three gigabytes through Netlify would bill the whole account offline.
# Placing them is ../scripts/place-weights.sh, which runs the download on the VPS so the
# 3GB never touches a dev machine, and it is blocked until a person accepts Google's terms
# on a Hugging Face account. See docs/CONCIERGE-LLM-RUNBOOK.md step 3.
GENAI=public/vendor/genai
mkdir -p "$GENAI"
cp node_modules/@mediapipe/tasks-genai/genai_bundle.mjs "$GENAI/"
cp node_modules/@mediapipe/tasks-genai/wasm/genai_wasm_internal.js "$GENAI/"
cp node_modules/@mediapipe/tasks-genai/wasm/genai_wasm_internal.wasm "$GENAI/"

echo "models and runtime in place"
du -sh "$MODELS" "$WASM" "$GENAI"
