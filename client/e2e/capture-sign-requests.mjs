// Records what a seal and a re-seal ask the device to sign. Not part of the suite.
import nacl from 'tweetnacl';
import { Keypair, VersionedMessage } from '@solana/web3.js';
import { createHash, randomBytes } from 'crypto';
import { sealPaletteRelay } from '../oira-chain.mjs';
const names = ['init_palette','init_traits','set_night_rules','delegate_palette','delegate_traits','set_palette_privacy','set_traits_privacy','set_traits','update_palette','reseal_palette','undelegate_palette','commit_receipt','match_query','set_reader','rotate_agent','update_traits'];
const D = new Map(names.map((n) => [createHash('sha256').update(`global:${n}`).digest().subarray(0, 8).toString('hex'), n]));
const device = Keypair.generate();
const seen = [];
const sign = async (m) => {
  const b = Buffer.from(m);
  let row;
  try {
    const msg = VersionedMessage.deserialize(b);
    const keys = msg.staticAccountKeys.map((k) => k.toBase58());
    row = { kind: 'tx', version: msg.version, ixs: msg.compiledInstructions.map((ix) => {
      const pid = keys[ix.programIdIndex]; const d = Buffer.from(ix.data);
      return { pid, d8: d.subarray(0, 8).toString('hex'), name: D.get(d.subarray(0, 8).toString('hex')), d0: d[0], len: d.length, accts: ix.accountKeyIndexes.map((i) => keys[i]) };
    }) };
  } catch { row = { kind: 'text', len: b.length, text: b.toString('utf8').slice(0, 200) }; }
  row.raw = b.toString('base64');
  seen.push(row);
  return nacl.sign.detached(m, device.secretKey);
};
const traits = { undertone: 2, depth: 8, season: 3 };
const salt = randomBytes(32);
await sealPaletteRelay({ ownerPubkey: device.publicKey.toBase58(), traits, salt, lifetimeCap: 2, sign, assurance: 'passkey' });
const first = seen.length;
try { await sealPaletteRelay({ ownerPubkey: device.publicKey.toBase58(), traits, salt, lifetimeCap: 2, sign, assurance: 'passkey' }); } catch (e) { console.error('reseal failed', e.message); }
console.log(JSON.stringify({ device: device.publicKey.toBase58(), traits, salt: salt.toString('base64'), first, seen }, null, 1));
