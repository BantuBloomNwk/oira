import { isLowEnd } from '../lib/lite';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  consolidate, getMeshEdges, MESH_LINES, placeFindings, readFrame, warmUp,
  type Finding, type ScanFrame, scanError, scanStatus, scanStage
} from '../lib/scan';
import {
  HEADWEAR_NUDGE, HEADWEAR_PROMPT, LIGHT_NUDGE, LIGHT_WHY, LIVE_COPY, SCAN_COPY, SCAN_STAGES, STUCK_COPY,
} from '../lib/voice';
import { diag } from '../lib/diag';
import { Liveness, type LiveStep } from '../lib/liveness';
import { GoldenFigBranch } from './GoldenFigBranch';
import { openCamera, type CaptureSession, type CapturePath } from '../lib/capture';
import { CameraControl, cameraControlEnabled } from '../lib/camera-control';

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
/* Readings per second: about eight on a low end phone, every frame elsewhere. */
const READ_GAP_MS = isLowEnd() ? 120 : 0;

const SLOW_MS = 12_000;
/* How long the scan waits before it stops hoping and says what is wrong. No face at all is
   quick to call; being held up by the light or the blink check gets longer, because those
   usually sort themselves out. A camera with no picture gets one quiet restart first. */
const NO_FACE_MS = 10_000;
const BLOCKED_MS = 25_000;
const FIRST_FRAME_MS = 4_000;
/* How long the light has to stay bad before it counts, so a light on the line does not flicker
   the hold on and off. */
const LIGHT_SETTLE_MS = 700;
type Stuck = 'noFace' | 'light' | 'check' | 'noPicture';

/* Where the camera picture actually sits on screen. The video is shown with object-fit:
   cover, so when the camera's frame is a different shape from the screen it is scaled up and
   its edges cropped. Landmarks are fractions of the camera frame, so anything drawn over the
   picture has to go through the same scale and crop or it lands beside the face it describes.
   Android cameras often hand back a frame shape that does not match a tall phone screen, which
   is where this showed. */
