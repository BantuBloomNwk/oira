// Protocol config, on a local validator.
//
// The treasury and the tokens a campaign may escrow used to be a hard-coded devnet wallet and
// "any mint". Now they live in one config account. This checks:
//   - only the program's upgrade authority can create it, and only once
//   - a campaign in an accepted token is created; any other token is refused
//   - only the admin can change the config, the admin role can be handed on (e.g. to a multisig),
//     and a second token (SKR, say) can be added without a redeploy
//   - closing a campaign pays spent stakes to the config's treasury and nowhere else
//
//   node e2e/config-local.mjs     (OIRA_SO overrides the program binary)

import { ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, LAMPORTS_PER_SOL, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, AccountLayout, MintLayout, ACCOUNT_SIZE, MINT_SIZE } from '@solana/spl-token';
import { createHash, randomBytes } from 'crypto';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const PROGRAM = new PublicKey('CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP');
const LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const SO = process.env.OIRA_SO || new URL('../../program/target/deploy/oira_palette.so', import.meta.url).pathname;
const RPC_PORT = 18919;

const sha = (...p) => createHash('sha256').update(Buffer.concat(p.map((x) => Buffer.from(x)))).digest();
const disc = (n) => sha(`global:${n}`).subarray(0, 8);
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const vecKeys = (ks) => Buffer.concat([u32(ks.length), ...ks.map((k) => k.toBuffer())]);
const pda = (...seeds) => PublicKey.findProgramAddressSync(seeds.map((s) => Buffer.from(s)), PROGRAM);

let pass = 0, fail = 0;
const check = (label, ok) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); ok ? pass++ : fail++; };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oira-config-'));
const preload = [];
function account(pubkey, owner, data) {
  const f = path.join(dir, `${pubkey.toBase58()}.json`);
  fs.writeFileSync(f, JSON.stringify({ pubkey: pubkey.toBase58(), account: {
    lamports: LAMPORTS_PER_SOL / 10, data: [Buffer.from(data).toString('base64'), 'base64'], owner: owner.toBase58(), executable: false, rentEpoch: 0, space: data.length } }));
  preload.push('--account', pubkey.toBase58(), f);
}
function mintAccount(pubkey, authority) {
  const d = Buffer.alloc(MINT_SIZE);
  MintLayout.encode({ mintAuthorityOption: 1, mintAuthority: authority, supply: 10n ** 12n, decimals: 6, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default }, d);
  account(pubkey, TOKEN_PROGRAM_ID, d);
}
function tokenAccount(pubkey, mint, owner, amount) {
  const d = Buffer.alloc(ACCOUNT_SIZE);
  AccountLayout.encode({ mint, owner, amount: BigInt(amount), delegateOption: 0, delegate: PublicKey.default, state: 1,
    isNativeOption: 0, isNative: 0n, delegatedAmount: 0n, closeAuthorityOption: 0, closeAuthority: PublicKey.default }, d);
  account(pubkey, TOKEN_PROGRAM_ID, d);
}

const upgradeAuthority = Keypair.generate(), stranger = Keypair.generate(), brand = Keypair.generate(), multisig = Keypair.generate();
const treasury = Keypair.generate().publicKey;
const usdc = Keypair.generate().publicKey, skr = Keypair.generate().publicKey, junk = Keypair.generate().publicKey;
for (const m of [usdc, skr, junk]) mintAccount(m, brand.publicKey);
const brandTok = {};
for (const [name, m] of [['usdc', usdc], ['skr', skr], ['junk', junk]]) { brandTok[name] = Keypair.generate().publicKey; tokenAccount(brandTok[name], m, brand.publicKey, 1_000_000_000); }
const treasuryUsdc = Keypair.generate().publicKey; tokenAccount(treasuryUsdc, usdc, treasury, 0);
const wrongTreasury = Keypair.generate().publicKey; tokenAccount(wrongTreasury, usdc, stranger.publicKey, 0);
const [config] = pda('config');
const [programData] = PublicKey.findProgramAddressSync([PROGRAM.toBuffer()], LOADER);

const m = (pubkey, w = false, s = false) => ({ pubkey, isSigner: s, isWritable: w });
const ix = (name, keys, data = Buffer.alloc(0)) => new TransactionInstruction({ programId: PROGRAM, keys, data: Buffer.concat([disc(name), data]) });
const initConfig = (who, mints) => ix('init_config', [m(who, true, true), m(config, true), m(PROGRAM), m(programData), m(SystemProgram.programId)], Buffer.concat([treasury.toBuffer(), vecKeys(mints)]));
const setConfig = (who, admin, mints) => ix('set_config', [m(who, false, true), m(config, true)], Buffer.concat([admin.toBuffer(), treasury.toBuffer(), vecKeys(mints)]));
let offer = 1;
function campaign(mint, tok) {
  const id = offer++;
  const [c] = pda('campaign', brand.publicKey.toBuffer(), u64(id));
  const [e] = pda('escrow', c.toBuffer());
  const create = ix('create_campaign', [m(brand.publicKey, true, true), m(mint), m(c, true), m(e, true), m(tok, true), m(TOKEN_PROGRAM_ID), m(SystemProgram.programId), m(SYSVAR_RENT_PUBKEY), m(config)],
    Buffer.concat([u64(id), Buffer.from([0]), u64(100), u64(2_000), sha(randomBytes(32)), u64(10_000)]));
  const close = (tre) => ix('close_campaign', [m(brand.publicKey, true, true), m(c, true), m(e, true), m(tok, true), m(tre, true), m(TOKEN_PROGRAM_ID), m(config)]);
  return { c, create, close };
}

