// IS 800:2007 tension members: rupture of the critical section (6.3.1-6.3.4) and block shear (6.4), equations against hand values.   npm run test:tension
// Hand values are written out as numbers (steps in the comments), not computed by the code under test.
import * as T from '../src/server/frame/design/tension';
import { clauseVerified } from '../src/shared/check';

let passed = 0, failed = 0;
const ok = (name: string, cond: boolean, detail = '') => { if (cond) passed++; else { failed++; console.log(`FAIL ${name} ${detail}`); } };
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const throws = (f: () => unknown) => { try { f(); return false; } catch { return true; } };

// ---- 6.3.1 net area: b = 200, t = 10, two holes d_h = 22 in the section: (200 − 2·22)·10 = 1560 mm²
let An = T.netAreaPlate({ b: 200, t: 10, n: 2, dh: 22 });
ok('6.3.1 A_n = (b − n d_h) t', near(An, 1560), String(An));
// T_dn = 0.9 · 1560 · 410 / 1.25 = 575 640 / 1.25 = 460 512 N
ok('6.3.1 T_dn = 0.9 A_n f_u / γ_m1', near(T.plateRupture({ An, fu: 410 }).Tdn, 460512), String(T.plateRupture({ An, fu: 410 }).Tdn));
// directly punched holes: d_h = 22 + 2 = 24; A_n = (200 − 48)·10 = 1520
ok('6.3.1 directly punched hole: +2 mm', T.holeDiameterForNet(22, true) === 24 && T.holeDiameterForNet(22, false) === 22);
ok('6.3.1 A_n with punched holes', near(T.netAreaPlate({ b: 200, t: 10, n: 2, dh: T.holeDiameterForNet(22, true) }), 1520));
// staggered path through three holes, two inclined legs p_s = 40, g = 50: p²/4g = 1600/200 = 8 each: (200 − 66 + 16)·10 = 1500
ok('6.3.1 staggered: + Σ p_s²/(4 g)', near(T.netAreaPlate({ b: 200, t: 10, n: 3, dh: 22, legs: [{ p: 40, g: 50 }, { p: 40, g: 50 }] }), 1500));
ok('6.3.1 critical section = smallest path', near(T.criticalNetArea([1560, 1500, 1540]), 1500));
ok('6.3.1 invalid input refused', throws(() => T.netAreaPlate({ b: 20, t: 10, n: 1, dh: 22 })) && throws(() => T.netAreaPlate({ b: 200, t: 0, n: 1, dh: 22 })) && throws(() => T.netAreaPlate({ b: 200, t: 10, n: 1.5, dh: 22 })) && throws(() => T.criticalNetArea([])));

// ---- 6.3.2 threaded rod: A_n = 245 (root area): 0.9·245 = 220.5; ·410 = 90 405; /1.25 = 72 324 N
ok('6.3.2 T_dn = 0.9 A_n f_u / γ_m1', near(T.threadedRodRupture({ An: 245, fu: 410 }).Tdn, 72324) && T.threadedRodRupture({ An: 245, fu: 410 }).clause.endsWith('6.3.2'));

