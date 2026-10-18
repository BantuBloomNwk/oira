# Spike: secp256r1 passkey-native custody

**Status:** design spike, not scheduled. Recommended to run *after* the MagicBlock SDK ≥0.16.2
security upgrade (don't fork effort mid-migration). The interim fix, forcing a verified recovery-key
backup before a fallback-path seal, already shipped (`app/index.html` `ensureFallbackBackup()`), so
no user is left in a silent no-recovery state today.

## Why

Today custody has two tiers (`app/custody.js`):

| Path | Owner key | Recovery |
|---|---|---|
| **passkey + PRF** | ed25519, HKDF of the WebAuthn **PRF** secret | automatic, the passkey syncs (iCloud Keychain / Google Password Manager) and the same PRF secret re-derives the same key on a new device |
| **fallback** (authenticator without PRF) | ed25519 from a device-local random seed | **none automatic**: only the exported recovery key |
| wallet | external | the wallet's own backup |

The passkey+PRF path already gives non-crypto-natives seed-phrase-free recovery. The problem is the
**fallback path**: whenever the authenticator can't do the PRF extension, recovery collapses to "did
she save the recovery key." PRF support is real but not universal, so a meaningful slice of users land
there. The interim gate makes that safe (she can't seal without proving she saved the key), but it's
still a worse experience than "just works," and it depends on her keeping a secret.

**The end-state we want:** every passkey user recovers automatically via platform sync, no PRF
requirement, no recovery key to lose. That's what a **secp256r1 passkey-native** wallet gives.

## What changed in the ecosystem

- **SIMD-0075** (secp256r1 sigverify precompile) activated on Solana **mainnet, June 2025**. Precompile
  address `Secp256r1SigVerify1111111111111111111111111`. A program can now verify a P-256 signature
  on-chain, cheaply.
- WebAuthn passkeys are **exclusively P-256 (secp256r1)**. So a passkey assertion can directly
  authorize on-chain actions, no derived ed25519 key, no PRF, in the middle.
- Recovery becomes free and universal: the wallet identity is the passkey's P-256 credential; a synced
  passkey on a new device reproduces the same credential → same identity. No PRF extension needed, so
  the fallback tier disappears entirely.

## The catch (why it's a re-architecture, not a swap)

**Solana transactions still require an ed25519 fee-payer signature**: a passkey can't produce one.
So passkey-native is the "smart-wallet" pattern:

1. Her wallet is a **program-owned PDA** whose authority is her passkey's P-256 public key (the PDA
   seed, or a field the program stores).
2. To act, the client builds the intended action, hashes it, sets that hash as the **WebAuthn
   challenge**, and prompts Face/Touch ID. The passkey signs `authenticatorData ‖ SHA256(clientData)`.
3. The transaction carries **two** instructions: the **secp256r1 precompile** ix (pubkey, message,
   signature) and the Oira program ix. The program reads the **instructions sysvar**, confirms the
   precompile verified the expected `(pubkey, message)`, checks the pubkey is this PDA's authority, and
   that the message binds the exact action, then executes against the PDA.
4. An **ed25519 relayer** (our bridge) pays the fee and submits. It cannot forge the P-256
   authorization, so its trust is limited to liveness/censorship, acceptable, and it already exists.

## The real open question: the ER/TEE

Oira's whole model is that the Palette + Traits are **delegated into the MagicBlock Private ER**, and
owner-authorized in-enclave actions (`set_traits`, `set_palette_privacy`, `undelegate_palette`) are
signed by the owner **ed25519** key today. The crux:

> **Does the MagicBlock ER validator expose the secp256r1 precompile?** The precompile is a base-layer
> native program; the ER is a separate SVM runtime. If it does not, an in-enclave action cannot be
> P-256-authorized directly.

Two ways forward depending on that answer:

- **If the ER has (or gets) the precompile:** owner-in-enclave actions verify the P-256 sig the same
  way as base. Clean.
- **If not:** keep a thin ed25519 **owner session key** for in-enclave owner actions only, itself
  authorized/derived under the passkey at seal time (short-lived, scoped), the base-layer identity
  (funds, palette ownership, recovery) is passkey-native, and only the in-ER owner signature stays
  ed25519. The **agent** session key (the bounded server-held key that runs `match_query` in-ER) is
  unchanged either way, it's already ed25519 and doesn't touch her recovery.

This question gates the whole effort and should be the **first thing the spike answers** (ask the
MagicBlock team directly, and/or probe a local ER validator).

## Phasing

- **Phase 0: DONE.** Forced verified recovery-key backup before a fallback seal; syncable platform
  passkey at enroll (`residentKey:'required'`, platform attachment); PRF is already the default.
- **Phase 1: base-only spike (local validator).** A `SmartPalette` PDA whose authority is a P-256
  pubkey; `init_palette` + `set_traits` authorized via the precompile; prove **recovery on a fresh
  "device"** (same passkey pubkey → same PDA). No ER yet. This validates the core UX win in isolation.
- **Phase 2: ER reconciliation.** Answer the precompile-in-ER question; wire delegation + the
  in-enclave owner actions accordingly (native P-256, or the scoped ed25519 owner-session-key bridge).
- **Phase 3: cutover + migration.** A path for existing PRF/fallback Palettes (re-seal under the
  passkey identity, or a one-time link instruction binding the old owner to the new P-256 authority).

## Risks / notes

- **ER precompile support**: the load-bearing unknown (above).
- **Anchor ergonomics**: no macro for precompile introspection; the program manually reads the
  instructions sysvar and validates the precompile ix. Well-trodden (other Solana passkey wallets do
  this) but hand-written and security-sensitive, worth an external review.
- **Per-action prompt**: each owner authorization is a Face/Touch ID tap. Fine for seal/re-seal; the
  ongoing overnight match uses the agent key, so there's no per-match prompt regression.
- **Migration**: existing users must not be stranded; Phase 3 needs a real link/re-seal story before
  any cutover.
- **Do the security upgrade first**: land MagicBlock SDK ≥0.16.2 (see the ephemeral-macro advisory)
  before opening this; a redeploy for a custody re-architecture should not ride on top of an unpatched
  delegation path.

## Recommendation

Ship Phase 0 (done). Hold Phases 1–3 until after the SDK security upgrade, then run Phase 1 as a
time-boxed spike whose explicit deliverable is a yes/no on the ER precompile question, that answer
decides whether passkey-native is a clean win or a two-key compromise.
