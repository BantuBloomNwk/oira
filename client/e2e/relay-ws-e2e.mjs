// Headless proof of the WebSocket seal relay end-to-end: a node WS client plays the browser
// device, signing every relayed message with a local keypair. Verifies the same path the
// real browser (window.OiraCustody) will drive, only the passkey->key leg differs.
import nacl from 'tweetnacl';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import WebSocket from 'ws';

const URL = process.env.OIRA_WS || 'ws://127.0.0.1:8779/api/seal/ws';
const base = new Connection('https://api.devnet.solana.com', 'confirmed');
const device = Keypair.generate();
console.log('device (owner):', device.publicKey.toBase58(), '\nconnecting', URL);

const ws = new WebSocket(URL);
let signs = 0;
ws.on('open', () => ws.send(JSON.stringify({
  t: 'start', ownerPubkey: device.publicKey.toBase58(),
  traits: { undertone: 2, depth: 8, season: 3 }, lifetimeCap: 2,
})));
ws.on('message', async (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.t === 'sign') {
    signs++;
    const sig = nacl.sign.detached(Buffer.from(m.msg, 'base64'), device.secretKey);
    ws.send(JSON.stringify({ t: 'sig', id: m.id, sig: Buffer.from(sig).toString('base64') }));
  } else if (m.t === 'done') {
    console.log(`\nseal done via WS ✓ (device signed ${signs} messages)`);
    console.log('  palette:', m.palette, '\n  her:', m.her, '\n  sealSig:', m.sealSig);
    const info = await base.getAccountInfo(new PublicKey(m.palette));
    const ok = info && info.owner.toBase58().startsWith('DELeG') && m.her === device.publicKey.toBase58();
    console.log('  delegated + her==device:', ok);
    console.log(ok ? '\nALL GREEN: WS relay seals under the device key' : '\nFAILED');
    ws.close(); process.exit(ok ? 0 : 1);
  } else if (m.t === 'error') { console.error('\nERROR from bridge:', m.message); ws.close(); process.exit(1); }
});
ws.on('error', (e) => { console.error('ws error', e.message); process.exit(1); });
setTimeout(() => { console.error('timeout'); process.exit(1); }, 150000);
