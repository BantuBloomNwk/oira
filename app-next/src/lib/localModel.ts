/**
 * Oira's brain, on her own phone.
 *
 * The concierge answers in three tiers and this is the first one: Gemma 3n running in her
 * browser over WebGPU, so a real answer is composed without a single byte leaving the
 * device. Everything around it has been built and tested for a while (see
 * docs/CONCIERGE-LLM-RUNBOOK.md); what was missing was the runtime, the config, and an
 * honest way to ask her for the download.
 *
 * THE DOWNLOAD IS THE WHOLE DESIGN PROBLEM.
 *
 * The web build of Gemma 3n E2B is about three gigabytes. This app is built for a woman on
 * a mid range Android buying data in bundles, and the founder's standing bar is that it
 * does not cost us and does not inconvenience the ladies. Three gigabytes fetched on page
 * load would be the single most expensive thing Oira has ever done to anybody, and she
 * would find out when her bundle was gone.
 *
 * So:
 *   Never automatic. It happens because she tapped a button that says how big it is.
 *   Never quietly on mobile data. If the browser will tell us she is on a metered
 *     connection or has data saver on, she is told before she is asked.
 *   Once, forever. It goes into the same cache the scan models use, which is unversioned
 *     on purpose, so a deploy never makes her fetch it again.
 *   Reversible. She can delete it and get the space back, from the same screen.
 *
 * Without it she loses nothing she has today: the governed bridge answers, and under that
 * the deterministic floor always does. This is the best of the three, not the only one.
 */

/* Where the weights live: our own Contabo box, not this origin.

   That is a deliberate reversal of what this file used to say, and it cost the app's one
   CSP exception. The weights cannot sit on the Netlify origin with everything else, because
   Netlify meters bandwidth at 20 credits per GB against a 1000 credit monthly pool shared
   with every Oira and Ilowa site: sixteen women downloading this once would take
   app.ilowa.app down along with us. Proxying it through Netlify fails too, on a 26 second
   timeout that three gigabytes will never beat. So `connect-src` names exactly this host,
   public/_headers explains why on the line itself, and sw.js knows the origin so a fetch
   for it still comes out of her cache instead of the network. See infra/oira.caddy.

   NOT PLACED YET. Google's Gemma terms have to be accepted by a person on a Hugging Face
   account before the file can be downloaded even once, and no script can click that. Run
   scripts/place-weights.sh --check to see whether that has landed; run it without --check
   to put the file on the box. Everything below starts working with no code change. */
const DEFAULT_MODEL_URL = 'https://models.myoira.com/gemma-3n-E2B-it-int4-Web.litertlm';

/* The runtime, vendored by scripts/fetch-models.sh. */
const LIB_URL = '/vendor/genai/genai_bundle.mjs';
const WASM_DIR = '/vendor/genai/';

/* Same cache the scan models use. Unversioned by design: the bytes at a given URL never
   change, so rebuilding the app is no reason to spend her data again. */
const ASSET_CACHE = 'assets-v1';

/* Roughly, for the copy. The real size comes off the response when it starts. */
export const APPROX_BYTES = 3.0 * 1024 * 1024 * 1024;

export type ModelState =
  | 'unsupported'   /* no WebGPU: this phone cannot run it at all */
  | 'unhosted'      /* nobody has put the weights anywhere yet */
  | 'absent'        /* available to fetch, she has not */
  | 'downloading'
  | 'ready';

interface LlmConfig {
  lib: string;
  wasm: string;
  model: string;
  maxTokens: number;
  maxNumImages: number;
}

declare global {
  interface Window {
    OIRA_LLM_CONFIG?: LlmConfig;
  }
}

const stored = (k: string): string | null => {
  try { return localStorage.getItem(k); } catch { return null; }
};

export const modelUrl = (): string => stored('oira_llm_model') || DEFAULT_MODEL_URL;

export function webgpuOk(): boolean {
  try { return !!(navigator as unknown as { gpu?: unknown }).gpu; } catch { return false; }
}

/* Is she on something that will cost her? The API is advisory and absent on iOS, so a
   missing answer is treated as "cannot tell" rather than "fine", and the copy says so. */
export interface Connection { metered: boolean | null; saveData: boolean }

export function connection(): Connection {
  const c = (navigator as unknown as {
    connection?: { type?: string; effectiveType?: string; saveData?: boolean };
  }).connection;
  if (!c) return { metered: null, saveData: false };
  const cellular = c.type === 'cellular';
  const wifi = c.type === 'wifi' || c.type === 'ethernet';
  return {
    metered: cellular ? true : wifi ? false : null,
    saveData: !!c.saveData,
  };
}

