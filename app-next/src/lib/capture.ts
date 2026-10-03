/**
 * Opening the camera, on whichever of the two paths this device actually has.
 *
 * The scan does not care which one it got. It asks for a video element it can read frames
 * off, and gets told what it is holding so the reading can be honest about it. Everything in
 * scan.ts, skin.ts and light.ts stays exactly the same on both paths, which is the point:
 * this is one seam, not a fork.
 *
 * THE TWO PATHS, AND WHY THE SECOND ONE IS WORTH THE WHOLE NATIVE SHELL.
 *
 * `browser` is `getUserMedia`, which is what the PWA has always used and what anyone opening
 * a link gets. The phone's own processing has already run: it guessed the white balance,
 * picked an exposure, and it is still adjusting both while we read. Nothing here can stop it.
 * That is survivable because light.ts corrects against the sclera and consolidate() takes a
 * median over the hold, but it is correcting a moving target.
 *
 * `native` is the same camera through Capacitor, where exposure can be LOCKED after a settle,
 * and white balance too once the plugin version allows it (see openNative). That single
 * change is most of the accuracy argument, and not for the obvious reason. The obvious reason
 * is that a locked camera stops drifting mid scan. The real one is the exposure target: auto exposure aims for the same average frame
 * brightness whatever it is pointed at, so it lifts a deep skinned woman toward mid grey and
 * pulls a fair one down, and both of them get read wrong in the same direction every time.
 * Locking and then aiming the exposure ourselves is the only way that stops, and it is the
 * failure the Monk 7 to 10 end of the range suffers most.
 *
 * WHAT THE NATIVE PATH STILL DOES NOT GIVE US, so nobody plans around it: no RAW, no
 * un-tonemapped YUV, no ISO control, and no manual white balance GAINS, only the lock. The
 * plugin's capture returns encoded frames exactly like the browser's does. docs/strategy asks
 * for "manual raw capture at fixed sensitivity and exposure": fixed exposure and fixed white
 * balance are reachable here, fixed sensitivity and raw are not, and closing that last gap
 * means writing a Camera2 plugin rather than configuring this one. That is a real piece of
 * Kotlin work and it should be costed as such rather than assumed to come free with the shell.
 */

import { isLowEnd } from './lite';
import type { CapturePath } from './confidence';

export type { CapturePath };

export interface CaptureSession {
  /* What the scan reads frames from. Same element either way. */
  stream: MediaStream;
  path: CapturePath;
  /* True once exposure and white balance are held still. Always false on the browser path,
     where there is nothing to hold. The scan can use this to decide whether the light needs
     re-checking every frame or only once. */
  locked: boolean;
  stop: () => void;
}

/* Long enough for auto exposure and auto white balance to settle before they are frozen, and
   short enough that she does not notice a pause before her own face appears. Locking too
   early freezes the camera mid hunt, which is worse than never locking at all: it holds a
   wrong exposure perfectly still for the entire reading. */
const SETTLE_MS = 900;

/* How long any one question to the camera plugin may take. On some phones a call about
   exposure or white balance never answers at all, neither yes nor no, and a .catch does
   nothing for a promise that never settles. Without this the scan waited on it forever: a
   Galaxy A13 sat on a blank scanner for minutes. Past this the camera opens unlocked, which
   is a slightly less exact reading rather than no reading. */
const PLUGIN_TIMEOUT_MS = 1500;
const inTime = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), PLUGIN_TIMEOUT_MS))]);

/* The constraints the browser path has always used, kept here so both paths ask for the same
   framing and the only difference between them is the control we get afterwards. */
/* A smaller frame on a low end phone. Every reading is a pass over the whole frame, and on
   a Galaxy A13 the models run on the processor, so half the pixels is close to half the
   wait. A face still fills enough of 480 by 640 for the skin and colour reads. */
const VIDEO: MediaStreamConstraints = isLowEnd()
  ? { video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 640 } } }
  : { video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } } };

