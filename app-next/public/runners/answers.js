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

addEventListener('checkAnswers', async (resolve, reject) => {
  try {
    const token = (CapacitorKV.get('token') || {}).value;
    const base = (CapacitorKV.get('base') || {}).value;
    const since = Number((CapacitorKV.get('since') || {}).value || 0);
    if (!token || !base) return resolve();

    const r = await fetch(base + '/api/me/news?since=' + since, { headers: { 'x-oira-notify': token } });
    if (!r.ok) return resolve();
    const news = await r.json();
    if (news.count > 0) {
      CapacitorNotifications.schedule([{
        id: Math.floor(Date.now() / 1000) % 2000000000,
        title: 'Oira',
        body: news.count === 1
          ? "A brand asked about you while you were away, love. I answered without showing them a thing."
          : news.count + " brands asked about you while you were away. I answered every one without showing them a thing.",
        autoCancel: true,
      }]);
      CapacitorKV.set('since', String(news.latest));
    }
    resolve();
  } catch (err) {
    reject(err);
  }
});
