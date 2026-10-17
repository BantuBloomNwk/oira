// The brand studio: create a campaign and run a match, on devnet.

const SEASONS = ['Bright Spring','True Spring','Light Spring','Light Summer','True Summer','Soft Summer','Soft Autumn','True Autumn','Deep Autumn','Deep Winter','True Winter','Bright Winter'];
const CATS = ['Foundation','Concealer','Lipstick','Blush','Skincare','Other'];
const $ = (id) => document.getElementById(id);
const seasonSel = $('season');
SEASONS.forEach((s, i) => { const o = document.createElement('option'); o.value = i; o.textContent = s; if (i === 3) o.selected = true; seasonSel.appendChild(o); });
$('depth').addEventListener('input', (e) => $('depthval').textContent = e.target.value);
$('tol').addEventListener('input', (e) => $('tolval').textContent = e.target.value);

let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200); }

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }


function badge(c) {
  if (c.status === 'running') return el('span', 'badge b-matching', 'asking…');
  if (c.status === 'done') return el('span', 'badge b-matched', 'done');
  return el('span', 'badge b-open', 'ready');
}

function render(campaigns) {
  const board = $('board');
  if (!campaigns.length) { board.replaceChildren(el('div', 'empty', 'No briefs yet. Post one to see it here.')); return; }
  board.replaceChildren(...campaigns.map((c) => {
    const r = c.results || {};
    const camp = el('div', 'camp');
    const top = el('div', 'top');
    top.append(el('div', 'name', c.label), el('div', 'pay', '$' + c.payout + ' / yes'));
    const meta = el('div', 'meta', (CATS[c.category] || 'Other') + ' · ask ' + c.reach + ' · asked ' + (r.asked || 0) + ' · yes ' + (r.yes || 0) + ' · no ' + (r.no || 0) + ' · turned away ' + (r.turnedAway || 0) + ' · paid $' + (r.paid || 0));
    const actions = el('div', 'actions');
    actions.append(badge(c));
    if (c.status === 'open') {
      const run = el('button', 'run', 'Ask privately now');
      run.dataset.c = String(c.campaign);
      run.addEventListener('click', () => runMatch(run.dataset.c, run));
      actions.append(run);
    }
    camp.append(top, meta, actions);
    return camp;
  }));
}

// Posting and matching spend real devnet SOL, so the studio needs its key. Asked for once,
// kept on this browser only.
function brandKey(again) {
  let k = '';
  try { k = again ? '' : (localStorage.getItem('oira-brand-key') || ''); } catch {}
  if (!k) {
    k = (prompt('Brand studio key') || '').trim();
    try { if (k) localStorage.setItem('oira-brand-key', k); } catch {}
  }
  return k;
}
async function brandPost(path, body) {
  for (const again of [false, true]) {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-oira-brand-key': brandKey(again) }, body: JSON.stringify(body) });
    if (r.status !== 401 || again) return r;
  }
}

async function load() {
  try { const r = await fetch('/api/brand/campaigns'); const j = await r.json(); render(j.campaigns || []); }
  catch { /* keep last render */ }
}

async function post() {
  const btn = $('postBtn'); btn.disabled = true; btn.textContent = 'Posting on-chain…';
  try {
    const body = {
      label: $('label').value.trim() || 'Brand',
      category: Number($('category').value),
      payout: Number($('payout').value) || 5,
      reach: Number($('reach').value) || 3,
      target: { tu: Number($('undertone').value), td: Number($('depth').value), ts: Number($('season').value), tol: Number($('tol').value) },
    };
    const r = await brandPost('/api/brand/campaign', body);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'post failed');
    toast('Brief posted. Tap "Ask privately now" when you are ready.');
    await load();
  } catch (e) { toast(String(e.message || e)); }
  finally { btn.disabled = false; btn.textContent = 'Post brief'; }
}

async function runMatch(campaign, btn) {
  btn.disabled = true; btn.textContent = 'Starting…';
  try {
    const r = await brandPost('/api/brand/match', { campaign });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'could not start');
    toast('Asking privately. Results fill in here as each woman answers.');
    await load();
  } catch (e) { toast(String(e.message || e)); btn.disabled = false; btn.textContent = 'Ask privately now'; }
}

$('postBtn').addEventListener('click', post);
load();
setInterval(load, 6000);
