import { useState } from 'react';
import { BiometricScanModal } from './components/BiometricScanModal';
import { ExampleWalletModal } from './components/ExampleWalletModal';
import { BrandPortalModal } from './components/BrandPortalModal';
import { FeedbackModal } from './components/FeedbackModal';
import { FEATURED_ARCHETYPES } from './data/archetypes';
import { SeasonalArchetype } from './types';
import { X } from 'lucide-react';
import { OiraMark } from './components/OiraMark';
import { Swatch } from './components/Swatch';
import { SolanaMark } from './components/SolanaMark';

// Where every "open the app" button goes, and the APK we serve today.
const APP_URL = 'https://app.myoira.com';
const APK_URL = '/downloads/oira-seeker.apk';

const SPECTROMETRY_IMAGE = '/assets/images/spectrometry_portrait_1791042329990.jpg';
const SHADE_MIRROR_IMAGE = '/assets/images/shade_mirror_portrait_1791042341673.jpg';
const CHROMATIC_CONTINUUM_IMAGE = '/assets/images/chromatic_continuum_1791042355128.jpg';
const GILDED_FIGS_IMAGE = '/assets/images/gilded_figs_texture_1791042371364.jpg';

export default function App() {
  // Navigation & Interactive States
  const [activeAct, setActiveAct] = useState<number>(1);
  const [mirrorView, setMirrorView] = useState<'foundation' | 'lip'>('foundation');
  const [selectedKelvin, setSelectedKelvin] = useState<'5500K' | '3200K' | '2400K'>('3200K');
  const [bidFee, setBidFee] = useState<number>(4.5);
  const [selectedArchetype, setSelectedArchetype] = useState<SeasonalArchetype | null>(null);

  // Modals
  const [isBiometricScanOpen, setIsBiometricScanOpen] = useState(false);
  const [isAppWalletOpen, setIsAppWalletOpen] = useState(false);
  const [isBrandPortalOpen, setIsBrandPortalOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  // Dynamic earnings calculations
  const simulatedMatches = Math.max(3, Math.round(35 / Math.sqrt(bidFee * 1.6)));
  const totalMonthly = (simulatedMatches * bidFee).toFixed(2);

  // Smooth scroll handler
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="bg-background font-body-md text-on-surface antialiased relative selection:bg-blush-rose/30 selection:text-plum-deep min-h-screen">
      {/* ========================================================================= */}
      {/* 0. FLOATING AMBIENT PETALS (POINTER-EVENTS-NONE)                           */}
      {/* ========================================================================= */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-10 overflow-hidden select-none">
        <div className="petal-drift-1 absolute left-[8%] -top-12 w-6 h-9 rounded-[70%_25%_65%_35%] bg-gradient-to-br from-swatch-summer-rosewater/45 via-blush-rose/35 to-swatch-spring-peach/25 backdrop-blur-[1px] shadow-[0_2px_8px_rgba(207,139,163,0.25)] border border-cream-luminous/30" />
        <div className="petal-drift-2 absolute left-[28%] -top-14 w-5 h-7 rounded-[35%_65%_30%_70%] bg-gradient-to-tr from-champagne-gold/40 via-gold-shimmer/45 to-warm-bronze/30 shadow-[0_3px_10px_rgba(212,175,55,0.2)] border border-champagne-gold/25" style={{ animationDelay: '4.5s' }} />
        <div className="petal-drift-3 absolute left-[52%] -top-10 w-7 h-10 rounded-[60%_40%_70%_30%] bg-gradient-to-b from-blush-petal/40 via-swatch-autumn-terracotta/25 to-blush-soft/35 shadow-sm border border-blush-rose/20" style={{ animationDelay: '8s' }} />
        <div className="petal-drift-4 absolute left-[74%] -top-16 w-5 h-8 rounded-[45%_55%_40%_60%] bg-gradient-to-tl from-gold-shimmer/35 via-swatch-spring-peach/30 to-blush-rose/25 shadow-sm border border-cream-porcelain/40" style={{ animationDelay: '2s' }} />
        <div className="petal-drift-5 absolute left-[88%] -top-12 w-6 h-8 rounded-[50%_45%_60%_40%] bg-gradient-to-br from-swatch-summer-rosewater/40 via-blush-petal/30 to-secondary-container/35 shadow-[0_2px_6px_rgba(200,123,151,0.2)]" style={{ animationDelay: '11s' }} />
        <div className="petal-drift-6 absolute left-[40%] -top-14 w-4 h-6 rounded-[65%_35%_60%_40%] bg-gradient-to-tr from-warm-bronze/35 to-swatch-spring-peach/40 shadow-sm" style={{ animationDelay: '14s' }} />
      </div>

      {/* ========================================================================= */}
      {/* FIXED HEADER                                                              */}
      {/* ========================================================================= */}
      <header className="fixed top-0 w-full z-50 shadow-[0_1px_8px_rgba(0,0,0,0.04)] bg-surface/95 backdrop-blur-xl">
        {/* Study banner (the skin study is what we're running now) */}
        <a href="/study" className="w-full bg-plum-obsidian text-cream-porcelain py-2 px-4 sm:px-8 text-center flex items-center justify-center gap-3">
          <div className="flex items-center gap-1.5">
            <Swatch />
            <span className="font-bold text-[11px] uppercase tracking-widest text-gold-shimmer">Help us read every skin tone right.</span>
          </div>
          <p className="text-xs text-cream-porcelain/90 hidden sm:inline">
            Three minutes on your phone, and your picture never leaves it.
          </p>
          <span className="text-xs text-champagne-gold hover:text-gold-shimmer underline transition-colors whitespace-nowrap shrink-0 cursor-pointer">
            Join the skin study →
          </span>
        </a>

        {/* Navigation Bar */}
        <div className="h-20 w-full max-w-[1440px] mx-auto px-3 sm:px-5 lg:px-6 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 lg:gap-3 shrink-0">
            <a className="flex items-center gap-2 shrink-0 cursor-pointer" href="#hero" aria-label="Oira, home" onClick={(e) => { e.preventDefault(); scrollTo('hero'); }}>
              <OiraMark />
            </a>
            <div className="hidden xl:flex items-center gap-1 bg-surface-container-high/60 px-2.5 py-1 rounded-full whitespace-nowrap shrink-0">
              <span className="material-symbols-outlined text-warm-bronze text-[14px]">verified_user</span>
              <span className="text-[11px] font-semibold text-tertiary tracking-wide uppercase whitespace-nowrap">Private by design</span>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-1 xl:gap-1.5 shrink overflow-x-auto select-none py-1">
            <button
              onClick={() => scrollTo('how-it-works')}
              className="nav-link px-2 xl:px-2.5 py-1.5 rounded-full text-xs xl:text-sm font-medium text-on-surface-variant hover:text-plum-deep hover:bg-surface-container transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              How it works
            </button>
            <button
              onClick={() => scrollTo('architecture')}
              className="nav-link px-2 xl:px-2.5 py-1.5 rounded-full text-xs xl:text-sm font-medium text-on-surface-variant hover:text-plum-deep hover:bg-surface-container transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              Why it's private
            </button>
            <button
              onClick={() => scrollTo('seasons')}
              className="nav-link px-2 xl:px-2.5 py-1.5 rounded-full text-xs xl:text-sm font-medium text-on-surface-variant hover:text-plum-deep hover:bg-surface-container transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              Seasonal Spectrum
            </button>
            <button
              onClick={() => scrollTo('privacy')}
              className="nav-link px-2 xl:px-2.5 py-1.5 rounded-full text-xs xl:text-sm font-medium text-on-surface-variant hover:text-plum-deep hover:bg-surface-container transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              Privacy &amp; Boundaries
            </button>
            <button
              onClick={() => scrollTo('for-brands')}
              className="nav-link px-2 xl:px-2.5 py-1.5 rounded-full text-xs xl:text-sm font-medium text-on-surface-variant hover:text-plum-deep hover:bg-surface-container transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              For Brands
            </button>
            <button
              onClick={() => setIsFeedbackOpen(true)}
              className="nav-link px-2 xl:px-2.5 py-1.5 rounded-full text-xs xl:text-sm font-medium text-on-surface-variant hover:text-plum-deep hover:bg-surface-container transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              Feedback
            </button>
          </nav>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <button
              onClick={() => scrollTo('seasons')}
              className="hidden md:inline-flex items-center justify-center text-xs sm:text-sm font-medium text-plum-deep bg-surface-container-high hover:bg-surface-container-highest transition-colors px-3 sm:px-3.5 py-2 rounded-full whitespace-nowrap shrink-0 cursor-pointer"
            >
              Find your colours
            </button>
            <a
              href={APP_URL}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center justify-center text-xs sm:text-sm font-medium text-on-primary bg-primary hover:bg-primary-container transition-all shadow-[0_4px_16px_rgba(46,21,46,0.18)] px-3.5 sm:px-4 py-2 rounded-full whitespace-nowrap shrink-0 cursor-pointer"
            >
              Start a reading
            </a>
            <a
              href={APP_URL}
              target="_blank"
              rel="noopener"
              className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-on-primary hover:bg-primary-container transition-colors shrink-0 cursor-pointer"
              title="Open the app"
              aria-label="Open the app"
            >
              <span className="material-symbols-outlined text-[18px]">person</span>
            </a>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* MAIN DOCUMENT CONTAINER                                                   */}
      {/* ========================================================================= */}
      <main className="w-full pt-28 bg-background flex flex-col relative">
        {/* ======================================================================= */}
        {/* SECTION 1: EDITORIAL HERO                                               */}
        {/* ======================================================================= */}
        <section className="relative w-full px-4 sm:px-8 xl:px-16 py-16 lg:py-24 border-b border-surface-container/60 overflow-hidden" id="hero">
          {/* Atmospheric Ambient Glows */}
          <div className="pointer-events-none absolute -top-40 -left-36 w-[650px] h-[650px] rounded-full bg-gradient-to-br from-blush-rose/15 via-swatch-autumn-terracotta/10 to-transparent blur-[130px] chromatic-halo" />
          <div className="pointer-events-none absolute top-1/4 -right-36 w-[600px] h-[600px] rounded-full bg-gradient-to-bl from-champagne-gold/20 via-warm-bronze/15 to-transparent blur-[120px] chromatic-halo" style={{ animationDelay: '-5s' }} />

          <div className="max-w-[1360px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center relative z-20">
            {/* Left Editorial Copy (7 cols) */}
            <div className="lg:col-span-7 flex flex-col items-start gap-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-plum-deep text-cream-porcelain text-[11px] font-medium tracking-wide shadow-sm whitespace-nowrap">
                  <Swatch />
                  Read on your phone • Sealed for you alone
                </span>
                <span className="font-headline-italic italic text-secondary text-sm flex items-center gap-1.5">
                  <Swatch />
                  Named for the goddess who spoke in rainbows
                </span>
              </div>

              <h1 className="font-display-hero text-4xl sm:text-5xl lg:text-[64px] lg:leading-[70px] text-plum-deep tracking-tight">
                Your colours, <span className="font-headline-italic italic font-normal text-secondary">kept.</span>
              </h1>

              <p className="text-base sm:text-lg text-on-surface-variant max-w-2xl leading-relaxed">
                Get your colour reading right on your phone. Oira finds your season, your foundation shades and the lip colours that actually love you back, and your photo never goes near the cloud. When a brand wants to know if their shade suits you, they pay you for a private yes.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto pt-2">
                <a
                  href={APP_URL}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-base font-semibold text-on-primary bg-gradient-to-r from-blush-petal via-blush-rose to-secondary shadow-[0_10px_28px_rgba(200,123,151,0.38)] hover:brightness-105 active:scale-[0.99] transition-all duration-300 group whitespace-nowrap cursor-pointer"
                >
                  <span>Find your colours</span>
                  <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">east</span>
                </a>
                <button
                  onClick={() => scrollTo('how-it-works')}
                  className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-full text-base font-semibold text-plum-deep bg-surface-container-high hover:bg-surface-container-highest transition-all duration-300 border border-outline-variant/30 shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>How it works</span>
                </button>
                <button
                  onClick={() => scrollTo('calibrate')}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium text-on-surface-variant hover:text-plum-deep hover:bg-surface-container transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-warm-bronze text-[16px]">phone_iphone</span>
                  <span>Solana Seeker build</span>
                </button>
              </div>

              {/* Explicit Plain Trust Line */}
              <div className="flex items-center gap-2.5 p-3 px-4 rounded-2xl bg-cream-surface/90 border border-champagne-gold/35 text-plum-deep max-w-xl shadow-xs">
                <span className="material-symbols-outlined text-warm-bronze text-[20px] shrink-0">verified_user</span>
                <p className="text-sm font-medium leading-snug">
                  Your photo never leaves your phone. Brands only get a yes or no.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-6 pt-4 w-full max-w-lg border-t border-surface-container/60">
                <div className="flex flex-col">
                  <span className="font-display-hero text-2xl text-plum-deep font-semibold">Zero</span>
                  <span className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase">Photos uploaded</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-display-hero text-2xl text-plum-deep font-semibold">12</span>
                  <span className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase">Seasonal Palettes</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-display-hero text-2xl text-plum-deep font-semibold">100%</span>
                  <span className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase">Read on your phone</span>
                </div>
              </div>
            </div>

            {/* Right Visual Talisman (5 cols) */}
            <div className="lg:col-span-5 flex justify-center items-center relative">
              <div className="absolute inset-0 m-auto w-80 h-80 rounded-full bg-gradient-to-tr from-warm-bronze/20 via-champagne-gold/25 to-swatch-autumn-terracotta/15 blur-3xl" />
              <div
                onClick={() => setIsAppWalletOpen(true)}
                title="See an example wallet"
                className="relative w-full max-w-md bg-surface-container-lowest/95 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 shadow-[0_20px_50px_rgba(56,30,56,0.12)] border border-white/70 cursor-pointer hover:shadow-2xl transition-all"
              >
                <div className="flex items-center justify-between pb-4 border-b border-surface-container/60">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gold-shimmer flex items-center justify-center text-warm-bronze shadow-inner">
                      <span className="material-symbols-outlined text-[18px]">verified_user</span>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-plum-deep tracking-wider uppercase">Your Colour Profile</p>
                      <p className="text-xs text-on-surface-variant">An example reading</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cream-surface text-tertiary text-[10px] font-bold border border-champagne-gold/30 whitespace-nowrap shrink-0">
                    Example
                  </span>
                </div>

                <div className="mt-5 bg-plum-obsidian text-cream-porcelain rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden shadow-inner">
                  <div className="absolute -right-8 -bottom-8 w-36 h-36 rounded-full bg-gradient-to-tr from-blush-rose/30 to-warm-bronze/20 blur-2xl" />
                  <div className="flex items-baseline justify-between relative z-10">
                    <span className="text-[10px] font-bold text-champagne-gold uppercase tracking-widest">Seasonal Palette</span>
                    <span className="text-xs text-cream-porcelain/60">High precision match</span>
                  </div>
                  <div className="relative z-10">
                    <h3 className="font-display-hero text-2xl text-cream-luminous">Deep Autumn</h3>
                    <p className="text-xs text-cream-porcelain/80 mt-0.5">Warm Ochre • Rich Melanin Depth</p>
                  </div>
                  <div className="flex items-center justify-between pt-1 relative z-10">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-swatch-autumn-terracotta ring-2 ring-champagne-gold shadow-sm" title="Terracotta #9C4123" />
                      <span className="w-7 h-7 rounded-full bg-swatch-autumn-mustard shadow-sm" title="Warm Mustard #BD7B1B" />
                      <span className="w-7 h-7 rounded-full bg-warm-bronze shadow-sm" title="Burnished Bronze #C69A52" />
                      <span className="w-7 h-7 rounded-full bg-plum-deep shadow-sm" title="Obsidian Plum #381E38" />
                      <span className="w-7 h-7 rounded-full bg-[#5C2B1D] shadow-sm" title="Raw Cacao" />
                    </div>
                    <span className="text-[10px] font-semibold text-gold-shimmer">Harmonic Swatches</span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="p-3 bg-surface-container-low/90 rounded-xl">
                    <p className="text-[10px] font-bold uppercase text-on-surface-variant">L*a*b* Profile</p>
                    <p className="text-xs font-semibold text-plum-deep mt-0.5">42.1 / +16.2 / +24.8</p>
                  </div>
                  <div className="p-3 bg-surface-container-low/90 rounded-xl">
                    <p className="text-[10px] font-bold uppercase text-on-surface-variant">Skin Tone Depth</p>
                    <p className="text-xs font-semibold text-plum-deep mt-0.5">Scale IV (Rich Bronze)</p>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-gold-shimmer/35 border border-champagne-gold/30 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-warm-bronze text-[16px]">storefront</span>
                    <span className="text-xs font-medium text-plum-deep">A brand asked about your shade</span>
                  </div>
                  <span className="text-xs font-bold text-plum-deep">+4.50 USDC</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* SECTION 2: THE FOUR ACTS OF OIRA (FULLY INTERACTIVE 4 TABS)             */}
        {/* ======================================================================= */}
        <section className="relative w-full px-4 sm:px-8 xl:px-16 py-20 lg:py-28 bg-cream-surface/60 border-b border-surface-container/60 overflow-hidden" id="how-it-works">
          <div className="max-w-[1360px] mx-auto flex flex-col gap-12 relative z-20">
            {/* Section Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <span className="text-[11px] font-bold text-warm-bronze uppercase tracking-widest flex items-center gap-2">
                  <Swatch />
                  How it works
                </span>
                <h2 className="font-display-hero text-3xl sm:text-4xl lg:text-[44px] lg:leading-[52px] text-plum-deep mt-2">
                  The Four Acts of Oira
                </h2>
              </div>
              <p className="text-sm sm:text-base text-on-surface-variant max-w-md">
                From a colour reading on your own phone to brands paying for a yes, if you want them to. Four easy steps, and your photo stays with you the whole way.
              </p>
            </div>

            {/* Segmented Act Switcher Tabs */}
            <div className="flex items-center justify-start overflow-x-auto pb-2 gap-2 border-b border-surface-container/50">
              <button
                onClick={() => setActiveAct(1)}
                className={`act-tab-btn px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap cursor-pointer ${
                  activeAct === 1
                    ? 'bg-plum-deep text-cream-porcelain shadow-sm hover:brightness-110'
                    : 'bg-surface-container-high text-on-surface-variant hover:text-plum-deep hover:bg-surface-container-highest'
                }`}
              >
                Act 01 • Camera reading
              </button>
              <button
                onClick={() => setActiveAct(2)}
                className={`act-tab-btn px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap cursor-pointer ${
                  activeAct === 2
                    ? 'bg-plum-deep text-cream-porcelain shadow-sm hover:brightness-110'
                    : 'bg-surface-container-high text-on-surface-variant hover:text-plum-deep hover:bg-surface-container-highest'
                }`}
              >
                Act 02 • AR shade mirror
              </button>
              <button
                onClick={() => setActiveAct(3)}
                className={`act-tab-btn px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap cursor-pointer ${
                  activeAct === 3
                    ? 'bg-plum-deep text-cream-porcelain shadow-sm hover:brightness-110'
                    : 'bg-surface-container-high text-on-surface-variant hover:text-plum-deep hover:bg-surface-container-highest'
                }`}
              >
                Act 03 • Your private profile
              </button>
              <button
                onClick={() => setActiveAct(4)}
                className={`act-tab-btn px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap cursor-pointer ${
                  activeAct === 4
                    ? 'bg-plum-deep text-cream-porcelain shadow-sm hover:brightness-110'
                    : 'bg-surface-container-high text-on-surface-variant hover:text-plum-deep hover:bg-surface-container-highest'
                }`}
              >
                Act 04 • While you sleep
              </button>
            </div>

            {/* ACT 01 PANEL */}
            {activeAct === 1 && (
              <div className="act-panel grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12 items-center bg-surface-container-lowest rounded-3xl p-6 sm:p-8 lg:p-12 shadow-[0_12px_36px_rgba(56,30,56,0.06)] border border-surface-container/60 animate-in fade-in duration-300">
                <div className="md:col-span-6 relative w-full aspect-[3/4] max-h-[520px] rounded-2xl overflow-hidden bg-plum-obsidian shadow-md">
                  <img
                    alt="A woman's face during an Oira colour reading"
                    className="w-full h-full object-cover"
                    src={SPECTROMETRY_IMAGE}
                  />

                  {/* Optical Spectrometry Laser Scan Line */}
                  <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-champagne-gold to-transparent shadow-[0_0_16px_rgba(212,175,55,1)] animate-scan-laser pointer-events-none z-10" />

                  <div className="absolute inset-0 bg-gradient-to-t from-plum-deep/90 via-plum-deep/20 to-transparent flex flex-col justify-between p-5 pointer-events-none z-20">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-plum-obsidian/85 backdrop-blur-md text-champagne-gold text-[10px] font-bold border border-champagne-gold/40 shadow-sm">
                        <Swatch />
                        Example reading
                      </span>
                      <span className="text-[10px] font-semibold text-cream-porcelain/90 bg-plum-obsidian/75 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/20">
                        Calibrated natural daylight
                      </span>
                    </div>

                    {/* Biometric Face Target Reticle in Center */}
                    <div className="relative w-40 h-40 mx-auto border border-dashed border-champagne-gold/70 rounded-full flex items-center justify-center animate-subtle-pulse pointer-events-none">
                      <div className="w-32 h-32 border border-white/35 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-champagne-gold shadow-[0_0_8px_rgba(212,175,55,0.9)]" />
                      </div>
                      <span className="absolute -top-2.5 text-[9px] font-mono tracking-wider text-gold-shimmer bg-plum-obsidian/90 px-2 py-0.5 rounded border border-champagne-gold/40">
                        YOUR UNDERTONE
                      </span>
                      <span className="absolute -bottom-2.5 text-[9px] font-mono tracking-wider text-cream-porcelain bg-plum-obsidian/90 px-2 py-0.5 rounded border border-white/30">
                        AND YOUR DEPTH
                      </span>
                    </div>

                    {/* Bottom HUD Bar */}
                    <div className="bg-surface-container-lowest/95 backdrop-blur-md p-3.5 rounded-xl flex items-center justify-between shadow-xl border border-white/50 pointer-events-auto">
                      <div>
                        <p className="text-[10px] font-bold text-plum-deep uppercase tracking-wider">Skin Colour Profile</p>
                        <p className="text-xs font-mono font-semibold text-secondary">L* 42.1 &nbsp; a* +16.2 &nbsp; b* +24.8</p>
                      </div>
                      <div className="text-right border-l border-surface-container-high pl-3">
                        <p className="text-[10px] font-bold text-tertiary uppercase tracking-wider">Tone Depth</p>
                        <p className="text-xs font-bold text-plum-deep">Warm Bronze (Tier IV)</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-6 flex flex-col gap-5 justify-center">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-blush-rose uppercase tracking-wider">Act 01</span>
                    <span className="text-outline-variant">•</span>
                    <span className="text-[11px] font-semibold text-on-surface-variant">Runs on your phone</span>
                  </div>
                  <h3 className="font-display-hero text-2xl sm:text-3xl lg:text-[34px] lg:leading-[42px] text-plum-deep">
                    A reading that sees skin as skin
                  </h3>
                  <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed">
                    Your skin isn't one flat colour, so Oira doesn't read it like one. Your phone's camera does the looking, and your undertone and depth get worked out right there on the phone. Your photo never has to go anywhere.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                    <div className="p-4 rounded-xl bg-cream-porcelain border border-surface-container/70 shadow-xs">
                      <span className="text-[10px] font-bold uppercase text-warm-bronze">Every Depth</span>
                      <p className="font-display-hero text-xl text-plum-deep mt-1">Deep tones first</p>
                      <p className="text-xs text-on-surface-variant">Never an afterthought</p>
                    </div>
                    <div className="p-4 rounded-xl bg-cream-porcelain border border-surface-container/70 shadow-xs">
                      <span className="text-[10px] font-bold uppercase text-warm-bronze">Nothing In The Cloud</span>
                      <p className="font-display-hero text-xl text-plum-deep mt-1">0 photos uploaded</p>
                      <p className="text-xs text-on-surface-variant">Your picture stays on your phone</p>
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-gold-shimmer/25 border border-champagne-gold/30 flex items-start gap-3 shadow-xs">
                    <span className="material-symbols-outlined text-warm-bronze text-[20px] mt-0.5 shrink-0">verified</span>
                    <p className="text-xs sm:text-sm text-plum-deep leading-relaxed">
                      Sealed before it leaves your hand: your reading gets locked up on your phone first, so the exact result is yours and nobody else&apos;s.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <a
                      href={APP_URL}
                      target="_blank"
                      rel="noopener"
                      className="self-start px-6 py-3 rounded-full bg-plum-deep text-cream-porcelain hover:bg-primary-container text-xs font-semibold shadow-md transition-all cursor-pointer"
                    >
                      Start a reading &rarr;
                    </a>
                    <button
                      onClick={() => setIsBiometricScanOpen(true)}
                      className="px-5 py-3 rounded-full bg-surface-container-high text-plum-deep hover:bg-surface-container-highest text-xs font-semibold transition-all cursor-pointer"
                    >
                      See an example
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ACT 02 PANEL */}
            {activeAct === 2 && (
              <div className="act-panel grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12 items-center bg-surface-container-lowest rounded-3xl p-6 sm:p-8 lg:p-12 shadow-[0_12px_36px_rgba(56,30,56,0.06)] border border-surface-container/60 animate-in fade-in duration-300">
                <div className="md:col-span-6 relative w-full aspect-[3/4] max-h-[520px] rounded-2xl overflow-hidden bg-plum-obsidian shadow-md">
                  <img
                    alt="A shade shown side by side with skin in the Oira mirror"
                    className="w-full h-full object-cover transition-opacity duration-300"
                    src={
                      mirrorView === 'foundation'
                        ? SHADE_MIRROR_IMAGE
                        : SPECTROMETRY_IMAGE
                    }
                  />
                  {/* Subtle lighting filter matching Kelvin selection */}
                  {selectedKelvin === '3200K' && (
                    <div className="absolute inset-0 bg-[#d4af37]/10 mix-blend-color-dodge pointer-events-none" />
                  )}
                  {selectedKelvin === '2400K' && (
                    <div className="absolute inset-0 bg-[#9C4123]/15 mix-blend-multiply pointer-events-none" />
                  )}

                  <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-plum-obsidian/85 backdrop-blur-md border border-champagne-gold/30 text-champagne-gold text-[10px] font-bold pointer-events-auto">
                      <span>Example</span>
                    </div>
                    <div className="flex gap-1.5 pointer-events-auto">
                      <button
                        onClick={() => setMirrorView('foundation')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold shadow-sm transition-all cursor-pointer whitespace-nowrap ${
                          mirrorView === 'foundation'
                            ? 'bg-plum-deep text-cream-porcelain'
                            : 'bg-surface-container-high/90 text-on-surface hover:bg-cream-surface'
                        }`}
                      >
                        Foundation Split
                      </button>
                      <button
                        onClick={() => setMirrorView('lip')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold shadow-sm transition-all cursor-pointer whitespace-nowrap ${
                          mirrorView === 'lip'
                            ? 'bg-plum-deep text-cream-porcelain'
                            : 'bg-surface-container-high/90 text-on-surface hover:bg-cream-surface'
                        }`}
                      >
                        Lip Harmony
                      </button>
                    </div>
                  </div>

                  <div className="absolute bottom-4 left-4 right-4 bg-surface-container-lowest/95 backdrop-blur-md p-4 rounded-xl flex items-center justify-between border border-white/60 shadow-lg">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-plum-deep">
                        {mirrorView === 'foundation' ? 'Foundation Match Comparison' : 'Lip Harmony Comparison'}
                      </p>
                      <p className="text-xs font-semibold text-secondary">
                        {mirrorView === 'foundation'
                          ? 'Example foundation: Burnished Hazel, half and half'
                          : 'Example lips: Spiced Cinnamon and Velvet Bordeaux'}
                      </p>
                    </div>
                    <span className="text-[10px] px-2.5 py-1 rounded-md bg-plum-deep text-cream-porcelain font-bold">
                      {mirrorView === 'foundation' ? 'Suits you' : 'Loves you back'}
                    </span>
                  </div>
                </div>

                <div className="md:col-span-6 flex flex-col gap-5 justify-center">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-blush-rose uppercase tracking-wider">Act 02</span>
                    <span className="text-outline-variant">•</span>
                    <span className="text-[11px] font-semibold text-on-surface-variant">A preview of what's coming</span>
                  </div>
                  <h3 className="font-display-hero text-2xl sm:text-3xl lg:text-[34px] lg:leading-[42px] text-plum-deep">
                    The shade mirror &amp; lip harmony
                  </h3>
                  <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed">
                    Try a shade on your own face before you spend a penny on it. See how it holds up in bright daylight, warm golden hour and candlelight, because the shop light lies and you know it does.
                  </p>

                  <div className="flex flex-col gap-2 pt-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-plum-deep">Change the light</span>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setSelectedKelvin('5500K')}
                        className={`kelvin-btn p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                          selectedKelvin === '5500K'
                            ? 'bg-gold-shimmer/50 border border-champagne-gold shadow-sm'
                            : 'bg-surface-container-high hover:bg-cream-surface'
                        }`}
                      >
                        <p className="text-[11px] font-bold text-warm-bronze">Daylight</p>
                        <p className="text-xs text-on-surface-variant">By the window</p>
                      </button>
                      <button
                        onClick={() => setSelectedKelvin('3200K')}
                        className={`kelvin-btn p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                          selectedKelvin === '3200K'
                            ? 'bg-gold-shimmer/50 border border-champagne-gold shadow-sm'
                            : 'bg-surface-container-high hover:bg-cream-surface'
                        }`}
                      >
                        <p className="text-[11px] font-bold text-plum-deep">Golden hour</p>
                        <p className="text-xs text-plum-deep">Late afternoon</p>
                      </button>
                      <button
                        onClick={() => setSelectedKelvin('2400K')}
                        className={`kelvin-btn p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                          selectedKelvin === '2400K'
                            ? 'bg-gold-shimmer/50 border border-champagne-gold shadow-sm'
                            : 'bg-surface-container-high hover:bg-cream-surface'
                        }`}
                      >
                        <p className="text-[11px] font-bold text-secondary">Evening</p>
                        <p className="text-xs text-on-surface-variant">Candlelight</p>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
                    <div
                      onClick={() => setMirrorView('lip')}
                      className="flex items-center justify-between p-2.5 bg-cream-porcelain rounded-xl border border-surface-container/60 hover:border-blush-rose/40 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#9C4123] shadow-inner shrink-0" />
                        <span className="text-xs font-medium text-plum-deep">Example lip: Spiced Cinnamon</span>
                      </div>
                      <span className="text-[10px] font-bold text-warm-bronze uppercase">Your best lip</span>
                    </div>
                    <div
                      onClick={() => setMirrorView('foundation')}
                      className="flex items-center justify-between p-2.5 bg-cream-porcelain rounded-xl border border-surface-container/60 hover:border-blush-rose/40 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#C69A52] shadow-inner shrink-0" />
                        <span className="text-xs font-medium text-plum-deep">Example base: Burnished Hazel</span>
                      </div>
                      <span className="text-[10px] font-bold text-warm-bronze uppercase">Your shade</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ACT 03 PANEL */}
            {activeAct === 3 && (
              <div className="act-panel grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-surface-container-lowest rounded-3xl p-6 sm:p-10 lg:p-12 shadow-[0_12px_36px_rgba(56,30,56,0.06)] border border-surface-container/60 animate-in fade-in duration-300">
                <div className="lg:col-span-12 flex flex-col gap-8">
                  <div className="max-w-3xl">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-warm-bronze">Act 03 • What Oira gets to know</span>
                    <h3 className="font-display-hero text-2xl sm:text-3xl lg:text-[34px] lg:leading-[42px] text-plum-deep mt-2">
                      Four parts of you, all of them private
                    </h3>
                    <p className="text-sm sm:text-base text-on-surface-variant mt-2 leading-relaxed">
                      Everything Oira learns about you falls into one of these four, and every bit of it stays yours. One scan reads all four at once, right there on your phone, and a brand can find out whether its foundation suits you without ever seeing your face.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-cream-porcelain rounded-2xl p-6 flex flex-col justify-between h-full border border-surface-container/70 shadow-sm hover:shadow-md transition-all">
                      <div className="flex flex-col gap-3">
                        <div className="w-10 h-10 rounded-full bg-blush-soft flex items-center justify-center text-blush-rose shadow-inner">
                          <span className="material-symbols-outlined text-[20px]">palette</span>
                        </div>
                        <h4 className="font-display-hero text-lg text-plum-deep">1. Skin Tone &amp; Undertone</h4>
                        <ul className="text-xs text-on-surface-variant flex flex-col gap-2 leading-relaxed">
                          <li>• Warm, cool or neutral</li>
                          <li>• How deep your tone runs</li>
                          <li>• Your season</li>
                          <li>• The shades that suit you</li>
                        </ul>
                      </div>
                      <div className="pt-4 mt-3 border-t border-surface-container">
                        <span className="text-[10px] font-bold text-warm-bronze uppercase">Yours • Ready now</span>
                      </div>
                    </div>

                    <div className="bg-cream-porcelain rounded-2xl p-6 flex flex-col justify-between h-full border border-surface-container/70 shadow-sm hover:shadow-md transition-all">
                      <div className="flex flex-col gap-3">
                        <div className="w-10 h-10 rounded-full bg-gold-shimmer/60 flex items-center justify-center text-warm-bronze shadow-inner">
                          <span className="material-symbols-outlined text-[20px]">water_drop</span>
                        </div>
                        <h4 className="font-display-hero text-lg text-plum-deep">2. Skin Texture &amp; Balance</h4>
                        <ul className="text-xs text-on-surface-variant flex flex-col gap-2 leading-relaxed">
                          <li>• Dry, normal or well hydrated</li>
                          <li>• Matte, balanced or dewy</li>
                          <li>• The odd blemish, gently</li>
                          <li>• How your lips are doing</li>
                        </ul>
                      </div>
                      <div className="pt-4 mt-3 border-t border-surface-container">
                        <span className="text-[10px] font-bold text-warm-bronze uppercase">Yours • Ready now</span>
                      </div>
                    </div>

                    <div className="bg-cream-porcelain rounded-2xl p-6 flex flex-col justify-between h-full border border-surface-container/70 shadow-sm hover:shadow-md transition-all">
                      <div className="flex flex-col gap-3">
                        <div className="w-10 h-10 rounded-full bg-secondary-fixed flex items-center justify-center text-secondary shadow-inner">
                          <span className="material-symbols-outlined text-[20px]">face</span>
                        </div>
                        <h4 className="font-display-hero text-lg text-plum-deep">3. Face &amp; Features</h4>
                        <ul className="text-xs text-on-surface-variant flex flex-col gap-2 leading-relaxed">
                          <li>• Your face shape</li>
                          <li>• Your brows</li>
                          <li>• The shape of your lips</li>
                          <li>• The frames that suit you</li>
                        </ul>
                      </div>
                      <div className="pt-4 mt-3 border-t border-surface-container">
                        <span className="text-[10px] font-bold text-warm-bronze uppercase">Yours • Ready now</span>
                      </div>
                    </div>

                    <div className="bg-cream-porcelain rounded-2xl p-6 flex flex-col justify-between h-full border border-surface-container/70 shadow-sm hover:shadow-md transition-all">
                      <div className="flex flex-col gap-3">
                        <div className="w-10 h-10 rounded-full bg-plum-accent/10 flex items-center justify-center text-plum-deep shadow-inner">
                          <span className="material-symbols-outlined text-[20px]">waves</span>
                        </div>
                        <h4 className="font-display-hero text-lg text-plum-deep">4. Your Hair</h4>
                        <ul className="text-xs text-on-surface-variant flex flex-col gap-2 leading-relaxed">
                          <li>• Curl pattern, 1A to 4C</li>
                          <li>• How much of it there is</li>
                          <li>• Night care for your curls</li>
                          <li>• You get the last word on it</li>
                        </ul>
                      </div>
                      <div className="pt-4 mt-3 border-t border-surface-container">
                        <span className="text-[10px] font-bold text-warm-bronze uppercase">Yours • Ready now</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ACT 04 PANEL */}
            {activeAct === 4 && (
              <div className="act-panel grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12 items-center bg-surface-container-lowest rounded-3xl p-6 sm:p-8 lg:p-12 shadow-[0_12px_36px_rgba(56,30,56,0.06)] border border-surface-container/60 animate-in fade-in duration-300">
                <div className="md:col-span-6 flex flex-col gap-5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-warm-bronze">Act 04</span>
                    <span className="text-outline-variant">•</span>
                    <span className="text-[11px] font-semibold text-on-surface-variant">You get paid</span>
                  </div>
                  <h3 className="font-display-hero text-2xl sm:text-3xl lg:text-[34px] lg:leading-[42px] text-plum-deep">
                    While you sleep, a brand pays for a yes
                  </h3>
                  <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed">
                    Beauty brands spend a fortune every year guessing who wears which shade. With Oira they can just ask. A brand asks whether its shade suits you, it gets a private yes or no, and if it&apos;s a yes, you get paid. You don&apos;t have to do a thing.
                  </p>
                  <div className="bg-plum-obsidian text-cream-porcelain p-6 rounded-2xl flex flex-col gap-3 shadow-md border border-white/10">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-champagne-gold font-bold uppercase tracking-wider text-[10px]">A brand asks</span>
                      <span className="text-cream-porcelain/60 font-mono text-[11px]">Example</span>
                    </div>
                    <p className="font-display-hero text-base text-cream-luminous">
                      &ldquo;Is she a Deep Autumn with a warm undertone?&rdquo;
                    </p>
                    <div className="flex items-center gap-3 pt-1">
                      <div className="px-3 py-1 rounded bg-cream-surface/10 text-champagne-gold font-mono text-xs">
                        The answer: yes
                      </div>
                      <div className="px-3 py-1 rounded bg-blush-rose/20 text-blush-petal font-mono text-xs">
                        Her photo: never sent
                      </div>
                    </div>
                    <div className="mt-2 pt-3 border-t border-cream-surface/10 flex items-center justify-between">
                      <span className="text-xs text-cream-porcelain/80">Paid to you</span>
                      <span className="text-base font-bold text-gold-shimmer">+${bidFee.toFixed(2)} USDC</span>
                    </div>
                  </div>
                  <p className="text-xs text-on-surface-variant">
                    What the brand learned about your name, your face or who you are: <span className="font-bold text-plum-deep">absolutely nothing.</span>
                  </p>
                </div>

                <div className="md:col-span-6 flex flex-col gap-5 bg-cream-porcelain p-6 sm:p-8 rounded-2xl border border-surface-container/70 shadow-sm">
                  <h4 className="font-display-hero text-xl text-plum-deep">You decide what a question is worth</h4>
                  <p className="text-xs sm:text-sm text-on-surface-variant">Your call, always. Anything outside your rules gets turned away quietly, and nothing about you is shared to find that out. Slide it to play with an example.</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase">What a question is worth to you</span>
                      <span className="text-sm font-bold text-plum-deep">${bidFee.toFixed(2)} USDC</span>
                    </div>
                    <input
                      className="w-full accent-secondary cursor-pointer h-2 bg-surface-container rounded-lg"
                      max="15"
                      min="1"
                      step="0.5"
                      type="range"
                      value={bidFee}
                      onChange={(e) => setBidFee(parseFloat(e.target.value))}
                    />
                    <div className="flex justify-between text-[11px] text-on-surface-variant font-medium">
                      <span>$1.00 (ask me lots)</span>
                      <span>$15.00 (only the special ones)</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="bg-surface-container-lowest p-4 rounded-xl border border-surface-container/50">
                      <p className="text-[10px] font-bold uppercase text-on-surface-variant">An example month</p>
                      <p className="font-display-hero text-xl text-plum-deep mt-1 font-bold">${totalMonthly} USDC</p>
                    </div>
                    <div className="bg-surface-container-lowest p-4 rounded-xl border border-surface-container/50">
                      <p className="text-[10px] font-bold uppercase text-on-surface-variant">Yeses that month</p>
                      <p className="font-display-hero text-xl text-plum-deep mt-1 font-bold">{simulatedMatches} yeses</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-on-surface-variant">Made-up numbers to show the idea. What you&apos;d really earn depends on which brands ask, and how often.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ======================================================================= */}
        {/* SECTION 3: WHY IT IS PRIVATE                                           */}
        {/* ======================================================================= */}
        <section className="relative w-full px-4 sm:px-8 xl:px-16 py-20 lg:py-28 bg-background border-b border-surface-container/60 overflow-hidden" id="architecture">
          <div className="max-w-[1360px] mx-auto flex flex-col gap-14 relative z-20">
            <div className="text-center max-w-3xl mx-auto flex flex-col items-center gap-2">
              <span className="text-[11px] font-bold text-warm-bronze uppercase tracking-widest flex items-center gap-2">
                <Swatch />
                Why it&apos;s private
              </span>
              <h2 className="font-display-hero text-3xl sm:text-4xl lg:text-[44px] lg:leading-[52px] text-plum-deep">
                Privacy as Architecture, <span className="font-headline-italic italic font-normal text-secondary">not Policy.</span>
              </h2>
              <p className="text-base text-on-surface-variant mt-2 leading-relaxed">
                The valuable thing was never a photo sitting in somebody&apos;s cloud. It&apos;s knowing that a foundation really suits her. Your colours belong to you, you decide who gets to ask, and when the answer&apos;s yes, you&apos;re the one who gets paid.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
              {/* Legacy Privacy Policy & Central Storage Card */}
              <div className="bg-surface-container rounded-3xl p-8 lg:p-10 flex flex-col justify-between gap-6 border border-surface-variant/70 shadow-sm">
                <div className="flex flex-col gap-5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">The Broken Legacy Model</span>
                    <span className="px-2.5 py-1 rounded bg-error-container text-on-error-container text-[10px] font-bold whitespace-nowrap">Just trust us</span>
                  </div>
                  <h3 className="font-display-hero text-2xl sm:text-3xl text-plum-deep">
                    Big databases &amp; small print
                  </h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    Most beauty apps ask you to trust a privacy policy while your selfies, the shape of your face and your shade data get uploaded to their servers.
                  </p>
                  <div className="flex flex-col gap-3.5 pt-2">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-error text-[20px] mt-0.5 shrink-0">close</span>
                      <div>
                        <p className="text-xs font-semibold text-plum-deep">Promises that can change</p>
                        <p className="text-xs text-on-surface-variant">A policy is just words. It can be rewritten next month, leaked, handed over, or fed to some AI.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-error text-[20px] mt-0.5 shrink-0">close</span>
                      <div>
                        <p className="text-xs font-semibold text-plum-deep">One big pile of faces</p>
                        <p className="text-xs text-on-surface-variant">Photos and skin data piled up on one server are exactly what hackers go looking for.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-error text-[20px] mt-0.5 shrink-0">close</span>
                      <div>
                        <p className="text-xs font-semibold text-plum-deep">Zero value back to you</p>
                        <p className="text-xs text-on-surface-variant">Brands make money from your data, and you get nothing back. Not even a say.</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-3.5 bg-surface-container-high rounded-xl text-center text-xs text-on-surface-variant font-medium border border-surface-container-highest">
                  A policy asks you to trust it. Oira is built so you don&apos;t have to.
                </div>
              </div>

              {/* The Oira way */}
              <div className="bg-plum-obsidian text-cream-porcelain rounded-3xl p-8 lg:p-10 flex flex-col justify-between gap-6 shadow-[0_16px_48px_rgba(46,21,46,0.18)] relative overflow-hidden border border-champagne-gold/30">
                <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-champagne-gold/15 via-blush-rose/15 to-transparent rounded-full blur-3xl pointer-events-none" />
                <div className="flex flex-col gap-5 relative z-10">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-champagne-gold">The Oira Standard</span>
                    <span className="px-2.5 py-1 rounded bg-champagne-gold/20 text-gold-shimmer text-[10px] font-bold border border-champagne-gold/40 whitespace-nowrap">Private matching by MagicBlock</span>
                  </div>
                  <h3 className="font-display-hero text-2xl sm:text-3xl text-cream-luminous">
                    Your phone does the work, not our servers
                  </h3>
                  <p className="text-sm text-cream-porcelain/80 leading-relaxed">
                    Oira works out whether a product suits you without anybody seeing who you are or what you look like. Not the brand, and not us either.
                  </p>
                  <div className="flex flex-col gap-3.5 pt-2">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-champagne-gold text-[20px] mt-0.5 shrink-0">verified</span>
                      <div>
                        <p className="text-xs font-semibold text-cream-luminous">An answer, not a photo</p>
                        <p className="text-xs text-cream-porcelain/70">Brands never get your photo. All they hear is &ldquo;yes, this suits her&rdquo; or &ldquo;no, it doesn&apos;t.&rdquo;</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-champagne-gold text-[20px] mt-0.5 shrink-0">verified</span>
                      <div>
                        <p className="text-xs font-semibold text-cream-luminous">Owned by you</p>
                        <p className="text-xs text-cream-porcelain/70">Your reading is sealed on your phone, and only you can open it. You choose who&apos;s allowed to ask and what stays hidden.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-champagne-gold text-[20px] mt-0.5 shrink-0">verified</span>
                      <div>
                        <p className="text-xs font-semibold text-cream-luminous">Nothing kept afterwards</p>
                        <p className="text-xs text-cream-porcelain/70">Once a question&apos;s answered, there&apos;s nothing left lying around for anyone to keep.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-champagne-gold text-[20px] mt-0.5 shrink-0">verified</span>
                      <div>
                        <p className="text-xs font-semibold text-cream-luminous">Paid straight to you</p>
                        <p className="text-xs text-cream-porcelain/70">When it&apos;s a yes, the brand pays you straight away, and there&apos;s a public receipt to prove it.</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-3.5 bg-plum-deep/90 rounded-xl text-center text-xs text-champagne-gold relative z-10 border border-champagne-gold/20 font-medium">
                  Neither Oira nor the brand ever sees your face. Only the answer gets out.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* SECTION 4: CHROMATIC ARCHETYPES & SEASONAL PALETTES                    */}
        {/* ======================================================================= */}
        <section className="relative w-full px-4 sm:px-8 xl:px-16 py-20 lg:py-28 bg-cream-surface/40 border-b border-surface-container/60 overflow-hidden" id="seasons">
          {/* Monk Skin Tone Scale Aesthetic Backdrop */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-20 mix-blend-multiply filter blur-[1px]">
            <img
              alt="Monk Skin Tone Scale chromatic continuum"
              className="w-full h-full object-cover"
              src={CHROMATIC_CONTINUUM_IMAGE}
            />
          </div>

          <div className="max-w-[1360px] mx-auto flex flex-col gap-12 relative z-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <span className="text-[11px] font-bold text-warm-bronze uppercase tracking-widest flex items-center gap-2">
                  <Swatch />
                  The Seasonal Spectrum
                </span>
                <h2 className="font-display-hero text-3xl sm:text-4xl lg:text-[44px] lg:leading-[52px] text-plum-deep mt-2">
                  Deep tones first, <span className="font-headline-italic italic font-normal text-secondary">never an afterthought.</span>
                </h2>
              </div>
              <p className="text-sm sm:text-base text-on-surface-variant max-w-md">
                Most seasonal systems were built around a handful of skin tones. Oira reads across twelve seasons, so every undertone gets matched properly, yours included.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Archetype 1: Deep Autumn */}
              <div
                onClick={() => setSelectedArchetype(FEATURED_ARCHETYPES[0])}
                className="bg-surface-container-lowest p-6 sm:p-8 rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-surface-container/70 flex flex-col justify-between gap-5 group cursor-pointer"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-warm-bronze">Archetype 01</span>
                    <span className="text-[11px] font-semibold text-on-surface-variant">Deep • Warm</span>
                  </div>
                  <h4 className="font-display-hero text-xl text-plum-deep group-hover:text-secondary transition-colors">Deep Autumn</h4>
                  <p className="text-xs text-on-surface-variant leading-relaxed">Spiced clove, terracotta, burnt caramel, and blackened olive harmonies.</p>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-surface-container">
                  <span className="w-7 h-7 rounded-full bg-swatch-autumn-terracotta ring-2 ring-champagne-gold shadow-md" title="Terracotta #9C4123" />
                  <span className="w-7 h-7 rounded-full bg-swatch-autumn-mustard shadow-sm" title="Mustard #BD7B1B" />
                  <span className="w-7 h-7 rounded-full bg-warm-bronze shadow-sm" title="Warm Bronze #C69A52" />
                  <span className="w-7 h-7 rounded-full bg-[#5C2B1D] shadow-sm" title="Dark Amber" />
                  <span className="w-7 h-7 rounded-full bg-[#2A160F] shadow-sm" title="Rich Espresso" />
                </div>
              </div>

              {/* Archetype 2: Deep Winter */}
              <div
                onClick={() => setSelectedArchetype(FEATURED_ARCHETYPES[1])}
                className="bg-surface-container-lowest p-6 sm:p-8 rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-surface-container/70 flex flex-col justify-between gap-5 group cursor-pointer"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-secondary">Archetype 02</span>
                    <span className="text-[11px] font-semibold text-on-surface-variant">Deepest • Cool</span>
                  </div>
                  <h4 className="font-display-hero text-xl text-plum-deep group-hover:text-secondary transition-colors">Deep Winter</h4>
                  <p className="text-xs text-on-surface-variant leading-relaxed">Chilled boysenberry, midnight obsidian, ruby ember, and frosted espresso.</p>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-surface-container">
                  <span className="w-7 h-7 rounded-full bg-swatch-winter-berry ring-2 ring-blush-rose shadow-md" title="Winter Berry #781D42" />
                  <span className="w-7 h-7 rounded-full bg-swatch-winter-sapphire shadow-sm" title="Sapphire #1E3B70" />
                  <span className="w-7 h-7 rounded-full bg-plum-deep shadow-sm" title="Plum Deep #381E38" />
                  <span className="w-7 h-7 rounded-full bg-[#4A0E17] shadow-sm" title="Garnet" />
                  <span className="w-7 h-7 rounded-full bg-[#18151D] shadow-sm" title="Obsidian" />
                </div>
              </div>

              {/* Archetype 3: Warm Spring */}
              <div
                onClick={() => setSelectedArchetype(FEATURED_ARCHETYPES[2])}
                className="bg-surface-container-lowest p-6 sm:p-8 rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-surface-container/70 flex flex-col justify-between gap-5 group cursor-pointer"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-swatch-spring-coral">Archetype 03</span>
                    <span className="text-[11px] font-semibold text-on-surface-variant">Light • Warm</span>
                  </div>
                  <h4 className="font-display-hero text-xl text-plum-deep group-hover:text-secondary transition-colors">Warm Spring</h4>
                  <p className="text-xs text-on-surface-variant leading-relaxed">Luminous peach nectar, sunlit persimmon, amber pollen, and golden linen.</p>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-surface-container">
                  <span className="w-7 h-7 rounded-full bg-swatch-spring-coral shadow-sm" title="Coral #E26D5C" />
                  <span className="w-7 h-7 rounded-full bg-swatch-spring-peach ring-2 ring-warm-bronze shadow-md" title="Peach #F4A261" />
                  <span className="w-7 h-7 rounded-full bg-champagne-gold shadow-sm" title="Gold #D4AF37" />
                  <span className="w-7 h-7 rounded-full bg-[#F3C28B] shadow-sm" title="Almond" />
                  <span className="w-7 h-7 rounded-full bg-[#7D492A] shadow-sm" title="Warm Earth" />
                </div>
              </div>

              {/* Archetype 4: Cool Summer */}
              <div
                onClick={() => setSelectedArchetype(FEATURED_ARCHETYPES[3])}
                className="bg-surface-container-lowest p-6 sm:p-8 rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-surface-container/70 flex flex-col justify-between gap-5 group cursor-pointer"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-swatch-summer-lavender">Archetype 04</span>
                    <span className="text-[11px] font-semibold text-on-surface-variant">Medium • Cool</span>
                  </div>
                  <h4 className="font-display-hero text-xl text-plum-deep group-hover:text-secondary transition-colors">Cool Summer</h4>
                  <p className="text-xs text-on-surface-variant leading-relaxed">Rosewater veil, smoky lavender, ash-rose silk, and twilight periwinkle.</p>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-surface-container">
                  <span className="w-7 h-7 rounded-full bg-swatch-summer-rosewater shadow-sm" title="Rosewater #CF8BA3" />
                  <span className="w-7 h-7 rounded-full bg-swatch-summer-lavender ring-2 ring-secondary shadow-md" title="Lavender #8C7DAA" />
                  <span className="w-7 h-7 rounded-full bg-[#A89CB9] shadow-sm" title="Lilac Dusk" />
                  <span className="w-7 h-7 rounded-full bg-[#5F536F] shadow-sm" title="Smoky Violet" />
                  <span className="w-7 h-7 rounded-full bg-[#342A38] shadow-sm" title="Twilight Plum" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* SECTION 5: PRIVACY & BOUNDARIES                                         */}
        {/* ======================================================================= */}
        <section className="relative w-full px-4 sm:px-8 xl:px-16 py-20 lg:py-28 bg-background border-b border-surface-container/60 overflow-hidden" id="privacy">
          <div className="max-w-[1360px] mx-auto flex flex-col gap-12 relative z-20">
            <div className="text-center max-w-2xl mx-auto">
              <span className="text-[11px] font-bold uppercase tracking-widest text-warm-bronze">Plainly, with nothing hidden</span>
              <h2 className="font-display-hero text-3xl sm:text-4xl lg:text-[44px] lg:leading-[52px] text-plum-deep mt-2">
                What stays on your phone, and what doesn&apos;t
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* What Stays In Your Hand */}
              <div className="p-8 lg:p-10 bg-surface-container rounded-3xl flex flex-col gap-6 border border-surface-variant/70 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-plum-deep text-cream-porcelain flex items-center justify-center shadow-inner">
                    <span className="material-symbols-outlined text-[18px]">smartphone</span>
                  </span>
                  <h3 className="font-display-hero text-2xl text-plum-deep">Stays on your phone, always</h3>
                </div>
                <ul className="flex flex-col gap-4 pt-2">
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-warm-bronze text-[18px] mt-0.5 shrink-0">lock</span>
                    <div>
                      <p className="text-sm font-semibold text-plum-deep">Your photo</p>
                      <p className="text-xs text-on-surface-variant">It&apos;s read right where you took it, and it never gets uploaded. Not once.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-warm-bronze text-[18px] mt-0.5 shrink-0">lock</span>
                    <div>
                      <p className="text-sm font-semibold text-plum-deep">Your reading</p>
                      <p className="text-xs text-on-surface-variant">Your undertone, your depth, your season, your shades. Sealed on your phone, and only your phone can open it.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-warm-bronze text-[18px] mt-0.5 shrink-0">lock</span>
                    <div>
                      <p className="text-sm font-semibold text-plum-deep">Who you are</p>
                      <p className="text-xs text-on-surface-variant">No account to make and no email to hand over. Nothing ties your colours to your name.</p>
                    </div>
                  </li>
                </ul>
              </div>

              {/* What goes on Solana */}
              <div className="p-8 lg:p-10 bg-surface-container-low rounded-3xl flex flex-col gap-6 border border-surface-container-high shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-gold-shimmer text-warm-bronze flex items-center justify-center shadow-inner">
                    <span className="material-symbols-outlined text-[18px]">bolt</span>
                  </span>
                  <h3 className="font-display-hero text-2xl text-plum-deep">Goes on Solana, in the open</h3>
                </div>
                <ul className="flex flex-col gap-4 pt-2">
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-warm-bronze text-[18px] mt-0.5 shrink-0">verified</span>
                    <div>
                      <p className="text-sm font-semibold text-plum-deep">Proof your reading is real</p>
                      <p className="text-xs text-on-surface-variant">A sealed stamp that shows your reading hasn&apos;t been swapped. It doesn&apos;t show anything else.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-warm-bronze text-[18px] mt-0.5 shrink-0">verified</span>
                    <div>
                      <p className="text-sm font-semibold text-plum-deep">One answer: yes, or no</p>
                      <p className="text-xs text-on-surface-variant">That&apos;s all a brand ever hears back. &ldquo;Yes, this shade suits her,&rdquo; or nothing at all.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-warm-bronze text-[18px] mt-0.5 shrink-0">verified</span>
                    <div>
                      <p className="text-sm font-semibold text-plum-deep">The payment, from them to you</p>
                      <p className="text-xs text-on-surface-variant">Straight into your own wallet. We never hold your money.</p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* SECTION 6: FOR BRANDS (WITH LUXURY 3D GILDED FIGS TEXTURE)              */}
        {/* ======================================================================= */}
        <section className="relative w-full px-4 sm:px-8 xl:px-16 py-20 lg:py-28 bg-plum-deep text-cream-porcelain border-b border-plum-accent/60 overflow-hidden" id="for-brands">
          {/* 3D Luxury Ripe Golden Figs Background Texture */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-35 mix-blend-luminosity filter saturate-150">
            <img
              alt="Golden figs with plum leaves"
              className="w-full h-full object-cover"
              src={GILDED_FIGS_IMAGE}
            />
          </div>

          <div className="max-w-[1360px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center relative z-20">
            <div className="lg:col-span-7 flex flex-col gap-6">
              <span className="text-[11px] font-bold text-champagne-gold uppercase tracking-widest flex items-center gap-2">
                <Swatch />
                For brands
              </span>
              <h2 className="font-display-hero text-3xl sm:text-4xl lg:text-[46px] lg:leading-[54px] text-cream-luminous">
                Reach exactly her shade. <br />
                <span className="font-headline-italic italic font-normal text-gold-shimmer">Learn nothing about her.</span>
              </h2>
              <p className="text-base sm:text-lg text-cream-porcelain/80 max-w-xl leading-relaxed">
                You&apos;ve spent years buying audiences that were guessed at. Oira gets you something better: a real yes from a real woman whose shade actually matches, who agreed to be asked, and who got paid for answering.
              </p>
              <div className="p-5 rounded-2xl bg-plum-obsidian/85 backdrop-blur-md flex flex-col gap-2 max-w-lg border border-champagne-gold/25 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-champagne-gold">The whole brief</span>
                  <span className="text-[10px] font-semibold text-cream-porcelain/60">No lookalike lists</span>
                </div>
                <p className="font-display-hero text-lg text-cream-luminous">
                  &ldquo;Describe the shade, not the person.&rdquo;
                </p>
                <p className="text-xs text-cream-porcelain/70 leading-relaxed">
                  Tell us the undertone, the depth and the season you made it for. You pay only when the answer&apos;s yes, a no costs you nothing, and you never learn who she is.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  onClick={() => setIsBrandPortalOpen(true)}
                  className="px-8 py-4 rounded-full text-base text-plum-deep bg-gradient-to-r from-champagne-gold via-gold-shimmer to-champagne-gold hover:brightness-105 transition-all duration-300 font-semibold shadow-[0_8px_24px_rgba(212,175,55,0.3)] inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>See how a campaign works</span>
                  <span className="material-symbols-outlined text-[18px]">north_east</span>
                </button>
                <a href="/for-brands.html" className="text-xs text-cream-porcelain/80 underline hover:text-gold-shimmer transition-colors">
                  Start a campaign
                </a>
                <a href="mailto:info@myoira.com?subject=Oira%20for%20brands" className="text-xs text-cream-porcelain/60 underline hover:text-gold-shimmer transition-colors">
                  Email us instead
                </a>
              </div>
            </div>

            {/* Right Code Sandbox */}
            <div className="lg:col-span-5 bg-plum-obsidian/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 flex flex-col gap-4 shadow-2xl border border-champagne-gold/30">
              <div className="flex items-center justify-between pb-3 border-b border-cream-porcelain/10">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-champagne-gold">A brand&apos;s brief</span>
                </div>
                <span className="font-mono text-xs text-cream-porcelain/50">Example</span>
              </div>
              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 rounded-xl bg-cream-porcelain/5 text-cream-porcelain/90 border border-white/5">
                  <span className="text-champagne-gold">brief</span> = &#123;<br />
                  &nbsp;&nbsp;season: <span className="text-blush-petal">&apos;Deep Autumn&apos;</span>,<br />
                  &nbsp;&nbsp;undertone: <span className="text-swatch-spring-peach">&apos;warm&apos;</span>,<br />
                  &nbsp;&nbsp;her_details: <span className="text-champagne-gold">never</span><br />
                  &#125;
                </div>
                <div className="p-3 rounded-xl bg-cream-porcelain/5 text-cream-porcelain/90 border border-white/5">
                  <span className="text-champagne-gold">answers</span> = <span className="text-blush-petal">ask</span>(brief)<br />
                  <span className="text-cream-porcelain/40">// 1,842 women said yes. You still don&apos;t know who.</span>
                </div>
              </div>
              <div className="pt-3 flex items-center justify-between border-t border-cream-porcelain/10">
                <span className="text-xs text-cream-porcelain/70">You pay, for the yeses only:</span>
                <span className="text-base font-bold text-champagne-gold">184.20 USDC</span>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* SECTION 7: SOLANA SEEKER & CALIBRATE CTA                                */}
        {/* ======================================================================= */}
        <section className="relative w-full px-4 sm:px-8 xl:px-16 py-20 lg:py-28 bg-surface-container-low" id="calibrate">
          <div className="max-w-[1360px] mx-auto bg-surface-container-lowest rounded-3xl p-8 sm:p-12 lg:p-16 shadow-[0_20px_50px_rgba(56,30,56,0.08)] border border-surface-container/60 flex flex-col lg:flex-row items-center justify-between gap-10">
            <div className="flex flex-col gap-4 max-w-2xl">
              <div className="inline-flex items-center gap-2">
                <Swatch />
                <span className="text-[11px] font-bold text-warm-bronze uppercase tracking-wider">Ready when you are</span>
              </div>
              <h2 className="font-display-hero text-3xl sm:text-4xl lg:text-[42px] lg:leading-[50px] text-plum-deep">
                Open it in your browser. <br />
                <span className="font-headline-italic italic font-normal text-secondary">Or get the app for Seeker.</span>
              </h2>
              <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed">
                Open Oira in your browser, or install it as an app. On a Solana Seeker it&apos;s a real app, and you sign with the wallet your phone came with.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="px-3 py-1 rounded-full bg-surface-container text-on-surface-variant text-[11px] font-semibold">No account needed</span>
                <span className="px-3 py-1 rounded-full bg-surface-container text-on-surface-variant text-[11px] font-semibold">Photo stays on your phone</span>
                <span className="px-3 py-1 rounded-full bg-surface-container text-on-surface-variant text-[11px] font-semibold">Install from the browser</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col gap-3 w-full lg:w-auto shrink-0">
              <a
                href={APP_URL}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-base font-semibold text-on-primary bg-gradient-to-r from-blush-petal to-blush-rose shadow-[0_8px_24px_rgba(200,123,151,0.4)] hover:brightness-105 active:scale-[0.98] transition-all duration-300 whitespace-nowrap cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">camera_enhance</span>
                <span>Find your colours</span>
              </a>
              <a
                href={APK_URL}
                download
                className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-full text-base font-semibold text-plum-deep bg-surface-container hover:bg-surface-container-high active:scale-[0.98] transition-all duration-300 border border-outline-variant/30 whitespace-nowrap cursor-pointer"
              >
                <span className="material-symbols-outlined text-warm-bronze text-[20px]">download</span>
                <span>Download Seeker .apk</span>
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ========================================================================= */}
      {/* FOOTER                                                                    */}
      {/* ========================================================================= */}
      <footer className="w-full bg-cream-surface py-16 lg:py-20 border-t border-surface-container/60">
        <div className="w-full max-w-[1360px] mx-auto px-4 sm:px-8 xl:px-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
            <div className="lg:col-span-2 flex flex-col gap-4">
              <a className="self-start cursor-pointer" href="#hero" aria-label="Oira, back to the top" onClick={(e) => { e.preventDefault(); scrollTo('hero'); }}>
                <OiraMark />
              </a>
              <p className="text-sm text-on-surface-variant max-w-sm leading-relaxed">
                Your colours, read on your own phone and kept there. Private matching runs on MagicBlock, so even the machine doing the comparison can&apos;t keep what it saw.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container">
                  <Swatch />
                  <span className="text-[11px] font-semibold text-on-surface-variant">Nothing in the cloud</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container">
                  <span className="material-symbols-outlined text-warm-bronze text-[14px]">lock</span>
                  <span className="text-[11px] font-semibold text-on-surface-variant">Private matching by MagicBlock</span>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <a href="mailto:info@myoira.com" title="Email" aria-label="Email Oira" className="w-9 h-9 rounded-full bg-surface-container-lowest border border-plum-deep/15 text-plum-deep flex items-center justify-center hover:bg-plum-deep hover:text-cream-porcelain transition-colors">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18v12H3z" /><path d="m3 7 9 6 9-6" /></svg>
                </a>
                <a href="https://x.com/MyOira_" target="_blank" rel="noopener" title="X" aria-label="Oira on X" className="w-9 h-9 rounded-full bg-surface-container-lowest border border-plum-deep/15 text-plum-deep flex items-center justify-center hover:bg-plum-deep hover:text-cream-porcelain transition-colors">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M18.9 2H22l-7.6 8.7L23.3 22h-7l-5.5-7.2L4.6 22H1.5l8.1-9.3L1 2h7.2l5 6.6L18.9 2Zm-1.2 18h1.7L7.4 4H5.6l12.1 16Z" /></svg>
                </a>
                <a href="https://www.instagram.com/myoira_" target="_blank" rel="noopener" title="Instagram" aria-label="Oira on Instagram" className="w-9 h-9 rounded-full bg-surface-container-lowest border border-plum-deep/15 text-plum-deep flex items-center justify-center hover:bg-plum-deep hover:text-cream-porcelain transition-colors">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1" /></svg>
                </a>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h4 className="text-[11px] uppercase font-bold tracking-wider text-plum-deep">Platform</h4>
              <ul className="flex flex-col gap-2 text-sm text-on-surface-variant">
                <li><button onClick={() => scrollTo('how-it-works')} className="hover:text-plum-deep transition-colors cursor-pointer">How it works</button></li>
                <li><button onClick={() => scrollTo('seasons')} className="hover:text-plum-deep transition-colors cursor-pointer">The seasons</button></li>
                <li><button onClick={() => scrollTo('architecture')} className="hover:text-plum-deep transition-colors cursor-pointer">Why it&apos;s private</button></li>
                <li><a href={APP_URL} target="_blank" rel="noopener" className="hover:text-plum-deep transition-colors cursor-pointer">Open the app</a></li>
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <h4 className="text-[11px] uppercase font-bold tracking-wider text-plum-deep">Your privacy</h4>
              <ul className="flex flex-col gap-2 text-sm text-on-surface-variant">
                <li><button onClick={() => scrollTo('privacy')} className="hover:text-plum-deep transition-colors cursor-pointer">What stays on your phone</button></li>
                <li><button onClick={() => setIsAppWalletOpen(true)} className="hover:text-plum-deep transition-colors cursor-pointer">An example wallet</button></li>
                <li><a href="/study" className="hover:text-plum-deep transition-colors cursor-pointer">Join the skin study</a></li>
                <li><a href={APK_URL} download className="hover:text-plum-deep transition-colors cursor-pointer">Download for Seeker</a></li>
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <h4 className="text-[11px] uppercase font-bold tracking-wider text-plum-deep">Talk to us</h4>
              <ul className="flex flex-col gap-2 text-sm text-on-surface-variant">
                <li><button onClick={() => setIsFeedbackOpen(true)} className="hover:text-plum-deep transition-colors cursor-pointer text-blush-rose font-semibold">Tell us what you think</button></li>
                <li><a href="/for-brands.html" className="hover:text-plum-deep transition-colors cursor-pointer">For brands</a></li>
                <li><a href="mailto:info@myoira.com?subject=Press" className="hover:text-plum-deep transition-colors cursor-pointer">Press</a></li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between pt-8 gap-4 text-on-surface-variant border-t border-surface-container/60 text-xs">
            <p>© 2026 Oira Technologies. Chromatic science and cryptography · A partnership between BantuBloomNwk × Aurora K.</p>
            <div className="flex items-center gap-6">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold text-tertiary uppercase">
                Powered by
                <SolanaMark />
              </span>
              <a className="hover:text-plum-deep transition-colors cursor-pointer" href="#privacy" onClick={(e) => { e.preventDefault(); scrollTo('privacy'); }}>Privacy</a>
              <a className="hover:text-plum-deep transition-colors cursor-pointer" href="mailto:info@myoira.com">Contact</a>
            </div>
          </div>
        </div>
      </footer>

      {/* ========================================================================= */}
      {/* INTERACTIVE MODALS                                                        */}
      {/* ========================================================================= */}
      {/* Expanded Archetype Deep-Dive Modal */}
      {selectedArchetype && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedArchetype(null)}>
          <div
            className="bg-surface-container-lowest rounded-3xl max-w-xl w-full p-6 sm:p-8 border border-champagne-gold/40 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedArchetype(null)}
              aria-label="Close"
              className="absolute top-5 right-5 p-2 rounded-full hover:bg-black/5 text-on-surface-variant hover:text-plum-deep cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-xs font-semibold text-warm-bronze uppercase tracking-wider mb-2">
              <span>{selectedArchetype.code}</span> • <span>{selectedArchetype.contrast} contrast</span>
            </div>

            <h3 className="font-display-hero text-3xl font-semibold text-plum-deep mb-1">
              {selectedArchetype.name}
            </h3>
            <p className="text-xs text-on-surface-variant mb-4">
              Depth: <strong className="text-plum-deep">{selectedArchetype.melaninDepth}</strong> • Undertone: <strong className="text-plum-deep">{selectedArchetype.undertone}</strong>
            </p>

            <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
              {selectedArchetype.description}
            </p>

            {/* 5-Axis Chromatic Harmonies */}
            <div className="p-4 rounded-2xl bg-cream-porcelain border border-surface-container mb-6">
              <div className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-3">
                Five colours that love you back
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {selectedArchetype.swatches.map((swatch, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2 rounded-xl bg-white border border-surface-container/60 shadow-xs">
                    <div
                      className="w-9 h-9 rounded-full shrink-0 border border-black/10 shadow-xs"
                      style={{ backgroundColor: swatch.hex }}
                    />
                    <div className="text-left">
                      <div className="text-xs font-semibold text-plum-deep">{swatch.name}</div>
                      <div className="text-[10px] text-on-surface-variant font-mono">{swatch.hex} • {swatch.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <a
              href={APP_URL}
              target="_blank"
              rel="noopener"
              className="block text-center w-full py-3.5 rounded-full text-xs font-semibold tracking-wide text-white bg-gradient-to-r from-blush-petal to-blush-rose shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              Find out if you&apos;re a {selectedArchetype.name}
            </a>
          </div>
        </div>
      )}

      {/* Biometric Scan Studio Modal */}
      <BiometricScanModal
        isOpen={isBiometricScanOpen}
        onClose={() => setIsBiometricScanOpen(false)}
        onOpenAppWallet={() => {
          setIsBiometricScanOpen(false);
          setIsAppWalletOpen(true);
        }}
      />

      {/* Example wallet */}
      <ExampleWalletModal
        isOpen={isAppWalletOpen}
        onClose={() => setIsAppWalletOpen(false)}
        onOpenBiometricScan={() => {
          setIsAppWalletOpen(false);
          setIsBiometricScanOpen(true);
        }}
      />

      {/* Brand Formulator Portal Modal */}
      <BrandPortalModal
        isOpen={isBrandPortalOpen}
        onClose={() => setIsBrandPortalOpen(false)}
      />

      {/* Dialogue & Feedback Modal */}
      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />
    </div>
  );
}
