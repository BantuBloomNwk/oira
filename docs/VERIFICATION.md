# Oira — Verification Ledger

**Purpose.** Turn "is it fully done?" from a feeling into a table. For every user-facing flow, this
records *what automated check covers it*, *whether that check exercises the code the app actually
runs*, *whether it verifies the outcome independently*, and *when it last passed*. If a row is blank
or amber, the flow is **not closed** — no matter how many other things are green.

Maintained by hand for now. Update the "Last green" column whenever a check is run (see
[How to run](#how-to-run)); add a row whenever a new user-facing flow ships.

---

## What "green" has to mean here

A passing check is only trustworthy if it has all four properties. Each was, at some point in this
project, the reason a "done" task still had a gap:

1. **Exercises production code, not a parallel copy.** Oira has *two* implementations of each on-chain
   flow: the `client/*-e2e.mjs` scripts build the instructions **inline**, and the production bridge
   `client/oira-chain.mjs` (what `server.mjs` and the app call) builds them **its own way**. They
   drift independently. On 2026-07-21, five inline scripts were green while the shipped bridge was
   broken — only `overnight-real-e2e` (which calls the real bridge) caught it. **Program-level green
   ≠ the product works.**
2. **Independent oracle, not author-graded.** "Script prints `PASS ✓`" is weak — the author chose the
   assertion. Strong checks read on-chain state independently (her token-balance *delta*, an account's
   owner flipping back to the program, an escrow closing).
3. **Runs unattended on a schedule.** Drift stays invisible until something *runs* the check. Local
   one-off green rots. The weekly `.github/workflows/devnet-e2e.yml` is the mechanism, now **ARMED**
   (2026-07-23): the `OIRA_DEPLOYER_KEY` repo secret is set and the deployer wallet is funded, so it
   runs every Monday 06:00 UTC + on manual dispatch. (Best-effort until a paid `OIRA_BASE_RPC`
   replaces the 429-prone public RPC.)
4. **A flow is "closed" only when a check with the three properties above is green *on a schedule*.**

### Legend
- **Level** — `bridge` = drives production `oira-chain.mjs`/`server.mjs`; `program` = rebuilds
  instructions inline, validates the on-chain program/ABI only; `fast` = deterministic unit test, no
  network, runs every push; `none` = no automated check.
- **Oracle** — `strong` = reads independent on-chain state (balances, account owner, rejection);
  `state` = reads on-chain verdict/counter (independent of a self-print, but not money movement);
  `—` = self-asserted or n/a.
- **Last green** — date the check last actually passed. `every push` = fast tier via CI.
  Live devnet runs are dated; ⚠ = relies on an earlier run, not re-verified this arc.

---

## Coverage

| # | User-facing flow | Check(s) | Level | Oracle | Last green |
|---|---|---|---|---|---|
| 1 | **Seal palette** — device/passkey (sponsored fee) | `relay-seal-e2e`, `relay-ws-e2e` (over WS→server) | bridge | state | 2026-07-23 |
| 2 | Seal palette — **connected wallet** (self-funded, `assurance='wallet'`) | `wallet-seal-e2e` | bridge | **strong** (balance drop + loud throw + no-palette) | 2026-07-23 |
| 3 | **Re-seal** ("recheck your colours"), idempotent CPI | `reseal-e2e` | bridge | state | 2026-07-23 |
| 4 | **Overnight: match → settle → payout** (full product flow) | `overnight-real-e2e` | bridge | **strong** (her oUSDC delta) | 2026-07-23 |
| 4b | same flow, program level | `model-b-e2e`, `settle-match-e2e` | program | strong | 2026-07-23 |
| 5 | **Real in-enclave match** (program computes verdict) + commitment **binding** + **read-gating** | `match-real-e2e` | program | state (verdict+receipt) | 2026-07-23 |
| 6 | **Night rules** (min-payout floor, blocked category) | `night-rules-e2e` | program | state (verdict) | 2026-07-23 |
| 7 | Query budget — **per-epoch** | `per-palette-e2e` | program | state (count+reject) | 2026-07-23 |
| 7b | Query budget — **lifetime cap** | `model-b-e2e` | program | strong (reject) | 2026-07-23 |
| 7c | Query budget — **per-brand cap** | `perbrand-e2e` | program | state (reject) | 2026-07-23 |
| 8 | **Settlement bound to a real match** + forgery resistance (wrong nonce / wrong offer / double-settle) | `settle-match-e2e`, `model-b-e2e` | program | strong (delta+reject) | 2026-07-23 |
| 9 | **Hidden no-match** / payee unlinkability (L5) | `model-b-e2e` | program | state (`payee_commit==0`) | 2026-07-23 |
| 10 | **Private TEE payout** (brand→her, in-enclave) | `payout-e2e` | program | strong (balance) | 2026-07-23 |
| 11 | **Custody**: passkey→owner key, browser/Node parity | `test-custody-parity` | fast (runs real `app/custody.js`) | strong (identical addr) | every push |
| 12 | **Device recovery** (fallback key export/import) | `test-custody-recovery` | fast (real code) | strong (identical addr) | every push |
| 13 | **Sybil / self-seal gate** (`OIRA_ALLOW_SELF_SEAL` off by default) | `test-self-seal-gate` | fast (gate fn + runOffer call-site) | state (blocks/allows) | every push |
| 14 | **Concierge LLM** vision judge | `scripts/test-llm.mjs` | fast | — (prompt-shape only) | every push — ⚠ **model not wired** |
| 15 | MCP policy | `mcp/test-mcp.mjs` | fast | state | every push |
| 16 | **Browser PWA** — loads, core screens render, reading camera inits, oval overlays the sampled region, no uncaught JS | `test-app-smoke.mjs` | fast (headless Chromium, real app + fake camera) | state (oval geometry) | every push |
| 16b | Browser PWA — the *rest* of the taps (scan completes → seal → view) | — (needs passkey + bridge) | **none** | — | manual |
| 17 | **Scanners** — colour/Monk bucket, skin-condition bucket, curl selector (classifiers) | `test-app-smoke.mjs` | fast (classifiers on synthetic inputs — deterministic) | shape (valid bucket fields, curl index) | every push |
| 18 | **Brand Studio** (`app/brand/`) | `test-app-smoke.mjs` | fast (headless load of `/brand/`) | render (title + body, no page error) | every push |

---

## Open gaps (the actionable part)

Ranked by how load-bearing the flow is versus how exposed it is.

1. **Rows 16b/17/18 — browser coverage is now a smoke test, not the full flow.** `test-app-smoke.mjs`
   (row 16) loads the PWA in headless Chromium with a fake camera and proves it renders, the reading
   camera inits, the oval overlays the sampled region, and nothing throws — it already caught a real
   oval-overflow bug. Still uncovered: the scan actually *completing*, seal, the results view (need a
   passkey + the bridge), the scanners, and Brand Studio. Same wall as production-closeout #22
   (real-device testing). *Next:* extend the smoke test to drive a mocked-seal path, and add a
   scanner-specific check with a synthetic skin frame.
2. **Row 2 — the self-funded (connected-wallet) seal path — CLOSED (2026-07-23).** `wallet-seal-e2e`
   proves a funded connected wallet self-funds a real seal (palette delegated, her own balance spent,
   NOT sponsored) and an underfunded one is rejected loudly with an actionable shortfall + her address,
   nothing sealed on base. Was: untested; `assurance='wallet'` takes the `ensureOwnerFunds`-throws branch.
3. **Row 13 — the self-seal Sybil gate — CLOSED (2026-07-23).** `test-self-seal-gate` (fast, offline,
   every push) proves `assertSelfSealAllowed` blocks by default, that only `OIRA_ALLOW_SELF_SEAL=1`
   re-enables it, that the error is actionable, and that `runOffer` is genuinely gated at the call site.
4. **Most rows are `program`, not `bridge`.** Only 1–4 and relay-ws touch the shipped code; 5–10 prove
   the on-chain program but not that `oira-chain.mjs` calls it correctly. That's exactly the class of
   gap that hid the 2026-07-21 funding bug. *Next (incremental):* where a bridge function already
   exists, prefer routing the e2e through it over a fresh inline rebuild.
5. **Unattended runs — ARMED (2026-07-23).** The `OIRA_DEPLOYER_KEY` repo secret is set and the
   deployer wallet is funded, so `devnet-e2e.yml` runs weekly (Mon 06:00 UTC) + on manual dispatch;
   the fast tier already runs every push. Residual: the CI wallet IS the program upgrade authority
   (bounded — devnet, schedule/dispatch-only off `master`; harden with a multisig authority before
   mainnet — closeout #11), and reliability is best-effort until a paid `OIRA_BASE_RPC` removes the
   public-RPC 429s.
6. **Row 14 is a prompt-shape test, not the model.** The vision judge's *prompt path* is green
   (17 tests) but the ~3GB Gemma weight is not wired (`docs/CONCIERGE-LLM-RUNBOOK.md`), so the actual
   inference is unverified.

---

## How to run

**Fast tier** (deterministic, no SOL, every push — also run locally before a commit):
```
cd client && node test-custody.mjs && node test-custody-parity.mjs && node test-custody-recovery.mjs
node scripts/test-llm.mjs
cd mcp && npm test
```

**Devnet tier** (real SOL from the deployer wallet, real TEE round-trips). Bridge-level first — those
are the ones that tell you the *product* works:
```
cd client
node relay-seal-e2e.mjs        # bridge: seal
node reseal-e2e.mjs            # bridge: re-seal
node overnight-real-e2e.mjs    # bridge: seal → match → settle → payout (strongest single check)
# program-level (ABI / defense stack):
node match-real-e2e.mjs   node model-b-e2e.mjs   node settle-match-e2e.mjs
node night-rules-e2e.mjs  node per-palette-e2e.mjs  node perbrand-e2e.mjs  node payout-e2e.mjs
# relay-ws needs server.mjs running first (see devnet-e2e.yml for the exact start+poll sequence)
```
The deployer wallet (`6wWrCWZ3y9UveFG1t5GzupJ1qkWn5r4QPWg8EmELA8Xz`, devnet) must hold enough SOL;
each devnet script funds fresh keypairs + escrows (~0.5–1 SOL/run). Top up at
https://faucet.solana.com. The public devnet RPC rate-limits hard — the scripts carry a transient-429
guard; occasional `429` lines in the output are retried, not failures.

**Retired:** `campaign-e2e` (2026-07-21) — it proved a brand could settle by self-asserting
`accepted=true`, a path deliberately deleted from the program. `settle-match-e2e` is the canonical
money-rail proof. **Known-red:** none, as of 2026-07-23. The full devnet suite (11 scripts) was
re-verified green against the SDK-0.16.2 security-upgraded program (in-place upgrade, deploy slot
478062113) on 2026-07-23 — every delegation/undelegation path clean on the hardened macro.

---

## Definition of closed

A flow is **closed** when a check that (1) drives production code, (2) verifies the outcome with an
independent oracle, and (3) runs on a schedule is green. By that bar, today: rows 4, 11, 12, 13, 16 are fully
closed; rows 17 and 18 are now closed too (the scanner classifiers run on synthetic inputs, and Brand
Studio loads headlessly, both on every push via `test-app-smoke.mjs`); the devnet rows (1–10) are now
schedule-armed too (gap 5 done — the weekly workflow), so every covered row refreshes unattended. Only
16b remains **open** — the browser scan→seal→view flow, which needs a passkey and the live bridge and
so can't run unattended yet.
