// Comparison of the frame solver with an RSTAB combination.
//   npx tsx scripts/rstab/compare.ts <CO1|CO2> [divColumn] [divBeam] [first|second]
//
// NORMALISATION (fixed before judging, as agreed). The error of a value is
//     |mine - RSTAB| / max(|RSTAB value|, 5 % of the largest |RSTAB value| of the same KIND, print resolution)
// "same kind" = forces (N, Vy, Vz), moments (T, My, Mz), translations, rotations, support forces, support moments.
// RSTAB prints forces / moments with 2 decimals, displacements with 1 decimal (mm) and rotations with 1 decimal (mrad): differences
// below that print resolution cannot be judged. Target: <= 2 %.
import { readFileSync } from 'node:fs';
import { prepare } from '../../src/server/frame/model';
import { solveFrame, sectionForcesAt } from '../../src/server/frame/solve';
import { buildModel, loadCases, imperfectionLoads } from './build-model';

const co = process.argv[2] || 'CO1';
const divColumn = +(process.argv[3] || 1), divBeam = +(process.argv[4] || 1);
const mode = process.argv[5] || (co === 'CO1' ? 'first' : 'second');
// RSTAB option for CO2: "refer internal forces to deformed system for shear forces Vy and Vz" (printed for every combination; effective in second order)
const deformedShear = mode === 'second';
const { model, members, nodeMap } = buildModel({ divColumn, divBeam });
const { LC1, LC2 } = loadCases(members, nodeMap);
const ps = prepare(model, 1);
const t0 = Date.now();
const combo = [{ lc: LC1, factor: 1.4 }, { lc: LC2, factor: 1.5 }];
let imp: ReturnType<typeof imperfectionLoads> | null = null;
if (co === 'CO2') {
  // imperfection load case LC7 (inclination 1/200 towards +Y), from the axial forces of the gravity combination CO1 (first order)
  const g = solveFrame({ prepared: prepare(buildModel({ divColumn: 1, divBeam: 1 }).model, 1), combo: [...combo], options: { secondOrder: false } });
  const lean = (process.env.LEAN || '+x'); const dirV: [number, number, number] = lean[1] === 'x' ? [lean[0] === '-' ? -1 : 1, 0, 0] : [0, lean[0] === '-' ? -1 : 1, 0]; imp = imperfectionLoads(members, nodeMap, g, 1 / 200, dirV); console.log('lean direction', lean);
  combo.push({ lc: imp.lc, factor: 1.0 });
}
const res = solveFrame({ prepared: ps, combo, options: { secondOrder: mode === 'second' } });
console.log(`${co} ${mode}-order, ${ps.elements.length} elements, ${ps.nFree} dof: ${res.status} (${res.totalIterations} it, ${((Date.now() - t0) / 1000).toFixed(1)} s) ${res.message}`);
if (imp) console.log(`imperfection loads: ${imp.nLoads} nodal loads, total horizontal ${(imp.total / 1000).toFixed(1)} kN`);
if (!res.converged) process.exit(1);

const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };
interface Pair { label: string; mine: number; ref: number }
interface Item extends Pair { err: number }
function report(name: string, items: Item[], tol = 0.02) {
  if (!items.length) { console.log(`${name.padEnd(8)} no data`); return; }
  const errs = items.map((i) => i.err);
  const over = errs.filter((e) => e > tol).length;
  const w = items.reduce((a, b) => (b.err > a.err ? b : a));
  console.log(`${name.padEnd(8)} n=${String(items.length).padStart(6)}  max ${(Math.max(...errs) * 100).toFixed(2).padStart(7)} %  99% ${(pct(errs, 0.99) * 100).toFixed(2).padStart(6)} %  median ${(pct(errs, 0.5) * 100).toFixed(3).padStart(7)} %  >${tol * 100}%: ${String(over).padStart(5)}  worst ${w.label} (mine ${w.mine.toFixed(3)}, RSTAB ${w.ref.toFixed(3)})`);
}
/** components of one kind share one normalisation floor */
function judge(groups: Pair[][], resolution: number) {
  const mx = Math.max(...groups.flat().map((p) => Math.abs(p.ref)), 1e-12);
  const floor = Math.max(0.05 * mx, resolution);
  // the printed RSTAB value is rounded to `resolution`: half of it is uncertainty of the reference, not an error of the solver
  return { floor, items: groups.map((g) => g.map((p) => ({ ...p, err: Math.max(0, Math.abs(p.mine - p.ref) - resolution / 2 + 1e-9) / Math.max(Math.abs(p.ref), floor) }))) };
}