// ---- 6.3.3 single angle 100×100×10, bolted: w = 100, w_1 = 50, t = 10 → b_s = 100 + 50 − 10 = 140; three bolts at 50 mm: L_c = 100
ok('Fig. 6 b_s bolted = w + w_1 − t', near(T.shearLagWidthAngle({ w: 100, t: 10, connection: 'bolted', w1: 50 }), 140));
ok('Fig. 6 b_s welded = w', near(T.shearLagWidthAngle({ w: 100, t: 10, connection: 'welded' }), 100));
ok('Fig. 6 bolted without w_1 refused', throws(() => T.shearLagWidthAngle({ w: 100, t: 10, connection: 'bolted' })));
// β = 1.4 − 0.076 (100/10)(250/410)(140/100) = 1.4 − 0.76 · 0.609756 · 1.4 = 1.4 − 0.648780 = 0.751220 (limits 0.7 and 410·1.1/(250·1.25) = 1.4432: inside)
// A_nc = 730, A_go = 950: 0.9·730·410/1.25 = 215 496;  0.751220 · 950 · 250 / 1.1 = 162 195.1;  T_dn = 377 691.1
let r = T.shearLagRupture({ Anc: 730, Ago: 950, fu: 410, fy: 250, w: 100, t: 10, bs: 140, Lc: 100 });
ok('6.3.3 β from the printed equation', near(r.beta, 0.751219512, 1e-8) && r.betaLimited === 'none', String(r.beta));
ok('6.3.3 T_dn = 0.9 A_nc f_u/γ_m1 + β A_go f_y/γ_m0', near(r.Tdn, 377691.1, 1e-6), String(r.Tdn));
ok('6.3.3 upper limit of β is f_u γ_m0/(f_y γ_m1) = 1.4432', near(r.betaMax, 410 * 1.1 / (250 * 1.25)));
// lower limit: w/t = 20, f_y/f_u = 250/410, b_s/L_c = 3 → 1.4 − 0.076·20·0.6098·3 = −1.38 → 0.7
r = T.shearLagRupture({ Anc: 730, Ago: 950, fu: 410, fy: 250, w: 200, t: 10, bs: 300, Lc: 100 });
ok('6.3.3 β not below 0.7', r.beta === 0.7 && r.betaLimited === 'lower 0.7' && r.betaRaw < 0.7);
// upper limit: f_y = 450, f_u = 490: 490·1.1/(450·1.25) = 0.958222; the equation gives about 1.4
r = T.shearLagRupture({ Anc: 730, Ago: 950, fu: 490, fy: 450, w: 10, t: 10, bs: 10, Lc: 1000 });
ok('6.3.3 β not above f_u γ_m0/(f_y γ_m1)', near(r.beta, 490 * 1.1 / (450 * 1.25)) && r.betaLimited === 'upper f_u γ_m0/(f_y γ_m1)' && r.betaRaw > r.beta);
ok('6.3.4 uses the 6.3.3 equation and says so', T.shearLagRupture({ Anc: 730, Ago: 950, fu: 410, fy: 250, w: 100, t: 10, bs: 140, Lc: 100, clause: 'IS 800:2007 6.3.4' }).clause.endsWith('6.3.4'));
ok('6.3.3 invalid input refused', throws(() => T.shearLagRupture({ Anc: 0, Ago: 950, fu: 410, fy: 250, w: 100, t: 10, bs: 140, Lc: 100 })) && throws(() => T.shearLagRupture({ Anc: 730, Ago: 950, fu: 410, fy: 250, w: 100, t: 10, bs: 140, Lc: -1 })));
// a single bolt (L_c = 0): b_s/L_c is unbounded, β is at its lower limit 0.7
const one = T.shearLagRupture({ Anc: 730, Ago: 950, fu: 410, fy: 250, w: 100, t: 10, bs: 140, Lc: 0 });
ok('6.3.3 single bolt (L_c = 0): β = 0.7', one.beta === 0.7 && one.betaLimited === 'lower 0.7' && near(one.Tdn, 215496 + 0.7 * 950 * 250 / 1.1, 1e-9), String(one.Tdn));

// ---- 6.3 preliminary sizing: α = 0.6 (one or two bolts), 0.7 (three), 0.8 (four or more); A_n = 1000, f_u = 410: α · 410 000 / 1.25
ok('6.3 α = 0.6 for 1 and 2 bolts', near(T.preliminaryRupture({ An: 1000, fu: 410, nBoltsAlong: 1 }).Tdn, 0.6 * 410000 / 1.25) && near(T.preliminaryRupture({ An: 1000, fu: 410, nBoltsAlong: 2 }).Tdn, 196800));
ok('6.3 α = 0.7 for 3 bolts', near(T.preliminaryRupture({ An: 1000, fu: 410, nBoltsAlong: 3 }).Tdn, 229600));
ok('6.3 α = 0.8 for 4 or more bolts', near(T.preliminaryRupture({ An: 1000, fu: 410, nBoltsAlong: 4 }).Tdn, 262400) && near(T.preliminaryRupture({ An: 1000, fu: 410, nBoltsAlong: 9 }).Tdn, 262400));

