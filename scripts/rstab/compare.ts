// Comparison of the frame solver with an RSTAB combination.
//   npx tsx scripts/rstab/compare.ts <CO1|CO2> [divColumn] [divBeam] [first|second]
//
// NORMALISATION (fixed before judging, as agreed). The error of a value is
//     |mine - RSTAB| / max(|RSTAB value|, 5 % of the largest |RSTAB value| of the same KIND, print resolution)
// "same kind" = forces (N, Vy, Vz), moments (T, My, Mz), translations, rotations, support forces, support moments.
// RSTAB prints forces / moments with 2 decimals, displacements with 1 decimal (mm) and rotations with 1 decimal (mrad): differences
// below that print resolution cannot be judged. Target: <= 2 %.
import { readFileSync, writeFileSync } from 'node:fs';
import { prepare } from '../../src/server/frame/model';
import { solveFrame, sectionForcesAt } from '../../src/server/frame/solve';
import { buildModel, loadCases, imperfectionLoads } from './build-model';
import { swayGeometry } from '../../src/server/frame/imperfection';

const co = process.argv[2] || 'CO1';
const BENCH = process.env.BENCH ?? 'benchmarks/rstab-3x5';
// Detail 2 model (benchmarks/rstab-3x5-v2): shear deformation ON (bElemShearStiff = 1 in the .rs8), CO1 = ... + LC6 (imperfection, acts along +Y although
// the report calls it '+X'), CO2 = ... + LC7 (acts along +X although called '+Y'), both second order. Detail 1 model: shear OFF, CO1 first order.
const V2 = BENCH.endsWith('-v2');
const SHEAR = process.env.SHEAR !== undefined ? !!process.env.SHEAR : V2;
const divColumn = +(process.argv[3] || 1), divBeam = +(process.argv[4] || 1);
const mode = process.argv[5] || (co === 'CO1' && !V2 ? 'first' : 'second');
// RSTAB option for CO2: "refer internal forces to deformed system for shear forces Vy and Vz" (printed for every combination; effective in second order)
const deformedShear = mode === 'second';
const { model, members, nodeMap } = buildModel({ divColumn, divBeam, shearDeformation: SHEAR });
const { LC1, LC2 } = loadCases(members, nodeMap);
const ps = prepare(model, 1);
const t0 = Date.now();
const combo = [{ lc: LC1, factor: 1.4 }, { lc: LC2, factor: 1.5 }];
let imp: ReturnType<typeof imperfectionLoads> | null = null;
// IMPMODE: loads (default, what RSTAB does) | geometry (explicit stress-free lean of the column sets) | both (DOUBLE COUNTING, for demonstration only)
const IMPMODE = process.env.IMPMODE || 'loads';
let imperfection: Float64Array | null = null, elementImperfection: Map<number, Float64Array> | null = null;
if (co === 'CO2' || V2) {
  // imperfection load case LC7 (inclination 1/200 towards +Y), from the axial forces of the gravity combination CO1 (first order)
  const g = solveFrame({ prepared: prepare(buildModel({ divColumn: 1, divBeam: 1, shearDeformation: SHEAR }).model, 1), combo: [...combo], options: { secondOrder: false } });
  const lean = (process.env.LEAN || (V2 && co === 'CO1' ? '+y' : '+x')); const dirV: [number, number, number] = lean[1] === 'x' ? [lean[0] === '-' ? -1 : 1, 0, 0] : [0, lean[0] === '-' ? -1 : 1, 0]; imp = imperfectionLoads(members, nodeMap, g, 1 / 200, dirV); console.log('lean direction', lean);
  if (IMPMODE !== 'geometry') combo.push({ lc: imp.lc, factor: 1.0 });
  if (IMPMODE !== 'loads') { const sets: { members: number[] }[] = JSON.parse(readFileSync(BENCH + '/sets.json', 'utf8')); const geo = swayGeometry(ps, sets.map((x) => x.members), 1 / 200, dirV, [0, 0, -1], process.env.SCOPE === 'structure' ? 'structure' : 'columns'); imperfection = geo.nodal; elementImperfection = geo.elements; console.log(`imperfection mode ${IMPMODE}: explicit lean of ${sets.length} column sets`); if (IMPMODE === 'both') console.log('WARNING: equivalent loads AND geometric lean: the imperfection is counted twice'); }
}
const res = solveFrame({ prepared: ps, combo, imperfection, elementImperfection, options: { secondOrder: mode === 'second', torsionGeometric: !!process.env.TORS, theory: process.env.THEORY === 'vonKarman' ? 'vonKarman' : 'II' } });
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
const sup: Record<string, Record<string, number[]>> = JSON.parse(readFileSync(BENCH + '/rstab-support.json', 'utf8'));
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
const def: Record<string, Record<string, number[]>> = JSON.parse(readFileSync(BENCH + '/rstab-deformation.json', 'utf8'));
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
const forces: Record<string, Record<string, any[]>> = JSON.parse(readFileSync(BENCH + '/rstab-forces.json', 'utf8'));
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

