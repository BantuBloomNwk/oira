/* Oira — real on-device face detection for the scan screen (the "no face detected but the ring
 * lit up anyway" fix). BlazeFace via TF.js, entirely self-hosted (vendor/tfjs + vendor/blazeface)
 * and entirely local: the model never calls out to a server, and neither does the frame it looks
 * at. Same offline-first, nothing-leaves-the-phone invariant as everything else on this screen.
 *
 * Runtime choice: the TF.js WASM backend (not WebGL, not the general MediaPipe Tasks runtime) —
 * a lean CPU-only kernel with no GPU-driver variance across cheap Android devices, and roughly a
 * quarter the download of the generic multi-task MediaPipe WASM runtime for the same underlying
 * BlazeFace model.
 *
 * Exposes window.OiraFace = { available(), detectFace(videoEl) }.
 */
(function () {
  'use strict';
  function here(file) {
    // Resolve vendor asset paths relative to THIS script's own location, so it still works
    // however deep the page that includes it lives.
    var s = document.currentScript;
    var base = s ? s.src.replace(/[^/]*$/, '') : './';
    return base + file;
  }
  var VENDOR = here('vendor/');

  var loadPromise = null, model = null, status = 'idle';

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = src; el.async = true;
      el.onload = function () { resolve(); };
      el.onerror = function () { reject(new Error('failed to load ' + src)); };
      document.head.appendChild(el);
    });
  }

  async function ensureLoaded() {
    if (model) return model;
    if (loadPromise) return loadPromise;
    status = 'loading';
    loadPromise = (async function () {
      if (!window.tf) {
        await loadScript(VENDOR + 'tfjs/tf-core.min.js');
        await loadScript(VENDOR + 'tfjs/tf-converter.min.js');
        await loadScript(VENDOR + 'tfjs/tf-backend-wasm.min.js');
      }
      if (!window.blazeface) await loadScript(VENDOR + 'blazeface.min.js');
      // Point the WASM backend at our own vendored binaries — never a CDN fetch at runtime.
      window.tf.wasm.setWasmPaths(VENDOR + 'tfjs/');
      await window.tf.setBackend('wasm');
      await window.tf.ready();
      model = await window.blazeface.load({
        modelUrl: VENDOR + 'blazeface/model.json', // local weights; the package's own default
                                                     // model URL (tfhub.dev) is dead (TF Hub moved
                                                     // to Kaggle in 2024) so this MUST be explicit
        maxFaces: 1, scoreThreshold: 0.75,
      });
      status = 'ready';
      return model;
    })().catch(function (e) { status = 'error:' + (e && e.message || e); loadPromise = null; throw e; });
    return loadPromise;
  }

  // true once the model is loaded and ready to detect (kicks off loading on first call so the
  // scan screen can start the download the moment it opens, per the app's own async-load pattern
  // for the on-device concierge model).
  async function available() {
    if (model) return true;
    try { await ensureLoaded(); return true; } catch (e) { return false; }
  }

  // Detect a face in the live video frame and report it against the SAME normalized oval region
  // analyzeSkinRaw() samples (cx=0.5, cy=0.46, rx=0.30, ry=0.36 of the frame) — one definition of
  // "the oval" shared by both the gating check and the colour sample, so they can never disagree.
  var OVAL = { cx: 0.5, cy: 0.46, rx: 0.30, ry: 0.36 };
  async function detectFace(videoEl) {
    if (!model || !videoEl || !videoEl.videoWidth) return null;
    let faces;
    // annotateBoxes=true (the 4th arg) — was false, which is why no landmarks were ever
    // available for a real liveness challenge. BlazeFace's 6 keypoints, in library order, are
    // [rightEye, leftEye, nose, mouth, rightEar, leftEar]; yaw() below turns those into a head-
    // turn signal for the challenge in index.html. The face-presence/centering check below is
    // unchanged, this only adds data on top of it.
    try { faces = await model.estimateFaces(videoEl, false, false, true); } catch (e) { return null; }
    if (!faces || !faces.length) return { present: false };
    // Largest face wins if more than one is in frame (her own, not someone behind her).
    let best = faces[0], bestArea = 0;
    for (const f of faces) {
      const w = f.bottomRight[0] - f.topLeft[0], h = f.bottomRight[1] - f.topLeft[1];
      const area = w * h; if (area > bestArea) { bestArea = area; best = f; }
    }
    const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    // Normalize the detected box to the same [0,1] frame space the oval is defined in.
    const fx0 = best.topLeft[0] / vw, fy0 = best.topLeft[1] / vh;
    const fx1 = best.bottomRight[0] / vw, fy1 = best.bottomRight[1] / vh;
    const fcx = (fx0 + fx1) / 2, fcy = (fy0 + fy1) / 2;
    // "Centered in the oval": the detected face's own center falls inside the oval ellipse, AND
    // the face isn't so small (too far away) or so large (too close) that a real scan would be
    // unreliable either way.
    const dx = (fcx - OVAL.cx) / OVAL.rx, dy = (fcy - OVAL.cy) / OVAL.ry;
    const centered = (dx * dx + dy * dy) <= 1;
    const faceW = fx1 - fx0, faceH = fy1 - fy0;
    const tooFar = faceW < OVAL.rx * 0.55 || faceH < OVAL.ry * 0.55;   // face much smaller than the oval
    const tooClose = faceW > OVAL.rx * 2.6 || faceH > OVAL.ry * 2.6;   // face spilling well past it
    // Head-turn signal for the liveness challenge: nose position relative to the two ears. Facing
    // forward, nose-to-rightEar and nose-to-leftEar distances are close; turning the head shifts
    // that ratio toward one side, and a flat photo/replay held at a fixed angle can't reproduce a
    // smooth, controllable shift the way a real 3D head does. Landmarks can be briefly missing on
    // a low-confidence frame, so yaw is null rather than 0 when they're not usable, the caller
    // should treat null as "no data this tick," not "centered."
    var yaw = null;
    if (best.landmarks && best.landmarks.length >= 6) {
      var nose = best.landmarks[2], rEar = best.landmarks[4], lEar = best.landmarks[5];
      var dR = Math.hypot(nose[0] - rEar[0], nose[1] - rEar[1]);
      var dL = Math.hypot(nose[0] - lEar[0], nose[1] - lEar[1]);
      if (dR + dL > 1e-6) yaw = (dR - dL) / (dR + dL); // ~0 forward, moves toward ±1 turning
    }
    return { present: true, centered, tooFar, tooClose, ok: centered && !tooFar && !tooClose, yaw: yaw };
  }

  window.OiraFace = { available, detectFace, get status() { return status; } };
})();
