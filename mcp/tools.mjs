// The Oira concierge tools, as pure functions (used by both the MCP server and the tests).
// Every call: validate -> guard (allowlist + deny-list + rate) -> run real concierge -> audit.
import { Palette, guard, audit } from './policy.mjs';
import { withPalette } from './concierge-bridge.mjs';

export async function checkColour({ hex, palette }) {
  if (typeof hex !== 'string' || !/^#?[0-9a-fA-F]{6}$/.test(hex)) throw new Error('invalid hex');
  const p = Palette.parse(palette);
  guard('check_colour', { hex, palette: p });
  const hx = hex.startsWith('#') ? hex : '#' + hex;
  const text = withPalette(p, (C) => C.judgeHex(hx));
  audit('check_colour', { hex: hx }, text);
  return text;
}

export async function askOira({ question, palette }) {
  const p = Palette.parse(palette);
  guard('ask_oira', { question, palette: p });
  const r = await withPalette(p, (C) => C.answer(question));
  audit('ask_oira', { question }, r.text);
  return r.text;
}
