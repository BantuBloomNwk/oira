/**
 * Taking control of the camera the scan actually reads.
 *
 * Until 2026-10-04 nothing did. The exposure and white balance locks in capture.ts went to a
 * camera plugin whose own camera was never started, so they held nothing, and the
 * getUserMedia stream every reading comes from ran fully automatic on the web and in the APK
 * alike. Automatic exposure aims for the same average brightness whatever it is pointed at:
 * a bright window behind her darkens the whole frame, and deep skin reads deeper than it is.
 *
 * What this does instead, on the track itself, through the browser's own camera controls:
 *
 * (Steps 1 and 2 are switched off for now: see AIM_AT_SCLERA. Today it waits for automatic
 * exposure to settle, then does 3 and 4.)
 *
 *   1. Meter on the white of the eye, not on the frame and not on her skin. The sclera is the
 *      one thing in the picture whose brightness does not depend on how deep her skin is, so
 *      aiming it at a fixed level exposes every face the same way. Aiming at her skin would
 *      push every face toward the same grey, which is the bias we are removing.
 *   2. Nudge exposure compensation toward that level, letting the camera settle between steps.
 *   3. Lock exposure at the value it settled on (never white balance, see below), so nothing moves during
 *      the hold.
 *   4. Read the settings back and believe only what the camera reports.
 *
 * Every call to the camera is given 1.5 seconds. Some Android camera stacks never answer a
 * constraint they do not like, and a promise that never settles would hang the scan; a Galaxy
 * A13 once sat on a blank scanner for minutes that way. Past the limit, or on any refusal, it
 * gives up and the scan carries on exactly as it did before, unlocked, and says so.
 *
 * Off unless switched on (see cameraControlEnabled). It goes on by default only after it has
 * been tested on real phones.
 */

const CALL_TIMEOUT_MS = 1500;
/* Where the sclera should sit, as linear luminance. Bright enough that the skin is well clear
   of the noise floor at the deep end, low enough that a lit cheek does not clip. */
const TARGET_LO = 0.45;
const TARGET_HI = 0.65;
const TARGET = 0.55;
/* Long enough for one exposure change to land in the frames we read. */
const SETTLE_MS = 450;
const MAX_STEPS = 5;
/* Whether to aim the exposure at the sclera before locking, or simply lock what automatic
   exposure settled on. OFF, deliberately. Aiming at a fixed sclera level is sound in
   principle, but the level decides where every reading lands, and it was picked without an
   instrument: on a Galaxy A13 it read a woman who is Monk 6 to 7 as a 5. Until the study
   measures the right level, control locks the camera for steadiness and does not move the
   brightness. The aiming code stays, ready for a measured target. */
const AIM_AT_SCLERA = false;
/* With aiming off: how long after the face is found to let automatic exposure settle. */
const AUTO_SETTLE_MS = 700;
/* Never longer than this before the hold may start, locked or not. */
const BUDGET_MS = 4000;

type Range = { min: number; max: number; step?: number };
type Caps = {
  exposureMode?: string[];
  whiteBalanceMode?: string[];
  exposureCompensation?: Range;
  exposureTime?: Range;
  colorTemperature?: Range;
};

/* White balance is never locked. On a Galaxy A13 a manual white balance turned every frame
   magenta and stayed that way after control let go, until the page was reloaded; those
   frames read as a confident Monk 10. Colour is the sclera correction's job. Only exposure
   is held. */

const within = (v: unknown, r?: Range): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 && (!r || (v >= r.min && v <= r.max));
type Settings = MediaTrackSettings & {
  exposureMode?: string;
  whiteBalanceMode?: string;
  exposureCompensation?: number;
  exposureTime?: number;
  iso?: number;
  colorTemperature?: number;
};

export type ControlPhase = 'off' | 'metering' | 'locked' | 'gave-up';

export interface ControlReport {
  phase: ControlPhase;
  /* True only when the camera itself reports exposure as manual. */
  locked: boolean;
  /* One line for logs and the study page: what was tried and what came back. */
  note: string;
}

const STORE = 'oira.camctl';

/** Is camera control switched on for this device? `?camctl=1` or `?camctl=0` sets it. */
export function cameraControlEnabled(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('camctl');
    if (q === '1' || q === '0') localStorage.setItem(STORE, q);
    return localStorage.getItem(STORE) === '1';
  } catch {
    return false;
  }
}

const inTime = <T,>(p: Promise<T>): Promise<T | 'timeout'> =>
  Promise.race([p, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), CALL_TIMEOUT_MS))]);

export class CameraControl {
  private track: MediaStreamTrack | null;
  private caps: Caps = {};
  private phase: ControlPhase = 'off';
  private steps = 0;
  private startedAt = 0;
  private lastChangeAt = 0;
  private busy = false;
  private notes: string[] = [];
  private locked = false;

  constructor(stream: MediaStream, enabled: boolean) {
    this.track = stream.getVideoTracks()[0] ?? null;
    if (!enabled || !this.track) { this.note(enabled ? 'no video track' : 'switched off'); return; }
    try {
      this.caps = ((this.track as MediaStreamTrack & { getCapabilities?: () => Caps }).getCapabilities?.() ?? {}) as Caps;
    } catch { this.caps = {}; }
    const canExposure = !!this.caps.exposureMode?.includes('manual') && !!this.caps.exposureCompensation;
    if (!canExposure) {
      this.note('not supported (no manual exposure)');
      return;
    }
    this.phase = 'metering';
  }

