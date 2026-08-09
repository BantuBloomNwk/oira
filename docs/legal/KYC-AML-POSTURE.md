# Oira — KYC / AML posture

> **DRAFT — internal analysis, not legal advice. Confirm with counsel (and a licensed compliance
> advisor) before you rely on it, and before mainnet / real-money features.** Last drafted:
> 2026-07-23. This is a *posture note* for the founder, not a public policy.

## Who / where (relevant to which regimes apply)

Oira is a partnership between **BantuBloom Network** (founders in Malaysia and the US; not yet
incorporated) and **Aurora K** (US-registered). Because a US entity and US-based founders are involved,
US federal AML/money-transmission rules (FinCEN) and any relevant state money-transmitter rules are the
first regimes to check the moment real value moves; a Malaysia nexus (BNM) and the Global-South launch
markets add their own. This mix is exactly why the mainnet/real-payment analysis has to be done
per-jurisdiction with local advisors, not from a single template.

## Current stance (as of this draft): no KYC/AML obligations triggered — but by circumstance, not design

Oira today does **not** appear to trigger Know-Your-Customer (KYC) or Anti-Money-Laundering (AML)
obligations, for concrete reasons:

1. **Test network only.** Oira runs on Solana **devnet**. The tokens (including brand "payouts" and
   the "oUSDC" test mint) have **no real monetary value** and are not exchangeable for fiat. There is
   no "transaction" of value to launder.
2. **Non-custodial.** Oira never holds a user's secret key or her funds. Her key is created and used
   on her device; the bridge relays and sponsors network fees but cannot move her assets. We are not
   a custodian.
3. **No fiat on/off-ramp.** There is no way to put real money in or take real money out through Oira.
   No card processing, no bank rails, no exchange.
4. **No money transmission.** Value isn't transmitted between users for us; brand offers settle
   on-chain against a user's own wallet in test tokens.

In most regimes, KYC/AML/CTF obligations attach to **money services businesses, virtual-asset service
providers (VASPs), custodians, exchanges, or fiat on/off-ramps** handling **real value**. Oira is
currently none of those. So the honest current answer is: **not applicable yet.**

## What flips this — the triggers to watch (get advice BEFORE any of these ship)

Reassess the moment Oira moves toward real value. Likely triggers:

- **Mainnet with real tokens / real payouts.** Brand payouts in a real stablecoin to real users is the
  big one. Even non-custodial, some jurisdictions regulate the *facilitation* of value transfer or
  treat a real-payout marketplace as a regulated activity.
- **Any fiat on/off-ramp** (letting her buy in or cash out real money) — this almost always pulls in
  KYC/AML and money-transmitter/VASP licensing.
- **Custody** — if Oira ever holds keys or funds on a user's behalf.
- **A provider/consultation marketplace with real payments** (the health-navigator direction) — real
  cross-border stablecoin payments to providers likely implicate money-transmission and possibly
  healthcare-payment rules on top.
- **Sanctions/geoblocking** — real-value transfer means screening against sanctions lists and possibly
  geoblocking certain jurisdictions.
- **Local law where you launch.** Emerging-market launch (e.g. Nigeria) brings its own VASP / digital-
  asset / data rules (e.g. SEC Nigeria digital-asset rules, CBN guidance, NDPC data rules) — these
  need a local advisor, not a generic template.

## Practical recommendation
- **Now (devnet/beta):** state clearly in the Terms and Privacy Policy that Oira is devnet/beta, tokens
  have no monetary value, and it is non-custodial — which is already drafted. Keep it that way while
  it's a demo.
- **Before mainnet / real payouts:** commission a proper KYC/AML + licensing analysis for **each launch
  market**, decide custody model, and design the compliance program (screening, thresholds, record-
  keeping, reporting) into the product from the start — not bolted on.
- **Before the provider/consultation layer:** treat that as a separate, higher-bar analysis (payments
  + healthcare + cross-border) — tracked separately in internal planning notes.

## One-line summary for a pitch/data room
"Oira is a non-custodial, devnet beta with no fiat rails and no real-value transfer, so no KYC/AML
obligations are triggered today; a full compliance analysis is scoped for the mainnet / real-payment
transition, per market."
