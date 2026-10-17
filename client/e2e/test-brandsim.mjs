// Sample brand questions are decided against her palette and rules, and come out mixed.
// Run from client/:  node e2e/test-brandsim.mjs   (needs app-next's packages)
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
const appNext = new URL('../../app-next/', import.meta.url).pathname;
const out = path.join(os.tmpdir(), `brandsim-${process.pid}.mjs`);
fs.writeFileSync(out + '.entry.ts', `export { sampleBrandQuery } from '${appNext}src/lib/brandsim.ts'; export { seasonalPalettes } from '${appNext}src/data/paletteData.ts';`);
execFileSync(path.join(appNext, 'node_modules/.bin/esbuild'), [out + '.entry.ts', '--bundle', '--format=esm', `--outfile=${out}`, '--log-level=error']);
const { sampleBrandQuery, seasonalPalettes } = await import(out);
fs.unlinkSync(out); fs.unlinkSync(out + '.entry.ts');
let failed = 0;
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };

for (const her of seasonalPalettes) {
  const tally = { YES: 0, NO: 0, DECLINED: 0 }; let paidOnNo = false, wrongYes = false, logs = [];
  for (let i = 0; i < 2000; i++) {
    const q = sampleBrandQuery(her, { lowestPayout: 1, brandLifetimeCap: 1000 }, [], seasonalPalettes);
    tally[q.answer]++;
    if (q.answer !== 'YES' && q.payout !== 0) paidOnNo = true;
    if (q.answer === 'YES') { const t = seasonalPalettes.find((s) => q.question.endsWith(`a ${s.name}?`)); if (!t || t.undertone !== her.undertone || t.depth !== her.depth) wrongYes = true; }
  }
  const yes = tally.YES / 2000;
  console.log(`  ${her.name.padEnd(14)} yes ${(yes * 100).toFixed(0)}%  no ${(tally.NO / 20).toFixed(0)}%  turned away ${(tally.DECLINED / 20).toFixed(0)}%`);
  check(`${her.name}: a mix, not mostly yes`, yes > 0.15 && yes < 0.6 && tally.NO > 0 && tally.DECLINED > 0);
  check(`${her.name}: a yes only when undertone and depth are hers`, !wrongYes);
  check(`${her.name}: nothing paid unless yes`, !paidOnNo);
}
for (const minimum of [0.1, 1, 4, 10]) {
  const her = seasonalPalettes[0]; const t = { YES: 0, NO: 0, DECLINED: 0 }; let paid = [], under = false;
  for (let i = 0; i < 2000; i++) { const q = sampleBrandQuery(her, { lowestPayout: minimum, brandLifetimeCap: 1000 }, [], seasonalPalettes); t[q.answer]++; if (q.answer === 'YES') { paid.push(q.payout); if (q.payout < minimum) under = true; } }
  const avg = paid.reduce((a, b) => a + b, 0) / (paid.length || 1);
  console.log(`  minimum $${minimum.toFixed(2).padStart(5)}  yes ${(t.YES / 20).toFixed(0)}%  no ${(t.NO / 20).toFixed(0)}%  turned away ${(t.DECLINED / 20).toFixed(0)}%  average yes pays $${avg.toFixed(2)}`);
  check(`minimum $${minimum}: some yeses still come through`, t.YES > 200);
  check(`minimum $${minimum}: no yes pays less than her minimum`, !under);
}
{ const her = seasonalPalettes[0]; let logs = [];
  for (let i = 0; i < 200; i++) logs.push(sampleBrandQuery(her, { lowestPayout: 0, brandLifetimeCap: 1 }, logs, seasonalPalettes));
  const per = {}; for (const l of logs) if (l.answer !== 'DECLINED') per[l.brandName] = (per[l.brandName] || 0) + 1;
  check('a brand never gets past her per-brand limit', Object.values(per).every((n) => n <= 1)); }
console.log(failed ? `\n${failed} FAILED` : '\nALL GREEN');
process.exit(failed ? 1 : 0);
