/* Lite mode, for phones that cannot afford the decoration.
 *
 * A Galaxy A13 lagged through the whole app. Most of that was the background rather than
 * the app: a hue rotating filter that never stops, seven glows and sweeps on infinite
 * loops, and frosted glass on more than twenty surfaces, each of which repaints on every
 * frame on a phone with a modest GPU. None of it carries information.
 *
 * Decided once, before the first paint, from what the browser will say about the device.
 * Memory and core count are the honest signals; data saver means she asked for less. The
 * styles that act on it live at the end of index.css. */

type Nav = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

export function isLowEnd(): boolean {
  try {
    const n = navigator as Nav;
    return (n.deviceMemory !== undefined && n.deviceMemory <= 4)
      || (n.hardwareConcurrency !== undefined && n.hardwareConcurrency <= 4)
      || n.connection?.saveData === true;
  } catch {
    return false;
  }
}

export function applyLite(): void {
  if (isLowEnd()) document.documentElement.classList.add('lite');
}
