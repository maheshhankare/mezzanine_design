// Regression check of the second-order solver against the RSTAB benchmark (Detail 2 model, CO1 and CO2).
//   npx tsx scripts/rstab/regress.ts           (or: npm run test:rstab)
// The bounds are the BASELINE of the current solver with a margin (see docs/RSTAB_BENCHMARK.md, section 7): they detect a regression, they are
// not universal accuracy limits and not code tolerances. The 2 % target of the benchmark is reported separately by compare.ts.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// max error [%] per result type, in the normalisation of compare.ts
const BOUND: Record<string, Record<string, number>> = {
  support: { "P X'": 0.5, "P Y'": 0.5, "P Z'": 0.5, "M X'": 3, "M Y'": 3 },
  displacement: { 'u X': 2.5, 'u Y': 2.5, 'u Z': 2.5 },
  beams: { N: 1.2, Vz: 2.5, My: 4.5, Mz: 0.8 }, // V_y: print level (0.23 kN printed, 0.00 computed), not bounded
  columns: { N: 0.8, Vy: 1.0, Vz: 1.0, My: 3.5, Mz: 5.0 },
};

const tsx = 'node_modules/tsx/dist/cli.mjs';
if (!existsSync(tsx)) { console.error('tsx not found: run npm install'); process.exit(2); }
let failed = 0;
for (const co of ['CO1', 'CO2']) {
  const r = spawnSync(process.execPath, [tsx, 'scripts/rstab/compare.ts', co, '1', '1'], { env: { ...process.env, BENCH: 'benchmarks/rstab-3x5-v2' }, encoding: 'utf8', maxBuffer: 1 << 26 });
  const out = (r.stdout || '') + (r.stderr || '');
  if (!/converged \(/.test(out) || /not-converged/.test(out)) { console.log(`FAIL ${co}: the analysis did not converge\n${out.slice(0, 400)}`); failed++; continue; }
  let section = '';
  const seen = new Set<string>();
  for (const line of out.split('\n')) {
    if (/^--- support forces/.test(line)) section = 'support';
    else if (/^--- displacements/.test(line)) section = 'displacement';
    else if (/^--- member forces, beams/.test(line)) section = 'beams';
    else if (/^--- member forces, columns/.test(line)) section = 'columns';
    const m = line.match(/^(\S+(?: \S+)?)\s+n=\s*\d+\s+max\s+([\d.]+) %/);
    if (!m || !section) continue;
    const bound = BOUND[section]?.[m[1].trim()];
    if (bound === undefined) continue;
    seen.add(`${section}/${m[1].trim()}`);
    const ok = +m[2] <= bound;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${co} ${section.padEnd(12)} ${m[1].trim().padEnd(5)} max ${m[2].padStart(6)} %   bound ${bound} %`);
  }
  const want = Object.entries(BOUND).flatMap(([s, o]) => Object.keys(o).map((k) => `${s}/${k}`));
  for (const w of want) if (!seen.has(w)) { console.log(`FAIL ${co} ${w}: result line not found`); failed++; }
}
console.log(failed ? `\n${failed} regression check(s) FAILED` : '\nRSTAB regression: all bounds met');
process.exit(failed ? 1 : 0);
