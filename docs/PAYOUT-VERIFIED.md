# Payout VERIFIED — private USDC (brand → her) inside the TEE enclave

**Status: PASS ✓** on live Solana devnet + the real Intel TDX enclave, 2026-07-04. The "earning" half of the loop: she is paid USDC for a consented match, **privately** — the brand→her transfer runs inside the Private ER, so public base never links her traits to the payment.

## What was proven, live
- A test USDC mint (`EAWvXcLatBic1Vzb31qQtqENAQTPEcX46jruJ7uGXmR`, 6 dp) with the deployer as mint authority.
- Fresh brand (100 oUSDC) + her (0) each run.
- **Base:** init a per-mint vault + **ephemeral ATAs (eATAs)** for brand and her (+ their permissions); deposit brand USDC into the vault, crediting brand's eATA.
- **Delegate** both eATAs (+ permissions) into the TEE validator (`MTEWGuqx…`).
- **Private transfer inside the enclave:** a normal `transferChecked` brand→her, executed on the TEE ER — this is the private payment (never on public base).
- **Settle:** undelegate her eATA (commits her credit to base) → `withdrawSpl` on base → **her real ATA = 5 oUSDC**.

## Mechanism (MagicBlock "Private Payments")
Mirrors `magicblock-labs/private-payments-demo`, adapted from SDK 0.8.5 → **0.15.1**: `deriveVault`, `deriveEphemeralAta`, `initVaultIx`/`initVaultAtaIx`, `initEphemeralAtaIx` + `createEataPermissionIx`, `transferToVaultIx`, `delegateEphemeralAtaIx` + `delegateEataPermissionIx` (0.15.1 dropped the bump arg), in-ER `transferChecked`, then `undelegateIx` + `withdrawSplIx`. Reuses the same TEE endpoint/validator as the match spike, so the payout happens in the same enclave.

## Reproduce
```bash
cd /home/dee/Oira/client && node payout-e2e.mjs   # fresh brand/her, mints from the deployer
```

## Both make-or-break on-chain pieces are now green
1. Offline-agent match in the enclave + privacy + query budget — `docs/PER-SPIKE-VERIFIED.md`
2. Private USDC payout brand→her in the enclave — this doc

Remaining Blitz build: second-consumer integration (proves the primitive), the on-device reading front-end (calibration + she-confirms), and the demo cut.