// ---- DIAG=1: worst rows per component with member information
if (process.env.DIAG) {
  const comp = ['N', 'Vy', 'Vz', 'T', 'My', 'Mz'];
  for (const [title, g, isCol] of [['beams', beams, false], ['columns', cols, true]] as const) {
    for (const k of [0, 2, 4, 5]) {
      const rows = g[k].map((p) => ({ ...p, d: Math.abs(p.mine - p.ref) })).sort((a, b) => b.d - a.d).slice(0, +process.env.DIAG);
      console.log(`worst ${title} ${comp[k]}:`);
      for (const r of rows) { const mid = +/mbr (\d+)/.exec(r.label)![1]; const m = mInfo.get(mid)!; console.log(`  ${r.label} dir ${m.dir} sec ${m.sec1} h1 ${m.hinge1} h2 ${m.hinge2} mine ${r.mine.toFixed(2)} RSTAB ${r.ref.toFixed(2)}`); }
    }
  }
}

// ---- DIAG2=1: shear ratio mine/RSTAB per beam line (members grouped by direction, coordinate of the line and level)
if (process.env.DIAG2) {
  const groups = new Map<string, { s: number; n: number }>();
  for (const [mid, byCo] of Object.entries(forces)) {
    const rows = byCo[co]; const m = mInfo.get(+mid)!; if (!rows || m.type !== 'beam' || m.dir === 'Z') continue;
    const els = (byMember.get(+mid) || []).sort((a, b) => a.x0! - b.x0!); if (!els.length) continue;
    const a = nodeMap.get(m.n1)!, b = nodeMap.get(m.n2)!;
    const key = m.dir === 'Y' ? `Y-beam sec ${m.sec1} x=${a.x} z=${a.z}` : `X-beam sec ${m.sec1} y=${a.y} z=${a.z}`;
    for (const r of rows) { if (Math.abs(r.Vz) < 3) continue; const el = els.find((e) => r.x >= e.x0! - 1e-6 && r.x <= e.x0! + e.L! + 1e-6) ?? els[els.length - 1]; const f = sectionForcesAt(el, r.x - el.x0!, deformedShear); const g = groups.get(key) ?? groups.set(key, { s: 0, n: 0 }).get(key)!; g.s += f[2] / 1e3 / r.Vz; g.n++; }
  }
  for (const [k, g] of [...groups.entries()].sort()) console.log(k.padEnd(34), 'mean mine/RSTAB Vz', (g.s / g.n).toFixed(3), 'n', g.n);
}

// ---- MBR=<id>: all RSTAB rows of one member against the solver
if (process.env.MBR) {
  const mid = +process.env.MBR; const rows = forces[String(mid)]?.[co] ?? []; const els = (byMember.get(mid) || []).sort((a, b) => a.x0! - b.x0!);
  console.log(`member ${mid} (${mInfo.get(mid)!.dir}, hinges ${mInfo.get(mid)!.hinge1}/${mInfo.get(mid)!.hinge2}): ${els.length} elements`);
  for (const r of rows) { const el = els.find((e) => r.x >= e.x0! - 1e-6 && r.x <= e.x0! + e.L! + 1e-6) ?? els[els.length - 1]; const f = sectionForcesAt(el, r.x - el.x0!, deformedShear); console.log(`${r.kind.padEnd(8)} x=${String(r.x).padStart(7)}  RSTAB N ${r.N} Vy ${r.Vy} Vz ${r.Vz} My ${r.My} Mz ${r.Mz} | mine N ${(f[0] / 1e3).toFixed(2)} Vy ${(f[1] / 1e3).toFixed(2)} Vz ${(f[2] / 1e3).toFixed(2)} My ${(f[4] / 1e4).toFixed(2)} Mz ${(f[5] / 1e4).toFixed(2)}`); }
}

// ---- DUMPCOL=<file>: every column row (mine vs RSTAB, all components) as JSON for offline analysis
if (process.env.DUMPCOL) {
  const out: any[] = [];
  for (const [mid, byCo] of Object.entries(forces)) {
    const m = mInfo.get(+mid)!; if (m.dir !== 'Z') continue; const rows = byCo[co]; const els = (byMember.get(+mid) || []).sort((a, b) => a.x0! - b.x0!); if (!rows || !els.length) continue;
    for (const r of rows) { const el = els.find((e) => r.x >= e.x0! - 1e-6 && r.x <= e.x0! + e.L! + 1e-6) ?? els[els.length - 1]; const f = sectionForcesAt(el, r.x - el.x0!, deformedShear); out.push({ mid: +mid, len: m.length, x: r.x, ref: [r.N, r.Vy, r.Vz, r.T, r.My, r.Mz], mine: f.map((v, k) => v / scale[k]) }); }
  }
  writeFileSync(process.env.DUMPCOL, JSON.stringify(out));
}

