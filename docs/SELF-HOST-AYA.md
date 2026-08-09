# Self-hosting the concierge model

The Oira concierge reasons over the coarse palette only (season, undertone, depth, her rules,
tonight's offers). It never sees a selfie, a measurement, a key, a wallet, or a verdict; the
`mcp/policy.mjs` boundary enforces that server-side. To keep that promise honest, the model must run
on **our own infra**, not a third-party API. This is how.

The bridge talks the OpenAI-compatible `/v1/chat/completions` format, so any server that speaks it
works with zero code changes. You only set three env vars.

## The privacy point

A hosted API (OpenAI, z.ai/GLM, Anthropic, …) would see the coarse palette and the question. That is
not raw data and the boundary still holds, but it is off-brand for a privacy protocol and it is a
recurring cost. Self-hosting removes the third party entirely and turns the concierge into a fixed
infra cost we already pay for.

## Which model

Three honest options, in order of how we should use them.

1. **Default, commercial-safe: Qwen2.5-Instruct (Apache-2.0).** Strong multilingual coverage across
   the wider world, self-hostable, no licence friction for a commercial product. 7B fits a single
   24GB GPU; 14B wants ~28-40GB (or 24GB quantized). This is the current code default
   (`qwen2.5-14b-instruct`).
2. **Multilingual-max: Cohere Aya Expanse (8B / 32B).** The best open coverage of Global-South
   languages, including African languages, by a distance. Caveat that matters: the Aya Expanse
   weights are released **CC-BY-NC (non-commercial)**. Use it for research, evaluation, and the
   language-quality bar, but do not ship it commercially without a licence arrangement from Cohere.
3. **The actual moat: our owned MMS / voice pipeline.** Real depth in Swahili, Yoruba, Hausa,
   Amharic, Zulu, and the rest is not something we rent from anyone. It comes through the owned
   African-voice pipeline (see the voice-moat work). The concierge routes into that for the
   languages the general models do not truly cover. This is the differentiator, not the base model.

Recommendation: ship Qwen2.5 self-hosted now for privacy plus broad multilingual, benchmark Aya as
the quality bar, and grow Global-South depth through our own pipeline rather than a rented API.

## Serve it with vLLM (OpenAI-compatible)

On the GPU box (RunPod pod or the Contabo GPU VPS):

```bash
pip install vllm
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-14B-Instruct \
  --served-model-name qwen2.5-14b-instruct \
  --api-key "$OIRA_LLM_KEY" \
  --host 0.0.0.0 --port 8000 \
  --max-model-len 8192
```

This exposes `http://<box>:8000/v1/chat/completions` behind the api-key. Put it behind our reverse
proxy (Caddy/TLS) and, ideally, restrict it to the bridge's egress IP so only Oira can reach it.

To serve Aya instead (evaluation): `--model CohereForAI/aya-expanse-8b --served-model-name
c4ai-aya-expanse-8b`.

## Point the bridge at it

Set on the bridge (never commit these; they are secrets/host config):

```
OIRA_LLM_URL=https://<our-host>/v1/chat/completions
OIRA_LLM_KEY=<the api key you passed to vLLM>
OIRA_LLM_MODEL=qwen2.5-14b-instruct
# optional: OIRA_LLM_TIMEOUT_MS=9000
```

With these set, `/api/concierge/health` reports `{"llm":true}` and `answer()` returns `via:"llm"`.
With them unset, the concierge falls back to the deterministic grounded answer, so nothing breaks and
nothing external is called.

## Verify the boundary still holds

The model changes nothing about what crosses the boundary. Re-run the two checks after wiring it:

```bash
# grounded/LLM answer over a coarse palette
curl -s -XPOST http://127.0.0.1:8799/api/concierge -H 'content-type: application/json' \
  -d '{"question":"does teal suit me?","palette":{"season":"True Winter","under":"Cool","lang":"en"}}'

# a smuggled raw trait must be rejected before the model is ever called
curl -s -XPOST http://127.0.0.1:8799/api/concierge -H 'content-type: application/json' \
  -d '{"question":"hi","palette":{"season":"True Winter","under":"Cool","ita":42.7}}'
```

The first returns a warm answer; the second returns an `unrecognized_keys` error. If the second ever
succeeds, stop and fix the boundary before shipping.
