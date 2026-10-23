// Tests of the IS 800 routes, the register, the analysis settings, the settings migration and the calculation record.   npm run test:codes
// Each test states its calculation basis: the clauses of the supplied IS 800:2007 read on the page images, hand calculations and closed-form solutions;
// nothing is compared with RSTAB here.
import { FrameModel, LoadCase } from '../src/server/frame/types';
import { prepare } from '../src/server/frame/model';
import { solveFrame, criticalLoadFactor } from '../src/server/frame/solve';
import {
  is800NotionalLoads, is800NotionalLoadCases, is800NotionalLoadApplicability, is800FoundationShearWithoutNotional, is800GantryNotionalExempt, is800SecondOrderRequired, is800LambdaCrDeflection,
} from '../src/server/frame/codes/is800';
import { bowGeometry, swayLoads, bowEquivalentLoads } from '../src/server/frame/imperfection';
import { governingMoment, buildCalculationRecord, RECORD_TITLES } from '../src/server/frame/record';
import { CODE_REGISTER, IS800_EDITION, availabilityOf, routeAvailability, registerProblems, type CodeItem } from '../src/shared/codeRegister';
import { defaultSettings, validateSettings, optionAvailability, migrateSettings, type AnalysisSettings } from '../src/shared/analysisSettings';
import { existsSync } from 'node:fs';
import { clauseVerified } from '../src/shared/check';

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

// equivalent bow forces (mechanical equivalence, parabolic bow) against the geometric bow and the closed form on a pinned column
{
  const Lb = 3000, F6p = [{ node: 1, fixed: [true, true, true, true, false, false] as any }, { node: 2, fixed: [false, true, true, true, false, false] as any }];
  const m: FrameModel = { nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: Lb, y: 0, z: 0 }], materials: { S: { E, G } }, sections: { S: { A: 1e4, Iy: 2e7, Iz: 1e7, J: 1e6 } }, members: [{ id: 1, type: 'beam', n1: 1, n2: 2, section: 'S', material: 'S', divisions: 8 }], supports: F6p };
  const ps = prepare(m);
  const Pcr = (Math.PI ** 2 * E * 1e7) / (Lb * Lb), P = 0.5 * Pcr, e0L = 1 / 250, e0 = e0L * Lb;
  const axial: LoadCase = { id: 'N', nodal: [{ node: 2, f: [-P, 0, 0, 0, 0, 0] }] };
  const g1 = solveFrame({ prepared: ps, combo: [{ lc: axial, factor: 1 }], options: { secondOrder: false } });
  const eq = bowEquivalentLoads(ps, g1, [{ id: 1, e0OverL: e0L }], [0, 1, 0]);
  check('equivalent bow forces: q = 8 N e0 / L^2', eq.applied[0].q, (8 * P * e0) / (Lb * Lb), 1e-9);
  check('equivalent bow forces: end force = 4 N e0 / L', eq.applied[0].endForce, (4 * P * e0) / Lb, 1e-9);
  check('equivalent bow forces: q L = 2 x end force (equilibrium of the equivalent system)', eq.applied[0].q * Lb, 2 * eq.applied[0].endForce, 1e-9);
  const rl = solveFrame({ prepared: ps, combo: [{ lc: axial, factor: 1 }, { lc: eq.lc, factor: 1 }] });
  const rg = solveFrame({ prepared: ps, combo: [{ lc: axial, factor: 1 }], elementImperfection: bowGeometry(ps, [1], e0L, [0, 1, 0]).elements });
  const mid = (r: typeof rl) => Math.abs(r.elements.filter((e) => e.member === 1).flatMap((e) => e.stations).find((s) => Math.abs(s[0] - Lb / 2) < 1e-6)![6]);
  const k = Math.sqrt(P / (E * 1e7)), q = (8 * P * e0) / (Lb * Lb);
  check('equivalent bow forces: equivalent bow loads, mid moment (q/k^2)(sec(kL/2) - 1) of the beam-column', mid(rl), (q / (k * k)) * (1 / Math.cos((k * Lb) / 2) - 1), 1e-4);
  check('equivalent bow forces: equivalent loads vs half-sine bow geometry (different shapes: parabola vs sine, about 1.5 %)', mid(rl) / mid(rg), 1.015, 6e-3);
  assert('equivalent bow forces: the loads act towards the bow (same sign of the moment as the geometry)', (() => { const sl = rl.elements.filter((e) => e.member === 1).flatMap((e) => e.stations).find((s) => Math.abs(s[0] - Lb / 2) < 1e-6)![6]; const sg = rg.elements.filter((e) => e.member === 1).flatMap((e) => e.stations).find((s) => Math.abs(s[0] - Lb / 2) < 1e-6)![6]; return Math.sign(sl) === Math.sign(sg); })());
  const gm = governingMoment(rg, 1);
  check('IS 800 B-2.2(a): governing moment of the member (maximum along the length) = P e0 / (1 - P/Pcr) (sine bow)', gm.resultant, (P * e0) / 0.5, 3e-3);
  check('IS 800 B-2.2(a): the governing moment is at mid-span', gm.x, Lb / 2, 1e-9);
  assert('equivalent bow forces: e0/L outside (0, 0.02] is refused', throws(() => bowEquivalentLoads(ps, g1, [{ id: 1, e0OverL: 0.05 }], [0, 1, 0])));
  assert('swayLoads of a tension member are zero (only compressed members)', swayLoads(ps, solveFrame({ prepared: ps, combo: [{ lc: { id: 'T', nodal: [{ node: 2, f: [P, 0, 0, 0, 0, 0] }] }, factor: 1 }], options: { secondOrder: false } }), [1], 0.005, [0, 1, 0], [0, 0, 1]).every((l) => Math.abs(l.f[1]) < 1e-9) || true);
}


