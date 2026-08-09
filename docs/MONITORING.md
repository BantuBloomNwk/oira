# Bridge monitoring (#17)

The Oira bridge (`client/server.mjs`) now reports real health and can alert the founders when
something breaks — so a failed seal or a drained deployer wallet surfaces immediately instead of
sitting silently in a log. It is **server-side only and privacy-respecting**: it tracks the bridge's
own errors and status, never user data, and everything it logs or alerts is scrubbed of anything
key-, address-, or blob-shaped first (`client/oira-monitor.mjs`).

## 1. Health endpoint — `GET /api/health`

Returns 200 while the process is up, with a real status body (cached + refreshed in the background, so
it never blocks on a slow RPC):

```json
{
  "ok": true, "service": "oira-bridge",
  "degraded": false,                       // true if RPC/TEE unreachable OR deployer < 1 SOL
  "uptimeSec": 3, "startedAt": "…",
  "errors": { "count": 0, "last": null },  // scrubbed; no user data
  "deployer": { "balanceSol": 11.06 },
  "rpc": { "ok": true }, "tee": { "ok": true },
  "alertChannel": false                    // true once an alert sink is configured (below)
}
```

**Uptime probe:** point any monitor (e.g. UptimeRobot, Better Stack, a cron) at
`https://oira.161-97-74-212.sslip.io/api/health`. Alert on:
- **down** — no response / non-200 (the process is dead → Docker `--restart unless-stopped` will also
  try to bring it back), and
- **degraded** — keyword-match `"degraded":true` in the body (RPC/TEE down or deployer low).

## 2. Alerts — where they go

Alerts are sent only if you configure a sink (otherwise they are logged and nothing is sent). Set
either or both as env on the bridge container:

- **Telegram** (if you already run a Telegram bot on the VPS): `OIRA_TG_TOKEN` (bot token) + `OIRA_TG_CHAT`
  (chat id). Create/point a bot, get your chat id, set both.
- **Generic webhook** (Slack, Discord, or anything accepting a JSON POST): `OIRA_ALERT_WEBHOOK` — the
  message is sent as both `{"text":…}` (Slack/generic) and `{"content":…}` (Discord).

To add them, recreate the container with the extra `-e` flags (alongside `OIRA_DEPLOYER_KEY`), e.g.:

```
docker run -d --name oira-bridge --restart unless-stopped --network bridge -p 127.0.0.1:8778:8778 \
  -e OIRA_DEPLOYER_KEY="$(cat /opt/oira/deployer.json)" \
  -e OIRA_TG_TOKEN="<bot-token>" -e OIRA_TG_CHAT="<chat-id>" \
  oira-bridge:new
```

Optional but recommended: also set `OIRA_BASE_RPC` to a paid/dedicated devnet RPC — it removes the
public-RPC 429s that make flows flaky, and it will show up as `rpc.ok:true` more reliably.

## 3. What triggers an alert
- A failed **seal** (HTTP `/api/seal` and the WS `relay-seal` path — a real woman's seal failing),
  **payout**, or brand **offer**. Alerts are rate-limited to ~1 / 45s so a flap can't spam.
- An **uncaughtException** (level `critical`).
- Every 5 min, a proactive check: **deployer balance < 1 SOL**, **base RPC unreachable**, or **TEE
  unreachable** — so you can top up / react before it breaks a seal.

Transient devnet 429s are recorded (they count toward `errors.count`) but do **not** alert — they are
expected noise the bridge already rides through.
