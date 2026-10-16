# Phase 1 — real in-enclave match VERIFIED (devnet)

The load-bearing gap is closed: the enclave now COMPUTES the match from her sealed,
commitment-bound traits. The client no longer supplies `matched`.

## What changed (program)
- New **TraitsSession** account: bucketed traits (undertone 0-3, Monk depth 1-10, season 0-11),
  delegated into the Private ER, whitelisted to the agent, NEVER committed to base.
- **`set_traits`** runs in-enclave and BINDS the sealed traits to `sha256(salt‖traits)` — the
  commitment root the phone published at `init_palette`. Substituted traits are rejected.
- **`match_query`** reads TraitsSession in-enclave and computes the verdict (bucket distance +
  her night rules); removed the `matched: bool` client input.
- Base receipts are HASHED: `last_receipt = sha256(offer_hash‖verdict‖nonce)` — public base
  cannot reconstruct her palette from receipts (fixes Fable Attack 2).

## Live proof (`client/e2e/match-real-e2e.mjs`, PASS)
- commitment binding: wrong-traits `set_traits` rejected in-enclave (BindingMismatch)
- read gating: outsider RPC read of traits -> null (Spike A confirmed)
- real match: matching offer -> MATCH(1); mismatched undertone -> no-match(0); client passed no answer
- receipt on base equals sha256(offer‖verdict‖nonce)
- budget: query_count reached 8, 9th rejected (QueryBudgetExceeded)
- reference palette 8DhBFkg3XVbzLK5GvM8DePdTGyfXgiS8sfZNPRYgbT2c

## Reproduce
    cd client && node e2e/match-real-e2e.mjs

## Notes
- Program upgraded on devnet (extended +70000 for the larger .so, 483,672 B).
- Hashing on-chain via `solana-sha256-hasher` (SHA-256, native Node interop).
- Stale harnesses (night-rules/per-palette/second-consumer) use the OLD init/match signatures
  and must be updated or retired before the final commit.