/* Is there a native shell around this page at all?
 *
 * Deliberately a capability check rather than a user agent sniff. The same build runs as a
 * website, as an installed PWA and inside the shell, and the only thing that reliably
 * separates them is whether the bridge is actually there. */
export async function nativeAvailable(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Open the camera on the best path this device has.
 *
 * Falls back silently. A native shell whose camera plugin refuses for any reason is still a
 * phone with a working browser camera in it, and a woman who cannot be read at all is a worse
 * outcome than one read on the weaker path and told so. The path is recorded either way and
 * travels with the sealed reading, so a reading taken here is never confused later with one
 * taken through a camera we controlled.
 */
export async function openCamera(): Promise<CaptureSession> {
  if (await nativeAvailable()) {
    try {
      return await openNative();
    } catch {
      /* Deliberately swallowed. Reported through `path` rather than thrown: the scan's job is
         to read her, not to explain our plugin to her. */
    }
  }
  return openBrowser();
}

async function openBrowser(): Promise<CaptureSession> {
  const stream = await navigator.mediaDevices.getUserMedia(VIDEO);
  return {
    stream,
    path: 'browser',
    locked: false,
    stop: () => stream.getTracks().forEach((t) => t.stop()),
  };
}

/**
 * The native path.
 *
 * The stream still comes from getUserMedia: inside the shell that is a real camera stream and
 * there is no reason to invent a second way to move pixels. What the plugin adds is control
 * over the camera producing it, which is the part the browser has never had.
 *
 * Settle, then lock. In that order and with a real wait between them, for the reason in
 * SETTLE_MS above.
 */
async function openNative(): Promise<CaptureSession> {
  const { CameraPreview } = await import('@capgo/camera-preview');
  const stream = await navigator.mediaDevices.getUserMedia(VIDEO);

  let locked = false;
  try {
    await new Promise((r) => setTimeout(r, SETTLE_MS));

    /* Asked for rather than assumed. The modes a device offers vary, and setting one it does
       not support is how a scan ends up silently unlocked while the code believes otherwise. */
    const exposure = await inTime(CameraPreview.getExposureModes().catch(() => ({ modes: [] as string[] })), { modes: [] as string[] });
    const canLockExposure = !!exposure.modes?.includes('LOCK');
    if (canLockExposure) await inTime(CameraPreview.setExposureMode({ mode: 'LOCK' }), undefined);

    /* White balance. Available since the plugin's 8 line, which is why this project is on
       Capacitor 8 and Node 22 at all.

       Still asked for rather than assumed, and for a sharper reason than the exposure check
       above: LOCK is the mode we want and CONTINUOUS is the one the plugin recommends,
       because a locked white balance on a device that settled badly holds the bad answer
       perfectly still for the whole reading. We take the lock anyway, and we can, because
       light.ts measures the illuminant off the sclera independently and will refuse the scan
       outright if the room is not worth trusting. A frozen white balance under a light we
       have separately verified is exactly the condition this pipeline wants. Without that
       check it would be the wrong call. */
    const balance = await inTime(CameraPreview.getWhiteBalanceModes().catch(() => ({ modes: [] as string[] })), { modes: [] as string[] });
    const canLockBalance = !!balance.modes?.includes('LOCK');
    if (canLockBalance) await inTime(CameraPreview.setWhiteBalanceMode({ mode: 'LOCK' }), undefined);

    /* `locked` claims only what is actually held. On the pinned plugin that means exposure
       alone, and the reading should not be scored as though the camera were fully still. */
    locked = canLockExposure && canLockBalance;
  } catch {
    /* The stream is open and usable; only the control failed. Report it honestly as an
       unlocked native capture rather than pretending either way. */
    locked = false;
  }

  return {
    stream,
    path: 'native',
    locked,
    stop: () => stream.getTracks().forEach((t) => t.stop()),
  };
}
