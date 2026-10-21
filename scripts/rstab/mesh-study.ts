// Mesh refinement and sensitivity of the second-order benchmark solution (Detail 2 model, CO1, equivalent imperfection loads).
//   npx tsx scripts/rstab/mesh-study.ts [alphaCr]
// Rows: elements per column / per beam.  Key results: maximum displacement, governing column moments, base moment, brace force.
// Sensitivities (at 4/2): theory (II vs von Kármán), torsional geometric term, load steps (1 vs 4 vs 8), imperfection 0.9 / 1.1 x phi0.
import { prepare } from '../../src/server/frame/model';
import { solveFrame, criticalLoadFactor } from '../../src/server/frame/solve';
import { buildModel, loadCases, imperfectionLoads } from './build-model';
import type { SolveOptions } from '../../src/server/frame/types';

process.env.BENCH ??= 'benchmarks/rstab-3x5-v2';
const withAlpha = process.argv[2] === 'alphaCr';

function once(divColumn: number, divBeam: number, opts: Partial<SolveOptions> = {}, phiScale = 1) {
  const { model, members, nodeMap } = buildModel({ divColumn, divBeam, shearDeformation: true });
  const { LC1, LC2 } = loadCases(members, nodeMap);
  const gravity = [{ lc: LC1, factor: 1.4 }, { lc: LC2, factor: 1.5 }];
  const g = solveFrame({ prepared: prepare(buildModel({ divColumn: 1, divBeam: 1, shearDeformation: true }).model, 1), combo: [...gravity], options: { secondOrder: false } });
  const imp = imperfectionLoads(members, nodeMap, g, phiScale / 200, [0, 1, 0]);
  const ps = prepare(model, 1);
  const t0 = Date.now();
  const res = solveFrame({ prepared: ps, combo: [...gravity, { lc: imp.lc, factor: 1 }], options: opts });
  const secs = (Date.now() - t0) / 1000;
  const isCol = new Map(members.map((m) => [m.id, m.dir === 'Z']));
  let mz = 0, my = 0, brace = 0;
  for (const e of res.elements) for (const s of e.stations) { if (isCol.get(e.member)) { mz = Math.max(mz, Math.abs(s[6])); my = Math.max(my, Math.abs(s[5])); } else if (e.kind === 'truss') brace = Math.max(brace, Math.abs(s[1])); }
  const uy = Math.max(...[...res.displacement.values()].map((v) => Math.abs(v[1])));
  const base = Math.max(...[...res.reactions.values()].map((v) => Math.abs(v[3]))) / 1e4;
  let alpha = NaN;
  if (withAlpha && divColumn === 1) alpha = criticalLoadFactor(ps, gravity).lambda;
  return { n: ps.elements.length, dof: ps.nFree, status: res.status, it: res.totalIterations, secs, uy, mz: mz / 1e4, my: my / 1e4, brace: brace / 1e3, base, alpha };
}
const fmt = (r: ReturnType<typeof once>) => `${String(r.n).padStart(5)} el ${String(r.dof).padStart(6)} dof  ${r.status.padEnd(9)} ${String(r.it).padStart(3)} it ${r.secs.toFixed(1).padStart(5)} s   max uY ${r.uy.toFixed(3).padStart(7)} mm   col Mz ${r.mz.toFixed(2).padStart(8)}   col My ${r.my.toFixed(2).padStart(8)} kNcm   base Mx ${r.base.toFixed(2).padStart(7)} kNcm   brace N ${r.brace.toFixed(2).padStart(7)} kN${Number.isFinite(r.alpha) ? `   alpha_cr(gravity) ${r.alpha.toFixed(3)}` : ''}`;

console.log('Mesh refinement (elements per column / per beam), Theory II, equivalent imperfection loads 1/200 along +Y');
const meshes: [number, number][] = [[1, 1], [2, 1], [4, 2], [8, 2]];
const base = meshes.map(([c, b]) => { const r = once(c, b); console.log(`${c}/${b}`.padEnd(5), fmt(r)); return r; });
const ref = base[base.length - 1];
console.log('relative to the finest mesh:');
base.forEach((r, i) => console.log(`${meshes[i].join('/')}`.padEnd(5), `uY ${(((r.uy - ref.uy) / ref.uy) * 100).toFixed(3)} %   col Mz ${(((r.mz - ref.mz) / ref.mz) * 100).toFixed(3)} %   col My ${(((r.my - ref.my) / ref.my) * 100).toFixed(3)} %   base Mx ${(((r.base - ref.base) / ref.base) * 100).toFixed(3)} %   brace N ${(((r.brace - ref.brace) / ref.brace) * 100).toFixed(3)} %`));
console.log('\nSensitivity at 4/2 elements:');
const ref42 = base[2];
const sens: [string, Partial<SolveOptions>, number][] = [
  ['reference (Theory II, 4 load steps, phi0 = 1/200)', {}, 1],
  ['von Karman theory (membrane coupling)', { theory: 'vonKarman' }, 1],
  ['torsional geometric term on', { torsionGeometric: true }, 1],
  ['1 load step', { steps: 1 }, 1],
  ['8 load steps', { steps: 8 }, 1],
  ['tighter tolerances (1e-9 / 1e-9 / 1e-9)', { tolForce: 1e-9, tolMoment: 1e-9, tolDisplacement: 1e-9 }, 1],
  ['phi0 x 0.9', {}, 0.9],
  ['phi0 x 1.1', {}, 1.1],
];
for (const [name, o, k] of sens) { const r = once(4, 2, o, k); console.log(name.padEnd(52), `${r.status.padEnd(9)} ${String(r.it).padStart(3)} it   uY ${(((r.uy - ref42.uy) / ref42.uy) * 100).toFixed(3).padStart(8)} %   col Mz ${(((r.mz - ref42.mz) / ref42.mz) * 100).toFixed(3).padStart(8)} %   base Mx ${(((r.base - ref42.base) / ref42.base) * 100).toFixed(3).padStart(8)} %   brace N ${(((r.brace - ref42.brace) / ref42.brace) * 100).toFixed(3).padStart(8)} %`); }
