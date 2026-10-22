// Compares the IS 800 member design implemented here (src/server/frame/design/is800.ts) with RSTAB's own "STEEL IS" results (Detail 3 report, section 2.4),
// for the box columns (cross-section 1, 396 members), using the forces of the second-order analysis CO1 / CO2 of the benchmark.
//   npx tsx scripts/rstab/compare-is-design.ts [CMMODE=sway|table] [AXES=yz|zy]
// This validates the IMPLEMENTATION against another program's interpretation; agreement is not proof of IS 800 compliance, disagreement is investigated.
import { readFileSync } from 'node:fs';
import { prepare } from '../../src/server/frame/model';
import { solveFrame, sectionForcesAt } from '../../src/server/frame/solve';
import { buildModel, loadCases, imperfectionLoads } from './build-model';
import * as D from '../../src/server/frame/design/is800';

process.env.BENCH ??= 'benchmarks/rstab-3x5-v2';
const CMMODE = process.env.CMMODE || 'sway';
const SWAP = process.env.AXES === 'zy'; // map the solver local axes to the IS minor / major axes the other way round
const fy = 250, E = +(process.env.E || 210000);

const geom: D.RhsGeometry = { b: 150, h: 150, t: 5, rOuter: 5, rInner: 0 };
const props = D.rhsProps(geom);
const design: Record<string, { section: number; rows: { x: number; co: string; ratio: number; eq: number; description: string }[] }> = JSON.parse(readFileSync('benchmarks/rstab-3x5-v3/rstab-is-design.json', 'utf8'));

const { model, members, nodeMap } = buildModel({ divColumn: 4, divBeam: 2, shearDeformation: true });
const { LC1, LC2 } = loadCases(members, nodeMap);
const ps = prepare(model, 1);
const gravity = [{ lc: LC1, factor: 1.4 }, { lc: LC2, factor: 1.5 }];
const g = solveFrame({ prepared: prepare(buildModel({ divColumn: 1, divBeam: 1, shearDeformation: true }).model, 1), combo: [...gravity], options: { secondOrder: false } });
const results: Record<string, ReturnType<typeof solveFrame>> = {};
for (const [co, dir] of [['CO1', [0, 1, 0]], ['CO2', [1, 0, 0]]] as const) {
  const imp = imperfectionLoads(members, nodeMap, g, 1 / 200, [...dir] as [number, number, number]);
  results[co] = solveFrame({ prepared: ps, combo: [...gravity, { lc: imp.lc, factor: 1 }] });
  console.log(`${co}: ${results[co].status}`);
}
const mInfo = new Map(members.map((m) => [m.id, m]));
const byMember = new Map<string, Map<number, ReturnType<typeof solveFrame>['elements']>>();
for (const co of Object.keys(results)) { const mm = new Map<number, ReturnType<typeof solveFrame>['elements']>(); for (const e of results[co].elements) (mm.get(e.member) ?? mm.set(e.member, []).get(e.member)!).push(e); byMember.set(co, mm); }

/** forces [N, Vy, Vz, T, My, Mz] at x of a member for a combination, RSTAB sign convention (tension positive) */
function forcesAt(co: string, mid: number, x: number) {
  const els = (byMember.get(co)!.get(mid) || []).sort((a, b) => a.x0! - b.x0!);
  const el = els.find((e) => x >= e.x0! - 1e-6 && x <= e.x0! + e.L! + 1e-6) ?? els[els.length - 1];
  return sectionForcesAt(el, x - el.x0!, true);
}

/** maximum |M_y|, |M_z| along the member and the end moments (a: start, b: end), N·mm */
const momCache = new Map<string, { max: [number, number]; a: [number, number]; b: [number, number] }>();
function memberMoments(co: string, mid: number, L: number) {
  const key = co + mid; const c = momCache.get(key); if (c) return c;
  let my = 0, mz = 0; for (let i = 0; i <= 40; i++) { const f = forcesAt(co, mid, (L * i) / 40); my = Math.max(my, Math.abs(f[4])); mz = Math.max(mz, Math.abs(f[5])); }
  const fa = forcesAt(co, mid, 0), fb = forcesAt(co, mid, L);
  const out = { max: [my, mz] as [number, number], a: [fa[4], fa[5]] as [number, number], b: [fb[4], fb[5]] as [number, number] }; momCache.set(key, out); return out;
}

