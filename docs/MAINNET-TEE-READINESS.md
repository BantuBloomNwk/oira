# Mainnet TEE readiness (#13) — MagicBlock Private ER availability

**Verdict: CONFIRMED. The hard dependency is available.** MagicBlock's Private Ephemeral Rollup — the
TEE (Intel TDX) that seals a woman's traits and runs the private match — went **live on Solana mainnet
in March 2026**, on the **same Delegation and Permission programs Oira already uses**. Oira's core
privacy architecture can move to mainnet largely as-is; the remaining unknowns are *commercial and
jurisdictional*, not architectural. Researched 2026-07-23; confirm the details directly with MagicBlock
before committing to a mainnet date.

## What carries over unchanged
- **The TEE validator identity.** MagicBlock's docs list the same TEE validator pubkey
  `MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo` for both mainnet and devnet — which is exactly the
  `TEE_VALIDATOR` constant already pinned in `program/src/lib.rs` and the client. So the program's
  pinned validator likely needs **no change** for mainnet. (Confirm with MagicBlock the doc isn't just
  reusing the example.)
- **The Delegation Program** (`DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`) and **Permission Program
  ACLs** (`eoPoUoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1`) — the same primitives behind `delegate_*` and
  `set_*_privacy`.
- **The auth-token flow** (sign a message → token → connect with `?token=`) and **TDX attestation**
  (verify via Phala PCCS, `https://pccs.phala.network/tdx/certification/v4`) — the same shape as Oira's
  `getAuthToken` / `verifyTeeRpcIntegrity`.

## What changes for mainnet (config, not architecture)
- **Endpoints:** `devnet-tee.magicblock.app` → `mainnet-tee.magicblock.app`, and the base RPC from
  devnet to a mainnet RPC. In the code these are the `TEE_RPC` / `BASE_RPC` constants in the client and
  `oira-chain.mjs` (already env-overridable via `OIRA_TEE_RPC` / `OIRA_BASE_RPC`), plus `netlify.toml`'s
  `connect-src` and `/api` proxy target.
- Deploy the (already-0.16.2-upgraded, security-fixed) program to mainnet under a **multisig upgrade
  authority** (closeout #11) — a prerequisite, tracked separately.
- Real payouts on mainnet turn on the KYC/AML analysis (see `docs/legal/KYC-AML-POSTURE.md`).

## Two real caveats to resolve with MagicBlock BEFORE a mainnet date
1. **Ingress geofencing / OFAC / restricted jurisdictions — the biggest one for us.** The mainnet
   Private ER enforces "node-level IP geofencing, OFAC-sanction list and restricted jurisdictions at
   ingress, before any transaction is accepted or executed." Because Oira is aimed at the **Global
   South**, we must get MagicBlock's **actual restricted-jurisdiction list** and check it against our
   target markets. Standard OFAC (Cuba, Iran, North Korea, Syria, Crimea, etc.) wouldn't hit our main
   markets (e.g. Nigeria, Kenya), but "restricted jurisdictions" may be broader, and IP geofencing can
   catch users on some networks/VPNs. **If a target market is geofenced, the private match won't run
   there** — that's a direct product constraint, not a nice-to-have. Ask them explicitly.
2. **Production terms / pricing / SLA.** The docs say the public TEE validators are "supported for
   development." A production mainnet launch likely needs a commercial arrangement, a dedicated TEE
   validator, or at least a stated SLA — none of which is public. Ask MagicBlock about production
   support, cost (on top of the ER fee-escrow model), rate limits, and uptime guarantees.

## Bottom line for the roadmap
The architecture-existential question — *"can Oira's TEE-sealed private-match model even exist on
mainnet?"* — is **answered yes.** What's left before mainnet is a short, tractable list: confirm the
jurisdiction list (product-defining), agree production terms, do the multisig + KYC/AML work, and flip
the endpoints. None of it requires rethinking the privacy design. That materially de-risks the mainnet
path.

Sources: [MagicBlock institutional-privacy launch (PR Newswire)](https://www.prnewswire.com/news-releases/magicblock-brings-institutional-grade-privacy-to-solana-in-industry-first-302543835.html) ·
[Private ER quickstart (docs)](https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/how-to-guide/quickstart) ·
[MagicBlock validator (GitHub)](https://github.com/magicblock-labs/magicblock-validator/)
