# Oira STT — RunPod SERVERLESS Whisper handler. See docs/VOICE-STACK.md.
# Serverless = scales to zero and bills only per second of actual transcription, so an idle
# endpoint costs $0 (a persistent GPU pod would drain the balance). Her audio is transcribed in
# memory and never persisted or logged. Voice is only for asking the concierge a question; her
# biometric traits are never involved.
#
# Build/push the image (voice/Dockerfile.runpod), create a RunPod Serverless endpoint from it,
# set the endpoint's env: WHISPER_MODEL=large-v3  WHISPER_DEVICE=cuda  WHISPER_COMPUTE=float16
# The bridge calls  https://api.runpod.ai/v2/<endpoint-id>/runsync  with the RunPod API key.
import base64, io, os
import runpod
from faster_whisper import WhisperModel

MODEL = os.environ.get("WHISPER_MODEL", "large-v3")
DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
COMPUTE = os.environ.get("WHISPER_COMPUTE", "float16")

# loaded once per warm worker; cold start pays this, then it's cached
_model = WhisperModel(MODEL, device=DEVICE, compute_type=COMPUTE)


def handler(event):
    inp = event.get("input", {}) or {}
    b64 = inp.get("audio_b64")
    if not b64:
        return {"error": "no audio"}
    try:
        data = base64.b64decode(b64)
    except Exception:
        return {"error": "bad audio encoding"}
    hint = (inp.get("lang") or "").split("-")[0] or None
    segments, info = _model.transcribe(
        io.BytesIO(data), language=hint, vad_filter=True, beam_size=1)
    text = "".join(seg.text for seg in segments).strip()
    del data  # drop the audio; nothing persisted
    return {"text": text, "language": info.language}


runpod.serverless.start({"handler": handler})
