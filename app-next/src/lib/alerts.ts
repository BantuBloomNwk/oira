import { BackgroundRunner } from '@capacitor/background-runner';
import { BRIDGE_ORIGIN, isNativeApp } from './native';
import { diag } from './diag';

/* Overnight alerts in the Android app. Once she has opened her answers (a signed request), the
   bridge hands back a read token; this passes it, with the newest answer she has now seen, to
   the background check in public/runners/answers.js, which wakes about every fifteen minutes
   while the app is closed. Nothing happens on the web, where there is no background runner. */
const LABEL = 'app.myoira.answers';
/* Her switch in the menu, "Tell me what came in overnight". On unless she turns it off. */
const PREF = 'oira_overnight_alerts';

export const alertsWanted = (): boolean => {
  try { return localStorage.getItem(PREF) !== 'off'; } catch { return true; }
};

export async function setAlertsWanted(on: boolean): Promise<void> {
  try { localStorage.setItem(PREF, on ? 'on' : 'off'); } catch { /* storage refused */ }
  diag('alerts', on ? 'overnight alerts switched on' : 'overnight alerts switched off');
  /* Off means the background check forgets her straight away. On takes effect the next time
     she opens her answers, which is when a fresh token arrives. */
  if (!on) await forgetAnswerAlerts();
}

export async function enableAnswerAlerts(token: string | undefined, latestSeen: number): Promise<void> {
  if (!token || !isNativeApp() || !alertsWanted()) return;
  try {
    const perm = await BackgroundRunner.requestPermissions({ apis: ['notifications'] });
    diag('alerts', `notification permission: ${perm.notifications}`);
    await BackgroundRunner.dispatchEvent({ label: LABEL, event: 'configure', details: { token, base: BRIDGE_ORIGIN, since: latestSeen } });
    diag('alerts', 'overnight check set up');
  } catch (e) {
    diag('alerts', `could not set up: ${(e as Error)?.message || 'error'}`);
  }
}

/* When she deletes everything, the background check forgets her too. */
export async function forgetAnswerAlerts(): Promise<void> {
  if (!isNativeApp()) return;
  try { await BackgroundRunner.dispatchEvent({ label: LABEL, event: 'forget', details: {} }); } catch { /* nothing to forget */ }
}
