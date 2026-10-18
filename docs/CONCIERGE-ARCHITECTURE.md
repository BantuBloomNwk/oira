# Oira concierge: architecture (2026-07-07)

The concierge is the "AI beauty" advisory layer. It is **not** the matcher. Matching is
cryptographic and happens inside the enclave; the concierge only *talks*, it reads back the
overnight in plain language, answers "will this suit me?", and suggests which offers are worth
her budget. Its entire value is trust, so its design is defined by one invariant.

## The invariant: it never sees her secret self
The concierge runs **on her device** and is handed a deliberately narrow, privacy-safe
context. It must NEVER receive, request, or infer:
- the raw selfie or any image,
- exact measurements (precise ITA°, Lab values, pixel data),
- her owner/agent **private keys** or the AES recovery key,
- her private on-chain **verdicts, nonces, or receipts' inner data**,
- her **wallet address / linkage** to specific offers.

If a future model layer needs none of these to be useful, then a compromised concierge leaks
nothing that isn't already on her own screen. That is the design target.

## What it CAN see (the whitelist: the only context it gets)
Assembled by a single `buildContext()` that whitelists fields she already sees in her own UI:
- **Coarse palette buckets** she confirmed and displays herself: season name, undertone word
  (Warm/Neutral/Cool/Olive), depth word (Soft/Rich/Deep), optional Monk band. These are the
  buckets she chose to show, not the raw reading.
- Her **stated night rules** (min payout, blocked categories, caps), she authored these.
- **Public offer metadata** (category, payout, brand's committed shade), already public on chain.
- Her **check-a-colour** results (a shade + the deterministic verdict she just ran).
- Her **earnings summary** (totals she can see), never wallet identifiers.

`buildContext()` is the single trust boundary. The model function receives only this object;
it has no handle to app secrets, `reading.ita`, the selfie canvas, or `deviceOwner`.

## On-device vs server split
- **Everything advisory runs on-device.** Nothing in the concierge path calls the bridge or
  any server. (The bridge only ever does the cryptographic seal/match/settle, never advice.)
- **Production model:** Gemma 3n (E2B) on-device via MediaPipe LiteLLM / LiteRT-LM with WebGPU,
  weights **self-hosted** so the strict CSP can load them (no third-party model host). On native
  (Android/Seeker) it runs through the same on-device runtime. See [[tech_gemma_ondevice]].
- **v1 (this build):** a local, deterministic reasoning engine behind the *same* interface, `OiraConcierge.answer(question)` → builds the whitelisted context, detects intent, and returns
  a warm, grounded, human answer (reusing the proven check-a-colour logic for shade questions).
  It is honest: fully on-device, private, works on every device with zero model download. It is
  **not yet an LLM**: the Gemma model simply drops into `respond(intent, ctx, q)` later with the
  identical context boundary, so nothing about the privacy model changes.

## Interface contract
```
OiraConcierge.answer(question) -> { text, intent }     // async; never throws to UI
OiraConcierge.suggestions()   -> [string]              // context-aware starter prompts
internal: buildContext()      -> { season, under, depth, monk?, rules, offers[], lastCheck?, earned }
internal: respond(intent, ctx, question) -> string     // <-- swap for Gemma here
```

## Capabilities (v1)
- **Read back the overnight**: "What happened while I slept?" → grounded in the real digest.
- **Will this suit me?**: over a named/checked shade → reuses check-a-colour's verdict + reason.
- **Which offers are worth it?**: ranks public offers against her rules + palette (never her
  wallet), explains why.
- **Season guidance / recheck nudge**: "what colours are mine?", gentle monthly recheck.
- Voice: human, warm, no em-dashes or filler (house copy rules). Never claims to be a person.

## Languages (v2)
The responder is language-agnostic in its *logic* and localized in its *rendering*. `judge()`
returns a structured result (verdict key + temp/depth/undertone), and a per-language table
renders the prose, so accuracy is shared across every language and only the words change.
- **Shipped now (first-pass, native-review pending): en, fr, es, pt.** These already cover very
  large Global-South populations (Francophone + Lusophone Africa, Latin America). Colour trigger
  words and intent keywords are recognised per language, so she can ask in her own language.
- **Language is chosen** from the device locale on first use and overridable from a picker in the
  concierge; the choice persists (`localStorage: oira_lang`).
- **African languages are the moat, so they do NOT get hand-rolled here.** Yoruba, Swahili, Hausa,
  Amharic, Zulu etc. route through the **owned MMS/Gemma pipeline** with native review, the same
  quality bar as the voice corpus. Hand-translated beauty copy is exactly the "gibberish" trap to
  avoid. When Gemma lands (multilingual by design) it answers open-ended in any supported language
  behind the same `buildContext()` boundary.

## Accuracy (v2)
- Shade lookup understands **modifiers** (deep / pale / bright / muted, in each language) and
  adjusts the judgement, not just the base colour.
- `judge()` factors undertone + depth + temperature + saturation; verdicts are `yours` /
  `wash` (too pale for her depth) / `clash` (fights undertone) with a specific "go warmer/cooler
  or richer" fix.
- Season-aware advice: per-season best-shade lists power "what are my colours?", "what should I
  avoid?", and "recommend a shade", with localized colour names.

## Languages (v2)
The responder is language-agnostic in its *logic* and localized in its *rendering*. `judge()`
returns a structured result (verdict key + temp/depth/undertone), and a per-language table
renders the prose, so accuracy is shared across every language and only the words change.
- **Shipped now (first-pass, native-review pending): en, fr, es, pt.** These already cover very
  large Global-South populations (Francophone + Lusophone Africa, Latin America). Colour trigger
  words and intent keywords are recognised per language, so she can ask in her own language.
- **Language is chosen** from the device locale on first use and overridable from a picker in the
  concierge; the choice persists (`localStorage: oira_lang`).
- **African languages are the moat, so they do NOT get hand-rolled here.** Yoruba, Swahili, Hausa,
  Amharic, Zulu etc. route through the **owned MMS/Gemma pipeline** with native review, the same
  quality bar as the voice corpus. Hand-translated beauty copy is exactly the "gibberish" trap to
  avoid. When Gemma lands (multilingual by design) it answers open-ended in any supported language
  behind the same `buildContext()` boundary.

## Accuracy (v2)
- Shade lookup understands **modifiers** (deep / pale / bright / muted, in each language) and
  adjusts the judgement, not just the base colour.
- `judge()` factors undertone + depth + temperature + saturation; verdicts are `yours` /
  `wash` (too pale for her depth) / `clash` (fights undertone) with a specific "go warmer, cooler
  or richer" fix.
- Season-aware advice: per-season best-shade lists power "what are my colours?", "what should I
  avoid?", and "recommend a shade", with localized colour names.

## Hard "never" list (guardrails)
The concierge must never: perform or influence the on-chain **match** (cryptographic only),
touch raw traits, move funds, reveal anyone else's data, or invent offers/receipts. Advice only.

## Upgrade path
1. v1 deterministic responder (this build): ships now, private, universal.
2. Drop Gemma 3n into `respond()` behind the same `buildContext()` boundary (WebGPU + self-hosted
   weights); add streaming + a small system prompt that hard-codes the "never see raw traits" rule.
3. Native on-device runtime for Android/Seeker.
