// IS 800:2007 lateral restraint (8.3.4) and bearing-type bolts (10.2, 10.3): equations against hand values, and the response of the joist restraint of the C-section
// designer to the joist section, number, connection and anchorage.   npm run test:restraint
import * as RD from '../src/server/frame/design/restraint';
import { MODEL } from '../src/server/engine/model';
import { SCHEMA } from '../src/shared/schema';

let passed = 0, failed = 0;
const ok = (name: string, cond: boolean, detail = '') => { if (cond) passed++; else { failed++; console.log(`FAIL ${name} ${detail}`); } };
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

// ---- 8.3.4: hand values
let d = RD.restraintDemand({ Fcf: 100000, n: 5 });
ok('8.3.4 total 2.5 %', near(d.total, 2500));
ok('8.3.4 per point = 2.5 %/n = 0.5 % -> raised to 1 %', near(d.perPoint, 1000) && near(d.anchorage, 5000), JSON.stringify(d));
d = RD.restraintDemand({ Fcf: 100000, n: 2 });
ok('8.3.4 two points: 2.5 %/2 = 1.25 % (> 1 %)', near(d.perPoint, 1250) && near(d.anchorage, 2500));
d = RD.restraintDemand({ Fcf: 100000, n: 1 });
ok('8.3.4 one point carries 2.5 %', near(d.perPoint, 2500));
let threw = false; try { RD.restraintDemand({ Fcf: 1, n: 0 }); } catch { threw = true; }
ok('8.3.4 invalid number of points refused', threw);

// ---- 10.3: hand values (M16, 8.8: f_ub 800, f_yb 640, A_n 157, A_sb 201.06)
const b16: RD.BoltInput = { d: 16, fub: 800, fyb: 640, An: 157, Asb: Math.PI * 256 / 4 };
let sh = RD.boltShearCapacity(b16, { nn: 1, ns: 0 });
ok('10.3.3 V_dsb = f_ub A_nb / (sqrt3 gamma_mb) (one plane through the threads)', near(sh.Vdsb, 800 * 157 / Math.sqrt(3) / 1.25, 1e-9), String(sh.Vdsb));
sh = RD.boltShearCapacity(b16, { nn: 0, ns: 2 });
ok('10.3.3 two shank planes', near(sh.Vdsb, 800 * 2 * b16.Asb / Math.sqrt(3) / 1.25));
sh = RD.boltShearCapacity(b16, { nn: 1, ns: 0, lj: 300 }); // 15 d = 240 mm; beta = 1.075 - 300/3200 = 0.98125
ok('10.3.3.1 long joint beta_lj = 1.075 - l_j/(200 d)', near(sh.betaLj, 1.075 - 300 / 3200) && near(sh.Vdsb, 800 * 157 / Math.sqrt(3) / 1.25 * sh.betaLj));
sh = RD.boltShearCapacity(b16, { nn: 1, ns: 0, lj: 2000 });
ok('10.3.3.1 beta_lj not below 0.75', near(sh.betaLj, 0.75));
sh = RD.boltShearCapacity(b16, { nn: 1, ns: 0, lj: 100 });
ok('10.3.3.1 no reduction up to 15 d', sh.betaLj === 1);
sh = RD.boltShearCapacity(b16, { nn: 1, ns: 0, lg: 96 }); // 6 d: 8/(3+6) = 0.8889
ok('10.3.3.2 large grip beta_lg = 8/(3 + l_g/d)', near(sh.betaLg, 8 / 9) && sh.valid);
ok('10.3.3.2 grip above 8 d is invalid', !RD.boltShearCapacity(b16, { nn: 1, ns: 0, lg: 8 * 16 + 1 }).valid);
let bb = RD.boltBearingCapacity(b16, { e: 40, pitch: 50, d0: 18, t: 6, fu: 410 }); // k_b = min(0.7407, 0.6204, 1.951, 1) = 0.6204
ok('10.3.4 k_b = min(e/3d0; p/3d0 - 0.25; f_ub/f_u; 1)', near(bb.kb, 50 / 54 - 0.25), String(bb.kb));
ok('10.3.4 V_dpb = 2.5 k_b d t f_u / gamma_mb', near(bb.Vdpb, 2.5 * bb.kb * 16 * 6 * 410 / 1.25));
bb = RD.boltBearingCapacity(b16, { e: 100, d0: 18, t: 6, fu: 410, pitch: undefined });
ok('10.3.4 k_b limited by 1.0 or f_ub/f_u', near(bb.kb, 1));
ok('10.3.4 oversize / long slot reductions 0.7 / 0.5', near(RD.boltBearingCapacity(b16, { e: 100, d0: 18, t: 6, fu: 410, hole: 'oversize-short-slot' }).Vdpb, 0.7 * bb.Vdpb) && near(RD.boltBearingCapacity(b16, { e: 100, d0: 18, t: 6, fu: 410, hole: 'long-slot' }).Vdpb, 0.5 * bb.Vdpb));
let tn = RD.boltTensionCapacity(b16);
ok('10.3.5 T_nb = min(0.9 f_ub A_n; f_yb A_sb gamma_mb/gamma_m0)', near(tn.Tnb, Math.min(0.9 * 800 * 157, 640 * b16.Asb * 1.25 / 1.10)) && near(tn.Tdb, tn.Tnb / 1.25), JSON.stringify(tn));
ok('10.3.6 interaction', near(RD.boltCombined(30, 60, 40, 80), 0.5));

