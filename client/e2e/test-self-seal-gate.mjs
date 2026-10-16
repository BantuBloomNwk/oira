// Fast unit test (no network, no secret) for the self-seal Sybil gate — VERIFICATION.md row 13.
// sealPalette()'s no-setup demo path can mint a fresh, unauthenticated Palette; runOffer()/
// matchCampaign() fall back to it when no owner is supplied. That must be OFF by default so it can't
// be abused in production to Sybil-mint Palettes, and only re-enabled with an explicit opt-in. This
// proves the gate (`assertSelfSealAllowed`): default-blocks, only OIRA_ALLOW_SELF_SEAL=1 allows, the
// error is actionable, and the gate is actually WIRED at the runOffer call site (not just defined).
// Run from client/:  node e2e/test-self-seal-gate.mjs
import { Keypair } from '@solana/web3.js';

// Seed a throwaway deployer key so importing the bridge module needs no real secret — the gate we
// test throws before the deployer is ever used, so this keeps the check in the fast, offline tier.
process.env.OIRA_DEPLOYER_KEY = JSON.stringify([...Keypair.generate().secretKey]);
delete process.env.OIRA_ALLOW_SELF_SEAL;
const { assertSelfSealAllowed, runOffer } = await import('../oira-chain.mjs');

let pass = true; const check = (label, ok) => { pass = pass && ok; console.log(`   ${ok ? '✓' : '✗'} ${label}`); };
const blocks = (fn) => { try { fn(); return false; } catch { return true; } };
const asyncBlocks = async (fn) => { try { await fn(); return false; } catch { return true; } };

console.log('self-seal gate (assertSelfSealAllowed):');
delete process.env.OIRA_ALLOW_SELF_SEAL;
check('DEFAULT (unset) BLOCKS self-seal', blocks(() => assertSelfSealAllowed('t')));
process.env.OIRA_ALLOW_SELF_SEAL = '0';
check("'0' blocks", blocks(() => assertSelfSealAllowed('t')));
process.env.OIRA_ALLOW_SELF_SEAL = 'true';
check("anything other than exactly '1' blocks", blocks(() => assertSelfSealAllowed('t')));
process.env.OIRA_ALLOW_SELF_SEAL = '1';
check("only '1' allows", !blocks(() => assertSelfSealAllowed('t')));

console.log('\nactionable error:');
delete process.env.OIRA_ALLOW_SELF_SEAL;
let msg = ''; try { assertSelfSealAllowed('runOffer'); } catch (e) { msg = String(e.message || e); }
check('names the caller + the exact env var to flip', /runOffer/.test(msg) && /OIRA_ALLOW_SELF_SEAL/.test(msg));

console.log('\ncall-site wiring (the gate actually guards runOffer, offline — it throws before any RPC):');
delete process.env.OIRA_ALLOW_SELF_SEAL;
check('runOffer({}) with no owner is BLOCKED by the gate', await asyncBlocks(() => runOffer({})));

console.log('\n────────── RESULT ──────────');
console.log(pass
  ? 'PASS ✓ — the self-seal fallback is OFF by default, only OIRA_ALLOW_SELF_SEAL=1 enables it, the error is actionable, and runOffer is genuinely gated (no unauthenticated Sybil-mint in production).'
  : 'CHECK — a sub-assertion failed; inspect above.');
process.exit(pass ? 0 : 1);