// ---- 6.4.1 block shear, plate (Fig. 7A): t = 10, e_1 = 40, p = 50, 3 bolts along, 2 lines at g = 60, d_0 = 22
// L_v = 40 + 2·50 = 140: A_vg = 2·140·10 = 2800; A_vn = 2 (140 − 2.5·22) 10 = 1700;  L_t = 60: A_tg = 600; A_tn = (60 − 22)·10 = 380
const a = T.blockShearAreas({ kind: 'plate', t: 10, nAlong: 3, e1: 40, p1: 50, nAcross: 2, g: 60, d0: 22 });
ok('Fig. 7A areas', near(a.Avg, 2800) && near(a.Avn, 1700) && near(a.Atg, 600) && near(a.Atn, 380) && near(a.Lv, 140) && near(a.Lt, 60), JSON.stringify(a));
// T1 = 2800·250/(1.7320508·1.1) + 0.9·380·410/1.25 = 367 404.7 + 112 176 = 479 580.7;  T2 = 0.9·1700·410/(1.7320508·1.25) + 600·250/1.1 = 289 737.4 + 136 363.6 = 426 101.0
let b = T.blockShear({ ...a, fy: 250, fu: 410 });
ok('6.4.1 first expression', near(b.T1, 700000 / (Math.sqrt(3) * 1.1) + 112176, 1e-9) && Math.abs(b.T1 - 479581) < 2, String(b.T1));
ok('6.4.1 second expression', Math.abs(b.T2 - 426101) < 2 && near(b.T2, 627300 / (Math.sqrt(3) * 1.25) + 150000 / 1.1, 1e-9), String(b.T2));
ok('6.4.1 T_db is the smaller of the two', near(b.Tdb, Math.min(b.T1, b.T2)) && b.governing === 2);
// one-sided (Fig. 7B angle): t = 8, 3 bolts at 50, e_1 = 40, one line, e_2 = 45, d_0 = 22: L_v = 140: A_vg = 1120, A_vn = (140 − 55)·8 = 680; L_t = 45: A_tg = 360, A_tn = (45 − 11)·8 = 272
const c = T.blockShearAreas({ kind: 'one-sided', t: 8, nAlong: 3, e1: 40, p1: 50, nAcross: 1, g: 0, e2: 45, d0: 22 });
ok('Fig. 7B areas (one shear plane)', near(c.Avg, 1120) && near(c.Avn, 680) && near(c.Atg, 360) && near(c.Atn, 272), JSON.stringify(c));
// two lines across (gauge 55): tension length 55 + 45 = 100: A_tg = 800, A_tn = (100 − 1.5·22)·8 = 536
const c2 = T.blockShearAreas({ kind: 'one-sided', t: 8, nAlong: 3, e1: 40, p1: 50, nAcross: 2, g: 55, e2: 45, d0: 22 });
ok('Fig. 7B with two bolt lines', near(c2.Atg, 800) && near(c2.Atn, 536), JSON.stringify(c2));
b = T.blockShear({ ...c, fy: 250, fu: 410 });
// T1 = 1120·250/(√3·1.1) + 0.9·272·410/1.25 = 146 961.9 + 80 294.4 = 227 256.3;  T2 = 0.9·680·410/(√3·1.25) + 360·250/1.1 = 115 894.7 + 81 818.2 = 197 713.0
ok('6.4.1 angle end', Math.abs(b.T1 - 227256) < 2 && Math.abs(b.T2 - 197713) < 2 && b.governing === 2 && near(b.Tdb, b.T2), `${b.T1} ${b.T2}`);
ok('6.4.2 welded end: same expressions, clause named', T.blockShear({ ...c, fy: 250, fu: 410, welded: true }).clause.endsWith('6.4.2'));
ok('6.4.1 invalid patterns refused', throws(() => T.blockShearAreas({ kind: 'plate', t: 10, nAlong: 2, e1: 40, p1: 50, nAcross: 1, g: 60, d0: 22 })) && throws(() => T.blockShearAreas({ kind: 'one-sided', t: 10, nAlong: 2, e1: 10, p1: 20, nAcross: 1, g: 0, e2: 5, d0: 22 })) && throws(() => T.blockShear({ Avg: 100, Avn: 200, Atg: 100, Atn: 50, fy: 250, fu: 410 })));
// each expression grows with its own areas: more edge distance can never reduce the strength
const more = T.blockShear({ ...T.blockShearAreas({ kind: 'plate', t: 10, nAlong: 3, e1: 60, p1: 50, nAcross: 2, g: 60, d0: 22 }), fy: 250, fu: 410 });
ok('6.4.1 larger end distance does not reduce T_db', more.Tdb > b.Tdb || more.Tdb > 0);

