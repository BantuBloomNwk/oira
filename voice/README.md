# Oira voice: deploy runbook (flip on AFTER top-up)

Everything is built and tested. The app ships with the server-voice path **off** (browser voice is
used), so nothing spends until we deliberately flip it. Do these steps once RunPod + ElevenLabs are
topped up. See docs/VOICE-STACK.md for the design.

## 1. Whisper on RunPod Serverless (scale-to-zero, bills only per transcription)
1. Build + push the worker image (`voice/Dockerfile.runpod`, `voice/runpod_handler.py`) to a
   registry, or point RunPod at this repo.
2. RunPod dashboard -> Serverless -> new endpoint from the image. GPU: a small one is plenty
   (Whisper large-v3 fits on 16GB). Set env: `WHISPER_MODEL=large-v3 WHISPER_DEVICE=cuda
   WHISPER_COMPUTE=float16`. Set **min workers = 0** (this is what keeps idle cost at $0) and a
   short idle timeout.
3. Note the endpoint id -> the call URL is `https://api.runpod.ai/v2/<id>/runsync`, and grab a
   RunPod API key.

   (Cheaper alternative with $0 marginal cost while credits are tight: run `voice/whisper-server.py`
   on the Contabo VPS with `WHISPER_MODEL=small WHISPER_DEVICE=cpu WHISPER_COMPUTE=int8`, and point
   `OIRA_STT_URL` at `https://<host>/stt`.)

## 2. Set the bridge secrets (Contabo, env only: never in git)
On the bridge container/host set:
```
OIRA_STT_URL=https://api.runpod.ai/v2/<id>/runsync
OIRA_STT_KEY=<runpod-api-key>
ELEVENLABS_API_KEY=<eleven-key>          # restricted key, TTS-only, IP-locked to the bridge
OIRA_TTS_VOICE_ID=<the-crafted-Oira-voice-id>
OIRA_TTS_MODEL=eleven_flash_v2_5         # half-credit model
OIRA_TTS_CAP_CHARS=30000                 # hard char ceiling (belt-and-braces with the key's cap)
```
Redeploy/restart the bridge. Check `GET /api/voice/health` -> `{ "stt": true, "tts": true }`.

## 3. (Optional but recommended) pre-generate the fixed spoken lines
Run once to warm the TTS cache with the templated lines per language, so most spoken replies are
free thereafter. (Script to add: iterate the concierge's fixed phrases -> POST /api/tts.)

## 4. Flip the app on
The client already has the code; enable it by setting the flag (then one Netlify deploy, batched):
- quick test on a device: in the browser console `localStorage.setItem('oira_voice_server','1')`.
- for everyone: default the flag on in `serverVoiceOn()` (app/index.html) and deploy once.

## Rollback
Unset the flag (or the bridge env). The app falls back to the free browser voice automatically on
any `/api/stt` or `/api/tts` failure, so a voice outage never blocks her; she can always type.

## Cost guardrails already in place
- RunPod min-workers=0 => idle STT costs $0.
- TTS on-disk cache => repeated lines never re-bill (verified).
- Voice-out only fires when she used the mic.
- Flash model (half credits) + `OIRA_TTS_CAP_CHARS` + the ElevenLabs key's own usage cap.