// ---- 10.2: geometry
ok('Table 19: clearances', RD.standardClearance(12) === 1 && RD.standardClearance(14) === 1 && RD.standardClearance(16) === 2 && RD.standardClearance(22) === 2 && RD.standardClearance(24) === 2 && RD.standardClearance(27) === 3 && RD.standardClearance(10) === null);
let g = RD.boltGeometry({ d: 12, pitch: 29, e1: 25, edge: 'rolled' });
ok('10.2.2 pitch < 2.5 d refused', !g.ok && g.messages.some((m) => /10\.2\.2/.test(m)));
ok('10.2.4.2 end distance < 1.5 d_0 refused (d_0 = 13: 19.5 mm)', !RD.boltGeometry({ d: 12, e1: 19, edge: 'rolled' }).ok && RD.boltGeometry({ d: 12, e1: 20, edge: 'rolled' }).ok);
ok('10.2.4.2 sheared edge 1.7 d_0', !RD.boltGeometry({ d: 12, e1: 21, edge: 'sheared' }).ok && RD.boltGeometry({ d: 12, e1: 23, edge: 'sheared' }).ok);
ok('geometry: d < 12 mm is outside Table 19', RD.boltGeometry({ d: 10, e1: 30, edge: 'rolled' }).d0 === null);

// ---- the joist restraint in the designer
const base: any = { ...SCHEMA.defaults(), sbi_rst: 'joist', j_sec: 'box', j_b: 60, j_h: 60, j_t: 3, j_d: 12, j_nb: 2, j_p: 40, j_k: 1, j_anR: 50, j_Kc: 20, j_Ka: 100, j_e1: 30, j_anch: 'bay' };
const joist = (o: any = {}) => { const r: any = MODEL.compute({ ...base, ...o }); if (r.fatal) throw new Error('fatal: ' + r.msgs.filter((m: any) => m.level === 'error').map((m: any) => m.text)); return { r, j: r.mods.sbi.restrInfo.joist, sb: r.mods.sbi }; };
const st = (j: any, re: RegExp) => j.checks.filter((c: any) => re.test(c.name));
let { j } = joist();
ok('verified mode: the secondary-side bearing on cold-formed material needs IS 801: pending, so the joist is NOT credited', !j.credited && /IS 801/.test(j.reason) && st(j, /secondary \(cold-formed\)/)[0].status === 'REVIEW');
ok('the restraint force check is a demand of 2.5 % F_cf / n (at least 1 %)', Math.abs(st(j, /Restraint force/)[0].Ed - j.demand.perPoint) < 1e-9 && j.demand.perPoint >= 0.01 * j.demand.Fcf - 1e-9);
ok('hollow-section joist: the verified IS 800 member checks are calculated', st(j, /Joist member: Compression/).length === 3 && st(j, /Joist member: Compression/).every((c: any) => c.status === 'PASS'));
ok('connection: bolts are checked with the verified IS 800 10.3 equations (PASS, not REVIEW)', st(j, /bolts: shear/)[0].status === 'PASS' && st(j, /bearing on the joist wall/)[0].status === 'PASS');

