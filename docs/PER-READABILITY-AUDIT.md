# PER on-chain readability audit

**What this proves:** on Oira, a woman's palette is *provably private*. Anyone (including a hackathon
judge) can read the public Solana base layer and confirm a seal, a match, and a payout happened,
while her actual traits, her salt, and her per-query verdict are never readable there. This is the
Model B privacy claim, re-verified **live on devnet** rather than asserted from the source.

Reproduce it yourself: `cd client && node e2e/per-audit.mjs` (read-only; hits public devnet RPC).

Program: `CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP` (Solana devnet).
Last run: 2026-07-07.

## The readability matrix

| Data | Where it lives | Who can read it |
|---|---|---|
| A sealed palette exists (owner, ciphertext blob, commitment hash, query counters) | Base layer `PaletteVault` PDA | **Anyone** |
| Brand offer + escrow (target shade, payout, budget) | Base layer `Campaign`/escrow PDA | **Anyone** (it is the brand's own product shade, not her secret) |
| A match/settle happened, a payout landed | Base layer tx + hashed receipt `keccak(offer_hash‖verdict‖nonce)` | **Anyone** (the hash, not the verdict) |
| Her bucketed traits (undertone / depth / season) | `TraitsSession`, delegated into the Private ER (Intel TDX) | **Only her agent** (whitelist-gated in-enclave) |
| Her salt, her per-query verdict + nonce | In-enclave / hashed | **No one** on base |

## What the live run confirmed

1. **Program deployed and executable** on devnet.

2. **The public palette account is opaque.** A current-format `PaletteVault` decodes to: 96 bytes of
   ciphertext (`enc_traits`, an encrypted recovery blob that is never the match input), a 256-bit
   commitment hash (e.g. `338275c7…2590ee` = `keccak(salt‖traits)`), query counters, and
   `is_private = true`. **The struct has no undertone / depth / season / salt field at all.** Her
   traits are absent from the public account by construction, not by obfuscation.

3. **No plaintext traits on base.** `TraitsSession` (the account that *does* hold her bucketed traits
   and her salt) is delegated into the Private ER. The audit found **zero** `TraitsSession` accounts
   still owned by the program on base. A delegated account is owned by the delegation program, so this
   is conclusive: every traits PDA that exists is delegated, and none exposes plaintext on base.
   `PLAINTEXT-EXPOSED: 0`.

4. **The commitment is preimage-hard.** The root is a 256-bit hash and the salt never leaves the
   enclave, so the public commitment cannot be brute-forced back to her trait buckets.

5. **The verdict never lands in the clear.** `match_query` computes the verdict inside the enclave;
   only `keccak(offer_hash‖verdict‖nonce)` reaches base on settle. A hard per-epoch query budget
   rate-limits repeated asking.

## Caveats (stated honestly)

- **Legacy spike accounts.** The program was upgraded during development. Of 8 sealed palettes on
  devnet, 2 are current-format and 6 are older spike seals with a different byte layout. The privacy
  claim is unaffected (no version exposes trait fields), but a raw decoder must select current-format
  accounts, which the audit script does by sanity-checking the counters.
- **Operator ER commits.** The Private ER operator may periodically commit ER state to base. This is
  exactly why traits are **bucketed** (coarse categories, not a biometric vector): a commit would
  leak a category at worst, never a raw reading. Verified in Spikes A/B (`docs/SPIKE-A-*`, `SPIKE-B-*`).
- **Receipts.** Settle receipts are hashed on base; the payout itself is verifiable
  (`docs/PAYOUT-VERIFIED.md`, `docs/OFFER-BOARD-VERIFIED.md`). Verdict privacy rests on the palette
  staying delegated during matching, so its live verdict field is in-enclave, not on base.

## Verdict

**PASS.** No plaintext traits or salt are readable on the public base layer; the public palette
account is opaque; matches and payouts remain publicly verifiable through hashed receipts. Model B
holds live on devnet.
