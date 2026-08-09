# Agent + MCP architecture (Oira) — 2026-07-07

How our reasoning agents get tools, safely. One rule governs everything here.

## THE RULE (non-negotiable)
**MCP is for advisory / reasoning agents only. Money-moving and secret-holding capabilities are
NEVER exposed to an LLM through MCP.**
- Advisory agents (the Oira concierge) may reason and call MCP tools.
- The seal / match / settle / payout path stays **deterministic and cryptographic**, outside MCP,
  behind a hard gate. An LLM never signs, never moves funds, never touches raw secrets.
- Between the two sits a deterministic boundary: the model can *request* an action, but a
  non-LLM policy check executes (or refuses) it.

## Why MCP
A uniform, discoverable, governed way to hand an LLM tools: each tool has a schema, a policy, and an
audit record. It replaces ad-hoc "the model calls this API" glue with one inspectable layer. It
maps cleanly onto our privacy invariant: the model only ever sees what a tool returns.

## Shape
```
        ┌─────────────┐        ┌──────────────────────┐        ┌───────────────────┐
LLM ───▶│  MCP server │ ─────▶ │ policy + guardrails  │ ─────▶ │ existing APIs /    │
(agent) │ (tools)     │        │ (allowlist, schema,  │        │ services (wrapped) │
        └─────────────┘        │  redaction, limits)  │        └───────────────────┘
                               └──────────────────────┘
```
- **Wrap, don't replace.** Each agent-facing capability becomes one MCP tool over an existing API.
  The APIs keep serving the app directly; MCP is an additional, governed door for the agent.
- **The tool boundary is the trust boundary.** Same idea as Oira's `buildContext()`: a tool returns
  only whitelisted, coarse data. Raw traits, keys, wallet, and PII never cross it.

## Guardrails (enforced at the tool boundary, server-side)
1. **Allowlist** — an agent may only call the tools its role grants.
2. **Schemas in/out** — every tool validates input and output; the model cannot smuggle arbitrary
   data through, and outputs are shape-checked before returning.
3. **Redaction filter** — a deny-list of fields (raw selfie, ITA°/measurements, secret keys,
   wallet, private verdicts, PII) that can never appear in any tool result.
4. **Rate + budget limits** — per tool, per session, per IP.
5. **Full audit log** — every tool call (who, what, args hash, result hash, allow/deny) is logged.
6. **No side-effects without a deterministic gate** — any tool that would change state or spend is
   split: the LLM tool only *proposes*; a separate non-LLM verifier applies it under fixed rules.

## Tool inventory (first cut)
**Oira concierge (advisory, read-only):**
- `check_colour(hex)` → verdict + reason (over coarse palette; the proven judge logic).
- `read_digest()` → the overnight summary (earnings + honest status; no wallet).
- `list_checks()` → her on-device colour history.
- `explain(topic)` → privacy / offers / rules copy.
- NOT exposed: anything that seals, matches, settles, or reads raw traits.

## Sequencing
The interface already exists in deterministic form (Oira's `respond(intent, ctx)` + `buildContext`).
MCP is the formalization, and it pays off once the concierge is a real LLM (Gemma). So:
1. Now: freeze the tool schemas + the redaction deny-list + the policy config (design-complete).
2. Build the MCP server exposing the read-only Oira tools first (safest, no side-effects), with the
   guardrails above, testable standalone.
3. Wire the Gemma concierge to it.
4. Never add a settle/seal tool without the deterministic gate.

## Security review checklist (before any MCP goes live with real money nearby)
- The redaction filter is proven (fuzz it: no denied field ever leaks).
- Every state-changing path has a non-LLM verifier.
- Audit log is tamper-evident and reviewed.
- The MCP server has its own authn/z, rate limits, and is not internet-exposed beyond need.