// inadequate anchorage capacity -> FAIL; no anchorage -> FAIL; unknown capacity -> REVIEW
let x = joist({ j_anR: 0.01 }).j;
ok('anchorage capacity below the demand -> FAIL', st(x, /capacity of the anchorage/)[0].status === 'FAIL' && !x.credited);
x = joist({ j_anch: 'none' }).j;
ok('not anchored -> FAIL (8.3.4: no mutual dependence), never credited', st(x, /Load path/)[0].status === 'FAIL' && !x.credited && /not anchored/.test(x.reason));
x = joist({ j_anR: '' }).j;
ok('unknown anchorage capacity -> REVIEW, nothing assumed', st(x, /capacity of the anchorage/)[0].status === 'REVIEW');

// joist member: too slender / too small -> FAIL; effective length missing -> REVIEW; angle -> REVIEW
x = joist({ j_b: 20, j_h: 20, j_t: 1.5, j_k: 3, j_q: 5 }).j;
ok('a joist that cannot carry the restraint force + its load -> FAIL', st(x, /Joist member/).some((c: any) => c.status === 'FAIL'), st(x, /Joist member/).map((c: any) => c.status).join());
x = joist({ j_k: '' }).j;
ok('no effective-length factor -> the joist member is pending', st(x, /Joist member/).some((c: any) => c.status === 'REVIEW' && c.pending));
x = joist({ j_sec: 'L' }).j;
ok('angle joist -> pending (IS 800 7.5)', st(x, /Joist member/)[0].pending === true && /7\.5/.test(st(x, /Joist member/)[0].clause));
x = joist({ j_sec: 'C' }).j;
ok('lipped-C joist -> pending (IS 801)', st(x, /Joist member/)[0].pending === true && /IS 801/.test(st(x, /Joist member/)[0].clause));

// connection: weak connection -> FAIL (many joists need a bigger bolt), geometry violation -> FAIL
x = joist({ j_d: 12, j_nb: 1, j_t: 3, j_b: 200, j_h: 200, j_n: 1, sbi_t: 2 }).j;
const f1 = st(x, /bolts: shear/)[0];
ok('bolt shear capacity responds to the number of bolts: one bolt carries all of the force', f1.eta > st(j, /bolts: shear/)[0].eta);
x = joist({ j_e1: 10 }).j;
ok('end distance below 1.5 d_0 -> FAIL (10.2.4.2)', st(x, /spacing and end distance/)[0].status === 'FAIL');
x = joist({ j_d: 10 }).j;
ok('bolt below 12 mm: hole clearance not covered -> REVIEW', st(x, /hole clearance/)[0].status === 'REVIEW');

// restraint force changes with the joist number and spacing
const a2 = joist({ j_n: 2 }).j, a8 = joist({ j_n: 8 }).j;
ok('more joists: 1 % per point governs and the total to the supports grows', a8.demand.perPoint <= a2.demand.perPoint && a8.demand.anchorage >= a2.demand.anchorage);

// stiffness is modelled, never assumed rigid
x = joist({ j_Kc: '' }).j;
ok('unknown connection stiffness -> not modelled, REVIEW', st(x, /stiffness K_J/)[0].status === 'REVIEW' && !x.credited);
const kLow = joist({ j_Kc: 0.5 }).j.kJ, kHigh = joist({ j_Kc: 500 }).j.kJ;
ok('K_J = 1/(L/EA + 2/Kc + 1/Ka) responds to the connection stiffness', kLow < kHigh && kHigh < 100e3);

