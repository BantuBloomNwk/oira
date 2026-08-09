# Oira

**A private attribute vault on Solana. Brands can find out whether you match what they are looking for, and pay you for it, without ever learning who you are, what you look like, or that a match happened.**

Oira runs the sensitive part of that exchange inside a MagicBlock Private Ephemeral Rollup (a TEE), and settles the money on Solana. Your traits never leave the enclave. What lands on the base chain is a set of commitments and a payout, nothing that can be read back into you.

- **Program (devnet):** [`CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP`](https://explorer.solana.com/address/CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP?cluster=devnet)
- **IDL:** [`idl/oira_palette.json`](idl/oira_palette.json)
- **End-to-end proof:** [`client/settle-match-e2e.mjs`](client/settle-match-e2e.mjs)
- **Verify it yourself:** [`docs/VERIFY.md`](docs/VERIFY.md) — run the match and check the empty chain
- **See our vision:** [`docs/PITCH.md`](docs/PITCH.md) — why this matters and where it goes

## Try it

- **The app:** [app.myoira.com](https://app.myoira.com) — take a reading, seal it, then run the
  overnight flow. On the "While you sleep" screen the app reads your palette account's owner live
  off devnet and shows you it belongs to MagicBlock's Delegation Program rather than to us. That
  row is a live ledger read, not a label, so the enclave dependency is something you can check
  rather than something we claim.
- **The site:** [myoira.com](https://myoira.com)

## What is new since we last showed this

Judges called Oira a frontrunner last time and it did not win. This is what we did with that.

- **Her skin, over time.** A one tap skin log and a private trend view. Her colour season is
  stable by design; her skin is not. None of it leaves the device.
- **The enclave made visible.** The dependency used to live only in docs and CLI scripts. It is
  now in the product, verified against the ledger while she watches.
- **Liveness at scan time.** An active head turn challenge gates sealing, so a photograph of a
  photograph cannot mint a Palette.
- **A Sybil hole closed.** A leftover path could mint free unauthenticated Palettes, and a
  fallback could fabricate a perfect match identity and drain a campaign's escrow. Both shut,
  with creation limits behind them.
- **Patched before it bit us.** MagicBlock disclosed a flaw in the `#[ephemeral]` macro that cost
  another team 98k USDC. We upgraded the SDK and redeployed in place the same week, then
  re-verified the whole suite against the upgraded program.
- **Recovery that exists.** An export and import recovery key for the one custody path that had
  no automatic recovery, and she cannot seal until she has saved it.

## Why we built it

The things that make you a good match are often the things you would rather not broadcast. Our first user is a woman choosing makeup: her undertone, her depth, her colour season decide what actually suits her, and none of it is anyone's business. A brand would pay real money to reach exactly the people its shade fits. She would take that money if it did not mean handing her face to a database.

You can hide any one answer with cryptography. The harder problem is that these attributes never change, so a match protocol has to stay safe not just for one question, but for every question asked over time, from every brand that ever asks. So the interesting problem was never a single private match. It was making a private match safe to repeat.

## What is live right now

The program is deployed on devnet and the full flow is proven end to end. A brand escrows funds, her traits are sealed inside the enclave, her agent runs the match in the TEE, and the payout on the base chain is released only by the real verdict. From the recorded run:

```
✓ the match runs inside the enclave and returns a verdict
✓ campaign receipt      == sha256(target_hash || 1 || nonce)
✓ campaign payee_commit == sha256(her_wallet  || nonce)
✓ the verdict is wiped from the base chain before commit   (never leaks)
✓ the derived nonce is wiped from the base chain            (never leaks)
✓ she is paid exactly $5.00, released by the match and nothing else
✓ a forged nonce is rejected on-chain   (ReceiptMismatch)
✓ a wrong offer is rejected on-chain    (OfferMismatch)
```

The brand cannot self-assert an acceptance, cannot pay a wallet the enclave did not stamp, and never learns her shade or her verdict.

## How it works

Three accounts and one honest rule: nothing that could identify her is allowed onto the base chain.

- Her **traits** are delegated into the Private Ephemeral Rollup, marked readable only by her agent, and never brought back out.
- A brand's **campaign** carries only a hash of the shade it wants, plus its escrow.
- Her **vault** carries a commitment to her traits, her query budgets, and the id of the one agent allowed to spend them.

The match itself, `match_query`, runs inside the enclave. It opens the campaign's committed target, reads her sealed traits, and computes the verdict itself, so the client supplies the offer and never the answer. It writes back a receipt that hides the verdict and a commitment to her payout wallet. Settlement on the base chain only pays out if that receipt verifies. Repeated queries are rate-limited and priced, so asking is never free and never unlimited.

The full walkthrough, including the five privacy fixes and their honest limits, is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## On Solana Mobile Seeker

Oira is being built for the Seeker, and the fit is not cosmetic. The protocol already runs its sensitive computation inside a server-side TEE. The Seeker adds a second, hardware root of trust on the device, and the two close the loop.

- **Her keys live in Seed Vault.** Her owner key and the agent session key sit in the Seeker's secure element. The key that opens her payee commitment, the one that finally links a wallet to a payout, never touches app memory. Approving a payout is a Seed Vault signature, not a hot key in a browser.
- **The agent is a scoped session key, which is exactly what Seed Vault is for.** Oira already limits the agent to a single instruction, `match_query`, so a stolen agent key can do nothing but ask about one escrowed campaign. Provisioning and revoking that scoped key through Seed Vault turns least privilege from a convention into a hardware guarantee, and it lets her stay offline while the agent runs.
- **Two enclaves, one story.** Her traits are protected by the rollup's TEE. Her keys are protected by the phone's secure element. At no point, on the device or on the server, does anything that identifies her exist in plaintext outside a TEE.

This is the device integration we are building toward. The on-chain protocol and the enclave match are live today. The Seed Vault signing path is the next piece, and it slots into the existing agent-session-key model without any change to the program.

## Run it yourself

You need the Solana toolchain, Anchor 1.0.2, and a funded devnet keypair.

```bash
# 1. build the program
cd program
cargo-build-sbf              # or: anchor build

# 2. deploy to devnet (or point the client at the already-deployed program above)
solana program deploy target/deploy/oira_palette.so \
  --program-id <your program keypair> --url devnet

# 3. run the end-to-end proof
cd ../client
npm install
OIRA_KEYPAIR=/path/to/funded-devnet-id.json node settle-match-e2e.mjs
```

The client mints a small test token, spins up throwaway her / agent / brand actors, runs the whole seal → match → settle flow against the TEE endpoint, and checks every assertion above. Your funded keypair only pays the fees. For a step-by-step account of what each line proves and how to confirm the empty chain on the explorer, see [`docs/VERIFY.md`](docs/VERIFY.md).

## Repository layout

```
program/            the on-chain program (Rust, Anchor + ephemeral-rollups-sdk)
  src/lib.rs        the whole thing: vault, traits, campaigns, match, settle
idl/                generated IDL for the deployed program
client/             the end-to-end proof against devnet + the TEE
docs/ARCHITECTURE.md  the technical walkthrough
docs/VERIFY.md        prove the private match yourself against devnet
docs/PITCH.md         the product story and where this goes
```

## Tech

- **Solana** for settlement and the public commitment layer.
- **MagicBlock Ephemeral Rollups** for the delegated execution, and **Private Ephemeral Rollups (Intel TDX)** for the enclave where her traits and the match live.
- **Anchor 1.0.2** and **anchor-spl** for the program and the token escrow.
- **`@solana/web3.js`** and the **ephemeral-rollups SDK** on the client.

## Status

- Deployed and verified end to end on devnet.
- The privacy boundary, the metered budgets, and the match-bound settlement all pass on-chain.
- Next up is a brand-facing surface and a concierge that helps a person set her own rules. Those are product, the protocol underneath is done.

## A note on the name

Oira is a private palette protocol, built by BantuBloom Network in partnership with Aurora K. The first product is beauty and colour, but the mechanism is not specific to it. It fits anywhere a person is matched on something sensitive and wants a verifiable, bounded limit on what the asking reveals.

## License

MIT, see [LICENSE](LICENSE). The MIT grant covers the source only and does not grant any patent license. Patent applications on the underlying method are in preparation and those rights are reserved.
