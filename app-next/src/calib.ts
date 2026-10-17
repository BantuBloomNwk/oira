/* Dev-only calibration harness. Not shipped, not linked from the app. It exists because
   "does this read dark skin correctly" is a question you answer by looking at faces, not
   by reasoning about thresholds. Run `npm run dev` and open /calib.html. */
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { readSkin } from './lib/skin';
import { skinNote, skinTitle } from './lib/voice';
import { h as el, fill } from './lib/dom';

const FACES = [
  'eze', 'agbede-a', 'robertson', 'u-fair', 'u-tan-a', 'u-tan-b',
].map((n) => `/portraits/${n}.jpg`);

async function main() {
  const files = await FilesetResolver.forVisionTasks('/mediapipe');
  const landmarker = await FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'CPU' },
    runningMode: 'IMAGE',
    numFaces: 1,
  });

  const body = document.querySelector('#out tbody')!;

  for (const src of FACES) {
    const img = new Image();
    img.src = src;
    await new Promise((r) => { img.onload = r; img.onerror = r; });
    if (!img.naturalWidth) continue;

    const res = landmarker.detect(img);
    const pts = res.faceLandmarks?.[0];
    const row = document.createElement('tr');

    if (!pts) {
      fill(row, el('td', {}, el('img', { src })), el('td', { colspan: 9 }, 'no face found'));
      body.appendChild(row);
      continue;
    }

    const w = 256;
    const h = Math.round((img.naturalHeight / img.naturalWidth) * 256);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    const reading = readSkin(ctx.getImageData(0, 0, w, h).data, w, h, pts);

    if (!reading) {
      fill(row, el('td', {}, el('img', { src })), el('td', { colspan: 9 }, 'not enough skin'));
    } else {
      const { band, ita, undertone, lab, ribbonHex, samples, whiteBalanced } = reading;
      const sw = el('div', { class: 'sw' });
      sw.style.background = ribbonHex;
      fill(row,
        el('td', {}, el('img', { src })),
        el('td', { class: 'band' }, band, el('br'), el('span', { style: 'font:11px system-ui;color:#8A6580' }, `${skinTitle(band)}, ${skinNote(undertone)}`)),
        el('td', {}, ita.toFixed(1)), el('td', {}, undertone),
        el('td', {}, lab.L.toFixed(1)), el('td', {}, lab.a.toFixed(1)), el('td', {}, lab.b.toFixed(1)),
        el('td', {}, whiteBalanced ? 'sclera' : 'none', reading.strongCast ? el('br') : null, reading.strongCast ? el('span', { style: 'color:#A85578' }, 'tinted') : null),
        el('td', {}, samples),
        el('td', {}, sw));
    }
    body.appendChild(row);
  }
  document.title = 'done';
}

main();