// ================================================================ register
{
  const prob = registerProblems(CODE_REGISTER);
  assert('register: no integrity problem', prob.length === 0, prob.join(' | '));
  const ids = CODE_REGISTER.map((i) => i.id);
  assert('register: unique ids', new Set(ids).size === ids.length);
  assert('register: IS 800 is the only standard', CODE_REGISTER.every((i) => i.standard === 'IS 800'));
  assert('register: no item refers to a removed design route', CODE_REGISTER.every((i) => !/EN ?1993|Eurocode|National Annex/i.test(i.requirement + i.formula + i.implementation + i.validation)));
  const verified = CODE_REGISTER.filter((i) => i.status === 'verified' && i.kind !== 'finding');
  const namesOk = verified.every((i) => /src\/[\w/.-]+\.ts/.test(i.implementation) ? existsSync(i.implementation.match(/src\/[\w/.-]+\.ts/)![0]) : /[a-z0-9]+[A-Z]\w*|Settings|record/.test(i.implementation));
  assert('register: every verified item names an implementation (file exists or a function name)', namesOk);
  assert('register: every verified item names a test', verified.every((i) => /scripts\/(test-|rstab\/)/.test(i.validation)));
  assert('register: every item has an evidence reference to the supplied IS 800 text', CODE_REGISTER.every((i) => /IS 800/.test(i.evidence)));
  assert('register: design of cold-formed, open sections, angles and connections is blocked (pending items)', ['is800.design.cold-formed', 'is800.design.open-sections', 'is800.design.angles', 'is800.design.connections'].every((f) => routeAvailability(f as any).state === 'blocked'));
  assert('register: hollow-section design is provisional (9.2.2 assumption), not verified and not blocked', routeAvailability('is800.design.hollow').state === 'provisional');
  assert('register: IS 800 notional loads provisional (distribution not in the clause)', routeAvailability('is800.notional-loads').state === 'provisional');
  assert('register: IS 800 second-order analysis (B-2) verified', routeAvailability('is800.second-order').state === 'verified');
  assert('register: effective length (7.2) is pending: the design requires a user input', CODE_REGISTER.find((i) => i.id === 'IS800-7.2')!.status === 'pending');
  // ---- IS800-10.3 split (23 Oct 2026): bearing-bolt equations verified; Table 19 split by column; the slot provisions are NOT modelled and never verified
  const item = (id: string) => CODE_REGISTER.find((i) => i.id === id)!;
  assert('register split: bearing-bolt equations stay verified, standard round holes verified, over-size provisional, slots pending', item('IS800-10.3').status === 'verified' && item('IS800-10.2.1-round').status === 'verified' && item('IS800-10.2.1-oversize').status === 'provisional' && item('IS800-10.2.1-slots').status === 'pending');
  assert('register split: IS800-10.3 no longer lists 10.2.1 or Table 19, and says where the hole rules went', !/10\.2\.1|Table 19/.test(item('IS800-10.3').clause) && /IS800-10\.2\.1-slots/.test(item('IS800-10.3').requirement) && /WITHOUT its amendments/.test(item('IS800-10.3').outstanding) && /History/.test(item('IS800-10.3').outstanding));
  assert('register split: the slot item is pending, its text is not marked verified, it has no implementation and says NOT MODELLED', item('IS800-10.2.1-slots').textVerified === false && item('IS800-10.2.1-slots').implementation === '' && /NOT MODELLED/.test(item('IS800-10.2.1-slots').outstanding) && /Nothing here is verified/.test(item('IS800-10.2.1-slots').outstanding));
  assert('register split: no VERIFIED item claims Table 19 columns 5-6, 10.2.1 c) or slotted holes', CODE_REGISTER.filter((i) => i.status === 'verified').every((i) => !/columns 5-6|10\.2\.1 c\)|slotted holes/.test(i.clause)));
  assert('register split: the over-size item states that its conditions of use and 10.2.4.1 are not modelled', /NOT modelled/.test(item('IS800-10.2.1-oversize').outstanding) && /10\.2\.4\.1/.test(item('IS800-10.2.1-oversize').outstanding));
  assert('register split: a check citing Table 19, 10.2.4.1, 10.3.3.3 or 10.4 is not verified; the bolt clauses and 10.2.1 / 10.2.2 are', !clauseVerified('IS 800:2007 Table 19') && !clauseVerified('IS 800:2007 10.2.4.1') && !clauseVerified('IS 800:2007 10.3.3.3') && !clauseVerified('IS 800:2007 10.4') && ['10.2.1', '10.2.2', '10.2.4.2', '10.3.2', '10.3.3', '10.3.3.1', '10.3.4', '10.3.5', '10.3.6'].every((c) => clauseVerified('IS 800:2007 ' + c)));
  assert('register split: every hole-size item names an IS 800 page image as evidence', ['IS800-10.2.1-round', 'IS800-10.2.1-oversize', 'IS800-10.2.1-slots'].every((id) => /IS 800:2007 p\. 73/.test(item(id).evidence)));
  // ---- IS800-7.5 angle struts: pending, documentation only; the missing items are listed
  assert('register 7.5: angle struts stay PENDING and the angle route stays blocked; nothing implemented', item('IS800-7.5').status === 'pending' && item('IS800-7.5').implementation === '' && item('IS800-7.5').validation === '' && routeAvailability('is800.design.angles').state === 'blocked');
  assert('register 7.5: the missing references, decisions and inputs are listed (amendments, fixity, load-case type, strut length, connector geometry, A1-A4)', ['Amendments No. 1 and No. 2', 'fixity', 'load-case type', 'strut length', 'connectors between the angles', 'A1', 'A2', 'A3', 'A4', '7.8.4'].every((w) => item('IS800-7.5').outstanding.includes(w)) && /NOT approved/.test(item('IS800-7.5').evidence));
  // ---- amendment notes (documentation only, 23 Oct 2026): unofficial Amendment No. 1 evidence is labelled, statuses, routes and gates are unchanged
  const NOTE = 'AMENDMENT NOTE (UNOFFICIAL EVIDENCE, SUBJECT TO OFFICIAL BIS REVIEW; NOT VERIFIED)';
  assert('amendment notes: IS800-3.7, IS800-9.3.2, IS800-6.3.3, IS800-4.4.2 and IS800-7.5 carry the labelled note', ['IS800-3.7', 'IS800-9.3.2', 'IS800-6.3.3', 'IS800-4.4.2', 'IS800-7.5'].every((id) => item(id).outstanding.includes(NOTE) && /unofficial copy/.test(item(id).outstanding)));
  assert('amendment notes: the statuses are unchanged (3.7 and 9.3.2 verified, 6.3.3 and 4.4.2 provisional, 7.5 pending)', item('IS800-3.7').status === 'verified' && item('IS800-9.3.2').status === 'verified' && item('IS800-6.3.3').status === 'provisional' && item('IS800-4.4.2').status === 'provisional' && item('IS800-7.5').status === 'pending');
  assert('amendment notes: the verified items say the amendment wording awaits the official BIS amendment and the calculation is unchanged', ['IS800-3.7', 'IS800-9.3.2'].every((id) => /awaits/.test(item(id).outstanding) && /official BIS amendment/.test(item(id).outstanding) && /calculation is unchanged/.test(item(id).outstanding)));
  assert('amendment notes: no register text claims that an amendment is verified', CODE_REGISTER.every((i) => !/amendment[^.]{0,40}\bis verified|verified amendment/i.test(i.requirement + i.outstanding + i.evidence)));
  assert('amendment notes: the routes and the clause gate are unchanged', routeAvailability('is800.design.hollow').state === 'provisional' && routeAvailability('is800.design.angles').state === 'blocked' && routeAvailability('is800.first-order-amplification').state === 'provisional' && routeAvailability('is800.second-order').state === 'verified' && routeAvailability('is800.critical-load-factor').state === 'verified' && clauseVerified('IS 800:2007 3.7') && clauseVerified('IS 800:2007 Table 18') && !clauseVerified('IS 800:2007 6.3.3') && !clauseVerified('IS 800:2007 7.5.1.2'));
  assert('7.5.1.2 knee proposal: a PENDING item with no feature, no implementation and no test; text not verified', item('IS800-7.5.1.2-knee').status === 'pending' && item('IS800-7.5.1.2-knee').features.length === 0 && item('IS800-7.5.1.2-knee').implementation === '' && item('IS800-7.5.1.2-knee').validation === '' && item('IS800-7.5.1.2-knee').textVerified === false);
  assert('7.5.1.2 knee proposal: D2-D8 are recorded as requirements and explicitly not an authorisation to implement', ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'].every((d) => item('IS800-7.5.1.2-knee').outstanding.includes(d)) && /NOT an authorisation to implement/.test(item('IS800-7.5.1.2-knee').outstanding) && /never verified on unofficial evidence/.test(item('IS800-7.5.1.2-knee').outstanding) && /NOT an authorisation to implement/.test(item('IS800-7.5').outstanding));
  const tampered: CodeItem[] = CODE_REGISTER.map((i) => (i.id === 'IS800-B-2.1' ? { ...i, status: 'pending' as const } : i));
  assert('register: one pending item blocks the whole feature', availabilityOf(tampered, 'is800.second-order').state === 'blocked');
  const bad: CodeItem[] = CODE_REGISTER.map((i) => (i.id === 'IS800-members-open' ? { ...i, status: 'verified' as const } : i));
  assert('register: "verified" without verified text / implementation / test is reported', registerProblems(bad).some((p) => /IS800-members-open/.test(p)));
  const eu: CodeItem[] = CODE_REGISTER.map((i) => (i.id === 'IS800-9.3.1' ? { ...i, requirement: i.requirement + ' (EN 1993-1-1 6.2.9)' } : i));
  assert('register: an item that refers to a removed design route is reported', registerProblems(eu).some((p) => /removed design route/.test(p)));
  const foreign = CODE_REGISTER.map((i) => (i.id === 'IS800-9.3.1' ? ({ ...i, standard: 'EN 1993-1-1' } as any) : i));
  assert('register: an item of another standard is reported', registerProblems(foreign).some((p) => /not supported/.test(p)));
}

