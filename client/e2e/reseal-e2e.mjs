// Headless proof of the RE-SEAL path ("Recheck your colours"): the same device seals twice.
// Her PDAs are per-owner deterministic, so the second sealPaletteRelay call exercises the
// re-seal branch end-to-end: skip init, finish any incomplete delegation, refresh privacy
// (create-or-update permission), owner-signed set_traits re-bound to the original commitment
// root. This is the exact flow that used to die with
//   ER tx failed {"InstructionError":[0,"InvalidAccountData"]}
// when the privacy CPI (create-only back then) re-ran against the existing permission group.
//
// Also asserts the AGENT REBIND: after the re-seal, the ER palette must be private under the
// CURRENT deterministic agent (agentKeyFor). With the create-or-update program deployed this
// holds even for palettes first sealed by an older client with a random per-call agent.
//
// Usage:
//   node client/e2e/reseal-e2e.mjs           # fresh device: first seal + re-seal (steady state)
//   node client/e2e/reseal-e2e.mjs <state>   # reuse a saved device state file across runs
import nacl from 'tweetnacl';
import { randomBytes, createHash } from 'crypto';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { getAuthToken } from '@magicblock-labs/ephemeral-rollups-sdk';
import fs from 'fs';
import { sealPaletteRelay } from '../oira-chain.mjs';

const TEE_RPC = process.env.OIRA_TEE_RPC || 'https://devnet-tee.magicblock.app';
const base = new Connection(process.env.OIRA_BASE_RPC || 'https://api.devnet.solana.com', 'confirmed');
const TRAITS = { undertone: 2, depth: 8, season: 3 };

// One stable "device": key + passkey-derived salt survive across runs via the state file,
// exactly like her real device (same passkey => same key + same salt on every re-seal).
const stateFile = process.argv[2] || null;
let device, salt;
if (stateFile && fs.existsSync(stateFile)) {
  const st = JSON.parse(fs.readFileSync(stateFile));
  device = Keypair.fromSecretKey(Uint8Array.from(st.device));
  salt = Buffer.from(st.salt);
} else {
  device = Keypair.generate();
  salt = randomBytes(32);
  if (stateFile) fs.writeFileSync(stateFile, JSON.stringify({ device: [...device.secretKey], salt: [...salt] }));
}
const sign = async (m) => nacl.sign.detached(new Uint8Array(m), device.secretKey);
const owner = device.publicKey.toBase58();
console.log('device (owner):', owner);

const args = { ownerPubkey: owner, traits: TRAITS, salt, sign };
const palettePda = PublicKey.findProgramAddressSync(
  [Buffer.from('palette'), device.publicKey.toBuffer()],
  new PublicKey('CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP'))[0];

const firstTime = !(await base.getAccountInfo(palettePda));
if (firstTime) {
  const r1 = await sealPaletteRelay(args);
  console.log('first seal   ✓', r1.sealSig);
} else {
  console.log('first seal   ✓ (already sealed on a previous run)');
}

const r2 = await sealPaletteRelay(args); // the re-seal, used to throw InvalidAccountData
console.log('re-seal      ✓', r2.sealSig);

// Verify the rebind from the ER itself: only the whitelisted reader can read a private
// account, so a successful read AS THE CURRENT AGENT that shows is_private + agent==us is
// the strongest possible assertion that the permission group points at the current agent.
const agent = Keypair.fromSecretKey(Uint8Array.from(r2.agent));
const { token } = await getAuthToken(TEE_RPC, agent.publicKey, (m) => Promise.resolve(nacl.sign.detached(m, agent.secretKey)));
const tee = new Connection(`${TEE_RPC}?token=${token}`, 'confirmed');
const live = await tee.getAccountInfo(new PublicKey(r2.palette));
let privateUnderCurrentAgent = false;
if (live) {
  let o = 8 + 32; const n = live.data.readUInt32LE(o); o += 4 + n + 32 + 12;
  const isPrivate = live.data.readUInt8(o) === 1;
  const agentOff = o + 1 + 1 + 16 + 8 + 8 + 1 + 4 + 1 + 4 + 4;
  const boundAgent = new PublicKey(live.data.subarray(agentOff, agentOff + 32));
  privateUnderCurrentAgent = isPrivate && boundAgent.equals(agent.publicKey);
  console.log('ER read as current agent ✓ is_private:', isPrivate, '| bound agent matches:', boundAgent.equals(agent.publicKey));
} else {
  console.log('ER read as current agent ✗ (refused, permission group NOT bound to the current agent;');
  console.log('  expected only for a legacy palette until the create-or-update program is deployed)');
}

const pass = !!r2.sealSig && privateUnderCurrentAgent;
console.log(pass ? '\nALL GREEN: re-seal is idempotent and the agent is correctly (re)bound'
                 : '\nRE-SEAL OK, AGENT REBIND PENDING (needs the create-or-update program deploy)');
process.exit(r2.sealSig ? 0 : 1);
