// Her USDC goes where she says, and her phone refuses to sign anything else.
// Start a local bridge first (OIRA_PORT=8790, OIRA_DEPLOYER_KEY set), then from client/:
//   OIRA_DEPLOYER_KEY="$(cat ../../Oira/keys/oira-deployer.json)" OIRA_HTTP=http://127.0.0.1:8790 node e2e/send-e2e.mjs
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import nacl from 'tweetnacl';
import WebSocket from 'ws';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, createTransferCheckedInstruction, unpackAccount } from '@solana/spl-token';

const appNext = new URL('../../app-next/', import.meta.url).pathname;
const out = path.join(os.tmpdir(), `signguard-${process.pid}.mjs`);
execFileSync(path.join(appNext, 'node_modules/.bin/esbuild'), [path.join(appNext, 'src/lib/signguard.ts'), '--bundle', '--format=esm', `--outfile=${out}`, '--log-level=error']);
const { sendSignGuard } = await import(out);
fs.unlinkSync(out);

const HTTP = process.env.OIRA_HTTP || 'http://127.0.0.1:8790';
const WS = HTTP.replace(/^http/, 'ws') + '/api/seal/ws';
const RPC = process.env.OIRA_BASE_RPC || 'https://api.devnet.solana.com';
const base = new Connection(RPC, 'confirmed');
const MINT = new PublicKey(JSON.parse(fs.readFileSync(new URL('../payout-config.json', import.meta.url))).mint);
const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.OIRA_DEPLOYER_KEY)));
let failed = 0;
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const bal = async (owner) => { const a = getAssociatedTokenAddressSync(MINT, owner, true); const i = await base.getAccountInfo(a); return i ? Number(unpackAccount(a, i).amount) / 1e6 : 0; };

/* What her phone does: check every request against the guard, then sign. */
function send(her, to, amount) {
  return new Promise((resolve) => {
    const guard = sendSignGuard(her.publicKey.toBase58(), { to, micro: BigInt(Math.round(amount * 1e6)), mint: MINT.toBase58() });
    const ws = new WebSocket(WS);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'send', ownerPubkey: her.publicKey.toBase58(), to, amount })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.t === 'sign') {
        const bytes = Buffer.from(m.msg, 'base64');
        try { guard(bytes); } catch (e) { ws.close(); return resolve({ refused: e.message }); }
        ws.send(JSON.stringify({ t: 'sig', id: m.id, sig: Buffer.from(nacl.sign.detached(bytes, her.secretKey)).toString('base64') }));
      } else if (m.t === 'done' || m.t === 'error') { ws.close(); resolve(m); }
    });
  });
}

const her = Keypair.generate(), wallet = Keypair.generate();
console.log('[setup] give a fresh identity 3 test USDC');
const herAta = getAssociatedTokenAddressSync(MINT, her.publicKey, true);
const { blockhash } = await base.getLatestBlockhash();
const setup = new Transaction({ feePayer: deployer.publicKey, recentBlockhash: blockhash })
  .add(createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, herAta, her.publicKey, MINT))
  .add(createMintToInstruction(MINT, herAta, deployer.publicKey, 3_000_000));
setup.sign(deployer);
await base.confirmTransaction(await base.sendRawTransaction(setup.serialize()), 'confirmed');
check('she has 3 USDC', (await bal(her.publicKey)) === 3);

console.log('[send] to a fresh wallet, which has no USDC account yet');
const r1 = await send(her, wallet.publicKey.toBase58(), 1.5);
check(`sent 1.5 to the wallet (${r1.t}${r1.message ? ': ' + r1.message : ''})`, r1.t === 'done' && r1.createdAccount === true);
check('the wallet holds 1.5, she holds 1.5', (await bal(wallet.publicKey)) === 1.5 && (await bal(her.publicKey)) === 1.5);

console.log('[send] straight to a USDC account address, the way a card may give it');
const walletAta = getAssociatedTokenAddressSync(MINT, wallet.publicKey, true).toBase58();
const r2 = await send(her, walletAta, 0.5);
check(`sent 0.5 to the account address (${r2.t}${r2.message ? ': ' + r2.message : ''})`, r2.t === 'done');
check('the wallet now holds 2, she holds 1', (await bal(wallet.publicKey)) === 2 && (await bal(her.publicKey)) === 1);

console.log('[send] more than she has');
const r3 = await send(her, wallet.publicKey.toBase58(), 5);
check(`refused by the bridge (${r3.message})`, r3.t === 'error');
check(`she paid no SOL at any point (${(await base.getBalance(her.publicKey))} lamports)`, (await base.getBalance(her.publicKey)) === 0);

console.log('[guard] tampered messages are never signed');
const me = her.publicKey.toBase58(), to = wallet.publicKey.toBase58(), ata = new PublicKey(walletAta);
const attacker = Keypair.generate().publicKey;
const attackerAta = getAssociatedTokenAddressSync(MINT, attacker, true);
const msg = (ixs, payer = deployer.publicKey) => new Transaction({ feePayer: payer, recentBlockhash: blockhash }).add(...ixs).serializeMessage();
const create = (who, account) => createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, account, who, MINT);
const xfer = (dest, amount, mint = MINT) => createTransferCheckedInstruction(herAta, mint, dest, her.publicKey, amount, 6);
const guard = () => sendSignGuard(me, { to, micro: 1_000_000n, mint: MINT.toBase58() });
const refused = (bytes) => { try { guard()(bytes); return false; } catch { return true; } };
check('the honest message is accepted', !refused(msg([create(wallet.publicKey, ata), xfer(ata, 1_000_000n)])));
check('a different amount is refused', refused(msg([create(wallet.publicKey, ata), xfer(ata, 2_000_000n)])));
check('a different destination is refused', refused(msg([create(attacker, attackerAta), xfer(attackerAta, 1_000_000n)])));
check('a swapped account under her wallet is refused', refused(msg([create(wallet.publicKey, ata), xfer(attackerAta, 1_000_000n)])));
check('a different token is refused', refused(msg([create(wallet.publicKey, ata), xfer(ata, 1_000_000n, Keypair.generate().publicKey)])));
check('her paying the fee is refused', refused(msg([create(wallet.publicKey, ata), xfer(ata, 1_000_000n)], her.publicKey)));
check('an extra SOL transfer from her is refused', refused(msg([create(wallet.publicKey, ata), xfer(ata, 1_000_000n), SystemProgram.transfer({ fromPubkey: her.publicKey, toPubkey: attacker, lamports: 1 })])));
check('an extra unknown instruction is refused', refused(msg([create(wallet.publicKey, ata), xfer(ata, 1_000_000n), new TransactionInstruction({ programId: attacker, keys: [], data: Buffer.from([1]) })])));

console.log(failed ? `\n${failed} FAILED` : '\nALL GREEN');
process.exit(failed ? 1 : 0);
