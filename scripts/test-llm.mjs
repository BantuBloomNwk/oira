// Proves the on-device LLM seam without any spend or model download: a mock generate() stands in
// for Gemma. Checks refinement, the coarse-only prompt boundary, output guardrails, and fallback.
import fs from 'fs';
import { fileURLToPath } from 'url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const load = (p) => fs.readFileSync(ROOT + p, 'utf8');

// minimal browser shim (same approach as the MCP bridge)
const store = {};
const window = {};
const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const navigator = {}; // no navigator.gpu -> webgpu unavailable
new Function('window', 'localStorage', 'navigator', load('/app/oira-llm.js'))(window, localStorage, navigator);
new Function('window', 'localStorage', 'navigator', load('/app/concierge.js'))(window, localStorage, navigator);

// palette carries a POISON secret field: buildPrompt must whitelist and never forward it
const PALETTE = { season: 'Deep Winter', under: 'Cool', depthWord: 'Deep', curl: '4C', curlFamily: 'Coily', earned: 1.5, ita: 'SECRET_ITA_42', salt: 'SECRET_SALT_zzz', wallet: 'SECRET_WALLET_abc' };
window.oiraBuildContext = () => PALETTE;

let pass = 0, fail = 0;
const ok = (n, c) => { (c ? (pass++, console.log('  PASS ' + n)) : (fail++, console.log('  FAIL ' + n))); };

const C = window.OiraConcierge, LLM = window.OiraLLM;

// 1. no model configured, no webgpu, no mock -> deterministic
{
  const r = await C.answer('does berry suit me?');
  ok('unconfigured -> deterministic fallback', r.via === 'det' && r.text.length > 0);
}

// 2. mock model present -> refined answer via llm, em-dash stripped by guardrail
{
  let seenPrompt = '';
  LLM._setMock(async (p) => { seenPrompt = p; return 'Berry is truly yours — wear it with confidence.'; });
  const r = await C.answer('does berry suit me?');
  ok('mock present -> answered via llm', r.via === 'llm');
  ok('guardrail strips em-dashes', r.via === 'llm' && !/[—–]/.test(r.text));
  ok('prompt carries coarse palette (season)', /Deep Winter/.test(seenPrompt) && /Undertone: Cool/.test(seenPrompt));
  ok('prompt carries the grounded draft', /grounded draft/i.test(seenPrompt));
  ok('buildPrompt whitelists: poison secret values never reach the model', !/SECRET_/.test(seenPrompt));
}

// 3. model tries to out itself -> guardrail returns null -> fall back to deterministic
{
  LLM._setMock(async () => 'As an AI language model, I cannot judge colours.');
  const r = await C.answer('does berry suit me?');
  ok('model self-tell -> falls back to deterministic', r.via === 'det');
}

// 4. guardOutput unit checks
{
  ok('guardOutput strips dash + trims', LLM.guardOutput('Soft rose — lovely.') === 'Soft rose, lovely.');
  ok('guardOutput rejects empty', LLM.guardOutput('') === null);
  ok('guardOutput drops leading "Oira:"', LLM.guardOutput('Oira: hello') === 'hello');
}

// 5. multilingual prompt language line
{
  C.setLang('fr'); LLM._setMock(async (p) => (/Answer in French/.test(p) ? 'Le prune vous va vraiment.' : 'wrong-lang'));
  const r = await C.answer('le prune me va?');
  ok('prompt sets target language (fr)', r.via === 'llm' && r.text === 'Le prune vous va vraiment.');
  C.setLang('en');
}

// 6. vision: generateWithImage builds the documented array form (Gemma turn markers + an
// {imageSource} object interleaved with text), never leaks poison fields, and still runs through
// the same guardrail. No image -> falls back to the plain text path unchanged.
{
  let seenPrompt = null;
  LLM._setMock(async (p) => { seenPrompt = p; return 'That coral leans warm, and warm suits you — lovely pick.'; });
  const r = await LLM.generateWithImage(PALETTE, 'is this shade mine?', 'en', 'It leans warm.', { fake: 'canvas-element' });
  ok('vision prompt is the documented array form', Array.isArray(seenPrompt));
  ok('vision prompt opens with Gemma turn marker', seenPrompt[0] === '<start_of_turn>user\n');
  ok('vision prompt carries an {imageSource} object', seenPrompt.some((x) => x && typeof x === 'object' && 'imageSource' in x));
  ok('vision prompt whitelists: poison secret values never reach the model', !seenPrompt.some((x) => typeof x === 'string' && /SECRET_/.test(x)));
  ok('vision guardrail still strips em-dashes', !/[—–]/.test(r));

  let textCalled = false;
  LLM._setMock(async (p) => { textCalled = typeof p === 'string'; return 'Fine either way.'; });
  await LLM.generateWithImage(PALETTE, 'does berry suit me?', 'en', 'Yes.', null);
  ok('no image -> falls back to plain text prompt, not the array form', textCalled);
}

console.log(fail ? `\nFAILURES: ${fail} (${pass} passed)` : `\nALL GREEN (${pass} passed)`);
process.exit(fail ? 1 : 0);
