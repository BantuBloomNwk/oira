// Oira on-device concierge model (the Gemma 3n drop-in).
//
// Architecture invariant (docs/CONCIERGE-ARCHITECTURE.md): the concierge runs ON HER DEVICE and
// is handed only the whitelisted coarse palette. This module is the model engine behind
// OiraConcierge.answer(). It NEVER calls a server. When Gemma weights are present it refines the
// deterministic answer into warm, free-form language; when they are absent it reports
// unavailable and the concierge uses its deterministic engine. Same context boundary either way,
// so the privacy model is identical whether or not the model is loaded.
//
// Grounding contract: the model is given the deterministic answer as trusted facts and told to
// refine, not invent. It cannot see the raw selfie, exact measurements, keys, wallet, or verdicts,
// because those are never in the context it receives.
(function () {
  'use strict';
  var CFG = (typeof window !== 'undefined' && window.OIRA_LLM_CONFIG) || {};
  function cfg(k, d) { try { var v = localStorage.getItem('oira_llm_' + k); if (v != null) return v; } catch (e) {} return CFG[k] != null ? CFG[k] : d; }

  var engine = null, status = 'idle', loadPromise = null, mock = null;

  function webgpuOK() { try { return typeof navigator !== 'undefined' && !!navigator.gpu; } catch (e) { return false; } }
  // configured only when the founder has self-hosted the weights + the MediaPipe genai lib (CSP-safe)
  function configured() { return !!cfg('model') && !!cfg('lib'); }

  async function load() {
    if (engine) return engine;
    if (loadPromise) return loadPromise;
    status = 'loading';
    loadPromise = (async function () {
      var genai = await import(/* self-hosted, CSP-safe */ cfg('lib'));
      var fileset = await genai.FilesetResolver.forGenAiTasks(cfg('wasm', new URL('.', cfg('lib')).href));
      // maxNumImages > 0 is what turns on vision support at all (per Google's LLM Inference for
      // Web guide) — 0/absent keeps this identical to the original text-only engine. A multimodal
      // Gemma 3n build (E2B/E4B, .litertlm) is required either way; this does not change what
      // model file is needed, only whether the loaded model's own image capability is exposed.
      var maxImgs = +cfg('maxNumImages', 0);
      engine = await genai.LlmInference.createFromOptions(fileset, Object.assign({
        baseOptions: { modelAssetPath: cfg('model') },
        maxTokens: +cfg('maxTokens', 512), topK: 40, temperature: 0.7,
      }, maxImgs > 0 ? { maxNumImages: maxImgs } : {}));
      status = 'ready';
      return engine;
    })().catch(function (e) { status = 'error:' + (e && e.message || e); loadPromise = null; throw e; });
    return loadPromise;
  }

  // ready to answer? true if a mock is injected (tests) or real weights load on this device
  async function available() {
    if (mock) return true;
    if (!configured() || !webgpuOK()) return false;
    try { await load(); return status === 'ready'; } catch (e) { return false; }
  }

  // ---- prompt assembly: persona + the whitelisted context + the grounded draft ----
  var LANGNAME = { en: 'English', fr: 'French', es: 'Spanish', pt: 'Portuguese' };
  function buildPrompt(ctx, question, lang, draft) {
    ctx = ctx || {};
    var her = [];
    if (ctx.season) her.push('Season: ' + ctx.season);
    if (ctx.under) her.push('Undertone: ' + ctx.under);
    if (ctx.depthWord) her.push('Depth: ' + ctx.depthWord);
    if (ctx.curlFamily) her.push('Hair: ' + ctx.curlFamily + (ctx.curl ? ' (' + ctx.curl + ')' : ''));
    if (ctx.skinDryness) her.push('Skin today: ' + ctx.skinDryness + (ctx.skinShine ? ', ' + ctx.skinShine : '') + (ctx.skinBlemish ? ', one spot flagged' : ''));
    if (typeof ctx.earned === 'number') her.push('Earned so far: $' + ctx.earned.toFixed(2));
    return [
      'You are Oira, a warm, expert, discreet beauty concierge. You speak like a knowledgeable friend, never like a chatbot.',
      '',
      'What you know about her (she confirmed these and already sees them herself):',
      her.length ? her.map(function (x) { return '  - ' + x; }).join('\n') : '  - (she has not sealed a palette yet)',
      '',
      'You know NOTHING else about her. You cannot see her face, her exact measurements, her keys, or her wallet, and you must never claim to or ask for them.',
      '',
      'A grounded draft answer (these facts are correct; refine the wording into your voice, do not contradict the facts):',
      '  ' + (draft || '').replace(/\n+/g, ' '),
      '',
      'Rules: Answer in ' + (LANGNAME[lang] || 'English') + '. Keep it to one to three warm, specific sentences. No em-dashes, no filler. Never say you are an AI or a language model, and never claim to be human. Do not promise payments or make claims about the blockchain; her agent handles matches privately. If you are unsure, say so plainly.',
      '',
      'Her question: ' + question,
      'Oira:',
    ].join('\n');
  }

  // ---- output guardrail: house voice + no model tells; return null to fall back to the draft ----
  function guardOutput(text) {
    if (!text) return null;
    var t = String(text).trim();
    t = t.replace(/\s*[—–]\s*/g, ', ');                 // no em/en dashes (house rule)
    t = t.replace(/^Oira:\s*/i, '').trim();
    if (/\b(as an ai|language model|i am an ai|as a chatbot)\b/i.test(t)) return null;
    if (t.length < 2) return null;
    if (t.length > 700) t = t.slice(0, 700).replace(/\s+\S*$/, '') + '.';
    return t;
  }

  async function generate(ctx, question, lang, draft) {
    var prompt = buildPrompt(ctx, question, lang, draft);
    var raw = mock ? await mock(prompt) : await (await load()).generateResponse(prompt);
    return guardOutput(raw);
  }

  // true only once BOTH a model is configured AND it was loaded with maxNumImages > 0 (see load()
  // above) — vision needs a multimodal Gemma 3n build either way, this just confirms the engine
  // was actually asked to expose that capability, not silently ignore an image it can't use.
  function visionConfigured() { return configured() && +cfg('maxNumImages', 0) > 0; }

  // Same persona/grounding as buildPrompt, but the ARRAY form generateResponse() needs for
  // multimodal input: a mix of plain strings and {imageSource} objects, wrapped in Gemma's own
  // turn markers (per Google's LLM Inference for Web guide — generateResponse(['<start_of_turn>
  // user\n', text, {imageSource}, '<end_of_turn>\n<start_of_turn>model\n'])). The image is NEVER
  // part of the whitelisted ctx boundary above — it is a photo she is actively sharing for this
  // one question (e.g. "is this shade mine?"), passed in separately by the caller, not something
  // read back out of her sealed Palette.
  function buildVisionPrompt(ctx, question, lang, draft, imageSource) {
    ctx = ctx || {};
    var her = [];
    if (ctx.season) her.push('Season: ' + ctx.season);
    if (ctx.under) her.push('Undertone: ' + ctx.under);
    if (ctx.depthWord) her.push('Depth: ' + ctx.depthWord);
    if (ctx.curlFamily) her.push('Hair: ' + ctx.curlFamily + (ctx.curl ? ' (' + ctx.curl + ')' : ''));
    if (ctx.skinDryness) her.push('Skin today: ' + ctx.skinDryness + (ctx.skinShine ? ', ' + ctx.skinShine : ''));
    var header = [
      'You are Oira, a warm, expert, discreet beauty concierge. You speak like a knowledgeable friend, never like a chatbot.',
      '',
      'What you know about her (she confirmed these and already sees them herself):',
      her.length ? her.map(function (x) { return '  - ' + x; }).join('\n') : '  - (she has not sealed a palette yet)',
      '',
      'You know NOTHING else about her beyond this and the one image below, which she is sharing only for this question, not stored. You cannot see her face, her exact measurements, her keys, or her wallet, and you must never claim to or ask for them.',
      '',
      'A grounded draft answer (these facts are correct; refine the wording into your voice, do not contradict the facts):',
      '  ' + (draft || '').replace(/\n+/g, ' '),
      '',
      'Rules: Answer in ' + (LANGNAME[lang] || 'English') + '. Keep it to one to three warm, specific sentences. No em-dashes, no filler. Never say you are an AI or a language model, and never claim to be human. Never make a medical or diagnostic claim about anything you see in the image. Do not promise payments or make claims about the blockchain; her agent handles matches privately. If you are unsure, say so plainly.',
      '',
      'Her question: ' + question,
    ].join('\n');
    return ['<start_of_turn>user\n', header, '\n', { imageSource: imageSource }, '\n<end_of_turn>\n<start_of_turn>model\n'];
  }

  // Falls back to the text-only path when no image is given, so callers can use one entry point
  // regardless of whether this particular question came with a photo.
  async function generateWithImage(ctx, question, lang, draft, imageSource) {
    if (!imageSource) return generate(ctx, question, lang, draft);
    var prompt = buildVisionPrompt(ctx, question, lang, draft, imageSource);
    var raw = mock ? await mock(prompt) : await (await load()).generateResponse(prompt);
    return guardOutput(raw);
  }

  window.OiraLLM = {
    available: available,
    generate: generate,
    generateWithImage: generateWithImage,
    buildPrompt: buildPrompt,
    buildVisionPrompt: buildVisionPrompt,
    visionConfigured: visionConfigured,
    guardOutput: guardOutput,
    get status() { return status; },
    configured: configured,
    webgpuOK: webgpuOK,
    _setMock: function (fn) { mock = fn; },   // tests only
  };
})();
