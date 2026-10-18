import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { BackgroundRunner } from '@capacitor/background-runner';
import { BRIDGE_ORIGIN, isNativeApp } from '../lib/native';
import { currentOwner, fingerprintAvailable, walletAvailable, connectedWalletAddress } from '../lib/identity';
import { diagLog } from '../lib/diag';

/**
 * The hidden diagnostics panel. Five taps on the build number in the menu.
 *
 * For when something goes wrong on a phone we cannot hold: what this app, this phone and the
 * bridge look like right now, and what happened in the last few minutes. It holds nothing about
 * her. No address, no reading, no colours; whether she is signed in, and how, is as close as it
 * gets. Copy puts the same text on the clipboard so it can be pasted to whoever is helping.
 */

interface Row { label: string; value: string }

async function bridgeCheck(): Promise<string> {
  const base = isNativeApp() ? BRIDGE_ORIGIN : '';
  const t0 = performance.now();
  try {
    const r = await fetch(`${base}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    return `${r.ok ? 'reachable' : `answered ${r.status}`} in ${Math.round(performance.now() - t0)} ms`;
  } catch (e) {
    return `not reachable (${(e as Error)?.name || 'error'})`;
  }
}

async function cameraCheck(): Promise<string> {
  if (!navigator.mediaDevices?.enumerateDevices) return 'no camera access in this browser';
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    return `${cams.length} camera${cams.length === 1 ? '' : 's'} found`;
  } catch {
    return 'could not list cameras';
  }
}

async function notificationCheck(): Promise<string> {
  if (!isNativeApp()) return 'web, no overnight check';
  try { return (await BackgroundRunner.checkPermissions()).notifications; } catch { return 'unknown'; }
}

export const DiagnosticsSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const owner = currentOwner();
      const signedIn = !owner ? 'no' : connectedWalletAddress() ? 'yes, with a wallet' : 'yes, on this phone';
      const base: Row[] = [
        { label: 'Build', value: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev' },
        { label: 'Running as', value: isNativeApp() ? `Android app (${Capacitor.getPlatform()})` : 'web' },
        { label: 'Browser', value: navigator.userAgent },
        { label: 'Screen', value: `${window.innerWidth}x${window.innerHeight} at ${window.devicePixelRatio}x` },
        { label: 'Online', value: navigator.onLine ? 'yes' : 'no' },
        { label: 'Signed in', value: signedIn },
        { label: 'Fingerprint', value: fingerprintAvailable() ? 'available' : 'not available' },
        { label: 'Wallet', value: walletAvailable() ? 'available' : 'not available' },
      ];
      if (alive) setRows(base);
      const [bridge, camera, notes] = await Promise.all([bridgeCheck(), cameraCheck(), notificationCheck()]);
      if (alive) setRows([...base, { label: 'Bridge', value: bridge }, { label: 'Camera', value: camera }, { label: 'Notifications', value: notes }]);
    })();
    return () => { alive = false; };
  }, []);

  const log = diagLog().slice(-40);
  const report = [
    ...rows.map((r) => `${r.label}: ${r.value}`),
    '',
    ...log.map((e) => `${new Date(e.t).toISOString().slice(11, 19)} [${e.area}] ${e.msg}`),
  ].join('\n');

  const copy = async () => {
    try { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard refused */ }
  };

  return (
    <div className="absolute inset-0 z-[70] bg-night/95 text-moon flex flex-col">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <p className="text-[13px] font-semibold tracking-wide">Diagnostics</p>
        <div className="flex gap-2">
          <button type="button" onClick={copy} className="text-[12px] px-3 py-1.5 rounded-full bg-moon text-night font-semibold cursor-pointer">
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" onClick={onClose} className="text-[12px] px-3 py-1.5 rounded-full border border-moon/30 cursor-pointer">
            Close
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-6 font-mono text-[10.5px] leading-relaxed">
        <p className="text-moon/60 mb-3 font-sans text-[11px]">Nothing here is about you: no address, no reading, no colours. Just how the app and this phone are doing.</p>
        {rows.map((r) => (
          <div key={r.label} className="flex gap-3 py-1 border-b border-moon/10">
            <span className="w-[92px] shrink-0 text-moon/55">{r.label}</span>
            <span className="break-all">{r.value}</span>
          </div>
        ))}
        <p className="mt-4 mb-1.5 text-moon/55 font-sans text-[11px]">What happened recently</p>
        {log.length === 0
          ? <p className="text-moon/45">Nothing yet.</p>
          : log.map((e, i) => (
            <p key={i} className="break-all"><span className="text-moon/45">{new Date(e.t).toISOString().slice(11, 19)}</span> [{e.area}] {e.msg}</p>
          ))}
      </div>
    </div>
  );
};
