import { base58 } from './owner';

/* Checks every message the sealing bridge asks her key to sign, before it is signed.
 *
 * A seal only ever needs a short, known set of messages: the seal's own program instructions,
 * two small rent transfers into her own accounts, a rollup fee top-up, and the rollup's login
 * text. Anything else is refused, whoever sent it. Token instructions are never on this path,
 * so nothing that reaches this function can move her USDC. */

const OIRA_PROGRAM = 'CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const DELEGATION_PROGRAM = 'DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh';
const EPHEMERAL_VAULT = 'MagicVau1t999999999999999999999999999999999';
const MAGIC_PROGRAM = 'Magic11111111111111111111111111111111111111';
const PERMISSION_PROGRAM = 'ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1';

const SEAL_INSTRUCTIONS = new Map<string, string>([
  ['7ed0d30cb6daa922', 'init_palette'],
  ['f9e77ce9074c8261', 'init_traits'],
  ['a18764176b815904', 'set_night_rules'],
  ['7e2f32c7337fa3b0', 'delegate_palette'],
  ['fa833391da17c5e0', 'delegate_traits'],
  ['170ae11ced2ab496', 'set_palette_privacy'],
  ['551bec88361e71ea', 'set_traits_privacy'],
  ['796a1ba6efc772b8', 'set_traits'],
]);

const LOGIN_PREFIX = 'Login to Query Filtering Service\n';
const MAX_TRANSFER = 20_000_000n;      // lamports, per transfer
const MAX_TRANSFERS_TOTAL = 30_000_000n; // lamports, per message
const MAX_ESCROW_TOPUP = 50_000_000n;   // lamports
const MAX_REQUESTS = 16;                // a first seal needs about ten

export class SignRefused extends Error {}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u64 = (b: Uint8Array, o: number) => {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(b[o + i]);
  return v;
};
const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
/* owner.ts's base58 is right for every real address but adds a digit when all 32 bytes are zero,
   which is exactly the System program. */
const address = (k: Uint8Array) => (k.every((x) => x === 0) ? SYSTEM_PROGRAM : base58(k));

interface Instruction { program: string; accounts: string[]; data: Uint8Array }
interface Message { signers: string[]; instructions: Instruction[] }

/* A legacy Solana transaction message. Versioned messages are refused: the seal never uses them. */
function parseLegacy(msg: Uint8Array): Message {
  let o = 0;
  const need = (n: number) => { if (o + n > msg.length) throw new SignRefused('truncated message'); };
  const byte = () => { need(1); return msg[o++]; };
  const compact = () => {
    let v = 0, shift = 0;
    for (;;) {
      const b = byte();
      v |= (b & 0x7f) << shift;
      if (!(b & 0x80)) return v;
      shift += 7;
      if (shift > 14) throw new SignRefused('bad length');
    }
  };
  const take = (n: number) => { need(n); const out = msg.subarray(o, o + n); o += n; return out; };

  const required = byte();
  if (required & 0x80) throw new SignRefused('versioned message');
  byte(); byte();
  const keys: string[] = [];
  for (let i = compact(); i > 0; i--) keys.push(address(take(32)));
  take(32); // recent blockhash
  const instructions: Instruction[] = [];
  for (let i = compact(); i > 0; i--) {
    const pid = byte();
    const accounts: string[] = [];
    for (let n = compact(); n > 0; n--) {
      const k = byte();
      if (k >= keys.length) throw new SignRefused('bad account index');
      accounts.push(keys[k]);
    }
    const data = take(compact());
    if (pid >= keys.length) throw new SignRefused('bad program index');
    instructions.push({ program: keys[pid], accounts, data });
  }
  if (o !== msg.length) throw new SignRefused('trailing bytes');
  return { signers: keys.slice(0, required), instructions };
}

