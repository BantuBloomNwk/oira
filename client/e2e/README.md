# Devnet test harness

These scripts are tests. They are never shipped in the app, the APK or the bridge image.

The `*-e2e.mjs`, `spike-*` and `per-audit` scripts send real transactions to Solana devnet and
need a funded devnet key (`OIRA_KEYPAIR`, or `keys/oira-deployer.json` at the repo root). The
`test-*` scripts run in CI on every push and need no key.

Run them from `client/`, for example `node e2e/settle-match-e2e.mjs`.
