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

function badge(c) {
  const s = c.status;
  if (s === 'matched') return '<span class="badge b-matched">matched · $' + (c.amount || 0) + ' paid</span>';
  if (s === 'no-match') return '<span class="badge b-nomatch">no match</span>';
  if (c.live && c.live.phase === 'matching') return '<span class="badge b-matching">matching…</span>';
  return '<span class="badge b-open">open</span>';
}

function render(campaigns) {
  const board = $('board');
  if (!campaigns.length) { board.innerHTML = '<div class="empty">No campaigns yet. Post one to see it here.</div>'; return; }
  board.innerHTML = campaigns.map((c) => {
    const canMatch = c.status === 'open';
    return '<div class="camp">'
      + '<div class="top"><div class="name">' + esc(c.label) + '</div><div class="pay">$' + c.payout + ' / match</div></div>'
      + '<div class="meta">' + (CATS[c.category] || 'Other') + ' · escrow $' + c.escrowUi + '</div>'
      + '<div class="actions">' + badge(c)
      + (canMatch ? '<button class="run" data-c="' + c.campaign + '">Run overnight match</button>' : '')
      + '<a class="ex" href="' + c.explorer + '" target="_blank" rel="noopener">on-chain ↗</a>'
      + '</div></div>';
  }).join('');
  board.querySelectorAll('.run').forEach((b) => b.addEventListener('click', () => runMatch(b.dataset.c, b)));
}
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

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
      target: { tu: Number($('undertone').value), td: Number($('depth').value), ts: Number($('season').value), tol: Number($('tol').value) },
    };
    const r = await fetch('/api/brand/campaign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'post failed');
    toast('Campaign posted and escrow funded.');
    await load();
  } catch (e) { toast(String(e.message || e)); }
  finally { btn.disabled = false; btn.textContent = 'Post campaign & fund escrow'; }
}

async function runMatch(campaign, btn) {
  btn.disabled = true; btn.textContent = 'Matching in enclave…';
  try {
    const r = await fetch('/api/brand/match', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ campaign }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'match failed');
    toast(j.matched ? ('Matched. $' + j.amount + ' settled to her, and you still do not know who.') : 'No match. Nothing was paid, nothing was revealed.');
    await load();
  } catch (e) { toast(String(e.message || e)); btn.disabled = false; btn.textContent = 'Run overnight match'; }
}

$('postBtn').addEventListener('click', post);
load();
setInterval(load, 6000);
