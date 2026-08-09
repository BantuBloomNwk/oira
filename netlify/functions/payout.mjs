// Netlify Function (v2) — POST /api/payout. Private in-enclave USDC payout.
// Stateless: mints a fresh recipient so the receipt always resolves in the demo.
import { Keypair } from '@solana/web3.js';
import { privatePayout } from '../../client/oira-chain.mjs';

export default async (_req) => {
  try {
    const owner = [...Keypair.generate().secretKey];
    const r = await privatePayout(owner, 5);
    return Response.json(r);
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};

export const config = { path: '/api/payout' };
