// Netlify Function (v2) — POST /api/campaign. Model B overnight offer.
// Stateless: with no session, runOffer self-seals a fresh matching palette so the demo
// still resolves (it just won't carry a previously-sealed identity — see NETLIFY-DEPLOY.md).
// WARNING: the full delegate -> match -> undelegate -> settle round-trip can exceed the
// Lambda sync timeout (10s default / 26s max). If it times out, prefer the persistent
// bridge topology in the deploy doc, or convert this to a background function.
import { runOffer } from '../../client/oira-chain.mjs';

export default async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const payout = Number(body && body.payout) || 5;
    const r = await runOffer({ payout });
    return Response.json(r);
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};

export const config = { path: '/api/campaign' };
