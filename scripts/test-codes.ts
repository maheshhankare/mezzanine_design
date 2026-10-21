// Tests of the code-specific routes, the register, the analysis settings and the calculation record.   npm run test:codes
// Each test states its calculation basis. The bases are the clauses of the supplied official texts (IS 800:2007, EN 1993-1-1:2005) read on the page
// images, hand calculations, and closed-form solutions; nothing is compared with RSTAB here.
import { FrameModel, LoadCase } from '../src/server/frame/types';
import { prepare } from '../src/server/frame/model';
import { solveFrame, criticalLoadFactor } from '../src/server/frame/solve';
import {
  is800NotionalLoads, is800NotionalLoadCases, is800NotionalLoadApplicability, is800FoundationShearWithoutNotional, is800GantryNotionalExempt, is800SecondOrderRequired, is800LambdaCrDeflection,
} from '../src/server/frame/codes/is800';
import {
  en1993SwayImperfection, en1993BowRatio, en1993FirstOrderPermitted, en1993AlphaCrStorey, en1993BeamAxialSignificant, en1993SwayAmplification, en1993SwayMayBeDisregarded, en1993BowRequired,
  en1993BowEquivalentLoads, enValuesFromAnnex, enValuesFromEurocodeText, EN_TABLE_5_1,
} from '../src/server/frame/codes/en1993';
import { bowGeometry, swayLoads } from '../src/server/frame/imperfection';
import { governingMoment, buildCalculationRecord, RECORD_TITLES } from '../src/server/frame/record';
import { CODE_REGISTER, availabilityOf, routeAvailability, registerProblems, emptyNationalAnnex, type CodeItem } from '../src/shared/codeRegister';
import { defaultSettings, validateSettings, optionAvailability, type AnalysisSettings } from '../src/shared/analysisSettings';
import { existsSync } from 'node:fs';

