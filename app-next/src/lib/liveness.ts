/* The liveness check that runs before her colours are read.
 *
 * Two small things in a random order: one slow blink, and a turn of the head to either side and
 * back. A photo cannot blink, and a clip recorded beforehand does not know which comes first.
 * It runs after the camera has locked its exposure and before the colour hold, so none of the
 * frames it uses are ever averaged into her reading.
 *
 * The face also has to stay put the whole way through: if it leaves the frame, or jumps in
 * size or place between two readings, the check starts over. That is what stops passing it
 * live and then holding a photo up for the reading itself. */

export type LiveStep = 'blink' | 'turn';
export type LiveResult = 'pending' | 'passed' | 'failed' | 'restarted';

export interface LiveInput {
  eyesClosed: number | null;
  yaw: number | null;
  box: { cx: number; cy: number; size: number } | null;
}

const STEP_MS = 8000;        // per prompt: time to read it, do it and come back
/* Measured against her own open eyes, not a fixed line: how closed "open" reads varies with
   eye shape, and a fixed threshold would never see some women's eyes as open at all. */
const SHUT_RISE = 0.3;       // above her open baseline to count as shut
const SHUT_MIN = 0.45;
const OPEN_MARGIN = 0.15;    // back within this of her baseline to count as open again
const TURN = 0.12;           // how far the head has to turn, in face widths
const BACK = 0.06;           // close enough to facing the camera again
const MAX_SHIFT = 0.15;      // between two readings, in frame widths
const MAX_GROWTH = 1.4;      // between two readings, as a size ratio

export class Liveness {
  private order: LiveStep[] = [];
  private index = 0;
  private stepStarted = 0;
  private lastBox: LiveInput['box'] = null;
  // blink
  private opens: number[] = [];
  private sawShut = false;
  // turn
  private yaws: number[] = [];
  private baseline: number | null = null;
  private peak = 0;
  /* True once the head has turned far enough, so the prompt can say "now back to me". */
  turned = false;

  constructor(private random: () => number = Math.random) {
    this.reset();
  }

  reset() {
    this.order = this.random() < 0.5 ? ['blink', 'turn'] : ['turn', 'blink'];
    this.index = 0;
    this.stepStarted = 0;
    this.lastBox = null;
    this.clearStep();
  }

  private clearStep() {
    this.opens = [];
    this.sawShut = false;
    this.yaws = [];
    this.baseline = null;
    this.peak = 0;
    this.turned = false;
  }

  /* What she is being asked for right now, or null once she has passed. */
  get step(): LiveStep | null {
    return this.index < this.order.length ? this.order[this.index] : null;
  }

  get passed(): boolean {
    return this.step === null;
  }

  /* The face left the frame. Whatever was proven no longer covers the face that comes back. */
  lost() {
    this.reset();
  }

  /* Watches the face after the check has passed, until the reading is done. Returns false if
     it jumped, and the caller starts the check again. */
  stillSameFace(f: LiveInput): boolean {
    return this.continuous(f.box);
  }

  private continuous(box: LiveInput['box']): boolean {
    if (!box) return false;
    const prev = this.lastBox;
    this.lastBox = box;
    if (!prev) return true;
    const ratio = box.size / prev.size;
    return Math.abs(box.cx - prev.cx) <= MAX_SHIFT && Math.abs(box.cy - prev.cy) <= MAX_SHIFT
      && ratio <= MAX_GROWTH && ratio >= 1 / MAX_GROWTH;
  }

  feed(f: LiveInput, now: number): LiveResult {
    if (this.passed) return 'passed';
    if (!this.continuous(f.box)) { this.reset(); return 'restarted'; }
    if (!this.stepStarted) this.stepStarted = now;
    if (now - this.stepStarted > STEP_MS) { this.reset(); return 'failed'; }

    const done = this.step === 'blink' ? this.blink(f.eyesClosed) : this.turn(f.yaw);
    if (done) {
      this.index++;
      this.stepStarted = now;
      this.clearStep();
      if (this.passed) return 'passed';
    }
    return 'pending';
  }

  /* Open, then shut, then open again, each judged against her own open eyes. */
  private blink(closed: number | null): boolean {
    if (closed == null) return false;
    if (!this.sawShut) {
      const base = this.opens.length >= 3 ? Math.min(...this.opens) : null;
      if (base != null && closed >= Math.max(SHUT_MIN, base + SHUT_RISE)) { this.sawShut = true; return false; }
      this.opens.push(closed);
      if (this.opens.length > 12) this.opens.shift();
      return false;
    }
    const base = Math.min(...this.opens);
    return closed <= base + OPEN_MARGIN;
  }

  /* Away from where she started, then back. Either direction counts. */
  private turn(yaw: number | null): boolean {
    if (yaw == null) return false;
    if (this.baseline == null) {
      this.yaws.push(yaw);
      if (this.yaws.length >= 4) {
        const sorted = [...this.yaws].sort((a, b) => a - b);
        this.baseline = sorted[sorted.length >> 1];
      }
      return false;
    }
    const off = Math.abs(yaw - this.baseline);
    if (off > this.peak) this.peak = off;
    if (off >= TURN) this.turned = true;
    return this.turned && (off <= BACK || off <= this.peak * 0.4);
  }
}
