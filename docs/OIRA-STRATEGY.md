# Oira: strategy notes (2026-07-06)

Answers to the open strategic questions, grounded where possible in current Solana tooling.

## 1. Residual #1 (match-time wallet unlinkability): limitations + honest strategy

**The limitation, precisely.** On a match, `settle_offer` pays her from the brand's escrow to `campaign.payee = her real ATA owner`, committed on base. So the public chain learns "campaign Y (brand X, a specific shade) paid wallet W." Over enough matches, W's shade profile and brand affinities leak, not her *traits* (those stay in the enclave), but the *link* between her wallet and what she matched. No-match already leaks nothing (payee = 0).

**What the ecosystem gives us (researched):**
- **Token-2022 Confidential Transfers** are live on mainnet. They hide *amounts and balances* (Twisted ElGamal + ZK), but explicitly **do NOT hide the transaction graph**: sender, receiver, and mint stay visible. So they solve "how much" but not "who ↔ whom." Useful as a *complement* (hide the payout size), not a fix for the link.
- **Stealth / one-time addresses** are not a native Solana primitive; they'd be a custom scheme (scan/spend keys, per-offer ephemeral address she can detect and sweep). Real but bounded crypto work.

**The honest correction: we already own most of the fix.** Oira already has a proven private-payout rail, `privatePayout` in `oira-chain.mjs` moves USDC brand→her *inside the TEE enclave*, so the brand↔her link never touches public base. Residual #1 exists only because `settle_offer` uses a *separate* base-side escrow transfer that stamps her pubkey. So the strategy is **unify the payout onto the enclave rail**, not invent stealth addresses from scratch:

- **Recommended (medium): enclave-settled payout.** On a match, the payout happens in-enclave (the proven private-payments flow) and `settle_offer` on base records only an opaque "settled" flag against the escrow, never her pubkey. Base sees "this campaign paid out," not to whom. Reuses code we've already verified on devnet. This is the tractable 80% and downgrades #1 from "large" to "medium."
- **+ Confidential Transfer** on the settle leg to also hide the amount (Token-2022), a later polish.
- **Stealth one-time payee** only if we later want unlinkability even against a compromised enclave operator, the last 20%, genuinely large, post-mainnet.

So: #1 is more reachable than first flagged. Path = reuse the enclave rail for settlement; document stealth addresses as the far-future hardening.

## 2. Production readiness: honest %

