// Oira concierge — governed server reasoning path (the middle layer between on-device Gemma and
// the deterministic floor). When on-device weights are absent (most phones today), this is what
// gives her REAL reasoning instead of templates.
//
// Boundary: it POSTs only the whitelisted coarse palette (window.oiraBuildContext output) to the
// bridge's /api/concierge, which enforces the SAME mcp/policy boundary server-side and never sees
// a raw selfie, exact measurement, key, wallet or verdict. If no bridge is reachable, available()
// is false and OiraConcierge falls back to its on-device deterministic answer. No behaviour change
// on pure-static hosting with no bridge.
(function () {
  'use strict';
  var probe = null; // cached availability probe (one round-trip, then remembered)
  function base() { try { return (window.OIRA_BRIDGE_URL || '').replace(/\/$/, ''); } catch (e) { return ''; } }

  async function available() {
    if (probe !== null) return probe;
    probe = (async function () {
      try {
        var c = new AbortController(); var to = setTimeout(function () { c.abort(); }, 2500);
        var r = await fetch(base() + '/api/concierge/health', { signal: c.signal }); clearTimeout(to);
        return r.ok;
      } catch (e) { return false; }
    })();
    probe = await probe;
    return probe;
  }

  // ctx is the coarse palette from oiraBuildContext(); lang is her chosen language. hex is an
  // optional colour she photographed (e.g. a shopping-companion check) — when present the server
  // grounds its draft with the same on-device judgeHex() logic instead of parsing `question` for a
  // known colour name, so a raw sampled hex still gets a real, grounded judgement. Returns the
  // reasoned text, or null to let the caller keep the on-device deterministic answer.
  async function generate(ctx, question, lang, hex) {
    try {
      var c = new AbortController(); var to = setTimeout(function () { c.abort(); }, 12000);
      var body = { question: question, palette: Object.assign({}, ctx, { lang: lang }) };
      if (hex) body.hex = hex;
      var r = await fetch(base() + '/api/concierge', {
        method: 'POST', signal: c.signal, headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      clearTimeout(to);
      if (!r.ok) return null;
      var j = await r.json();
      return (j && typeof j.text === 'string' && j.text.trim()) ? j.text.trim() : null;
    } catch (e) { return null; }
  }

  window.OiraRemote = { available: available, generate: generate };
})();
