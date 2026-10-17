import { b64, type Owner } from './owner';
import { bridgeWsUrl } from './seal';
import { rulesSignGuard } from './signguard';

/* Writes her rules to her palette, where her agent and the program read them. Her key signs on
   this phone; the bridge builds the transaction and never sees the key. Everything she is asked
   to sign is checked first, and only this one change is allowed. */
export function saveRulesToPalette(owner: Owner, rules: { minPayout: number; maxPerBrand: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    const allowed = rulesSignGuard(owner.address, rules);
    const ws = new WebSocket(bridgeWsUrl());
    let done = false;
    const finish = (e?: Error) => { if (done) return; done = true; clearTimeout(timer); try { ws.close(); } catch { /* closing */ } if (e) reject(e); else resolve(); };
    const timer = setTimeout(() => finish(new Error("That took too long. Your rules are saved on this phone; I'll try again next time.")), 90_000);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'rules', ownerPubkey: owner.address, ...rules }));
    ws.onmessage = (ev) => {
      let m: { t: string; id?: string; msg?: string; message?: string };
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'sign' && m.msg) {
        const bytes = b64.dec(m.msg);
        try { allowed(bytes); } catch { finish(new Error("Something asked me to sign more than your rules, so I stopped. Nothing changed.")); return; }
        owner.sign(bytes).then((sig) => ws.send(JSON.stringify({ t: 'sig', id: m.id, sig: b64.enc(sig) }))).catch((e) => finish(e instanceof Error ? e : new Error(String(e))));
        return;
      }
      if (m.t === 'done') finish();
      if (m.t === 'error') finish(new Error(m.message || 'Your rules did not save.'));
    };
    ws.onerror = () => finish(new Error('I could not reach the bridge.'));
  });
}