// ---- DRIFT=1: nodes whose displacement differs most from RSTAB (to locate and explain a deviation), with the member types at the node
if (process.env.DRIFT) {
  const worst: { id: number; k: number; mine: number; ref: number; d: number }[] = [];
  for (const [id, byCo] of Object.entries(def)) { const ref = byCo[co]; const mine = res.displacement.get(+id); if (!ref || !mine) continue; for (let k = 0; k < 3; k++) worst.push({ id: +id, k, mine: mine[k], ref: ref[k], d: Math.abs(mine[k] - ref[k]) }); }
  worst.sort((a, b) => b.d - a.d);
  const at = new Map<number, string[]>();
  for (const m of members) for (const n of [m.n1, m.n2]) (at.get(n) ?? at.set(n, []).get(n)!).push(`${m.id}:${m.type === 'truss' ? 'brace' : m.dir}/s${m.sec1}`);
  for (const w of worst.slice(0, +process.env.DRIFT)) { const nd = nodeMap.get(w.id)!; console.log(`node ${w.id} (${nd.x}, ${nd.y}, ${nd.z}) u${'XYZ'[w.k]} mine ${w.mine.toFixed(2)} RSTAB ${w.ref.toFixed(2)} diff ${w.d.toFixed(2)} mm   members ${(at.get(w.id) ?? []).slice(0, 6).join(' ')}`); }
}

// ---- SIGNIF=1: engineering significance of the differences. Per member: the largest |mine - RSTAB| of a component against the governing (largest) value
// of that component in the member, and the same for the rotations in print units. A moment difference that is a small fraction of the member's governing
// moment changes a combined utilisation by at most about that fraction times the moment's share of the utilisation.
if (process.env.SIGNIF) {
  const comp = ['N', 'Vy', 'Vz', 'T', 'My', 'Mz'];
  for (const [title, isCol] of [['beams and braces', false], ['columns', true]] as const) {
    for (const k of [4, 5]) {
      const rel: { id: number; r: number; d: number; gov: number }[] = [];
      for (const [mid, byCo] of Object.entries(forces)) {
        const m = mInfo.get(+mid)!; if ((m.dir === 'Z') !== isCol || m.type !== 'beam') continue;
        const rows = byCo[co]; const els = (byMember.get(+mid) || []).sort((a, b) => a.x0! - b.x0!); if (!rows || !els.length) continue;
        let gov = 0, dmax = 0;
        for (const r of rows) { const ref = [r.N, r.Vy, r.Vz, r.T, r.My, r.Mz][k]; if (!Number.isFinite(ref)) continue; const el = els.find((e) => r.x >= e.x0! - 1e-6 && r.x <= e.x0! + e.L! + 1e-6) ?? els[els.length - 1]; const mine = sectionForcesAt(el, r.x - el.x0!, deformedShear)[k] / scale[k]; gov = Math.max(gov, Math.abs(ref)); dmax = Math.max(dmax, Math.max(0, Math.abs(mine - ref) - 0.005)); }
        rel.push({ id: +mid, r: dmax / Math.max(gov, 1), d: dmax, gov });
      }
      rel.sort((a, b) => b.r - a.r);
      const over1 = rel.filter((x) => x.r > 0.01).length, over2 = rel.filter((x) => x.r > 0.02).length;
      const lim = rel.filter((x) => x.gov >= 100); // members that carry a moment of at least 100 kNcm (1 kNm) are the ones a design check can govern
      const big = lim.filter((x) => x.gov >= 500).sort((a, b) => b.r - a.r)[0]; // members carrying 5 kNm or more
      const worst = lim.sort((a, b) => b.r - a.r)[0];
      console.log(`significance ${title} ${comp[k]}: ${rel.length} members; difference > 1 % of the member's own governing value: ${over1}, > 2 %: ${over2}; among members with a governing moment >= 100 kNcm (${lim.length}): worst ${worst ? `${(worst.r * 100).toFixed(2)} % (member ${worst.id}, difference ${worst.d.toFixed(2)} kNcm of ${worst.gov.toFixed(1)} kNcm)` : 'n/a'}; among those >= 500 kNcm: ${big ? `worst ${(big.r * 100).toFixed(2)} % (member ${big.id}, ${big.d.toFixed(2)} of ${big.gov.toFixed(0)} kNcm)` : 'none'}`);
    }
  }
  // rotations
  for (const k of [3, 4, 5]) {
    const ds: { id: number; d: number; mine: number; ref: number }[] = [];
    for (const [id, byCo] of Object.entries(def)) { const ref = byCo[co]; const mine = res.displacement.get(+id); if (!ref || !mine || !rotDefined(+id, k)) continue; ds.push({ id: +id, d: Math.abs(mine[k] * 1000 - ref[k]), mine: mine[k] * 1000, ref: ref[k] }); }
    const n1 = ds.filter((x) => x.d > 0.1 + 1e-9).length, n2 = ds.filter((x) => x.d > 0.2 + 1e-9).length;
    const maxRef = Math.max(...ds.map((x) => Math.abs(x.ref)));
    console.log(`rotation ${['phi X', 'phi Y', 'phi Z'][k - 3]}: ${ds.length} nodes; difference > 1 print unit (0.1 mrad): ${n1}; > 2 print units: ${n2}; largest difference ${Math.max(...ds.map((x) => x.d)).toFixed(2)} mrad of a largest rotation ${maxRef.toFixed(1)} mrad`);
  }
}
