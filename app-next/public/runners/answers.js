// Runs on its own, roughly every fifteen minutes, while Oira is closed.
//
// It holds nothing but her read token and the time of the last answer she has seen, both handed
// over by the app. It asks the bridge one question, how many new answers since then, and if any
// have come in it leaves her a notification. No brand, no outcome, and nothing about her travels.

addEventListener('configure', (resolve, reject, args) => {
  try {
    if (args && args.token) CapacitorKV.set('token', String(args.token));
    if (args && args.base) CapacitorKV.set('base', String(args.base));
    if (args && args.since != null) CapacitorKV.set('since', String(args.since));
    resolve();
  } catch (err) {
    reject(err);
  }
});

addEventListener('forget', (resolve) => {
  CapacitorKV.remove('token');
  CapacitorKV.remove('since');
  resolve();
});

/* The store hands back a plain string on some versions and { value } on others, so read both. A
   wrong guess here once meant the check found "no token" and stopped without a word. */
function read(key) {
  const v = CapacitorKV.get(key);
  if (v == null) return null;
  return typeof v === 'string' ? v : (v.value != null ? String(v.value) : null);
}

/* What the last check did, kept for the diagnostics panel. */
function note(result) {
  CapacitorKV.set('lastRun', String(Date.now()));
  CapacitorKV.set('lastResult', result);
}

addEventListener('checkAnswers', async (resolve, reject) => {
  try {
    const token = read('token');
    /* Phones set up before the move still hold the bridge's sslip.io name, whose free wildcard
       DNS once failed to resolve here. Their checks go through app.myoira.com instead. */
    const stored = read('base');
    const base = stored && stored.indexOf('sslip.io') >= 0 ? 'https://app.myoira.com' : stored;
    const since = Number(read('since') || 0);
    if (!token || !base) { note('not set up yet'); return resolve({ result: 'not set up yet' }); }

    /* The runner's fetch on Android has no default method and refuses a request without one. */
    const r = await fetch(base + '/api/me/news?since=' + since, { method: 'GET', headers: { 'x-oira-notify': token } });
    if (!r.ok) { note('bridge answered ' + r.status); return resolve({ result: 'bridge answered ' + r.status }); }
    /* The runner's fetch is not the browser's: read the reply as text and parse it here rather
       than trust its json(), and say exactly what came back if it is not what we expect. */
    const raw = await r.text();
    let news = null;
    try { news = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { news = null; }
    const count = news && Number(news.count);
    if (!news || !Number.isFinite(count)) {
      note('odd reply (since ' + since + '): ' + String(raw).slice(0, 80));
      return resolve({ result: 'odd reply: ' + String(raw).slice(0, 80) });
    }
    if (count > 0) {
      CapacitorNotifications.schedule([{
        id: Math.floor(Date.now() / 1000) % 2000000000,
        title: 'Oira',
        body: count === 1
          ? "A brand asked about you while you were away, love. I answered without showing them a thing."
          : count + " brands asked about you while you were away. I answered every one without showing them a thing.",
        autoCancel: true,
      }]);
      CapacitorKV.set('since', String(news.latest));
      note('told her about ' + count + ' (since ' + since + ')');
      return resolve({ result: 'told her about ' + count });
    }
    note('nothing new since ' + since);
    resolve({ result: 'nothing new since ' + since });
  } catch (err) {
    note('failed: ' + (err && err.message ? err.message : String(err)));
    reject(err);
  }
});

addEventListener('status', (resolve) => {
  resolve({ lastRun: read('lastRun'), lastResult: read('lastResult'), configured: !!read('token'), since: read('since') });
});
