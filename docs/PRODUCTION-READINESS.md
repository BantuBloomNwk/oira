# Oira — production readiness (2026-07-07)

Honest map of what's done vs what's left to a real, money-handling production launch. The
novel moat (private custody + seal + match + settle, device-held, hardened) is proven on
DEVNET. The remaining work is productionization + business/legal + one dependency risk.

Rough state: **protocol ~90% (devnet) · backend/infra ~60% · app/UX ~65% · growth ~10% ·
legal 0%.** "Built" overall ~70–75%; the last quarter (mainnet, economics, audit, native,
design, legal) is where launches actually get hard.

---

## A. Protocol / on-chain  (~90%, devnet only)
- ✅ Model B seal, match_query, settle, private payout, relayed device-custody — all proven on devnet.
- ❗ **VERIFY FIRST — MagicBlock Private ER + TEE on MAINNET.** The entire privacy moat depends on it. Confirm availability, SLA, and cost with MagicBlock before committing a mainnet date. Gating dependency.
- ❌ Mainnet deploy: program to mainnet, real USDC (not the test mint), mainnet rent/fees.
- ❌ External **security audit** of the program before real money.
- ❌ Upgrade-authority governance: currently a single deployer key. Move to multisig (Squads); plan for eventual immutability or governed upgrades.

## B. Backend / infra  (~60%)
- ✅ Bridge hardened: env-only deployer key, static-serving off, CORS allowlist, WS origin allowlist, per-IP rate limit, crash guard. Durable on the Contabo VPS behind Caddy TLS.
- ❌ **Economic model (biggest question).** Today the deployer funds every user's owner + agent + escrow. That doesn't scale and isn't the real flow — needs a proper relayer/paymaster + fee model (who pays gas; brands fund escrow for real; founders' take-rate on brand spend, never hers).
- ❌ Secrets: deployer key is an env var on the VPS. Production = KMS / Vault.
- ❌ Single VPS = SPOF, shared with other live internal services. Needs dedicated hosting, HA, backups, monitoring/alerting, log aggregation.
- ❌ Paid dedicated RPC (Helius/Triton) — env-ready (`OIRA_BASE_RPC`) but not set; public devnet RPC won't hold up.
- ❌ Real domain + cert (currently temporary sslip.io). Add it to `OIRA_ALLOW_ORIGIN`.
- ❌ Seal→overnight session is in-memory single-process — fine for one box, must be rethought for HA.

## C. App / UX  (~65%)
- ✅ Custody, seal, overnight against her real palette, on-device reading (ITA°), receipts.
- ❌ Still prototype flavour: fake brand names, "arrives Thursday", fake timestamps → wire real data.
- ❌ Design layer (from OIRA-STRATEGY.md §5): slide-out sidebar, profile as retention anchor, iris motif, daily hooks (check-a-colour habit, season card, monthly recheck). No gamification.
- 🟨 Concierge reasoning — the advisory "AI beauty" layer. Built as a three-layer stack over one coarse-palette boundary: on-device Gemma (privacy-max, needs self-hosted weights) → governed server reasoning (`/api/concierge`, reuses the mcp/policy boundary, LLM opt-in via `OIRA_LLM_*`, degrades to the grounded answer for free) → deterministic grounded floor. Raw traits/keys/wallet are rejected at the boundary (zod `.strict()` + deny-list). Remaining: ship on-device Gemma weights; point the server layer at a real model key for the demo.
- ❌ Trained undertone/Monk classifier + liveness/anti-spoof (today: heuristic + her confirm step).
- ❌ Native: RN/Expo Android APK + Seeker Seed Vault — the primary platform per strategy. Web/iOS-PWA only today.
- ❌ Edge UX: seal-failure recovery, blockhash-expiry mid-seal, slow/offline devnet, retries/idempotency.
- ❌ Account recovery if her passkey isn't synced / all devices lost (PRF recovery assumes passkey sync).

## D. Privacy residuals (documented v1 limitations — traits never leak, so the moat holds)
- Residual #1: match-time wallet linkability — settle stamps her ATA on base. Real fix = enclave-settled payout (reuse the proven private-payout rail) → later stealth one-time payee.
- Salt is seen in-flight by the server during the seal (used to build set_traits). Fully closing it needs device-side transaction building.

## E. Growth / onboarding  (~10%)
- ❌ Landing page + the A+ security hardening pass (spec in OIRA-STRATEGY.md §6).
- ❌ Double opt-in email (GDPR), signed single-use invite codes, HMAC-hashed analytics — all OFF the on-chain identity.
- ❌ Brand side: real campaign posting + the B2B shade-demand intelligence reports (the actual revenue).

## F. Non-engineering (blocks a real launch)
- ❌ Trademark search + registration for "Oira" (flagged since naming).
- ❌ Legal: payout/money-movement compliance, KYC/AML posture, ToS + privacy policy, GDPR.
- ❌ External security audit (program + bridge) sign-off before handling real money.

---

## Recommended critical path
1. **Confirm MagicBlock Private ER + TEE on mainnet** (gating — everything else assumes it).
2. **Decide the economic/fee model** (who pays gas + escrow at scale) — it shapes the backend.
3. **Design/UX layer + concierge + real data** — the daily product people actually keep.
4. **Native Android + Seeker.**
5. **Mainnet hardening**: audit → multisig upgrade authority → mainnet deploy → real USDC → paid RPC → real domain → dedicated HA hosting + monitoring.
6. **Onboarding** (landing/invite/email) + **legal/trademark**.

The moat is real and proven. The path to 100% is productionization + business/legal, not more cryptography.