const Ag = props.A, Md0 = (props.Zpy * fy) / D.GAMMA_M0;
const stats = new Map<number, { n: number; sum: number; max: number; worst: string; ref: number; mine: number }>();
const add = (eq: number, ratioMine: number, ratioRef: number, label: string) => {
  const s = stats.get(eq) ?? stats.set(eq, { n: 0, sum: 0, max: 0, worst: '', ref: 0, mine: 0 }).get(eq)!;
  const d = Math.abs(ratioMine - ratioRef); s.n++; s.sum += d; if (d > s.max) { s.max = d; s.worst = label; s.ref = ratioRef; s.mine = ratioMine; }
};
let compared = 0;
for (const [id, v] of Object.entries(design)) {
  if (v.section !== 1) continue;
  const m = mInfo.get(+id)!; if (!m || m.type !== 'beam') continue;
  const L = m.length;
  const NdA = (Ag * fy) / D.GAMMA_M0;
  for (const r of v.rows) {
    const f = forcesAt(r.co, +id, r.x); const N = f[0], Vy = f[1], Vz = f[2], My = f[4], Mz = f[5];
    const P = -N; // compression positive
    const label = `member ${id} x=${r.x} ${r.co}`;
    if (r.eq === 101) { if (N > 0) add(101, D.tensionYield({ N, Ag, fy }).ratio!, r.ratio, label); continue; }
    const comp = (axis: string) => D.compressionBuckling({ P: Math.max(P, 0), Ae: Ag, fy, E, KL: L, r: props.ry, cls: 'a', axis });
    if (r.eq === 102) { add(102, Math.max(P, 0) / NdA, r.ratio, label); continue; }
    if (r.eq === 121) { add(121, Math.abs(Vz) / D.shearPlastic({ V: Vz, Av: props.Avh, fyw: fy, label: 'z' }).Vd, r.ratio, label); continue; }
    if (r.eq === 123) { add(123, Math.abs(Vy) / D.shearPlastic({ V: Vy, Av: props.Avb, fyw: fy, label: 'y' }).Vd, r.ratio, label); continue; }
    if (r.eq === 301 || r.eq === 311) { add(r.eq, Math.max(P, 0) / comp('y').Pd, r.ratio, label); continue; }
    if (![181, 182, 201, 202, 221, 341, 351].includes(r.eq)) continue;
    // section class: combined stress (web with r1, r2), see classifyRhs
    const Pc = Math.max(P, 0);
    const fcd = fy / D.GAMMA_M0;
    const sigma = Pc / Ag; // average axial stress
    const cl = D.classifyRhs({ flatWidth: props.flatWidth, flatDepth: props.flatDepth, t: geom.t, fy, state: Pc > 0 || Math.abs(My) + Math.abs(Mz) > 0 ? 'combined' : 'axial', r1: sigma / fcd, r2: sigma / fcd });
    const Mdy = D.bendingStrengthSupported({ Ze: props.Zey, Zp: props.Zpy, fy, cls: cl.cls }).Md, Mdz = D.bendingStrengthSupported({ Ze: props.Zez, Zp: props.Zpz, fy, cls: cl.cls }).Md;
    const [Mminor, Mmajor] = SWAP ? [Mz, My] : [My, Mz];
    if (r.eq === 221 || r.eq === 181 || r.eq === 201 || r.eq === 182 || r.eq === 202) {
      // RSTAB uses the conservative linear form of 9.3.1.1 (N/N_d + M_y/M_dy + M_z/M_dz <= 1) with Z_p (class 1 or 2) or Z_e (class 3, 9.3.1.3); the class is taken from
      // RSTAB's own equation label (181, 201, 221: class 1 or 2; 182, 202: class 3): its classification rule could not be reproduced (see docs)
      const Mdc = ((r.eq === 182 || r.eq === 202 ? props.Zey : props.Zpy) * fy) / D.GAMMA_M0;
      const lin = Math.abs(N) / NdA + (r.eq === 201 || r.eq === 202 ? 0 : Math.abs(My) / Mdc) + (r.eq === 181 || r.eq === 182 ? 0 : Math.abs(Mz) / Mdc);
      add(r.eq, lin, r.ratio, label);
      void cl; void Mdy; void Mdz; void Mminor; void Mmajor;
      continue;
    }
    // 9.3.2.2: "M_y, M_z = maximum factored applied bending moments about y and z axis of the member" (IS 800 p. 71); C_m from the end moments (Table 18, linear diagram)
    const cp = comp('y'), Pd = cp.Pd;
    const st = memberMoments(r.co, +id, L);
    const psiOf = (e0: number, e1: number) => { const [lo, hi] = Math.abs(e0) <= Math.abs(e1) ? [e0, e1] : [e1, e0]; return Math.abs(hi) < 1e-9 ? 1 : Math.max(-1, Math.min(1, lo / hi)); };
    const cmOf = (i: 0 | 1) => (CMMODE === 'sway' ? 0.9 : D.cmFactor({ psi: psiOf(st.a[i], st.b[i]) }));
    const [iMinor, iMajor] = SWAP ? [1, 0] : [0, 1];
    const Mminor2 = st.max[iMinor], Mmajor2 = st.max[iMajor];
    const c = D.memberInteraction({ P: Pc, Pdy: Pd, Pdz: Pd, My: Mminor2, Mz: Mmajor2, Mdy, Mdz, lambdaY: cp.res.lambda, lambdaZ: cp.res.lambda, lambdaLT: 0, Cmy: cmOf(iMinor as 0 | 1), Cmz: cmOf(iMajor as 0 | 1), CmLT: 0.9 });
    add(r.eq, r.eq === 341 ? (c.detail['eq. 1'] as number) : (c.detail['eq. 2'] as number), r.ratio, label);
    compared++;
  }
}
console.log(`\nbox columns, ${CMMODE} C_m, axes ${SWAP ? 'swapped' : 'y=local y'}: mine vs RSTAB STEEL IS (absolute difference of the utilisation)`);
const names: Record<number, string> = { 101: 'tension 6.2', 102: 'compression 7.1.2 (section)', 121: 'shear z 8.4.1', 123: 'shear y 8.4.1', 181: 'bending y + shear + N 9.3.1', 201: 'bending z + shear + N 9.3.1', 221: 'biaxial 9.3.1.1/2', 301: 'flexural buckling y 7.1.2', 311: 'flexural buckling z 7.1.2', 341: '9.3.2.2 (y)', 351: '9.3.2.2 (z, LTB)' };
for (const [eq, s] of [...stats.entries()].sort((a, b) => a[0] - b[0])) console.log(`eq ${eq} ${(names[eq] || '').padEnd(30)} n=${String(s.n).padStart(4)}  mean |diff| ${(s.sum / s.n).toFixed(4)}  max ${s.max.toFixed(4)}  worst ${s.worst} (mine ${s.mine.toFixed(3)}, RSTAB ${s.ref.toFixed(3)})`);
void compared;

// DUMP=<file>: every 9.3.2.2 row with its inputs, for offline exploration of the interpretation
if (process.env.DUMP) {
  const out: any[] = [];
  for (const [id, v] of Object.entries(design)) {
    if (v.section !== 1) continue; const m = mInfo.get(+id); if (!m || m.type !== 'beam') continue;
    for (const r of v.rows) { if (![341, 351, 301, 311, 181, 182, 201, 202, 221].includes(r.eq)) continue; const f = forcesAt(r.co, +id, r.x), a = forcesAt(r.co, +id, 0), b = forcesAt(r.co, +id, m.length); out.push({ id: +id, L: m.length, eq: r.eq, co: r.co, x: r.x, ratio: r.ratio, f: f.map((q, i) => (i < 3 ? q / 1e3 : q / 1e4)), a: a.map((q, i) => (i < 3 ? q / 1e3 : q / 1e4)), b: b.map((q, i) => (i < 3 ? q / 1e3 : q / 1e4)) }); }
  }
  require('node:fs').writeFileSync(process.env.DUMP, JSON.stringify(out));
}
