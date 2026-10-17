/* The residual store, readable.
 *
 * Internal. Not linked from the app, and written in our words rather than hers, because the
 * only person who should ever open it is us. Unlike /calib.html this one is built and
 * shipped, and it has to be: the store lives in localStorage, localStorage is per origin,
 * and the readings that matter are collected on real phones pointed at the deployed site.
 * A page that only ran on localhost could only ever show residuals gathered on a laptop,
 * which is the one place the answer does not matter.
 *
 * Shipping it costs nothing in privacy. It can only read the store on the device it is
 * opened on, that store belongs to whoever is holding the phone, and there is no face in it:
 * every row is a measurement of a camera taken from a photograph of a bottle.
 *
 * This is the page to have open during the colorimeter weekend. The number to watch is not
 * any single row, it is the bias line: a camera that reads consistently warm shows up as a
 * db* that averaging never removes. A large bias with a tight spread is the camera. A wide
 * spread is the room.
 */

import { all, clear, summary, type Residual } from './lib/residual';
import { hexToLab } from './lib/match';
import { h, fill } from './lib/dom';

/* Lab back to something a browser will paint, so the two dots can sit side by side and be
   compared by eye as well as by number. Reversing what residual.ts did on the way in. */
function labToHex({ L, a, b }: { L: number; a: number; b: number }): string {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const x = inv(fx) * 0.95047, y = inv(fy), z = inv(fz) * 1.08883;
  const lin = [
    x * 3.2404542 + y * -1.5371385 + z * -0.4985314,
    x * -0.969266 + y * 1.8760108 + z * 0.041556,
    x * 0.0556434 + y * -0.2040259 + z * 1.0572252,
  ];
  const enc = (c: number) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  };
  return `#${lin.map((c) => enc(c).toString(16).padStart(2, '0')).join('')}`;
}

const f = (n: number, d = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);
const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

function render() {
  const rows: Residual[] = all();
  const sum = summary(rows);
  const box = document.getElementById('summary')!;
  const body = document.querySelector('#out tbody')!;
  const actions = document.getElementById('actions')!;
  const dump = document.getElementById('dump') as HTMLTextAreaElement;

  fill(body);

  if (!sum) {
    fill(box, h('p', { class: 'empty' }, 'Nothing collected on this device yet. Open a product, tap the shade, photograph one you own.'));
    fill(actions);
    return;
  }

  const k = (t: string) => h('span', { class: 'k' }, t);
  const big = (t: string | number) => h('span', { class: 'big' }, t);
  fill(box, h('div', { style: 'margin-top:14px' },
    h('div', {}, k('readings'), big(sum.n)),
    h('div', {}, k('median error'), big(sum.deltaE.toFixed(2)), ' dE76'),
    h('div', {}, k('spread (MAD)'), sum.spread.toFixed(2)),
    h('div', {}, k('bias L* a* b*'), big(`${f(sum.bias.dL)} ${f(sum.bias.da)} ${f(sum.bias.db)}`)),
    h('div', {}, k('devices'), sum.devices),
    h('div', {}, k('with illuminant'), `${sum.withIlluminant} of ${sum.n}`)));

  for (const r of [...rows].reverse()) {
    const swatch = (hex: string) => { const sw = h('span', { class: 'sw' }); sw.style.background = hex; return sw; };
    body.appendChild(h('tr', {},
      h('td', {}, when(r.at)), h('td', {}, r.sku),
      h('td', {}, swatch(labToHex(r.measured))), h('td', {}, swatch(labToHex(r.catalog))),
      h('td', {}, f(r.delta.dL)), h('td', {}, f(r.delta.da)), h('td', {}, f(r.delta.db)),
      h('td', {}, r.deltaE.toFixed(1)), h('td', {}, r.cct ?? '-'), h('td', {}, r.quality.toFixed(2)),
      h('td', {}, r.capture), h('td', {}, r.device)));
  }

  fill(actions);

  /* Export exists because the analysis happens on a machine and the data is on a phone.
     Clipboard first since it is the one thing that reliably works in a mobile browser, with
     the textarea behind it for when the clipboard permission is refused. */
  const copy = document.createElement('button');
  copy.textContent = 'Copy JSON';
  copy.onclick = async () => {
    const text = JSON.stringify(rows, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = `Copied ${rows.length}`;
    } catch {
      dump.value = text;
      dump.hidden = false;
      dump.select();
      copy.textContent = 'Select and copy below';
    }
  };
  actions.appendChild(copy);

  const wipe = document.createElement('button');
  wipe.textContent = 'Clear store';
  wipe.onclick = () => {
    /* Deliberately two taps. This is the only copy of the data and there is no server
       behind it to restore from, which is the point of the design and also the risk. */
    if (wipe.dataset.armed !== '1') {
      wipe.dataset.armed = '1';
      wipe.textContent = 'Really clear? Tap again';
      return;
    }
    clear();
    render();
  };
  actions.appendChild(wipe);
}

render();