// user-defined mode: credited with a justification, labelled, with the real K_J; stability results follow
const none = joist({ j_cred: 'verified' });
const usr = joist({ j_cred: 'user', j_credJ: 'bolted tabs to the SB-Int top flange, anchored to the braced bay' });
const usrLow = joist({ j_cred: 'user', j_credJ: 'x', j_Kc: 0.05, j_Ka: 0.5 });
ok('user-defined mode: credited, labelled USER-DEFINED, with a REVIEW line', usr.j.credited && /USER-DEFINED/.test(usr.j.reason) && usr.j.checks.some((c: any) => /User-defined joist restraint/.test(c.name) && c.status === 'REVIEW'));
ok('user-defined mode without justification: not credited', !joist({ j_cred: 'user', j_credJ: '' }).j.credited);
const uf = joist({ j_cred: 'user', j_credJ: 'x', j_anR: 0.01 });
ok('user-defined mode does not hide a failing verified check, and a failing check removes the credit', uf.j.checks.some((c: any) => c.status === 'FAIL') && !uf.j.credited && uf.sb.spec.restr.lat.every((q: any) => !q.credited));
ok('stability of the secondary follows the restraint: M_cr credited > M_cr verified-mode (not credited)', usr.sb.Mcr > none.sb.Mcr * 1.05, `${usr.sb.Mcr} vs ${none.sb.Mcr}`);
ok('a softer restraint gives a lower M_cr than a stiff one', usrLow.sb.Mcr < usr.sb.Mcr && usrLow.sb.Mcr >= none.sb.Mcr);
ok('M_cr of the verified-mode (uncredited) run equals the run without joists', near(none.sb.Mcr, joist({ sbi_rst: 'none' }).sb.Mcr, 1e-9));
ok('the restraint list of the secondary marks credited / not credited consistently', none.sb.spec.restr.lat.every((q: any) => !q.credited) && usr.sb.spec.restr.lat.length === 5 && usr.sb.spec.restr.lat.every((q: any) => q.credited));
ok('no check of the joist cites another standard', [...none.j.checks, ...usr.j.checks].every((c: any) => !/EN ?1993|AISC|AISI/.test(c.clause + c.name + c.note)));

// ---- knee brace in tension: net-section rupture (6.3.3 / 6.3.4) and block shear of the end (6.4.1): hand values, status gate, invalid geometry
// ISA 100x100x10, f_y 250, f_u 410, M20 (hole 22), three bolts at 50, e_1 = 40, e_2 = 50 (w_1 = 50): rupture 215 496 + 162 195.1 = 377 691.1 N; block shear L_v = 140: A_vg 1400, A_vn 850, A_tg 500, A_tn 390:
// T_1 = 183 702.4 + 115 128 = 298 830; T_2 = 144 861 + 113 636 = 258 505 N
const knee = (o: any = {}) => { const r: any = MODEL.compute({ ...SCHEMA.defaults(), k_use: 'yes', k_nL: '1', k_b: 100, k_h: 100, k_t: 10, k_nb: 3, k_p1: 50, k_e1: 40, k_e2: 50, k_d: 20, k_fy: 250, k_fu: 410, ...o }); const out: any = {}; for (const row of r.summary?.rows || []) for (const c of row.list) if (/^Knee brace (in tension|end)/.test(c.name)) out[c.name.split(':')[0] + (c.pending ? ' (pending)' : '')] = c; return out; };
const k1 = knee();
const kr = k1['Knee brace in tension'], kb = k1['Knee brace end'];
ok('knee brace: rupture resistance by hand (377 691 N) and block shear by hand (258 505 N)', kr && kb && Math.abs(kr.Rd - 377691.1) < 1 && Math.abs(kb.Rd - 258505) < 1, `${kr && kr.Rd} ${kb && kb.Rd}`);
ok('knee brace: both checks are REVIEW (provisional clauses), never PASS or FAIL', kr.status === 'REVIEW' && kb.status === 'REVIEW' && kr.basis === 'unverified' && kb.basis === 'unverified');
ok('knee brace: the demand is the same tension in both checks and the utilisation follows Ed / Rd', near(kr.Ed, kb.Ed, 1e-12) && near(kr.eta, kr.Ed / kr.Rd, 1e-12) && near(kb.eta, kb.Ed / kb.Rd, 1e-12));
const k2 = knee({ k_nL: '2' });
ok('knee brace: two angles back to back carry twice the resistance (6.3.4 proposal and per-angle block shear)', Math.abs(k2['Knee brace in tension'].Rd - 2 * 377691.1) < 2 && Math.abs(k2['Knee brace end'].Rd - 2 * 258505) < 2);
ok('knee brace: a longer end distance never reduces the block-shear resistance, a larger bolt hole never raises the rupture resistance', knee({ k_e1: 60 })['Knee brace end'].Rd >= kb.Rd && knee({ k_d: 24 })['Knee brace in tension'].Rd <= kr.Rd);
const kbad = knee({ k_e2: 120 });
ok('knee brace: e_2 outside the leg gives two pending checks (rupture and block shear), no crash and no resistance', !kbad['Knee brace in tension'] && !kbad['Knee brace end'] && !!kbad['Knee brace in tension (pending)'] && !!kbad['Knee brace end (pending)'] && kbad['Knee brace in tension (pending)'].status === 'REVIEW' && kbad['Knee brace end (pending)'].status === 'REVIEW' && kbad['Knee brace end (pending)'].Rd === undefined, JSON.stringify(Object.keys(kbad)));
const kbad2 = knee({ k_nb: 1, k_e1: 5 });
ok('knee brace: one bolt with an end distance smaller than the hole radius: block shear pending, rupture (not affected) still checked', !kbad2['Knee brace end'] && !!kbad2['Knee brace end (pending)'] && kbad2['Knee brace end (pending)'].status === 'REVIEW' && !!kbad2['Knee brace in tension'] && !kbad2['Knee brace in tension (pending)'], JSON.stringify(Object.keys(kbad2)));

