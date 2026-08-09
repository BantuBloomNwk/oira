// Netlify Function (v2) — POST /api/seal. Stateless wrapper over the proven seal flow.
// Note: unlike the local bridge there is NO in-memory session here, so the sealed
// identity is not carried into a later /api/campaign call (functions are isolated).
import { sealPalette } from '../../client/oira-chain.mjs';

export default async (req) => {
  // Model A (self-seal): generates the owner keypair server-side and funds it from the deployer
  // wallet, no passkey, no liveness, no client proof of humanity. Nothing in the app calls this
  // anymore (superseded by the passkey/Model-B relay), and unlike the Express bridge's /api/seal
  // this one has no rate limiting at all (stateless function, no in-memory counter survives
  // between invocations) — left open, it's an unlimited free Palette-minting endpoint. Closed by
  // default; set OIRA_ALLOW_SELF_SEAL=1 in the Netlify env to re-enable for a deliberate demo.
  if (process.env.OIRA_ALLOW_SELF_SEAL !== '1') {
    return new Response(JSON.stringify({ error: 'not available — seal from the app (passkey-backed)' }), { status: 404, headers: { 'content-type': 'application/json' } });
  }
  try {
    const { encBlob, traits } = await req.json().catch(() => ({}));
    const blob = encBlob ? Buffer.from(encBlob, 'base64') : undefined;
    const t = (traits && Number.isInteger(traits.undertone) && Number.isInteger(traits.depth) && Number.isInteger(traits.season)) ? traits : undefined;
    const r = await sealPalette({ traits: t, encBlob: blob });
    return Response.json({ palette: r.palette, sealSig: r.sealSig, explorer: r.explorer });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};

export const config = { path: '/api/seal' };