// ---- support forces (RSTAB: force on the support; mine: force of the support on the structure -> sign reversed)
const sup: Record<string, Record<string, number[]>> = JSON.parse(readFileSync('benchmarks/rstab-3x5/rstab-support.json', 'utf8'));
const supGroups: Pair[][] = [0, 1, 2, 3, 4, 5].map((k) => {
  const out: Pair[] = [];
  for (const [id, byCo] of Object.entries(sup)) { const ref = byCo[co]; const mine = res.reactions.get(+id); if (ref && mine) out.push({ label: `node ${id}`, mine: -mine[k] / (k < 3 ? 1000 : 1e4), ref: ref[k] }); }
  return out;
});
const sf = judge(supGroups.slice(0, 3), 0.01), sm = judge(supGroups.slice(3), 0.01);
console.log(`--- support forces (floor ${sf.floor.toFixed(2)} kN) and moments (floor ${sm.floor.toFixed(2)} kNcm)`);
["P X'", "P Y'", "P Z'"].forEach((n, k) => report(n, sf.items[k]));
["M X'", "M Y'", "M Z'"].forEach((n, k) => report(n, sm.items[k]));

// ---- nodal displacements
const def: Record<string, Record<string, number[]>> = JSON.parse(readFileSync('benchmarks/rstab-3x5/rstab-deformation.json', 'utf8'));
const supported = new Set(model.supports.map((s) => s.node));
const rotDefined = (id: number, k: number) => { if (k < 3) return true; const i = ps.nodeIndex.get(id)!; return supported.has(id) || !ps.fixed[i * 6 + k]; }; // false: every member end at the node is hinged, the rotation is indeterminate
const dGroups: Pair[][] = [0, 1, 2, 3, 4, 5].map((k) => {
  const out: Pair[] = [];
  for (const [id, byCo] of Object.entries(def)) { const ref = byCo[co]; const mine = res.displacement.get(+id); if (ref && mine && rotDefined(+id, k)) out.push({ label: `node ${id}`, mine: k < 3 ? mine[k] : mine[k] * 1000, ref: ref[k] }); }
  return out;
});
const dt = judge(dGroups.slice(0, 3), 0.1), dr = judge(dGroups.slice(3), 0.1);
console.log(`--- displacements (translation floor ${dt.floor.toFixed(2)} mm, rotation floor ${dr.floor.toFixed(2)} mrad)`);
['u X', 'u Y', 'u Z'].forEach((n, k) => report(n, dt.items[k]));
['phi X', 'phi Y', 'phi Z'].forEach((n, k) => report(n, dr.items[k]));

// ---- member forces at RSTAB's own locations
const forces: Record<string, Record<string, any[]>> = JSON.parse(readFileSync('benchmarks/rstab-3x5/rstab-forces.json', 'utf8'));
const byMember = new Map<number, typeof res.elements>();
for (const e of res.elements) (byMember.get(e.member) ?? byMember.set(e.member, []).get(e.member)!).push(e);
const mInfo = new Map(members.map((m) => [m.id, m]));
const scale = [1e3, 1e3, 1e3, 1e4, 1e4, 1e4];
const mk = (): Pair[][] => [[], [], [], [], [], []];
const beams = mk(), cols = mk();
for (const [mid, byCo] of Object.entries(forces)) {
  const rows = byCo[co]; if (!rows) continue;
  const els = (byMember.get(+mid) || []).sort((a, b) => a.x0! - b.x0!);
  if (!els.length) continue;
  const target = mInfo.get(+mid)!.dir === 'Z' ? cols : beams;
  for (const r of rows) {
    const el = els.find((e) => r.x >= e.x0! - 1e-6 && r.x <= e.x0! + e.L! + 1e-6) ?? els[els.length - 1];
    const f = sectionForcesAt(el, r.x - el.x0!, deformedShear);
    [r.N, r.Vy, r.Vz, r.T, r.My, r.Mz].forEach((ref, k) => { if (Number.isFinite(ref)) target[k].push({ label: `mbr ${mid} ${r.kind} x=${r.x}`, mine: f[k] / scale[k], ref }); });
  }
}
for (const [title, g] of [['beams and braces', beams], ['columns', cols]] as const) {
  const F = judge(g.slice(0, 3), 0.01), M = judge(g.slice(3), 0.01);
  console.log(`--- member forces, ${title} (force floor ${F.floor.toFixed(2)} kN, moment floor ${M.floor.toFixed(2)} kNcm)`);
  ['N', 'Vy', 'Vz'].forEach((n, k) => report(n, F.items[k]));
  ['T', 'My', 'Mz'].forEach((n, k) => report(n, M.items[k]));
}
