# Spike (a): the offline-agent match inside a MagicBlock Private ER

Goal: kill the #1 risk before building anything else — prove that a **delegated Palette account can be matched against a brand offer inside the Intel TDX enclave by a session-key agent while the owner is offline**, with the base layer seeing only a receipt, not the traits. If this works, the demo has a spine and MagicBlock is load-bearing (not decorative). If it doesn't, we learn in a day.

## Why we're already de-risked
The identical mechanism — private state in a TDX enclave, scored inside the enclave, only the receipt committed to base, with TEE attestation — has already been proven end-to-end on Solana devnet in an earlier internal build. Oira reuses that pattern. **Per our own rule, we still re-verify with a fresh Oira run — we do not relay a prior result as proof for Oira.**

## Reusable, proven facts (from prior internal work)
- SDK: `ephemeral-rollups-sdk = 0.15.1`, features `["anchor", "access-control"]`; `anchor-lang = 1.0.2`.
- Delegation program: `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`.
- Permission (ACL) program: `ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1`.
- TEE validator (devnet): `https://devnet-tee.magicblock.app`; attest via `verifyTeeRpcIntegrity(...)`.
- **Build toolchain trap:** build with **solana 3.1.10 (platform-tools v1.52, rustc 1.89)** `cargo-build-sbf`. v1.54 (4.1.0-beta) emits bytecode the devnet loader faults on. This cost real time on the earlier build — do not repeat it.
- Privacy CPI shape (copy this): `CreateEphemeralPermissionCpi { permissioned_account, permission, payer, vault, magic_program, permission_program, args: EphemeralMembersArgs { is_private, members } }` where `members = vec![Member { flags: TX_LOGS_FLAG|TX_BALANCES_FLAG|TX_MESSAGE_FLAG, pubkey: <reader> }]`.

## The map (prior build → Oira)
| Prior pattern | Oira (this spike) |
|---|---|
| a scored-account PDA | `PaletteVault` PDA: `owner`, `enc_traits` (encrypted blob), `query_count`, `epoch`, `finalized`, `is_private` |
| init instruction | `init_palette(owner, enc_traits)` |
| delegate instruction | `delegate_palette` → delegate into the **TEE** validator |
| set-privacy instruction | `set_palette_privacy(reader = match-engine/agent key)` — mark private, whitelist reader |
| score instruction (in ER) | `match_query(offer_traits, epoch)` — runs **in the TEE**: compare vs `enc_traits`, emit a verdict + receipt, `query_count += 1`, enforce budget |
| commit/undelegate instruction | `commit_receipt` / `undelegate_palette` — only the receipt (verdict + signature) hits base |

## New parts Oira adds (the parts that matter for the pitch)
1. **Query budget** enforced in `match_query`: `require!(query_count < CAP_PER_BRAND_EPOCH)`. Anti-abuse rate limiting, enforced on-chain.
2. **Session-key agent**: the offline path. A scoped session key (least-privilege: only `match_query`) signs the match while the owner's device is offline. Prove the owner's main key is NOT a signer on the match tx.
3. **Attested receipt**: the base-layer receipt carries the TEE attestation, so the brand can verify the answer came from the enclave, not a server.

## Spike steps (devnet)
1. Scaffold `program/` (done). Build with the 3.1.10 toolchain. Deploy to devnet.
2. `init_palette` on base with a dummy encrypted trait blob. Confirm public state shows only the blob (opaque), never plaintext traits.
3. `delegate_palette` to the TEE validator. Confirm base owner flips to `DELeGG...`.
4. `set_palette_privacy(reader = agent session key)`. Confirm the ACL CPI succeeds on the TEE ER.
5. **Offline match:** with the owner key absent, a session key calls `match_query` in the TEE. Confirm: (a) it returns a verdict, (b) `query_count` increments, (c) base stays frozen / traits never world-readable, (d) budget rejects the N+1th query.
6. `commit_receipt`: only the verdict + attested signature lands on base, verifiable in an explorer.
7. Fetch + verify the TEE attestation quote for the run.

## Success criteria (all must hold)
- Traits never appear in any world-readable account or tx log at any point.
- The match runs and commits with the owner key offline (session key only).
- The query budget rejects over-querying on-chain.
- The committed receipt is explorer-verifiable and attestation checks out.

## Then, and only then
Wire the on-device reading (calibration + confirm) and the real devnet USDC payout (MagicBlock Private Payments API, mainnet since Mar 2026). Build the second consumer integration last (proves "protocol, not app").
