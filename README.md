# Oira

**A private attribute vault on Solana. Brands can find out whether you match what they are looking for, and pay you for it, without ever learning who you are, what you look like, or that a match happened.**

Oira runs the sensitive part of that exchange inside a MagicBlock Private Ephemeral Rollup (a TEE), and settles the money on Solana. Your traits never leave the enclave. What lands on the base chain is a set of commitments and a payout, nothing that can be read back into you.

- **Program (devnet):** [`CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP`](https://explorer.solana.com/address/CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP?cluster=devnet)
- **Android app:** [`app-next/`](app-next), see [the Android app](#the-android-app-built-for-the-seeker)
- **IDL:** [`idl/oira_palette.json`](idl/oira_palette.json)
- **End-to-end proof:** [`client/e2e/settle-match-e2e.mjs`](client/e2e/settle-match-e2e.mjs)
- **Verify it yourself:** [`docs/VERIFY.md`](docs/VERIFY.md) to run the match and check the empty chain
- **See our vision:** [`docs/PITCH.md`](docs/PITCH.md) on why this matters and where it goes

## Try it

- **The app:** [app.myoira.com](https://app.myoira.com): take a reading, seal it, then run the
  overnight flow. On the "While you sleep" screen the app reads your palette account's owner live
  off devnet and shows you it belongs to MagicBlock's Delegation Program rather than to us. That
  row is a live ledger read, not a label, so the enclave dependency is something you can check
  rather than something we claim.
- **The site:** [myoira.com](https://myoira.com)
- **The open skin study:** [myoira.com/study](https://myoira.com/study). Anyone can take part in
  about three minutes; the picture never leaves her phone and she sees every number before it is
  sent. Live totals, across skin tones, phones and countries: [myoira.com/study/live](https://myoira.com/study/live).

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
- **Fair to deeper skin, found by testing on it.** The scan uses the white of the eye to judge
  the light, and on darker eyes it reads warm: in a same-frame bench against plain paper it read
  about 1000 to 1400K warmer than the light really was, so daylight was being refused as a warm
  bulb. The gate now accepts that range at a capped confidence. Brown and dark skin now get a deep
  palette, and a camera whose colours have broken can no longer produce a sealable reading. We
  have not yet validated accuracy against an instrument; that study is next, starting with
  Monk 7 to 10.
- **An open study.** Readings women choose to send land on our own server (`study-service/`),
  with no name, no photo and no IP address, and a code that deletes them from any phone.
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

## The Android app, built for the Seeker

`app-next/` is the Android app, built on Capacitor. Everything it runs ships inside the APK,
including the face and hair models, and nothing is loaded from a website: there is no remote
`server.url`, so the app reads its own files and only goes online for what needs the chain or our
server, like sealing, payouts, brand answers and Ask Oira.

How it uses the phone and Android itself:

- **Her Seeker wallet.** She connects and signs through Mobile Wallet Adapter
  (`@solana-mobile/wallet-standard-mobile`, see `src/lib/wallet.ts`), so on a Seeker the wallet
  she signs with is the one her phone shipped with.
- **Passkeys through Android.** The app switches on WebAuthn for its WebView (`MainActivity.java`),
  so a passkey goes through Android's Credential Manager, which checks the app's signing key
  against `assetlinks.json` on our domain. She gets the same address in the app as on the web.
- **Her fingerprint, asked by Android.** Where the phone's WebView has no passkeys, a small native
  plugin (`OiraBiometricPlugin.java`, `androidx.biometric`) shows Android's own fingerprint sheet
  before she scans and seals, with her PIN as the fallback on phones without a sensor.
- **The camera, held still.** The scan reads her through the front camera, checks she's live with
  a blink and a turn of the head, and holds exposure and white balance where the camera lets us
  (`src/lib/camera-control.ts`), so the light can't drift while she is being read.
- **Signing stays on her phone.** Every seal and every change to her rules is signed on the
  device, and the app checks each message before it signs (`src/lib/signguard.ts`).
- **Her reading stays on her phone too.** One scan reads her shade, undertone, depth, skin,
  features and hair with models inside the app, and the photo never leaves the device. App
  backups are switched off in the manifest so an adb backup can't carry her reading away.

On Android and the Seeker, sealing is a real Solana transaction she signs: only the reading
crosses to be sealed, never the image, and her palette account is delegated to MagicBlock's
rollup.

### Build the APK

You need Node 22, a JDK (17 or newer) and the Android SDK.

```bash
cd app-next
npm install
./scripts/fetch-models.sh     # the face and hair models and the WASM runtimes, kept out of git
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

To try it in a browser first: `npm run dev` inside `app-next`, then open it on a phone over
HTTPS (`scripts/dev-https.sh` makes a local certificate), since the camera needs a secure page.

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
OIRA_KEYPAIR=/path/to/funded-devnet-id.json node e2e/settle-match-e2e.mjs
```

The client mints a small test token, spins up throwaway her / agent / brand actors, runs the whole seal, match, settle flow against the TEE endpoint, and checks every assertion above. Your funded keypair only pays the fees. For a step-by-step account of what each line proves and how to confirm the empty chain on the explorer, see [`docs/VERIFY.md`](docs/VERIFY.md).

## Repository layout

```
program/            the on-chain program (Rust, Anchor + ephemeral-rollups-sdk)
  src/lib.rs        the whole thing: vault, traits, campaigns, match, settle
idl/                generated IDL for the deployed program
client/             the end-to-end proof against devnet + the TEE
app-next/           the Android app (React + Capacitor), the scan and both ways in
  join.html         the open skin study; progress.html its live totals
study-service/      where study readings land: a small dependency-free Node service
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