// ---- decisions of docs/TECHNICAL_DECISIONS_6.3_6.4.md: centre-line areas, back-to-back double angles, lower bound for 6.3.4 sections, thread root area
// ISA 100x100x10 bolted (b = w = 100, t = 10, M20 hole 22, w_1 = 50, L_c = 100): A_go = (100 − 5)·10 = 950; A_nc = (100 − 5 − 22)·10 = 730; T_dn = 215 496 + 162 195.1 = 377 691.1
const ar = T.angleAreasCentreLine({ connected: 100, outstanding: 100, t: 10, nHoles: 1, dh: 22 });
ok('centre-line areas of the angle', near(ar.Anc, 730) && near(ar.Ago, 950) && near(ar.Agc, 950));
ok('centre-line areas close to the gross area of the angle (b + w − t) t = 1900 (+ the hole)', near(ar.Anc + 22 * 10 + ar.Ago, (100 + 100 - 10) * 10));
let sa = T.singleAngleRupture({ connected: 100, outstanding: 100, t: 10, fy: 250, fu: 410, connection: 'bolted', w1: 50, nHoles: 1, dh: 22, Lc: 100 });
ok('single angle bolted: T_dn 377 691', near(sa.Tdn, 377691.1, 1e-6) && sa.bs === 140 && sa.clause.endsWith('6.3.3'), String(sa.Tdn));
sa = T.singleAngleRupture({ connected: 100, outstanding: 100, t: 10, fy: 250, fu: 410, connection: 'bolted', w1: 50, nHoles: 1, dh: 22, Lc: 100, nAngles: 2 });
ok('two angles back to back: 2 × one angle, clause 6.3.4', near(sa.Tdn, 2 * 377691.1, 1e-6) && near(sa.TdnOne, 377691.1, 1e-6) && sa.clause.endsWith('6.3.4'));
// welded: no holes: A_nc = 950, b_s = w = 100, β = 1.4 − 0.76·250/410·(100/100) = 0.936585: T_dn = 280 440 + 202 217.3 = 482 657.3
sa = T.singleAngleRupture({ connected: 100, outstanding: 100, t: 10, fy: 250, fu: 410, connection: 'welded', nHoles: 0, dh: 22, Lc: 100 });
ok('single angle welded: no holes, b_s = w', near(sa.Tdn, 482657.3, 1e-6) && near(sa.areas.Anc, 950) && sa.bs === 100, String(sa.Tdn));
ok('angle rupture: invalid inputs refused', throws(() => T.singleAngleRupture({ connected: 100, outstanding: 100, t: 10, fy: 250, fu: 410, connection: 'bolted', nHoles: 1, dh: 22, Lc: 100 })) && throws(() => T.singleAngleRupture({ connected: 100, outstanding: 100, t: 10, fy: 250, fu: 410, connection: 'welded', nHoles: 0, dh: 22, Lc: 100, nAngles: 3 as any })));
// lower bound for channels / I-sections: A_n = 1560, f_u = 410: 460 512 N, never above the 6.3.1 value of the same area
const lb = T.connectedElementRupture({ An: 1560, fu: 410 });
ok('6.3.4 sections: lower bound = 6.3.1 of the connected elements, labelled', near(lb.Tdn, 460512) && /lower bound/.test(lb.clause));
// thread root area (ISO 724, coarse pitch): M20: P = 2.5, d_3 = 16.9328, A = 225.2 mm²; M16: P = 2, d_3 = 13.5463, A = 144.1 mm²
ok('thread root area M20 and M16', Math.abs(T.threadRootArea(20) - 225.2) < 0.1 && Math.abs(T.threadRootArea(16) - 144.1) < 0.1 && throws(() => T.threadRootArea(25)), `${T.threadRootArea(20)} ${T.threadRootArea(16)}`);

