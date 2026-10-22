// Reference values for the five small RSTAB test models (docs/RSTAB_TEST_MODELS.md): closed-form beam-column solutions and the solver of this application.
// RSTAB values are NOT in this script: they must be produced by running the same models in RSTAB (see the document). Nothing here changes a calculation.
//   npx tsx scripts/rstab/test-models.ts > benchmarks/rstab-test-models/reference-values.md
import { prepare } from '../../src/server/frame/model';
import { solveFrame } from '../../src/server/frame/solve';
import type { FrameModel, LoadCase, SolveOptions, FMember } from '../../src/server/frame/types';
import { DEFAULT_OPTIONS } from '../../src/server/frame/types';

// ---- data of the benchmark box section 150x150x5 (RSTAB section "QRO-PAR 150/5/5/0", RSTAB report 1.3) and material (1.2), N and mm
const E = 210000, G = 80769.23;
const BOX = { A: 2878.5, Iy: 1.00504e7, Iz: 1.00504e7, J: 1.53727e7, Ay: 1213, Az: 1213 };
const ANGLE = { A: 958, Iy: 22.0e4, Iz: 41.05e4, J: 0.82e4, Ay: 353, Az: 301 }; // 2L 50x50x5 (RSTAB section 5), used as an axial-only diagonal
const EI = E * BOX.Iy;
const F6: [boolean, boolean, boolean, boolean, boolean, boolean] = [true, true, true, true, true, true];
const noShear = (s: typeof BOX) => ({ ...s, Ay: undefined, Az: undefined });
const mats = { S: { E, G, w: 0 } }; // no self-weight in the test models

const opts = (o: Partial<SolveOptions> = {}): SolveOptions => ({ ...DEFAULT_OPTIONS, ...o });
const out: string[] = [];
const p = (s = '') => out.push(s);
const f = (v: number, d = 4) => (Math.abs(v) < 1e-12 ? '0' : v.toFixed(d));
const lc = (nodal: LoadCase['nodal'], member?: LoadCase['member']): LoadCase => ({ id: 'LC', nodal, member });

// ======================================================================= TM1 cantilever column, axial P and lateral H at the top
function tm1(div: number, shear: boolean, second: boolean, P: number, H: number) {
  const L = 4000;
  const m: FrameModel = {
    nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 0, y: 0, z: L }], materials: mats, sections: { S: shear ? BOX : noShear(BOX) },
    members: [{ id: 1, type: 'beam', n1: 1, n2: 2, section: 'S', material: 'S', divisions: div }], supports: [{ node: 1, fixed: F6 }],
  };
  const r = solveFrame({ prepared: prepare(m), combo: [{ lc: lc([{ node: 2, f: [H, 0, -P, 0, 0, 0] }]), factor: 1 }], options: opts({ secondOrder: second }) });
  const u = r.displacement.get(2)!, R = r.reactions.get(1)!;
  return { ux: u[0], Mbase: Math.abs(R[4]), conv: r.converged, it: r.iterations ?? NaN };
}
const L1 = 4000, P1 = 130e3, H1 = 2e3, k1 = Math.sqrt(P1 / EI);
const cf1 = { ux1: (H1 * L1 ** 3) / (3 * EI), M1: H1 * L1, ux2: (H1 / (P1 * k1)) * (Math.tan(k1 * L1) - k1 * L1), M2: (H1 / k1) * Math.tan(k1 * L1) };
const Pcr1 = (Math.PI ** 2 * EI) / (4 * L1 ** 2);

// ======================================================================= TM3 simply supported beam-column, UDL and axial compression
function tm3(div: number, shear: boolean, second: boolean, P: number, q: number) {
  const L = 4000;
  const m: FrameModel = {
    nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }], materials: mats, sections: { S: shear ? BOX : noShear(BOX) },
    members: [{ id: 1, type: 'beam', n1: 1, n2: 2, section: 'S', material: 'S', divisions: div }],
    supports: [{ node: 1, fixed: [true, true, true, true, false, false] }, { node: 2, fixed: [false, true, true, false, false, false] }],
  };
  const load: LoadCase = { id: 'LC', nodal: [{ node: 2, f: [-P, 0, 0, 0, 0, 0] }], member: [{ member: 1, q: [0, 0, -q], system: 'global' }] };
  const r = solveFrame({ prepared: prepare(m), combo: [{ lc: load, factor: 1 }], options: opts({ secondOrder: second }) });
  let Mmax = 0; for (const e of r.elements) for (const s of e.stations) Mmax = Math.max(Mmax, Math.abs(s[5] ?? 0), Math.abs(s[6] ?? 0));
  let wmax = 0; for (const [, u] of r.displacement) wmax = Math.max(wmax, Math.abs(u[2]));
  return { Mmax, conv: r.converged, nodes: r.displacement };
}
const L3 = 4000, PE3 = (Math.PI ** 2 * EI) / L3 ** 2, P3 = 0.5 * PE3, q3 = 5, k3 = Math.sqrt(P3 / EI), u3 = (k3 * L3) / 2;
const cf3 = { M1: (q3 * L3 ** 2) / 8, M2: (q3 / k3 ** 2) * (1 / Math.cos(u3) - 1), w1: (5 * q3 * L3 ** 4) / (384 * EI), w2: ((5 * q3 * L3 ** 4) / (384 * EI)) * (24 / u3 ** 4) * (1 / Math.cos(u3) - 1 - (u3 * u3) / 2) };