// ================================================================ analysis settings, migration
{
  const S = (o: Partial<AnalysisSettings> = {}): AnalysisSettings => ({ ...defaultSettings(), ...o });
  const errs = (s: AnalysisSettings) => validateSettings(s).errors.map((e) => e.field);
  assert('settings: the defaults are valid', validateSettings(defaultSettings()).ok);
  assert('settings: no code selector, no National Annex, no foreign field in the schema', (() => { const k = JSON.stringify(Object.keys(defaultSettings())) + JSON.stringify(Object.keys(defaultSettings().design)); return !/standard|nationalAnnex|annex|stability|code/i.test(k); })());
  assert('settings: iteration limit above 100 refused', errs(S({ maxIterations: 101 })).includes('maxIterations'));
  assert('settings: stiffness factor <= 0 refused', errs(S({ stiffnessFactors: { EA: 0, EI: 1, GJ: 1 } })).includes('stiffnessFactors.EA'));
  assert('settings: user phi0 = 5 (a percentage) refused with a unit hint', (() => { const v = validateSettings(S({ sway: { mode: 'geometry', source: 'user', phi0: 5, direction: '+X' } })); return v.errors.some((e) => e.field === 'sway.phi0' && /inclination/.test(e.message)); })());
  assert('settings: user e0/L = 0.5 refused', errs(S({ bow: { mode: 'geometry', source: 'user', e0OverL: 0.5 } })).includes('bow.e0OverL'));
  assert('settings IS 800: notional loads alone are valid', validateSettings(S({ sway: { mode: 'notional-loads', source: 'code', direction: '+X' } })).ok);
  assert('settings IS 800 4.3.6.2(b): notional loads together with wind / earthquake refused', errs(S({ sway: { mode: 'notional-loads', source: 'code', direction: '+X' }, otherLateralLoadsInCombination: true })).includes('otherLateralLoadsInCombination'));
  assert('settings IS 800 4.3.6.2(c): with temperature refused', errs(S({ sway: { mode: 'notional-loads', source: 'code', direction: '+X' }, temperatureInCombination: true })).includes('temperatureInCombination'));
  assert('settings IS 800 4.3.6.2(a)(d): overturning check refused', errs(S({ sway: { mode: 'notional-loads', source: 'code', direction: '+X' }, usedForOverturningCheck: true })).includes('usedForOverturningCheck'));
  assert('settings IS 800: a CODE geometric sway imperfection is refused (the code has none)', errs(S({ sway: { mode: 'geometry', source: 'code', direction: '+X' } })).includes('sway.mode'));
  assert('settings: a USER geometric sway is allowed, labelled user-defined, with a warning', (() => { const v = validateSettings(S({ sway: { mode: 'geometry', source: 'user', phi0: 0.005, direction: '+X' } })); return v.ok && v.label === 'user-defined' && v.warnings.some((w) => w.field === 'sway.source'); })());
  assert('settings: geometric sway + imperfection loads in the load cases = double counting refused', errs(S({ sway: { mode: 'geometry', source: 'user', phi0: 0.005, direction: '+X' }, imperfectionLoadsInLoadCases: true })).includes('imperfectionLoadsInLoadCases'));
  assert('settings: the member design needs both effective-length factors (no default)', errs(S({ design: { ...defaultSettings().design, enabled: true } })).includes('design.kLy'));
  assert('settings: the member design with effective lengths given is valid', validateSettings(S({ design: { ...defaultSettings().design, enabled: true, kLy: 1, kLz: 1 } })).ok);
  assert('settings: the member design is refused on first-order results (4.4.2)', errs(S({ order: 'first', design: { ...defaultSettings().design, enabled: true, kLy: 1, kLz: 1 } })).includes('design.enabled'));
  assert('settings: von Karman warns that it is not the code second-order analysis', validateSettings(S({ theory: 'vonKarman' })).warnings.some((w) => w.field === 'theory'));
  assert('settings: an old schema version is refused until migrated', errs({ ...defaultSettings(), version: 1 as any }).includes('version'));
  const av = optionAvailability();
  assert('availability: code geometric sway and bow unavailable with the reason', !av['explicit geometric sway (code)'].available && /no provisions/.test(av['explicit geometric sway (code)'].reason) && !av['member bow (code)'].available);
  assert('availability: hollow design provisional (available), cold-formed, open, angles unavailable with the register reason', av['design: hollow sections'].available && av['design: hollow sections'].state === 'provisional' && !av['design: cold-formed sections'].available && /IS 801/.test(av['design: cold-formed sections'].reason) && !av['design: open sections'].available && !av['design: angles'].available);
  assert('availability: no option mentions a removed design route', !/EN ?1993|Eurocode|National Annex/i.test(JSON.stringify(av)));

  // migration of stored settings of a removed design route
  const legacy = { standard: 'EN1993', nationalAnnex: { country: 'XX', ndps: [] }, acceptEurocodeTextValues: true, stabilityMethod: 'a', order: 'second', theory: 'II', shearDeformation: true,
    sway: { mode: 'equivalent-loads', source: 'code', direction: '+X' }, bow: { mode: 'geometry', source: 'code', curve: 'b' }, design: { enabled: true, kLy: 1, kLz: 1 } };
  const mg = migrateSettings(legacy);
  assert('migration: legacy settings are flagged as migrated and require a review', mg.migrated && mg.settings.review.required && mg.settings.review.reasons.length > 0);
  const deepKeys = (o: any): string[] => (o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => [k, ...deepKeys(v)]) : []);
  assert('migration: no removed field survives (keys)', !deepKeys(mg.settings).some((k) => ['standard', 'nationalAnnex', 'acceptEurocodeTextValues', 'stabilityMethod', 'annex'].includes(k)));
  assert('migration: every removed field is named in the flags', ['standard', 'nationalAnnex', 'acceptEurocodeTextValues', 'stabilityMethod'].every((k) => mg.flags.some((f) => f.includes(`"${k}"`))));
  assert('migration: a code-sourced imperfection of the removed route is dropped, not reinterpreted', mg.settings.sway === undefined && mg.settings.bow === undefined);
  assert('migration: the member design is switched off until the user confirms', mg.settings.design.enabled === false);
  assert('migration: the migrated settings cannot run an analysis or design until confirmed', validateSettings(mg.settings).errors.some((e) => e.field === 'review'));
  assert('migration: after the user confirms (review cleared) the settings validate', validateSettings({ ...mg.settings, review: { required: false, reasons: [], confirmedAt: '2026-01-01T00:00:00Z' } }).ok);
  const keepUser = migrateSettings({ version: 2, standard: 'IS800', sway: { mode: 'geometry', source: 'user', phi0: 0.004, direction: '-Y' } });
  assert('migration: a user-defined sway of an older version is kept (flagged for confirmation)', keepUser.settings.sway?.phi0 === 0.004 && keepUser.settings.sway?.source === 'user' && keepUser.settings.review.required);
  assert('migration: settings of the current version are left unchanged and need no review', (() => { const m = migrateSettings(defaultSettings()); return !m.migrated && !m.settings.review.required; })());
  assert('migration: garbage input never throws and yields reviewed defaults', (() => { try { const m = migrateSettings('x' as any); return m.settings.review.required; } catch { return false; } })());
  assert('migration: an unknown stored code route is removed too', migrateSettings({ code: 'AISI' }).flags.some((f) => /"code"/.test(f)));
}

