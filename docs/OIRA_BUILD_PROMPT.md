# OIRA — Full Build Prompt (v0.2, MagicBlock Solana Blitz weekend)

How to send this to Claude Code in your terminal:

```bash
# 1. Make a project folder and drop this file in it
mkdir oira && cd oira
mv ~/Downloads/OIRA_BUILD_PROMPT.md .

# 2. Start Claude Code inside the folder
claude

# 3. First message to Claude Code:
#    "Read OIRA_BUILD_PROMPT.md in full. Restate the security invariants and the
#     milestone plan back to me, then start on M1. Do not skip the design system."
```

Work milestone by milestone; after each one, ask it to run the app and state what is proven working before moving on. Fill the three placeholders marked `<<...>>` before starting.

---

You are the lead engineer building **Oira** (an Aurora K product; named for Iris, the goddess who carried messages on a rainbow): a privacy-first mobile app where a woman turns one selfie into a private, portable "Palette" (undertone, seasonal colour palette, face shape, feature traits) sealed inside a MagicBlock Private Ephemeral Rollup (PER) on Solana. Her delegated agent answers brand questions inside the enclave, under her standing rules, **even while her phone is locked or offline**; brands only ever receive an attested yes/no plus a receipt, and she is paid in USDC for consented matches. Target device: Solana Mobile Seeker (Android); must also run on any modern Android phone.

The demo loop to build: **one selfie → she confirms and seals her Palette → she sets night rules and locks the phone → a brand question is answered inside the PER with a hardware-attested receipt → she wakes to a "While you slept" digest with a payout.**

## Why the enclave is load-bearing (internalize this; judges will probe it)

If matching only ran on her phone, the phone could answer offers locally and no enclave would be needed. The product's core requires three things a device cannot provide: (1) **availability** — brand questions get answered while her phone is off; (2) **brand-side trust** — the answer carries TEE attestation, so a brand can rely on it without ever holding her face or trusting her client; (3) **non-interactive consent enforcement** — her standing rules (query budgets, price floors, category blocks) are enforced by the enclave even when she is asleep, not by an app she has to open. On-device checks still exist, but only for HER OWN colour questions (free, instant, never leave the phone). All brand-facing matching is enclave-only. Never blur this line in code or copy.

## Non-negotiable security and integrity invariants

1. Raw camera pixels never leave the device except the single opt-in cloud analysis call (TLS, stateless, nothing stored; only structured JSON traits retained anywhere).
2. Biometrics gate keys inside device secure hardware only (Seed Vault on Seeker, Android Keystore/passkeys elsewhere). No biometric template, embedding, or image hash is ever transmitted or stored server-side.
3. The Palette exists in exactly two places: encrypted at rest on-device, and as private delegated state inside the PER. No backend database of user traits, ever.
4. No email collection anywhere. Passkey (secp256r1) or Mobile Wallet Adapter/Seed Vault sign-in only.
5. **Query budget (anti-abuse rate limiting).** Enforce in the enclave program, not the client: per-brand query budget (default 3 questions per brand per rolling 30 days), a global monthly cap across all brands, per-field budgets, and a visible budget meter in her UI. Every query decrements on-chain state inside the PER; exhausted budget returns a hard error, not a no-match.
6. **Stake-gated offers.** Brands escrow funds per offer campaign; each question consumes stake whether or not it matches, and payouts to her come from that escrow. Free questions do not exist.
7. **Auditable receipts.** Every enclave answer emits a signed receipt (brand, field, yes/no/declined, timestamp, attestation ref) she can read in plain language in a Receipts screen. Receipts contain no trait values.
8. **Cross-brand insight = privacy-preserving aggregates only.** Cross-brand shade insights are computed inside the enclave as aggregates only, with a minimum-contributor floor before any cell is shown (suppress any cell with too few contributors; document the threshold in code comments and in the brand-facing report). No per-user exports exist, including for us.
9. **Sybil resistance.** One Palette per attested device + passkey pair; active liveness at capture (blink + head turn via MediaPipe); payout velocity caps; and the economics themselves: brands pay per **accepted offer** (sample shipped to a verified address, completed survey), not per match, so fake selfies have nothing to farm.
10. Undertone/shade logic calibrated and unit-tested across the full 10-point Monk Skin Tone scale; fixtures at MST 1, 4, 7, 10 gate CI. **Plus the confirmation step:** after the reading, she can adjust undertone/season before sealing ("This is me — seal it"). Her confirmation is recorded as part of the Palette. For the stage demo, always use a pre-confirmed Palette; never do a live first-read on stage.
11. Nothing about her ethnicity, undertone, or traits may appear in public Solana state, logs, analytics, or error messages.
12. Consent copy in the app must describe exactly what the system does; assume a BIPA/GDPR review will read both side by side.