// ======================================================================= TM4 braced bay: two cantilever columns, pinned beam, one tension-only diagonal
function tm4(dir: 1 | -1, second: boolean, tensionOnly: boolean, diagonal: 'rising' | 'falling', P = 130e3) {
  const h = 4000, Lb = 4000, H = 6e3;
  // nodes: 1 base left, 2 top left, 3 base right, 4 top right
  const members: FMember[] = [
    { id: 1, type: 'beam', n1: 1, n2: 2, section: 'S', material: 'S', divisions: 4 },
    { id: 2, type: 'beam', n1: 3, n2: 4, section: 'S', material: 'S', divisions: 4 },
    { id: 3, type: 'beam', n1: 2, n2: 4, section: 'S', material: 'S', divisions: 2, rel1: { ry: true, rz: true }, rel2: { ry: true, rz: true } },
    diagonal === 'rising' ? { id: 4, type: 'truss', n1: 1, n2: 4, section: 'D', material: 'S', tensionOnly } : { id: 4, type: 'truss', n1: 2, n2: 3, section: 'D', material: 'S', tensionOnly },
  ];
  const m: FrameModel = { nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 0, y: 0, z: h }, { id: 3, x: Lb, y: 0, z: 0 }, { id: 4, x: Lb, y: 0, z: h }], materials: mats, sections: { S: BOX, D: ANGLE }, members, supports: [{ node: 1, fixed: F6 }, { node: 3, fixed: F6 }] };
  const load: LoadCase = { id: 'LC', nodal: [{ node: 2, f: [dir * H, 0, -P, 0, 0, 0] }, { node: 4, f: [0, 0, -P, 0, 0, 0] }] };
  const r = solveFrame({ prepared: prepare(m), combo: [{ lc: load, factor: 1 }], options: opts({ secondOrder: second, tensionOnly: true }) });
  const N4 = r.elements.find((e) => e.member === 4)?.stations[0][1] ?? NaN;
  return { ux: r.displacement.get(2)![0], N4, conv: r.converged, msg: r.message };
}
const Ld4 = Math.hypot(4000, 4000), K4 = (E * ANGLE.A * (4000 / Ld4) ** 2) / Ld4, Kc4 = (2 * 3 * EI) / 4000 ** 3;

// ======================================================================= TM5 fixed-base portal in the X-Z plane and in the Y-Z plane (axis orientation)
function tm5(plane: 'XZ' | 'YZ', second: boolean, vertical: number, shear = true) {
  const h = 4000, Lb = 6000, H = 5e3;
  const at = (a: number, z: number) => (plane === 'XZ' ? { x: a, y: 0, z } : { x: 0, y: a, z });
  const m: FrameModel = {
    nodes: [{ id: 1, ...at(0, 0) }, { id: 2, ...at(0, h) }, { id: 3, ...at(Lb, h) }, { id: 4, ...at(Lb, 0) }], materials: mats, sections: { S: shear ? BOX : noShear(BOX) },
    members: [{ id: 1, type: 'beam', n1: 1, n2: 2, section: 'S', material: 'S', divisions: 4 }, { id: 2, type: 'beam', n1: 2, n2: 3, section: 'S', material: 'S', divisions: 4 }, { id: 3, type: 'beam', n1: 4, n2: 3, section: 'S', material: 'S', divisions: 4 }],
    supports: [{ node: 1, fixed: F6 }, { node: 4, fixed: F6 }],
  };
  const hd: [number, number, number, number, number, number] = plane === 'XZ' ? [H, 0, -vertical, 0, 0, 0] : [0, H, -vertical, 0, 0, 0];
  const r = solveFrame({ prepared: prepare(m), combo: [{ lc: lc([{ node: 2, f: hd }, { node: 3, f: [0, 0, -vertical, 0, 0, 0] }]), factor: 1 }], options: opts({ secondOrder: second }) });
  const u = r.displacement.get(2)!, R = r.reactions.get(1)!;
  return { sway: plane === 'XZ' ? u[0] : u[1], Mbase: Math.max(Math.abs(R[3]), Math.abs(R[4])), conv: r.converged };
}
const h5 = 4000, Lb5 = 6000, kk5 = (BOX.Iy * h5) / (BOX.Iy * Lb5), cf5 = (5e3 * h5 ** 3 * (2 + 3 * kk5)) / (12 * EI * (1 + 6 * kk5));

