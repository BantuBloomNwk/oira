# Concierge LLM (Gemma 3n on-device, multimodal): runbook

The concierge model seam is built and tested (`scripts/test-llm.mjs`, 17 green, including the
vision path). It is **off until weights are hosted** and turns on with config alone, no code
change. Same pattern as the voice stack: the plumbing, the prompt, the guardrails, and the
fallback are done; you drop in the model. Local, private, self-hosted, no third-party API, no
per-message cost, the model runs in her browser via WebGPU, never on a server.

## What is built
- `app/oira-llm.js`: the on-device engine (`window.OiraLLM`). It **never calls a server**. When
  Gemma weights are present it refines the deterministic answer into warm, free-form language;
  when absent, `available()` returns false and the concierge uses its deterministic engine.
- `app/concierge.js` `answer()`: computes the deterministic answer first (grounded facts +
  always-on fallback), then, if the model is available, asks it to refine that draft. Identical
  `buildContext()` boundary either way, so privacy is unchanged.
- **Vision**: `generateWithImage(ctx, question, lang, draft, imageSource)`: she can share a photo
  (a product, an outfit, a swatch) in one turn and ask about it. Falls back to the plain text path
  automatically when no image is given, so `answer()` can call one entry point either way.
- **Grounding**: the model is handed the deterministic answer as trusted facts and told to refine,
  not invent. It cannot hallucinate her palette, and is explicitly told never to make a medical or
  diagnostic claim about anything it sees (relevant once the skin-condition reading in `reading.skin`
  reaches it, see `docs/PRODUCTION-READINESS.md` on the skin scanner).
- **Boundary**: `buildPrompt`/`buildVisionPrompt` whitelist ctx fields (now including
  `skinDryness`/`skinShine`/`skinBlemish`, bucketed words only, never raw scores). Proven: a
  poisoned context (`ita`, `salt`, `wallet`) never reaches the model, image or no image. A shared
  photo is passed in separately per call, is never part of the whitelisted ctx, and is never stored.
- **Guardrails**: output strips em-dashes (house rule), drops model self-tells ("as an AI"),
  caps length, and falls back to the deterministic draft if the output is unusable.

## Turn it on (no spend on a model host; weights are self-hosted, CSP-safe)
1. **Get Gemma 3n weights.** Multimodal (text + image + audio) on-device builds ship as
   `.litertlm` files from `google/gemma-3n-E2B-it-litert-lm` on Hugging Face (or the Kaggle
   mirror). The web-optimized int4 build is **`gemma-3n-E2B-it-int4-Web.litertlm`, ~3.0 GB**
   (E4B is the larger/higher-quality sibling, several GB more). Downloading it requires accepting
   Google's Gemma Terms of Use on a Hugging Face or Kaggle account first, a one-time, free, but
   human click-through; no agent or script can do this step on your behalf. Once you've accepted
   the license and downloaded the file once, host it, no repeat account step after that.
2. Vendor the MediaPipe GenAI web bundle + wasm into `app/vendor/genai/` (self-hosted so the CSP
   never needs a third-party model host).
3. Host the weights on the same origin (or a same-origin path) so the strict CSP allows the fetch.
   At ~3 GB, this is a real one-time download for her too, worth gating behind an explicit
   "download the offline concierge" action (ideally Wi-Fi-only) and caching it (Cache API /
   IndexedDB) rather than fetching it silently on page load.
4. Set config (either a global before `oira-llm.js`, or localStorage for a quick device test):
   ```js
   window.OIRA_LLM_CONFIG = {
     lib: '/vendor/genai/genai_bundle.mjs',   // the MediaPipe genai ES module
     wasm: '/vendor/genai/',                  // fileset dir (defaults next to lib)
     model: '/models/gemma-3n-E2B-it-int4-Web.litertlm', // self-hosted weights
     maxTokens: 512,
     maxNumImages: 1,                         // omit/0 to keep text-only; >0 turns on generateWithImage()
   };
   ```
   Quick per-device test without a rebuild:
   `localStorage.setItem('oira_llm_lib','/vendor/genai/genai_bundle.mjs')` and the same for
   `oira_llm_model` / `oira_llm_maxNumImages`.
5. Requires **WebGPU** (Chrome/Edge, Android WebView on Seeker). `webgpuOK()` gates it; unsupported
   devices fall back to the deterministic concierge automatically.

## On native (Android / Seeker)
Run the same weights through the on-device MediaPipe / LiteRT-LM runtime. The `generate()`/
`generateWithImage()` seam is the only thing that changes; the prompt, boundary, and guardrails
are shared.

## Test
`node scripts/test-llm.mjs`: mocks `generate()`/`generateWithImage()` so it needs no weights or
GPU. Covers refinement, the whitelist boundary (text and vision), guardrails, multilingual
prompting, deterministic fallback, and the documented multimodal array-prompt shape.

Sources checked for the numbers above: [LLM Inference guide for Web](https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js), [gemma-3n-E2B-it-litert-lm on Hugging Face](https://huggingface.co/google/gemma-3n-E2B-it-litert-lm).