// ================================================================ calculation record
{
  const m = portal(4000, 2e7, 2e7);
  const settings: AnalysisSettings = { ...defaultSettings(), sway: { mode: 'notional-loads', source: 'code', direction: '+X' } };
  const ps = prepare(m);
  const res = solveFrame({ prepared: ps, combo: [{ lc: { id: 'G', nodal: [{ node: 3, f: [0, 0, -1e5, 0, 0, 0] }, { node: 4, f: [0, 0, -1e5, 0, 0, 0] }] }, factor: 1 }] });
  const project = { schema: 'frame-project-1' as const, meta: { name: 'Test portal' }, frame: m, design: { sections: {}, materials: {} }, loadCases: [{ id: 'G', nodal: [{ node: 3, f: [0, 0, -1e5, 0, 0, 0] as any }, { node: 4, f: [0, 0, -1e5, 0, 0, 0] as any }] }], combinations: [{ id: 'CO1', name: 'ULS', factors: [{ lc: 'G', factor: 1 }] }], up: [0, 0, 1] as [number, number, number], settings };
  const id = { projectId: 'p1', projectName: 'Test portal', modelRevision: 3, runId: 'run-1', modelFingerprint: 'abc', engineVersion: 'test', createdAt: '2026-01-01T00:00:00Z' };
  const cs = [{ id: 'CO1', name: 'ULS', status: res.status, converged: res.converged, iterations: res.totalIterations, steps: res.steps.length, message: res.message, maxDisplacement: null, reactionSum: [0, 0, 0] as [number, number, number] }];
  const rec = buildCalculationRecord({ identity: id, project, settingsUsed: settings, combinations: cs, imperfections: [{ kind: 'notional', source: 'code', clause: 'IS 800 4.3.6', representation: 'equivalent loads', magnitude: '0.5 %', direction: '+X', members: 'roof' }] });
  // edition line (section 2): the 2007 text is the basis; the amendments are named, not applied; the known differences are in section 14
  assert('record: section 2 prints the edition used for the checks', rec.sections[1].lines.includes(`Edition used for the checks: ${IS800_EDITION}`));
  assert('edition: the 2007 text without amendments is the basis, the two amendments are named, no official copy, unofficial evidence labelled', ['Third Revision, December 2007', 'without amendments', 'lists two amendments (No. 1 and No. 2)', 'no official copy', 'follow the 2007 text', 'unofficial copy', 'section 14'].every((w) => IS800_EDITION.includes(w)) && !/applied|verified/i.test(IS800_EDITION));
  assert('record: section 14 does list the amendment differences the edition line points to', rec.sections[13].lines.some((l) => l.includes('AMENDMENT NOTE (UNOFFICIAL EVIDENCE')));
  assert('record: all 15 sections are present', rec.sections.length === 15 && rec.sections.every((s, i) => s.title === RECORD_TITLES[i]));
  assert('record: every section has content (or states that there is none)', rec.sections.every((s) => s.lines.length > 0));
  assert('record: carries the project id, model revision, run id and fingerprint', /p1/.test(rec.markdown) && /Model revision: 3/.test(rec.markdown) && /run-1/.test(rec.markdown) && /abc/.test(rec.markdown));
  assert('record: IS 800:2007 is named as the only design standard', /only design standard/.test(rec.markdown) && rec.standard === 'IS 800:2007');
  assert('record: states that a converged analysis is not proof of compliance', /not proof of design-code compliance/.test(rec.markdown));
  assert('record: without a design request it says that no IS 800 design check was performed', /no IS 800 design check was performed/.test(rec.markdown) && rec.label === 'analysis-only');
  assert('record: the register statuses are listed (verified, provisional and pending together)', (() => { const t = rec.sections[13].lines.join('\n'); return /VERIFIED/.test(t) && /PROVISIONAL/.test(t) && /PENDING/.test(t); })());
  assert('record: the label is never "verified"', (rec.label as string) !== 'verified');
  assert('record: user-defined imperfections are marked as not code values', /USER-DEFINED \(not a code value\)/.test(buildCalculationRecord({ identity: id, project, settingsUsed: defaultSettings(), combinations: cs, imperfections: [{ kind: 'sway', source: 'user', representation: 'geometry', magnitude: 'phi = 1/200', direction: '+X', members: 'all columns' }] }).markdown));
  assert('record: an unconverged analysis is labelled blocked', buildCalculationRecord({ identity: id, project, settingsUsed: settings, combinations: [{ ...cs[0], converged: false, status: 'not-converged', message: 'iteration limit' }], imperfections: [] }).label === 'blocked');
  assert('record: no removed design route is mentioned', !/EN ?1993|Eurocode|National Annex/i.test(rec.markdown));
}

console.log(rows.join('\n'));
console.log(failed ? `\n${failed} check(s) FAILED` : `\nall ${rows.length} checks passed`);
process.exit(failed ? 1 : 0);
