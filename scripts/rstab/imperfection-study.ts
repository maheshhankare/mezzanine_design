// Equivalent imperfection LOADS vs explicit GEOMETRIC imperfection, separately and combined, on the RSTAB benchmark (Detail 2 model, CO1: + LC6 along +Y).
//   npx tsx scripts/rstab/imperfection-study.ts [divColumn] [divBeam]
// Cases:  loads (RSTAB's representation) | geometry, columns only (mechanically the same effect, current N) | geometry, whole structure leaning |
//         loads + geometry (the imperfection counted TWICE: only to show what double counting does).
// All differences are between solver runs, not against RSTAB; the loads case is the one validated against RSTAB (compare.ts).
import { prepare } from '../../src/server/frame/model';
import { solveFrame, sectionForcesAt } from '../../src/server/frame/solve';
import { buildModel, loadCases, imperfectionLoads } from './build-model';
import { swayGeometry } from '../../src/server/frame/imperfection';
import { readFileSync } from 'node:fs';

process.env.BENCH ??= 'benchmarks/rstab-3x5-v2';
const divColumn = +(process.argv[2] || 4), divBeam = +(process.argv[3] || 2);
const { model, members, nodeMap } = buildModel({ divColumn, divBeam, shearDeformation: true });
const { LC1, LC2 } = loadCases(members, nodeMap);
const ps = prepare(model, 1);
const gravity = [{ lc: LC1, factor: 1.4 }, { lc: LC2, factor: 1.5 }];
const g = solveFrame({ prepared: prepare(buildModel({ divColumn: 1, divBeam: 1, shearDeformation: true }).model, 1), combo: [...gravity], options: { secondOrder: false } });
const dir: [number, number, number] = [0, 1, 0], phi0 = 1 / 200;
const imp = imperfectionLoads(members, nodeMap, g, phi0, dir);
const sets: { members: number[] }[] = JSON.parse(readFileSync(process.env.BENCH + '/sets.json', 'utf8'));
const setMembers = sets.map((s) => s.members);
const geoCols = swayGeometry(ps, setMembers, phi0, dir, [0, 0, -1], 'columns');
const geoStruct = swayGeometry(ps, setMembers, phi0, dir, [0, 0, -1], 'structure');
const none = solveFrame({ prepared: ps, combo: [...gravity] });

interface Run { name: string; note: string; res: ReturnType<typeof solveFrame> }
const run = (name: string, note: string, loads: boolean, geo: typeof geoCols | null): Run => ({
  name, note, res: solveFrame({ prepared: ps, combo: loads ? [...gravity, { lc: imp.lc, factor: 1 }] : [...gravity], imperfection: geo?.nodal ?? null, elementImperfection: geo?.elements ?? null }),
});
const runs: Run[] = [
  run('no imperfection', 'second order, gravity only', false, null),
  run('loads', 'equivalent loads, N from first order (RSTAB representation)', true, null),
  run('geometry, columns', 'stress-free lean of the column elements, current N', false, geoCols),
  run('geometry, structure', 'whole building leans (floors, braces and beams too)', false, geoStruct),
  run('loads + geometry', 'BOTH: counted twice (not to be used)', true, geoCols),
];

const basis = runs[1].res;
const reactionY = (r: Run['res']) => [...r.reactions.values()].reduce((s, v) => s + v[1], 0) / 1000;
const maxU = (r: Run['res'], k: number) => Math.max(...[...r.displacement.values()].map((v) => Math.abs(v[k])));
const colMoment = (r: Run['res'], k: number) => { // governing column moment component (kNcm)
  let m = 0; const isCol = new Map(members.map((x) => [x.id, x.dir === 'Z']));
  for (const e of r.elements) if (isCol.get(e.member)) for (const s of e.stations) m = Math.max(m, Math.abs(s[k]));
  return m / 1e4;
};
const maxSup = (r: Run['res'], k: number) => Math.max(...[...r.reactions.values()].map((v) => Math.abs(v[k]))) / (k < 3 ? 1e3 : 1e4);
console.log(`Detail 2 model, CO1 = 1.4 LC1 + 1.5 LC2 + imperfection 1/200 along +Y, shear deformation on, ${ps.elements.length} elements, ${ps.nFree} dof`);
console.log('');
console.log('run'.padEnd(22), 'status'.padEnd(11), 'it'.padStart(3), 'sum Ry [kN]'.padStart(12), 'max uY [mm]'.padStart(12), 'max col Mz [kNcm]'.padStart(18), 'max col My [kNcm]'.padStart(18), 'max base Mx [kNcm]'.padStart(19));
for (const r of runs) console.log(r.name.padEnd(22), r.res.status.padEnd(11), String(r.res.totalIterations).padStart(3), reactionY(r.res).toFixed(2).padStart(12), maxU(r.res, 1).toFixed(2).padStart(12), colMoment(r.res, 6).toFixed(1).padStart(18), colMoment(r.res, 5).toFixed(1).padStart(18), maxSup(r.res, 3).toFixed(1).padStart(19));
console.log('');
console.log('Difference to the "loads" run (normalised by the largest value of that quantity in the loads run, so near-zero values do not dominate):');
const diffs = (a: Run['res'], b: Run['res']) => {
  let du = 0, mu = 1e-12, dN = 0, mN = 1e-12, dM = 0, mM = 1e-12, dR = 0, mR = 1e-12;
  for (const [id, v] of b.displacement) { const w = a.displacement.get(id)!; for (let k = 0; k < 3; k++) { du = Math.max(du, Math.abs(w[k] - v[k])); mu = Math.max(mu, Math.abs(v[k])); } }
  for (const [id, v] of b.reactions) { const w = a.reactions.get(id)!; for (let k = 0; k < 6; k++) { dR = Math.max(dR, Math.abs(w[k] - v[k])); mR = Math.max(mR, Math.abs(v[k])); } }
  const bm = new Map(b.elements.map((e) => [e.element, e]));
  for (const e of a.elements) { const o = bm.get(e.element); if (!o) continue; for (let i = 0; i < e.stations.length; i++) { for (const k of [1, 2, 3]) { dN = Math.max(dN, Math.abs(e.stations[i][k] - o.stations[i][k])); mN = Math.max(mN, Math.abs(o.stations[i][k])); } for (const k of [5, 6]) { dM = Math.max(dM, Math.abs(e.stations[i][k] - o.stations[i][k])); mM = Math.max(mM, Math.abs(o.stations[i][k])); } } }
  return { u: du / mu, F: dN / mN, M: dM / mM, R: dR / mR };
};
for (const r of runs) { if (r === runs[1]) continue; const d = diffs(r.res, basis); console.log(r.name.padEnd(22), `displacements ${(d.u * 100).toFixed(2).padStart(7)} %   N, V ${(d.F * 100).toFixed(2).padStart(7)} %   M ${(d.M * 100).toFixed(2).padStart(7)} %   support ${(d.R * 100).toFixed(2).padStart(7)} %   ${r.note}`); }
void none; void sectionForcesAt;
