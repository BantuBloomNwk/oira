# Spike (a) VERIFIED — offline-agent match inside a MagicBlock Private ER

**Status: PASS ✓** on live Solana devnet + the real Intel TDX enclave (MagicBlock ER core 4.0.0), re-verified fresh on 2026-07-04. This is the make-or-break de-risk for Oira: it proves MagicBlock's Private ER is *load-bearing*, not decorative.

## What was proven, live
- Program `oira-palette` = **`CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP`** (devnet), 314 KB.
- `init_palette` → the base account holds only a **96-byte encrypted blob**; traits never appear in plaintext or in any world-readable form, at any point.
- `delegate_palette` → the **TDX TEE validator** (`MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo`); base owner flips to the delegation program.
- `set_palette_privacy` → the enclave creates the **EphemeralPermission** (101 B, owned by the Permission Program `ACLseo…`), sealing the Palette private and whitelisting **only the agent** as reader.
- **8 × `match_query` signed by the AGENT session key while the owner key was absent** — the offline match runs inside the enclave; the owner never signs a match.
- The **9th `match_query` is rejected on-chain**: `Custom(6004) = QueryBudgetExceeded` — the on-chain query budget is enforced.
- During the matches the **base account stays frozen** (`query_count = 0`); after `undelegate_palette` the committed receipt shows `query_count = 8, is_private = true`, blob still 96 B.

## The one real fix (ER rules changed since an earlier proof)
An earlier internal PER build was proven ~55 days before this one; MagicBlock's ER fee/rent rules changed in between. On core 4.0.0 the ephemeral-permission **rent must be paid by an ER-modifiable (delegated) account**, not the transaction fee payer — otherwise the tx fails with `InvalidAccountForFee` / "Feepayer was modified without being delegated". Fix: in `set_palette_privacy`, the `CreateEphemeralPermissionCpi.payer` is the **delegated Palette PDA itself** (signs via its seeds), pre-funded with a little lamport slack. See `program/src/lib.rs`. (This is exactly why we re-verify rather than trust an old "proven".)

## Reproduce
```bash
cd client && node e2e/per-palette-e2e.mjs   # each run uses a fresh owner/agent
```
Requires: devnet SOL in `keys/oira-deployer.json`; SDK `@magicblock-labs/ephemeral-rollups-sdk@0.15.1`; build with solana 3.1.10 (NOT 1.54).

## Reference run
Palette PDA `64f4S8rdRek7FhDG8uxW9edpohMKRRnjaGhrTYem23GN` — https://explorer.solana.com/address/64f4S8rdRek7FhDG8uxW9edpohMKRRnjaGhrTYem23GN?cluster=devnet

## Next (build, not spike)
On-device reading (calibration + she-confirms), real private USDC payout (Private Payments API), the second consumer integration (proves the primitive), and the demo cut ending on "your face never left this phone."
