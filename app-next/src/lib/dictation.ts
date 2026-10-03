/**
 * Speaking to Oira instead of typing.
 *
 * The whole app is built on one promise: what she gives it stays on her phone. The Web
 * Speech API breaks that promise by default. In Chrome, `SpeechRecognition` has always
 * been a network service wearing a browser API's clothes: it opens the microphone locally
 * and ships the audio to Google's speech servers, and nothing in the interface tells the
 * person talking that this is happening. Putting that behind a microphone button in an app
 * whose headline is "your face never leaves this phone" would be the single most dishonest
 * thing in the product, and it would be dishonest in the direction that matters most,
 * because her voice is biometric too.
 *
 * So dictation here is on-device or it is nothing.
 *
 * Chrome 139 added on-device recognition: `availableOnDevice()` reports whether the model
 * for a language is present, `installOnDevice()` fetches it, and `processLocally = true`
 * pins a session to the local model rather than letting it fall back to the network. When
 * all three are there, the microphone works and no audio leaves. When they are not, the
 * button says why and stays off. It does not quietly degrade to the network path.
 *
 * Safari's implementation is on-device for its supported locales but exposes none of these
 * flags, so there is no way to VERIFY locality from script. Unverified is treated as
 * unavailable: a privacy claim we cannot check is a privacy claim we should not make.
 */

export type DictationState =
  | 'unsupported'   /* no SpeechRecognition at all */
  | 'network-only'  /* present, but this browser cannot prove it stays on the device */
  | 'downloadable'  /* on-device model available to fetch */
  | 'downloading'
  | 'ready'
  | 'listening';

type Ctor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface CtorWithOnDevice extends Ctor {
  availableOnDevice?: (lang: string) => Promise<string>;
  installOnDevice?: (lang: string) => Promise<boolean>;
}

function ctor(): CtorWithOnDevice | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as CtorWithOnDevice | null;
}

/* The locale to listen in. Defaults to the phone's, but the conversation overrides it: if
   she has switched Oira into Portuguese, the microphone should be listening for Portuguese,
   not for whatever her handset was sold with. */
let preferred: string | null = null;

export function setLanguage(locale: string): void {
  preferred = locale || null;
}

export function language(): string {
  return preferred || navigator.language || 'en-US';
}

/* What this phone can actually do, asked once when the screen opens. */
export async function probe(): Promise<DictationState> {
  const C = ctor();
  if (!C) return 'unsupported';
  if (typeof C.availableOnDevice !== 'function') return 'network-only';
  try {
    const status = await C.availableOnDevice(language());
    if (status === 'available') return 'ready';
    if (status === 'downloading') return 'downloading';
    if (status === 'downloadable') return 'downloadable';
    return 'network-only';
  } catch {
    return 'network-only';
  }
}

/* Fetch the on-device model. Only ever called because she tapped the button asking for it. */
export async function install(): Promise<boolean> {
  const C = ctor();
  if (!C || typeof C.installOnDevice !== 'function') return false;
  try {
    return await C.installOnDevice(language());
  } catch {
    return false;
  }
}

export interface Session {
  stop(): void;
}

/* One dictation. `onText` fires with the transcript so far; `onDone` when the mic closes,
   with an error string when it closed for a reason worth telling her about. */
export function listen(
  onText: (text: string) => void,
  onDone: (error?: string) => void
): Session | null {
  const C = ctor();
  if (!C) return null;

  const rec = new C();
  rec.lang = language();
  rec.continuous = false;
  rec.interimResults = true;
  /* The line that keeps the promise. If the browser honours it, no audio is sent anywhere.
     If it refuses, it errors and the session never starts, which is the outcome we want. */
  rec.processLocally = true;

  rec.onresult = (e) => {
    let out = '';
    for (let i = 0; i < e.results.length; i++) out += e.results[i][0].transcript;
    onText(out);
  };
  rec.onerror = (e) => onDone(e.error);
  rec.onend = () => onDone();

  try {
    rec.start();
  } catch {
    return null;
  }
  return { stop: () => rec.stop() };
}