- **On-chain protocol (Model B): ~95%.** Proven, swept (semgrep clean + 3 latent bugs fixed), one documented residual (#1, above). Mainnet-shaped.
- **App / client: ~55%.** Functional end-to-end but: (a) **key custody is a demo shortcut**: the bridge server holds her `owner`+`agent` keys; production needs owner = her **passkey / Seed Vault (secp256r1)**, `set_traits` signed on-device; (b) the undertone read is an on-device heuristic (ITA°), not a trained model, acceptable with the confirm step, but a trained Monk classifier is the real thing; (c) no real onboarding/auth; (d) the bridge is a devnet demo server, not a hardened service.
- **Overall product for mainnet: ~65%.** The moat (private match protocol) is strong; the surrounding product (custody, onboarding, unlinkable payout, polish) is the remaining third.

**Readiness checklist to reach ~90%:** client-side key custody (passkey/Seed Vault) → enclave-settled payout (#1) → real onboarding (below) → trained undertone model (or keep heuristic + confirm, documented) → productionized bridge (rate limits, retries, monitoring) → the design/UX layer below.

## 3. The agent: what it is, model, security, autonomy

**What it is today: a cryptographic session key, NOT an LLM.** The "agent" is a scoped Solana keypair whitelisted on her Palette. It can do exactly one thing, run `match_query` inside the enclave while she's offline, and only against committed, escrowed campaigns, bounded by her on-chain caps (per-epoch, lifetime, per-brand), and it is now gated so *only* her stored agent key can spend her budget. There is no model, no prompt, no autonomy beyond "evaluate this specific offer." That is the security property: **the on-chain program is the trust boundary; the agent can only do what the program allows.**

**If we add an LLM orchestration layer (optional):** its job is *selection and narrative*, never matching, deciding which incoming offers are worth evaluating, writing the "while you slept" digest, answering her colour questions. It must **never see her raw traits** (those never leave the enclave); it works over public offers + her stated rules. Model choice mirrors a proven pattern from prior internal work: small **on-device** (Gemma 3n) for private, phone-side reasoning; a server model only for non-sensitive tasks. Keep the *matching* purely cryptographic; keep the *LLM* on the outside, advisory.

**Autonomy without compromise (the hybrid answer):** bound autonomy *on-chain*, not in the agent. Every powerful action (spend, match, settle) is gated by program invariants (caps, escrow, agent-identity, receipt binding). The agent key is scoped, revocable (re-seal privacy with a new reader), and least-privilege. So even a fully compromised agent key can only exhaust her bounded budget against real escrowed offers, never extract traits, never spend her money, never settle without a real receipt.

## 4. OWS vs alternatives: wallet/agent standards

- **Open Wallet Standard (OWS) agents** (used in prior internal work) fit if/when the agent gets a *wallet with a spending policy*, e.g., paying its own ER fees, or any autonomous spend. Its policy engine is the right place for "this agent may spend ≤ X/day on gas, nothing else." Worth adopting for the agent's fee wallet.
- **Solana-native alternatives:** **Squads** smart wallet (multisig / policy) for treasury + agent authority; **Turnkey/Fireblocks**-style policy key management is the 2026 industry norm for agent wallets. **SendAI Solana Agent Kit** if we ever want an LLM agent with on-chain actions.
- **Cross-chain / interoperable (your requirement):** the **Agent Registry** (Solana-native, interoperable with Ethereum's ERC-8004) gives an agent a portable identity + reputation across chains, the right primitive if Oira's agent should be recognizable on major chains. **Recommendation:** keep the *privacy-critical match + payout on Solana/MagicBlock* (that's the moat and can't run cross-chain), and expose cross-chain reach at the *edges*, onboarding, payments in, agent identity, via bridges + the Agent Registry. Solana stays the execution layer; other chains are on-ramps, not where the enclave lives.

## 5. Design / UX: daily pull without being load-bearing

- **Daily "first point of truth" hooks (elegant, non-invasive):** the *Check-a-colour* tool (already built) as a daily habit ("will this match me?" on anything she's about to buy); a shareable **season card**; the **morning "while you slept" digest**; a gentle **monthly recheck**. No notification spam; the pull is utility + a little vanity, not FOMO. **Not load-bearing:** her Palette lives on-chain and is portable, she can leave and it persists; the app is a lens, not a vault she's trapped in.
- **Sidebar:** a slide-out drawer (settings, profile, receipts, night rules, recheck history) with the soft/silky feel, blush + plum, Fraunces italic headers, a single iris ribbon edge, gold only on sealed items. Smooth spring transition, backdrop blur of the current screen.
- **Profile (worth it: yes):** her sealed Palette + season card, earnings/receipts, her night rules, recheck history. A *vanity* surface that is also her verifiable identity. This is the retention anchor.
- **Signature motif: lean into the IRIS, not a generic blossom.** The brand *is* named for Iris (rainbow goddess + the iris of the eye = every hue). A recurring **iris** motif (petal, ribbon, the eye) is more unique and on-brand than a stock flower. The app already has petals + the melanin/iris ribbons in the kit, make the iris the through-line.
- **Logo:** your instinct matches Fable's design exactly. The **Silk Edge** mark is the sensual, "light caught in the stroke," not-overpowering O; the **Passing Light** is its living form. Now wired: daylight seal → Silk Edge, 3am → animated Passing Light, favicon → mono plum. House rule to keep: *the rainbow is the light on the subject, never the subject.*

## 6. Email / invite onboarding: secure + private

Keep this **off the app's on-chain identity.** The app authenticates by passkey/wallet; email is only for marketing/newsletter and lives in a *separate* system.

- **A landing page** (separate from the app) with **double opt-in** email capture (confirm link), consent-first, GDPR-shaped.
- **Invite codes as a gated feature:** signed, single-use or capacity-limited tokens. Codes gate app access; email gates the newsletter. Keep them decoupled.
- **UGC analytics without surveillance:** hash emails (HMAC) for dedup/analytics; store aggregates, not raw behavior tied to identity; no selling, no per-user profiles. This matches Oira's whole thesis, *own your data*, so the marketing layer must model the same restraint.
- **Where it lives:** a static landing site + a minimal capture endpoint (or a privacy-respecting ESP). Do **not** put emails in the same store as any palette/wallet data.

### Landing-site security hardening (target: A+ on securityheaders.com + Mozilla Observatory)
The landing page ships with a full hardening pass (it is a Web3 property and a phishing/impersonation target):
- **Headers:** strict `Content-Security-Policy` (no `unsafe-inline`; nonce/hash scripts), `Strict-Transport-Security` (HSTS preload), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` / `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` locking camera/mic/geo, `Cross-Origin-Opener-Policy`/`-Resource-Policy`/`-Embedder-Policy`.
- **Transport/MITM:** HTTPS-only, HSTS preload, TLS 1.2+; SRI on any third-party asset; ideally self-host all assets (no third-party JS) so CSP can be strict.
- **OWASP Top 10 + Web3-specific:** input validation + rate-limiting + CAPTCHA on the email/invite endpoints (injection, enumeration); signed single-use invite tokens (no guessable codes); no secrets in the client bundle; **wallet-connect phishing hardening**: verify origin, show the exact domain, never auto-approve; **address-poisoning / clipboard-hijack** awareness in any copy-address UI; anti-clickjacking (frame-ancestors); dependency/supply-chain scan (npm audit, SRI, pinned versions); no `dangerouslySetInnerHTML` of user content (XSS).
- **Verify:** run securityheaders.com + Mozilla Observatory + `testssl.sh` and iterate to A+ before launch; add the CSO skill's daily pass to CI.
Do this during the onboarding/landing build phase (the landing template is NOT in the current brand kit and needs designing).

## Recommended sequence

1. **Brand kit wired** (done: favicon, seal marks, /brand served).
2. **Enclave-settled payout** → closes residual #1 to ~medium; reuses proven rail.
3. **Client-side key custody** (passkey / Seed Vault), the biggest production gap.
4. **Design layer:** sidebar + profile + iris motif + daily hooks.
5. **Landing + invite/email** onboarding (separate, privacy-first).
6. Optional later: trained undertone model, LLM orchestration layer (advisory only), confidential-amount + stealth-payee hardening.
