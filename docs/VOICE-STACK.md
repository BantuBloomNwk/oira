# Oira voice stack (2026-07-07)

Decision: **self-hosted Whisper for listening + ElevenLabs for the voice she hears**, both
swappable for the owned MMS moat later. Speech-in and voice-out are separate engines, so we get
private, multilingual input AND a warm, crafted voice without compromise. Today's live build uses
the browser Web Speech API as an MVP; this doc is the plan to replace it.

## Why split
- **STT (listening) = Whisper.** It never speaks, so it can't sound robotic. Turning her spoken
  question into text is where privacy matters most, and Whisper runs on our own infra.
- **TTS (the voice she hears) = ElevenLabs.** This is the only place voice *quality* is felt.
  ElevenLabs gives a warm, natural, craftable voice (a signature "Oira" voice across languages).

## Privacy posture
- **Whisper self-hosted** (RunPod GPU, or Contabo CPU with `faster-whisper int8`): her audio goes
  to OUR endpoint over TLS, is transcribed, and is **discarded immediately** (never written to
  disk, never logged). This is strictly better than the browser default, which routes audio to
  Google. Her biometric traits are never involved either way (voice is only for asking questions).
- **ElevenLabs** receives only the concierge's OWN reply text (already on her screen), never her
  input audio and never traits. Reply text is short and non-sensitive.

## Cost control (the ElevenLabs worry, solved)
The concierge responder is deterministic and templated, which makes TTS cheap:
1. **Pre-generate the fixed lines** (greeting, season, "yes this is yours", privacy, etc.) per
   language, once, into a static audio library shipped with the app. Most spoken replies then cost
   **zero** at runtime.
2. **Cache by exact text hash** on the TTS proxy: any repeated sentence (including ones with a
   colour/number slot she's heard before) is served from cache, never re-billed.
3. **Voice-out only when she used the mic.** Text chats stay silent, so we pay only on the premium
   voice moments.
4. **Flash/Turbo model tier** for these short lines (a fraction of the top tier).
5. **Hard monthly budget cap** in the proxy; on exceed, fall back to the free browser voice. Spend
   can never surprise us.

## Components to build
1. **`voice/whisper-server.py`** (scaffolded): FastAPI + faster-whisper. `POST /stt` accepts an
   audio blob (+ optional `lang` hint), returns `{ text, language }`. CORS allowlisted to the app
   origin; audio held in memory only. Deploy to RunPod (GPU, `large-v3`) for best quality, or
   Contabo (CPU, `base`/`small` int8) for cost. Env: `OIRA_STT_ALLOW_ORIGIN`, `WHISPER_MODEL`.
2. **TTS proxy** (add to the existing bridge or a small service): `POST /tts { text, lang }` ->
   audio. Holds the ElevenLabs key server-side, applies the cache + budget cap, returns cached
   audio when possible. Env: `ELEVENLABS_API_KEY`, `OIRA_TTS_VOICE_ID`, `OIRA_TTS_CAP_CHARS`.
3. **Client wiring** (in `app/`): the mic records via `MediaRecorder`, POSTs to `/stt`, drops the
   transcript into the concierge (replacing browser SpeechRecognition, which stays as fallback).
   Voice-out fetches from `/tts` (or the pre-generated library) and plays it, replacing
   `speechSynthesis` when available. `OiraConcierge.locale()` already supplies the language.

## What I need from the founder to finish
- **Where to host Whisper**: RunPod GPU endpoint (best quality, pay-per-second) vs Contabo CPU
  (cheaper, `small` model, slightly slower). I can deploy to either with existing infra access.
- **ElevenLabs API key** (and we pick/craft the Oira voice together; ElevenLabs can clone or design
  a custom voice for the brand).
- Confirm the **monthly budget cap** figure so I can wire the guardrail.

## Long-term (the moat)
Owned **MMS** replaces both, first for African languages (where quality is the differentiator and
where ElevenLabs/Whisper are weakest), then broadly. The `/stt` and `/tts` seams are provider-
agnostic, so swapping to MMS is a config change, not a rewrite. See [[project_african_voice_moat]].
