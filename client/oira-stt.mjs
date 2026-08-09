// Oira STT proxy — forwards her audio to the self-hosted Whisper endpoint, key held server-side.
// See docs/VOICE-STACK.md. Two backends, chosen by OIRA_STT_URL:
//   RunPod Serverless:  https://api.runpod.ai/v2/<endpoint-id>/runsync   (Bearer OIRA_STT_KEY)
//   Contabo FastAPI:    https://<host>/stt                                (multipart, no key)
// Her audio is relayed once and never stored here; the transcript comes back as text only.
const STT_URL = process.env.OIRA_STT_URL || '';
const STT_KEY = process.env.OIRA_STT_KEY || '';
const RUNPOD = /runpod\.ai/.test(STT_URL);

export function sttConfigured() { return !!STT_URL; }

export async function transcribe({ audioBuf, lang }) {
  if (!STT_URL) throw new Error('stt not configured');
  if (!audioBuf || !audioBuf.length) throw new Error('empty audio');

  if (RUNPOD) {
    // RunPod serverless: JSON body { input: { audio_b64, lang } } -> { output: { text, language } }
    const res = await fetch(STT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(STT_KEY ? { authorization: 'Bearer ' + STT_KEY } : {}) },
      body: JSON.stringify({ input: { audio_b64: audioBuf.toString('base64'), lang } }),
    });
    if (!res.ok) throw new Error('stt upstream ' + res.status);
    const j = await res.json();
    const out = j.output || j;
    return { text: String(out.text || '').trim(), language: out.language };
  }

  // Contabo FastAPI: multipart form (audio + optional lang)
  const form = new FormData();
  form.append('audio', new Blob([audioBuf]), 'clip.webm');
  if (lang) form.append('lang', lang);
  const res = await fetch(STT_URL, { method: 'POST', body: form, headers: STT_KEY ? { authorization: 'Bearer ' + STT_KEY } : {} });
  if (!res.ok) throw new Error('stt upstream ' + res.status);
  const j = await res.json();
  return { text: String(j.text || '').trim(), language: j.language };
}
