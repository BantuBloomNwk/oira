# Oira — MagicBlock Solana Blitz build spec (48h)

Product **Oira** (working titles were Hue, then Oula), by **BantuBloomNetwork × Aurora K**. This spec folds in prior market research and a devil's-advocate review of the design.

## The one thing that decides everything
**In the current design, MagicBlock's Private ER is decorative.** If the Palette is computed on-device and only she can decrypt it, the phone can evaluate a brand offer locally and reveal only the acceptance — no enclave needed. Entering a MagicBlock hackathon with a demo where MagicBlock is optional is fatal.

**Fix = the enclave earns its existence.** Restructure so the match happens while she is **offline / phone locked**: a brand query arrives, her delegated agent answers it *inside the Private ER enclave* against her sealed Palette, emits a signed + attested receipt, and the payout lands. She wakes up, unlocks with her face, and the match + USDC are waiting. That is the only narrative where the PER is load-bearing, and it's a better demo beat: *"she was asleep; her Palette was working; her face never left the phone; and the brand got a hardware-attested answer it can trust without ever holding her face."*

Everything below serves that beat.

## Positioning (language discipline — non-negotiable)
- **Never say** "own your data", "data marketplace", "decentralized identity", "monetize your data". Colosseum evidence: those framings are 0-for-the-field (tokenized rewards 0 wins/95).
- **Say:** "match without exposure" and "shade-demand infrastructure". Lead with the **primitive** (any Solana app queries a consented Palette), not the beauty app.
- **No token.** Payouts are a consequence in the demo, never the headline.

## Weekend scope
### Day 1 — the reading + the sealed Palette
- Guided selfie with a **calibration step** (reference card or white-balance capture) — see "the misread problem".
- On-device face landmarking (MediaPipe) + undertone sampling → structured traits.
- **Confirm/adjust screen: she has the final say over her own Palette.** On-message (the anti-Gender-Shades gesture) and it caps the on-stage accuracy risk.
- Client-side encrypt traits → commit to `palette_vault` (Solana account) delegated into a **devnet Private ER**.
- Passkey / Seeker Seed Vault sign-in (secp256r1). No email field anywhere.

### Day 2 — the offline match + the money
- A mock brand posts a stake-backed offer with target traits.
- **Phone locked.** Delegated agent runs the match engine *inside the enclave*: decrypt Palette → compare → emit a match/no-match verdict + signed/attested receipt. Enforce the **query budget** (below).
- On accept: **real devnet USDC payout** + consent receipt committed on-chain (visible in an explorer).
- **Second consumer integration** (2h): a trivial outfit/stylist checker that queries the same Palette with consent — proves "protocol, not app".
- Demo ends: 3 matches, a small real balance, "your face never left this phone."

**Explicitly cut:** try-on rendering, live brand integrations, token, social feed, self-serve brand portal, the full cross-brand demand-aggregation feature.

## Anti-abuse hardening (patch before anyone asks)
Unlimited free querying against a profile that never changes is a real risk. This is the FIRST question a crypto judge asks. Ship a visible defense and say it out loud:
- **Query budget:** N queries per brand per epoch, enforced in the Permission Program.
- **Offer authenticity:** offers must be stake-backed or from a registry; no anonymous free querying.
- **Auditable receipts:** every query logged to her consent record; she sees who asked what.
- **Cross-brand insight = consented, privacy-preserving aggregates computed inside the enclave, never row-level.** This also resolves the "we can't see anything but we own the graph" contradiction, with a minimum-contributor floor before any aggregate is shown.
Framing in the pitch: *"asking is metered and priced, never free or unlimited."* Turns a hard security question into a credibility signal.

## The misread problem (Achilles heel)
Uncalibrated single-selfie undertone on deep skin under arbitrary lighting may be a *physics* problem, not ML. A live misread on a dark-skinned face is self-immolation for this project. Mitigations for the weekend:
- Calibration capture (reference card / white balance) before classification.
- Confirm/adjust human-in-the-loop (she approves her Palette).
- State evaluation against the **Monk Skin Tone scale** as a release gate.
- Do NOT let an uncalibrated classifier free-run live on stage. Frame v0 as "a reading she confirms", not "we fixed beauty AI."

## Money model (for the pitch slide — not built this weekend)
Per-match micropayments fit no brand budget line (media needs reach, CRM needs PII, sampling needs an address — privacy amputates all three). The real money:
1. **Shade-demand intelligence report** — consented aggregate report from the enclave: "X% of your target market has no matching SKU; largest unserved cluster is cool-deep." $5–15k/report. Board-level topic post-Fenty. This is the money slide, not micropayments.
2. **Qualified sampling** (pilot #2; solve address via pickup codes / proxy).
3. **Matched-purchase CPA** (last; needs attribution).
First customer = **indie inclusive-shade D2C brand** (return-rate + shade-extension pain), not a major. Founders hand-run pilot #1 → one case study number.

## Retention model
The Palette is static — a certificate nobody opens weekly. Stickiness comes from applying it to a stream:
- **Point-of-purchase "will this match me?"** — share-sheet / paste-a-link a PDP or a dress; verdict against her sealed Palette. Same engine, pointed at products. This is the weekly hook that makes "she'd use it even without earnings" actually true.
- **Shareable season card** (consented, her choice) — personal-color is a huge TikTok category; zero-CAC growth. She shares the label she's proud of; the data stays sealed.
- **Monthly recheck ritual** — skin drifts with sun/season; "re-scan" is honest monthly cadence. Build the pitch on shopping-moment + monthly, not a weekly-active fantasy.
- **Never:** streaks, points, quests, tokenized anything, an earnings dashboard as the home screen.

## Founder economics (protect the moat)
Invariant: **the match verdict must be incorruptible by money.** Brands can pay to ASK; they can never pay to be the ANSWER (pay-to-rank = ad network with worse economics, moat dead).
- **Take rate on BRAND spend, never on hers** (she keeps 100% of her payout). Like an exchange taxing the trade, never seeing the goods.
- **B2B intelligence + match-engine API** (the neutrality pitch: retailers query a neutral enclave instead of building a post-BIPA face-data honeypot).
- **Consumer premium in money, not data** (one-time pro palette report, ~$15–30 vs the $150 in-person analysis).
- Equity in the protocol company. No token.
- **Poison (never):** selling row/"anonymized" user data, skimming her payout, pay-to-rank, default opt-in, tokenized rewards.

## Judge Q&A prep (rehearse these)
- "Why not just do it on-device?" → the offline-agent-at-scale + brand-verifiable attestation answer.
- "Couldn't repeated free queries reconstruct her profile?" → query budget + stake-gated offers + privacy-preserving aggregates.
- "How is undertone accurate from one selfie?" → calibration + she confirms + Monk-scale gate; v0 honesty.
- "Where's the money?" → shade-demand reports to indies, not micropayments.
- "Isn't this a Sephora feature?" → neutrality: no retailer trusts another's engine; a neutral confidential layer wins.
- "Biometric law?" → on-device, never retained, enclave-attested; one-page BIPA/GDPR posture memo ready.

## Legal / name
- Draft a one-page BIPA (Illinois, per-scan statutory damages) + GDPR special-category posture memo before any brand call.
- **Name LOCKED: Oira** ("OY-ra") — coined from *Iris* (rainbow goddess + the coloured ring of the eye = every hue). Screened clean in beauty (unlike ~40 alternatives). Still run the formal USPTO/EUIPO/WIPO + domain/handle pass before public launch. History in `docs/NAME-DECISION.md`.
