/* A short, in-memory log of what the app went through on this phone: the camera, the scan, the
   seal path. It never leaves the phone and holds nothing about her, only events and timings, so
   that when someone says "it got stuck" the hidden diagnostics panel can show where. */

export interface DiagEntry { t: number; area: string; msg: string }

const LOG: DiagEntry[] = [];
const MAX = 200;

export function diag(area: string, msg: string): void {
  LOG.push({ t: Date.now(), area, msg });
  if (LOG.length > MAX) LOG.shift();
  console.info(`[${area}]`, msg);
}

export const diagLog = (): DiagEntry[] => LOG.slice();
