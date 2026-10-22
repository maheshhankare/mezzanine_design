// @ts-nocheck — ported from the mockup (index.html, 50_member.js). The structural ANALYSIS (internal forces, elastic lateral-torsional buckling, torsion, deflection) is kept; the
// RESISTANCES of cold-formed members belonged to a removed design route and are not implemented: IS 801 was not supplied, so every resistance check is reported as REVIEW.
import "server-only";
import { LOADS } from './loads';
import { SEC } from './section';
import { U } from '@/shared/util';
import { CHK } from '@/shared/check';
import { FE } from './fe';
// ===== Member design of a C-section arrangement (single / back-to-back / four C) =====
export const MEM: any = (() => {
  const s = CHK.s, kN = x => x / 1e3, kNm = x => x / 1e6;
  const curveAlpha = { a0: 0.13, a: 0.21, b: 0.34, c: 0.49, d: 0.76 };
  function chi(lam, alpha) { if (lam <= 0.2) return 1; const ph = 0.5 * (1 + alpha * (lam - 0.2) + lam * lam); return Math.min(1, 1 / (ph + Math.sqrt(Math.max(0, ph * ph - lam * lam)))); }

  function loadsCase(spec, aG, aQ, qSpans) {
    // qSpans: null = Q everywhere; array of booleans per span = pattern
    const spans = spec.supports;
    const inSpan = x => { for (let i = 0; i < spans.length - 1; i++) if (x >= spans[i] - 1e-6 && x <= spans[i + 1] + 1e-6) return i; return 0; };
    const qOn = x => !qSpans || qSpans[inSpan(x)];
    const udl = [];
    for (const u of spec.G.udl) udl.push({ x0: u.x0, x1: u.x1, w: aG * u.w });
    for (const u of spec.Q.udl) {
      for (let i = 0; i < spans.length - 1; i++) { const a = Math.max(u.x0, spans[i]), b = Math.min(u.x1, spans[i + 1]); if (b > a && (!qSpans || qSpans[i])) udl.push({ x0: a, x1: b, w: aQ * u.w }); }
    }
    const pts = [];
    for (const p of spec.G.points) pts.push({ x: p.x, P: aG * p.P });
    for (const p of spec.Q.points) if (qOn(p.x)) pts.push({ x: p.x, P: aQ * p.P });
    return { udl, points: pts };
  }
  function analyse(spec, EI, aG, aQ, qSpans, kind) {
    const lc = loadsCase(spec, aG, aQ, qSpans);
    // external global analysis (unified Mezzanine app): the beam is analysed in its frame line (columns, knee braces, bracing)
    if (spec.ga) { const r = spec.ga(lc, EI, aG, aQ, qSpans, kind || 'uls'); if (r) return r; }
    const sup = spec.supports.map((x, i) => {
      const end = i === 0 || i === spec.supports.length - 1;
      return { x, v: true, r: end && spec.endKr ? spec.endKr : false };
    });
    // knee braces in the engine's own model (no global analysis): elastic vertical supports at the knee points (spec.knees, 85_model)
    const r = FE.beam({ L: spec.L, EI, supports: sup, points: lc.points, udl: lc.udl, nEl: 80, springs: spec.knees ? spec.knees.map(k => ({ x: k.x, k: k.k })) : undefined });
    if (spec.knees && !r.error) r.knee = true;
    return r;
  }

  // Resistances of cold-formed C-sections are governed by IS 801 (not supplied, not implemented): the demand is reported, the resistance is pending.
  const NEED = 'The resistance of a cold-formed section needs IS 801 (cold-formed light gauge sections), which is not implemented: the check is pending (REVIEW).';

  function design(spec) {
    const { R, p, arr, mat } = spec, E = mat.E, G = E / (2 * (1 + mat.nu)), fy = mat.fy, fu = mat.fu, t = p.t;
    const checks = [], notes = [], add = c => { checks.push(c); return c; };
    const geomErr = SEC.validate(p);
    if (geomErr.length) return { error: geomErr, checks: [], notes: geomErr };
    const nC = arr === 'single' ? 1 : arr === 'b2b' ? 2 : 4;
    const opt = { gap: spec.opt.gap, pairSpacing: spec.opt.pairSpacing };
    const gr = SEC.gross(p, arr, opt), one = SEC.gross(p, 'single');
    // ---------- loads and in-plane analysis ----------
    const sumG = spec.G.udl.reduce((a, u) => a + u.w * (u.x1 - u.x0), 0) + spec.G.points.reduce((a, q) => a + q.P, 0);
    const sumQ = spec.Q.udl.reduce((a, u) => a + u.w * (u.x1 - u.x0), 0) + spec.Q.points.reduce((a, q) => a + q.P, 0);
    const comb = LOADS.uls(R, spec.I, sumG, sumQ);
    const EIy = E * gr.Iyy;
    const nsp = spec.supports.length - 1;
    const pats = [null]; if (nsp > 1) { pats.push(U.range(nsp, i => i % 2 === 0)); pats.push(U.range(nsp, i => i % 2 === 1)); }
    const uls = pats.map(pt => analyse(spec, EIy, comb.aG, comb.aQ, pt));
    if (uls[0].error) return { error: [uls[0].error], checks: [], notes: [] };
    const env = { Mmax: Math.max(...uls.map(a => a.Mmax)), Mmin: Math.min(...uls.map(a => a.Mmin)), V: Math.max(...uls.map(a => a.Vabs)) };
    const R0 = uls[0].reactions;
    const kneeR = spec.knees ? { uls: Math.max(0, ...uls.flatMap(a => (a.springR || []).map(q => q.R))), min: Math.min(0, ...uls.flatMap(a => (a.springR || []).map(q => q.R))) } : null;
    const Rmax = spec.supports.map((x, i) => (spec.knees || uls[0].ga) ? Math.max(...uls.map(a => Math.abs(a.reactions[i].R))) : Math.max(...uls.map(a => a.reactions[i].R)));
    const slsG = analyse(spec, EIy, 1, 0, null, 'sls'), sls = analyse(spec, EIy, 1, 1, null, 'sls');
    const NEd = (spec.N || 0) + (uls[0].ga ? Math.max(0, ...uls.map(a => a.Nc || 0)) : 0);
    // ---------- built-up checks and composite credit ----------
    const bu = nC > 1 ? builtUp(spec, gr, one, env, comb, E, G, fy, fu) : null;
    const composite = !bu || bu.composite;
    let EIz = E * gr.Izz, EIw = E * gr.Iw, GIt = G * gr.It, zSC = gr.zsc, ySC = gr.ysc;
    if (nC > 1 && !composite) { EIz = nC * E * one.Izz; EIw = nC * E * one.Iw; GIt = nC * G * one.It; notes.push('Composite action of the built-up member is NOT credited (the resistance of the built-up connection needs IS 801, which is not implemented): LTB and torsion use the sum of the separate C-sections.'); }
    if (arr === 'quad' && composite && bu && !bu.pairComposite) { EIz = E * gr.IzzNonComposite; notes.push('Pair-to-pair connection not demonstrated: the minor-axis stiffness of the two pairs is not combined.'); }
    // ---------- out-of-plane model: restraints, load height, torsion ----------
    const zTop = gr.ex.z1 - zSC;
    const credited = { lat: [], latC: [], tor: [], torC: [] };
    for (const k of ['lat', 'latC', 'tor', 'torC']) for (const r of (spec.restr[k] || [])) if (r.credited) credited[k].push(r);
    const Mgov = uls.reduce((b, a) => Math.max(Math.abs(a.Mmax), Math.abs(a.Mmin)) > Math.max(Math.abs(b.Mmax), Math.abs(b.Mmin)) ? a : b, uls[0]);
    const lcG = loadsCase(spec, comb.aG, comb.aQ, null);
    const aLoad = spec.loadA === undefined ? zTop : spec.loadA;
    const ltbModel = {
      L: spec.L, EIz, EIw, GIt, supports: spec.supports.map(x => ({ x })), Mfun: x => Mgov.Mat(x),
      dist: lcG.udl.map(u => ({ x0: u.x0, x1: u.x1, q: u.w, a: aLoad })), loads: lcG.points.map(q => ({ x: q.x, P: q.P, a: spec.pointA === undefined ? 0 : spec.pointA })),
      lat: credited.lat.map(r => ({ x: r.x, k: r.k, a: r.a })), latC: credited.latC.map(r => ({ x0: r.x0, x1: r.x1, k: r.k, a: r.a })),
      tor: credited.tor.map(r => ({ x: r.x, k: r.k })), torC: credited.torC.map(r => ({ x0: r.x0, x1: r.x1, k: r.k })), nEl: 48
    };
    const lam = FE.ltbFactor(ltbModel), MEdLT = Math.max(Math.abs(Mgov.Mmax), Math.abs(Mgov.Mmin)), Mcr = lam * MEdLT;
    const lam0 = FE.ltbFactor(Object.assign({}, ltbModel, { lat: [], latC: [], tor: [], torC: [] })), Mcr0 = lam0 * MEdLT;
    const torModel = (aG, aQ) => {
      const tq = [];
      for (const u of spec.G.udl) tq.push({ x0: u.x0, x1: u.x1, m: -aG * u.w * (spec.eUdl || 0) });
      for (const u of spec.Q.udl) tq.push({ x0: u.x0, x1: u.x1, m: -aQ * u.w * (spec.eUdl || 0) });
      const pt = (spec.torques || []).map(q => ({ x: q.x, T: aG * q.TG + aQ * q.TQ }));
      return Object.assign({}, ltbModel, { torqueC: tq, torque: pt, Mfun: null, dist: [], loads: [] });
    };
    const hasT = Math.abs(spec.eUdl || 0) > 1e-9 || (spec.torques || []).some(q => Math.abs(q.TG) + Math.abs(q.TQ) > 0);
    if (spec.lp) {
      const lp = spec.lp, mT = (spec.G.udl.reduce((a, u) => Math.max(a, comb.aG * u.w), 0) + spec.Q.udl.reduce((a, u) => Math.max(a, comb.aQ * u.w), 0)) * (spec.eUdl || 0);
      notes.push(`Load application: distributed load ${lp.label}. Centroid (CG) at y = ${U.fmt(lp.yc, 1)}, z = ${U.fmt(lp.zc, 1)} mm; shear centre (SC) at y = ${U.fmt(lp.ysc, 1)}, z = ${U.fmt(lp.zsc, 1)} mm (CG − SC: Δy = ${U.fmt(lp.dyc, 1)}, Δz = ${U.fmt(lp.dzc, 1)} mm). Eccentricity of the load line to the SC e = ${U.fmt(spec.eUdl || 0, 1)} mm → ULS torque m_T = ${U.fmt(Math.abs(mT) / 1e3, 3)} kN·mm/mm.`);
    }
    let tU = null, tS = null;
    if (hasT) { tU = FE.torsion(torModel(comb.aG, comb.aQ)); tS = FE.torsion(torModel(1, 1)); }
    const amp = Mcr > MEdLT ? 1 / (1 - MEdLT / Mcr) : Infinity;
    const Bed = tU && !tU.error ? tU.Bmax * amp : 0, MzT = tU && !tU.error ? tU.Mzmax * amp : 0;
    const wmax = Math.max(...gr.wn.map(Math.abs)), Ww = gr.Iw / wmax;
    const MzEd = Math.abs(MzT);
    const MEdAbs = Math.max(env.Mmax, -env.Mmin);
    const pend = (o) => add(CHK.pending(o, NEED));

    // ---------- demands with pending resistances (IS 801 not implemented) ----------
    pend({ grp: 'Cross-section', name: 'Major-axis bending, sagging', clause: 'IS 801 (not supplied)', Ed: Math.max(0, env.Mmax), unit: 'kNm', fmt: kNm });
    if (-env.Mmin > 1e3) pend({ grp: 'Cross-section', name: 'Major-axis bending, hogging', clause: 'IS 801 (not supplied)', Ed: -env.Mmin, unit: 'kNm', fmt: kNm });
    else add(CHK.na({ grp: 'Cross-section', name: 'Major-axis bending, hogging', clause: '' }, 'No hogging moment in this member.'));
    if (MzEd > 1e-3) pend({ grp: 'Cross-section', name: 'Minor-axis bending (from torsion / lateral load)', clause: 'IS 801 (not supplied)', Ed: MzEd, unit: 'kNm', fmt: kNm, steps: [s('M_z,Ed', 'lateral bending from the torsion model × 1/(1 − M_Ed/M_cr)', kNm(MzEd), 'kNm')] });
    else add(CHK.na({ grp: 'Cross-section', name: 'Minor-axis bending', clause: '' }, 'No minor-axis moment in this member.'));
    if (Math.abs(NEd) > 1) pend({ grp: 'Cross-section', name: NEd > 0 ? 'Axial compression' : 'Axial tension', clause: 'IS 801 (not supplied)', Ed: Math.abs(NEd), unit: 'kN', fmt: kN });
    else add(CHK.na({ grp: 'Cross-section', name: 'Axial force', clause: '' }, 'No axial force in this member.'));
    pend({ grp: 'Cross-section', name: 'Shear (web)', clause: 'IS 801 (not supplied)', Ed: env.V, unit: 'kN', fmt: kN });
    if (spec.ss > 0) pend({ grp: 'Local', name: 'Web crippling at the supports (beam bears on its flange)', clause: 'IS 801 (not supplied)', Ed: Math.max(...Rmax) / nC, unit: 'kN', fmt: kN, steps: [s('s_s', 'bearing length', spec.ss, 'mm')], note: 'Demand per web.' });
    else add(CHK.na({ grp: 'Local', name: 'Web crippling at the supports', clause: '' }, 'The reactions are transferred through bolted / welded web connections, not by bearing on the flange.'));
    if (spec.pointBearing) pend({ grp: 'Local', name: 'Web crippling under concentrated loads', clause: 'IS 801 (not supplied)', Ed: Math.max(0, ...lcG.points.map(q => q.P)) / nC, unit: 'kN', fmt: kN });
    else add(CHK.na({ grp: 'Local', name: 'Web crippling under concentrated loads', clause: '' }, spec.key === 'mb' ? 'The SB-Int reactions enter through bolts in the main-beam web (connection checks cover bearing and tear-out).' : 'The floor load is distributed (no concentrated load bearing on the flange).'));
    pend({ grp: 'Cross-section', name: 'Bending and shear; axial force and bending', clause: 'IS 801 (not supplied)', Ed: MEdAbs, unit: 'kNm', fmt: kNm });
    if (hasT) {
      const sMy = MEdAbs / gr.Wy, sMz = MzEd / gr.Wz, sN = Math.abs(NEd) / gr.A, sW = Bed / Ww;
      pend({ grp: 'Torsion', name: 'Combined direct and warping stresses (torsion from eccentric load)', clause: 'IS 801 (not supplied)', Ed: sN + sMy + sMz + sW, unit: 'N/mm²', fmt: x => x,
        steps: [s('B_Ed', 'bimoment, Vlasov FE × 1/(1 − M_Ed/M_cr)', B2(Bed), 'kNm²'), s('amplification', '1/(1 − M_Ed/M_cr)', amp), s('σ_N + σ_My + σ_Mz + σ_w', `${U.fmt(sN, 1)} + ${U.fmt(sMy, 1)} + ${U.fmt(sMz, 1)} + ${U.fmt(sW, 1)} (gross section, indicative)`, sN + sMy + sMz + sW, 'N/mm²')],
        note: 'The stresses are elastic values on the gross section; no stress limit of a cold-formed section is applied.' });
    } else add(CHK.na({ grp: 'Torsion', name: 'Torsion (warping + St Venant)', clause: '' }, 'The load passes through the shear centre (no torque).'));
    pend({ grp: 'Member', name: 'Lateral-torsional buckling', clause: 'IS 801 (not supplied)', Ed: MEdLT, unit: 'kNm', fmt: kNm,
      inputs: [['restraints credited', `${credited.lat.length} lateral, ${credited.latC.length} continuous lateral, ${credited.tor.length + credited.torC.length} torsional`, '']],
      steps: [s('M_cr', 'Vlasov FE eigenvalue for the actual moment diagram, load height and credited restraints', kNm(Mcr), 'kNm'), s('M_cr (fork supports only)', 'same model without restraints', kNm(Mcr0), 'kNm')],
      note: 'The elastic critical moment is an analysis result (not code-dependent); the buckling resistance needs IS 801.' });
    if (NEd > 1) {
      const Lsp = Math.max(...spec.supports.slice(1).map((x, i) => x - spec.supports[i]));
      const Lz = spec.Lz || Lsp, Ncry = Math.PI ** 2 * E * gr.Iyy / Lsp ** 2, Ncrz = Math.PI ** 2 * EIz / E / Lz ** 2 * E;
      const y0 = arr === 'single' ? gr.ysc - gr.yc : 0, i02 = gr.iy ** 2 + gr.iz ** 2 + y0 * y0;
      const NcrT = (GIt + Math.PI ** 2 * EIw / Lz ** 2) / i02, bt = 1 - y0 * y0 / i02;
      const NcrTF = arr === 'single' ? Ncry / (2 * bt) * (1 + NcrT / Ncry - Math.sqrt((1 - NcrT / Ncry) ** 2 + 4 * (y0 * y0 / i02) * NcrT / Ncry)) : NcrT;
      pend({ grp: 'Member', name: 'Flexural / torsional / flexural-torsional buckling and N + M interaction', clause: 'IS 801 (not supplied)', Ed: NEd, unit: 'kN', fmt: kN,
        steps: [s('N_cr,y', '', kN(Ncry), 'kN'), s('N_cr,z', `L_cr,z = ${U.fmt(Lz, 0)} mm`, kN(Ncrz), 'kN'), s('N_cr,T', 'elastic torsional', kN(NcrT), 'kN'), s('N_cr,TF', 'elastic flexural-torsional', kN(NcrTF), 'kN')] });
    } else add(CHK.na({ grp: 'Member', name: 'Flexural / torsional buckling and N + M interaction', clause: '' }, 'No axial compression.'));
    // ---------- serviceability: project limits on the elastic analysis (gross section) ----------
    const Lsp = Math.max(...spec.supports.slice(1).map((x, i) => x - spec.supports[i]));
    const defl = sls.vmax, dlim = Lsp / (spec.dl || 200);
    add(CHK.mk({ grp: 'Serviceability', name: 'Vertical deflection (characteristic G + Q)', clause: 'project limit', basis: 'user', Ed: defl, Rd: dlim, unit: 'mm', fmt: x => x,
      steps: [s('I_gr', 'gross section (no effective-section reduction: IS 801 not implemented)', gr.Iyy / 1e4, 'cm⁴'), s('δ', 'beam FE', defl, 'mm'), s('limit', `L/${spec.dl}`, dlim, 'mm')], eq: 'δ ≤ L/' + spec.dl,
      note: 'Computed with the gross section: the stiffness of a thin-walled section can be lower than the gross value. The limit is the project value entered.', why: 'Excessive deflection under service load.', fix: 'Deeper section or shorter span.' }));
    if (hasT && tS && !tS.error) {
      const Msls = Math.max(sls.Mmax, -sls.Mmin), ph = tS.phiMax / (1 - Math.min(0.99, Msls / Mcr)) * 180 / Math.PI;
      add(CHK.mk({ grp: 'Serviceability', name: 'Twist (characteristic)', clause: 'project limit; Vlasov FE', Ed: ph, Rd: spec.twist || 2, unit: '°', fmt: x => x, basis: 'num', eq: 'φ ≤ limit', why: 'The section rotates under the eccentric load.', fix: 'Torsional restraint or load through the shear centre.' }));
      add(CHK.mk({ grp: 'Serviceability', name: 'Horizontal deflection (characteristic)', clause: 'project limit L/' + (spec.dl || 200), Ed: tS.vMax + Math.abs(tS.phiMax) * zTop, Rd: Lsp / (spec.dl || 200), unit: 'mm', fmt: x => x, basis: 'num', eq: 'top-flange lateral displacement ≤ L/' + spec.dl }));
    } else { add(CHK.na({ grp: 'Serviceability', name: 'Twist', clause: '' }, 'No torque.')); }
    // M_Ed ≥ M_cr: the second-order torsion response has no finite solution → the torsion-dependent checks fail
    if (hasT && !isFinite(amp)) {
      for (const c of checks) if (/Twist|Horizontal deflection/.test(c.name) && c.status !== 'N/A') {
        c.eta = Infinity; c.unstable = true; c.status = 'FAIL'; c.note = 'M_Ed = ' + U.fmt(MEdLT / 1e6, 2) + ' kNm ≥ M_cr = ' + U.fmt(Mcr / 1e6, 2) + ' kNm: the member is laterally unstable, so the amplified torsion response 1/(1 − M_Ed/M_cr) has no finite value.';
        c.why = 'The member buckles laterally before it can carry the eccentric load; torsional stresses and twist grow without limit.'; c.fix = 'Credit lateral restraints (make the SB connections pass with the brace force), add torsional restraint, or use a section with higher I_z, I_t, I_w.';
      }
      notes.push('M_Ed ≥ M_cr: the member is laterally unstable under the eccentric load (an analysis result, independent of the design standard).');
    }
    if (bu) for (const c of bu.checks) add(c);
    return {
      checks, notes, gross: gr, one, eff: null, comb, uls, sls, slsG, env, R0, Rmax, kneeR,
      Mcr, Mcr0, lam, amp, tU, tS, Bed, MzEd, credited, composite, bu, dsm: null, nC, mass: gr.mass, ltbModel, overall: CHK.overall(checks)
    };
  }
  const B2 = x => x / 1e9; // N·mm² → kN·m²

  // built-up member connection checks (back-to-back and four C): the demands are computed, the resistances need IS 801 (pending), so composite action is not credited
  function builtUp(spec, gr, one, env, comb, E, G, fy, fu) {
    const b = spec.bu, p = spec.p, t = p.t, checks = [], add = c => { checks.push(c); return c; };
    const grp = 'Built-up';
    if (b.type === 'none') {
      add(CHK.mk({ grp, name: 'Built-up connection', clause: '', eta: Infinity, basis: 'num', note: 'The C-sections are not connected: composite action is not credited.', why: 'No connection between the C-sections.', fix: 'Weld or bolt the C-sections together at a demonstrated pitch.' }));
      return { checks, composite: false, pairComposite: false };
    }
    const m = Math.abs(one.ysc); // shear centre of one C to its web centre-line
    const g = Math.max(10, b.n >= 2 ? p.H - 2 * (t + p.r) : p.H / 2); // distance between the connector lines (top and bottom web junctions)
    const sst = b.s;
    const qULS = spec.G.udl.reduce((a, u) => Math.max(a, u.w), 0) * comb.aG + spec.Q.udl.reduce((a, u) => Math.max(a, u.w), 0) * comb.aQ;
    const Pmax = Math.max(0, ...spec.G.points.map((q, i) => q.P * comb.aG + (spec.Q.points[i] ? spec.Q.points[i].P * comb.aQ : 0)));
    const Tq = 3 * qULS * m * sst / (2 * g), TP = Pmax * m / (2 * g), TEd = Math.max(Tq, TP);
    add(CHK.pending({ grp, name: 'Built-up connectors: anti-rotation force per station', clause: 'IS 801 (not supplied)', Ed: TEd, unit: 'kN', fmt: x => x / 1e3,
      steps: [s('m', 'shear centre of one C to its web', m, 'mm'), s('g', 'distance between the connector lines', g, 'mm'), s('s', 'station pitch', sst, 'mm'), s('T (UDL)', '3 q m s / (2 g)', Tq / 1e3, 'kN'), s('T (point load)', 'P m / (2 g)', TP / 1e3, 'kN')],
      why: 'Each C is loaded away from its own shear centre and tries to rotate; the connectors hold the pair together.' }, NEED));
    add(CHK.pending({ grp, name: 'Single C between connector stations (LTB over the station pitch)', clause: 'IS 801 (not supplied)', Ed: Math.max(env.Mmax, -env.Mmin) / (spec.arr === 'b2b' ? 2 : 4), unit: 'kNm', fmt: x => x / 1e6 }, NEED));
    if (spec.arr === 'quad' && b.pcs !== 'none') add(CHK.pending({ grp, name: 'Pair-to-pair tabs', clause: 'IS 801 (not supplied)', unit: 'kN', fmt: x => x / 1e3 }, NEED));
    if (spec.arr === 'quad' && b.pcs === 'none') add(CHK.na({ grp, name: 'Pair-to-pair connection', clause: '' }, 'No pair-to-pair connection: the pairs are designed as separate members (minor-axis stiffness not combined).'));
    return { checks, composite: false, pairComposite: false, TEd };
  }
  const boltAs = d => ({ 5: 14.2, 6: 20.1, 8: 36.6, 10: 58, 12: 84.3, 14: 115, 16: 157, 18: 192, 20: 245, 22: 303, 24: 353, 27: 459, 30: 561 }[Math.round(d)] || 0.7854 * (d - 0.9382 * (d <= 12 ? 1.75 : d <= 16 ? 2 : d <= 22 ? 2.5 : 3)) ** 2);
  const boltFu = g => ({ '4.6': 400, '5.6': 500, '8.8': 800, '10.9': 1000 }[g] || 800);
  const boltFy = g => ({ '4.6': 240, '5.6': 300, '8.8': 640, '10.9': 900 }[g] || 640);
  return { design, chi, builtUp, boltAs, boltFu, boltFy, curveAlpha };
})();