  /** Has control finished, one way or the other, so the hold may start? */
  get settled(): boolean {
    return this.phase !== 'metering';
  }

  report(): ControlReport {
    return { phase: this.phase, locked: this.locked, note: this.notes.join('; ') };
  }

  /**
   * Called with each reading's sclera level while metering. Cheap when there is nothing to do;
   * the camera calls run in the background and never block the frame.
   */
  feed(scleraLevel: number | null, now: number): void {
    if (this.phase !== 'metering' || this.busy || !this.track) return;
    if (!this.startedAt) this.startedAt = now;
    if (now - this.startedAt > BUDGET_MS) { void this.lockOrGiveUp('out of time'); return; }
    if (scleraLevel == null || scleraLevel <= 0) return;
    if (!AIM_AT_SCLERA) {
      if (now - this.startedAt >= AUTO_SETTLE_MS) void this.lockOrGiveUp(`auto exposure settled, level ${scleraLevel.toFixed(2)}`);
      return;
    }
    if (now - this.lastChangeAt < SETTLE_MS) return;

    if (scleraLevel >= TARGET_LO && scleraLevel <= TARGET_HI) { void this.lockOrGiveUp(`level ${scleraLevel.toFixed(2)}`); return; }
    if (this.steps >= MAX_STEPS) { void this.lockOrGiveUp(`level ${scleraLevel.toFixed(2)} after ${this.steps} steps`); return; }

    const range = this.caps.exposureCompensation!;
    const s = this.settings();
    const current = typeof s.exposureCompensation === 'number' ? s.exposureCompensation : 0;
    /* Linear light, so the distance in stops is a log of the ratio. At most one stop a step. */
    const want = Math.max(-1, Math.min(1, Math.log2(TARGET / scleraLevel)));
    const step = range.step && range.step > 0 ? range.step : 0.1;
    const next = Math.max(range.min, Math.min(range.max, Math.round((current + want) / step) * step));
    if (Math.abs(next - current) < step / 2) { void this.lockOrGiveUp(`at the compensation limit, level ${scleraLevel.toFixed(2)}`); return; }

    this.busy = true;
    this.steps++;
    this.lastChangeAt = now;
    void this.apply({ exposureMode: 'continuous', exposureCompensation: next }).then((ok) => {
      this.busy = false;
      this.lastChangeAt = performance.now();
      if (!ok) this.giveUp('compensation refused');
    });
  }

  private settings(): Settings {
    try { return (this.track?.getSettings?.() ?? {}) as Settings; } catch { return {}; }
  }

  /* Why the last call failed, in the camera's own words, for the note. */
  private lastError = '';

  private async apply(c: Record<string, unknown>): Promise<boolean> {
    if (!this.track) return false;
    try {
      const r = await inTime(this.track.applyConstraints({ advanced: [c] } as MediaTrackConstraints));
      if (r === 'timeout') { this.lastError = 'no answer'; return false; }
      this.lastError = '';
      return true;
    } catch (e) {
      this.lastError = (e as Error)?.name ? `${(e as Error).name}: ${(e as Error).message}`.slice(0, 120) : 'refused';
      return false;
    }
  }

  /* A new setting shows up in getSettings only once the camera has produced a frame with it,
     so ask a few times before deciding it did not take. On a Galaxy A13 the first version
     read the settings straight back, saw "continuous" every time, and gave up on locks that
     may well have been about to hold. */
  private async held(check: (s: Settings) => boolean): Promise<boolean> {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (check(this.settings())) return true;
    }
    return false;
  }

  private async lockOrGiveUp(why: string): Promise<void> {
    if (this.phase !== 'metering' || this.busy) return;
    this.busy = true;
    this.note(`metered: ${why}`);
    const s = this.settings();
    /* Hold what auto exposure settled on. Only values the camera actually reported and says it
       accepts are sent: an A13 reports ISO and colour temperature as 0 while automatic, and
       sending those back was refused as out of range, which is why no lock ever held. ISO is
       left to the camera; exposure time is what it reports and what fixes the brightness. */
    const exposure: Record<string, unknown> = { exposureMode: 'manual' };
    if (within(s.exposureTime, this.caps.exposureTime)) exposure.exposureTime = s.exposureTime;
    if (within(s.iso)) exposure.iso = s.iso;

    this.note(`before: exposure ${s.exposureMode ?? '?'} ${s.exposureTime ?? '?'} iso ${s.iso ?? '?'}, balance ${s.whiteBalanceMode ?? '?'} ${s.colorTemperature ?? '?'}K`);
    const okE = await this.apply(exposure);
    if (!okE) this.note(`exposure lock refused (${this.lastError})`);
    const heldE = okE && (await this.held((x) => x.exposureMode === 'manual'));
    const after = this.settings();
    this.locked = heldE;
    this.busy = false;
    if (this.locked) {
      this.phase = 'locked';
      this.note(`locked at ${after.exposureTime ?? '?'} exp, iso ${after.iso ?? '?'}, ${after.colorTemperature ?? '?'}K, comp ${after.exposureCompensation ?? '?'}`);
    } else {
      this.giveUp(`exposure lock not held (exposure ${after.exposureMode ?? '?'})`);
      void this.apply({ exposureMode: 'continuous' });
    }
  }

  private giveUp(why: string): void {
    this.phase = 'gave-up';
    this.locked = false;
    this.note(`gave up: ${why}`);
  }

  private note(s: string): void {
    this.notes.push(s);
  }
}
