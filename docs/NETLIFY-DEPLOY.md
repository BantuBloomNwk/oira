# Oira — durable public link (deploy notes)

Goal: a stable https URL so any phone / other testers can use Oira until we move to a real
domain. STAGED here (config + function wrappers written), **not yet deployed or verified** —
I can't run a Netlify deploy from the dev sandbox, so treat this as the runbook.

## The split that decides everything

Oira is two halves:
- **Static + fully client-side** — the whole UI, and critically `custody-test.html` (WebAuthn
  passkey + browser crypto). No server needed. Deploys anywhere over https. Zero secrets,
  zero timeout risk.
- **The bridge** (`/api/seal`, `/api/campaign`, `/api/payout`) — a long-running signer that
  does multi-second devnet delegation round-trips and holds the deployer key. A poor fit for
  short, stateless serverless functions.

## Recommended: two phases

### Phase 1 — DONE, LIVE at https://oira-palette.netlify.app
Static deploy (site `oira-palette`, team `trybegroup`). `/custody-test.html` works fully;
passkeys bind to `oira-palette.netlify.app` (testers re-enroll on the real domain later).
The main app loads with correct branding; `/api/*` calls fall back (no bridge on static)
until Phase 2.

IMPORTANT: the brand marks live in `Oira/brand/` (OUTSIDE `app/`), so `--dir=app` alone
404s every `/brand/*` asset. Publish a COMBINED dir instead. Redeploy after any app/brand
change:
```bash
cd oira   (the repository root)
rm -rf /tmp/oira-publish && cp -r app /tmp/oira-publish && cp -r brand /tmp/oira-publish/brand
netlify deploy --dir=/tmp/oira-publish --functions=/tmp/oira-empty-fns          # draft
netlify deploy --dir=/tmp/oira-publish --functions=/tmp/oira-empty-fns --prod   # promote
```
(`--functions=<empty dir>` skips the staged Functions so a pure-static deploy never tries to
bundle client/node_modules. `mkdir -p /tmp/oira-empty-fns` first.)

### Phase 2 — stand up the bridge
Two options:

**(A) Persistent bridge (recommended) — Fly.io or the Contabo VPS.**
`server.mjs` runs as-is (it's already an Express server). Host it, then point the Netlify
site's `/api/*` at it via a redirect. This keeps the in-memory session (her seal -> her
overnight continuity) and has no function timeout ceiling.
- Set the deployer secret as an env var (below); run `node client/server.mjs`.
- In `netlify.toml` add a proxy redirect: `from = "/api/*" to = "https://<bridge-host>/api/:splat" status = 200`.

**(B) Netlify Functions (staged in `netlify/functions/`).** Works for a quick all-in-one
deploy but with real caveats:
- **Timeout:** the delegate→match→undelegate→settle flow often exceeds the 10s sync limit
  (26s max on paid). If `/api/campaign` times out, use (A) or convert `campaign.mjs` to a
  background function (async 202 + status poll).
- **Stateless:** no shared session across invocations, so seal->overnight identity isn't
  carried (`runOffer` self-seals a fresh matching palette as fallback).
- **Bundling:** functions import `client/node_modules`; set a build step to install them
  (`command = "cd client && npm ci"`) so `included_files` can bundle them.

## Secrets / env (set in Netlify UI → Site config → Environment, or `netlify env:set`)
- `OIRA_DEPLOYER_KEY` — **required for any hosted bridge.** The deployer secret key as a JSON
  byte array (contents of `keys/oira-deployer.json`). NEVER commit it. `oira-chain.mjs` reads
  this env first and falls back to the local file only for dev.
- `OIRA_BASE_RPC` — optional. A paid/dedicated devnet RPC URL. Setting this removes the public
  `api.devnet.solana.com` 429s that break the demo flows. Strongly recommended for any shared
  link. (Deployer is also drained to ~0.006 SOL — top it up before live settle/payout demos.)
- `OIRA_TEE_RPC` — optional override for the MagicBlock TEE endpoint (default is fine).

## Security notes
- A shared bridge exposes signing endpoints publicly. Devnet-only + bounded, but add basic
  rate-limiting before wide sharing.
- Once client-side custody relay lands, the owner key is device-held and the backend only
  builds/submits — which also makes it naturally stateless and a better serverless fit.
- Landing-site A+ hardening (CSP/HSTS/etc.) is specced separately in docs/OIRA-STRATEGY.md for
  the real domain; `netlify.toml` here sets the baseline static headers.
