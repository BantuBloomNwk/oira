# iOS path (#15)

**Recommendation, in one line:** ship the existing PWA on iOS **now** for the beta (it works, and
passkeys work), but plan a **Capacitor** build for the App Store, not a thin wrapper (Apple rejects
those) and not a full native rewrite (unnecessary). The load-bearing reason to go Capacitor sooner
rather than later is **not** the App Store badge, it's that **the camera is unreliable in an installed
iOS PWA**, and the camera is Oira's core flow.

Researched 2026-07-23; the App Store crypto question needs a real submission to settle, and the camera
question needs real-device testing (#22).

## Why "just wrap the Android TWA" doesn't work
iOS has no Trusted Web Activity. The equivalent, a thin `WKWebView` that only loads the website, is
exactly what App Review Guideline **4.2 (minimum functionality)** rejects. So the iOS choices are (a)
PWA-only, no App Store, or (b) a real hybrid/native app that adds native value.

## What the PWA already does on iOS (works today)
Installed via Safari → **Add to Home Screen** (no auto-install banner, a manual step), it runs
standalone and supports: **WebAuthn / passkeys** (Face ID → Oira's custody works), camera/mic, WebGL
(the on-device face model), Web Share, and push on iOS 16.4+ (but **not in the EU**, Apple's DMA
response). The standalone splash fix already landed, so the shell looks right.

## The real iOS risk: the camera in standalone PWA mode
WebKit has a long-standing, still-live class of bugs where **`getUserMedia` is flaky or fails when a
web app runs from the Home Screen in standalone mode**, and, critically, **the camera permission is
NOT persisted for an installed PWA**, so she may be re-prompted every launch (WebKit bug 185448;
STRICH KB). For a general site that's an annoyance; for Oira, whose whole entry point is a camera
reading, it's a potential dealbreaker. Apple also **further restricted PWA capability after 2024**, so
this isn't trending better.

**Implication:** on iOS, the PWA is fine for sign-in/browsing, but the *reading* is the fragile part.
Two mitigations for the beta: (1) if the standalone camera misbehaves, guide iOS users to run the
reading in **Safari itself** (not the home-screen app), where camera is more reliable; (2) handle a
re-permission gracefully. This must be verified on real iOS hardware (#22), the result decides how
urgently the App Store/Capacitor path is needed.

## App Store reality for a "crypto wallet"
Guideline **3.1.5(b)** governs digital wallets, and Apple **has rejected non-custodial wallets**,
demanding licensing/permissions documentation for "cryptocurrency exchange features" and AML/KYC, even
when the app is non-custodial. Non-custodial wallets *do* ship on iOS (Phantom, Solflare), so it's
approvable, but framing and scope decide how much friction:
- **Frame Oira as a beauty / wellness app**, not a crypto or trading app, the wallet is invisible and
  incidental (that's already the product truth). Lead the listing with the reading/palette, not chains.
- **No fiat on/off-ramp and no exchange feature** → stays clear of the licensing demands 3.1.5 aims at.
- On **devnet** (test tokens, no real value) there is arguably no "cryptocurrency" of value in play,
  which further reduces 3.1.5 exposure for the beta. The real 3.1.5 + licensing question arrives with
  **mainnet real payouts**: same trigger as the KYC/AML posture (`docs/legal/KYC-AML-POSTURE.md`).

## "Will the stores let a devnet-only app through?" (the mobile-first question)
Short answer: **yes, and devnet is the easier case, not the harder one, but a devnet build belongs in
the stores' *testing* tracks, not the public listing.**

- **Android is the non-issue.** Beyond the direct **APK** (sideload, our fastest path for testers),
  Google Play has **Internal testing** and **Closed testing** tracks that take the same build with far
  lighter review than production. A devnet app sails through those. Play's own crypto rules mainly bite
  at custodial exchanges and real-money features, a non-custodial, test-token, beauty-framed app is not
  the target. So Android = APK now, Play closed-testing when we want managed distribution.
- **iOS is the one to plan around, and devnet actually *helps*.** The strict rule is **3.1.5(b)** for
  digital wallets and "cryptocurrency exchange features." On **devnet there is no asset of value moving**: no real payout, no fiat ramp, nothing to KYC, so the reviewer questions 3.1.5 aims at largely don't
  apply. The right home for a devnet build is **TestFlight** (up to 10,000 external testers), whose
  review is lighter than a public App Store listing and is *designed* for exactly this beta stage. This
  is how women test it on a real iPhone without us fighting a public-listing crypto review prematurely.
- **The public listings (App Store + Play production) are a *mainnet-era* step**, gated on the same
  triggers as the KYC/AML posture: real payouts. Framing it as a beauty/wellness app with an invisible,
  non-custodial wallet and no on/off-ramp is what keeps that review approvable when we get there.

**So the mobile-first plan the founder wants is fully compatible with devnet:** ship the **APK** and a
**TestFlight** build off the existing web app (via Capacitor, next section) for the devnet beta; move
to the **public store listings only at mainnet**, alongside the KYC/AML and licensing work. Devnet does
not block mobile, it just keeps us in the testing tracks, which is exactly where a beta should be.

## The recommended App Store path: Capacitor
When the App Store matters (before real scale), wrap the existing web app in **Capacitor**:
- It clears guideline **4.2** because it adds genuine native capability, not just a WebView.
- It **fixes the camera**: a native camera plugin is reliable and persists permission, removing the
  single biggest iOS risk above.
- Native **passkey/Face ID**, native **push** (works in the EU too, unlike PWA push), native share.
- Reuses ~all of the existing web codebase: no rewrite. Needs a **Mac + Xcode**, an **Apple Developer
  account ($99/yr)**, and a few review iterations. This is the same wrapper strategy that can replace
  the Android TWA too, giving one hybrid codebase for both stores.

Full native (Swift / React Native) is not warranted, it buys little over Capacitor at much higher cost.

## Recommendation, phased
- **Now (beta):** publish the PWA for iOS (Add to Home Screen) alongside Android. Zero cost, available
  immediately, passkeys work. **Test the camera on real iOS hardware (#22)**; if standalone is flaky,
  route iOS readings through Safari and document it.
- **Before wider launch / App Store:** build the **Capacitor** app (fixes the camera, clears 4.2, adds
  native push), frame it as beauty/wellness, keep it non-custodial with no fiat ramp. Do the same for
  Android to converge on one hybrid codebase and retire the TWA.
- **At mainnet / real payouts:** revisit 3.1.5 licensing with counsel, in step with the KYC/AML work.

Sources: [PWAs on iOS 2026 (MobiLoud)](https://www.mobiloud.com/blog/progressive-web-apps-ios) ·
[iOS PWA camera issues (STRICH)](https://kb.strich.io/article/29-camera-access-issues-in-ios-pwa) ·
[WebKit getUserMedia standalone bug 185448](https://bugs.webkit.org/show_bug.cgi?id=185448) ·
[Apple crypto/NFT rules (AppleInsider)](https://appleinsider.com/articles/22/10/24/apple-has-new-app-store-rules-for-nfts-and-cryptocurrency) ·
[Apple crypto-wallet approval requirements](https://gipresearch.com/patent-attorney/apple-app-store-crypto-wallet-approval-requirements/)