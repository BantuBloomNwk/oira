// The sponsored seal budget is charged when SOL is sent, not when a seal completes.
// Start the bridge with OIRA_SPONSOR_MAX=1, then run from client/:  node e2e/sponsor-limit-e2e.mjs
//   1. a device starts a seal and never signs: the bridge funds it once
//   2. a second device from the same connection is refused and receives nothing
import { Keypair, Connection } from '@solana/web3.js';
import WebSocket from 'ws';

const URL = process.env.OIRA_WS || 'ws://127.0.0.1:8779/api/seal/ws';
const base = new Connection(process.env.OIRA_BASE_RPC || 'https://api.devnet.solana.com', 'confirmed');
let failed = 0;
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };

// Opens a seal and never answers a sign request. Resolves with what the bridge said.
function startAndStall(device) {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL);
    const done = (r) => { try { ws.close(); } catch {} resolve(r); };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'start', ownerPubkey: device.publicKey.toBase58(), traits: { undertone: 2, depth: 8, season: 3 } })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.t === 'sign') done({ asked: true });
      else if (m.t === 'error') done({ error: m.message });
    });
    ws.on('error', (e) => done({ error: String(e.message || e) }));
    setTimeout(() => done({ timeout: true }), 90_000);
  });
}

const a = Keypair.generate(), b = Keypair.generate();
const ra = await startAndStall(a);
check('first device is asked to sign', ra.asked === true);
check('first device was funded once', (await base.getBalance(a.publicKey)) > 0);

const rb = await startAndStall(b);
check('second device is refused', typeof rb.error === 'string');
check('second device received nothing', (await base.getBalance(b.publicKey)) === 0);
console.log(rb.error ? `  bridge said: ${rb.error}` : '');

console.log(failed ? `\n${failed} FAILED` : '\nALL GREEN');
process.exit(failed ? 1 : 0);
