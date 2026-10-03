import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  consolidate, getMeshEdges, MESH_LINES, placeFindings, readFrame, warmUp,
  type Finding, type ScanFrame,
} from '../lib/scan';
import {
  HEADWEAR_NUDGE, HEADWEAR_PROMPT, LIGHT_NUDGE, LIGHT_WHY, SCAN_COPY, SCAN_STAGES,
} from '../lib/voice';
import { GoldenFigBranch } from './GoldenFigBranch';
import { openCamera, type CaptureSession, type CapturePath } from '../lib/capture';

interface DeepScanViewProps {
  onClose: () => void;
  /* The still is hers: it is drawn from the same frame we just read and it never
     leaves the page. The reading is shown over it so she can see what was named. */
  onDone: (result: ScanFrame, still: string) => void;
}

/* How long she has to hold reasonably still before we call it read. Long enough that the
   findings settle, short enough that it does not feel like a medical test. */
const HOLD_MS = 3200;

/* Long enough for a slow phone to load the models on its processor, short enough that a
   hang is named before she gives up on it. */
const SLOW_MS = 12_000;

export const DeepScanView: React.FC<DeepScanViewProps> = ({ onClose, onDone }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const heldSinceRef = useRef<number | null>(null);
  const latestRef = useRef<ScanFrame | null>(null);
  /* Every frame that passed the light gate during this hold. What gets sealed is the middle
     of these rather than whichever one happened to cross the line. See consolidate(). */
  const samplesRef = useRef<ScanFrame[]>([]);
  const lastSampleRef = useRef(0);

  const [phase, setPhase] = useState<'warming' | 'looking' | 'reading' | 'denied' | 'unsupported'>('warming');
  /* Which half of the warm up is still out, so a slow phone says what it is waiting on
     rather than spinning with nothing to show. Logged too, for anyone debugging a device. */
  const [waitingOn, setWaitingOn] = useState<'camera' | 'eyes' | null>('camera');
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [nudge, setNudge] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  /* Which camera path she actually got. Carried into the reading so the seal records it and a
     browser capture is never later mistaken for one we controlled. */
  const [capture, setCapture] = useState<CapturePath>('browser');

  /* Which pass she is being told about. Driven off the hold, so the label and the work are
     the same clock. */
  const stage = Math.min(SCAN_STAGES.length - 1, Math.floor(progress * SCAN_STAGES.length));

  /* ------------------------------------------------------------------------------------
     The drawing.

     Canvas, not SVG. The tesselation is around 2600 edges and rebuilding that many DOM
     nodes on every animation frame is how a scan screen takes a mid range Android to its
     knees. One Path2D, one stroke, per layer.

     Everything is mirrored here rather than by a CSS transform, because the hair outline
     and the mesh come from two different sources at two different resolutions and the one
     place they have to agree is the pixel they land on.
     ------------------------------------------------------------------------------------ */
  const paint = useCallback((frame: ScanFrame, t: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;
    const cssW = parent.clientWidth, cssH = parent.clientHeight;
    /* Cap the backing store at 2x. Past that it is invisible and it is only heat. */
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const pts = frame.landmarks;
    /* Mirrored, so what she sees matches the face she is pulling. */
    const px = (x: number) => (1 - x) * cssW;
    const py = (y: number) => y * cssH;

    /* The band. A soft horizontal window that travels with the scan line and brightens
       whatever it is over, so the geometry reads as being worked through rather than
       simply switched on. */
    const bandY = 0.08 + 0.8 * (0.5 - 0.5 * Math.cos((t / 2600) * Math.PI * 2));
    const near = (y: number) => {
      const d = Math.abs(y - bandY);
      return d > 0.16 ? 0 : 1 - d / 0.16;
    };

    /* Hair first, underneath the face mesh: it is the biggest shape on the frame and it
       should not be drawn over her features. */
    const outline = frame.hair?.outline;
    if (outline && outline.length > 3) {
      ctx.beginPath();
      outline.forEach((p, i) => {
        const X = px(p.x), Y = py(p.y);
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      });
      ctx.closePath();
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = 'rgba(214, 167, 86, 0.75)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(214, 167, 86, 0.05)';
      ctx.fill();

      /* Ribs across the silhouette, so it reads as the hair being worked through rather
         than merely circled. Each one is drawn between the two sides at the same height,
         which is exactly the pair of samples the volume measurement is taken from. */
      const half = Math.floor(outline.length / 2);
      ctx.lineWidth = 0.7;
      for (let i = 2; i < half - 2; i += 3) {
        const l = outline[i];
        const r = outline[outline.length - 1 - i];
        if (!l || !r) continue;
        const glow = near(l.y);
        ctx.strokeStyle = `rgba(233, 184, 210, ${0.1 + glow * 0.4})`;
        ctx.beginPath();
        ctx.moveTo(px(l.x), py(l.y));
        ctx.lineTo(px(r.x), py(r.y));
        ctx.stroke();
      }
    }

    if (!pts) return;

    const edges = getMeshEdges();
    const tess = edges.tesselation.length ? edges.tesselation : MESH_LINES;

    /* The full mesh, faint, with the band lifting the part it is passing over. Two passes
       so the bright edges are not fighting the dim ones for the same stroke style. */
    const dim = new Path2D();
    const lit = new Path2D();
    for (let i = 0; i < tess.length; i++) {
      const a = pts[tess[i][0]], b = pts[tess[i][1]];
      if (!a || !b) continue;
      const target = near((a.y + b.y) / 2) > 0.35 ? lit : dim;
      target.moveTo(px(a.x), py(a.y));
      target.lineTo(px(b.x), py(b.y));
    }
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(255, 245, 235, 0.14)';
    ctx.stroke(dim);
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = 'rgba(233, 184, 210, 0.5)';
    ctx.stroke(lit);

    /* The contours on top: the oval, the brows, the eyes, the iris, the lips. These are
       the lines the findings are actually taken from, so they stay legible. */
    if (edges.contours.length) {
      const path = new Path2D();
      for (let i = 0; i < edges.contours.length; i++) {
        const a = pts[edges.contours[i][0]], b = pts[edges.contours[i][1]];
        if (!a || !b) continue;
        path.moveTo(px(a.x), py(a.y));
        path.lineTo(px(b.x), py(b.y));
      }
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(255, 251, 247, 0.72)';
      ctx.stroke(path);
    }

    /* A sparse scatter of vertices, only where the band is, so the mesh looks sampled
       rather than painted. */
    ctx.fillStyle = 'rgba(214, 167, 86, 0.85)';
    for (let i = 0; i < pts.length; i += 7) {
      const p = pts[i];
      if (near(p.y) < 0.55) continue;
      ctx.beginPath();
      ctx.arc(px(p.x), py(p.y), 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }, []);

  const tick = useCallback((now: number) => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      rafRef.current = requestAnimationFrame((t) => tickRef.current(t));
      return;
    }
    if (!scratchRef.current) scratchRef.current = document.createElement('canvas');

    const frame = readFrame(video, scratchRef.current, now);
    latestRef.current = frame;
    paint(frame, now);

    if (frame.landmarks) {
      setFindings(frame.findings);
      setPhase('reading');

      /* The gate. A reading taken under a warm bulb is not a slightly worse reading, it is
         a different woman's colouring, so the hold resets rather than creeping forward and
         finishing on something we would have to walk back. Her hair being tucked away is
         the softer of the two: it does not corrupt the skin reading, so it is a nudge
         while the clock keeps running. */
      const light = frame.light;
      const lightBad = light && !light.ok ? LIGHT_NUDGE[light.verdict] ?? null : null;
      setNudge(lightBad ?? (frame.hairLikelyCovered ? HEADWEAR_NUDGE : null));

      if (lightBad) {
        /* The hold restarts, and so does the sample set: readings taken under a light we
           have just rejected are not worth keeping to average against good ones. */
        heldSinceRef.current = null;
        samplesRef.current = [];
        setProgress(0);
        rafRef.current = requestAnimationFrame((t) => tickRef.current(t));
        return;
      }

      if (heldSinceRef.current == null) {
        heldSinceRef.current = now;
        samplesRef.current = [];
      }

      /* About ten a second. More does not make the median better and it does make the
         phone warmer. */
      if (now - lastSampleRef.current > 95) {
        lastSampleRef.current = now;
        samplesRef.current.push(frame);
      }
      const held = now - heldSinceRef.current;
      setProgress(Math.min(1, held / HOLD_MS));
      if (held >= HOLD_MS) {
        cancelAnimationFrame(rafRef.current);
        const shot = document.createElement('canvas');
        shot.width = video.videoWidth;
        shot.height = video.videoHeight;
        const sctx = shot.getContext('2d');
        let still = '';
        if (sctx) {
          /* Mirrored to match what she was looking at. */
          sctx.translate(shot.width, 0);
          sctx.scale(-1, 1);
          sctx.drawImage(video, 0, 0);
          still = shot.toDataURL('image/jpeg', 0.9);
        }
        onDone(consolidate(samplesRef.current, frame, capture), still);
        return;
      }
    } else {
      heldSinceRef.current = null;
      samplesRef.current = [];
      setProgress(0);
      setNudge(null);
      setPhase('looking');
    }

    rafRef.current = requestAnimationFrame((t) => tickRef.current(t));
  }, [onDone, paint]);
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase('unsupported');
        return;
      }
      /* Start the models downloading and the camera warming at the same time, so the
         wait is one wait rather than two. */
      const t0 = performance.now();
      setWaitingOn('camera');
      setSlow(false);
      const slowTimer = setTimeout(() => { if (!cancelled) setSlow(true); }, SLOW_MS);
      const warming = warmUp().then((ok) => {
        console.info('[scan] models ready', ok, Math.round(performance.now() - t0), 'ms');
        return ok;
      });
      let session: CaptureSession;
      try {
        /* One seam for both paths. Inside the native shell this locks exposure and white
           balance after a settle, which is the whole reason the shell exists; in a browser it
           is the same getUserMedia call it has always been. Which one she got travels with
           the sealed reading rather than being guessed at afterwards. See src/lib/capture.ts. */
        session = await openCamera();
        console.info('[scan] camera open', session.path, session.locked ? 'locked' : 'unlocked', Math.round(performance.now() - t0), 'ms');
        if (!cancelled) setWaitingOn('eyes');
        stream = session.stream;
        setCapture(session.path);
      } catch {
        clearTimeout(slowTimer);
        if (!cancelled) setPhase('denied');
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      const ok = await warming;
      clearTimeout(slowTimer);
      if (cancelled) return;
      setWaitingOn(null);
      setSlow(false);
      if (!ok) {
        setPhase('unsupported');
        return;
      }
      setPhase('looking');
      rafRef.current = requestAnimationFrame((t) => tickRef.current(t));
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      stream?.getTracks().forEach((t) => t.stop());
    };
  /* Only a retry restarts the camera. This used to depend on `tick`, which depends on
     `onDone`, which the parent recreates on every render, so every redraw of the app
     stopped the camera and opened it again. On a fast laptop that was one wasted restart.
     On a slower phone, where the app redraws while the camera is still waking, it could
     restart for ever and the scanner never came up. The loop reads the latest tick
     through a ref instead. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return (
    <div className="absolute inset-0 bg-night text-moon flex flex-col overflow-hidden">
      {/* The frame. Mirrored, because she is looking at herself and an unmirrored preview
          reads as someone else's face. */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />

        {/* The geometry. Everything drawn here is measured from this frame; see paint(). */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden />

        {/* The scan line. Gold, and it travels back the way it came rather than snapping to
            the top, because a line that only ever goes down is a progress bar wearing a
            costume. Only while there is a face to read. */}
        {phase === 'reading' && (
          <div className="absolute inset-x-0 h-[2px] pointer-events-none scanline" aria-hidden
               style={{ background: 'linear-gradient(90deg, transparent, #D6A756, transparent)',
                        boxShadow: '0 0 18px 2px rgba(214,167,86,.55)' }} />
        )}

        {/* Findings surface beside the thing they describe, stacked so they never land on
            each other. See placeFindings() in src/lib/scan.ts. */}
        {placeFindings(findings).map((f) => (
          <div
            key={f.key}
            className="absolute -translate-y-1/2 px-2.5 py-1.5 rounded-xl bg-night/70 border border-moon/20 backdrop-blur-sm text-left pointer-events-none transition-all duration-500"
            style={{ [f.side]: '12px', top: `${f.top * 100}%` } as React.CSSProperties}
          >
            <span className="block text-[10px] text-moon leading-tight">{f.label}</span>
            <span className="block text-[9px] text-moon/60 leading-tight">{f.value}</span>
          </div>
        ))}

        <button
          onClick={onClose}
          className="absolute top-12 right-4 text-[11px] px-3 py-1.5 rounded-full bg-night/60 border border-moon/20 text-moon/80 cursor-pointer"
        >
          Not now
        </button>
      </div>

      {/* What is happening, in her words. Aubergine, so it carries the gold fig like every
          other After Dark surface. Only the panel: a branch drawn over a live preview of
          her face would read as something being done TO the picture. */}
      <div className="relative shrink-0 px-6 pb-8 pt-5 text-center bg-night overflow-hidden">
        <GoldenFigBranch className="-top-8 -right-10 w-60 h-44 opacity-45" />
        <div className="relative z-10 eyebrow text-mauve">{SCAN_COPY.eyebrow}</div>
        <h1 className="relative z-10 font-display text-[22px] leading-tight mt-1.5">
          Your skin, your features,
          <br />
          your hair, <em>all at once.</em>
        </h1>
        <p className="relative z-10 text-[12px] leading-[1.55] text-moon/70 max-w-[236px] mx-auto mt-2">
          {phase === 'denied'
            ? SCAN_COPY.denied
            : phase === 'unsupported'
            ? SCAN_COPY.unsupported
            : phase === 'warming'
            ? (slow ? (waitingOn === 'camera' ? SCAN_COPY.slowCamera : SCAN_COPY.slowEyes) : SCAN_COPY.warming)
            : phase === 'looking'
            ? SCAN_COPY.looking
            : SCAN_COPY.reading}
        </p>

        {phase === 'warming' && slow && (
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="relative z-10 mt-3 text-[12px] px-4 py-2 rounded-full border border-moon/30 text-moon/90 cursor-pointer"
          >
            {SCAN_COPY.retry}
          </button>
        )}

        {phase === 'reading' && (
          <>
            {/* Which pass is running. Named, because "analysing" is what a product says
                when it does not want to tell you what it is doing. */}
            <p className="relative z-10 text-[11px] text-mauve/90 mt-2.5 h-4 transition-opacity duration-300">
              {SCAN_STAGES[stage]}
            </p>
            <div className="relative z-10 mt-2 h-[3px] rounded-full bg-moon/15 overflow-hidden max-w-[180px] mx-auto">
              <div className="h-full bg-gold transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
            </div>
          </>
        )}

        {/* Whatever is standing between me and an honest reading, said once and kindly. */}
        {nudge && (
          <p className="relative z-10 text-[11.5px] leading-snug text-gold max-w-[240px] mx-auto mt-2.5">
            {nudge}
          </p>
        )}

        {/* Standing from the moment the screen opens, because asking beforehand is worth
            more than telling her afterwards that the scan was of a wig. */}
        {(phase === 'looking' || phase === 'reading') && !nudge && (
          <p className="relative z-10 text-[11px] leading-snug text-moon/55 max-w-[240px] mx-auto mt-2.5">
            {HEADWEAR_PROMPT}
          </p>
        )}

        <div className="relative z-10 flex gap-1.5 justify-center mt-3.5">
          <span className="text-[11px] px-3 py-1.5 rounded-full border border-gold/40 bg-gold/[0.14] text-gold font-medium">
            {SCAN_COPY.chips[0]}
          </span>
          <span className="text-[11px] px-3 py-1.5 rounded-full border border-moon/[0.16] bg-moon/[0.06] text-moon/70">
            {SCAN_COPY.chips[1]}
          </span>
        </div>

        {/* No camera, no reading, and no dead end either. She came in through the entrance
            and the entrance owes her a way out of this screen that is not the back button. */}
        {(phase === 'denied' || phase === 'unsupported') && (
          <button
            onClick={onClose}
            className="relative z-10 w-full mt-4 rounded-full bg-moon text-night py-3 text-[13px] font-semibold cursor-pointer transition-transform active:scale-[0.98]"
          >
            Take me in without it
          </button>
        )}

        <p className="relative z-10 text-[10px] text-moon/45 mt-2.5">{LIGHT_WHY}</p>
      </div>
    </div>
  );
};