// ======================================================================= output
p('# Reference values for the RSTAB test models (generated by `scripts/rstab/test-models.ts`)');
p();
p(`Units N, mm. Section 150x150x5 box: A = ${BOX.A} mm², I = ${BOX.Iy} mm⁴, J = ${BOX.J} mm⁴, A_y = A_z = ${BOX.Ay} mm²; E = ${E}, G = ${G} N/mm². EI = ${EI.toExponential(5)} N·mm². "Solver" = the second-order frame solver of this application (Theory II). Closed form = Euler-Bernoulli beam-column solution (Timoshenko & Gere, Theory of Elastic Stability, beam-columns; Chen & Lui, Structural Stability); the solver "no shear" columns use the same assumptions.`);
p();
p('## TM1 cantilever column (L = 4000 mm, fixed base, free top; P = 130 kN compression, H = 2 kN at the top)');
p(`P_cr (cantilever Euler) = ${f(Pcr1 / 1e3, 2)} kN, P/P_cr = ${f(P1 / Pcr1, 4)}, k = √(P/EI) = ${k1.toExponential(5)} 1/mm, kL = ${f(k1 * L1, 5)}`);
p();
p('| Quantity | Closed form | Solver, 1 element, no shear | 2 el. | 4 el. | 16 el. | 4 el., with shear |');
p('|---|---|---|---|---|---|---|');
const a1 = [1, 2, 4, 16].map((d) => tm1(d, false, false, P1, H1)), a1s = tm1(4, true, false, P1, H1);
const b1 = [1, 2, 4, 16].map((d) => tm1(d, false, true, P1, H1)), b1s = tm1(4, true, true, P1, H1);
p(`| First order: top displacement u_x [mm] | ${f(cf1.ux1)} | ${a1.map((x) => f(x.ux)).join(' | ')} | ${f(a1s.ux)} |`);
p(`| First order: base moment [kN·m] | ${f(cf1.M1 / 1e6)} | ${a1.map((x) => f(x.Mbase / 1e6)).join(' | ')} | ${f(a1s.Mbase / 1e6)} |`);
p(`| Second order: top displacement u_x [mm] | ${f(cf1.ux2)} | ${b1.map((x) => f(x.ux)).join(' | ')} | ${f(b1s.ux)} |`);
p(`| Second order: base moment [kN·m] | ${f(cf1.M2 / 1e6)} | ${b1.map((x) => f(x.Mbase / 1e6)).join(' | ')} | ${f(b1s.Mbase / 1e6)} |`);
p(`| Amplification of the top displacement (2nd / 1st) | ${f(cf1.ux2 / cf1.ux1)} | ${b1.map((x, i) => f(x.ux / a1[i].ux)).join(' | ')} | ${f(b1s.ux / a1s.ux)} |`);
p();
p('Formulas: first order u = H L³/(3EI), M = H L. Second order u = (H/(P k)) (tan kL − kL), M_base = (H/k) tan kL. TM2 (RSTAB imperfection): H = φ0 P = P/200 = 0.65 kN at the top only (the equal and opposite end force of RSTAB\'s equivalent loads acts at the support), values by the same formulas with H = 0.65 kN:');
const imp = { H: P1 / 200 }, kI = k1;
p(`closed form second order u = ${f((imp.H / (P1 * kI)) * (Math.tan(kI * L1) - kI * L1))} mm, M_base = ${f((imp.H / kI) * Math.tan(kI * L1) / 1e6)} kN·m; solver (4 el., no shear) u = ${f(tm1(4, false, true, P1, imp.H).ux)} mm, M_base = ${f(tm1(4, false, true, P1, imp.H).Mbase / 1e6)} kN·m.`);
p();
p('## TM3 simply supported beam-column (L = 4000 mm, UDL q = 5 N/mm downward, P = 0.5 P_E = ' + f(P3 / 1e3, 2) + ' kN compression)');
p(`P_E = π²EI/L² = ${f(PE3 / 1e3, 2)} kN; u = kL/2 = ${f(u3, 5)}`);
p();
p('| Quantity | Closed form | Solver 1 el. | 2 el. | 4 el. | 8 el. |  (first-order solver rows: see finding F-1)');
p('|---|---|---|---|---|---|');
const d3a = [1, 2, 4, 8].map((d) => tm3(d, false, false, P3, q3)), d3b = [1, 2, 4, 8].map((d) => tm3(d, false, true, P3, q3));
const w3 = (r: ReturnType<typeof tm3>) => { let w = 0; for (const [, u] of r.nodes) w = Math.max(w, Math.abs(u[2])); return w; };
p(`| First order: maximum moment [kN·m] | ${f(cf3.M1 / 1e6)} | ${d3a.map((x) => f(x.Mmax / 1e6)).join(' | ')} |`);
p(`| Second order: maximum moment [kN·m] | ${f(cf3.M2 / 1e6)} | ${d3b.map((x) => f(x.Mmax / 1e6)).join(' | ')} |`);
p(`| Second order: maximum moment / first-order moment | ${f(cf3.M2 / cf3.M1)} | ${d3b.map((x, i) => f(x.Mmax / d3a[i].Mmax)).join(' | ')} |`);
p();
p('Formulas: first order M = q L²/8; second order M_max = (q/k²)(sec(kL/2) − 1), k = √(P/EI). (The solver table reports the moment of the element stations; with 1 element only the end values exist, so the mid-span moment appears from 2 elements on. RSTAB "second order P-Δ" is expected to need member divisions to reproduce P-δ: this model exists to show it.)');
p();
p('## TM4 braced bay: two cantilever columns, pinned beam, one N-only (tension-only) diagonal 2L 50x50x5');
p(`Geometry: columns at x = 0 and x = 4000, height 4000; pinned beam (rotations about local y, z released at both ends); H = 6 kN horizontal at the top-left node; 130 kN vertical at each top node. Diagonal length ${f(Ld4, 1)} mm.`);
p(`First-order hand check (diagonal active): K = 2·3EI/h³ + E A cos²θ/L_d = ${f(Kc4, 3)} + ${f(K4, 3)} = ${f(Kc4 + K4, 3)} N/mm → u = H/K = ${f(6e3 / (Kc4 + K4))} mm; with the diagonal inactive u = H/(2·3EI/h³) = ${f(6e3 / Kc4)} mm.`);
p();
p('| Case | Solver u_x top-left [mm] | Axial force in the diagonal [kN] (tension +) | Meaning |');
p('|---|---|---|---|');
for (const [dir, P, to, so, label] of [
  [1, 0, true, false, 'A. no gravity, H toward +x, diagonal stretched (active), first order (hand check 0.3337 mm)'],
  [-1, 0, true, false, 'B. no gravity, H toward −x, diagonal compressed: N-only switches it off, first order (hand check 30.3234 mm)'],
  [-1, 0, false, false, 'B2. as B but the diagonal is an ordinary truss (acts in compression too), first order'],
  [1, 130e3, true, false, 'C. gravity 130 kN per column + H toward +x, first order (the diagonal is first compressed by the column shortening, so it is inactive until H stretches it)'],
  [1, 130e3, true, true, 'C2. same, second order'],
  [-1, 130e3, true, false, 'D. gravity + H toward −x, first order'],
  [-1, 130e3, true, true, 'D2. same, second order'],
] as const) {
  const r = tm4(dir, so, to, 'rising', P); p(`| ${label} | ${f(r.ux)} | ${f(r.N4 / 1e3, 3)} | ${r.conv ? 'converged' : 'NOT converged: ' + r.msg} |`);
}
p();
p('## TM5 fixed-base portal (columns 4000 mm, beam 6000 mm, all 150x150x5, rigid joints), H = 5 kN at the beam level, in the X-Z plane and in the Y-Z plane');
p(`First-order closed form (slope-deflection, antisymmetric sway): u = H h³ (2 + 3k) / (12 E I_c (1 + 6k)), k = I_b h /(I_c L) = ${f(kk5, 4)} → u = ${f(cf5)} mm.`);
p();
p('| Case | Sway [mm] | Largest base moment [kN·m] | Note |');
p('|---|---|---|---|');
p(`Closed form including the shear deformation of the two columns (each carries H/2): + (H/2) h /(G A_y) = ${f((5e3 / 2) * 4000 / (G * BOX.Ay))} mm → ${f(cf5 + (5e3 / 2) * 4000 / (G * BOX.Ay))} mm (the beam shear adds a little more).`);
for (const [pl, so, vert, label] of [['XZ', false, -1, 'X-Z plane, first order, H only, NO shear deformation (closed form 10.1078 mm)'],['XZ', false, 0, 'X-Z plane, first order, H only'], ['YZ', false, 0, 'Y-Z plane, first order, H only (must equal the X-Z result)'], ['XZ', true, 100e3, 'X-Z plane, second order, H and 100 kN on each beam end'], ['YZ', true, 100e3, 'Y-Z plane, second order (must equal the X-Z result)']] as const) {
  const r = tm5(pl, so, Math.max(vert, 0), vert >= 0); p(`| ${label} | ${f(r.sway)} | ${f(r.Mbase / 1e6)} | ${r.conv ? 'converged' : 'NOT converged'} |`);
}
console.log(out.join('\n'));
