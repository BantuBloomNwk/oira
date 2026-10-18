// Headless proof of the RELAYED Model B seal: the owner key lives only on the "device".
// A local keypair stands in for her passkey-derived key. We pass ONLY its public key + a
// sign() callback into sealPaletteRelay, the secret is never handed to the server code.
// This is exactly what the browser will do via window.OiraCustody.
import nacl from 'tweetnacl';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { sealPaletteRelay } from '../oira-chain.mjs';

const base = new Connection(process.env.OIRA_BASE_RPC || 'https://api.devnet.solana.com', 'confirmed');

const device = Keypair.generate();               // stands in for the passkey-derived key
const sign = async (msg) => nacl.sign.detached(new Uint8Array(msg), device.secretKey);

console.log('device (owner) pubkey:', device.publicKey.toBase58());
console.log('secret handed to server code? NO, only { ownerPubkey, sign }.\n');

const r = await sealPaletteRelay({
  ownerPubkey: device.publicKey.toBase58(),      // public key only
  traits: { undertone: 2, depth: 8, season: 3 },
  lifetimeCap: 2,
  sign,                                           // every owner signature routed here
});

console.log('sealed ✓');
console.log('  palette :', r.palette);
console.log('  her     :', r.her);
console.log('  initSig :', r.initSig);
console.log('  sealSig :', r.sealSig, '(set_traits committed inside the TEE)');

// Verify on base: the palette PDA exists and is now owned by the delegation program
// (i.e. delegated into the enclave), the seal genuinely happened, driven by the device key.
const info = await base.getAccountInfo(new PublicKey(r.palette));
const okExists = !!info;
const okDelegated = info && info.owner.toBase58().startsWith('DELeG');
console.log('\nbase check:');
console.log('  palette account exists   :', okExists);
console.log('  owned by delegation prog :', okDelegated, info ? `(${info.owner.toBase58()})` : '');
console.log('  her == device key        :', r.her === device.publicKey.toBase58());

const pass = okExists && okDelegated && r.her === device.publicKey.toBase58() && !!r.sealSig;
console.log(`\n${pass ? 'ALL GREEN: full seal ran with the owner key only on the device' : 'FAILED'}`);
process.exit(pass ? 0 : 1);
