# Seeker: Seed Vault + Genesis Token — what the docs actually say

Read before writing any Android/Seeker code, per the standing rule ("go over the
documents properly first"). Sources are Solana Mobile's own docs and Helius'
current (Seeker-era) tutorial; links at the bottom of each section.

## 1. Correction to the plan: Oira does not integrate the Seed Vault SDK

The previous plan said "replace the custody fallback with Seed Vault as the
hardware key source." That's imprecise enough to be wrong in practice. The
Seed Vault SDK's own docs are explicit:

> "The Seed Vault SDK is designed for usage by **wallet** apps... If you are
> building a mobile dApp, you should just use **Mobile Wallet Adapter** for
> your use case."

Oira is a consumer dApp, not a wallet. It should never link the Seed Vault
SDK, never touch `WalletContractV1`, and never talk to the
`com.solanamobile.seedvault.wallet.v1.walletprovider` content provider
directly — that surface exists so that *wallet apps* (the thing installed on
a Seeker that actually holds keys) can do secure key custody. The correct
integration for Oira is the **Mobile Wallet Adapter (MWA) protocol**:

```
Oira (dApp)  --MWA protocol-->  a wallet app on the device  --Seed Vault-->  hardware key
```

Package: `@solana-mobile/mobile-wallet-adapter-protocol-web3js` (React
Native/Expo — matches what `docs/OIRA_BUILD_PROMPT.md` already specifies).
Core calls:

- `transact(callback)` — opens an MWA session with whatever wallet app the
  user has (on Seeker, the default wallet is Seed-Vault-backed).
- `wallet.authorize(...)` inside that session — returns an
  `AuthorizationResult` with her authorized public key(s), an `auth_token`
  (cache this to skip re-authorizing next launch), and `wallet_uri_base`.
- `wallet.signAndSendTransactions(...)` — for `set_traits` / any signed
  write, the wallet (backed by Seed Vault on Seeker) signs; Oira never sees
  the private key, ever.

**What this means for bug #1 (stable wallet identity), concretely on
Seeker:** her `deviceOwner` becomes the pubkey MWA's `authorize()` returns,
not a locally-generated fallback key. That's hardware-backed and survives
reinstalls/app data clears (the key lives in the wallet app / Seed Vault, not
Oira's storage) — strictly stronger than the current passkey/local-key
fallback in `app/index.html`, and it's the same bootstrapping shape already
in place (`bootIdentity()` just gets a Seeker-specific branch that calls
`transact()` instead of the local custody fallback when running inside the
Seeker/Android build).

Sources: [Seed Vault — Solana Mobile Docs](https://docs.solanamobile.com/developers/seed-vault), [Seed Vault SDK intro](https://docs.solanamobile.com/additional-sdks/seedvault_intro), [Seed Vault SDK integration guide](https://github.com/solana-mobile/seed-vault-sdk/blob/main/docs/integration_guide.md), [Mobile Wallet Adapter — Solana Mobile Docs](https://docs.solanamobile.com/developers/mobile-wallet-adapter), [MWA React Native usage](https://docs.solanamobile.com/react-native/using_mobile_wallet_adapter)

## 2. Seed Vault itself, for context (why the above boundary exists)

- It's a system service that keeps seeds/keys inside the device's secure
  execution environment (secure processor mode / auxiliary coprocessor);
  secrets never leave it, everything is encrypted at rest, and biometric/PIN
  auth happens inside that secure context only.
- A wallet app integrates it via three intents — `ACTION_AUTHORIZE_SEED_ACCESS`,
  `ACTION_SIGN_TRANSACTION`, `ACTION_GET_PUBLIC_KEY` — each backed by a
  content-provider table (`authorizedseeds`, `unauthorizedseeds`, `accounts`,
  `implementationlimits`). None of this is Oira's concern; it's the
  wallet-app's job, and Seeker ships a Seed-Vault-backed wallet already.
- There's a simulator for API 31+ for wallet-app developers testing Seed
  Vault itself — irrelevant to Oira since Oira isn't a wallet.

## 3. The Genesis Token (SGT) — what it is and how to check for it

The Seeker Genesis Token is a **soulbound Token-2022 NFT**, minted once per
device into the primary account of that device's Seed Vault wallet. It
unlocks holder-gated rewards/access across the ecosystem — this is the
primitive for "Seeker holder gets boosted terms" in Oira.

**On-chain identifiers (Token-2022 / Token Extensions):**

| What | Address |
|---|---|
| SGT Mint Authority | `GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4` |
| SGT Metadata Address | `GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te` |
| SGT Group (collection) Address | `GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te` |
| Token-2022 Program | `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` |

**Verification is three checks on the mint, not just "does this wallet hold
some NFT called Genesis"** (a naive check would be spoofable by anyone
minting a fake look-alike token):

1. `mint.mintAuthority === SGT_MINT_AUTHORITY`
2. its Metadata Pointer extension resolves to `SGT_METADATA_ADDRESS` (and its
   authority is also the mint authority above)
3. its Token Group Member extension's `group` equals `SGT_GROUP_MINT_ADDRESS`

All three must match — this is what makes it unforgeable-by-copy. Note this
is the *authenticity* check (is this really an SGT). It is separate from —
and does not replace — the reward-eligibility check below.

**Correction (2026-07-11): a required fourth/anti-replay check was missing
from this doc.** Solana Mobile's own guidance for gating a reward behind SGT
ownership is explicit that the app should check **three properties**, and
what's above only captured the authenticity half of it:

1. The connected wallet owns a Seeker Genesis Token (the three-part mint
   check above).
2. The user proves ownership of the wallet via message signing (in Oira's
   case this is free — the MWA `authorize()` call in §1 already proves wallet
   control before anything else runs).
3. **The Seeker Genesis Token has not been previously used to claim this
   reward** — i.e. check that its *mint address* has not been seen before,
   not just that some wallet holds it right now.

Property 3 matters because an SGT is transferable **between a user's own
wallet accounts within Seed Vault Wallet** (the mint address stays constant
across that transfer). Without it, a single physical Seeker's SGT could be
moved between accounts to claim a "Seeker holder" boosted-terms reward more
than once. Implementation: record the SGT mint address server-side (or
on-chain, in her Palette/rules account) the first time it's used to unlock
boosted terms, and reject any later redemption attempt presenting the same
mint address, regardless of which of her wallet accounts currently holds it.

The reference flow (verbatim from Solana Mobile's docs, using Helius as RPC):

```js
const { Connection, PublicKey } = require("@solana/web3.js");
const {
  unpackMint,
  getMetadataPointerState,
  getTokenGroupMemberState,
  TOKEN_2022_PROGRAM_ID,
} = require("@solana/spl-token");

async function checkWalletForSGT(walletAddress) {
  const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
  const SGT_MINT_AUTHORITY = "GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4";
  const SGT_METADATA_ADDRESS = "GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te";
  const SGT_GROUP_MINT_ADDRESS = "GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te";

  const connection = new Connection(HELIUS_RPC_URL);

  // 1. paginate getTokenAccountsByOwnerV2 for programId TOKEN_2022_PROGRAM_ID
  //    to collect every Token-2022 account the wallet owns
  // 2. extract each account's mint pubkey
  // 3. batch-fetch mint account info (connection.getMultipleAccountsInfo)
  // 4. for each mint: unpackMint(...), then check all three conditions above
  // 5. first mint that passes all three => wallet holds a verified SGT
}
```

(Full script — pagination loop, batching, error handling — is in
`docs/SEEKER-SEED-VAULT-AND-GENESIS.md`'s source fetch; ask me to paste the
complete version into `app/native/` when we actually wire this up. Not
inlined in full here to keep this doc a reference, not the implementation.)

**Important nuance for Oira specifically:** step 2 in the doc's own
recommended flow is "user proves wallet ownership via message signing" —
i.e. don't just check *an* address holds an SGT, have her *sign* to prove
she controls that wallet, then check that wallet for the SGT. Otherwise
someone could claim a Genesis-holder benefit by naming a wallet they don't
own. In Oira's case this is nearly free: the MWA `authorize()` call in §1
already proves she controls the wallet before we ever check anything, so
the SGT check just runs against the pubkey `authorize()` returned.

Source: [Seeker Genesis Token — Solana Mobile Docs](https://docs.solanamobile.com/marketing/engaging-seeker-users)

## 4. Updated plan shape (supersedes both the "Seed Vault as key source" framing AND the original "Expo/RN Seeker build" framing below)

**Correction (2026-07-11), two changes to this section:**

**(a) MWA is opt-in, not a Seeker-forced replacement of her passkey identity.**
The paragraph below originally had `bootIdentity()` unconditionally switch
`deviceOwner` to the MWA-returned pubkey whenever running on Seeker. Founder
decision: passkey stays the default sign-in for *everyone*, including on
Seeker — the product is built for an audience that should never have to
think about crypto or wallets. MWA/Seed Vault is offered as an **additional,
explicit opt-in** (a "Connect Seeker Wallet" affordance she can choose to
tap), not something that silently takes over her identity the first time she
opens the app on a Seeker device.

**(b) No separate Expo/React Native project.** MWA does not require a native
wrapper app: `@solana-mobile/wallet-standard-mobile`'s `registerMwa()` works
directly from Android Chrome — including a PWA — via a `solana-wallet:`
URI-scheme deep link into the installed wallet app. This is Solana Mobile's
own documented "MWA for Web Apps" path. So the plan below runs entirely
inside the existing PWA (`app/`); a separate installable/native-feeling
build, when wanted (for quick Seeker testing or a Solana Mobile team review),
comes from wrapping that same PWA with **Bubblewrap + Trusted Web Activity**
(Solana Mobile's own documented PWA-to-APK path), not from a hand-built
native app.

1. Add `@solana-mobile/wallet-standard-mobile` to the PWA (`app/mwa.js`,
   sibling to `app/custody.js`), calling `registerMwa()` with Oira's app
   identity. Android-gated: the opt-in affordance only shows on Android
   (MWA is unsupported on iOS Safari).
2. Add a "Connect Seeker Wallet (Seed Vault)" button, off by default,
   next to her existing identity/settings UI. Tapping it runs
   `transact()` → `authorize()`; on success, cache the `auth_token` +
   returned pubkey. This does **not** change `deviceOwner` or her passkey
   flow — it's a parallel, optional identity she can additionally connect,
   primarily so the Genesis Token check in §3 has a wallet to check against
   and so she can optionally sign owner-writes via Seed Vault if she wants
   to.
3. If she has connected via MWA, owner-signed writes (`set_traits`, etc.)
   *may* route through `wallet.signAndSendTransactions(...)` in that MWA
   session as an alternative to the passkey-derived key — but the passkey
   path remains fully functional and is what everything defaults to absent
   an explicit MWA connection.
4. Gate "Seeker holder" boosted terms behind the full 3-part SGT check in
   §3 (including the anti-replay mint-address check), run once against the
   `authorize()`-returned pubkey and cached alongside her profile (re-check
   periodically, not on every screen, to avoid hammering RPC).
5. Non-Seeker Android / web / anyone who never taps "Connect Seeker Wallet"
   keeps today's passkey-only flow completely unchanged — MWA/SGT is
   additive and invisible unless explicitly opted into.
