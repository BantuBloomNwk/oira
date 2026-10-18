// Oira TTS proxy, ElevenLabs, key held server-side only. See docs/VOICE-STACK.md.
// Cost control: (1) on-disk cache keyed by exact text+voice+model, so any repeated line is served
// free; (2) Flash model by default (half the credits); (3) a hard monthly character cap enforced
// here in addition to the cap set on the ElevenLabs key itself. The proxy only ever receives the
// concierge's own reply text (already on her screen); never her audio, never her traits.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const KEY = process.env.ELEVENLABS_API_KEY || '';
const VOICE = process.env.OIRA_TTS_VOICE_ID || '';
const MODEL = process.env.OIRA_TTS_MODEL || 'eleven_flash_v2_5';
const CAP = Number(process.env.OIRA_TTS_CAP_CHARS || 0); // 0 = rely on the key's own cap
const CACHE_DIR = process.env.OIRA_TTS_CACHE || '/tmp/oira-tts-cache';
const MAX_CHARS = 600; // never synth an over-long string

export function ttsConfigured() { return !!(KEY && VOICE); }

function usageFile() { return path.join(CACHE_DIR, 'usage.json'); }
function readUsage() {
  try {
    const u = JSON.parse(fs.readFileSync(usageFile(), 'utf8'));
    const month = new Date().toISOString().slice(0, 7);
    return u.month === month ? u : { month, chars: 0 };
  } catch { return { month: new Date().toISOString().slice(0, 7), chars: 0 }; }
}
function addUsage(n) {
  try { const u = readUsage(); u.chars += n; fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(usageFile(), JSON.stringify(u)); } catch {}
}

export async function synthesize({ text, lang }) {
  if (!KEY || !VOICE) throw new Error('tts not configured');
  const clean = String(text || '').trim().slice(0, MAX_CHARS);
  if (!clean) throw new Error('empty text');
  const hash = crypto.createHash('sha1').update(MODEL + '|' + VOICE + '|' + clean).digest('hex');
  const file = path.join(CACHE_DIR, hash + '.mp3');
  try { if (fs.existsSync(file)) return { audio: fs.readFileSync(file), cached: true }; } catch {}
  if (CAP > 0) { const u = readUsage(); if (u.chars + clean.length > CAP) throw new Error('tts monthly cap reached'); }
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ text: clean, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.1 } }),
  });
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error('tts upstream ' + res.status + ' ' + t.slice(0, 120)); }
  const buf = Buffer.from(await res.arrayBuffer());
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(file, buf); } catch {}
  if (CAP > 0) addUsage(clean.length);
  return { audio: buf, cached: false };
}
