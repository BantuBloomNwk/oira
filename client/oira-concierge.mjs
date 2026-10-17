// Governed server-side concierge reasoning. This is the "real reasoning" layer behind the app's
// concierge: it reuses the SAME trust boundary as the MCP tools (mcp/policy.mjs). Only the coarse
// palette may cross, any raw trait/secret/wallet is rejected. Grounds the answer in the real
// concierge (single source of truth), then refines it with an LLM ONLY when one is configured.
//
// Privacy: identical boundary to the on-device path. The server receives only the whitelisted
// palette (season/undertone/depth/…), never the selfie, exact measurements, keys, wallet or verdict.
// Cost: the LLM is strictly opt-in via env. With no key set it returns the grounded answer, so the
// default deployment (and the demo) reason for free and never burn credits.
import { Palette, guard, audit } from '../mcp/policy.mjs';
import { withPalette } from '../mcp/concierge-bridge.mjs';

const LANGNAME = { en: 'English', fr: 'French', es: 'Spanish', pt: 'Portuguese' };

// same persona + boundary + house rules as the on-device model (app/oira-llm.js), so the voice
// never drifts between the two reasoning paths.
function buildMessages(ctx, question, lang, draft) {
  const her = [];
  if (ctx.season) her.push('Season: ' + ctx.season);
  if (ctx.under) her.push('Undertone: ' + ctx.under);
  if (ctx.depthWord) her.push('Depth: ' + ctx.depthWord);
  if (ctx.curlFamily) her.push('Hair: ' + ctx.curlFamily + (ctx.curl ? ' (' + ctx.curl + ')' : ''));
  if (ctx.skinDryness) her.push('Skin today: ' + ctx.skinDryness + (ctx.skinShine ? ', ' + ctx.skinShine : '') + (ctx.skinBlemish ? ', one spot flagged' : ''));
  if (typeof ctx.earned === 'number') her.push('Earned so far: $' + ctx.earned.toFixed(2));
  const system = [
    'You are Oira, a warm, expert, discreet beauty concierge. You speak like a knowledgeable friend, never like a chatbot.',
    // Talk TO her, not about her. Small models read the "what you know about her" framing in the
    // user message as an instruction to write in the third person, and a real run came back
    // "She prefers a bold, rich lipstick" three times out of four. A friend does not describe
    // you to the room. Contractions for the same reason: without asking, the model writes
    // "you are" and "it is" and the whole thing goes stiff, which is the exact register the
    // founder's voice rule exists to keep out.
    'Speak straight to her as "you". Never call her "she" or "her", and never describe her in the third person.',
    'Use contractions: you\'re, it\'s, that\'ll, I\'d. Write the way a friend texts, not the way a brochure reads.',
    'You cannot see her face, her exact measurements, her keys, or her wallet, and you must never claim to or ask for them.',
    'Answer in ' + (LANGNAME[lang] || 'English') + '. Keep it to one to three warm, specific sentences.',
    'No em-dashes, no filler. Never say you are an AI or a language model, and never claim to be human.',
    'Do not promise payments or make claims about the blockchain; her agent handles matches privately. If unsure, say so plainly.',
  ].join(' ');
  const user = [
    'What you know about her (she confirmed these and already sees them herself):',
    her.length ? her.map((x) => '  - ' + x).join('\n') : '  - (she has not sealed a palette yet)',
    '',
    'A grounded draft answer (these facts are correct; refine the wording into your voice, do not contradict the facts):',
    '  ' + (draft || '').replace(/\n+/g, ' '),
    '',
    'Her question: ' + question,
  ].join('\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

// house-voice output guard: strip dashes and any model tells; null => caller keeps the grounded draft.
function guardOutput(text) {
  if (!text) return null;
  /* The dashes are written as \u escapes on purpose. This was an em-dash and an en-dash as
     literal characters, and a global "strip em-dashes" pass over the repo rewrote the one
     inside this character class into ". ", which turned it into [period, space, en-dash].
     A space in a character class matches every space, so guardOutput replaced every space in
     every answer with a comma and she was served "You, need, a, lipstick, that, complements".
     The committed file has been wrong for a while; the box was running an older build, so
     nothing showed until it was redeployed. Escapes cannot be mangled that way. */
  let t = String(text).trim().replace(/\s*[\u2014\u2013]\s*/g, ', ').replace(/^Oira:\s*/i, '').trim();
  if (/\b(as an ai|language model|i am an ai|as a chatbot)\b/i.test(t)) return null;
  if (t.length < 2) return null;
  if (t.length > 700) t = t.slice(0, 700).replace(/\s+\S*$/, '') + '.';
  return t;
}

// Chat completion over the OpenAI-compatible wire format (a de-facto standard, NOT a dependency on
// OpenAI). Intended provider: a multilingual open model we self-host behind vLLM/TGI on our own
// infra, so even the coarse palette never touches a third party. Default is Qwen2.5 (Apache-2.0,
// commercial-safe, strong multilingual); Aya Expanse is the multilingual-max option where its
// non-commercial licence allows, and the real Global-South depth comes through our owned MMS/voice
// pipeline. A hosted OpenAI-compatible API is a labelled stopgap only. See docs/SELF-HOST-AYA.md.
// Opt-in: returns null unless OIRA_LLM_URL + OIRA_LLM_KEY are set, so nothing external is ever
// called by default and the demo reasons for free off the grounded floor.
async function refine(messages) {
  const url = process.env.OIRA_LLM_URL, key = process.env.OIRA_LLM_KEY;
  if (!url || !key) return null;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), Number(process.env.OIRA_LLM_TIMEOUT_MS || 9000));
  try {
    const r = await fetch(url, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: process.env.OIRA_LLM_MODEL || 'qwen2.5-14b-instruct', // self-hosted, commercial-safe
        messages, temperature: 0.6,
        // The prompt asks for one to three sentences, which is 60 to 90 tokens. 240 was a
        // budget nothing needed and every unused token is real time on a CPU box: the tail of
        // the distribution was the tail that got aborted. Capped where a long answer still
        // fits and a runaway one cannot cost her ten seconds.
        max_tokens: Number(process.env.OIRA_LLM_MAX_TOKENS || 160),
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return guardOutput(j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content);
  } catch (e) { return null; } finally { clearTimeout(to); }
}

export function llmConfigured() { return !!(process.env.OIRA_LLM_URL && process.env.OIRA_LLM_KEY); }

// The governed reasoning call the app hits. Validates + guards the palette, grounds the answer in
// the real concierge, then refines with the LLM when configured. Always returns a warm answer.
export async function reason({ question, palette, hex }) {
  const q = String(question || '').slice(0, 300);
  const p = Palette.parse(palette || {});      // .strict() drops/blocks anything that is not the coarse palette
  // A photographed colour (shopping-companion check) is a plain hex she sampled on-device, same
  // shape as the hex values already allowed through in palette.checks[].h / offers[].shade, not a
  // raw trait/secret. Validate the shape defensively since it skips the Palette schema (it isn't
  // part of her palette, it's the thing being judged against it).
  const h = typeof hex === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(hex) ? hex : null;
  guard('ask_oira', { question: q, palette: p, hex: h }); // allowlist + deny-list scan (raw trait / secret / wallet)
  // A photographed hex has no colour NAME for the text-intent parser to find, so ground it with the
  // same judgeHex() logic the on-device photo flow uses instead of answer()'s keyword matching,
  // otherwise a raw hex silently falls through to a generic "your season is..." non-answer.
  const draft = withPalette(p, (C) => (h ? C.judgeHex(h) : C.answer(q)));
  const resolved = (draft && draft.then) ? await draft : draft;
  const draftText = typeof resolved === 'string' ? resolved : resolved.text;
  const lang = p.lang || 'en';
  let via = 'grounded', text = draftText;
  const refined = await refine(buildMessages(p, q, lang, draftText));
  if (refined) { text = refined; via = 'llm'; }
  audit('ask_oira', { question: q, via }, text);
  return { text, via };
}
