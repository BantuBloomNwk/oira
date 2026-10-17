// The scan's liveness check passes a live face and refuses a photo.
// Run from client/:  node e2e/test-liveness.mjs   (needs app-next's packages)
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const appNext = new URL('../../app-next/', import.meta.url).pathname;
const out = path.join(os.tmpdir(), `liveness-${process.pid}.mjs`);
execFileSync(path.join(appNext, 'node_modules/.bin/esbuild'), [path.join(appNext, 'src/lib/liveness.ts'), '--bundle', '--format=esm', `--outfile=${out}`, '--log-level=error']);
const { Liveness } = await import(out);
fs.unlinkSync(out);

let failed = 0;
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const box = { cx: 0.5, cy: 0.5, size: 0.4 };

// Plays frames at 10 a second. Each frame: [eyesClosed, yaw, box?]
function run(order, frames) {
  const l = new Liveness(() => (order === 'blink' ? 0.1 : 0.9));
  let t = 1000, result = 'pending';
  for (const [e, y, b] of frames) { result = l.feed({ eyesClosed: e, yaw: y, box: b ?? box }, t); t += 100; if (result !== 'pending') break; }
  return { result, l };
}
const still = (n, e = 0.1, y = 0.02) => Array.from({ length: n }, () => [e, y]);
const blink = (open = 0.1, shut = 0.8) => [...still(4, open), [shut, 0.02], [shut, 0.02], ...still(2, open)];
const turn = () => [...still(4), [0.1, 0.08], [0.1, 0.16], [0.1, 0.2], [0.1, 0.12], [0.1, 0.05], [0.1, 0.03]];

check('a live face, blink first then turn, passes', run('blink', [...blink(), ...turn()]).result === 'passed');
check('a live face, turn first then blink, passes', run('turn', [...turn(), ...blink()]).result === 'passed');
check('the other way round, it waits for the right prompt', run('blink', [...turn(), ...still(5)]).result === 'pending');
check('eyes whose open reading is high still pass', run('blink', [...blink(0.4, 0.85), ...turn().map(([e, y]) => [0.4, y])]).result === 'passed');
check('a still photo never passes and times out', run('blink', still(120)).result === 'failed');
check('a photo tilted to fake a turn cannot blink', run('turn', [...turn(), ...still(100)]).result === 'failed');
{ const jumped = { cx: 0.8, cy: 0.5, size: 0.4 };
  check('a face that jumps mid check starts over', run('blink', [...still(4), [0.1, 0.02, jumped]]).result === 'restarted'); }
{ const { l } = run('blink', [...blink(), ...turn()]);
  check('after passing, the same face holding still is accepted', l.stillSameFace({ eyesClosed: 0.1, yaw: 0.02, box }));
  check('after passing, a different face swapped in is caught', !l.stillSameFace({ eyesClosed: 0.1, yaw: 0.02, box: { cx: 0.5, cy: 0.5, size: 0.7 } })); }
{ let firsts = new Set(); for (let i = 0; i < 40; i++) firsts.add(new Liveness().step); check('the first prompt is random', firsts.size === 2); }

console.log(failed ? `\n${failed} FAILED` : '\nALL GREEN');
process.exit(failed ? 1 : 0);
