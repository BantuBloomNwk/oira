// Guardrails for the Oira MCP tools. See docs/MCP-ARCHITECTURE.md.
// The tool boundary IS the trust boundary: only a whitelisted, coarse "palette" may cross it,
// and a deny-list belt-and-braces rejects anything that smells like a raw trait / secret / wallet.
import fs from 'fs';
import crypto from 'crypto';
import { z } from 'zod';

// ---- the ONLY input an agent may pass about her: coarse, already-on-her-screen palette ----
// .strict() rejects ANY unknown key, so a raw selfie / ITA° / key / wallet can never be smuggled in.
export const Palette = z.object({
  season: z.string().max(40),
  under: z.enum(['Warm', 'Cool', 'Neutral', 'Olive']),
  depthWord: z.string().max(20).optional(),
  depthNum: z.number().int().min(0).max(10).optional(),
  monk: z.number().int().min(1).max(10).optional(),
  curl: z.string().max(4).optional(),          // coarse Andre Walker code, e.g. "4C" (self-declared, not biometric)
  curlFamily: z.enum(['Straight', 'Wavy', 'Curly', 'Coily']).optional(),
  // bucketed skin-condition words only (never the raw roughness/shine-delta numbers behind them)
  skinDryness: z.enum(['dry', 'normal', 'hydrated']).optional(),
  skinShine: z.enum(['shiny', 'balanced', 'matte']).optional(),
  skinBlemish: z.boolean().optional(),
  earned: z.number().min(0).optional(),
  matched: z.boolean().optional(),
  rules: z.object({
    minPayout: z.number().optional(),
    maxPerBrand: z.number().optional(),
    blocked: z.array(z.string().max(40)).max(40).optional(),
  }).strict().optional(),
  offers: z.array(z.object({
    category: z.string().max(40).optional(),
    payout: z.number().optional(),
    shade: z.string().max(9).optional(),
  }).strict()).max(50).optional(),
  checks: z.array(z.object({
    n: z.string().max(40), h: z.string().max(9),
    g: z.boolean().optional(), t: z.string().max(60).optional(), ts: z.number().optional(),
  }).strict()).max(20).optional(),
  lang: z.enum(['en', 'fr', 'es', 'pt']).optional(),
}).strict();

// tools an agent is permitted to call (advisory, read-only). No seal/match/settle/payout tool
// exists here by design, money-moving stays deterministic and OUTSIDE MCP.
const ALLOW = new Set(['check_colour', 'ask_oira']);

// field names that must never appear anywhere in a call, even nested (defence in depth)
const DENY = ['selfie', 'image', 'photo_data', 'ita', 'lab', 'pixels', 'secret', 'privatekey',
  'private_key', 'seed', 'mnemonic', 'wallet', 'address', 'pubkey', 'nonce', 'verdict', 'ciphertext'];

// crude per-process rate limit (a real deployment adds per-caller identity)
const WINDOW = 60_000, MAX = Number(process.env.OIRA_MCP_MAX || 120);
let hits = [];
function rateOk() { const now = Date.now(); hits = hits.filter((t) => now - t < WINDOW); hits.push(now); return hits.length <= MAX; }

export function guard(tool, args) {
  if (!ALLOW.has(tool)) throw new Error(`tool not allowed: ${tool}`);
  if (!rateOk()) throw new Error('rate limit exceeded');
  const s = JSON.stringify(args).toLowerCase();
  for (const k of DENY) if (s.includes(`"${k}"`)) throw new Error(`blocked field in args: ${k}`);
}

const hash = (x) => crypto.createHash('sha1').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex').slice(0, 12);
export function audit(tool, args, result, ok = true) {
  const rec = { t: new Date().toISOString(), tool, ok, argsHash: hash(args), resultHash: hash(result || ''), len: ('' + (result || '')).length };
  try { fs.appendFileSync(process.env.OIRA_MCP_AUDIT || '/tmp/oira-mcp-audit.log', JSON.stringify(rec) + '\n'); } catch {}
  process.stderr.write('[oira-mcp audit] ' + JSON.stringify(rec) + '\n');
}
