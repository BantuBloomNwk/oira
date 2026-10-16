# Security

## Reporting a problem

Email **info@myoira.com** with "Security" in the subject. Tell us what you found and how to
reproduce it. Please don't open a public issue for anything that could hurt a user, and give us
a reasonable chance to fix it before you talk about it publicly. We'll reply within a few days.

## What is live

Oira runs on Solana **devnet** with a test stablecoin. No real money moves yet.

| Part | Where | Ships to users |
|---|---|---|
| The app (PWA and Android) | `app-next/` | Yes |
| The bridge API | `client/server.mjs`, `client/oira-chain.mjs`, `mcp/`, built by `client/Dockerfile` | Runs on our server |
| The Solana program | `program/` | Deployed on devnet |
| The open skin study service | `study-service/` | Runs on our server |
| The devnet test harness | `client/e2e/` | **No.** Tests only, never in the app, the APK or the bridge image |

## Notes for automated scanners

- **`client/e2e/`** holds test scripts that send transactions to devnet with a funded test key.
  They build every transaction themselves, and they are excluded from the bridge image by
  `.dockerignore`. Findings there do not reach a user.
- **`skipPreflight`** on rollup sends follows the MagicBlock ephemeral rollup pattern. Those
  transactions are checked by the rollup validator.
- **`@solana/web3.js` v1** is what the MagicBlock SDK and the Solana Mobile wallet adapter are built
  on today. We'll move when they do.

## Package advisories we have looked at

| Package | Why it is accepted |
|---|---|
| `image-size`, `uuid` (app) | Pulled in by React Native and iOS build tools that the web build never uses. Pinned to fixed versions with npm `overrides` anyway. |
| `elliptic` | Comes in through the MagicBlock SDK. No fixed version exists yet. |
| `bigint-buffer` | Comes in through `@solana/spl-token`. No fixed version exists yet. |
| `extract-zip` | Comes in through `puppeteer-core`, a test-only dev dependency. Never at run time. |

Container base images are pinned by digest and the bridge and study images run as a non-root
user.
