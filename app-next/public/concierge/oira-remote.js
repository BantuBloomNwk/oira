// Oira concierge. Governed server reasoning path (the middle layer between on-device Gemma and
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
  // Availability, and the one rule that matters: NEVER remember a no.
  //
  // This used to cache whatever the first probe returned, forever, with a 2.5s timeout. The
  // bridge is a proxy hop to another continent and a cold one takes longer than that more often
  // than you would think. So a single slow first request poisoned the entire session: she asked
  // once, got the grounded floor, and every question after it went to the floor too without so
  // much as a retry, until she reloaded the page. She would have read that as the app getting
  // dumber the longer she used it, which is exactly what the founder saw.
  //
  // A yes is worth remembering: the bridge does not come and go. A no is worth almost nothing,
  // because the usual cause is a cold connection rather than an absent server. So a yes is kept
  // for the session and a no is kept for RETRY_MS and then forgotten.
  var probe = null;          // true once we have seen a healthy bridge. Never set to false.
  var lastNo = 0;            // when the most recent failed probe happened
  var inFlight = null;       // so N questions at once make one request, not N
  var RETRY_MS = 20000;
  // Generous on purpose. The cost of waiting is a slower first answer; the cost of giving up
  // early is a worse answer, and she cannot tell the difference or ask for a better one.
  var PROBE_MS = 6000;

  function base() { try { return (window.OIRA_BRIDGE_URL || '').replace(/\/$/, ''); } catch (e) { return ''; } }

  async function available() {
    if (probe === true) return true;
    if (inFlight) return inFlight;
    if (lastNo && Date.now() - lastNo < RETRY_MS) return false;

    inFlight = (async function () {
      try {
        var c = new AbortController(); var to = setTimeout(function () { c.abort(); }, PROBE_MS);
        var r = await fetch(base() + '/api/concierge/health', { signal: c.signal }); clearTimeout(to);
        if (r.ok) { probe = true; return true; }
      } catch (e) { /* cold, slow, or genuinely down. Treated the same and retried. */ }
      lastNo = Date.now();
      return false;
    })();

    try { return await inFlight; } finally { inFlight = null; }
  }

  // ctx is the coarse palette from oiraBuildContext(); lang is her chosen language. hex is an
  // optional colour she photographed (e.g. a shopping-companion check). When present the server
  // grounds its draft with the same on-device judgeHex() logic instead of parsing `question` for a
  // known colour name, so a raw sampled hex still gets a real, grounded judgement. Returns the
  // reasoned text, or null to let the caller keep the on-device deterministic answer.
  async function generate(ctx, question, lang, hex) {
    try {
      // 24 seconds, and the number is not arbitrary. There is a chain of four timeouts here and
      // they have to nest, longest on the outside, or a link gives up on one that was about to
      // answer: Netlify's rewrite is a hard 26s, this is 24s, the bridge waits 21s for the
      // model, and the model takes 7 to 19s on a CPU box. It was 12s, which was shorter than
      // the answer usually takes, so most requests were aborted a few seconds before they
      // would have arrived and she got the floor. That is what "it worked once and then never
      // again" looked like from her side. If any of those four numbers moves, move the rest.
      var c = new AbortController(); var to = setTimeout(function () { c.abort(); }, 24000);
      // The voice contract travels with the request. The bridge builds the final prompt,
      // but it should be building it from the SAME rules and the same examples the on-device
      // tier uses, or Oira changes character the moment a phone has no local weights. A
      // bridge that ignores these fields is no worse off than before; one that honours them
      // sounds like her. See oira-voice.js.
      var voice = window.OiraVoice
        ? { rules: window.OiraVoice.rules(), shots: window.OiraVoice.shots() }
        : null;
      var body = { question: question, palette: Object.assign({}, ctx, { lang: lang }) };
      if (voice) body.voice = voice;
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
