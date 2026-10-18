import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ShoppingBag, ShieldCheck, Moon, Disc3, Palette, Users, ArrowLeft } from 'lucide-react';
import confetti from 'canvas-confetti';
import type { SealedReading } from './lib/confidence';
import { IdentitySheet } from './components/IdentitySheet';
import { boot, currentOwner, connectedWalletAddress, useFingerprint, type Owner } from './lib/identity';
import { hasEnrolled } from './lib/custody';
import { warmUp } from './lib/scan';
import { load as loadHer, save as saveHer, hasBeenReadBefore } from './lib/remember';
import { sealViaDevice } from './lib/seal';
import { proofFrom, saveProof, loadProof, findExistingSeal, type Proof } from './lib/proof';
import { isNativeApp, BRIDGE_ORIGIN } from './lib/native';
import { monkFromIta } from './lib/monk';
import { SEAL_FAIL, SEAL_KEPT } from './lib/voice';

import { 
  UserProfile, 
  SeasonPalette, 
  ColorSwatch, 
  ProductItem, 
  TrendDataPoint,
  NightRulesConfig,
  BrandQueryLog,
  OnboardingModel
} from './types';
import { 
  initialUserProfile, 
  seasonalPalettes, 
  marketplaceProducts,
  initialNightRulesConfig,
  initialBrandLogs
} from './data/paletteData';

import { Header } from './components/Header';
import { SeasonCard } from './components/SeasonCard';
import { SkinTrendsCard } from './components/SkinTrendsCard';
import { Marketplace } from './components/Marketplace';
import { SwatchDetailModal } from './components/SwatchDetailModal';
import { ShareCardModal } from './components/ShareCardModal';
import { ProductModal } from './components/ProductModal';
import { CartDrawer } from './components/CartDrawer';
import { SeasonSelectorModal } from './components/SeasonSelectorModal';

import { OnboardingView } from './components/OnboardingView';
import { ColorWheelView } from './components/ColorWheelView';
import { NightRulesView } from './components/NightRulesView';
import { ConciergeDrawer } from './components/ConciergeDrawer';
import { BrandBoardModal } from './components/BrandBoardModal';
import { NavigationMenuDrawer } from './components/NavigationMenuDrawer';
import { BottomNavigationBar, AppNavView } from './components/BottomNavigationBar';
import { AskOiraView } from './components/AskOiraView';
import { SealedVaultView } from './components/SealedVaultView';
import { DeepScanView } from './components/DeepScanView';
import { ReadingView } from './components/ReadingView';
import type { Finding, ScanFrame } from './lib/scan';
import { WhileYouSleepView } from './components/WhileYouSleepView';
import { DayDecor } from './components/Decor';
import { SplashView, splashSeen } from './components/SplashView';
import { ProfileSheet } from './components/ProfileSheet';
import { PrivacySheet } from './components/PrivacySheet';
import { OnDeviceSheet } from './components/OnDeviceSheet';
import { Toast, type ToastMessage } from './components/Toast';
import { generateHandle } from './lib/handle';
import { useIdle } from './hooks/useIdle';
import { useTimeOfDay } from './hooks/useTimeOfDay';
import { installContext, loadConcierge } from './lib/concierge';
import { activate as activateLocalModel, modelState } from './lib/localModel';
import { sampleBrandQuery, type HerRules } from './lib/brandsim';
import { undertoneCode, seasonCode } from './lib/traitcodes';
import { fetchMyAnswers, type MyAnswer } from './lib/answers';
import { enableAnswerAlerts } from './lib/alerts';
import { diag } from './lib/diag';
import { saveRulesToPalette } from './lib/rulesync';

interface CartItemEntry {
  product: ProductItem;
  quantity: number;
}

