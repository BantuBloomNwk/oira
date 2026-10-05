/**
 * Opening the camera, on whichever of the two paths this device actually has.
 *
 * The scan does not care which one it got. It asks for a video element it can read frames
 * off, and gets told what it is holding so the reading can be honest about it. Everything in
 * scan.ts, skin.ts and light.ts stays exactly the same on both paths, which is the point:
 * this is one seam, not a fork.
 *
 * THE TWO PATHS. `browser` is getUserMedia in a web page. `native` is the same getUserMedia
 * call inside the app shell. Either way the phone's own processing has already guessed the
 * white balance and picked an exposure, and keeps adjusting both while we read, unless
 * lib/camera-control.ts takes the track over. When it does and the camera confirms it, the
 * reading is labelled `controlled` instead.
 *
 * Why control matters most at the deep end: auto exposure aims for the same average frame
 * brightness whatever it is pointed at, so a bright window behind her darkens everything and
 * deep skin reads deeper than it is. Metering on the sclera and then locking is how that stops.
 *
 * WHAT NEITHER PATH GIVES US, so nobody plans around it: no RAW, no un-tonemapped frames, no
 * manual white balance gains. Exposure time, ISO and colour temperature can be held where the
 * browser exposes them (it does on a Galaxy A13); beauty filters and other processing the phone
 * applies before we see a pixel cannot be switched off from a page. Closing that gap means a
 * Camera2 plugin, which is real Kotlin work and should be costed as such.
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
 * The native path: the app shell around the same page.
 *
 * The stream comes from getUserMedia, exactly as on the web. This used to also ask the
 * camera-preview plugin to lock exposure and white balance, but the plugin's own camera was
 * never started, so those locks held nothing, while the reading was labelled as though they
 * had. Some of those calls also never answered, which is what hung a Galaxy A13 for minutes.
 * They are gone. Control over the stream we actually read is lib/camera-control.ts, and a
 * reading is labelled `controlled` only when the camera reports the lock itself.
 */
async function openNative(): Promise<CaptureSession> {
  const stream = await navigator.mediaDevices.getUserMedia(VIDEO);
  return {
    stream,
    path: 'native',
    locked: false,
    stop: () => stream.getTracks().forEach((t) => t.stop()),
  };
}
