# Oira STT endpoint: self-hosted Whisper (privacy-first). See docs/VOICE-STACK.md.
# Her audio is transcribed in memory and DISCARDED immediately: never written to disk, never
# logged. Strictly better than the browser default (which routes audio to Google). Voice is only
# ever used to ask the concierge a question; her biometric traits are never involved.
#
# Deploy:
#   RunPod GPU (best):  WHISPER_MODEL=large-v3   WHISPER_DEVICE=cuda   WHISPER_COMPUTE=float16
#   Contabo CPU (cheap): WHISPER_MODEL=small     WHISPER_DEVICE=cpu    WHISPER_COMPUTE=int8
#   pip install fastapi uvicorn faster-whisper python-multipart
#   uvicorn whisper-server:app --host 0.0.0.0 --port 8890
#
# Env:
#   WHISPER_MODEL (default 'small'), WHISPER_DEVICE ('cpu'), WHISPER_COMPUTE ('int8')
#   OIRA_STT_ALLOW_ORIGIN (comma list, default the Netlify app)
#   OIRA_STT_MAX_MB (default 8): reject oversized uploads

import os, io
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

MODEL = os.environ.get("WHISPER_MODEL", "small")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
COMPUTE = os.environ.get("WHISPER_COMPUTE", "int8")
ALLOW = [o.strip() for o in os.environ.get(
    "OIRA_STT_ALLOW_ORIGIN", "https://oira-palette.netlify.app").split(",")]
MAX_BYTES = int(os.environ.get("OIRA_STT_MAX_MB", "8")) * 1024 * 1024

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=ALLOW, allow_methods=["POST", "OPTIONS"],
                   allow_headers=["*"])

# load once at startup (RunPod cold-start pays this; keep the worker warm)
_model = WhisperModel(MODEL, device=DEVICE, compute_type=COMPUTE)


@app.get("/health")
def health():
    return {"ok": True, "service": "oira-stt", "model": MODEL, "device": DEVICE}


@app.post("/stt")
async def stt(request: Request, audio: UploadFile = File(...), lang: str = Form(None)):
    data = await audio.read()
    if not data:
        raise HTTPException(400, "empty audio")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "audio too large")
    # transcribe in memory; language hint speeds it up and improves accuracy when known
    # (the app passes her current language via OiraConcierge.locale()).
    hint = (lang or "").split("-")[0] or None
    segments, info = _model.transcribe(
        io.BytesIO(data), language=hint, vad_filter=True, beam_size=1)
    text = "".join(seg.text for seg in segments).strip()
    del data  # drop the audio; nothing persisted
    return JSONResponse({"text": text, "language": info.language})