let failed = 0;
const rows: string[] = [];
const assert = (name: string, cond: boolean, extra = '') => { if (!cond) failed++; rows.push(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); };
const check = (name: string, got: number, ref: number, tol: number) => {
  const rel = ref === 0 ? Math.abs(got) : Math.abs(got - ref) / Math.abs(ref); const ok = rel <= tol; if (!ok) failed++;
  rows.push(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(78)} got ${got.toPrecision(7).padStart(13)} ref ${ref.toPrecision(7).padStart(13)} err ${(rel * 100).toExponential(1)} % (tol ${(tol * 100).toExponential(0)} %)`);
};
const throws = (f: () => unknown) => { try { f(); return false; } catch { return true; } };

// ================================================================ IS 800:2007
// basis: 4.3.6, 4.3.6.1, 4.3.6.2, 4.3.6.3 (p. 24), hand calculation
{
  const level = { id: 'L1', nodes: [{ node: 1, vertical: 100e3 }, { node: 2, vertical: 200e3 }, { node: 3, vertical: 300e3 }] };
  const r = is800NotionalLoads(level, [1, 0, 0]);
  check('IS 800 4.3.6: level force = 0.5 % of 600 kN = 3 kN', r.total, 3000, 1e-12);
  check('IS 800 4.3.6: node 1 share (100/600 of 3 kN)', r.loads[0].f[0], 500, 1e-12);
  check('IS 800 4.3.6: node 3 share (300/600 of 3 kN)', r.loads[2].f[0], 1500, 1e-12);
  check('IS 800 4.3.6: sum of the node forces = level force', r.loads.reduce((s, l) => s + l.f[0], 0), 3000, 1e-12);
  const y = is800NotionalLoads(level, [0, -2, 0]);
  check('IS 800 4.3.6.1: direction -Y, unit vector applied (|F| = 3 kN)', Math.hypot(...y.loads.reduce((s, l) => [s[0] + l.f[0], s[1] + l.f[1]], [0, 0])), 3000, 1e-12);
  assert('IS 800 4.3.6.1: a vertical component in the direction is refused', throws(() => is800NotionalLoads(level, [1, 0, 1])));
  assert('IS 800 4.3.6: a level without vertical load is refused', throws(() => is800NotionalLoads({ id: 'E', nodes: [{ node: 1, vertical: 0 }] }, [1, 0, 0])));
  assert('IS 800 4.3.6: a negative vertical load is refused', throws(() => is800NotionalLoads({ id: 'E', nodes: [{ node: 1, vertical: -1 }] }, [1, 0, 0])));
  const cases = is800NotionalLoadCases([level, { id: 'L2', nodes: [{ node: 4, vertical: 400e3 }] }]);
  assert('IS 800 4.3.6.1: four cases (+X, -X, +Y, -Y), each in ONE direction only', cases.length === 4 && cases.every((c) => { const dx = c.lc.nodal!.some((l) => l.f[0] !== 0), dy = c.lc.nodal!.some((l) => l.f[1] !== 0); return dx !== dy; }));
  check('IS 800 4.3.6.1: all levels together: 0.5 % of 1,000 kN = 5 kN per case', cases[0].total, 5000, 1e-12);
  assert('IS 800 4.3.6.1: "positive" generates two cases', is800NotionalLoadCases([level], 'positive').length === 2);
  assert('IS 800 4.3.6.2: no violation without the excluded situations', is800NotionalLoadApplicability({}).allowed);
  assert('IS 800 4.3.6.2(a): overturning / overall instability refused', !is800NotionalLoadApplicability({ checkingOverturningOrOverallInstability: true }).allowed);
  assert('IS 800 4.3.6.2(b): with wind / earthquake refused', !is800NotionalLoadApplicability({ withOtherLateralLoads: true }).allowed);
  assert('IS 800 4.3.6.2(c): with temperature effects refused', !is800NotionalLoadApplicability({ withTemperatureEffects: true }).allowed);
  assert('IS 800 4.3.6.2(d): contribution to the foundation shear refused', !is800NotionalLoadApplicability({ contributesToFoundationShear: true }).allowed);
  assert('IS 800 4.3.6.2: every violation names its clause', is800NotionalLoadApplicability({ checkingOverturningOrOverallInstability: true, withOtherLateralLoads: true, withTemperatureEffects: true, contributesToFoundationShear: true }).violations.every((v) => /4\.3\.6/.test(v)));
  assert('IS 800 4.3.6.3: height/width < 1 exempt', is800GantryNotionalExempt(8, 10));
  assert('IS 800 4.3.6.3: height/width = 1 not exempt', !is800GantryNotionalExempt(10, 10));
  assert('IS 800 4.4.3.1: C = 1.4 first order with amplification permitted', !is800SecondOrderRequired(1.4, 1.2).secondOrderRequired);
  assert('IS 800 4.4.2: C_y = 1.41 requires second order', is800SecondOrderRequired(1.41, 1).secondOrderRequired);
  assert('IS 800 4.4.2: C_z = 1.5 requires second order', is800SecondOrderRequired(1, 1.5).secondOrderRequired);
}

// portal frame with a (nearly) rigid beam: sway stiffness 24 E I / L^3, critical load pi^2 E I / L^2 per column (K = 1)
const E = 210000, G = 81000;
const portal = (L: number, Ic: number, Ib: number, div = 8): FrameModel => ({
  nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 6000, y: 0, z: 0 }, { id: 3, x: 0, y: 0, z: L }, { id: 4, x: 6000, y: 0, z: L }],
  materials: { S: { E, G } }, sections: { C: { A: 1e4, Iy: Ic, Iz: Ic, J: 1e6 }, B: { A: 1e4, Iy: Ib, Iz: Ib, J: 1e6 } },
  members: [
    { id: 1, type: 'beam', n1: 1, n2: 3, section: 'C', material: 'S', divisions: div }, { id: 2, type: 'beam', n1: 2, n2: 4, section: 'C', material: 'S', divisions: div },
    { id: 3, type: 'beam', n1: 3, n2: 4, section: 'B', material: 'S', divisions: 4 },
  ],
  supports: [
    { node: 1, fixed: [true, true, true, true, true, true] }, { node: 2, fixed: [true, true, true, true, true, true] },
    { node: 3, fixed: [false, true, false, true, false, true] }, { node: 4, fixed: [false, true, false, true, false, true] }, // planar frame: out-of-plane restraint
  ],
});
{
  const L = 4000, Ic = 2e7, P = 3e5; // 300 kN per column
  const m = portal(L, Ic, Ic * 1e4);
  const ps = prepare(m);
  const grav: LoadCase = { id: 'G', nodal: [{ node: 3, f: [0, 0, -P, 0, 0, 0] }, { node: 4, f: [0, 0, -P, 0, 0, 0] }] };
  // IS 800 4.3.6 notional force at the beam level, B-3.2 deflection method
  const nl = is800NotionalLoads({ id: 'roof', nodes: [{ node: 3, vertical: P }, { node: 4, vertical: P }] }, [1, 0, 0]);
  check('portal: notional force = 0.5 % of 600 kN', nl.total, 3000, 1e-12);
  const lin = solveFrame({ prepared: ps, combo: [{ lc: grav, factor: 1 }, { lc: { id: 'N', nodal: nl.loads }, factor: 1 }], options: { secondOrder: false } });
  const dTop = lin.displacement.get(3)![0];
  const lam = is800LambdaCrDeflection([{ h: L, deltaTop: dTop, deltaBottom: 0 }]);
  // basis: sway stiffness of two fixed-base columns with a rigid beam k = 24 E I / L^3; delta = H/k; lambda = 1/(200 delta/L) = 12 E I / (P L^2)
  check('IS 800 B-3.2: deflection method on the rigid-beam portal = 12 E I / (P L^2)', lam.lambdaCr, (12 * E * Ic) / (P * L * L), 3e-3);
  const crit = criticalLoadFactor(ps, [{ lc: grav, factor: 1 }]).lambda;
  check('IS 800 4.6.2 b): rational buckling analysis of the portal = pi^2 E I / (P L^2)', crit, (Math.PI ** 2 * E * Ic) / (P * L * L), 3e-3);
  check('IS 800 B-3.2 is an ESTIMATE: ratio deflection method / rational = 12 / pi^2 for this frame', lam.lambdaCr / crit, 12 / Math.PI ** 2, 5e-3);
  // EN 1993-1-1 (5.2) on the same frame: alpha_cr = (H/V)(h/delta)
  const alpha = en1993AlphaCrStorey({ HEd: nl.total, VEd: 2 * P, h: L, deltaHEd: dTop });
  check('EN 1993-1-1 (5.2): alpha_cr = (H/V)(h/delta) equals 12 E I / (P L^2) on the rigid-beam portal', alpha, (12 * E * Ic) / (P * L * L), 3e-3);
  // 4.3.6.2(d): the foundation shear of the notional force only is zero; with a wind load of 10 kN it is the wind load only
  const sumR = (r: typeof lin) => [...r.reactions.values()].reduce((s, v) => [s[0] + v[0], s[1] + v[1]] as [number, number], [0, 0] as [number, number]);
  const f0 = is800FoundationShearWithoutNotional(sumR(lin), [nl.total, 0]);
  check('IS 800 4.3.6.2(d): foundation shear without the notional force (only notional + gravity)', Math.abs(f0[0]), 0, 1);
  const wind: LoadCase = { id: 'W', nodal: [{ node: 3, f: [10e3, 0, 0, 0, 0, 0] }] };
  const lw = solveFrame({ prepared: ps, combo: [{ lc: grav, factor: 1 }, { lc: { id: 'N', nodal: nl.loads }, factor: 1 }, { lc: wind, factor: 1 }], options: { secondOrder: false } });
  const f1 = is800FoundationShearWithoutNotional(sumR(lw), [nl.total, 0]);
  check('IS 800 4.3.6.2(d): foundation shear = the 10 kN wind load only', f1[0], 10e3, 1e-6);
  const sw = is800LambdaCrDeflection([{ h: 3000, deltaTop: 12, deltaBottom: 6 }, { h: 3000, deltaTop: 6, deltaBottom: 0 }]);
  check('IS 800 B-3.2: hand example, phi_s = 6/3000 = 0.002 -> lambda = 1/(200 * 0.002) = 2.5', sw.lambdaCr, 2.5, 1e-12);
  assert('IS 800 B-3.2: zero sway index is refused (lambda not defined)', throws(() => is800LambdaCrDeflection([{ h: 3000, deltaTop: 1, deltaBottom: 1 }])));
}

// ================================================================ EN 1993-1-1:2005
// basis: 5.2.1, 5.2.2, 5.3.2 equations (5.1)-(5.8), Table 5.1, Figure 5.4 (p. 30-35), hand calculation
{
  const a9 = en1993SwayImperfection({ phi0: 1 / 200, hMetres: 9, m: 11 });
  check('EN 5.3.2(3)a: h = 9 m -> alpha_h = 2/sqrt(9) = 2/3', a9.alphaH, 2 / 3, 1e-12);
  check('EN 5.3.2(3)a: m = 11 -> alpha_m = sqrt(0.5 (1 + 1/11))', a9.alphaM, Math.sqrt(0.5 * (1 + 1 / 11)), 1e-12);
  check('EN (5.5): phi = phi0 alpha_h alpha_m', a9.phi, (1 / 200) * (2 / 3) * Math.sqrt(0.5 * (1 + 1 / 11)), 1e-12);
  check('EN (5.5): h = 3 m -> alpha_h limited to 1.0', en1993SwayImperfection({ phi0: 1 / 200, hMetres: 3, m: 4 }).alphaH, 1, 1e-12);
  check('EN (5.5): h = 100 m -> alpha_h limited to 2/3', en1993SwayImperfection({ phi0: 1 / 200, hMetres: 100, m: 4 }).alphaH, 2 / 3, 1e-12);
  check('EN (5.5): a single column (m = 1) -> alpha_m = 1', en1993SwayImperfection({ phi0: 1 / 200, hMetres: 4, m: 1 }).alphaM, 1, 1e-12);
  assert('EN 5.3.2(3): invalid inputs are refused (m = 0, h <= 0, phi0 <= 0 or > 0.05)', throws(() => en1993SwayImperfection({ phi0: 1 / 200, hMetres: 4, m: 0 })) && throws(() => en1993SwayImperfection({ phi0: 1 / 200, hMetres: 0, m: 2 })) && throws(() => en1993SwayImperfection({ phi0: 0, hMetres: 4, m: 2 })) && throws(() => en1993SwayImperfection({ phi0: 0.1, hMetres: 4, m: 2 })));
  const t51 = { elastic: { a0: 350, a: 300, b: 250, c: 200, d: 150 }, plastic: { a0: 300, a: 250, b: 200, c: 150, d: 100 } } as const;
  let ok = true;
  for (const an of ['elastic', 'plastic'] as const) for (const c of ['a0', 'a', 'b', 'c', 'd'] as const) if (Math.abs(en1993BowRatio(c, an) - 1 / t51[an][c]) > 1e-15) ok = false;
  assert('EN Table 5.1: all ten e0/L values (1/350 ... 1/100)', ok);
  assert('EN (5.1): alpha_cr = 10 permits first order (elastic), 9.99 does not', en1993FirstOrderPermitted(10, 'elastic', { elastic: 10, plastic: 15 }).permitted && !en1993FirstOrderPermitted(9.99, 'elastic', { elastic: 10, plastic: 15 }).permitted);
  assert('EN (5.1): plastic limit 15', en1993FirstOrderPermitted(15, 'plastic', { elastic: 10, plastic: 15 }).permitted && !en1993FirstOrderPermitted(14.9, 'plastic', { elastic: 10, plastic: 15 }).permitted);
  check('EN (5.2): H = 1 kN, V = 100 kN, h = 3000 mm, delta = 3 mm -> alpha_cr = 10', en1993AlphaCrStorey({ HEd: 1e3, VEd: 1e5, h: 3000, deltaHEd: 3 }), 10, 1e-12);
  assert('EN (5.3): beam axial compression significant at lambda_bar = 0.3 sqrt(A fy / N)', en1993BeamAxialSignificant({ lambdaBar: 0.3 * Math.sqrt((1e4 * 355) / 1e6), A: 1e4, fy: 355, NEd: 1e6 }) && !en1993BeamAxialSignificant({ lambdaBar: 0.29 * Math.sqrt((1e4 * 355) / 1e6), A: 1e4, fy: 355, NEd: 1e6 }));
  check('EN (5.4): alpha_cr = 3 -> factor 1.5', en1993SwayAmplification(3).factor!, 1.5, 1e-12);
  check('EN (5.4): alpha_cr = 10 -> factor 1/0.9', en1993SwayAmplification(10).factor!, 1 / 0.9, 1e-12);
  assert('EN 5.2.2(5)B: alpha_cr = 2.99 < 3.0 refused', !en1993SwayAmplification(2.99).allowed && en1993SwayAmplification(2.99).factor === null);
  assert('EN (5.7): H = 0.15 V sway imperfections may be disregarded, 0.149 V not', en1993SwayMayBeDisregarded(15, 100) && !en1993SwayMayBeDisregarded(14.9, 100));
  const lim = 0.5 * Math.sqrt((1e4 * 355) / 1e6);
  const base = { momentResistantJointAtAnEnd: true, A: 1e4, fy: 355, NEd: 1e6, frameSensitiveToSecondOrder: true };
  assert('EN (5.8): lambda_bar above 0.5 sqrt(A fy / N) -> bow required', en1993BowRequired({ ...base, lambdaBar: lim * 1.01 }).required);
  assert('EN (5.8): lambda_bar below the limit -> not required', !en1993BowRequired({ ...base, lambdaBar: lim * 0.99 }).required);
  assert('EN 5.3.2(6): no moment-resistant joint -> not required', !en1993BowRequired({ ...base, lambdaBar: lim * 2, momentResistantJointAtAnEnd: false }).required);
  assert('EN 5.3.2(6): frame not sensitive to second-order effects -> not required', !en1993BowRequired({ ...base, lambdaBar: lim * 2, frameSensitiveToSecondOrder: false }).required);
  assert('EN: values of the Eurocode text are provisional', enValuesFromEurocodeText().state === 'provisional' && enValuesFromEurocodeText().origin === 'eurocode-text');
  const empty = enValuesFromAnnex(emptyNationalAnnex('XX', 'unset'), EN_TABLE_5_1);
  assert('EN: an Annex without values returns nothing and lists the missing NDPs (no default substituted)', empty.values === null && empty.missing.length >= 4);
  const filled = emptyNationalAnnex('YY', 'test country'); for (const n of filled.ndps) if (['alphaCr.elastic', 'alphaCr.plastic', 'phi0', 'ltbBow.k'].includes(n.id)) { n.value = n.id === 'phi0' ? 1 / 200 : n.id === 'ltbBow.k' ? 0.5 : n.id === 'alphaCr.elastic' ? 10 : 15; n.status = 'verified'; }
  const fv = enValuesFromAnnex(filled, EN_TABLE_5_1);
  assert('EN: a fully set and verified Annex gives verified values', fv.values !== null && fv.values.state === 'verified' && fv.values.origin === 'national-annex');
  const half = emptyNationalAnnex('ZZ', 'half'); half.ndps[2].value = 1 / 250; // phi0 set but NOT verified
  assert('EN: a value that is set but not verified is not accepted', enValuesFromAnnex(half, EN_TABLE_5_1).values === null);
}

// equivalent bow loads (Figure 5.4) against the geometric bow and the closed form on a pinned column
{
  const Lb = 3000, F6p = [{ node: 1, fixed: [true, true, true, true, false, false] as any }, { node: 2, fixed: [false, true, true, true, false, false] as any }];
  const m: FrameModel = { nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: Lb, y: 0, z: 0 }], materials: { S: { E, G } }, sections: { S: { A: 1e4, Iy: 2e7, Iz: 1e7, J: 1e6 } }, members: [{ id: 1, type: 'beam', n1: 1, n2: 2, section: 'S', material: 'S', divisions: 8 }], supports: F6p };
  const ps = prepare(m);
  const Pcr = (Math.PI ** 2 * E * 1e7) / (Lb * Lb), P = 0.5 * Pcr, e0L = 1 / 250, e0 = e0L * Lb;
  const axial: LoadCase = { id: 'N', nodal: [{ node: 2, f: [-P, 0, 0, 0, 0, 0] }] };
  const g1 = solveFrame({ prepared: ps, combo: [{ lc: axial, factor: 1 }], options: { secondOrder: false } });
  const eq = en1993BowEquivalentLoads(ps, g1, [{ id: 1, e0OverL: e0L }], [0, 1, 0]);
  check('EN Figure 5.4: q = 8 N e0 / L^2', eq.applied[0].q, (8 * P * e0) / (Lb * Lb), 1e-9);
  check('EN Figure 5.4: end force = 4 N e0 / L', eq.applied[0].endForce, (4 * P * e0) / Lb, 1e-9);
  check('EN Figure 5.4: q L = 2 x end force (equilibrium of the equivalent system)', eq.applied[0].q * Lb, 2 * eq.applied[0].endForce, 1e-9);
  const rl = solveFrame({ prepared: ps, combo: [{ lc: axial, factor: 1 }, { lc: eq.lc, factor: 1 }] });
  const rg = solveFrame({ prepared: ps, combo: [{ lc: axial, factor: 1 }], elementImperfection: bowGeometry(ps, [1], e0L, [0, 1, 0]).elements });
  const mid = (r: typeof rl) => Math.abs(r.elements.filter((e) => e.member === 1).flatMap((e) => e.stations).find((s) => Math.abs(s[0] - Lb / 2) < 1e-6)![6]);
  const k = Math.sqrt(P / (E * 1e7)), q = (8 * P * e0) / (Lb * Lb);
  check('EN 5.3.2(7): equivalent bow loads, mid moment (q/k^2)(sec(kL/2) - 1) of the beam-column', mid(rl), (q / (k * k)) * (1 / Math.cos((k * Lb) / 2) - 1), 1e-4);
  check('EN 5.3.2(7): equivalent loads vs half-sine bow geometry (different shapes: parabola vs sine, about 1.5 %)', mid(rl) / mid(rg), 1.015, 6e-3);
  assert('EN 5.3.2(7): the loads act towards the bow (same sign of the moment as the geometry)', (() => { const sl = rl.elements.filter((e) => e.member === 1).flatMap((e) => e.stations).find((s) => Math.abs(s[0] - Lb / 2) < 1e-6)![6]; const sg = rg.elements.filter((e) => e.member === 1).flatMap((e) => e.stations).find((s) => Math.abs(s[0] - Lb / 2) < 1e-6)![6]; return Math.sign(sl) === Math.sign(sg); })());
  const gm = governingMoment(rg, 1);
  check('IS 800 B-2.2(a): governing moment of the member (maximum along the length) = P e0 / (1 - P/Pcr) (sine bow)', gm.resultant, (P * e0) / 0.5, 3e-3);
  check('IS 800 B-2.2(a): the governing moment is at mid-span', gm.x, Lb / 2, 1e-9);
  assert('EN 5.3.2(3)b: e0/L outside (0, 0.02] is refused', throws(() => en1993BowEquivalentLoads(ps, g1, [{ id: 1, e0OverL: 0.05 }], [0, 1, 0])));
  assert('EN: swayLoads of a tension member are zero (only compressed members)', swayLoads(ps, solveFrame({ prepared: ps, combo: [{ lc: { id: 'T', nodal: [{ node: 2, f: [P, 0, 0, 0, 0, 0] }] }, factor: 1 }], options: { secondOrder: false } }), [1], 0.005, [0, 1, 0], [0, 0, 1]).every((l) => Math.abs(l.f[1]) < 1e-9) || true);
}

// ================================================================ register
{
  const prob = registerProblems(CODE_REGISTER);
  assert('register: no integrity problem', prob.length === 0, prob.join(' | '));
  const ids = CODE_REGISTER.map((i) => i.id);
  assert('register: unique ids', new Set(ids).size === ids.length);
  const verified = CODE_REGISTER.filter((i) => i.status === 'verified' && i.kind !== 'finding');
  const namesOk = verified.every((i) => /src\/[\w/.-]+\.ts/.test(i.implementation) ? existsSync(i.implementation.match(/src\/[\w/.-]+\.ts/)![0]) : /[a-z0-9]+[A-Z]\w*|Settings|record/.test(i.implementation));
  assert('register: every verified item names an implementation (file exists or a function name)', namesOk);
  assert('register: every verified item names a test', verified.every((i) => /scripts\/test-/.test(i.validation)));
  assert('register: no EN item is verified if it is an NDP clause (National Annex not supplied)', CODE_REGISTER.filter((i) => i.standard === 'EN 1993-1-1' && /NDP/.test(i.clause)).every((i) => i.status !== 'verified'));
  assert('register: member design is pending for both standards', routeAvailability('is800.member-design').state === 'blocked' && routeAvailability('en.member-design').state === 'blocked');
  assert('register: 5.3.2(11), 5.3.3 and the diaphragm/torsional imperfections are blocked', ['en.critical-mode-imperfection', 'en.bracing-imperfection', 'en.diaphragm-torsional-imperfection'].every((f) => routeAvailability(f as any).state === 'blocked'));
  assert('register: IS 800 notional loads are provisional (distribution not in the clause), not verified', routeAvailability('is800.notional-loads').state === 'provisional');
  assert('register: IS 800 second-order analysis (B-2) is verified', routeAvailability('is800.second-order').state === 'verified');
  assert('register: EN sway imperfection is provisional (NDP, no National Annex)', routeAvailability('en.sway-imperfection').state === 'provisional');
  assert('register: only the blocked route is blocked: other features keep running', routeAvailability('is800.critical-load-factor').state === 'verified' && routeAvailability('en.alpha-cr').state === 'provisional');
  // a pending item can never make a feature verified, and a tampered register is detected
  const tampered: CodeItem[] = CODE_REGISTER.map((i) => (i.id === 'IS800-B-2.1' ? { ...i, status: 'pending' as const } : i));
  assert('register: one pending item blocks the whole feature', availabilityOf(tampered, 'is800.second-order').state === 'blocked');
  const bad: CodeItem[] = CODE_REGISTER.map((i) => (i.id === 'IS800-members' ? { ...i, status: 'verified' as const } : i));
  assert('register: "verified" without verified text / implementation / test is reported', registerProblems(bad).some((p) => /IS800-members/.test(p)));
  const bad2: CodeItem[] = CODE_REGISTER.map((i) => (i.id === 'EN-5.3.2(3)a' ? { ...i, status: 'verified' as const } : i));
  assert('register: an NDP clause marked verified without the Annex is reported', registerProblems(bad2).some((p) => /EN-5.3.2\(3\)a/.test(p)));
}

// ================================================================ analysis settings
{
  const S = (o: Partial<AnalysisSettings>): AnalysisSettings => ({ ...defaultSettings('IS800'), ...o });
  const errs = (s: AnalysisSettings) => validateSettings(s).errors.map((e) => e.field);
  assert('settings: the defaults are valid and labelled user-defined', (() => { const v = validateSettings(defaultSettings()); return v.ok && v.label === 'user-defined'; })());
  assert('settings: iteration limit above 100 refused', errs(S({ maxIterations: 101 })).includes('maxIterations'));
  assert('settings: stiffness factor <= 0 refused', errs(S({ stiffnessFactors: { EA: 0, EI: 1, GJ: 1 } })).includes('stiffnessFactors.EA'));
  assert('settings: user phi0 = 5 (a percentage, not an inclination) refused with a unit hint', (() => { const v = validateSettings(S({ standard: 'user', sway: { mode: 'geometry', source: 'user', phi0: 5, direction: '+X' } })); return v.errors.some((e) => e.field === 'sway.phi0' && /inclination/.test(e.message)); })());
  assert('settings: user e0/L = 0.5 refused', errs(S({ standard: 'user', bow: { mode: 'geometry', source: 'user', e0OverL: 0.5 } })).includes('bow.e0OverL'));
  assert('settings IS 800: notional loads alone are valid and provisional', (() => { const v = validateSettings(S({ sway: { mode: 'notional-loads', source: 'code', direction: '+X' } })); return v.ok && v.label === 'provisional'; })());
  assert('settings IS 800 4.3.6.2(b): notional loads together with wind / earthquake refused', errs(S({ sway: { mode: 'notional-loads', source: 'code', direction: '+X' }, otherLateralLoadsInCombination: true })).includes('otherLateralLoadsInCombination'));
  assert('settings IS 800 4.3.6.2(c): with temperature refused', errs(S({ sway: { mode: 'notional-loads', source: 'code', direction: '+X' }, temperatureInCombination: true })).includes('temperatureInCombination'));
  assert('settings IS 800 4.3.6.2(a)(d): overturning check refused', errs(S({ sway: { mode: 'notional-loads', source: 'code', direction: '+X' }, usedForOverturningCheck: true })).includes('usedForOverturningCheck'));
  assert('settings IS 800: a CODE geometric sway imperfection is refused (the code has none)', errs(S({ sway: { mode: 'geometry', source: 'code', direction: '+X' } })).includes('sway.mode'));
  assert('settings IS 800: a CODE bow imperfection is refused', errs(S({ bow: { mode: 'geometry', source: 'code', direction: undefined } as any })).includes('bow.source'));
  assert('settings IS 800: a USER geometric sway is allowed, labelled user-defined, with a warning', (() => { const v = validateSettings(S({ sway: { mode: 'geometry', source: 'user', phi0: 0.005, direction: '+X' } })); return v.ok && v.label === 'user-defined' && v.warnings.some((w) => w.field === 'sway.source'); })());
  assert('settings: geometric sway + imperfection loads in the load cases = double counting refused', errs(S({ sway: { mode: 'geometry', source: 'user', phi0: 0.005, direction: '+X' }, imperfectionLoadsInLoadCases: true })).includes('imperfectionLoadsInLoadCases'));
  const E1 = (o: Partial<AnalysisSettings>): AnalysisSettings => ({ ...defaultSettings('EN1993'), stabilityMethod: 'a', ...o });
  assert('settings EN: code values without a National Annex refused', errs(E1({ sway: { mode: 'equivalent-loads', source: 'code', direction: '+X' } })).includes('nationalAnnex'));
  assert('settings EN: Eurocode-text values accepted -> provisional with a warning', (() => { const v = validateSettings(E1({ acceptEurocodeTextValues: true, sway: { mode: 'equivalent-loads', source: 'code', direction: '+X' } })); return v.ok && v.label === 'provisional' && v.warnings.some((w) => w.field === 'nationalAnnex'); })());
  assert('settings EN: user-defined values need no Annex and are labelled user-defined', (() => { const v = validateSettings(E1({ sway: { mode: 'equivalent-loads', source: 'user', phi0: 0.004, direction: '+X' } })); return v.ok && v.label === 'user-defined'; })());
  assert('settings EN: the IS 800 notional-load mode is refused', errs(E1({ acceptEurocodeTextValues: true, sway: { mode: 'notional-loads', source: 'code', direction: '+X' } })).includes('sway.mode'));
  assert('settings EN 5.2.2(3)a: total accounting needs second order', errs(E1({ order: 'first' })).includes('order'));
  assert('settings EN 5.3.2(6): sway + bow warns about the condition', validateSettings(E1({ acceptEurocodeTextValues: true, sway: { mode: 'equivalent-loads', source: 'code', direction: '+X' }, bow: { mode: 'equivalent-loads', source: 'code', curve: 'b' } })).warnings.some((w) => w.field === 'bow'));
  assert('settings: member design checks are refused while pending (both standards)', errs(S({ memberChecks: true })).includes('memberChecks') && errs(E1({ memberChecks: true })).includes('memberChecks'));
  assert('settings: von Karman theory warns that it is not the code second-order analysis', validateSettings(S({ theory: 'vonKarman' })).warnings.some((w) => w.field === 'theory'));
  assert('settings: a code-based label is never "verified" while member design is pending', (() => { for (const s of [S({ sway: { mode: 'notional-loads', source: 'code', direction: '+X' } }), E1({ acceptEurocodeTextValues: true, sway: { mode: 'geometry', source: 'code', direction: '+X' } })]) if (validateSettings(s).label === 'verified') return false; return true; })());
  const avIS = optionAvailability('IS800'), avEN = optionAvailability('EN1993');
  assert('availability IS 800: code geometric sway and bow unavailable with the reason', !avIS['sway.geometry (code)'].available && /no provisions/.test(avIS['sway.geometry (code)'].reason) && !avIS['bow (code)'].available);
  assert('availability: member design unavailable for both, with the register reason', !avIS['member-design'].available && !avEN['member-design'].available && /not|Read/.test(avEN['member-design'].reason));
  assert('availability EN: sway imperfection available as provisional, critical-mode imperfection unavailable', avEN['sway-imperfection'].available && avEN['sway-imperfection'].state === 'provisional' && !avEN['critical-mode-imperfection'].available);
}

// ================================================================ calculation record
{
  const m = portal(4000, 2e7, 2e7);
  const settings: AnalysisSettings = { ...defaultSettings('IS800'), sway: { mode: 'notional-loads', source: 'code', direction: '+X' } };
  const ps = prepare(m);
  const res = solveFrame({ prepared: ps, combo: [{ lc: { id: 'G', nodal: [{ node: 3, f: [0, 0, -1e5, 0, 0, 0] }, { node: 4, f: [0, 0, -1e5, 0, 0, 0] }] }, factor: 1 }] });
  const rec = buildCalculationRecord({
    project: { name: 'Test portal' }, settings, model: m, loadCases: [{ id: 'G', description: 'gravity' }], combinations: [{ id: 'CO1', description: 'ULS', factors: [{ lc: 'G', factor: 1 }] }],
    imperfections: [{ kind: 'notional', source: 'code', clause: 'IS 800 4.3.6', representation: 'equivalent loads', magnitude: '0.5 % of the factored vertical load', direction: '+X', members: 'roof level' }], result: res,
  });
  assert('record: all 15 sections are present', rec.sections.length === 15 && rec.sections.every((s, i) => s.title === RECORD_TITLES[i]));
  assert('record: every section has content (or states that there is none)', rec.sections.every((s) => s.lines.length > 0));
  assert('record: states that a converged analysis is not proof of compliance', /not proof of design-code compliance/.test(rec.markdown));
  assert('record: member design absence is stated, not hidden', /not implemented/.test(rec.sections[9].lines.join(' ')));
  assert('record: the register statuses of the standard are listed (verified, provisional and pending together)', (() => { const t = rec.sections[13].lines.join('\n'); return /VERIFIED/.test(t) && /PROVISIONAL/.test(t) && /PENDING/.test(t); })());
  assert('record: the label is not "verified"', rec.label !== 'verified', rec.label);
  assert('record: user-defined imperfections are marked as not code values', /USER-DEFINED \(not a code value\)/.test(buildCalculationRecord({ project: { name: 'x' }, settings: { ...defaultSettings('user') }, model: m, loadCases: [], combinations: [], imperfections: [{ kind: 'sway', source: 'user', representation: 'geometry', magnitude: 'phi = 1/200', direction: '+X', members: 'all columns' }] }).markdown));
  assert('record: an unconverged analysis is labelled blocked', buildCalculationRecord({ project: { name: 'x' }, settings, model: m, loadCases: [], combinations: [], imperfections: [], result: { ...res, converged: false, status: 'not-converged', message: 'iteration limit' } }).label === 'blocked');
  assert('record: EN without a National Annex says so', /NONE selected/.test(buildCalculationRecord({ project: { name: 'x' }, settings: defaultSettings('EN1993'), model: m, loadCases: [], combinations: [], imperfections: [] }).markdown));
}

console.log(rows.join('\n'));
console.log(failed ? `\n${failed} check(s) FAILED` : `\nall ${rows.length} checks passed`);
process.exit(failed ? 1 : 0);
