# Why brands choose Oira, the B2B layer, and her night rules

Status note: sections 1–2 are the commercial thesis and are **not yet coded** —
they describe the target model and point at the exact lines that implement
today's placeholder math, so the change is a known, bounded diff when we pick
it up. Section 3 (night rules) **is shipped**, in `app/index.html` (screen 6 +
drawer), as of the 2026-07-11 batch.

## 1. Why a brand pays for this over ad targeting

Three things a brand cannot get from programmatic ad targeting:

- **Zero PII liability.** The brand never touches a face, a shade reading, or
  a raw trait — the match happens inside the enclave and only a settled
  payout reaches the chain. No BIPA/POPIA/GDPR exposure from *this* channel,
  which is a real, avoidable dollar cost (breach liability, DPA overhead,
  biometric-data consent flows) versus buying an audience segment built on
  scraped or inferred traits.
- **A provably-correct match, not a bought impression.** The match is
  verified cryptographically against her real, on-device palette — a "yes"
  means an actual shade fit, not "she was in the retargeting pool." Ad
  targeting can't make that claim; it optimizes for clicks, not fit.
- **A spam ceiling that keeps the channel trusted.** Her on-chain per-brand
  lifetime cap (see §3) means a brand can't grind her attention past what she
  allowed. That scarcity is what keeps her answering brands at all — the
  channel stays worth paying for precisely because it can't be flooded.

**GTM wedge:** indie/DTC beauty brands in-region (the seeded personas already
match this — olive/deep-skin, region-specific shade gaps). Self-serve via the
Brand Studio (`app/brand/index.html`), CPA-style pricing, on-chain escrow so
a brand can never be billed past what they funded.

**Caveat carried over:** the Brand Studio is currently unauthenticated and
spends the deployer's SOL for campaign transactions. It must be gated
(brand auth + brand-funded escrow) before any real brand is let near it —
today it's a devnet demo surface, not a billing surface.

## 2. The fee model (planned, not yet coded)

Directive this must hold under: **she never pays, and never loses a cut of
her payout.** The brand pays for the match; she keeps 100% of what's quoted
to her.

- **Take-rate on brand spend.** Her payout is untouched — if the screen says
  $6, she gets $6. The brand pays payout + a platform fee on top. A 20%
  verified-match fee is defensible against affiliate/CPA industry norms
  (15–30%): brand pays $7.20 for a $6 match, Oira keeps $1.20.
- **Fix the escrow math.** Today `escrowAmt` is a flat `payout + $15` —
  see `client/oira-chain.mjs:126` (`runOffer`) and `:362` (`postCampaign`),
  both computing `perAccept + 15_000_000n`. That $15 is an arbitrary demo
  constant, not tied to anything the brand is actually buying. The fix:
  `escrow = (payout + fee) × maxMatches`, so the locked amount reads as
  "this covers N verified matches" instead of a mystery number. This is also
  what the drawer's "brand locked $X on-chain" line (`app/index.html:725`)
  should reconcile against once it's real.
- **The real margin is the B2B layer, not the take-rate.** Aggregate,
  privacy-preserving demand signals — "olive-undertone deep-skin demand
  up in Lagos" — sold as a dashboard to brands, never individual data. This
  is privacy-clean because it's aggregate-only (no row is ever "her"), and
  it's the actual moat: any competitor can copy a CPA take-rate, nobody else
  has the on-chain, enclave-verified demand signal to aggregate from.

## 3. Her night rules — shipped

What she's actually setting, on-chain, per brand:

- **Payout floor** — the lowest payout she'll accept before her agent will
  even evaluate an offer while she's asleep.
- **Per-brand lifetime cap** — not a monthly budget. Once a brand has asked
  her `maxPerBrand` times, ever, it cannot ask again. This was previously
  mislabeled "3 questions a month," which was simply wrong — the cap is
  lifetime and enforced on-chain, not a recurring monthly allowance.

Screen 6 (`app/index.html`) now exposes both as +/- steppers with honest
copy: *"you set them; the defaults are sensible"* and *"a lifetime cap per
brand, enforced on-chain. After that, they can't ask again."* The old
"questions this month" label is gone everywhere in the app.

These rules are what make the whole channel safe to open at all — she is
never reachable past a bound she chose, and that bound is enforced by the
program, not by Oira's goodwill.
