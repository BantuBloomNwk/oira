import { isNativeApp, BRIDGE_ORIGIN } from './native';
import type { SeasonPalette, NightRulesConfig, BrandQueryLog, UserProfile } from '../types';

/**
 * Ask Oira, wired to the real thing.
 *
 * The answering engine is not new code. It is the shipping concierge from app/, copied into
 * public/concierge/ verbatim and loaded here, because that module carries the privacy
 * contract and re-implementing it in TypeScript would have meant re-deriving a boundary
 * rather than keeping one. It answers in three tiers, best privacy first:
 *
 *   1. Gemma 3n on her own device, when weights are present. Nothing leaves the phone.
 *   2. The governed server concierge, which sees the same coarse palette and no more.
 *   3. A deterministic grounded answer. Always available, never a blank stare.
 *
 * The returned `via` says which one answered, so the UI never has to guess and we can tell
 * at a glance whether a device got the good path.
 *
 * `window.oiraBuildContext` is the ONLY data boundary. Whatever it returns is everything the
 * model is ever handed. It is built below, by hand, from a whitelist: season, undertone,
 * coarse depth word, her night rules and what came in overnight. No photograph, no landmark,
 * no Lab values, no ITA, no wallet, no keys. If a field is not in this function it cannot
 * reach a model, on device or otherwise.
 */

export type ConciergeVia = 'llm' | 'remote' | 'det';

export interface ConciergeAnswer {
  text: string;
  via: ConciergeVia;
  intent?: string;
}

interface ConciergeGlobal {
  answer(q: string): Promise<{ intent: string; text: string; via: ConciergeVia }>;
  /* The multilingual layer. It has been in concierge.js since it was written and this app
     was calling exactly one function on the module and ignoring the rest, which is how a
     concierge with four languages of reviewed prose ended up speaking English at everyone. */
  langs: string[];
  lang(): string;
  setLang(l: string): void;
  locale(): string;
  ui(): Record<string, string>;
  greet(): string;
  suggestions(): string[];
}

declare global {
  interface Window {
    OiraConcierge?: ConciergeGlobal;
    oiraBuildContext?: () => Record<string, unknown>;
    /* Read by public/concierge/oira-remote.js. Empty string means same origin. */
    OIRA_BRIDGE_URL?: string;
  }
}

const MODULES = [
  /* Voice first: the other three read window.OiraVoice at prompt time, and loading it last
     would mean the first question of a session gets the fallback persona. */
  '/concierge/oira-voice.js',
  '/concierge/concierge.js',
  '/concierge/oira-llm.js',
  '/concierge/oira-remote.js',
];

/* Where tier two lives.
 *
 * oira-remote.js reads window.OIRA_BRIDGE_URL and, if it is empty, reports unavailable
 * without so much as a request. It was never set here, which is why every answer in this app
 * has come off the deterministic floor: the reasoning layer was present, loaded, and had no
 * address to call.
 *
 * An empty string means "same origin", and same origin is the point. netlify.toml rewrites
 * /api/* to the bridge server-side, so the browser only ever talks to us and connect-src
 * stays 'self'. In development there is no rewrite and no bridge, so it correctly finds
 * nothing and she stays on the floor. */
function installBridge() {
  if (typeof window === 'undefined') return;
  if (typeof window.OIRA_BRIDGE_URL === 'string') return;
  /* The app has no rewrite in front of it, so it asks the bridge by name. */
  window.OIRA_BRIDGE_URL = isNativeApp() ? BRIDGE_ORIGIN : '';
}

let loading: Promise<void> | null = null;

function inject(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = document.createElement('script');
    el.src = src;
    el.async = false; /* order matters: concierge.js reads the other two off window */
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(el);
  });
}

