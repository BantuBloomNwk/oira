# Model B: production privacy hardening (VERIFIED devnet 2026-07-06)

`match_query` only ever returns a match/no-match verdict, and her underlying traits never change, so a lifetime cap alone (the old value of 64) was not enough protection against a determined, patient requester. Model B replaces it with a layered, harder-to-evade budget design.

## The design

- Her **Palette + Traits are delegated into the Private ER once and NEVER leave the enclave.** Only the brand's campaign travels to/from base.
- Each brand **commits its target shade publicly** in the campaign (`target_undertone/depth/season/depth_tol`) and **escrows** at `create_campaign`, then **co-delegates the campaign into her ER**.
- The offline **agent runs `match_query` with NO target**: it can only ask "does she match *this* committed, escrowed offer?". The enclave reads her sealed traits + the campaign target and computes the verdict itself.
- The **verdict + a trait-derived nonce stay PRIVATE in her Palette** (agent-whitelisted read). Only an **opaque receipt** `sha256(target_hash‖verdict‖nonce)` and, **on a match only**: her **payee** are written onto the campaign and undelegated to base for `settle_offer`.

## Defense stack (all proven live in `client/e2e/model-b-e2e.mjs`)

| Layer | Property | How |
|---|---|---|
| **L1** | Idempotency | `campaign.answered` short-circuits a repeat query to a free no-op → her meter counts DISTINCT offers, not re-checks. |
| **L2** | Bound query | The agent supplies no target; it can only query a committed, escrowed campaign. A stolen agent key cannot sweep her trait space. A mismatched-shade campaign returns no-match. |
| **L3** | Escrow floor | `create_campaign` requires `escrow >= per_accept_payout` and `> 0` `per_query_cost`; every distinct probe is a real escrowed, public, rent-paying campaign → mass collection costs money and is Sybil-visible. |
| **L4** | Her-set caps | `lifetime_cap` / `epoch_cap` are per-palette fields she sets via `set_night_rules` (0 => protocol default). The (cap+1)th distinct offer is rejected in-enclave (`LifetimeBudgetExceeded`). |
| **L5** | Hidden no-match | The verdict never reaches base in cleartext; the committed receipt is opaque without the private nonce, and a no-match commits `payee = 0` (no wallet link). A brand that paid learns the verdict only via the nonce the agent discloses on an accept. |
| n/a | Settlement bound to match | `settle_offer` pays her only when `sha256(target_hash‖1‖nonce) == campaign.receipt` and `campaign.payee == her_token.owner`. Forged nonce → `ReceiptMismatch`; wrong offer → `OfferMismatch`. |

Program `CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP` (devnet). Reproduce: `cd client && node e2e/model-b-e2e.mjs`.

## CSO sweep (2026-07-06): semgrep clean + 3 latent bugs fixed

semgrep `--config auto`: **203 rules, 0 findings**; no secrets/keys tracked (`.gitignore` covers keys/target/.env). Manual review of the Solana auth semantics (which semgrep does not model) found and **fixed** three issues in this build:

- **H: budget-exhaustion grief.** `match_query` accepted any signer, so an attacker could burn her never-resetting lifetime meter with throwaway campaigns and permanently kill her matchability. Fixed: her agent is stored on the Palette at privacy seal and `match_query` requires `agent == palette.agent` (`UnauthorizedAgent`). Proven: an outsider query is rejected.
- **M: double-settle.** `settle_offer` could be called repeatedly on one matched campaign, draining escrow. Fixed: `require!(accepts == 0)` (`AlreadySettled`). Proven: a second valid settle is rejected.
- **M: overflow-checks off.** Added `[profile.release] overflow-checks = true` and made the settle escrow-sum saturating.

Two more residuals are also now **CLOSED**:
- **Nonce entropy**: the nonce folds in her 256-bit commitment `salt` (stored private in `TraitsSession`, never leaving the enclave; its hash the public root is preimage-hard), so the receipt is unforgeable independent of her underlying trait values.
- **Forfeited query-stake sweep**: `close_campaign` now routes `campaign.spent` (the per-query stakes) to a protocol `TREASURY` (take-rate on brand spend, never hers) and refunds the brand only the unspent escrow, so queries actually cost money (L3 economic teeth). Proven in `model-b-e2e.mjs` ([L3$]). DEVNET treasury = deployer; mainnet = governance multisig (const `TREASURY` in `lib.rs`).

## App bridge

`client/oira-chain.mjs` (`sealPalette` + `runOffer`) and `client/server.mjs` (`/api/seal`, `/api/campaign`, `/api/payout`) are wired to the deployed Model B flow (commit root → campaign target shade + escrow → co-delegate → agent-gated `match_query` → undelegate → receipt/nonce settle). `app/index.html` sends her confirmed bucketed traits at seal and reflects the real enclave verdict/payout. Verified end-to-end: seal → overnight offer → matched, her paid $5 from escrow.

**Per-brand distinct cap** is also now **CLOSED**: her Palette carries a bounded 8-slot `(brand → distinct-offer count)` table; `max_q_per_brand` is the per-brand distinct cap. A brand's `(cap+1)`th distinct offer is rejected in-enclave (`PerBrandCapExceeded`) while a different brand gets its own slot; on a full table a new brand evicts the smallest-count slot, which never bypasses the hard `lifetime_cap` ceiling (it only approximates per-brand once >8 brands are active). Proven in `client/e2e/perbrand-e2e.mjs`.

## Known residuals (honest mainnet backlog: NOT yet closed)

1. **Match-time wallet linkability (post-Blitz).** On a match, `campaign.payee = her pubkey` is committed to base so she can be paid, linking "campaign Y matched wallet X". No-match leaks no link. Full unlinkability (stealth / one-time payee, payout routing) is real cryptographic design work and is the one remaining residual, documented as a known limitation for the Blitz submission.

## Superseded harnesses

`model-b-e2e.mjs` is the canonical proof. Pre-Model-B harnesses (`match-real-e2e`, `settle-match-e2e`, `night-rules-e2e`, `campaign-e2e`, `per-palette-e2e` matchIx, `spike-campaign-deleg`) target the old `match_query`/`settle` signatures and no longer run against the deployed program.
