# Verify it yourself

Everything Oira claims about privacy is checkable. This is the developer path: run the match against
devnet and the TEE, and confirm on the public explorer that nothing identifying was ever stored. It
is not the product demo, it is the proof underneath it.

Time: about two minutes once your keypair is funded.

## What you need

- The Solana toolchain and Anchor 1.0.2.
- A devnet keypair with a little SOL for fees (`solana airdrop 2 --url devnet`).
- Node 18+.

## Run the end-to-end proof

```bash
cd client
npm install
OIRA_KEYPAIR=/path/to/funded-devnet-id.json node settle-match-e2e.mjs
```

The run spins up throwaway `her` / `agent` / `brand` actors, mints a small test token, and drives the
whole seal to match to settle flow against the already-deployed program and the MagicBlock TEE. Your
keypair only pays fees.

## What each step proves

| Step | What you see | What it proves |
|---|---|---|
| Seal | her traits delegated into the rollup | the exact reading leaves the base chain and is marked readable only by her agent |
| `match_query` | `ER palette shows verdict MATCH(1)` | the enclave opened the campaign target, read her sealed traits, and decided the verdict itself, the client never supplies the answer |
| Receipt | `receipt == sha256(target_hash \|\| 1 \|\| nonce)` | the payout is bound to the real verdict, not the brand's word |
| Payee commit | `payee_commit == sha256(her_wallet \|\| nonce)` | the brand can only pay the wallet the enclave stamped |
| Leak fix | `verdict wiped`, `nonce wiped` | the verdict and the derived secret are removed from the base account before commit |
| Settle | `her received exactly $5.00 from escrow` | money is released by the match and nothing else |
| Forgery | `wrong-nonce rejected`, `wrong-offer rejected` | a forged proof or a wrong offer is rejected on-chain |

If any assertion fails, the script exits non-zero and prints which one.

## Confirm it on the public chain

The run prints the campaign account address on its last line. Open it on the
[Solana explorer](https://explorer.solana.com/?cluster=devnet) and scroll the account data. You will
find a set of sealed values and a payout, and you will not find her shade, the verdict, or her
wallet. That is the whole point: she was matched and paid, and the public record cannot be read back
into her.

You can also open the program directly:
[`CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP`](https://explorer.solana.com/address/CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP?cluster=devnet).

## Read the design

The full technical walkthrough, including the five privacy fixes and their honest limits, is in
[`ARCHITECTURE.md`](ARCHITECTURE.md). The product story and where this goes is in [`PITCH.md`](PITCH.md).

## Tip

Run it once before you record or present, so the RPC is warm and the run reads clean. To quiet the
retry lines: `node settle-match-e2e.mjs 2>&1 | grep -v "Retrying after"`.
