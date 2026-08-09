# Offer_board — brand-side marketplace VERIFIED (devnet)

The public, stake-gated money rail that sits under the private enclave match. A brand
funds a campaign (escrows oUSDC up front); every answered offer consumes a query stake
(match **or** decline, so free questions cannot exist); an **accepted** match pays her
from escrow; close returns the unspent remainder to the brand.

Program `oira-palette` `CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP` (devnet). Upgrade
deployed 2026-07-05 (had to `solana program extend … 110000` first — the escrow code
grew the `.so` to 427,368 B). Instructions added: `create_campaign`, `settle_offer`,
`close_campaign` + `Campaign` account + per-campaign escrow token account (PDA authority).

## Live run (harness `client/campaign-e2e.mjs`)

```
create_campaign  escrow $20.00, stake $0.10/query, payout $5.00/accept
                 brand oUSDC $100 → $80, escrow holds $20
settle(accept)   her oUSDC 0 → $5.00 (paid from escrow, campaign PDA signs)
settle(decline)  her oUSDC unchanged; only the $0.10 stake consumed
campaign state   queries: 2, accepts: 1, spent: $0.20, paid: $5.00
close_campaign   refunded $15.00 to brand, escrow account closed
RESULT           PASS ✓
```

Explorer (this run):
- create_campaign `4yEWAMpk48sRYnm5Zt67xC8M9dAXsLKfiAUqqugnJfTyScpo7uuk9kCdcskFLoe8FMh44yyV7vU2Cay32P5g5xtn`
- settle(accept)  `ZDQivusPdFudrnRBwcWpUMzoAcTPZ7YqodRDZvMJoz3ZFzP2Q5id8nxUgQdK5toiMhkA5xtCfQ2dSaHqpAsSCch`
- settle(decline) `2UJSkWvB8f67UMRn8n52rxyvFjzQFWpHCM6Qae34YV1G4m2aZys7taC6LhN217xqUeQjZNqgPkjuYGPCc6PEQegV`
- close_campaign  `7MfbSz3ZA5NXRubfd4jtyi69SX6bXPwHJjX7SdAhxXoCY7oUoL7X9XwHzmuJhpRSoY6tR6iXXptGcYsZjuvG12f`
- campaign account `7uLgij6Pgq32GtHwyzcXjshKjdK11Z48SvrNt2LRUQ1f`

## Reproduce

```
cd client && node campaign-e2e.mjs
```

## Security

semgrep 0 findings on `lib.rs` + `campaign-e2e.mjs`; cargo-audit / npm-audit only the
known MagicBlock-SDK transitive warnings (do NOT autofix — downgrades the SDK / web3.js
and breaks the PER path). See `scratchpad/sec.log`.
