// Proves residual #2 closed: after a device-seal, the overnight runs against HER REAL
// sealed palette using only her PUBKEY + the bounded agent key + her traits — never her
// owner secret. (Also exercises the device-supplied salt path.)
import nacl from 'tweetnacl';
import { Keypair, PublicKey } from '@solana/web3.js';
import { sealPaletteRelay, runOffer } from './oira-chain.mjs';

const device = Keypair.generate();                 // her passkey-derived key (stand-in)
const traits = { undertone: 2, depth: 8, season: 3 };
const salt = crypto.getRandomValues(new Uint8Array(32)); // device-derived salt (stand-in)
const sign = async (m) => nacl.sign.detached(new Uint8Array(m), device.secretKey);

console.log('sealing under device key', device.publicKey.toBase58(), '(salt device-supplied)…');
const sealed = await sealPaletteRelay({ ownerPubkey: device.publicKey.toBase58(), traits, salt, sign });
console.log('  sealed palette:', sealed.palette, '| her:', sealed.her);

console.log('\nrunning the overnight against her REAL palette — pubkey + agent + traits only…');
const offer = await runOffer({ ownerPubkey: sealed.her, agentSecret: sealed.agent, traits, payout: 5 });
console.log('  verdict :', offer.verdict, offer.matched ? '(MATCH)' : '(no-match)');
console.log('  paid    :', offer.amount, 'oUSDC | her balance:', offer.herBalance);
console.log('  settle  :', offer.settleSig);
console.log('  campaign:', offer.campaign);

const pass = offer.matched === true && offer.herBalance >= 5 && !!offer.settleSig
  && offer.campaign && sealed.her === device.publicKey.toBase58();
console.log(`\n${pass ? 'ALL GREEN — overnight settled against her real device-sealed palette, no owner secret used' : 'FAILED'}`);
process.exit(pass ? 0 : 1);