export function loadConcierge(): Promise<void> {
  if (loading) return loading;
  installBridge();
  loading = (async () => {
    for (const src of MODULES) await inject(src);
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

export interface ConciergeContextInput {
  profile: UserProfile;
  season: SeasonPalette;
  nightRules: NightRulesConfig;
  brandLogs: BrandQueryLog[];
  /* Her own reading, in coarse words. See the whitelist below for what is and is not in it. */
  reading?: {
    curl?: string;
    curlFamily?: string;
    skinDryness?: string;
    skinShine?: string;
    skinBlemish?: boolean;
  };
}

/* The whitelist. Read it as the answer to "what can the model know about her", because it
   is exactly that and nothing else. */
export function installContext(input: ConciergeContextInput) {
  window.oiraBuildContext = () => ({
    season: input.season.name,
    under: input.season.undertone,
    depthWord: input.season.depth,
    /* Her hair and how her skin is doing, as the same words she was shown on her reading.
       The scan has been measuring all of this and none of it reached the concierge, so the
       one question she is most likely to ask her colour girlfriend, what to do with her
       hair, came back "tell me your curl and I will be more use" from a screen that had
       already been told.

       Coarse words only, and deliberately not the numbers behind them. No ITA, no Lab, no
       Monk index, no landmark, no photograph. Those are what make a reading identifying and
       they are what the whole boundary exists to hold back; "coily" and "dry" are what make
       an answer useful and neither of them narrows anybody down. */
    ...(input.reading?.curl ? { curl: input.reading.curl } : {}),
    ...(input.reading?.curlFamily ? { curlFamily: input.reading.curlFamily } : {}),
    ...(input.reading?.skinDryness ? { skinDryness: input.reading.skinDryness } : {}),
    ...(input.reading?.skinShine ? { skinShine: input.reading.skinShine } : {}),
    ...(input.reading?.skinBlemish ? { skinBlemish: true } : {}),
    /* What she said she uses, in her own words, because she typed it and it is hers. */
    ...(input.profile.routine ? { routine: input.profile.routine } : {}),
    /* Her own words for her colours, so an answer can name a shade she has actually seen
       rather than inventing one. Hexes of her palette are hers already. */
    palette: input.season.swatches.map((s) => ({ name: s.name, hex: s.hex })),
    bestMetals: input.season.bestMetals,
    worstColors: input.season.worstColors,
    /* Overnight, coarse. A count and a total, never who asked or what they asked about. */
    earned: input.nightRules.totalEarned,
    matched: input.brandLogs.some((l) => l.answer === 'YES'),
    rules: {
      minPayout: input.nightRules.lowestPayout,
      maxPerBrand: input.nightRules.brandLifetimeCap,
      blocked: [] as string[],
    },
    offers: [] as Array<{ category: string; payout: number }>,
    checks: [] as string[],
  });
}

export async function ask(question: string): Promise<ConciergeAnswer> {
  await loadConcierge();
  const engine = window.OiraConcierge;
  if (!engine) throw new Error('concierge did not attach');
  const out = await engine.answer(question);
  return { text: out.text, via: out.via, intent: out.intent };
}

/* ---------------------------------------------------------------------------------------
   Language
   --------------------------------------------------------------------------------------- */

/* All of these no-op quietly before the module lands rather than throwing, because the
   screen renders before the script tag resolves and a language picker is not worth a crash. */
export const conciergeLangs = (): string[] => window.OiraConcierge?.langs ?? ['en'];
export const conciergeLang = (): string => window.OiraConcierge?.lang() ?? 'en';
export const conciergeLocale = (): string => window.OiraConcierge?.locale() ?? 'en-US';
export const conciergeGreeting = (): string | null => window.OiraConcierge?.greet() ?? null;
export const conciergeSuggestions = (): string[] => window.OiraConcierge?.suggestions() ?? [];
export const conciergeUi = (): Record<string, string> => window.OiraConcierge?.ui() ?? {};

export function setConciergeLang(l: string): void {
  window.OiraConcierge?.setLang(l);
}

/* ---------------------------------------------------------------------------------------
   Speaking
   --------------------------------------------------------------------------------------- */

/* Oira reading her own answer out.
 *
 * SpeechSynthesis, on the device, in her locale. It is the same choice the shipping app
 * makes and for the same reason it documents: the crafted ElevenLabs voice goes through the
 * bridge and stays behind a flag until those keys are live, and until then the free browser
 * voice is what she gets rather than nothing. Unlike recognition, synthesis is genuinely
 * local on every browser that has it, so there is no privacy question here: the text is
 * already on her screen and nothing is uploaded to say it.
 *
 * When the crafted voice is turned on, this is the one function to change. */
export function speak(text: string, locale = conciergeLocale()): void {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale;
    /* Prefer a voice that actually speaks her language over whatever the platform default
       is, which on most phones is US English regardless of what you set lang to. */
    const voices = window.speechSynthesis.getVoices() || [];
    const match = voices.find((v) => v.lang?.toLowerCase().startsWith(locale.slice(0, 2).toLowerCase()));
    if (match) u.voice = match;
    u.rate = 1.0;
    u.pitch = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* A voice that will not speak is not worth an error in front of her. */
  }
}

export function hushSpeech(): void {
  try { window.speechSynthesis?.cancel(); } catch { /* nothing to stop */ }
}