## Business model framing (bake into the brand dashboard mock)

Brands do not pay per match (fits no budget line). They fund **campaigns**: escrowed budgets that pay out per accepted sample or completed survey (a CPA line their teams already have), plus optional aggregate insight reports (a market-research line). Her micro-earnings are the consumer-facing surface of those escrows.

## Stack

- **App:** React Native (Expo dev client), Android target. Solana Mobile Stack: `@solana-mobile/mobile-wallet-adapter-protocol` + Seed Vault on Seeker; passkey wallet fallback (secp256r1, e.g. Lazor kit) for non-Seeker devices.
- **On-device vision:** MediaPipe Face Landmarker (Android task API): 478 landmarks → face-shape classification from ratios; active liveness (blink + turn). Undertone: sample calibrated cheek/jawline/neck patches, grey-world + face-prior white balance, CIELAB conversion, classify cool/neutral/warm/olive from a/b signatures, map depth to the Monk scale. Offer an optional white-balance calibration flow (any white paper sheet) for hard lighting. All offline.
- **Opt-in cloud reading:** Anthropic API (`claude-sonnet-4-6`) vision call, consent-gated, returning strict JSON `{face_shape, features:{eyes,brows,nose,lips,cheeks}, season, palette_hex[], eyewear:{suits[],avoid[]}, hair_direction[], confidence}` and nothing else. Discard the image after the response. On disagreement, the on-device undertone wins and season is re-derived from it.
- **Encryption:** encryption key from Keystore/Seed Vault (or HKDF from signing key); XChaCha20-Poly1305 over the trait JSON before any transport.
- **Chain:** Anchor programs on devnet with the MagicBlock ephemeral-rollups-sdk delegation hooks and Permission Program per the current PER quickstart at docs.magicblock.gg (delegation hooks, permission hooks, TEE auth-token flow, devnet PER endpoints, Magic Router RPC).
- **Agent:** her standing policy lives ON-CHAIN in the delegated state (see `night_rules` below) so the enclave enforces it without her device. The in-app agent (LLM with tools) is the interface for setting rules, parsing products for her own checks, and reading receipts: tools `parse_product`, `set_night_rules`, `read_receipts`, `cash_out`, plus `check_colour_local` which never touches the network.
- **Payments:** USDC devnet; payouts via MagicBlock Private Payments API where available on devnet, else stubbed behind a `PrivatePayout` interface labelled "simulated" in the UI until swapped.

## Programs (Anchor)

`palette_vault`:
- PDA `[b"palette", owner]`: `owner`, `enc_blob`, `schema_version`, `field_commitments[]`, `confirmed_at` (set by her confirmation step), `created_at`.
- `initialize_palette`, `update_palette` (owner-signed), `confirm_palette`.
- `set_night_rules(rules)` — `{max_queries_per_brand: u8, max_queries_global: u8, min_payout: u64, blocked_categories: bitmask, active: bool}` stored in the PDA so the enclave enforces it offline.
- `delegate()` / `undelegate()` — MagicBlock delegation hooks.
- `grant(field_id, grantee)` / `revoke(field_id, grantee)` — Permission Program ACLs.
- `match(offer_id, product_traits)` — **PER-only**: verify brand stake ≥ query cost, verify ACL, verify and decrement query budgets, decrypt in-enclave, compare, emit `MatchReceipt {offer_id, field_id, verdict: Match|NoMatch|Declined, ts, attestation_ref}`. Budget-exhausted and rule-declined paths must exist and be demoable.
- `record_consent(receipt_hash)` — commits to base layer on undelegate/settle.

`offer_board`: brands post campaigns `{offer_id, target_fields, target_hash, escrow_usdc, per_query_cost, per_accept_payout, uri}` with escrow transfer on creation. Seed 5 mock campaigns (deep cool, deep warm, olive neutral, two season-based) so a true match always exists for the presenter, plus one that her night rules decline.

## Design system (implement exactly; do not substitute defaults)

Two themes shipping day one; the reference board is `Oira_Design_Concepts.html` in this folder — open it in a browser and match it.