function coverOf(video: HTMLVideoElement | null, cssW: number, cssH: number, host?: Element | null) {
  /* Measured off the video element's real box rather than assumed from the container, because
     on some Android browsers the element does not end up the size its classes ask for. */
  let bx = 0, by = 0, bw = cssW, bh = cssH;
  if (video && host) {
    const v = video.getBoundingClientRect(), c = host.getBoundingClientRect();
    if (v.width > 0 && v.height > 0) { bx = v.left - c.left; by = v.top - c.top; bw = v.width; bh = v.height; }
  }
  const vw = video?.videoWidth || bw, vh = video?.videoHeight || bh;
  const scale = Math.max(bw / vw, bh / vh);
  const w = vw * scale, h = vh * scale;
  return { w, h, x0: bx + (bw - w) / 2, y0: by + (bh - h) / 2 };
}

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

  const [phase, setPhase] = useState<'warming' | 'looking' | 'reading' | 'denied' | 'unsupported' | 'stalled'>('warming');
  /* What is holding the scan up, once it has held it up for long enough to say so. */
  const [stuck, setStuck] = useState<Stuck | null>(null);
  const stuckRef = useRef<Stuck | null>(null);
  const noFaceSinceRef = useRef<number | null>(null);
  const blockedSinceRef = useRef<number | null>(null);
  const lightBadSinceRef = useRef<number | null>(null);
  const lightBlockedSinceRef = useRef<number | null>(null);
  const autoRetriedRef = useRef(false);
  const markStuck = useCallback((next: Stuck | null) => {
    if (stuckRef.current === next) return;
    stuckRef.current = next;
    setStuck(next);
    if (next) diag('scan', `stuck: ${next}`);
  }, []);
  /* Which half of the warm up is still out, so a slow phone says what it is waiting on
     rather than spinning with nothing to show. Logged too, for anyone debugging a device. */
  const [waitingOn, setWaitingOn] = useState<'camera' | 'eyes' | null>('camera');
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const lastReadRef = useRef(0);
  /* The loader's stage lives outside React, so while the scan is slow the hint re-reads it
     every second rather than freezing on whatever it said at the twelve second mark. */
  const [, setBeat] = useState(0);
  useEffect(() => {
    if (!slow) return;
    const id = setInterval(() => setBeat((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [slow]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [nudge, setNudge] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  /* The quick blink and head turn before her colours are read. See src/lib/liveness.ts. */
  const liveRef = useRef(new Liveness());
  const liveStepRef = useRef<LiveStep | null>(null);
  const [livePrompt, setLivePrompt] = useState<string | null>(null);
  const [liveNote, setLiveNote] = useState<string | null>(null);
  /* Which camera path she actually got, carried into the reading so the seal records it and a
     browser capture is never later mistaken for one we controlled. Refs, not state: the scan
     loop is a callback made once per render cycle, and state read inside it could be stale,
     which is how every reading used to record the path's starting value. */
  const captureRef = useRef<CapturePath>('browser');
  const controlRef = useRef<CameraControl | null>(null);

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
    /* Mirrored, so what she sees matches the face she is pulling, and placed through the same
       scale and crop as the picture. See coverOf(). */
    const fit = coverOf(videoRef.current, cssW, cssH, canvas);
    const px = (x: number) => fit.x0 + (1 - x) * fit.w;
    const py = (y: number) => fit.y0 + y * fit.h;

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

    /* Read at most this often. A phone that cannot finish a reading in one frame used to
       queue them up, so the mesh drew where her face had been rather than where it is. */
    /* The gap is for the colour hold. During the blink and the turn every frame counts, and a
       slow phone already reads few enough of them. */
    if (liveRef.current.passed && now - lastReadRef.current < READ_GAP_MS) {
      rafRef.current = requestAnimationFrame((t) => tickRef.current(t));
      return;
    }
    lastReadRef.current = now;

    const frame = readFrame(video, scratchRef.current, now, !liveRef.current.passed);
    latestRef.current = frame;
    paint(frame, now);

    if (frame.landmarks) {
      /* The labels are positioned as fractions of the screen, so their anchors go through the
         same scale and crop as the mesh. x stays unmirrored here; placeFindings mirrors it. */
      const host = canvasRef.current?.parentElement;
      if (host && host.clientWidth && host.clientHeight) {
        const W = host.clientWidth, H = host.clientHeight, fit = coverOf(video, W, H, canvasRef.current);
        setFindings(frame.findings.map((f) => ({ ...f, at: { x: (fit.x0 + f.at.x * fit.w) / W, y: (fit.y0 + f.at.y * fit.h) / H } })));
      } else {
        setFindings(frame.findings);
      }
      setPhase('reading');
      noFaceSinceRef.current = null;
      if (stuckRef.current === 'noFace') markStuck(null);

      /* Camera control first, when it is on: the hold does not start until exposure has been
         metered off the whites of her eyes and locked, or control has given up and the scan
         carries on automatic. Bounded by the control's own time budget. */
      const control = controlRef.current;
      if (control && !control.settled) {
        control.feed(frame.light?.level ?? null, now);
        heldSinceRef.current = null;
        samplesRef.current = [];
        setProgress(0);
        setNudge(null);
        rafRef.current = requestAnimationFrame((t) => tickRef.current(t));
        return;
      }

      /* The light. A reading taken under a warm bulb is not a slightly worse reading, it is
         a different woman's colouring, so the colour hold resets rather than creeping forward.
         Two things changed after the A13: a light sitting right on the line used to flip
         between good and bad from one frame to the next, so it now has to stay bad for a
         moment before it counts; and it only guards the colour hold. The blink and turn
         below do not care about colour and run whatever the light. Her hair being tucked
         away is a nudge only. */
      const light = frame.light;
      const lightNow = light && !light.ok ? LIGHT_NUDGE[light.verdict] ?? null : null;
      if (!lightNow) lightBadSinceRef.current = null;
      else if (lightBadSinceRef.current == null) lightBadSinceRef.current = now;
      const lightBad = lightNow && lightBadSinceRef.current != null && now - lightBadSinceRef.current >= LIGHT_SETTLE_MS ? lightNow : null;
      setNudge(lightBad ?? (frame.hairLikelyCovered ? HEADWEAR_NUDGE : null));

      /* Liveness, before the hold. Nothing read while she blinks or turns is kept. */
      const live = liveRef.current;
      if (!live.passed) {
        const r = live.feed(frame, now);
        heldSinceRef.current = null;
        samplesRef.current = [];
        setProgress(0);
        if (r === 'passed') setLiveNote(LIVE_COPY.still);
        else if (r === 'failed') setLiveNote(LIVE_COPY.again);
        else if (r === 'restarted') setLiveNote(LIVE_COPY.stay);
        else if (live.step !== liveStepRef.current) setLiveNote(null);
        liveStepRef.current = live.step;
        setLivePrompt(live.passed ? null : live.step === 'blink' ? LIVE_COPY.blink : live.turned ? LIVE_COPY.back : LIVE_COPY.turn);
        if (!live.passed) {
          if (blockedSinceRef.current == null) blockedSinceRef.current = now;
          else if (now - blockedSinceRef.current > BLOCKED_MS) markStuck('check');
          rafRef.current = requestAnimationFrame((t) => tickRef.current(t));
          return;
        }
        blockedSinceRef.current = null;
        if (stuckRef.current === 'check') markStuck(null);
      } else if (!live.stillSameFace(frame, now)) {
        /* The face jumped after the check passed. Whoever is there now has not done it. */
        live.reset();
        liveStepRef.current = live.step;
        heldSinceRef.current = null;
        samplesRef.current = [];
        setProgress(0);
        setLiveNote(LIVE_COPY.stay);
        rafRef.current = requestAnimationFrame((t) => tickRef.current(t));
        return;
      }

      /* Now the light counts. The hold restarts under a light that has stayed bad, and so does
         the sample set: readings taken under it are not worth averaging against good ones. */
      if (lightBad) {
        if (lightBlockedSinceRef.current == null) lightBlockedSinceRef.current = now;
        else if (now - lightBlockedSinceRef.current > BLOCKED_MS) markStuck('light');
        heldSinceRef.current = null;
        samplesRef.current = [];
        setProgress(0);
        rafRef.current = requestAnimationFrame((t) => tickRef.current(t));
        return;
      }
      lightBlockedSinceRef.current = null;
      if (stuckRef.current === 'light') markStuck(null);

      if (heldSinceRef.current == null) {
        heldSinceRef.current = now;
        samplesRef.current = [];
      }
      /* About ten a second. More does not make the median better and it does make the
         phone warmer. */
      if (now - lastSampleRef.current > 95 && !lightNow) {
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
        /* `controlled` only when the camera itself reported the lock. */
        const report = controlRef.current?.report();
        if (report && report.phase !== 'off') console.info('[scan] camera control', report.phase, report.note);
        diag('scan', `reading done (${captureRef.current})`);
        onDone(consolidate(samplesRef.current, frame, report?.locked ? 'controlled' : captureRef.current), still);
        return;
      }
    } else {
      heldSinceRef.current = null;
      samplesRef.current = [];
      setProgress(0);
      setNudge(null);
      setPhase('looking');
      blockedSinceRef.current = null;
      if (noFaceSinceRef.current == null) noFaceSinceRef.current = now;
      else if (now - noFaceSinceRef.current > NO_FACE_MS) markStuck('noFace');
      if (liveRef.current.passed || liveRef.current.step !== liveStepRef.current) setLiveNote(null);
      liveRef.current.lost();
      liveStepRef.current = liveRef.current.step;
      setLivePrompt(null);
    }

    rafRef.current = requestAnimationFrame((t) => tickRef.current(t));
  }, [onDone, paint, markStuck]);
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      noFaceSinceRef.current = null;
      blockedSinceRef.current = null;
      lightBadSinceRef.current = null;
      lightBlockedSinceRef.current = null;
      stuckRef.current = null;
      setStuck(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        diag('scan', 'no getUserMedia in this browser');
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
        diag('scan', `models ${ok ? 'ready' : 'failed'} in ${Math.round(performance.now() - t0)} ms`);
        return ok;
      });
      let session: CaptureSession;
      try {
        /* One seam for both paths, the same getUserMedia stream either way. Camera control,
           when it is switched on, takes over that stream below. Which path she got travels
           with the sealed reading. See src/lib/capture.ts and src/lib/camera-control.ts. */
        session = await openCamera();
        diag('scan', `camera open (${session.path}, ${session.locked ? 'locked' : 'unlocked'}) in ${Math.round(performance.now() - t0)} ms`);
        if (!cancelled) setWaitingOn('eyes');
        stream = session.stream;
        captureRef.current = session.path;
        controlRef.current = new CameraControl(stream, cameraControlEnabled());
      } catch (e) {
        clearTimeout(slowTimer);
        diag('scan', `camera refused: ${(e as Error)?.name || 'error'}`);
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
        /* play() itself can wait for ever on a camera that never sends a frame, so it gets
           the same budget as the frame check rather than holding everything up. */
        await Promise.race([video.play().catch(() => {}), new Promise((r) => setTimeout(r, FIRST_FRAME_MS))]);
        /* Some phones hand over a camera that never sends a picture. Wait for real frames
           before going on; if none come, restart it once quietly, then say so. */
        const firstFrame = await new Promise<boolean>((resolve) => {
          const until = performance.now() + FIRST_FRAME_MS;
          let lastTime = -1;
          const check = () => {
            if (cancelled) return resolve(false);
            const moving = video.currentTime > 0 && video.currentTime !== lastTime && lastTime >= 0;
            lastTime = video.currentTime;
            if (video.videoWidth > 0 && video.readyState >= 2 && moving) return resolve(true);
            if (performance.now() > until) return resolve(false);
            setTimeout(check, 200);
          };
          check();
        });
        if (cancelled) return;
        if (!firstFrame) {
          clearTimeout(slowTimer);
          stream.getTracks().forEach((t) => t.stop());
          if (!autoRetriedRef.current) {
            autoRetriedRef.current = true;
            diag('scan', 'camera sent no picture, restarting it once');
            setAttempt((n) => n + 1);
            return;
          }
          diag('scan', 'camera sent no picture after a restart');
          setPhase('stalled');
          markStuck('noPicture');
          return;
        }
      }
      const ok = await warming;
      clearTimeout(slowTimer);
      if (cancelled) return;
      setWaitingOn(null);
      setSlow(false);
      if (!ok) {
        diag('scan', `face models could not load: ${scanError() || 'unknown'}`);
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

  /* The two ways out of a stuck scan. Starting over keeps the camera and clears everything the
     scan was counting; restarting the camera opens it again from nothing. */
  const startOver = () => {
    diag('scan', 'start over');
    liveRef.current.reset();
    liveStepRef.current = liveRef.current.step;
    heldSinceRef.current = null;
    samplesRef.current = [];
    noFaceSinceRef.current = null;
    blockedSinceRef.current = null;
    lightBadSinceRef.current = null;
    lightBlockedSinceRef.current = null;
    setProgress(0);
    setLiveNote(null);
    markStuck(null);
  };
  const restartCamera = () => {
    diag('scan', 'restart camera');
    cancelAnimationFrame(rafRef.current);
    markStuck(null);
    setPhase('warming');
    setAttempt((n) => n + 1);
  };

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
            : phase === 'stalled'
            ? STUCK_COPY.noPicture
            : phase === 'warming'
            ? (slow ? (waitingOn === 'camera' ? SCAN_COPY.slowCamera : SCAN_COPY.slowEyes) : SCAN_COPY.warming)
            : phase === 'looking'
            ? SCAN_COPY.looking
            : SCAN_COPY.reading}
        </p>

        {phase === 'warming' && slow && waitingOn === 'eyes' && (
          <p className="relative z-10 text-[10.5px] text-moon/45 mt-2 max-w-[260px] mx-auto break-words">
            {scanStatus()} at {scanStage()}{scanError() ? `: ${scanError()}` : ''}
          </p>
        )}

        {phase === 'warming' && slow && (
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="relative z-10 mt-3 text-[12px] px-4 py-2 rounded-full border border-moon/30 text-moon/90 cursor-pointer"
          >
            {SCAN_COPY.retry}
          </button>
        )}

        {phase === 'reading' && livePrompt && (
          <p className="relative z-10 text-[13px] leading-snug text-gold font-medium max-w-[250px] mx-auto mt-2.5">
            {livePrompt}
          </p>
        )}

        {phase === 'reading' && liveNote && (
          <p className="relative z-10 text-[11.5px] leading-snug text-moon/70 max-w-[240px] mx-auto mt-1.5">
            {liveNote}
          </p>
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

        {/* Stuck long enough that waiting won't fix it: say what is in the way, and offer the
            way out. */}
        {stuck && (
          <div className="relative z-10 mt-3">
            {stuck !== 'noPicture' && (
              <p className="text-[12px] leading-snug text-gold max-w-[260px] mx-auto">{STUCK_COPY[stuck]}</p>
            )}
            <div className="flex gap-2 justify-center mt-2.5">
              {stuck !== 'noPicture' && (
                <button type="button" onClick={startOver}
                  className="text-[12px] px-4 py-2 rounded-full bg-moon text-night font-semibold cursor-pointer active:scale-[0.98]">
                  {STUCK_COPY.startOver}
                </button>
              )}
              <button type="button" onClick={restartCamera}
                className="text-[12px] px-4 py-2 rounded-full border border-moon/30 text-moon/90 cursor-pointer active:scale-[0.98]">
                {STUCK_COPY.restart}
              </button>
            </div>
          </div>
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
        {(phase === 'denied' || phase === 'unsupported' || phase === 'stalled') && (
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
