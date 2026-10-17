// The app seals her reading with the same codes the brand studio targets.
// Run from client/:  node e2e/test-traitcodes.mjs   (needs app-next's packages)
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
const appNext = new URL('../../app-next/', import.meta.url).pathname;
const out = path.join(os.tmpdir(), `traitcodes-${process.pid}.mjs`);
execFileSync(path.join(appNext, 'node_modules/.bin/esbuild'), [path.join(appNext, 'src/lib/traitcodes.ts'), '--bundle', '--format=esm', `--outfile=${out}`, '--log-level=error']);
const { undertoneCode, seasonCode, SEASONS_12 } = await import(out);
fs.unlinkSync(out);
let failed = 0;
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };

// The brand studio's own option values and season list.
const html = fs.readFileSync(path.join(appNext, 'public/brand/index.html'), 'utf8');
const studio = Object.fromEntries([...html.matchAll(/<option value="(\d)"[^>]*>(Warm|Neutral|Cool|Olive)<\/option>/g)].map((m) => [m[2].toLowerCase(), Number(m[1])]));
for (const tone of ['warm', 'neutral', 'cool', 'olive']) check(`${tone} seals as the studio's ${tone} (${studio[tone]})`, undertoneCode(`${tone} undertone`) === studio[tone]);
const js = fs.readFileSync(path.join(appNext, 'public/brand/studio.js'), 'utf8');
const studioSeasons = JSON.parse(js.match(/const SEASONS = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
check('the twelve seasons are in the studio\'s order', JSON.stringify(studioSeasons) === JSON.stringify([...SEASONS_12]));
for (const [id, name] of [['warm-autumn', 'True Autumn'], ['dark-winter', 'Deep Winter'], ['true-winter', 'True Winter'], ['cool-summer', 'True Summer'], ['deep-autumn', 'Deep Autumn'], ['bright-spring', 'Bright Spring']])
  check(`${id} seals as ${name}`, studioSeasons[seasonCode(id)] === name);
check('a refused re-seal is recognised', /Custom"?:\s*6005|BindingMismatch/i.test('ER tx failed {"InstructionError":[0,{"Custom":6005}]}'));
console.log(failed ? `\n${failed} FAILED` : '\nALL GREEN');
process.exit(failed ? 1 : 0);
