// @ts-nocheck — ported verbatim from the mockup (index.html, 50_member.js); logic unchanged so results match the mockup.
import "server-only";
import { LOADS } from './loads';
import { SEC } from './section';
import { EN } from './en_section';
import { U } from '@/shared/util';
import { FSM } from './fsm';
import { CHK } from '@/shared/check';
import { FE } from './fe';
// ===== Member design of a C-section arrangement (single / back-to-back / four C) =====
export const MEM: any = (() => {
  const s = CHK.s, kN = x => x / 1e3, kNm = x => x / 1e6;
  const curveAlpha = { a0: 0.13, a: 0.21, b: 0.34, c: 0.49, d: 0.76 };
  function chi(lam, alpha) { if (lam <= 0.2) return 1; const ph = 0.5 * (1 + alpha * (lam - 0.2) + lam * lam); return Math.min(1, 1 / (ph + Math.sqrt(Math.max(0, ph * ph - lam * lam)))); }
  const fbv = (lw, fy, stiff) => lw <= 0.83 ? 0.58 * fy : lw < 1.40 ? 0.48 * fy / lw : stiff ? 0.48 * fy / lw : 0.67 * fy / (lw * lw); // EN 1993-1-3 Table 6.1

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

  function design(spec) {
    const { R, p, arr, mat } = spec, E = mat.E, G = E / (2 * (1 + mat.nu)), fy = mat.fy, fu = mat.fu, t = p.t;
    const checks = [], notes = [], add = c => { checks.push(c); return c; };
    const geomErr = SEC.validate(p);
    if (geomErr.length) return { error: geomErr, checks: [], notes: geomErr };
    const nC = arr === 'single' ? 1 : arr === 'b2b' ? 2 : 4;
    const opt = { gap: spec.opt.gap, pairSpacing: spec.opt.pairSpacing };
    const gr = SEC.gross(p, arr, opt), one = SEC.gross(p, 'single');
    const lim = EN.limits(p);
    const gm0 = R.code === 'EN' ? R.gM0 : 1.0, gm1 = R.code === 'EN' ? R.gM1 : 1.0;
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
    // knee braces in the engine's own model: largest vertical knee reaction (ULS, N) and its SLS value, for the knee check and the report
    const kneeR = spec.knees ? { uls: Math.max(0, ...uls.flatMap(a => (a.springR || []).map(q => q.R))), min: Math.min(0, ...uls.flatMap(a => (a.springR || []).map(q => q.R))) } : null;
    // with knee braces (own model or frame) a beam end can be pulled down: the connection is designed for the largest |R|
    const Rmax = spec.supports.map((x, i) => (spec.knees || uls[0].ga) ? Math.max(...uls.map(a => Math.abs(a.reactions[i].R))) : Math.max(...uls.map(a => a.reactions[i].R)));
    const slsG = analyse(spec, EIy, 1, 0, null, 'sls'), sls = analyse(spec, EIy, 1, 1, null, 'sls');
    const NEd = (spec.N || 0) + (uls[0].ga ? Math.max(0, ...uls.map(a => a.Nc || 0)) : 0); // + compression from knee braces (global analysis)
    // ---------- effective section (EN) ----------
    const effP = EN.arrangementEff(p, arr, opt, fy, E, mat.nu, 'My+');
    const effN = EN.arrangementEff(p, arr, opt, fy, E, mat.nu, 'My-');
    const effA = EN.arrangementEff(p, arr, opt, fy, E, mat.nu, 'N');
    const WeffP = Math.min(effP.Wtop, effP.Wbot), WeffN = Math.min(effN.Wtop, effN.Wbot);
    const McRdP = WeffP * fy / gm0, McRdN = WeffN * fy / gm0;
    const Aeff = effA.A, NcRd = Aeff * fy / gm0;
    // e_N: shift of the effective centroid under axial compression (single C: horizontal → minor-axis moment)
    const eN = arr === 'single' ? Math.abs(effA.yc - (gr.yc)) : 0;
    const WelZ = gr.Wz, WzEff = WelZ * Math.min(1, Aeff / gr.A), MczRd = WzEff * fy / gm0;
    const top = effP.one.steps.top, web = effP.one.steps.web;
    // ---------- built-up checks and composite credit ----------
    const bu = nC > 1 ? builtUp(spec, gr, one, env, comb, E, G, fy, fu) : null;
    const composite = !bu || bu.composite;
    // stiffness for LTB / torsion
    let EIz = E * gr.Izz, EIw = E * gr.Iw, GIt = G * gr.It, zSC = gr.zsc, ySC = gr.ysc;
    if (nC > 1 && !composite) { EIz = nC * E * one.Izz; EIw = nC * E * one.Iw; GIt = nC * G * one.It; notes.push('Composite action of the built-up member is NOT credited (built-up connection not demonstrated): LTB and torsion use the sum of the separate C-sections.'); }
    if (arr === 'quad' && composite && bu && !bu.pairComposite) { EIz = E * gr.IzzNonComposite; notes.push('Pair-to-pair connection not demonstrated: the minor-axis stiffness of the two pairs is not combined.'); }
    // ---------- out-of-plane model: restraints, load height, torsion ----------
    const zTop = gr.ex.z1 - zSC; // top outer face above the shear centre
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
    // fork-only value for comparison (restraints not credited)
    const lam0 = FE.ltbFactor(Object.assign({}, ltbModel, { lat: [], latC: [], tor: [], torC: [] })), Mcr0 = lam0 * MEdLT;
    // torsion (first order) at ULS and SLS
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
      notes.push(`Load application: distributed load ${lp.label}. Centroid (CG) at y = ${U.fmt(lp.yc, 1)}, z = ${U.fmt(lp.zc, 1)} mm; shear centre (SC) at y = ${U.fmt(lp.ysc, 1)}, z = ${U.fmt(lp.zsc, 1)} mm (CG − SC: Δy = ${U.fmt(lp.dyc, 1)}, Δz = ${U.fmt(lp.dzc, 1)} mm). Eccentricity of the load line to the SC e = ${U.fmt(spec.eUdl || 0, 1)} mm → ULS torque m_T = ${U.fmt(Math.abs(mT) / 1e3, 3)} kNm/m${Math.abs(spec.eUdl || 0) > 0 ? ' (included in the torsion, warping, lateral-bending and stability checks)' : lp.conv === 'cg' ? ' (CG and SC coincide horizontally for this symmetric arrangement)' : ''}. ${lp.ltbNote} (${U.fmt(spec.loadA, 1)} mm above the SC).`);
    }
    let tU = null, tS = null;
    if (hasT) { tU = FE.torsion(torModel(comb.aG, comb.aQ)); tS = FE.torsion(torModel(1, 1)); }
    const amp = Mcr > MEdLT ? 1 / (1 - MEdLT / Mcr) : Infinity;
    const Bed = tU && !tU.error ? tU.Bmax * amp : 0, MzT = tU && !tU.error ? tU.Mzmax * amp : 0, Tsv = tU && !tU.error ? tU.Tsvmax * amp : 0, Tw = tU && !tU.error ? tU.Twmax * amp : 0;
    const wmax = Math.max(...gr.wn.map(Math.abs)), Ww = gr.Iw / wmax;
    const MzEd = Math.abs(MzT) + Math.abs(NEd * eN);
    // ---------- route-specific resistances ----------
    const sw = (p.H - t) - 2 * (p.r + t / 2) * (1 - Math.SQRT1_2); // slant height of the web between corner mid-points (EN Fig. 5.1/6.5)
    const hw = p.H - t;
    const lw = 0.346 * (sw / t) * Math.sqrt(fy / E);
    const fbvv = fbv(lw, fy, spec.stiffSupport);
    const VbRd = nC * hw * t * fbvv / gm0;
    const isEN = R.code === 'EN', isAISI = R.code === 'AISI', isIS = R.code === 'IS';
    const info = isIS ? { review: true, note: 'IS route: the strength of cold-formed members is governed by IS 801 (working stress), which this tool does not implement. EN 1993-1-3 values are shown for information only and are not used for PASS.' } : {};
    const W = (sgn) => sgn > 0 ? WeffP : WeffN;
    const cl = (en) => isAISI ? null : en;
    // AISI DSM data
    let dsm = null; if (isAISI) dsm = aisiFlexure(p, arr, gr, fy, E, mat.nu, Mcr, nC, effP);

    // 1 bending (major) sagging / hogging
    const mkBend = (sgn) => {
      const MEd = sgn > 0 ? env.Mmax : -env.Mmin;
      if (MEd <= 1e3 && sgn < 0) return CHK.na({ grp: 'Cross-section', name: 'Major-axis bending, hogging', clause: 'EN 1993-1-3 6.1.4' }, 'No hogging moment in this member.');
      if (isAISI) {
        const MnlLocal = dsm.Mnlo, Rd = 0.90 * Math.min(dsm.My, MnlLocal);
        return CHK.mk({ grp: 'Cross-section', name: `Major-axis bending (local yielding / local buckling), ${sgn > 0 ? 'sagging' : 'hogging'}`, clause: 'AISI S100-16 F2–F3 (DSM, M_ne = M_y)', Ed: MEd, Rd, unit: 'kNm', fmt: kNm,
          steps: [s('M_y', 'S_f F_y', kNm(dsm.My), 'kNm'), s('M_crl', 'FSM local minimum', kNm(dsm.Mcrl), 'kNm'), s('M_nlo', 'DSM local with M_ne = M_y', kNm(MnlLocal), 'kNm'), s('φ_b', '', 0.90)], eq: 'M_u ≤ φ_b M_nlo', basis: dsm.Mcrl ? 'code' : 'none',
          why: 'The compression flange / web buckle locally before yielding.', fix: 'Increase t, reduce flange width-to-thickness, or use a deeper section.' });
      }
      const ef = sgn > 0 ? effP : effN, Wf = W(sgn), Rd = Wf * fy / gm0;
      return CHK.mk(Object.assign({ grp: 'Cross-section', name: `Major-axis bending, ${sgn > 0 ? 'sagging (top flange in compression)' : 'hogging (bottom flange in compression)'}`, clause: 'EN 1993-1-3 6.1.4.1 (eq. 6.4); effective section 5.5', Ed: MEd, Rd, unit: 'kNm', fmt: kNm,
        inputs: [['f_yb', fy, 'N/mm²'], ['γM0', gm0, '']],
        steps: [s('ρ flange', 'EN 1993-1-5 eq. 4.2, k_σ = 4', top.rho_f), s('χ_d', 'EN 1993-1-3 5.5.3.1(7)', top.chi_d), s('ρ web', `ψ = ${U.fmt(web.psi, 3)}`, web.rho), s('I_eff', 'effective section, ' + (ef.delta ? `× (1 − 2δ), δ = ${U.fmt(ef.delta, 4)}` : 'rounded corners neglected (5.1(3))'), ef.Iyy / 1e4, 'cm⁴'), s('W_eff', 'min(I_eff/z_c, I_eff/z_t)', Wf / 1e3, 'cm³'), s('M_c,Rd', 'W_eff f_yb / γM0', kNm(Rd), 'kNm')],
        eq: 'M_Ed ≤ M_c,Rd = W_eff f_yb / γM0', factor: `γM0 = ${gm0}`,
        why: 'First yield of the effective section; the effective widths include local buckling (ρ) and distortional buckling of the lipped flange (χ_d).', fix: 'Deeper section, thicker t, longer lip (higher χ_d), or a higher steel grade.' }, info));
    };
    add(mkBend(1)); add(mkBend(-1));
    // 2 minor-axis bending
    add(MzEd > 1e-3 ? CHK.mk(Object.assign({ grp: 'Cross-section', name: 'Minor-axis bending (from torsion / lateral load and N·e_N)', clause: 'EN 1993-1-3 6.1.4', Ed: MzEd, Rd: MczRd, unit: 'kNm', fmt: kNm, basis: 'approx',
      steps: [s('W_el,z', 'gross', WelZ / 1e3, 'cm³'), s('W_eff,z', 'W_el,z × A_eff/A (approximation)', WzEff / 1e3, 'cm³'), s('M_z,Ed', 'lateral bending from the torsion model × amplification + N e_N', kNm(MzEd), 'kNm')],
      eq: 'M_z,Ed ≤ W_eff,z f_yb / γM0', why: 'Lateral bending of the section caused by eccentric load or restraint forces.', fix: 'Reduce the load eccentricity or add lateral restraint.' }, info)) :
      CHK.na({ grp: 'Cross-section', name: 'Minor-axis bending', clause: 'EN 1993-1-3 6.1.4' }, 'No minor-axis moment in this member.'));
    // 3 axial
    if (Math.abs(NEd) > 1) add(CHK.mk(Object.assign({ grp: 'Cross-section', name: NEd > 0 ? 'Axial compression (effective area)' : 'Axial tension', clause: NEd > 0 ? 'EN 1993-1-3 6.1.3' : 'EN 1993-1-3 6.1.2', Ed: Math.abs(NEd), Rd: NEd > 0 ? NcRd : gr.A * fy / gm0, unit: 'kN', fmt: kN,
      steps: [s('A_eff', 'uniform compression effective area', Aeff, 'mm²'), s('e_N', 'shift of the effective centroid', eN, 'mm')], eq: NEd > 0 ? 'N_c,Rd = A_eff f_yb / γM0' : 'N_t,Rd = A_g f_yb / γM0' }, info)));
    else add(CHK.na({ grp: 'Cross-section', name: 'Axial force', clause: 'EN 1993-1-3 6.1.2 / 6.1.3' }, 'No axial force in this member.'));
    // 4 shear
    if (isAISI) {
      const h = p.H - 2 * (t + p.r), Aw = nC * h * t, kv = 5.34, Vcr = Math.PI ** 2 * E * kv * Aw / (12 * (1 - mat.nu ** 2) * (h / t) ** 2), Vy = 0.6 * Aw * fy, lv = Math.sqrt(Vy / Vcr);
      const Vn = lv <= 0.815 ? Vy : lv <= 1.227 ? 0.815 * Math.sqrt(Vcr * Vy) : Vcr;
      add(CHK.mk({ grp: 'Cross-section', name: 'Shear (web shear buckling)', clause: 'AISI S100-16 G2.1', Ed: env.V, Rd: 0.95 * Vn, unit: 'kN', fmt: kN, steps: [s('h', 'flat web depth', h, 'mm'), s('V_cr', 'π²E k_v A_w / (12(1−μ²)(h/t)²)', kN(Vcr), 'kN'), s('λ_v', '√(V_y/V_cr)', lv), s('V_n', '', kN(Vn), 'kN'), s('φ_v', '', 0.95)], eq: 'V_u ≤ φ_v V_n', why: 'The thin web buckles in shear.', fix: 'Thicker web or shorter span.' }));
    } else add(CHK.mk(Object.assign({ grp: 'Cross-section', name: 'Shear (web shear buckling)', clause: 'EN 1993-1-3 6.1.5, Table 6.1', Ed: env.V, Rd: VbRd, unit: 'kN', fmt: kN,
      steps: [s('s_w', 'web slant height between corner mid-points', sw, 'mm'), s('λ̄_w', '0.346 (s_w/t) √(f_yb/E)', lw), s('f_bv', `Table 6.1, web ${spec.stiffSupport ? 'with' : 'without'} stiffening at the support`, fbvv, 'N/mm²'), s('V_b,Rd', `${nC} × h_w t f_bv / γM0`, kN(VbRd), 'kN')],
      eq: 'V_Ed ≤ V_b,Rd = (h_w / sin φ) t f_bv / γM0', note: spec.stiffSupport ? 'The end cleat / plate covers at least half the web depth and is counted as “stiffening at the support” (Table 6.1: cleats arranged to prevent web distortion and designed for the reaction). Verify the detail; otherwise the lower column applies.' : '', why: 'The thin web buckles in shear near the supports.', fix: 'Thicker web, or a web stiffener / cleat at the support.' }, info)));
    const VRd = checks[checks.length - 1].Rd;
    // 5 web crippling
    if (spec.ss > 0) {
      const wc = crippling(p, fy, gm1, spec.ss, 'end');
      add(CHK.mk(Object.assign({ grp: 'Local', name: 'Web crippling at the supports (beam bears on its flange)', clause: 'EN 1993-1-3 6.1.7.2 (single web, category 1)', Ed: Math.max(...Rmax) / nC, Rd: wc.R, unit: 'kN', fmt: kN, basis: 'code',
        steps: [s('s_s', 'bearing length', spec.ss, 'mm'), ...wc.steps], eq: wc.eq, note: 'Per web. Coefficients to be verified against the printed standard (see method notes).', why: 'The web crushes / folds under the concentrated reaction.', fix: 'Longer bearing, bearing stiffener or connect through the web (cleat).' }, info)));
    } else add(CHK.na({ grp: 'Local', name: 'Web crippling at the supports', clause: 'EN 1993-1-3 6.1.7' }, 'The reactions are transferred through bolted / welded web connections, not by bearing on the flange.'));
    if (spec.pointBearing) {
      const Pmax = Math.max(0, ...lcG.points.map(q => q.P));
      const wc = crippling(p, fy, gm1, spec.pointSs || 50, 'int');
      add(CHK.mk(Object.assign({ grp: 'Local', name: 'Web crippling under concentrated loads', clause: 'EN 1993-1-3 6.1.7.2 (category 2)', Ed: Pmax / nC, Rd: wc.R, unit: 'kN', fmt: kN, steps: wc.steps, eq: wc.eq }, info)));
    } else add(CHK.na({ grp: 'Local', name: 'Web crippling under concentrated loads', clause: 'EN 1993-1-3 6.1.7' }, spec.key === 'mb' ? 'The SB-Int reactions enter through bolts in the main-beam web (connection checks cover bearing and tear-out).' : 'The floor load is distributed (no concentrated load bearing on the flange).'));
    // 6 interactions (cross-section)
    const MEdAbs = Math.max(env.Mmax, -env.Mmin), McRd = env.Mmax >= -env.Mmin ? McRdP : McRdN;
    if (isEN || isIS) {
      const vr = env.V / VbRd, inter = vr <= 0.5 ? MEdAbs / McRd : MEdAbs / McRd + (2 * vr - 1) ** 2;
      add(CHK.mk(Object.assign({ grp: 'Cross-section', name: 'Bending and shear', clause: 'EN 1993-1-3 6.1.10 (eq. 6.27, with M_f,Rd conservatively = M_c,Rd)', eta: inter, basis: 'approx', steps: [s('V_Ed/V_b,Rd', '', vr), s('M_Ed/M_c,Rd', '', MEdAbs / McRd)], eq: 'M/M_c,Rd + (2V/V_b,Rd − 1)² ≤ 1 when V > 0.5 V_b,Rd', why: 'High moment and shear at the same section.', fix: 'Thicker web or a deeper section.' }, info)));
      const nm = Math.abs(NEd) / (NEd > 0 ? NcRd : gr.A * fy / gm0) + (MEdAbs + Math.abs(NEd) * 0) / McRd + MzEd / MczRd;
      add(CHK.mk(Object.assign({ grp: 'Cross-section', name: 'Axial force and bending', clause: 'EN 1993-1-3 6.1.8 / 6.1.9 (eq. 6.25) incl. ΔM = N e_N', eta: nm, steps: [s('N/N_Rd', '', Math.abs(NEd) / NcRd), s('M_y/M_cy,Rd', '', MEdAbs / McRd), s('M_z/M_cz,Rd', '', MzEd / MczRd)], eq: 'N/N_c,Rd + M_y/M_cy,Rd + M_z/M_cz,Rd ≤ 1' }, info)));
    } else {
      const Malo = 0.90 * dsm.Mnlo, h = p.H - 2 * (t + p.r);
      const VRdA = VRd, r = Math.sqrt((MEdAbs / Malo) ** 2 + (env.V / VRdA) ** 2);
      add(CHK.mk({ grp: 'Cross-section', name: 'Bending and shear', clause: 'AISI S100-16 H2 (eq. H2-1)', eta: r, steps: [s('M/φM_nlo', '', MEdAbs / Malo), s('V/φV_n', '', env.V / VRdA)], eq: '√((M/M_alo)² + (V/V_a)²) ≤ 1' }));
    }
    // 7 combined stresses with warping (torsion)
    if (hasT) {
      const sN = Math.abs(NEd) / Aeff, sMy = MEdAbs / W(env.Mmax >= -env.Mmin ? 1 : -1), sMz = MzEd / WzEff, sW = Bed / Ww;
      const tauSV = Tsv * t / (gr.It || 1), tauV = env.V / (nC * hw * t);
      const sig = sN + sMy + sMz + sW, tau = tauSV + tauV;
      const e1 = sig / (fy / gm0), e2 = tau / (fy / (Math.sqrt(3) * gm0)), e3 = Math.sqrt(sig * sig + 3 * tau * tau) / (1.1 * fy / gm0);
      add(CHK.mk(Object.assign({ grp: 'Torsion', name: 'Combined direct and warping stresses (torsion from eccentric load)', clause: 'EN 1993-1-3 6.1.6 (eq. 6.12a–c)', eta: Math.max(e1, e2, e3), basis: 'num',
        steps: [s('B_Ed', 'bimoment, Vlasov FE × 1/(1 − M_Ed/M_cr)', B2(Bed), 'kNm²'), s('amplification', '1/(1 − M_Ed/M_cr)', amp), s('σ_N + σ_My + σ_Mz + σ_w', `${U.fmt(sN, 1)} + ${U.fmt(sMy, 1)} + ${U.fmt(sMz, 1)} + ${U.fmt(sW, 1)}`, sig, 'N/mm²'),
          s('τ_t + τ_V', `${U.fmt(tauSV, 1)} + ${U.fmt(tauV, 1)}`, tau, 'N/mm²'), s('σ ratio', 'σ/(f_ya/γM0)', e1), s('τ ratio', 'τ/(f_ya/(√3γM0))', e2), s('von Mises ratio', '√(σ²+3τ²)/(1.1 f_ya/γM0)', e3)],
        eq: 'σ_tot ≤ f_ya/γM0; τ_tot ≤ f_ya/(√3 γM0); √(σ² + 3τ²) ≤ 1.1 f_ya/γM0', note: 'f_yb used in place of f_ya (conservative). Warping shear stress is not included in τ (small for these open sections; listed T_w for information).',
        why: 'The load does not pass through the shear centre: the section twists and warps, adding warping normal stress to the bending stress.', fix: 'Apply the load through the shear centre, add torsional restraint (decking with demonstrated C_D, cleats), or use back-to-back sections.' }, info)));
    } else add(CHK.na({ grp: 'Torsion', name: 'Torsion (warping + St Venant)', clause: 'EN 1993-1-3 6.1.6' }, 'The load passes through the shear centre (no torque).'));
    // 8 LTB
    if (isAISI) {
      add(CHK.mk({ grp: 'Member', name: 'Flexure: global (LTB) with local and distortional interaction', clause: 'AISI S100-16 F2–F4 (DSM)', Ed: MEdLT, Rd: 0.90 * Math.min(dsm.Mnl, dsm.Mnd), unit: 'kNm', fmt: kNm, basis: dsm.Mcrd ? 'code' : 'none',
        steps: [s('M_cre', 'Vlasov FE eigenvalue (restraints as credited)', kNm(Mcr), 'kNm'), s('M_ne', 'F2.1', kNm(dsm.Mne), 'kNm'), s('M_crl', `FSM local, half-wave ${U.fmt(dsm.Ll, 0)} mm`, kNm(dsm.Mcrl), 'kNm'), s('M_nl', 'F3.2', kNm(dsm.Mnl), 'kNm'),
          s('M_crd', dsm.distSrc, kNm(dsm.Mcrd), 'kNm'), s('M_nd', 'F4.1', kNm(dsm.Mnd), 'kNm'), s('φ_b', '', 0.90)],
        eq: 'M_u ≤ φ_b min(M_nl, M_nd)', note: dsm.note, why: 'Lateral-torsional, local or distortional buckling governs the flexural strength.', fix: 'Add credited lateral / torsional restraints, increase I_z and I_t (back-to-back), lengthen the lips.' }));
    } else {
      const sg = env.Mmax >= -env.Mmin ? 1 : -1, Wl = W(sg), lLT = Math.sqrt(Wl * fy / Mcr), chiLT = chi(lLT, 0.34), MbRd = chiLT * Wl * fy / gm1;
      const lLT0 = Math.sqrt(Wl * fy / Mcr0);
      add(CHK.mk(Object.assign({ grp: 'Member', name: 'Lateral-torsional buckling', clause: 'EN 1993-1-3 6.2.4 → EN 1993-1-1 6.3.2.2 (curve b, α_LT = 0.34)', Ed: MEdLT, Rd: MbRd, unit: 'kNm', fmt: kNm, basis: 'num',
        inputs: [['restraints credited', `${credited.lat.length} lateral, ${credited.latC.length} continuous lateral, ${credited.tor.length + credited.torC.length} torsional`, '']],
        steps: [s('M_cr', 'Vlasov FE eigenvalue for the actual moment diagram, load height and credited restraints', kNm(Mcr), 'kNm'), s('M_cr (fork supports only)', 'same model without restraints', kNm(Mcr0), 'kNm'),
          s('λ̄_LT', '√(W_eff f_yb / M_cr)', lLT), s('χ_LT', 'curve b', chiLT), s('M_b,Rd', 'χ_LT W_eff f_yb / γM1', kNm(MbRd), 'kNm')],
        eq: 'M_Ed ≤ M_b,Rd = χ_LT W_eff,y f_yb / γM1', factor: `γM1 = ${gm1}`, note: `Without credited restraints λ̄_LT would be ${U.fmt(lLT0, 3)}.`,
        why: 'The compression flange buckles sideways and the section twists between the points that are actually restrained; open thin C-sections have small I_z, I_t and I_w.', fix: 'Demonstrate the restraints (decking S and fixings, anchored SB-Int / joists), reduce the restraint spacing, or use back-to-back C-sections.' }, info)));
    }
    const MbRdV = checks[checks.length - 1].Rd;
    // 9 flexural / torsional buckling and N+M buckling interaction
    if (NEd > 1) {
      const Lsp = Math.max(...spec.supports.slice(1).map((x, i) => x - spec.supports[i]));
      const Lz = spec.Lz || Lsp, Ncry = Math.PI ** 2 * E * gr.Iyy / Lsp ** 2, Ncrz = Math.PI ** 2 * EIz / E / Lz ** 2 * E;
      const y0 = arr === 'single' ? gr.ysc - gr.yc : 0, i02 = gr.iy ** 2 + gr.iz ** 2 + y0 * y0;
      const NcrT = (GIt + Math.PI ** 2 * EIw / Lz ** 2) / i02, bt = 1 - y0 * y0 / i02;
      const NcrTF = arr === 'single' ? Ncry / (2 * bt) * (1 + NcrT / Ncry - Math.sqrt((1 - NcrT / Ncry) ** 2 + 4 * (y0 * y0 / i02) * NcrT / Ncry)) : NcrT;
      const Ncr = Math.min(Ncry, Ncrz, NcrT, NcrTF), lb = Math.sqrt(Aeff * fy / Ncr), x = chi(lb, 0.34), NbRd = x * Aeff * fy / gm1;
      add(CHK.mk(Object.assign({ grp: 'Member', name: 'Flexural / torsional / flexural-torsional buckling', clause: 'EN 1993-1-3 6.2.2–6.2.3 (curve b, Table 6.3)', Ed: NEd, Rd: NbRd, unit: 'kN', fmt: kN,
        steps: [s('N_cr,y', '', kN(Ncry), 'kN'), s('N_cr,z', `L_cr,z = ${U.fmt(Lz, 0)} mm`, kN(Ncrz), 'kN'), s('N_cr,T', 'eq. 6.33a', kN(NcrT), 'kN'), s('N_cr,TF', 'eq. 6.35', kN(NcrTF), 'kN'), s('λ̄', '', lb), s('χ', 'curve b', x)], eq: 'N_Ed ≤ N_b,Rd = χ A_eff f_yb / γM1' }, info)));
      add(CHK.mk(Object.assign({ grp: 'Member', name: 'Buckling interaction N + M', clause: 'EN 1993-1-3 6.2.5 (eq. 6.36)', eta: Math.pow(NEd / NbRd, 0.8) + Math.pow(MEdLT / MbRdV, 0.8), eq: '(N_Ed/N_b,Rd)^0.8 + (M_Ed/M_b,Rd)^0.8 ≤ 1' }, info)));
    } else add(CHK.na({ grp: 'Member', name: 'Flexural / torsional buckling and N + M interaction', clause: 'EN 1993-1-3 6.2.2–6.2.5' }, 'No axial compression.'));
    if (hasT) add(CHK.mk(Object.assign({ grp: 'Member', name: 'LTB + torsion (bimoment) interaction', clause: 'Linear interaction M_y/M_b,Rd + M_z/M_cz,Rd + B/B_Rd (documented approximation)', eta: MEdLT / MbRdV + MzEd / MczRd + Bed / (Ww * fy / gm1), basis: 'approx',
      steps: [s('M_y/M_b,Rd', '', MEdLT / MbRdV), s('M_z/M_cz,Rd', '', MzEd / MczRd), s('B/B_Rd', 'B_Rd = (I_w/ω_max) f_y/γM1', Bed / (Ww * fy / gm1))], eq: 'Σ ≤ 1', why: 'Buckling and torsion act together on an eccentrically loaded open section.', fix: 'Load through the shear centre or provide demonstrated torsional restraint.' }, info)));
    // 10 SLS
    const Lsp = Math.max(...spec.supports.slice(1).map((x, i) => x - spec.supports[i]));
    const sGr = Math.max(sls.Mmax, -sls.Mmin) / gr.Wy, Ific = gr.Iyy - Math.min(1, sGr / fy) * (gr.Iyy - Math.min(effP.Iyy, effN.Iyy));
    const defl = sls.vmax * gr.Iyy / Ific, dlim = Lsp / (spec.dl || 200);
    add(CHK.mk({ grp: 'Serviceability', name: 'Vertical deflection (characteristic G + Q)', clause: isAISI ? 'AISI S100-16 L (service), limit by project' : 'EN 1993-1-3 7.1 (I_fic eq. 7.1) & 7.3', Ed: defl, Rd: dlim, unit: 'mm', fmt: x => x,
      steps: [s('I_gr', '', gr.Iyy / 1e4, 'cm⁴'), s('σ_gr', 'SLS stress on the gross section', sGr, 'N/mm²'), s('I_fic', 'I_gr − (σ_gr/f_y)(I_gr − I_eff)', Ific / 1e4, 'cm⁴'), s('δ', 'beam FE × I_gr/I_fic', defl, 'mm'), s('limit', `L/${spec.dl}`, dlim, 'mm')], eq: 'δ ≤ L/' + spec.dl,
      why: 'Excessive deflection under service load.', fix: 'Deeper section or shorter span.' }));
    if (hasT && tS && !tS.error) {
      const Msls = Math.max(sls.Mmax, -sls.Mmin), ph = tS.phiMax / (1 - Math.min(0.99, Msls / Mcr)) * 180 / Math.PI;
      add(CHK.mk({ grp: 'Serviceability', name: 'Twist (characteristic)', clause: 'Project limit; Vlasov FE', Ed: ph, Rd: spec.twist || 2, unit: '°', fmt: x => x, basis: 'num', eq: 'φ ≤ limit', why: 'The section rotates under the eccentric load.', fix: 'Torsional restraint or load through the shear centre.' }));
      add(CHK.mk({ grp: 'Serviceability', name: 'Horizontal deflection (characteristic)', clause: 'EN 1993-1-3 7.3 / project limit L/' + (spec.dl || 200), Ed: tS.vMax + Math.abs(tS.phiMax) * zTop, Rd: Lsp / (spec.dl || 200), unit: 'mm', fmt: x => x, basis: 'num', eq: 'top-flange lateral displacement ≤ L/' + spec.dl }));
    } else { add(CHK.na({ grp: 'Serviceability', name: 'Twist', clause: '' }, 'No torque.')); }
    // 11 built-up
    // M_Ed ≥ M_cr: the second-order torsion response has no finite solution → the torsion-dependent checks fail
    if (hasT && !isFinite(amp)) for (const c of checks) if (/Minor-axis bending \(|Combined direct|bimoment|Axial force and bending|Twist|Horizontal deflection/.test(c.name) && c.status !== 'N/A' && (c.eta === null || !isFinite(c.eta) || /Twist/.test(c.name))) {
      c.eta = Infinity; c.unstable = true; c.status = 'FAIL'; c.note = 'M_Ed = ' + U.fmt(MEdLT / 1e6, 2) + ' kNm ≥ M_cr = ' + U.fmt(Mcr / 1e6, 2) + ' kNm: the member is laterally unstable, so the amplified torsion response 1/(1 − M_Ed/M_cr) has no finite value.';
      c.why = 'The member buckles laterally before it can carry the eccentric load; torsional stresses and twist grow without limit.'; c.fix = 'Credit lateral restraints (make the SB connections pass with the brace force), add torsional restraint, or use a section with higher I_z, I_t, I_w.';
    }
    if (bu) for (const c of bu.checks) add(c);
    // geometry limits
    if (lim.length) notes.push('EN 1993-1-3 5.2 geometric limits: ' + lim.join('; ') + '. Outside these limits the design must be supported by testing (EN 1993-1-3 5.2(1)).');
    if (lim.some(m => /Table 5.1/.test(m))) add(CHK.mk({ grp: 'Cross-section', name: 'Geometric proportions within EN 1993-1-3 Table 5.1', clause: 'EN 1993-1-3 5.2', review: true, note: lim.join('; ') }));
    return {
      checks, notes, gross: gr, one, eff: { P: effP, N: effN, A: effA, WeffP, WeffN, McRdP, McRdN, Aeff, NcRd, VbRd }, comb, uls, sls, slsG, env, R0, Rmax, kneeR,
      Mcr, Mcr0, lam, amp, tU, tS, Bed, MzEd, credited, composite, bu, dsm, nC, mass: gr.mass, ltbModel, overall: CHK.overall(checks)
    };
  }
  const B2 = x => x / 1e9; // N·mm² → kN·m²

  // EN 1993-1-3 6.1.7.2 single unstiffened web, lipped (stiffened) flanges
  function crippling(p, fy, gm1, ss, cat) {
    const t = p.t, r = p.r, hw = p.H - t, k = fy / 228, phi = 90;
    const k1 = 1.33 - 0.33 * k, k2 = U.clamp(1.15 - 0.15 * r / t, 0.5, 1.0), k3 = 0.7 + 0.3 * (phi / 90) ** 2, k4 = 1.22 - 0.22 * k, k5 = Math.min(1.0, 1.06 - 0.06 * r / t);
    let R, eq;
    if (cat === 'end') { R = k1 * k2 * k3 * (9.04 - (hw / t) / 60) * (1 + 0.01 * ss / t) * t * t * fy / gm1; eq = 'R_w,Rd = k1 k2 k3 [9.04 − (h_w/t)/60][1 + 0.01 s_s/t] t² f_yb / γM1'; }
    else { R = k3 * k4 * k5 * (14.7 - (hw / t) / 49.5) * (1 + 0.007 * ss / t) * t * t * fy / gm1; eq = 'R_w,Rd = k3 k4 k5 [14.7 − (h_w/t)/49.5][1 + 0.007 s_s/t] t² f_yb / γM1'; }
    const ok = r / t <= 6 && hw / t <= 200;
    return { R: ok ? Math.max(0, R) : NaN, eq, steps: [s('k1', '1.33 − 0.33 f_yb/228', k1), s('k2', '1.15 − 0.15 r/t', k2), s('k3', '0.7 + 0.3(φ/90)²', k3), s('k4', '', k4), s('k5', '', k5), s('R_w,Rd', '', R / 1e3, 'kN')] };
  }

  // AISI S100-16 DSM flexure (F2.1, F3.2, F4.1) using the FE M_cre and FSM local / distortional
  function aisiFlexure(p, arr, gr, fy, E, nu, Mcre, nC, effP) {
    const sig = FSM.signature(p, 'My', E, nu, fy), My1 = sig.ref.M, My = gr.Wy * fy; // assembled first-yield moment
    const scale = My / My1;
    let Mcrl = sig.local ? sig.local[1] * My1 * scale : NaN, Ll = sig.local ? sig.local[0] : NaN;
    let Mcrd = sig.dist ? sig.dist[1] * My1 * scale : NaN, distSrc = sig.dist ? `FSM distortional minimum, half-wave ${U.fmt(sig.dist[0], 0)} mm` : '';
    let note = sig.note || '';
    if (!sig.dist) { // indistinct distortional minimum: EN 1993-1-3 5.5.3.2 spring model σcr,s used as the elastic distortional stress
      const scr = effP.one.steps.top.scr; Mcrd = scr / fy * My; distSrc = 'σ_cr,s of EN 1993-1-3 5.5.3.2 (FSM minimum indistinct)'; note += ' Distortional elastic stress taken from the EN 1993-1-3 spring model (rational elastic analysis).';
    }
    const D = dsm(My, Mcre, Mcrl, Mcrd);
    const { Fcre, Mne, Mnl, Mnlo, Mnd } = D;
    if (nC > 1) note += ' Local and distortional buckling taken from the single C (FSM), scaled to the arrangement.';
    return { My, Mcrl, Ll, Mcrd, distSrc, Mne, Mnl, Mnlo, Mnd, Fcre, note: note.trim() };
  }

  // AISI S100-16 DSM beam strengths in moment form (F2.1 global, F3.2.1 local with M_ne, F4.1 distortional)
  function dsm(My, Mcre, Mcrl, Mcrd) {
    const r = Mcre / My, Mne = r >= 2.78 ? My : r > 0.56 ? 10 / 9 * My * (1 - 10 * My / (36 * Mcre)) : Mcre;
    const loc = M => { const l = Math.sqrt(M / Mcrl); return l <= 0.776 ? M : (1 - 0.15 * Math.pow(Mcrl / M, 0.4)) * Math.pow(Mcrl / M, 0.4) * M; };
    const ld = Math.sqrt(My / Mcrd), Mnd = ld <= 0.673 ? My : (1 - 0.22 * Math.pow(Mcrd / My, 0.5)) * Math.pow(Mcrd / My, 0.5) * My;
    return { Fcre: r, Mne: Math.min(My, Mne), Mnl: loc(Math.min(My, Mne)), Mnlo: loc(My), Mnd, lamL: Math.sqrt(Math.min(My, Mne) / Mcrl), lamD: ld };
  }
  // built-up member connection checks (back-to-back and four C)
  function builtUp(spec, gr, one, env, comb, E, G, fy, fu) {
    const R = spec.R, b = spec.bu, p = spec.p, t = p.t, checks = [], add = c => { checks.push(c); return c; };
    const gm2 = R.code === 'EN' ? R.gM2 : R.code === 'IS' ? 1.25 : 1 / 0.65, gm1 = R.code === 'EN' ? R.gM1 : 1.0;
    const grp = 'Built-up';
    if (b.type === 'none') {
      add(CHK.mk({ grp, name: 'Built-up connection', clause: 'EN 1993-1-1 6.4 / AISI S100-16 I1.1', eta: Infinity, basis: 'code', note: 'The C-sections are not connected: composite action is not credited.', why: 'No connection between the C-sections.', fix: 'Weld or bolt the C-sections together at a demonstrated pitch.' }));
      return { checks, composite: false, pairComposite: false };
    }
    const m = Math.abs(one.ysc); // shear centre of one C to its web centre-line
    const g = Math.max(10, b.n >= 2 ? p.H - 2 * (t + p.r) : p.H / 2); // vertical distance between the connector lines (top and bottom web junctions)
    const sst = b.s, L = spec.L;
    const qULS = spec.G.udl.reduce((a, u) => Math.max(a, u.w), 0) * comb.aG + spec.Q.udl.reduce((a, u) => Math.max(a, u.w), 0) * comb.aQ;
    const Pmax = Math.max(0, ...spec.G.points.map((q, i) => q.P * comb.aG + (spec.Q.points[i] ? spec.Q.points[i].P * comb.aQ : 0)));
    const nLinesTension = 1; // the anti-rotation couple loads one line in tension per station
    const Tq = 3 * qULS * m * sst / (2 * g), TP = Pmax * m / (2 * g), TEd = Math.max(Tq, TP);
    // resistance per station line
    let Rt, rSteps = [], rBasis = 'code', rClause, rNote = '';
    const fuw = b.fuw > 0 ? b.fuw : fu;
    if (b.type === 'weldInt' || b.type === 'weldCont') {
      const Lw = b.type === 'weldCont' ? sst : b.Lw;
      const bw = R.code === 'IS' ? 1 : 0.9; // correlation factor β_w (EN 1993-1-8 Table 4.1, S355 ≈ 0.9; GD grades: 0.9 assumed)
      const fvw = fuw / (Math.sqrt(3) * bw * gm2);
      const Fthroat = fvw * b.a * Lw;
      const Fsheet = t * Lw * fu / gm2 * 0.45; // EN 1993-1-3 8.6 side fillet, limit for L_w > b (lower bound)
      Rt = Math.min(Fthroat, Fsheet);
      rSteps = [s('f_vw,d', 'f_u / (√3 β_w γM2)', fvw, 'N/mm²'), s('F_w (throat)', 'f_vw,d a L_w', Fthroat / 1e3, 'kN'), s('F_w (thin sheet)', '0.45 t L_w f_u / γM2 (EN 1993-1-3 8.6 lower bound)', Fsheet / 1e3, 'kN')];
      rClause = 'EN 1993-1-8 4.5.3.3; EN 1993-1-3 8.6'; rNote = 'Flare / fillet weld across the web junction; the thin-sheet lower bound of 8.6 is used because the weld is loaded across its axis.';
    } else if (b.type === 'spot') {
      Rt = NaN; rBasis = 'none'; rClause = 'EN 1993-1-3 8.5 (Table 8.5 covers shear only)'; rNote = 'Resistance spot welds loaded in tension (anti-rotation) are outside EN 1993-1-3 Table 8.5: resistance from tests required.';
    } else {
      const As = boltAs(b.d), fub = boltFu(b.bg), FtRd = 0.9 * fub * As / gm2, dw = 1.8 * b.d, FpRd = dw * t * fu / gm2;
      Rt = Math.min(FtRd, FpRd); rClause = 'EN 1993-1-8 Table 3.4 (tension); EN 1993-1-3 Table 8.4 (pull-through, verify)';
      rSteps = [s('F_t,Rd', '0.9 f_ub A_s / γM2', FtRd / 1e3, 'kN'), s('F_p,Rd', 'd_w t f_u / γM2', FpRd / 1e3, 'kN')];
    }
    const c1 = add(CHK.mk({ grp, name: 'Built-up connectors: anti-rotation force per station', clause: 'AISI S100-16 I1.1 (s ≤ 2 g T_s/(m q), q = 3 × UDL; P m/(2g) at point loads) with ' + rClause, Ed: TEd, Rd: Rt, unit: 'kN', fmt: x => x / 1e3, basis: rBasis,
      steps: [s('m', 'shear centre of one C to its web', m, 'mm'), s('g', 'distance between the connector lines', g, 'mm'), s('s', 'station pitch', sst, 'mm'), s('T (UDL)', '3 q m s / (2 g)', Tq / 1e3, 'kN'), s('T (point load)', 'P m / (2 g)', TP / 1e3, 'kN'), ...rSteps],
      eq: 'T_Ed ≤ T_Rd per connector line', note: rNote, why: 'Each C is loaded away from its own shear centre and tries to rotate; the connectors hold the pair together.', fix: 'Reduce the station pitch, lengthen the welds, or use bolts.' }));
    const smaxL6 = L / 6;
    add(CHK.mk({ grp, name: 'Connector spacing ≤ L/6', clause: 'AISI S100-16 I1.1(a)', Ed: sst, Rd: smaxL6, unit: 'mm', fmt: x => x, eq: 's ≤ L/6' }));
    // component stability between stations: each C as a fork-supported beam of length s carrying M/n
    const MEd = Math.max(env.Mmax, -env.Mmin), nC = spec.arr === 'b2b' ? 2 : 4;
    const Mcr1 = Math.PI / sst * Math.sqrt(E * one.Izz * G * one.It * (1 + Math.PI ** 2 * E * one.Iw / (G * one.It * sst * sst)));
    const ef1 = EN.arrangementEff(p, 'single', {}, fy, E, spec.mat.nu, 'My+'), W1 = Math.min(ef1.Wtop, ef1.Wbot);
    const l1 = Math.sqrt(W1 * fy / Mcr1), x1 = chi(l1, 0.34), Mb1 = x1 * W1 * fy / gm1;
    add(CHK.mk({ grp, name: 'Single C between connector stations (LTB over s)', clause: 'EN 1993-1-3 6.2.4 with L = s (fork at the stations)', Ed: MEd / nC, Rd: Mb1, unit: 'kNm', fmt: x => x / 1e6, basis: 'approx',
      steps: [s('M_cr,1', 'uniform moment, L = s', Mcr1 / 1e6, 'kNm'), s('λ̄', '', l1), s('χ_LT', 'curve b', x1)], eq: 'M_Ed/n ≤ M_b,Rd,1', why: 'A single C buckles between the welds.', fix: 'Reduce the station pitch.' }));
    if ((spec.N || 0) > 0) {
      const imin = Math.sqrt(one.Izz / one.A);
      add(CHK.mk({ grp, name: 'Closely spaced built-up member: connector spacing ≤ 15 i_min', clause: 'EN 1993-1-1 6.4.4 (Table 6.9)', Ed: sst, Rd: 15 * imin, unit: 'mm', fmt: x => x, eq: 's ≤ 15 i_min' }));
    }
    let pairComposite = true;
    if (spec.arr === 'quad') {
      if (b.pcs === 'none') { pairComposite = false; add(CHK.mk({ grp, name: 'Pair-to-pair connection', clause: 'EN 1993-1-1 6.4', eta: null, review: false, basis: 'code', na: true, naReason: 'No pair-to-pair connection: the pairs are designed as separate members (minor-axis stiffness not combined).' })); }
      else {
        const ip = gr.pair.iz, ok = b.pcS <= 15 * ip;
        const Fflange = MEd / (p.H - t) / 2, FEd = 0.025 * Fflange; // nominal 2.5 % of the flange force (approximation)
        const Ftab = b.pcT * b.pcW * fy / (Math.sqrt(3) * gm2);
        const c = add(CHK.mk({ grp, name: 'Pair-to-pair tabs (shear for combined lateral bending)', clause: 'EN 1993-1-1 6.4.4 spacing; 2.5 % flange force (documented approximation)', Ed: FEd, Rd: Ftab, unit: 'kN', fmt: x => x / 1e3, basis: 'approx', steps: [s('tab pitch', '', b.pcS, 'mm'), s('15 i_min (pair)', '', 15 * ip, 'mm')], review: !ok, note: ok ? '' : 'Tab pitch exceeds 15 i_min of a pair.' }));
        pairComposite = c.status === 'PASS';
      }
    }
    const composite = checks.every(c => c.status === 'PASS' || c.status === 'N/A');
    return { checks, composite, pairComposite, TEd, Rt };
  }
  const boltAs = d => ({ 5: 14.2, 6: 20.1, 8: 36.6, 10: 58, 12: 84.3, 14: 115, 16: 157, 18: 192, 20: 245, 22: 303, 24: 353, 27: 459, 30: 561 }[Math.round(d)] || 0.7854 * (d - 0.9382 * (d <= 12 ? 1.75 : d <= 16 ? 2 : d <= 22 ? 2.5 : 3)) ** 2);
  const boltFu = g => ({ '4.6': 400, '5.6': 500, '8.8': 800, '10.9': 1000 }[g] || 800);
  const boltFy = g => ({ '4.6': 240, '5.6': 300, '8.8': 640, '10.9': 900 }[g] || 640);
  return { design, chi, fbv, crippling, aisiFlexure, dsm, builtUp, boltAs, boltFu, boltFy, curveAlpha };
})();