async function cached(): Promise<boolean> {
  try {
    if (!('caches' in window)) return false;
    const c = await caches.open(ASSET_CACHE);
    return !!(await c.match(modelUrl()));
  } catch {
    return false;
  }
}

/* Does anybody host the weights at all? A HEAD is cheap and it is the difference between
   telling her "your phone cannot do this" and "we have not shipped it yet", which are very
   different sentences and only one of them is her problem. */
async function hosted(): Promise<boolean> {
  try {
    const r = await fetch(modelUrl(), { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}

export async function modelState(): Promise<ModelState> {
  if (!webgpuOk()) return 'unsupported';
  if (await cached()) return 'ready';
  return (await hosted()) ? 'absent' : 'unhosted';
}

/* Hand the engine its config. oira-llm.js reads this at load time and reports itself
   unavailable without it, which is why every answer so far has come off the floor. */
export function activate(): void {
  window.OIRA_LLM_CONFIG = {
    lib: LIB_URL,
    wasm: WASM_DIR,
    model: modelUrl(),
    maxTokens: 512,
    /* Vision on. A multimodal Gemma 3n build is required either way; this only decides
       whether the loaded model's own image capability is exposed, and it is what lets Oira
       actually look at the photo she took rather than hold it in the thread beside an
       answer written without it. */
    maxNumImages: 1,
  };
}

export interface Progress { received: number; total: number }

/* Why the download can fail, in the only three ways she can do anything about. Anything
   else is 'network' and says so plainly rather than inventing a cause. */
export type FailureKind = 'aborted' | 'space' | 'network';

export class DownloadFailed extends Error {
  constructor(readonly kind: FailureKind, message: string) {
    super(message);
    this.name = 'DownloadFailed';
  }
}

/* The download.
 *
 * Piped straight into the cache rather than collected and then stored. This is the whole
 * difference between a feature and a crash: the obvious version pushes every chunk onto an
 * array and builds a 3GB Blob at the end, which needs 3GB of JS heap on a phone that has
 * 2GB of RAM in total. Handing the Cache API the live stream lets it write to disk as the
 * bytes arrive, so the heap holds one chunk at a time and the tab survives.
 *
 * The TransformStream in the middle is only there to count. It passes every chunk through
 * untouched and reports the running total, which is what makes a real progress bar possible
 * without ever holding the bytes.
 *
 * It goes into the same cache the service worker reads, so the engine's own later fetch for
 * the same URL is served locally and instantly, offline, forever. */
export async function downloadModel(
  onProgress: (p: Progress) => void,
  signal?: AbortSignal
): Promise<void> {
  const url = modelUrl();

  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if (signal?.aborted) throw new DownloadFailed('aborted', 'stopped');
    throw new DownloadFailed('network', String(e));
  }
  if (!res.ok || !res.body) {
    throw new DownloadFailed('network', `weights not reachable (${res.status})`);
  }

  const total = Number(res.headers.get('content-length')) || APPROX_BYTES;
  let received = 0;

  const counted = res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        onProgress({ received, total });
        controller.enqueue(chunk);
      },
    })
  );

  /* Stored with the headers the engine will expect on the way back out. */
  const stored = new Response(counted, {
    status: 200,
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(total),
    },
  });

  try {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(url, stored);
  } catch (e) {
    if (signal?.aborted) throw new DownloadFailed('aborted', 'stopped');
    /* Out of room is the failure this will actually hit, and it is the one she can fix.
       Browsers disagree on how they say it, so the name and the message are both checked. */
    const name = (e as { name?: string })?.name ?? '';
    const msg = String((e as { message?: string })?.message ?? e);
    if (name === 'QuotaExceededError' || /quota|storage|space/i.test(msg)) {
      throw new DownloadFailed('space', msg);
    }
    throw new DownloadFailed('network', msg);
  }

  activate();
}

/* Her space back, on request. A three gigabyte file she cannot find and cannot delete is
   the kind of thing that gets an app uninstalled. */
export async function forgetModel(): Promise<void> {
  try {
    const cache = await caches.open(ASSET_CACHE);
    await cache.delete(modelUrl());
  } catch {
    /* Nothing cached is the same outcome she asked for. */
  }
  delete window.OIRA_LLM_CONFIG;
}

export const gigabytes = (b: number): string => `${(b / 1024 / 1024 / 1024).toFixed(1)}GB`;
