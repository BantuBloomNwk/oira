# How Oira works

This is the technical walkthrough. If you just want to run it, the README has the commands.

## The problem in one paragraph

Some of the most useful things about a person are the things they cannot safely reveal. Think of a woman's skin undertone, depth, and colour season: the attributes that decide what genuinely suits her. Brands would pay to reach exactly the people their product fits, and she would happily be matched if it did not mean handing her attributes to every brand that asks. Cryptography can hide any single answer. The harder problem is that her attributes never change, so a match protocol has to stay safe not just once, but every time any brand asks. Oira is built around that harder problem.

## The actors

- **Her.** The owner of a Palette. She is usually offline.
- **Her agent.** A session key she whitelists to run matches on her behalf inside the enclave. Least privilege: it can do one thing, and only one thing.
- **The brand.** Funds a campaign with an escrow and, later, settles a match.

## The accounts

- `PaletteVault` (PDA, seeds `["palette", owner]`). Her public-facing vault. Holds a commitment to her traits, her query budgets, her standing rules, and the id of the one agent allowed to spend her budget. It never holds her plaintext traits.
- `TraitsSession` (PDA, seeds `["traits", owner]`). Her bucketed traits. This account is delegated into the Private Ephemeral Rollup, marked private so only her agent can read it, and never undelegated. Her traits live only inside the enclave.
- `Campaign` (PDA, seeds `["campaign", brand, offer_id]`). A brand's offer. Holds a commitment to the target shade, the escrow accounting, and, after a match, a hashed receipt and a payee commitment.

## The privacy boundary

Everything that would leak her runs inside a MagicBlock Private Ephemeral Rollup, which executes in an Intel TDX trusted execution environment. The base chain (Solana devnet) only ever sees commitments and aggregates. Concretely:

| Stays inside the enclave | Reaches the base chain |
|---|---|
| her plaintext traits | a commitment to her traits |
| the brand's plaintext target shade | a hash of the target |
| the match verdict | a receipt hash that hides the verdict |
| her payout wallet | a commitment to her wallet, opened only if she settles |

## The match, step by step

1. **She seals her traits, bound to a commitment.** At setup her phone publishes `commitment_root = sha256(salt || traits)`. Later, inside the enclave, `set_traits` recomputes that hash from the traits it is given and rejects anything that does not equal the published root. Neither her agent nor the server can slip in different traits.

2. **The brand commits its target.** `create_campaign` stores only `target_hash = sha256(offer_salt || shade)` and escrows its budget. The plaintext shade never touches the base chain.

3. **The agent runs the match inside the enclave.** `match_query` opens the campaign's committed target, checks it against `target_hash`, reads her sealed traits, and computes the verdict itself. The client no longer supplies the answer, it supplies the offer. A stolen agent key can therefore only ask "does she match this one escrowed campaign?", never sweep her attribute space.

4. **The receipt hides the verdict.** The enclave derives a secret nonce from her private salt and writes `receipt = sha256(target_hash || verdict || nonce)` onto the campaign. Without the nonce, a public receipt does not reveal whether she matched.

5. **Her wallet is a commitment, not an address.** On a match the enclave writes `payee_commit = sha256(her_wallet || nonce)`. Her wallet stays unlinkable until she chooses to settle and open it.

6. **Settlement is bound to the real match.** Back on the base chain, `settle_offer(offer_hash, verdict, nonce)` pays her only if the receipt verifies, the verdict is a match, and she can re-open the payee commitment. The brand cannot assert its own acceptance and cannot pay a wallet the enclave did not stamp.

## Metering: rate limits on repeated queries

Because her traits never change, Oira treats repeated asking as a cost center, not a free action. Distinct queries are metered and priced so that asking is never free or unlimited.

- **Distinct-target metering.** A repeat query of an already-answered offer is a free no-op, so the meter counts distinct escrowed campaigns, not re-checks.
- **Escrow pricing.** A campaign can be asked at most `escrowed / per_query_cost` times, and forfeited per-query stakes go to a protocol treasury. Asking has a real, cumulative cost.
- **Clock-derived epochs.** The per-epoch budget resets on a day boundary read from the enclave's own clock, never from a number the caller hands in, so nobody can roll the epoch to reset the meter.
- **Lifetime ceiling.** A separate lifetime budget never resets and caps total distinct queries over the account's lifetime.
- **Per-brand tightening.** A bounded table caps distinct offers per brand. When it fills, a new brand evicts the smallest-count entry. This approximates a per-brand limit once many brands are active, and it never bypasses the lifetime ceiling.

These five properties, labelled in the program source, are what makes a private match safe to repeat, not just answer once.

## Honest limits

- The per-brand table approximates a per-brand cap under eviction. A determined actor spinning up many identities is bounded by the lifetime ceiling and by the per-query cost, not by the per-brand number.
- The guarantee is with respect to queries answered inside the metered enclave. It does not constrain what she chooses to disclose elsewhere.
- Trait matching here is on bucketed categories (undertone, Monk depth within a tolerance, season advisory), chosen so that any operator commit of enclave state leaks a category at worst, never a biometric vector.

## On-chain footprint

Small by design. The base chain holds her trait commitment, her budgets, the campaign commitments, verdict-hiding receipts, and settlements bound to payee commitments. No plaintext attribute, no plaintext target, no verdict, and no un-opened wallet link is ever stored.

## On-device key custody (Solana Mobile Seeker)

The match runs in a server-side TEE. On a Seeker, her keys get a second hardware home. Her owner key and the agent session key live in Seed Vault, so the key that opens her payee commitment on settlement never enters app memory, and the scoped agent key that runs `match_query` while she is offline is provisioned and revoked as a hardware capability rather than a file. Her traits are protected by the rollup's enclave, her keys by the phone's secure element, and nothing that identifies her is ever in plaintext outside a TEE at either end. This signing path is the next integration; it sits on top of the existing agent-session-key model and needs no change to the program.