**Light — "The Vanity Letter" (default):** background blush `#FBF3EE`; text plum ink `#43203B`; primary action rose mauve `#C9799B` / deep `#A85578`; seal gold `#D6A756` used ONLY for the seal and attestation marks; lilac whisper `#B49BE0`; card surface `#FFFBF7` with rose-tinted shadow `rgba(168,85,120,.14)`; cards radius 20px with ONE 6px corner (bottom-left). Type: Fraunces (display; italics for emotional words) + Karla (UI). 
**Dark — "Iris After Dark" (night mode, and the Goodnight/While-you-slept flow):** background aubergine `#1B1120`; text moonmilk `#F3E9E4`; dew-glass cards `rgba(255,244,240,.07)` with 1px `rgba(243,233,228,.14)` border and blur; glow accents rose `#E9B8D2` and lilac `#C9A9EF`; the **iris ribbon** conic gradient (`#F4A7B9 → #E8C79A → #BFE3C0 → #A9CBEF → #C9A9EF`) as a slow animated rim of light around key moments.

**Signature component — the wax seal:** gold, organic (not a perfect circle), italic Fraunces "O", pressed onto screen with scale 1.12→1 + medium haptic when she seals; a mini seal stamps every attested receipt. In dark mode it becomes the iridescent "moonseal".
**Motion spec (respect prefers-reduced-motion):** melanin ribbon shimmer sweep 5s; button silk sheen sweep 3.6s; capture oval breathing 3.4s; shutter pulse; seal press + halo; staggered fade-up on lists; iris rim rotation 12s. Nothing bounces; everything breathes.
**Imagery:** warm gradient + film-grain overlays (SVG turbulence) as placeholders now; real photography later must be warm-lit portraits across the full Monk range, never stock-white-default.
**Copy rules:** no crypto vocabulary outside settings fine print. Vocabulary: fingerprint, sealed, vault, questions, receipts, earnings. Key strings: "Your colours, kept." / "This is me — seal it" / "Sleep. Your palette stays awake." / "2 of 3 questions used this month" / "She never saw this screen. That is the point."

## App screens (build order)

1. Welcome (ribbon + fingerprint sign-in) 2. Capture (liveness, lighting coach) 3. Reading + **Confirm** ("Adjust" chips on undertone/season, then "This is me — seal it") 4. The Seal 5. **Goodnight / night rules** 6. Agent home with **While you slept** digest, per-brand budget meters, earnings 7. Receipts (plain-language audit log) 8. Check a colour (on-device, marked "never leaves the device").

## Milestones (two-person split)

- **M1 (Fri night):** scaffold, dev client on Seeker/emulator, MWA + passkey sign-in, camera capture with liveness.
- **M2 (Sat AM):** landmarks + undertone classifier, Monk fixtures green in CI, reading cards + confirm step, both themes wired.
- **M3 (Sat PM):** encryption; `palette_vault` + `offer_board` deployed; delegation into devnet PER; seal flow; night rules stored on-chain.
- **M4 (Sun AM):** `match` in the PER with budgets, stake checks, and declines working; receipts screen; the offline demo path (question answered with the app closed).
- **M5 (Sun PM):** payout via `PrivatePayout`; While-you-slept digest; polish to the design board; rehearse the demo twice on the Seeker.

Person A: M2 + M4 (vision, agent, enclave logic). Person B: M3 + M5 (chain, payments, polish). Both: M1.

## Demo script (90 seconds)

Pre-confirmed Palette already sealed. Live: open app → show night rules → lock the phone on camera → trigger the brand question from a laptop "brand console" → receipt appears on the console with attestation → unlock the phone → While-you-slept digest: 1 match, 1 declined by her rules, +$0.15, budget meter at 2 of 3 → close on the line: "She was asleep. Her Palette was working. Her face never left the phone, and the brand got an answer it can trust."

## Acceptance criteria

- Fresh install → confirmed, sealed Palette in under 3 minutes with no email, password, or seed phrase.
- A brand question is answered by the enclave while the app is force-closed; the receipt carries an attestation reference.
- The 4th question from one brand in a month fails with a budget error, live if asked.
- An offer below her `min_payout` is auto-declined with a receipt, live if asked.
- Monk fixtures MST 1/4/7/10 pass in CI; a deliberate misread fails the build.
- `grep -r` for trait field names in any server/relay code returns only enclave program code.
- Receipts exist on-chain; trait values do not, verifiable by a judge.

Placeholders: `<<ANTHROPIC_API_KEY handling — proxy or in-app vault, never hardcoded>>`, `<<MagicBlock devnet PER endpoint + Delegation/Permission program IDs from current docs>>`, `<<devnet USDC mint>>`.

Do not fake on-chain interactions in the final build; stubs live only behind `PrivatePayout` and are labelled "simulated" in the UI until replaced. After each milestone, state what is proven working on the device and list the exact commands run.
