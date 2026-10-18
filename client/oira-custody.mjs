// Oira, client-side key custody derivation (shared, node + browser-portable scheme).
//
// The custody model: her passkey (WebAuthn, hardware-gated by Face/Touch ID or Seed
// Vault) exposes a stable 32-byte secret via the PRF extension. We derive her Solana
// ed25519 OWNER key deterministically from that secret with HKDF-SHA256. Consequences:
//   • no seed phrase, ever, she creates her Palette with a biometric;
//   • biometric recovery for free, passkeys sync (iCloud Keychain / Google / Seed
//     Vault), the PRF output is stable, so the SAME owner key regenerates on a new
//     device. Nothing is stored at rest, nothing lives on the server;
//   • mainnet-shaped, the owner secret exists only in memory at sign-time.
//
// The AGENT key stays a bounded, revocable session key (server-holdable by design: even
// fully compromised it can only exhaust her on-chain caps against real escrowed offers).
// So only the OWNER key must be device-custodied, that is what this module derives.
//
// This node module is the reference implementation + is what the headless proof exercises
// (with a mock PRF secret). The browser build (app/custody.js) mirrors the SAME HKDF info
// strings so a key derived in the browser matches one derived here.

import { hkdfSync } from 'node:crypto';
import { Keypair } from '@solana/web3.js';

// Versioned HKDF context. Bump the version only with a migration, it changes her key.
export const OWNER_INFO = 'oira:owner:ed25519:v1';
export const AGENT_INFO = 'oira:agent:ed25519:v1';
// Fixed, non-secret salt. The entropy is the PRF secret (ikm); the salt only domain-separates.
const HKDF_SALT = new TextEncoder().encode('oira:custody:hkdf:salt:v1');

// Derive a deterministic 32-byte ed25519 seed from the PRF secret for a given role.
export function deriveSeed(prfSecret, info) {
  if (!(prfSecret instanceof Uint8Array) || prfSecret.length < 32) {
    throw new Error('prfSecret must be a Uint8Array of >= 32 bytes');
  }
  const ikm = Buffer.from(prfSecret);
  const out = hkdfSync('sha256', ikm, HKDF_SALT, new TextEncoder().encode(info), 32);
  return new Uint8Array(out);
}

// Her OWNER keypair, deterministic from the passkey PRF secret. This is the key that
// controls set_traits, delegation, settle payee, and revocation. Device-held only.
export function deriveOwner(prfSecret) {
  return Keypair.fromSeed(deriveSeed(prfSecret, OWNER_INFO));
}

// A deterministic AGENT keypair option (if she wants her agent bound to her passkey too
// rather than server-issued). Kept separate so it can be rotated/revoked independently.
export function deriveAgent(prfSecret) {
  return Keypair.fromSeed(deriveSeed(prfSecret, AGENT_INFO));
}