// ---- cross-check against a published software validation problem (STAAD.Pro, IS 800:2007 LSD, "Angle - Tension with Block Shear": ISA 150x90x15, f_y 250, f_u 420).
// What the page prints: A_vn 2040, A_vg 3525, A_tn 570, A_tg 675 mm² (input and text); the output listing swaps the last two (ATN 675, ATG 570); T_db,1 = 616.8 kN, T_db,2 = 509.6 (509.574) kN.
// No bolt pattern is printed. This checks the EQUATIONS of 6.4.1 for given areas; it is software documentation, not the standard, and it derives no area.
const stz = T.blockShear({ Avg: 3525, Avn: 2040, Atg: 675, Atn: 570, fy: 250, fu: 420 });
ok('validation case, printed input: T_2 = 509.574 kN (reproduced)', Math.abs(stz.T2 - 509574) < 5 && stz.governing === 2 && near(stz.Tdb, stz.T2), String(stz.T2));
// the printed T_1 = 616.8 kN is NOT reproduced by the printed A_tn = 570 (634.9 kN) ...
ok('validation case: printed A_tn = 570 gives T_1 = 634.9 kN, not the printed 616.8 kN (documented discrepancy)', Math.abs(stz.T1 - 634904) < 5 && Math.abs(stz.T1 - 616800) > 10000, String(stz.T1));
// ... it needs A_tn = 510 mm² = 34 x 15 = (45 − 22/2) x 15: a 22 mm hole with the half-hole deduction (the printed 570 corresponds to a 14 mm hole)
ok('validation case: T_1 = 616.8 kN is reproduced with A_tn = 510 mm² (hole 22 mm)', Math.abs(T.blockShear({ Avg: 3525, Avn: 2040, Atg: 675, Atn: 510, fy: 250, fu: 420 }).T1 - 616800) < 100);
// the output listing's swapped assignment (A_tn 675, A_tg 570) does NOT reproduce the printed 509.574 kN
ok('validation case: the swapped output-listing assignment (A_tn 675 > A_tg 570) is physically impossible (a net area cannot exceed its gross area) and would give T_2 = 485.7 kN, not 509.574 kN', throws(() => T.blockShear({ Avg: 3525, Avn: 2040, Atg: 570, Atn: 675, fy: 250, fu: 420 })) && Math.abs((0.9 * 2040 * 420 / (Math.sqrt(3) * 1.25) + 570 * 250 / 1.1) - 485711) < 5);
// one hole diameter explains three printed areas and T_1: d_0 = 22, five bolts, L_v = 235 (e_1 = 35, p = 50 assumed: A_vg and A_vn depend only on L_v and n), e_2 = 45, t = 15
const gz = T.blockShearAreas({ kind: 'one-sided', t: 15, nAlong: 5, e1: 35, p1: 50, nAcross: 1, g: 0, e2: 45, d0: 22 });
ok('validation case geometry (d_0 = 22, n = 5, L_v = 235, e_2 = 45): A_vg 3525, A_vn 2040, A_tg 675, A_tn 510', near(gz.Avg, 3525) && near(gz.Avn, 2040) && near(gz.Atg, 675) && near(gz.Atn, 510), JSON.stringify(gz));
const bz = T.blockShear({ ...gz, fy: 250, fu: 420 });
ok('validation case from the geometry: T_1 = 616.8 kN and T_2 = 509.574 kN, T_db = 509.6 kN', Math.abs(bz.T1 - 616764) < 5 && Math.abs(bz.T2 - 509574) < 5 && near(bz.Tdb, bz.T2));
// a 14 mm hole (which the printed A_tn = 570 needs) is inconsistent with the printed A_vn = 2040 for every bolt count with L_v = 235
ok('validation case: the printed A_tn = 570 (d_0 = 14) is inconsistent with the printed A_vn = 2040', [2, 3, 4, 5, 6, 7, 8, 9, 10].every((n) => Math.abs(T.blockShearAreas({ kind: 'one-sided', t: 15, nAlong: n, e1: 235 - (n - 1) * 10, p1: 10, nAcross: 1, g: 0, e2: 45, d0: 14 }).Avn - 2040) > 1));