// ---- IS 800:2007 Table 19 (10.2.1, printed p. 73): hole clearances, every row, both columns, the boundaries around 24 and 27 mm, invalid input and the flag below 12 mm
const T19: [number, number, number][] = [[12, 1, 3], [14, 1, 3], [15, 2, 4], [16, 2, 4], [22, 2, 4], [23, 2, 6], [24, 2, 6], [25, 3, 8], [26, 3, 8], [27, 3, 8], [30, 3, 8]];
ok('Table 19: standard and over-size clearance for 12, 14, 15, 16, 22, 23, 24, 25, 26, 27, 30 mm', T19.every(([d, st, ov]) => RD.holeClearance(d, 'standard') === st && RD.holeClearance(d, 'oversize') === ov && RD.standardClearance(d) === st), JSON.stringify(T19.map(([d]) => [d, RD.holeClearance(d), RD.holeClearance(d, 'oversize')])));
ok('Table 19: the jumps are exactly at 14 -> 16 (standard 1 -> 2), 24 -> 25 (standard 2 -> 3, over-size 6 -> 8) and the 22 -> 24 over-size step (4 -> 6)', RD.holeClearance(14) === 1 && RD.holeClearance(16) === 2 && RD.holeClearance(24) === 2 && RD.holeClearance(24.001) === 3 && RD.holeClearance(24, 'oversize') === 6 && RD.holeClearance(22, 'oversize') === 4 && RD.holeClearance(24.001, 'oversize') === 8);
ok('Table 19: below 12 mm the table gives nothing (null); invalid diameters are refused', RD.holeClearance(11.999) === null && RD.holeClearance(5) === null && [0, -1, NaN, Infinity].every((v) => { try { RD.holeClearance(v); return false; } catch { return true; } }));
ok('Table 19: hole diameter = d + clearance, and below 12 mm d + 1 (over-size d + 3) is returned WITH the flag', RD.holeDiameter(27).d0 === 30 && !RD.holeDiameter(27).outsideTable && RD.holeDiameter(27, 'oversize').d0 === 35 && RD.holeDiameter(10).d0 === 11 && RD.holeDiameter(10).outsideTable && RD.holeDiameter(10, 'oversize').d0 === 13 && RD.holeDiameter(10, 'oversize').outsideTable && !RD.holeDiameter(12).outsideTable);
// the engine checks use the table: the hole diameter is backed out of the printed steps of the real checks
const hd = (o: any) => { const r: any = MODEL.compute({ ...SCHEMA.defaults(), ...o }); const m: any = {}; for (const row of r.summary?.rows || []) for (const c of row.list) m[row.key + '|' + c.name] = c; return { m, r }; };
const t19step = (c: any, re: RegExp) => { const q = (c?.steps || []).find((x: any) => re.test(x[0])); return q ? q[2] : NaN; };
const hnet = (o: any) => t19step(hd(o).m['ci|C web net shear along the bolt column (incl. adjustment holes in that line)'], /h_net/);
const h12 = hnet({ ci_d: 12 }), h12o = hnet({ ci_d: 12, ci_hole: 'oversize' });
let engOk = true; const engBad: string[] = [];
for (const d of [12, 14, 16, 20, 24, 25, 27, 30]) {
  const stdD0 = 13 + (h12 - hnet({ ci_d: d })) / 2, ov = 15 + (h12o - hnet({ ci_d: d, ci_hole: 'oversize' })) / 2; // two bolts in the column; reference hole diameters 13 / 15 at d = 12
  if (Math.abs(stdD0 - (d + (RD.holeClearance(d) as number))) > 1e-9 || Math.abs(ov - (d + (RD.holeClearance(d, 'oversize') as number))) > 1e-9) { engOk = false; engBad.push(`${d}: ${stdD0} ${ov}`); }
}
ok('connections: the hole diameter follows Table 19 (standard and over-size) from 12 to 30 mm', engOk, engBad.join('; '));
const kneeD0 = (d: number) => { const { m } = hd({ k_use: 'yes', k_nL: '1', k_b: 100, k_h: 100, k_t: 10, k_nb: 3, k_p1: 90, k_e1: 60, k_e2: 50, k_d: d, k_fy: 250, k_fu: 410 }); for (const k of Object.keys(m)) if (/Knee brace in tension: net-section rupture/.test(k)) return (950 - t19step(m[k], /^A_nc/)) / 10; return NaN; };
ok('knee brace: the hole diameter follows Table 19 (12, 16, 24, 25, 27, 30 mm)', [12, 16, 24, 25, 27, 30].every((d) => Math.abs(kneeD0(d) - (d + (RD.holeClearance(d) as number))) < 1e-9), [12, 16, 24, 25, 27, 30].map(kneeD0).join(','));
const vbD0 = (d: number) => { const { m, r } = hd({ vb_use: 'yes', br_d: d }); const D: any = SCHEMA.defaults(); for (const k of Object.keys(m)) if (/Vertical bracing diagonal: net-section rupture/.test(k)) return +D.vb_b - t19step(m[k], /^A_n/) / +D.vb_t; return NaN; };
ok('vertical bracing: the hole diameter follows Table 19 (12, 16, 24, 25, 27, 30 mm)', [12, 16, 24, 25, 27, 30].every((d) => Math.abs(vbD0(d) - (d + (RD.holeClearance(d) as number))) < 1e-9), [12, 16, 24, 25, 27, 30].map(vbD0).join(','));
const pbKb = (d: number) => { const { m } = hd({ br_use: 'yes', br_d: d }); for (const k of Object.keys(m)) if (/Plan bracing end bolts/.test(k)) return t19step(m[k], /^k_b/); return NaN; };
ok('plan bracing end bolts: the edge distance follows the hole (e_1 = 2 d_0), so k_b = 2/3 for every diameter (the result does not depend on the hole size)', [12, 16, 24, 27, 30].every((d) => Math.abs(pbKb(d) - 2 / 3) < 1e-9));
// flag below 12 mm
const k10 = hd({ k_use: 'yes', k_nL: '1', k_b: 100, k_h: 100, k_t: 10, k_nb: 3, k_p1: 90, k_e1: 60, k_e2: 50, k_d: 10, k_fy: 250, k_fu: 410 }).m;
const k10note = Object.keys(k10).filter((k) => /Knee brace (in tension: net-section|end: block)/.test(k)).map((k) => k10[k].note || '');
ok('below 12 mm: the knee-brace checks carry the "outside Table 19" flag and d + 1 is used; at 12 mm and above there is no flag', k10note.length === 2 && k10note.every((n: string) => /outside Table 19/.test(n)) && Math.abs(kneeD0(10) - 11) < 1e-9 && !Object.keys(hd({ k_use: 'yes', k_nL: '1', k_b: 100, k_h: 100, k_t: 10, k_nb: 3, k_p1: 90, k_e1: 60, k_e2: 50, k_d: 12, k_fy: 250, k_fu: 410 }).m).some((k: string) => /outside Table 19/.test(JSON.stringify((hd({ k_use: 'yes', k_d: 12 }) as any).m[k] || {}))));
const c10 = hd({ ci_d: 10 }).m, c12 = hd({ ci_d: 12 }).m;
const flagged = (m: any) => Object.keys(m).filter((k) => /^ci\|(Bearing on the (C web|plate|angle leg|U-cleat)|C web net shear along the bolt column)/.test(k) && /outside Table 19/.test(m[k].note || ''));
ok('below 12 mm: the connection checks that use the hole diameter carry the flag; at 12 mm there is none', flagged(c10).length >= 2 && flagged(c12).length === 0, JSON.stringify(flagged(c10)));

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