function checkInstruction(ix: Instruction, me: string, traits: Uint8Array, salt: Uint8Array, totals: { lamports: bigint }) {
  if (ix.program === OIRA_PROGRAM) {
    const name = SEAL_INSTRUCTIONS.get(hex(ix.data.subarray(0, 8)));
    if (!name) throw new SignRefused('unexpected instruction');
    if (name === 'set_palette_privacy' || name === 'set_traits_privacy') {
      if (ix.accounts[4] !== EPHEMERAL_VAULT || ix.accounts[5] !== MAGIC_PROGRAM || ix.accounts[6] !== PERMISSION_PROGRAM) {
        throw new SignRefused('unexpected program account');
      }
    }
    if (name === 'set_traits') {
      if (ix.data.length !== 43 || !equal(ix.data.subarray(8, 11), traits) || !equal(ix.data.subarray(11, 43), salt)) {
        throw new SignRefused('traits do not match this reading');
      }
    }
    return;
  }
  if (ix.program === SYSTEM_PROGRAM) {
    if (ix.data.length !== 12 || u32(ix.data, 0) !== 2) throw new SignRefused('unexpected system instruction');
    if (ix.accounts[0] !== me) throw new SignRefused('transfer is not from her');
    const amount = u64(ix.data, 4);
    totals.lamports += amount;
    if (amount > MAX_TRANSFER || totals.lamports > MAX_TRANSFERS_TOTAL) throw new SignRefused('transfer too large');
    return;
  }
  if (ix.program === DELEGATION_PROGRAM) {
    if (ix.data.length !== 17 || u64(ix.data, 0) !== 9n) throw new SignRefused('unexpected delegation instruction');
    if (u64(ix.data, 8) > MAX_ESCROW_TOPUP) throw new SignRefused('top-up too large');
    return;
  }
  throw new SignRefused('unexpected program');
}

/* One guard per seal. It also caps how many signatures a single seal can ask for. */
export function sealSignGuard(me: string, reading: { undertone: number; depth: number; season: number }, salt: Uint8Array) {
  const traits = Uint8Array.from([reading.undertone, reading.depth, reading.season]);
  let requests = 0;
  return (msg: Uint8Array) => {
    if (++requests > MAX_REQUESTS) throw new SignRefused('too many sign requests');
    const text = new TextDecoder('utf-8', { fatal: false }).decode(msg.subarray(0, LOGIN_PREFIX.length));
    if (text === LOGIN_PREFIX) {
      const full = new TextDecoder().decode(msg);
      if (msg.length > 256 || !full.includes(`\nUser: ${me}`)) throw new SignRefused('unexpected login message');
      return;
    }
    const m = parseLegacy(msg);
    if (!m.signers.includes(me)) throw new SignRefused('message is not for her key');
    const totals = { lamports: 0n };
    for (const ix of m.instructions) checkInstruction(ix, me, traits, salt, totals);
  };
}

/* One guard per rules save: her login text, and one set_night_rules on her own palette with
   exactly the values she chose on screen. Nothing else, not even the seal's other steps. */
export function rulesSignGuard(me: string, rules: { minPayout: number; maxPerBrand: number }) {
  const want = new Uint8Array(30);
  want.set([0xa1, 0x87, 0x64, 0x17, 0x6b, 0x81, 0x59, 0x04], 0); // set_night_rules
  let micro = BigInt(Math.max(0, Math.round(rules.minPayout * 1e6)));
  for (let i = 0; i < 8; i++) { want[8 + i] = Number(micro & 0xffn); micro >>= 8n; }
  want[16] = Math.max(0, Math.min(255, Math.floor(rules.maxPerBrand)));
  want[21] = 1; // rules active; blocked categories and both caps stay 0
  let requests = 0;
  return (msg: Uint8Array) => {
    if (++requests > 4) throw new SignRefused('too many sign requests');
    const text = new TextDecoder('utf-8', { fatal: false }).decode(msg.subarray(0, LOGIN_PREFIX.length));
    if (text === LOGIN_PREFIX) {
      const full = new TextDecoder().decode(msg);
      if (msg.length > 256 || !full.includes(`\nUser: ${me}`)) throw new SignRefused('unexpected login message');
      return;
    }
    const m = parseLegacy(msg);
    if (!m.signers.includes(me) || m.instructions.length !== 1) throw new SignRefused('unexpected message');
    const ix = m.instructions[0];
    if (ix.program !== OIRA_PROGRAM || ix.accounts[0] !== me || !equal(ix.data, want)) throw new SignRefused('unexpected rules change');
  };
}