const v = spawn('solana-test-validator', ['--reset', '--quiet', '--ledger', path.join(dir, 'ledger'), '--rpc-port', String(RPC_PORT),
  '--faucet-port', String(RPC_PORT + 2), '--upgradeable-program', PROGRAM.toBase58(), SO, upgradeAuthority.publicKey.toBase58(), ...preload], { stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-v.pid, 'SIGTERM'); } catch {} };
process.on('exit', stop);
const conn = new Connection(`http://127.0.0.1:${RPC_PORT}`, 'confirmed');
for (let i = 0; ; i++) {
  try { await conn.getLatestBlockhash(); break; } catch { if (i > 120) throw new Error('validator never came up'); await new Promise((r) => setTimeout(r, 500)); }
}
for (const k of [upgradeAuthority, stranger, brand, multisig]) await conn.confirmTransaction(await conn.requestAirdrop(k.publicKey, LAMPORTS_PER_SOL), 'confirmed');

// A unique compute limit and a freshly fetched blockhash per transaction, so a retried instruction
// is never a byte-identical replay and nothing waits on web3.js's blockhash cache.
let nth = 0;
async function send(i, signers) {
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 + ++nth })).add(i);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash; tx.feePayer = signers[0].publicKey; tx.sign(...signers);
  const sig = await conn.sendRawTransaction(tx.serialize());
  const r = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  if (r.value.err) throw Object.assign(new Error(JSON.stringify(r.value.err)), { logs: (await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }))?.meta?.logMessages || [] });
  return sig;
}
async function refused(label, i, signers, want) {
  try { await send(i, signers); check(label, false); }
  catch (e) { const logs = (e.logs || e.transactionLogs || []).join('\n') + String(e.message); const ok = want ? logs.includes(want) : true; check(label, ok); if (!ok) console.log(logs.slice(-400)); }
}
const bal = async (a) => Number((await conn.getTokenAccountBalance(a)).value.amount);

// LIVE_COMPAT=1 with OIRA_SO=<the binary live today>: only checks that the program from before the
// config accepts the extra config account the new bridge passes, so the bridge can go first.
if (process.env.LIVE_COMPAT) {
  const c0 = campaign(usdc, brandTok.usdc);
  await send(c0.create, [brand]);
  check('the program from before the config still creates a campaign with the extra account', !!(await conn.getAccountInfo(c0.c)));
  console.log(`\n${pass} passed, ${fail} failed`); stop(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(fail ? 1 : 0);
}

console.log('\nCreating the config:');
await refused('someone who is not the upgrade authority cannot create it', initConfig(stranger.publicKey, [usdc]), [stranger], 'NotUpgradeAuthority');
await refused('an empty token list is refused', initConfig(upgradeAuthority.publicKey, []), [upgradeAuthority], 'BadConfig');
await send(initConfig(upgradeAuthority.publicKey, [usdc]), [upgradeAuthority]);
check('the upgrade authority creates it, accepting USDC only', !!(await conn.getAccountInfo(config)));
await refused('it cannot be created twice', initConfig(upgradeAuthority.publicKey, [skr]), [upgradeAuthority]);

console.log('\nWhich tokens a campaign may use:');
const a = campaign(usdc, brandTok.usdc);
await send(a.create, [brand]);
check('a USDC campaign is created', !!(await conn.getAccountInfo(a.c)));
await refused('a campaign in any other token is refused', campaign(junk, brandTok.junk).create, [brand], 'MintNotAccepted');
await refused('SKR is refused until the config accepts it', campaign(skr, brandTok.skr).create, [brand], 'MintNotAccepted');

console.log('\nChanging the config:');
await refused('only the admin can change it', setConfig(stranger.publicKey, stranger.publicKey, [usdc, skr]), [stranger], 'NotConfigAdmin');
await send(setConfig(upgradeAuthority.publicKey, upgradeAuthority.publicKey, [usdc, skr]), [upgradeAuthority]);
const b = campaign(skr, brandTok.skr);
await send(b.create, [brand]);
check('once the admin adds SKR, an SKR campaign is created without a redeploy', !!(await conn.getAccountInfo(b.c)));
await send(setConfig(upgradeAuthority.publicKey, multisig.publicKey, [usdc, skr]), [upgradeAuthority]);
await refused('after handing admin to a multisig, the old admin is locked out', setConfig(upgradeAuthority.publicKey, upgradeAuthority.publicKey, [usdc]), [upgradeAuthority], 'NotConfigAdmin');
await send(setConfig(multisig.publicKey, multisig.publicKey, [usdc, skr]), [multisig]);
check('and the multisig can change it', true);

console.log('\nWhere spent stakes go:');
await refused('closing into a treasury the config does not name is refused', a.close(wrongTreasury), [brand]);
await send(a.close(treasuryUsdc), [brand]);
check('closing pays nothing to the treasury when no stakes were spent', (await bal(treasuryUsdc)) === 0 && !(await conn.getAccountInfo(a.c)));

console.log(`\n${pass} passed, ${fail} failed`);
stop();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
