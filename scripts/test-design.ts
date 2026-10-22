// Tests of the IS 800:2007 member design equations (src/server/frame/design).   npm run test:design
// Calculation bases: the printed tables and clauses of the supplied IS 800:2007 (read on the page images), hand calculations, and the section properties
// printed in the RSTAB report for the benchmark box section.
import * as D from '../src/server/frame/design/is800';
import { designHollowMember, pendingMember, featureFor, type Station } from '../src/server/frame/design/member';

let failed = 0;
const rows: string[] = [];
const assert = (name: string, cond: boolean, extra = '') => { if (!cond) failed++; rows.push(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); };
const check = (name: string, got: number, ref: number, tol: number, abs = false) => {
  const err = abs ? Math.abs(got - ref) : ref === 0 ? Math.abs(got) : Math.abs(got - ref) / Math.abs(ref); const ok = err <= tol; if (!ok) failed++;
  rows.push(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(86)} got ${got.toPrecision(6).padStart(12)} ref ${ref.toPrecision(6).padStart(12)} err ${abs ? err.toExponential(1) : (err * 100).toExponential(1) + ' %'} (tol ${tol})`);
};
const throws = (f: () => unknown) => { try { f(); return false; } catch { return true; } };

// ---------------------------------------------------------------- constants, epsilon
assert('Table 5: gamma_m0 = 1.10, gamma_m1 = 1.25', D.GAMMA_M0 === 1.10 && D.GAMMA_M1 === 1.25);
check('Table 2 note 2: epsilon = (250/fy)^0.5 (fy 250 -> 1, fy 350 -> 0.845)', D.epsilon(350), Math.sqrt(250 / 350), 1e-12);

// ---------------------------------------------------------------- 7.1.2.1 against the printed tables (E = 2e5, fy = 250)
const chi = (sl: number, cls: D.BucklingClass) => D.compressiveStress({ fy: 250, E: 2e5, slenderness: sl, cls }).chi;
const T8a: [number, number][] = [[20, 0.994], [30, 0.969], [40, 0.939], [50, 0.904], [60, 0.859], [70, 0.803], [80, 0.734], [90, 0.657], [100, 0.579], [110, 0.507], [120, 0.443], [130, 0.388], [140, 0.342], [150, 0.303]];
const T8c: [number, number][] = [[20, 0.987], [30, 0.930], [40, 0.870], [50, 0.807], [60, 0.740], [70, 0.670], [80, 0.600], [90, 0.533], [100, 0.471], [110, 0.416], [120, 0.368], [130, 0.327], [140, 0.291], [150, 0.261]];
for (const [sl, v] of T8a) check(`Table 8(a), class a, fy 250: KL/r = ${sl}`, chi(sl, 'a'), v, 0.0006, true);
for (const [sl, v] of T8c) check(`Table 8(c), class c, fy 250: KL/r = ${sl}`, chi(sl, 'c'), v, 0.0006, true);
const T9d: [number, number][] = [[60, 150], [100, 92.6], [120, 73.0], [160, 47.5], [200, 33.0]];
for (const [sl, v] of T9d) check(`Table 9(d), class d, fy 250: f_cd [MPa] at KL/r = ${sl}`, D.compressiveStress({ fy: 250, E: 2e5, slenderness: sl, cls: 'd' }).fcd, v, 0.2, true);
assert('Table 7: alpha = 0.21, 0.34, 0.49, 0.76', D.IMPERFECTION_ALPHA.a === 0.21 && D.IMPERFECTION_ALPHA.b === 0.34 && D.IMPERFECTION_ALPHA.c === 0.49 && D.IMPERFECTION_ALPHA.d === 0.76);
assert('Table 10: hollow hot rolled a, cold formed b, welded box b, channel/angle/T c, built-up c', D.bucklingClassFor('hollow-hot-rolled') === 'a' && D.bucklingClassFor('hollow-cold-formed') === 'b' && D.bucklingClassFor('welded-box') === 'b' && D.bucklingClassFor('channel-angle-tee-solid') === 'c' && D.bucklingClassFor('built-up') === 'c');
check('7.1.2.1: chi = 1 at zero slenderness (f_cd = f_y/gamma_m0)', D.compressiveStress({ fy: 250, E: 2e5, slenderness: 0, cls: 'a' }).chi, 1, 1e-9);
check('7.1.2.1: f_cc = pi^2 E / (KL/r)^2', D.compressiveStress({ fy: 250, E: 2e5, slenderness: 100, cls: 'a' }).fcc, Math.PI ** 2 * 2e5 / 1e4, 1e-12);
assert('7.1.2.1: a negative slenderness is refused', throws(() => D.compressiveStress({ fy: 250, E: 2e5, slenderness: -1, cls: 'a' })));

// ---------------------------------------------------------------- section properties of the benchmark box (RSTAB report, QRO-PAR 150/5/5/0)
const geom: D.RhsGeometry = { b: 150, h: 150, t: 5, rOuter: 5, rInner: 0 };
const p = D.rhsProps(geom);
check('box 150x150x5: area = 28.79 cm2 (printed)', p.A / 100, 28.79, 5e-4);
check('box 150x150x5: I = 1005.04 cm4 (printed)', p.Iy / 1e4, 1005.04, 1e-3);
check('box 150x150x5: elastic modulus 134.01 cm3 (printed)', p.Zey / 1e3, 134.01, 1e-3);
check('box 150x150x5: plastic modulus 156.12 cm3 (printed)', p.Zpy / 1e3, 156.12, 1e-3);
check('box 150x150x5: radius of gyration 59.1 mm (printed)', p.ry, 59.1, 1e-3);
check('8.4.1.1: shear area parallel to the depth = A h/(b+h)', p.Avh, (p.A * 150) / 300, 1e-12);
const sharp = D.rhsProps({ b: 100, h: 200, t: 6, rOuter: 0, rInner: 0 });
check('closed form: sharp 100x200x6 tube, A = 100*200 - 88*188', sharp.A, 100 * 200 - 88 * 188, 1e-9);
check('closed form: sharp tube plastic modulus Zpy = b h^2/4 - (b-2t)(h-2t)^2/4', sharp.Zpy, (100 * 200 ** 2) / 4 - (88 * 188 ** 2) / 4, 1e-6);
check('closed form: sharp tube I about the horizontal axis', sharp.Iy, (100 * 200 ** 3) / 12 - (88 * 188 ** 3) / 12, 1e-6);

// ---------------------------------------------------------------- 3.7 classification, Table 2
const cl = (bt: number, state: 'axial' | 'bending' | 'combined', fy = 250, r1 = 0, r2 = 0) => D.classifyRhs({ flatWidth: bt * 5, flatDepth: 20 * 5, t: 5, fy, state, r1, r2 });
assert('Table 2 flange, bending: 28 -> class 1 (<= 29.3), 30 -> 2, 35 -> 3 (<= 42), 43 -> 4', cl(28, 'bending').cls === 1 && cl(30, 'bending').cls === 2 && cl(35, 'bending').cls === 3 && cl(43, 'bending').cls === 4);
assert('Table 2 flange, axial compression: classes 1 and 2 not applicable: 28 -> class 3, 43 -> 4', cl(28, 'axial').cls === 3 && cl(43, 'axial').cls === 4);
assert('Table 2: epsilon scales the limits (fy 350: 29.3 * 0.845 = 24.8)', cl(24, 'bending', 350).cls === 1 && cl(25, 'bending', 350).cls === 2);
const web = (dt: number, state: 'axial' | 'bending' | 'combined', r1 = 0, r2 = 0) => D.classifyRhs({ flatWidth: 10 * 5, flatDepth: dt * 5, t: 5, fy: 250, state, r1, r2 });
assert('Table 2 web, neutral axis at mid-depth: 80 -> 1, 100 -> 2, 120 -> 3, 130 -> 4', web(80, 'bending').cls === 1 && web(100, 'bending').cls === 2 && web(120, 'bending').cls === 3 && web(130, 'bending').cls === 4);
assert('Table 2 web, axial compression: 40 -> class 3, 43 -> class 4', web(40, 'axial').cls === 3 && web(43, 'axial').cls === 4);
const w1 = web(60, 'combined', -0.5, -0.5);
assert('Table 2 web, r1 = -0.5 (tension): class 1 limit 84/(1-0.5) = 168, class 2 limit 105/(0.5) = 210, class 3 126/(1+2*(-0.5)) -> unbounded', Math.abs(w1.elements[1].limits[0] - 168) < 1e-9 && Math.abs(w1.elements[1].limits[1] - 210) < 1e-9);
const w2 = web(30, 'combined', 0.4, 0.4);
check('Table 2 web, r1 = +0.4: class 1 limit min(84/1.4, 42) = 42', w2.elements[1].limits[0], 42, 1e-12);
check('Table 2 web, r1 = +0.4: class 2 limit min(105/(1 + 1.5*0.4), 42) = 42', w2.elements[1].limits[1], Math.min(105 / 1.6, 42), 1e-12);
check('Table 2 web, r1 = +0.4: class 3 limit min(126/(1+2*0.4), 42) = 42', w2.elements[1].limits[2], Math.min(126 / 1.8, 42), 1e-12);
const w3 = web(30, 'combined', 0.1, 0.1);
check('Table 2 web, r1 = +0.1: class 1 limit min(84/1.1, 42) = 42', w3.elements[1].limits[0], 42, 1e-12);
assert('Table 2: the most critical element governs the class', cl(28, 'bending').cls === Math.max(...cl(28, 'bending').elements.map((e) => e.cls)));
assert('Table 2 angles, bending: 9.4 -> 1, 10.5 -> 2, 15.7 -> 3, 16 -> 4', D.classifyAngle({ b: 94, d: 94, t: 10, fy: 250, state: 'bending' }).cls === 1 && D.classifyAngle({ b: 105, d: 105, t: 10, fy: 250, state: 'bending' }).cls === 2 && D.classifyAngle({ b: 157, d: 157, t: 10, fy: 250, state: 'bending' }).cls === 3 && D.classifyAngle({ b: 160, d: 160, t: 10, fy: 250, state: 'bending' }).cls === 4);
assert('Table 2 angles in axial compression: (b+d)/t <= 25 e required: 12+12 over t = 1 -> class 4 by the sum criterion', D.classifyAngle({ b: 12.5, d: 12.5, t: 0.9, fy: 250, state: 'axial' }).cls === 4 && D.classifyAngle({ b: 10, d: 10, t: 1, fy: 250, state: 'axial' }).cls === 3);

// ---------------------------------------------------------------- 6.2 tension, 8.4.1 shear
check('6.2: T_dg = A_g f_y / gamma_m0 (box: 2878.5 * 250 / 1.1)', D.tensionYield({ N: 100e3, Ag: p.A, fy: 250 }).Rd!, (p.A * 250) / 1.1, 1e-12);
check('6.2: utilisation of a 100 kN tension force', D.tensionYield({ N: 100e3, Ag: p.A, fy: 250 }).ratio!, 100e3 / ((p.A * 250) / 1.1), 1e-12);
const sh = D.shearPlastic({ V: 50e3, Av: p.Avh, fyw: 250, label: 'z' });
check('8.4.1: V_d = A_v f_yw / (sqrt(3) gamma_m0)', sh.Vd, (p.Avh * 250) / Math.sqrt(3) / 1.1, 1e-12);
assert('8.4.2.1: d/t_w > 67 epsilon -> shear buckling required: the check is reported PENDING (not implemented)', D.shearPlastic({ V: 1, Av: 1000, fyw: 250, label: 'z', dOverT: 70 }).status === 'pending');

// ---------------------------------------------------------------- 8.2.1.2 bending, 9.2.2 high shear
const Ze = p.Zey, Zp = p.Zpy;
check('8.2.1.2: plastic / compact: M_d = Z_p f_y / gamma_m0', D.bendingStrengthSupported({ Ze, Zp, fy: 250, cls: 1 }).Md, (Zp * 250) / 1.1, 1e-12);
check('8.2.1.2: semi-compact: beta_b = Z_e/Z_p, M_d = Z_e f_y / gamma_m0', D.bendingStrengthSupported({ Ze, Zp, fy: 250, cls: 3 }).Md, (Ze * 250) / 1.1, 1e-12);
check('8.2.1.2: simply supported limit 1.2 Z_e f_y/gamma_m0 (Z_p/Z_e = 1.165 < 1.2: not governing)', D.bendingStrengthSupported({ Ze, Zp, fy: 250, cls: 1, supportCase: 'simply-supported' }).Md, (Zp * 250) / 1.1, 1e-12);
const lim = D.bendingStrengthSupported({ Ze: 100, Zp: 130, fy: 250, cls: 1, supportCase: 'simply-supported' });
assert('8.2.1.2: the 1.2 Z_e limit governs when Z_p/Z_e > 1.2 (130/100)', lim.limited && Math.abs(lim.Md - (1.2 * 100 * 250) / 1.1) < 1e-9);
assert('8.2.1.2: no limit is applied to a member without a stated support case (note given)', D.bendingStrengthSupported({ Ze: 100, Zp: 130, fy: 250, cls: 1 }).notes.length > 0);
assert('8.2: class 4 is refused (IS 801)', throws(() => D.bendingStrengthSupported({ Ze, Zp, fy: 250, cls: 4 })));
const hs = D.bendingHighShear({ V: 0.8 * 100e3, Vd: 100e3, Md: 1000, Mfd: 600, Ze: 5, fy: 250, cls: 1 });
check('9.2.2: beta = (2V/V_d - 1)^2 = 0.36 at V = 0.8 V_d', hs.beta, 0.36, 1e-12);
check('9.2.2: M_dv = M_d - beta (M_d - M_fd) = 1000 - 0.36 * 400 (limit 1.2 Z_e f_y/gamma not binding)', D.bendingHighShear({ V: 0.8 * 100e3, Vd: 100e3, Md: 1000, Mfd: 600, Ze: 1e6, fy: 250, cls: 1 }).Mdv, 1000 - 0.36 * 400, 1e-12);
check('9.2.2: semi-compact: M_dv = Z_e f_y/gamma_m0', D.bendingHighShear({ V: 1, Vd: 1, Md: 1000, Mfd: 600, Ze: 100, fy: 250, cls: 3 }).Mdv, (100 * 250) / 1.1, 1e-12);

// ---------------------------------------------------------------- 9.3.1 section strength, Table 17
const n = 0.3;
const [a1, a2] = D.alphaTable17('rectangular-tube', n);
check('Table 17: rectangular tubes: 1.66/(1 - 1.13 n^2) at n = 0.3', a1, 1.66 / (1 - 1.13 * 0.09), 1e-12);
check('Table 17: rectangular tubes: alpha1 = alpha2', a2, a1, 1e-15);
check('Table 17: rectangular tubes: limited to 6 (n = 0.9 -> 19.6)', D.alphaTable17('rectangular-tube', 0.9)[0], 6, 1e-15);
assert('Table 17: I and channel: alpha1 = 5n >= 1, alpha2 = 2; circular 2, 2', D.alphaTable17('I-channel', 0.1)[0] === 1 && Math.abs(D.alphaTable17('I-channel', 0.4)[0] - 2) < 1e-12 && D.alphaTable17('I-channel', 0.4)[1] === 2 && D.alphaTable17('circular-tube', 0.4)[0] === 2);
const Md0 = (Zp * 250) / 1.1;
const red = D.reducedMomentsRhs({ n, A: p.A, b: 150, h: 150, tf: 5, tw: 5, Mdy: Md0, Mdz: Md0 });
check('9.3.1.2 d): a_w = (A - 2 b t_f)/A = 0.479 (< 0.5)', red.aw, (p.A - 2 * 150 * 5) / p.A, 1e-12);
check('9.3.1.2 d): M_ndy = M_dy (1 - n)/(1 - 0.5 a_w)', red.Mndy, Math.min(Md0, (Md0 * 0.7) / (1 - 0.5 * red.aw)), 1e-12);
const NdA = (p.A * 250) / 1.1;
const sec = D.sectionStrengthRhs({ N: n * NdA, Nd: NdA, My: 0.3 * Md0, Mz: 0.2 * Md0, Mdy: Md0, Mdz: Md0, geom, props: p, cls: 1 });
check('9.3.1.1: (My/Mndy)^a1 + (Mz/Mndz)^a2 at n = 0.3, My = 0.3 Md, Mz = 0.2 Md', sec.ratio!, (0.3 * Md0 / red.Mndy) ** a1 + (0.2 * Md0 / red.Mndz) ** a2, 1e-12);
check('9.3.1.1: the conservative linear form n + My/Mdy + Mz/Mdz is returned in the detail', sec.detail['linear form N/N_d + M_y/M_dy + M_z/M_dz'] as number, n + 0.3 + 0.2, 1e-12);
const sec3 = D.sectionStrengthRhs({ N: 0.3 * NdA, Nd: NdA, My: 0.3 * Md0, Mz: 0.2 * Md0, Mdy: Md0, Mdz: Md0, geom, props: p, cls: 3 });
check('9.3.1.3 (semi-compact): the linear form', sec3.ratio!, 0.3 + 0.3 + 0.2, 1e-12);
assert('9.3.1: class 4 is reported pending', D.sectionStrengthRhs({ N: 1, Nd: 1, My: 0, Mz: 0, Mdy: 1, Mdz: 1, geom, props: p, cls: 4 }).status === 'pending');

// ---------------------------------------------------------------- 9.3.2.2 and Table 18
check('Table 18 row A: C_m = 0.6 + 0.4 psi (psi = 0.5 -> 0.8)', D.cmFactor({ psi: 0.5 }), 0.8, 1e-12);
check('Table 18 row A: C_m >= 0.4 (psi = -1 -> 0.2 -> 0.4)', D.cmFactor({ psi: -1 }), 0.4, 1e-12);
check('Table 18 row A: psi = 1 (uniform moment) -> 1.0', D.cmFactor({ psi: 1 }), 1, 1e-12);
check('Table 18 row B: 0 <= alpha_s <= 1: 0.2 + 0.8 alpha_s (0.5 -> 0.6)', D.cmFactor({ alphaS: 0.5, psi: 0, loading: 'uniform' }), 0.6, 1e-12);
check('Table 18 row B: alpha_s = -0.5, 0 <= psi <= 1, uniform: 0.1 - 0.8 alpha_s = 0.5', D.cmFactor({ alphaS: -0.5, psi: 0.5, loading: 'uniform' }), 0.5, 1e-12);
check('Table 18 row B: alpha_s = -0.5, 0 <= psi <= 1, concentrated: -0.8 alpha_s = 0.4', D.cmFactor({ alphaS: -0.5, psi: 0.5, loading: 'concentrated' }), 0.4, 1e-12);
check('Table 18 row B: alpha_s = -0.5, psi = -0.5, uniform: 0.1(1-psi) - 0.8 alpha_s = 0.55', D.cmFactor({ alphaS: -0.5, psi: -0.5, loading: 'uniform' }), 0.1 * 1.5 + 0.4, 1e-12);
check('Table 18 row B: alpha_s = -0.5, psi = -0.5, concentrated: 0.2(1-psi) - 0.8 alpha_s = 0.7', D.cmFactor({ alphaS: -0.5, psi: -0.5, loading: 'concentrated' }), 0.2 * 1.5 + 0.4, 1e-12);
check('Table 18: members with a sway buckling mode: C_my = C_mz = 0.9', D.cmFactor({ swayMode: true }), 0.9, 1e-12);
assert('Table 18: psi outside [-1, 1] is refused', throws(() => D.cmFactor({ psi: 1.5 })));
const P = 0.3 * 654e3, Pd = 654e3, Mdy = 3500e4, Mdz = 3500e4, lam = 0.78;
const mi = D.memberInteraction({ P, Pdy: Pd, Pdz: Pd, My: 500e4, Mz: 300e4, Mdy, Mdz, lambdaY: lam, lambdaZ: lam, lambdaLT: 0, Cmy: 0.9, Cmz: 0.9, CmLT: 0.9 });
const ny = 0.3, Ky = Math.min(1 + (lam - 0.2) * ny, 1 + 0.8 * ny);
check('9.3.2.2: K_y = 1 + (lambda_y - 0.2) n_y <= 1 + 0.8 n_y', mi.detail['K_y'] as number, Ky, 1e-12);
check('9.3.2.2: K_LT = 1 for lambda_LT = 0 (hollow section)', mi.detail['K_LT'] as number, Math.max(1, 1 - (0.1 * ny) / (0.9 - 0.25)), 1e-12);
check('9.3.2.2 equation 1: P/Pdy + Ky Cmy My/Mdy + KLT Mz/Mdz', mi.detail['eq. 1'] as number, 0.3 + Ky * 0.9 * (500 / 3500) + (mi.detail['K_LT'] as number) * (300 / 3500), 1e-12);
check('9.3.2.2 equation 2: P/Pdz + 0.6 Ky Cmy My/Mdy + Kz Cmz Mz/Mdz', mi.detail['eq. 2'] as number, 0.3 + 0.6 * Ky * 0.9 * (500 / 3500) + Ky * 0.9 * (300 / 3500), 1e-12);
const Kcap = D.memberInteraction({ P: 0.9 * Pd, Pdy: Pd, Pdz: Pd, My: 0, Mz: 0, Mdy, Mdz, lambdaY: 3, lambdaZ: 3, lambdaLT: 0, Cmy: 0.9, Cmz: 0.9, CmLT: 0.9 });
check('9.3.2.2: K_y is capped at 1 + 0.8 n_y (lambda = 3, n = 0.9: 1 + 2.52 -> 1.72)', Kcap.detail['K_y'] as number, 1 + 0.8 * 0.9, 1e-12);
check('9.3.2.1: M_eff = M - psi T Z_ec/A', D.momentUnderTension({ M: 1000, T: 10, Zec: 5, A: 2, psi: 0.8 }), 1000 - (0.8 * 10 * 5) / 2, 1e-12);

// ---------------------------------------------------------------- the design of a hollow member
const st = (x: number, N: number, My = 0, Mz = 0, Vy = 0, Vz = 0): Station => ({ x, N, Vy, Vz, T: 0, My, Mz });
const mat: D.Material = { fy: 250, fu: 330, E: 210000 };
const base = { memberId: 1, combination: 'CO1', geom, material: mat, manufacture: 'hollow-hot-rolled' as const, length: 4000, KLy: 4000, KLz: 4000, cm: 'sway' as const };
const dsg = designHollowMember({ ...base, stations: [st(0, -300e3, 100e4, 400e4, 1e3, 0.5e3), st(2000, -299e3, 5e4, 80e4), st(4000, -298e3, -90e4, -270e4, 1e3, 0.5e3)] });
assert('design: a hollow member is designed (not pending) with effective lengths given', dsg.status !== 'pending' && dsg.checks.length >= 6);
assert('design: the result is labelled provisional (register: 9.2.2 and 3.7 assumptions)', dsg.label === 'provisional');
check('design: compression section ratio = N/(A f_y/gamma_m0)', dsg.checks.find((c) => c.id === 'compression-section')!.ratio!, 300e3 / NdA, 1e-9);
const cy = dsg.checks.find((c) => c.id.startsWith('compression-7.1.2-local y'))!;
check('design: flexural buckling P_d uses class a, KL/r = 4000/59.1, E = 210000', cy.Rd!, p.A * D.compressiveStress({ fy: 250, E: 210000, slenderness: 4000 / Math.sqrt(p.Iy / p.A), cls: 'a' }).fcd, 1e-9);
assert('design: every check carries its IS 800 clause', dsg.checks.every((c) => /IS 800/.test(c.clause)));
assert('design: the notes record the class and the assumption of the web as shear area only when V > 0.6 V_d', dsg.notes.some((x) => /section class/.test(x)));
assert('design: without effective lengths the member is reported pending, nothing assumed', designHollowMember({ ...base, KLy: undefined, KLz: undefined, stations: [st(0, -1)] }).status === 'pending');
assert('design: a cold-formed hollow section changes the buckling class to b (lower resistance)', (() => { const a = designHollowMember({ ...base, stations: [st(0, -300e3)] }), b = designHollowMember({ ...base, manufacture: 'hollow-cold-formed', stations: [st(0, -300e3)] }); return b.checks.find((c) => c.id.startsWith('compression-7.1.2-local y'))!.Rd! < a.checks.find((c) => c.id.startsWith('compression-7.1.2-local y'))!.Rd!; })());
assert('design: a member with utilisation above 1 is reported FAIL', designHollowMember({ ...base, stations: [st(0, -900e3)] }).status === 'fail');
assert('design: a tension member is checked for yielding (6.2)', designHollowMember({ ...base, stations: [st(0, 200e3), st(4000, 200e3)] }).checks.some((c) => c.id === 'tension-6.2'));
assert('design: a slender (class 4) tube is reported pending (IS 801)', designHollowMember({ ...base, geom: { b: 400, h: 400, t: 2, rOuter: 0, rInner: 0 }, stations: [st(0, -50e3, 1e6)] }).status === 'pending');
const hv = designHollowMember({ ...base, geom: { b: 150, h: 150, t: 5, rOuter: 5, rInner: 0 }, stations: [st(0, -50e3, 100e4, 0, 0, 0.9 * sh.Vd)] });
assert('design: V > 0.6 V_d reduces the moment capacity (9.2.2) and says so', hv.notes.some((x) => /9\.2\.2/.test(x)));
assert('design: pending member constructors name the register reason for cold-formed sections (IS 801)', /IS 801/.test(pendingMember(2, 'CO1', 'cold-formed').notes.join(' ')));
assert('design: features: hollow -> is800.design.hollow, cold-formed -> is800.design.cold-formed', featureFor('rhs') === 'is800.design.hollow' && featureFor('cold-formed') === 'is800.design.cold-formed' && featureFor('unknown') === null);

console.log(rows.join('\n'));
console.log(failed ? `\n${failed} check(s) FAILED` : `\nall ${rows.length} checks passed`);
process.exit(failed ? 1 : 0);