export default function App() {
  // App Navigation & Screen State
  /* The splash comes before everything, once, and never again for a returning
     woman. After it, the AI Studio entrance page takes over. */
  /* Everything she told us last time, read once before the first render so nothing flashes
     the wrong screen at her on the way to the right one. See src/lib/remember.ts. */
  const her = useMemo(() => loadHer(), []);
  const knownHer = hasBeenReadBefore();

  /* A woman who has already been read goes to her palette. No splash, no intro, and above all
     no camera: asking her to scan again is the app failing to recognise somebody it spent
     three minutes getting to know. The intro is still reachable from the menu whenever she
     wants it, and coming out of it puts her back on her palette rather than the camera. */
  const [showSplash, setShowSplash] = useState(() => !knownHer && !splashSeen());
  const [isOnboarding, setIsOnboarding] = useState(!knownHer);
  /* True when she asked to see the entrance again rather than arriving at it. */
  const [replayingIntro, setReplayingIntro] = useState(false);
  const [activeView, setActiveView] = useState<AppNavView>('home');

  // User & Palette State
  /* Sealed only if there is a real seal behind it: one this phone made, or one found on chain
     for her address (below). The sample profile used to start sealed, so the badge showed for
     women who had never sealed anything. */
  const [profile, setProfile] = useState<UserProfile>(() => ({
    ...(her?.profile ?? initialUserProfile),
    isSealed: loadProof() !== null,
  }));
  const [activeSeason, setActiveSeason] = useState<SeasonPalette>(() => {
    const id = her?.seasonId ?? initialUserProfile.seasonId;
    return seasonalPalettes.find((p) => p.id === id) || seasonalPalettes[0];
  });

  // Night Rules & Overnight Intelligence State
  const [nightRules, setNightRules] = useState<NightRulesConfig>(initialNightRulesConfig);
  const [brandLogs, setBrandLogs] = useState<BrandQueryLog[]>(initialBrandLogs);
  /* Real answers to real brand briefs, loaded when she opens her night screen. null until then. */
  const [myAnswers, setMyAnswers] = useState<{ answers: MyAnswer[]; earned: number } | null>(null);
  const [answersState, setAnswersState] = useState<'idle' | 'loading' | 'failed'>('idle');

  // Modals & Interactive Drawers
  /* ColorWheelModal and NightRulesModal used to live here too: full second copies of the
     colour wheel and the night rules, rendered but never opened, since nothing ever set
     their flags true. Two copies of one screen is how a fix lands in one of them and not
     the other, and that is exactly what happened: the payout stepper was corrected in the
     view and the dead modal kept its own two dollar ceiling. Both are deleted. */
  const [isConciergeOpen, setIsConciergeOpen] = useState(false);
  const [isBrandBoardOpen, setIsBrandBoardOpen] = useState(false);
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);

  const [selectedSwatch, setSelectedSwatch] = useState<ColorSwatch | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isSeasonPickerOpen, setIsSeasonPickerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItemEntry[]>([
    { product: marketplaceProducts[0], quantity: 1 },
  ]);
  const [walletCopied, setWalletCopied] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isOnDeviceOpen, setIsOnDeviceOpen] = useState(false);

  /* One tray at a time. The app used to reach for alert() at checkout, which is a grey
     system slab with the origin printed on it, dropped into the one moment that is meant
     to feel like being handed something. See src/components/Toast.tsx. */
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const say = (t: Omit<ToastMessage, 'id'>) => setToast({ ...t, id: Date.now() });

  const handleCopyWallet = () => {
    navigator.clipboard.writeText(profile.walletId);
    setWalletCopied(true);
    setTimeout(() => setWalletCopied(false), 2000);
  };

  /* Get Started used to put her straight on the home dashboard, fully sealed, with a
     season she had never been read for. The scan and the seal are the product; skipping
     them to show the dashboard is showing her the receipt without the purchase. So the
     entrance now hands off to the reading, and home is what she arrives at afterwards.

     `replay` is the one exception: the intro button in the top bar is there to look at the
     montage again, and sending a woman who has already been sealed back through the camera
     because she wanted to see the portraits would be its own kind of rude. */
  const handleCompleteOnboarding = (selectedModel?: OnboardingModel, replay = false) => {
    /* The montage sets her starting season, but ONLY for a woman who has not been read.
     *
     * She can open the intro from the menu any time, and it shows the same montage. Letting a
     * tap in there rewrite her season would replace a season her own face produced with one
     * she pointed at in a demonstration, quietly, with her sealed reading still saying
     * something else. Once she has been read, the montage is a thing to look at. */
    if (selectedModel && !hasBeenRead) {
      /* The montage is a demonstration of the range, not a character select. Taking the
         portrait she happened to be looking at and making it her profile picture put
         another woman's face on her account. Her season starts from it, because that is
         the point of the montage; her face does not. */
      setProfile((prev) => ({
        ...prev,
        seasonId: selectedModel.seasonId,
      }));
      const matched = seasonalPalettes.find((p) => p.id === selectedModel.seasonId);
      if (matched) setActiveSeason(matched);
    }
    setIsOnboarding(false);
    /* Cleared here rather than where the intro opens, or the next genuine first run on a
       device she has reset would be treated as a replay and skip the camera. */
    setReplayingIntro(false);
    if (replay || hasBeenRead) {
      setActiveView('home');
      return;
    }
    beginScan();
  };

  /* Read my skin.
   *
   * The door comes BEFORE the camera, not after the reading, and that is a correctness
   * decision as much as a UX one. Her commitment root binds to whichever key seals first, so
   * a woman who seals on the device-local fallback and upgrades to a passkey afterwards has
   * stranded her first seal at an address she no longer uses. Asking first means there is
   * only ever one identity, and it means the biometric reads as signing in rather than as a
   * toll gate thrown up between her and a reading she has already waited for.
   *
   * She can still decline. The fallback is real and it works; it just does not follow her to
   * a new phone, and she is told so in those words. */
  const beginScan = () => {
    const o = currentOwner();
    if (!o || o.assurance === 'fallback') {
      setPendingScan(true);
      return;
    }
    setScanStep('scanning');
  };

  /* The seal, for real.
   *
   * Three rules, and every one of them is a thing the shipping app learned the hard way.
   *
   * NEVER SHOW THE SEALED SCREEN ON A FAILED SEAL. It used to be shown unconditionally, so a
   * woman whose seal never reached the chain was told it had. Nothing is stored on a failure
   * and she is told that in the same breath, because "it did not work" and "it worked and you
   * lost it" are very different sentences to be on the receiving end of.
   *
   * NEVER SUBSTITUTE A KEY. If her signer is not available we stop. The old fallback here had
   * the server mint a fresh owner per call, which handed her a different address and a
   * different palette every time it quietly ran.
   *
   * WHAT CROSSES IS THREE NUMBERS. Undertone as an enum, depth as her Monk step, season as an
   * index. Mapped from the reading she just confirmed, which is the point: these are buckets
   * she agreed with, not a measurement taken behind her. The selfie never leaves the phone,
   * her Lab values never leave the phone, and the bridge binds these to a commitment root.
   */
  const doSeal = async (sealed: SealedReading | null, tone: string, seasonId: string) => {
    const owner = currentOwner();
    if (!owner) {
      setSealError(SEAL_FAIL.noKey);
      return;
    }

    /* The same codes a brand's campaign targets. See lib/traitcodes.ts. */
    const undertone = undertoneCode(tone);
    const depth = Math.max(1, Math.min(10, sealed ? monkFromIta(sealed.ita) : 6));
    const season = seasonCode(seasonId);

    setSealing(true);
    setSealError(null);
    try {
      const done = await sealViaDevice(owner, { traits: { undertone, depth, season } });
      /* The seal signature, which is the thing she can look up.
         These field names are taken from a real seal against the live bridge, not guessed. An
         earlier version of this line reached for receipt, signature and tx, none of which the
         bridge sends, so every successful seal handed the vault an undefined receipt and she
         saw a sealed screen with nothing on it. */
      const p = proofFrom(done);
      if (p) { saveProof(p); setProof(p); }
      diag('seal', `sealed (${owner.assurance === 'passkey' ? 'passkey' : 'device key'})${p ? '' : ', no receipt in the reply'}`);
      setProfile((prev) => ({ ...prev, isSealed: true }));
      setShowSeal(true);
      afterSeal();
    } catch (e) {
      const msg = (e as Error)?.message || '';
      /* Her reading is locked to her Palette at the first seal, and a re-seal has to match it.
         When it does not (a new scan read her a step differently, or she sealed before the
         trait codes were corrected) the program refuses the change, and her Palette is still
         sealed exactly as it was. That is not a failure, so it is not shown as one. */
      diag('seal', `seal did not go through: ${msg.slice(0, 140) || 'no message'}`);
      if (/Custom"?:\s*6005|BindingMismatch|do not match the published commitment/i.test(msg)) {
        setProfile((prev) => ({ ...prev, isSealed: true }));
        say({ title: SEAL_KEPT.title, body: SEAL_KEPT.body, tone: 'good' });
        afterSeal();
      } else {
        setSealError(msg || SEAL_FAIL.generic);
      }
    } finally {
      setSealing(false);
    }
  };

  /* A sample brand question, answered against her palette and the rules she has set. She is
     paid for a yes only; a turned-away question was never answered at all. See lib/brandsim.ts. */
  const handleSimulateOvernightBrandQuery = (rules: HerRules): BrandQueryLog => {
    const q = sampleBrandQuery(activeSeason, rules, brandLogs, seasonalPalettes);
    setBrandLogs((prev) => [...prev, q]);
    setNightRules((prev) => ({
      ...prev,
      totalEarned: Math.round((prev.totalEarned + (q.answer === 'YES' ? q.payout : 0)) * 100) / 100,
      totalQuestionsAnswered: prev.totalQuestionsAnswered + (q.answer === 'DECLINED' ? 0 : 1),
    }));
    return q;
  };

  const handleAddToCart = (product: ProductItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCartItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });

    confetti({
      particleCount: 25,
      spread: 45,
      origin: { y: 0.8 },
      colors: ['#C9799B', '#43203B', '#F3DDD6'],
    });
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItemEntry[]
    );
  };

  const handleRemoveCartItem = (productId: string) => {
    setCartItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleCheckout = () => {
    const count = cartItems.reduce((acc, item) => acc + item.quantity, 0);
    setIsCartOpen(false);
    confetti({
      particleCount: 100,
      spread: 80,
      origin: { y: 0.5 },
      colors: ['#C9799B', '#A85578', '#B49BE0', '#D6A756', '#F3DDD6'],
    });
    say({
      tone: 'good',
      title: count === 1 ? 'That one is yours' : `All ${count} are yours`,
      body: `Bought against ${activeSeason.name}. Nobody selling to you saw your face.`,
    });
    setCartItems([]);
  };

  const totalCartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  /* Has she actually been through a reading in this session? Drives whether the entrance
     hands off to the camera or straight to the dashboard. */
  const [hasBeenRead, setHasBeenRead] = useState(knownHer);
  /* What the last reading found, in the coarse words she was shown. Handed to the concierge
     so Ask Oira can answer about her hair and her skin instead of asking her to go and be
     read by a screen that already read her. */
  const [reading, setReading] = useState<{
    curl?: string; curlFamily?: string;
    skinDryness?: string; skinShine?: string; skinBlemish?: boolean;
    /* The measurement itself, kept alongside the words derived from it. A label without the
       Lab and the illuminant it came from cannot be re-derived when the calibration
       improves, and cannot be honestly compared to the next scan. See lib/confidence.ts. */
    sealed?: SealedReading;
    /* Every sealed reading, newest last. What makes a trend line possible, and what a brand
       query would eventually gate on. Kept on device like everything else here. */
    history?: SealedReading[];
  }>(() => her?.reading ?? {});
  /* Her identity. Booted silently on mount to the device-local fallback, which is the only
     unlock that cannot raise a browser prompt, so she is already somebody before she has
     agreed to anything. Upgraded to a passkey or a wallet at the seal. See lib/identity.ts. */
  const [owner, setOwner] = useState<Owner | null>(null);
  /* Up between "she asked to be read" and "she has an identity to be read into". */
  const [pendingScan, setPendingScan] = useState(false);
  /* The seal is genuinely doing something now, so it has states: working, and failed. */
  const [sealing, setSealing] = useState(false);
  const [sealError, setSealError] = useState<string | null>(null);
  /* Her seal in words, with the evidence behind a link. Never the raw signature on screen. */
  const [proof, setProof] = useState<Proof | null>(() => loadProof());
  const [showSeal, setShowSeal] = useState(false);
  const [showSleeping, setShowSleeping] = useState(false);
  /* The scan is a sequence, not a modal: she is read, she sees the reading and can change
     it, and then it is sealed. Nothing is kept until she says "this is me". */
  const [scanStep, setScanStep] = useState<'scanning' | 'reading' | null>(null);

  /* Write her back down whenever something worth remembering moves.
   *
   * Deliberately not keyed on hasBeenRead alone: she renames herself, sets her curl, types her
   * routine and switches season long after the scan, and a woman who changes her name and
   * closes the app should not find the old one waiting. Only writes once she has actually been
   * read, so an abandoned first visit leaves nothing behind on a phone that may not be hers. */
  useEffect(() => {
    if (!hasBeenRead) return;
    saveHer({ read: true, profile, seasonId: activeSeason.id, reading });
  }, [hasBeenRead, profile, activeSeason.id, reading]);

  /* Start fetching the scan models before she asks for them.
   *
   * They are 7.4MB on the wire and they used to start downloading at the moment she tapped
   * Read my skin, so she watched a loading screen for the whole of it. On a mid range Android
   * on mobile data that is the single thing everybody complains about, and none of it needs to
   * happen while she waits: she is looking at her palette for far longer than the download
   * takes.
   *
   * Deliberately NOT on first paint. A woman who opens the app to look at her colours and
   * never scans should not be charged 7.4MB for a camera she did not open, which is the same
   * argument sw.js makes for not precaching them. So it waits until the app is idle and she
   * has stayed, which is a decent signal she is here to do something.
   *
   * Cheap to be wrong: warmUp() is idempotent, and if she taps before it finishes she simply
   * joins the download already in progress instead of starting a second one. */
  useEffect(() => {
    if (showSplash || isOnboarding) return;
    const idle = (window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    }).requestIdleCallback;
    const start = () => { void warmUp(); };
    if (idle) { const id = idle(start, { timeout: 4000 }); return () => cancelIdleCallback?.(id); }
    const t = setTimeout(start, 2500);
    return () => clearTimeout(t);
  }, [showSplash, isOnboarding]);

  /* Silent, and it must stay silent. unlockLocal never touches WebAuthn, so nothing here can
     put a biometric sheet in front of a woman who has just opened the app. */
  useEffect(() => { boot().then(setOwner).catch(() => { /* private mode; she seals later */ }); }, []);

  /* Her real answers, fetched when she opens the night screen rather than at launch: on the
     wallet path the signature is a prompt in her wallet, and that should follow something she
     did. */
  /* Once she is sealed, brands can ask about her, so this is when the app asks whether it may
     tell her. Fetching her answers brings the token the overnight check needs and, in the
     Android app, Android's notification prompt. On the passkey and device paths the signature
     is silent; a wallet would pop up a signing request out of nowhere, so wallets wait for
     the night screen as before. */
  const afterSeal = () => {
    if (connectedWalletAddress()) return;
    window.setTimeout(() => loadMyAnswers(), 1500);
  };

  /* The identity brands actually ask about. The app opens on the device key, silently, and only
     becomes her passkey identity when she taps for it. Anything done as her (reading her answers
     and setting up the alerts that come with them, writing her rules to her Palette) has to be
     done as the passkey when this phone has one, or it lands on an empty identity: that is how
     the A13 was signed up for alerts about nobody. Only ever called from something she tapped,
     so the fingerprint sheet never appears out of nowhere. */
  const herIdentity = async (): Promise<Owner | null> => {
    let o = owner ?? currentOwner();
    if (o && o.assurance !== 'passkey' && hasEnrolled() && !connectedWalletAddress()) {
      o = await useFingerprint();
      setOwner(o);
    }
    return o;
  };

  const loadMyAnswers = async () => {
    let o: Owner | null;
    try { o = await herIdentity(); } catch { setAnswersState('failed'); return; }
    if (!o) return;
    setAnswersState('loading');
    fetchMyAnswers(o, isNativeApp() ? BRIDGE_ORIGIN : '')
      .then((r) => {
        setMyAnswers(r);
        setAnswersState('idle');
        void enableAnswerAlerts(r.notifyToken, r.answers.reduce((m, a) => Math.max(m, a.at), 0));
      })
      .catch(() => setAnswersState('failed'));
  };
  useEffect(() => {
    if (activeView === 'night-rules' && profile.isSealed && myAnswers === null && answersState === 'idle') loadMyAnswers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, profile.isSealed]);

  /* Recognise a seal she already made. As soon as we know who she is, ask whether her
     address has sealed before, on this phone or any other, so she is not asked to seal
     what is already sealed. A reading she takes now still updates it. */
  useEffect(() => {
    if (!owner) return;
    let live = true;
    findExistingSeal(owner.address, isNativeApp() ? BRIDGE_ORIGIN : '').then((found) => {
      if (!live || !found) return;
      setProof((prev) => prev ?? found);
      if (!loadProof()) saveProof(found);
      setProfile((prev) => (prev.isSealed ? prev : { ...prev, isSealed: true }));
    });
    return () => { live = false; };
  }, [owner]);
  const [scanResult, setScanResult] = useState<ScanFrame | null>(null);
  const [scanStill, setScanStill] = useState('');

  /* No drifting light over a live preview: it would read as the scan doing something. */
  const idle = useIdle(scanStep !== null);

  /* Her clock, so After Dark arrives at seven wherever she is. */
  const timeOfDay = useTimeOfDay();

  /* The concierge's only data boundary, rebuilt whenever what it is allowed to know
     changes. Nothing is handed to a model that is not named in installContext. */
  useEffect(() => {
    installContext({ profile, season: activeSeason, nightRules, brandLogs, reading });
  }, [profile, activeSeason, nightRules, brandLogs, reading]);

  /* Start fetching the answering engine as soon as she is in the app, so the first question
     does not wait on a script tag. It fails quietly: the deterministic floor is inside the
     same module, so if it never arrives there is nothing to fall back to and saying so
     early would only worry her about something she cannot fix. */
  useEffect(() => {
    if (!isOnboarding) void loadConcierge().catch(() => {});
  }, [isOnboarding]);

  /* If she already downloaded the weights, hand the engine its config on the way in.
     Without this the model sits in the cache and never answers: oira-llm.js reports itself
     unconfigured when window.OIRA_LLM_CONFIG is absent, so a woman who paid three gigabytes
     last week would silently drop to the governed tier this week and have no way to tell.
     Nothing is fetched here. It is a cache lookup and an object assignment, and on a phone
     that never downloaded them it does nothing at all. */
  useEffect(() => {
    void modelState()
      .then((s) => { if (s === 'ready') activateLocalModel(); })
      .catch(() => {});
  }, []);

  return (
    <div className="stage min-h-screen text-[#43203B] flex flex-col items-center justify-center p-2 sm:p-4 relative overflow-x-hidden selection:bg-[#F3DDD6] selection:text-[#43203B]">
      {/* The room the phone is standing in. It read violet, because it was night plus a
          plum wash and plum is a purple. It is deep brown and oxblood now, built out of
          the melanin ribbon rather than a new colour. See .stage in src/index.css. */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-[#6E4128]/35 rounded-full blur-[110px]" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-[#A85578]/22 rounded-full blur-[110px]" />
      </div>

      {/* Top Floating View Header */}
      <nav className="w-full max-w-[420px] px-2 pb-2 flex items-center justify-between z-20 text-xs text-white">
        <div className="flex items-center gap-2">
          <span className="font-display text-white text-xl font-normal tracking-tight">
            Oira
          </span>
          <span className="text-[10px] text-[#F3E9E4] bg-white/10 px-2 py-0.5 rounded-full border border-white/10">
            Chroma & Overnight Intelligence
          </span>
        </div>

        {/* Replay Onboarding Button */}
        {!isOnboarding && (
          <button
            id="replay-onboarding-top-btn"
            onClick={() => { setReplayingIntro(true); setIsOnboarding(true); }}
            className="p-1.5 px-2.5 rounded-full bg-white/10 hover:bg-white/20 text-[#F3E9E4] border border-white/15 flex items-center gap-1 text-[11px] transition-colors cursor-pointer"
            title="View Onboarding Montage"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Intro</span>
          </button>
        )}
      </nav>

      {/* Phone Screen Container - Fixed Smartphone Dimensions with Internal Smooth Scrolling */}
      <main id="phone-frame" className={`w-full max-w-[420px] h-[844px] max-h-[92vh] min-h-[640px] rounded-[46px] shadow-[0_25px_70px_-10px_rgba(0,0,0,0.65)] border-[8px] border-[#1B1120] overflow-hidden flex flex-col relative bg-[#FBF3EE] z-10 irisrim${idle ? ' idle' : ''}`}>
        {showSplash && <SplashView onEnter={() => setShowSplash(false)} />}

        <DayDecor />

        {/* The deep scan. Her skin, her features and her hair, read together and on this
            phone. See src/lib/scan.ts for what is actually loaded and why. */}
        {scanStep === 'scanning' && (
          <div className="absolute inset-0 z-50">
            <DeepScanView
              onClose={() => setScanStep(null)}
              onDone={(result, still) => {
                setScanResult(result);
                setScanStill(still);
                setScanStep('reading');
              }}
            />
          </div>
        )}

        {scanStep === 'reading' && scanResult && (
          <div className="absolute inset-0 z-50">
            <ReadingView
              scan={scanResult}
              still={scanStill}
              onRetake={() => setScanStep('scanning')}
              onSeal={(findings: Finding[], extras) => {
                const tone = findings.find((f) => f.key === 'undertone')?.value ?? '';
                setReading((prev) => ({
                  curl: extras?.curl,
                  curlFamily: extras?.curlFamily,
                  skinDryness: scanResult?.condition?.lightOk ? scanResult.condition.dryness : undefined,
                  skinShine: scanResult?.condition?.lightOk ? scanResult.condition.shine : undefined,
                  skinBlemish: scanResult?.condition?.lightOk ? scanResult.condition.blemish : undefined,
                  sealed: extras?.sealed ?? undefined,
                  history: extras?.sealed ? [...(prev.history ?? []), extras.sealed] : prev.history,
                }));
                /* Her reading picks the palette rather than a picker doing it for her.
                   Depth and undertone are what the seasonal split actually turns on. */
                /* The finding reads "<band> · <undertone>", and the bands are very-light,
                   light, intermediate, tan, brown, dark and deepest. This used to look for
                   the word "deep", which only "deepest" has, so brown and dark skin, most of
                   the women Oira is for, were handed a Medium palette right after being told
                   their skin is deep brown. */
                const [band = '', lean = ''] = tone.split('·').map((t) => t.trim().toLowerCase());
                const cool = lean.includes('cool');
                const deep = ['brown', 'dark', 'deepest'].includes(band) || band.includes('deep');
                const matched =
                  seasonalPalettes.find((p) =>
                    cool
                      ? p.undertone.toLowerCase().startsWith('cool') &&
                        (deep ? p.depth.toLowerCase().startsWith('deep') : true)
                      : p.undertone.toLowerCase().startsWith('warm') &&
                        (deep ? p.depth.toLowerCase().startsWith('deep') : true)
                  ) ?? activeSeason;
                setActiveSeason(matched);
                /* The still from the scan does NOT become her picture.
                   It used to, and the founder's word for it was that it felt like the app
                   had taken something. It had: a frame grabbed while she held still under
                   whatever lamp was nearest is not a portrait anybody would choose, and
                   putting it on her profile unasked is the app deciding how she looks to
                   herself. Her picture is hers to pick, in ProfileSheet. What the scan
                   keeps is what it measured. */
                setProfile((prev) => ({
                  ...prev,
                  seasonId: matched.id,
                  curl: extras?.curl ?? prev.curl,
                  ...(extras?.routine ? { routine: extras.routine } : {}),
                  /* First seal, and she has not named herself. Give her one to be going on
                     with rather than leaving a public key sitting where her name goes. */
                  ...(prev.name ? {} : { name: generateHandle() }),
                }));
                setScanStep(null);
                setHasBeenRead(true);

                /* Actually seal it. She chose her door before the camera opened, so the key
                   that signs here is the key her commitment root binds to. */
                void doSeal(extras?.sealed ?? null, tone, matched.id);
              }}
            />
          </div>
        )}

        {/* Which door she takes. Sits over the frame like the seal does, because it is the
            same moment continued rather than a separate place she has gone to. */}
        {pendingScan && (
          <IdentitySheet
            onReady={(o) => { setOwner(o); setPendingScan(false); setScanStep('scanning'); }}
            /* She can decline, and the camera still opens. The fallback she booted with is
               real and seals fine; it just will not follow her to a new phone, and she was
               told that in those words. Holding her reading hostage over it would be worse
               than the thing it protects her from. */
            onSkip={() => { setPendingScan(false); setScanStep('scanning'); }}
          />
        )}

        {/* Sealing, and failing to seal. Both are moments over the frame rather than screens,
            because she has not gone anywhere: she tapped a button and is waiting on it. */}
        {sealing && (
          <div className="absolute inset-0 z-[65] bg-paper/95 flex flex-col items-center justify-center px-8 text-center">
            <div className="glowring2" aria-hidden />
            <p className="text-[13px] font-semibold text-ink mt-6">{SEAL_FAIL.working}</p>
            <p className="text-[11.5px] leading-[1.5] text-muted mt-1.5">{SEAL_FAIL.workingWhy}</p>
          </div>
        )}

        {sealError && (
          <div className="absolute inset-0 z-[66] bg-black/45 flex items-end justify-center">
            <div className="w-full max-w-[420px] bg-paper rounded-t-3xl px-5 pt-5 pb-7">
              <h2 className="font-display text-[18px] text-ink" style={{ fontWeight: 600 }}>
                {SEAL_FAIL.title}
              </h2>
              <p className="text-[12.5px] leading-[1.55] text-muted mt-2">{SEAL_FAIL.body}</p>
              <p className="text-[11.5px] leading-snug text-muted/80 mt-2.5 break-words">{sealError}</p>
              <button
                onClick={() => { setSealError(null); setActiveView('home'); }}
                className="w-full mt-4 rounded-full py-3.5 text-[13px] font-semibold cursor-pointer text-paper"
                style={{ background: 'linear-gradient(150deg, #E7A6C0, #C9799B)' }}
              >
                {SEAL_FAIL.ok}
              </button>
            </div>
          </div>
        )}

        {/* The seal and the sleeping screen. Preserved from the shipping app, and both are
            moments rather than destinations, so they cover the frame instead of taking a tab. */}
        {showSeal && (
          <div className="absolute inset-0 z-50">
            <SealedVaultView
              proof={proof}
              onContinue={() => {
                setShowSeal(false);
                setActiveView('home');
              }}
            />
          </div>
        )}

        {showSleeping && (
          <div className="absolute inset-0 z-50">
            <WhileYouSleepView
              onSeeMorning={() => {
                setShowSleeping(false);
                setActiveView('home');
              }}
            />
          </div>
        )}

        {/* Dynamic Island / Speaker Notch Pill */}
        {!isOnboarding && (
          <div className="absolute top-2.5 inset-x-0 mx-auto w-24 h-4 bg-[#1B1120] rounded-full z-40 shrink-0 pointer-events-none shadow-xs" />
        )}

        {/* Conditional View Rendering */}
        {isOnboarding ? (
          /* 1. Onboarding Entrance Page */
          <div className="flex-1 w-full h-full overflow-hidden">
            <OnboardingView
              onContinue={(model) => handleCompleteOnboarding(model, replayingIntro)}
              onUseWallet={() => handleCompleteOnboarding(undefined, replayingIntro)}
              replay={replayingIntro}
            />
          </div>
        ) : (
          /* 2. Main In-Phone Views with Fixed Bottom Navigation */
          <div className="flex-1 flex flex-col justify-between overflow-hidden relative z-10">
            {/* Scrollable View Body - Slide / Scroll up to see all details */}
            {activeView === 'ask-oira' ? (
              <div className="flex-1 relative overflow-hidden">
                <AskOiraView name={profile.name?.split(' ')[0]} timeOfDay={timeOfDay} />
              </div>
            ) : (
            /* The scroll column carried the frame's blush ground on every view, so an
               After Dark page opened with a strip of daylight above it where the padding
               was. The column follows the page it is holding. */
            <div
              className={`flex-1 overflow-y-auto no-scrollbar relative pt-8 ${
                activeView === 'night-rules' ? 'bg-night' : ''
              }`}
            >
              {activeView === 'home' && (
                /* Primary Luxury Home Dashboard */
                <div className="px-4 pt-1 pb-24 space-y-4">
                  {/* Header: User Avatar, Title, Sealed Badge, Cart */}
                  <Header
                    profile={profile}
                    activeSeason={activeSeason}
                    onOpenProfile={() => setIsProfileOpen(true)}
                    onOpenSeasonPicker={() => setIsSeasonPickerOpen(true)}
                    onOpenCart={() => setIsCartOpen(true)}
                    onOpenMenu={() => setIsNavMenuOpen(true)}
                    cartCount={totalCartCount}
                    onCopyWallet={handleCopyWallet}
                    walletCopied={walletCopied}
                  />

                  {/* Top Action Bar with "Open Color Wheel" and Action Pills */}
                  <div className="space-y-2.5">
                    {/* Top quick banner button for Color Wheel */}
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] uppercase tracking-wider text-[#8A6580] font-medium">
                        Quick Actions
                      </span>
                      <button
                        id="home-top-open-color-wheel-btn"
                        onClick={() => setActiveView('color-wheel')}
                        className="text-xs text-[#A85578] hover:text-[#43203B] font-medium inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Disc3 className="w-3.5 h-3.5" />
                        <span>Open Color Wheel</span>
                      </button>
                    </div>

                    {/* The 2 Main Action Pills (Set tonight's rules & Check a colour) */}
                    <div className="flex items-center gap-2.5 w-full">
                      {/* Pill 1: Set tonight's rules */}
                      <motion.button
                        id="home-set-tonights-rules-pill-btn"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setActiveView('night-rules')}
                        className="flex-1 py-3 px-4 rounded-full bg-[#43203B] hover:bg-[#43203B] text-white font-medium text-[13.5px] tracking-tight shadow-[0_6px_16px_rgba(46,18,37,0.2)] transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center"
                      >
                        <Moon className="w-3.5 h-3.5 text-[#F3DDD6]" />
                        <span>Set tonight's rules</span>
                      </motion.button>

                      {/* Pill 2: Check a colour */}
                      <motion.button
                        id="home-check-a-colour-pill-btn"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setActiveView('color-wheel')}
                        className="flex-1 py-3 px-4 rounded-full bg-white/90 hover:bg-white text-[#43203B] border border-[#EFDDE2] font-medium text-[13.5px] tracking-tight shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center"
                      >
                        <Disc3 className="w-3.5 h-3.5 text-[#A85578]" />
                        <span>Check a colour</span>
                      </motion.button>
                    </div>
                  </div>

                  {/* Overnight Attestation & Brand Queries Mini Card */}
                  <div className="w-full p-3.5 sm:p-4 rounded-2xl bg-white/85 border border-[#EFDDE2] shadow-2xs backdrop-blur-xs flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] tracking-wider text-[#8A6580] uppercase font-medium">
                          WHILE YOU SLEPT
                        </span>
                        <span className="text-[10px] font-medium text-[#B4813C] bg-[#F3E9E4] px-2 py-0.5 rounded-full border border-[#F3DDD6] flex items-center gap-0.5">
                          Sample <ShieldCheck className="w-3 h-3 text-[#B4813C]" />
                        </span>
                      </div>
                      <p className="text-[12px] text-[#43203B]">
                        {myAnswers && myAnswers.answers.length
                          ? <>{myAnswers.answers.length} brands asked, not one of them saw you • <span className="font-semibold text-[#43203B]">${myAnswers.earned.toFixed(2)} earned</span></>
                          : <>{brandLogs.length} sample questions, not one of them saw you • <span className="font-semibold text-[#43203B]">${nightRules.totalEarned.toFixed(2)} in samples</span></>}
                      </p>
                    </div>

                    <button
                      onClick={() => setIsBrandBoardOpen(true)}
                      className="text-xs text-[#A85578] hover:text-[#43203B] font-medium whitespace-nowrap cursor-pointer hover:underline"
                    >
                      Board &gt;
                    </button>
                  </div>

                  {/* "Your season" Primary Palette Card with 6 signature dish swatches */}
                  <SeasonCard
                    season={activeSeason}
                    onSelectSwatch={(swatch) => setSelectedSwatch(swatch)}
                    onShareCard={() => setIsShareOpen(true)}
                    onOpenSeasonPicker={() => setIsSeasonPickerOpen(true)}
                  />

                  {/* "Skin Trends" Section with Tone Consistency Chart */}
                  {/* Tapping a point used to fire a browser alert, which is the one piece
                      of chrome in the app that is unmistakably not ours. The point selects
                      instead and the banner above the chart says what it says. */}
                  <SkinTrendsCard />

                  {/* "Marketplace" Carousel & Cards */}
                  <Marketplace
                    activeSeason={activeSeason}
                    onSelectProduct={(prod) => setSelectedProduct(prod)}
                    onAddToCart={handleAddToCart}
                  />
                </div>
              )}

              {activeView === 'color-wheel' && (
                /* Dedicated In-Screen Color Wheel View */
                <ColorWheelView
                  activeSeason={activeSeason}
                  onBackToHome={() => setActiveView('home')}
                  onSaveSwatch={(hex, name) => {
                    confetti({
                      particleCount: 30,
                      spread: 50,
                      origin: { y: 0.7 },
                      colors: [hex, '#FBF3EE', '#43203B'],
                    });
                  }}
                />
              )}

              {activeView === 'night-rules' && (
                /* Dedicated In-Screen Night Rules View */
                <NightRulesView
                  season={activeSeason}
                  reading={reading}
                  routine={profile.routine}
                  onGoodnight={() => setShowSleeping(true)}
                  config={nightRules}
                  onUpdateConfig={(newConfig) => {
                    setNightRules(newConfig);
                    /* On her palette, where her agent and the program read them. Saved on this
                       phone either way, so a failed write never loses what she chose. */
                    if (profile.isSealed) {
                      herIdentity()
                        .then((o) => { if (!o) throw new Error("I'll put them on your Palette next time."); return saveRulesToPalette(o, { minPayout: newConfig.lowestPayout, maxPerBrand: newConfig.brandLifetimeCap }); })
                        .then(() => say({ title: 'Your rules are on your Palette', body: "A brand that breaks them is turned away before anyone looks. That's you, deciding.", tone: 'good' }))
                        .catch((e) => say({ title: 'Saved on this phone for now', body: (e as Error)?.message || "I'll put them on your Palette next time." }));
                    }
                  }}
                  onSimulateBrandQuery={handleSimulateOvernightBrandQuery}
                  myAnswers={myAnswers}
                  answersState={answersState}
                  sealed={profile.isSealed}
                  onRefreshAnswers={loadMyAnswers}
                  onBackToHome={() => setActiveView('home')}
                />
              )}

              {activeView === 'marketplace' && (
                /* Dedicated In-Screen Beauty Marketplace View */
                <div className="px-4 pt-1 pb-24 space-y-4">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setActiveView('home')}
                      className="text-xs text-[#8A6580] hover:text-[#43203B] flex items-center gap-1 font-medium bg-white/80 px-3 py-1.5 rounded-full border border-[#EFDDE2]"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to Home</span>
                    </button>

                    <button
                      onClick={() => setIsCartOpen(true)}
                      className="text-xs text-[#43203B] bg-white px-3 py-1.5 rounded-full border border-[#EFDDE2] shadow-xs flex items-center gap-1.5"
                    >
                      <ShoppingBag className="w-3.5 h-3.5 text-[#A85578]" />
                      <span>Bag ({totalCartCount})</span>
                    </button>
                  </div>

                  <Marketplace
                    activeSeason={activeSeason}
                    onSelectProduct={(prod) => setSelectedProduct(prod)}
                    onAddToCart={handleAddToCart}
                  />
                </div>
              )}
            </div>
            )}

            {/* Fixed Bottom Docked Navigation Bar */}
            <BottomNavigationBar
              activeView={activeView}
              onChangeView={(v) => setActiveView(v)}
              /* Ask Oira follows her clock now, so the bar follows it too. */
              tone={
                activeView === 'night-rules' ||
                (activeView === 'ask-oira' && timeOfDay === 'night')
                  ? 'night'
                  : 'day'
              }
            />
          </div>
        )}
      {/* Every drawer and modal lives inside the phone, not outside it.
          They were all rendered after </main> as `absolute inset-0`, which resolves to the
          page rather than the frame, so the sidebar and the cart slid in over the whole
          browser window and broke the one illusion the layout is built on. Moved in here,
          where <main> is the positioned ancestor and its overflow-hidden clips them. */}
      {/* Modals & Interactive Overlays */}
      <ConciergeDrawer
        isOpen={isConciergeOpen}
        onClose={() => setIsConciergeOpen(false)}
        activeSeason={activeSeason}
        onOpenColorWheel={() => {
          setIsConciergeOpen(false);
          setActiveView('color-wheel');
        }}
      />

      <BrandBoardModal
        isOpen={isBrandBoardOpen}
        onClose={() => setIsBrandBoardOpen(false)}
        brandLogs={brandLogs}
        brandLifetimeCap={nightRules.brandLifetimeCap}
      />

      <NavigationMenuDrawer
        isOpen={isNavMenuOpen}
        onClose={() => setIsNavMenuOpen(false)}
        profile={profile}
        activeSeason={activeSeason}
        activeView={activeView}
        onChangeView={(v) => setActiveView(v as AppNavView)}
        onOpenColorWheel={() => setActiveView('color-wheel')}
        onOpenNightRules={() => setActiveView('night-rules')}
        onOpenConcierge={() => setIsConciergeOpen(true)}
        onOpenOnboarding={() => { setReplayingIntro(true); setIsOnboarding(true); }}
        /* Through beginScan, not straight to the camera. A woman who reaches the scanner
           from the menu rather than from onboarding still needs to have picked a door first,
           and this was the path that skipped it. onRetake above is deliberately direct: she
           is already mid-flow and has passed the door once. */
        onOpenScanner={beginScan}
        onOpenSeasonPicker={() => setIsSeasonPickerOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
        earned={nightRules.totalEarned}
        answered={brandLogs.length}
        onOpenBoard={() => {
          setIsBrandBoardOpen(true);
          /* Who asked is the question her answers answer, so they load here too, and with them
             the overnight alerts. Wallets wait for the night screen, as above. */
          if (profile.isSealed && myAnswers === null && answersState === 'idle' && !connectedWalletAddress()) loadMyAnswers();
        }}
        onOpenPrivacy={() => setIsPrivacyOpen(true)}
        onOpenOnDevice={() => setIsOnDeviceOpen(true)}
        /* Earnings arrive as a notification rather than another card on the home page.
           A number she checks is a glance, not a destination. */
        onShowEarnings={() =>
          say({
            tone: 'good',
            title: 'Earned so far',
            amount: `$${nightRules.totalEarned.toFixed(2)}`,
            body: nightRules.totalQuestionsAnswered
              ? `From ${nightRules.totalQuestionsAnswered} ${nightRules.totalQuestionsAnswered === 1 ? 'answer' : 'answers'}, at $${nightRules.lowestPayout.toFixed(2)} a time. Not one of them saw you.`
              : `Nothing yet. Set what one answer costs and it starts coming in while you sleep.`,
          })
        }
        onNotify={(t) => say(t)}
      />

      <PrivacySheet
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
        answered={brandLogs.length}
        proof={proof}
      />

      <OnDeviceSheet
        isOpen={isOnDeviceOpen}
        onClose={() => setIsOnDeviceOpen(false)}
        onDone={say}
      />

      <ProfileSheet
        isOpen={isProfileOpen}
        profile={profile}
        onClose={() => setIsProfileOpen(false)}
        onSave={({ name, avatarUrl }) => {
          setProfile((prev) => ({ ...prev, name, avatarUrl }));
          say({ title: 'Noted', body: `You are ${name} in here now.` });
        }}
      />

      {/* The tray. Inside the phone, on top of everything, dismissed by time or by tap. */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Swatch Detail Modal */}
      {selectedSwatch && (
        <SwatchDetailModal
          swatch={selectedSwatch}
          season={activeSeason}
          onClose={() => setSelectedSwatch(null)}
        />
      )}

      {/* Share Card Modal */}
      {isShareOpen && (
        <ShareCardModal
          profile={profile}
          season={activeSeason}
          onClose={() => setIsShareOpen(false)}
        />
      )}

      {/* Season Selector Modal */}
      {isSeasonPickerOpen && (
        <SeasonSelectorModal
          isOpen={isSeasonPickerOpen}
          activeSeasonId={activeSeason.id}
          onClose={() => setIsSeasonPickerOpen(false)}
          onSelectSeason={(season) => setActiveSeason(season)}
        />
      )}

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          season={activeSeason}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={(prod) => handleAddToCart(prod)}
        />
      )}

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveCartItem}
        onCheckout={handleCheckout}
      />
      </main>

      {/* Footer Branding */}
      <footer className="w-full text-center py-2 text-[11px] text-[#8A6580]">
        <p>Oira • your colours, read on your phone and kept there</p>
      </footer>

    </div>
  );
}