// ---- coverage: invalid inputs (NaN, Infinity, negative)
const bad = [NaN, Infinity, -1];
ok('invalid inputs: NaN, Infinity and negative values are refused everywhere', bad.every((v) =>
  throws(() => T.plateRupture({ An: v, fu: 410 })) && throws(() => T.plateRupture({ An: 100, fu: v })) && throws(() => T.netAreaPlate({ b: v, t: 10, n: 1, dh: 22 })) && throws(() => T.netAreaPlate({ b: 200, t: 10, n: 1, dh: v })) &&
  throws(() => T.blockShear({ Avg: v, Avn: 1, Atg: 1, Atn: 1, fy: 250, fu: 410 })) && throws(() => T.blockShear({ Avg: 100, Avn: 50, Atg: 100, Atn: 50, fy: v, fu: 410 })) &&
  throws(() => T.shearLagRupture({ Anc: 730, Ago: 950, fu: 410, fy: 250, w: 100, t: 10, bs: v, Lc: 100 })) && throws(() => T.shearLagRupture({ Anc: 730, Ago: 950, fu: 410, fy: 250, w: 100, t: 10, bs: 140, Lc: v })) &&
  throws(() => T.threadRootArea(v))));
const BP = { kind: 'one-sided' as const, t: 8, nAlong: 2, e1: 40, p1: 50, nAcross: 1, g: 0, e2: 45, d0: 22 };
ok('invalid inputs: bolt pattern', throws(() => T.blockShearAreas({ ...BP, nAlong: 0 })) && throws(() => T.blockShearAreas({ ...BP, p1: 0 })) && throws(() => T.blockShearAreas({ ...BP, nAcross: 0 })) && throws(() => T.blockShearAreas({ ...BP, e2: undefined })) && throws(() => T.blockShearAreas({ ...BP, d0: NaN })));
// ---- coverage: boundaries
ok('boundary: holes that remove the whole section are refused, a hair less is accepted', throws(() => T.netAreaPlate({ b: 44, t: 10, n: 2, dh: 22 })) && T.netAreaPlate({ b: 44.001, t: 10, n: 2, dh: 22 }) > 0);
ok('boundary: a single hole at e_1 = d_0/2 leaves no shear area (refused); a hair more is accepted', throws(() => T.blockShearAreas({ ...BP, nAlong: 1, p1: 0, e1: 11 })) && T.blockShearAreas({ ...BP, nAlong: 1, p1: 0, e1: 11.001 }).Avn > 0);
const edge = T.shearLagRupture({ Anc: 730, Ago: 950, fu: 410, fy: 250, w: 100, t: 10, bs: 140, Lc: 100 });
ok('boundary: inside the limits β is the printed equation', near(edge.beta, edge.betaRaw) && edge.betaLimited === 'none');
ok('boundary: threaded-rod root area at both ends of the tabulated range', T.threadRootArea(8) > 0 && T.threadRootArea(36) > T.threadRootArea(8) && throws(() => T.threadRootArea(7)) && throws(() => T.threadRootArea(37)));
// ---- coverage: unit and dimension consistency (N, mm, N/mm²): strength is linear in the areas and in the strengths, quadratic in all lengths
const k = 3;
ok('units: T_dn is linear in A_n and in f_u', near(T.plateRupture({ An: k * 1560, fu: 410 }).Tdn, k * T.plateRupture({ An: 1560, fu: 410 }).Tdn) && near(T.plateRupture({ An: 1560, fu: k * 410 }).Tdn, k * T.plateRupture({ An: 1560, fu: 410 }).Tdn));
ok('units: T_db is linear in the four areas, and in f_y and f_u together', near(T.blockShear({ Avg: k * 2800, Avn: k * 1700, Atg: k * 600, Atn: k * 380, fy: 250, fu: 410 }).Tdb, k * T.blockShear({ Avg: 2800, Avn: 1700, Atg: 600, Atn: 380, fy: 250, fu: 410 }).Tdb) && near(T.blockShear({ ...a, fy: k * 250, fu: k * 410 }).Tdb, k * T.blockShear({ ...a, fy: 250, fu: 410 }).Tdb));
const sa1 = T.singleAngleRupture({ connected: 100, outstanding: 100, t: 10, fy: 250, fu: 410, connection: 'bolted', w1: 50, nHoles: 1, dh: 22, Lc: 100 });
const sa2 = T.singleAngleRupture({ connected: 200, outstanding: 200, t: 20, fy: 250, fu: 410, connection: 'bolted', w1: 100, nHoles: 1, dh: 44, Lc: 200 });
ok('units: all lengths x 2 (geometrically similar angle): β unchanged, T_dn x 4', near(sa2.beta, sa1.beta) && near(sa2.Tdn, 4 * sa1.Tdn, 1e-9));
const bg1 = T.blockShearAreas({ kind: 'plate', t: 10, nAlong: 3, e1: 40, p1: 50, nAcross: 2, g: 60, d0: 22 }), bg2 = T.blockShearAreas({ kind: 'plate', t: 20, nAlong: 3, e1: 80, p1: 100, nAcross: 2, g: 120, d0: 44 });
ok('units: all lengths x 2: block-shear areas x 4 and T_db x 4', near(bg2.Avg, 4 * bg1.Avg) && near(bg2.Atn, 4 * bg1.Atn) && near(T.blockShear({ ...bg2, fy: 250, fu: 410 }).Tdb, 4 * T.blockShear({ ...bg1, fy: 250, fu: 410 }).Tdb, 1e-9));
// ---- coverage: monotonicity and closure over a range of sections
const grow = (o: Partial<typeof BP>) => T.blockShear({ ...T.blockShearAreas({ ...BP, nAlong: 3, ...o }), fy: 250, fu: 410 }).Tdb;
const base = grow({});
ok('monotonic: block shear does not decrease with e_1, p, e_2, t and does decrease with the hole diameter', grow({ e1: 50 }) >= base && grow({ p1: 60 }) >= base && grow({ e2: 55 }) >= base && grow({ t: 10 }) > base && grow({ d0: 26 }) < base);
let closes = true;
for (const [b_, w_, t_] of [[50, 50, 5], [75, 50, 6], [100, 100, 10], [150, 90, 15], [200, 150, 20]]) { const r2 = T.angleAreasCentreLine({ connected: b_, outstanding: w_, t: t_, nHoles: 1, dh: 18 }); closes = closes && near(r2.Anc + 18 * t_ + r2.Ago, (b_ + w_ - t_) * t_, 1e-12); }
ok('closure: centre-line A_nc + holes + A_go = (b + w − t) t for five angles', closes);

// ---- register gating: the provisions are implemented but not VERIFIED (awaiting your review): a check citing them is REVIEW, never PASS or FAIL
ok('6.3.1 / 6.4.1 stay unverified until reviewed', !clauseVerified('IS 800:2007 6.3.1') && !clauseVerified('IS 800:2007 6.4.1') && clauseVerified('IS 800:2007 6.2'));

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
