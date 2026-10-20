// @ts-nocheck — ported verbatim from the mockup (index.html, 80_restraint.js); logic unchanged so results match the mockup.
import { LOADS } from './loads';
import { SEC } from './section';
import { U } from './util';
import { CHK } from './check';
import { MEM } from './member';
import { CONN } from './conn';
import { RES } from './resist';
// ===== Surface / decking, joist beams, knee braces and bracing =====
export const RST = (() => {
  const s = CHK.s, kN = x => x / 1e3, kNm = x => x / 1e6;
  const KRIGID = 1000; // N/mm per mm: continuous lateral spring used when a restraint is demonstrated as "full" (S ≥ S_req)

  // ---------- surface / decking: vertical capacity ----------
  function deckVertical(x) {
    const { R, I, span, comb } = x, checks = [], add = c => { checks.push(c); return c; }, grp = 'Surface – floor capacity';
    const gk = LOADS.kg2kN(+I.d_sw + +I.qG) / 1e3, qk = LOADS.kg2kN(+I.qQ) / 1e3; // N/mm²
    const wU = comb.aG * gk + comb.aQ * qk, wS = gk + qk; // N/mm² → per mm width N/mm
    const M = wU * span * span / 8, typ = I.d_type; // per mm width (single span, conservative)
    const dlim = span / (+I.d_dl || 200);
    if (typ === 'mdf') {
      const t = +I.d_t, W = t * t / 6, fmd = +I.d_kmod * +I.d_fmk / +I.d_gm, sig = M / W;
      add(CHK.mk({ grp, name: 'Board bending between the secondaries (1 mm strip, single span)', clause: 'EN 1995-1-1 6.1.6 with f_m,d = k_mod f_m,k / γ_M (board values from the producer / EN 12369-1)', Ed: sig, Rd: fmd, unit: 'N/mm²', fmt: v => v, basis: 'user',
        steps: [s('w_Ed', 'ULS area load', wU * 1e3, 'kN/m²'), s('L', 'secondary spacing', span, 'mm'), s('M', 'w L²/8', M, 'N·mm/mm'), s('σ', 'M/(t²/6)', sig, 'N/mm²')], note: 'Board strength / stiffness are user inputs; verify against the product declaration.' }));
      const EI = +I.d_Em * t ** 3 / 12, def = 5 * wS * span ** 4 / (384 * EI);
      add(CHK.mk({ grp, name: 'Board deflection (instantaneous, no creep k_def)', clause: 'EN 1995-1-1 7.2 (limit by project)', Ed: def, Rd: dlim, unit: 'mm', fmt: v => v, basis: 'user', note: 'Creep (k_def) not included – review for long-term storage loads.' }));
      if (+I.QpLoc > 0) {
        const P = +I.QpLoc * 1e3 * comb.aQ, bef = Math.min(span, 0.5 * span + 100), Mp = P * span / 4 / bef;
        add(CHK.mk({ grp, name: 'Board under the concentrated load', clause: 'Effective width b_ef = 0.5 L + 100 mm (documented approximation)', Ed: Mp / W, Rd: fmd, unit: 'N/mm²', fmt: v => v, basis: 'approx' }));
      }
    } else if (typ === 'steel') {
      const Wm = +I.d_W / 1000, Im = +I.d_I / 1000, fy = +I.d_fy; // per mm width
      const MRd = Wm * fy / (R.code === 'EN' ? R.gM0 : 1.1);
      add(CHK.mk({ grp, name: 'Steel deck bending between the secondaries', clause: 'EN 1993-1-3 6.1.4 with the effective W_s per metre from the manufacturer', Ed: M, Rd: MRd, unit: 'N·mm/mm', fmt: v => v, basis: 'user', steps: [s('W_s', 'user (manufacturer)', +I.d_W, 'mm³/m')] }));
      const def = 5 * wS * span ** 4 / (384 * (R.E || 210000) * Im);
      add(CHK.mk({ grp, name: 'Steel deck deflection', clause: 'EN 1993-1-3 7.3', Ed: def, Rd: dlim, unit: 'mm', fmt: v => v, basis: 'user' }));
    } else {
      const qall = +I.d_qall;
      add(CHK.mk({ grp, name: typ === 'grating' ? 'Grating capacity for the span (manufacturer load table)' : 'Surface capacity (user)', clause: 'Manufacturer load table / user value', Ed: wU * 1e3, Rd: qall > 0 ? qall : NaN, unit: 'kN/m²', fmt: v => v, basis: qall > 0 ? 'user' : 'none', note: qall > 0 ? '' : 'Enter the design capacity of the surface for this span.' }));
    }
    return { checks, wU, wS };
  }

  // ---------- surface / decking: restraint to a secondary (or main beam) ----------
  // EN 1993-1-1 BB.2.1 (eq. BB.2) / EN 1993-1-3 10.1.1(6): S ≥ (E I_w π²/L² + G I_t + E I_z π²/L² 0.25 h²) 70/h²
  function deckRestraint(x) {
    const { R, I, mem, L, label, MEd, sbSpacing, nLines } = x, checks = [], add = c => { checks.push(c); return c; }, grp = `Surface restraint – ${label}`;
    const E = mem.E, G = E / (2 * (1 + mem.nu)), g = mem.g, h = mem.p.H;
    const Sreq = (E * g.Iw * Math.PI ** 2 / L ** 2 + G * g.It + E * g.Izz * Math.PI ** 2 / L ** 2 * 0.25 * h * h) * 70 / (h * h);
    const basis = I.d_basis, Sp = +I.d_S > 0 ? +I.d_S * 1e3 : NaN;
    const present = I.d_type !== 'none';
    const cS = add(CHK.mk({ grp, name: 'Shear stiffness of the surface ≥ required (full lateral restraint)', clause: 'EN 1993-1-1 BB.2.1 (eq. BB.2); EN 1993-1-3 10.1.1(6)', Ed: Sreq, Rd: Sp, unit: 'kN', fmt: kN, basis: basis === 'none' || !(Sp > 0) ? 'none' : 'user',
      steps: [s('S_req', '(E I_w π²/L² + G I_t + E I_z π²/L² · 0.25 h²) · 70/h²', kN(Sreq), 'kN'), s('S_provided', `user (${basis})`, kN(Sp), 'kN')], note: basis === 'none' ? 'Restraint data not demonstrated.' : '',
      why: 'The surface is not stiff enough in shear to hold the compression flange.', fix: 'Stiffer surface / more fixings, or demonstrate S by test or manufacturer data.' }));
    // fastener force: stabilising force of the compression flange (EN 1993-1-1 5.3.3, e0 = L/500) + spring force from the torsion model
    const Nf = MEd / (h - mem.p.t), qd = Nf * 8 * (L / 500) / (L * L); // N/mm
    const sf = +I.d_fs, nf = Math.round(+I.d_fn), Fspring = (x.latCmax || 0) * sf, FEd = (qd * sf + Fspring) / nf;
    let FRd = +I.d_fv > 0 ? +I.d_fv * 1e3 : NaN, fSteps = [], fClause = 'Fastener shear resistance (manufacturer)', fBasis = +I.d_fv > 0 ? 'user' : 'none';
    if (I.d_fx === 'screw' && I.d_type === 'steel') {
      const t = +I.d_t, t1 = mem.p.t, d = +I.d_fd, al = t1 >= 2.5 * t ? 2.1 : Math.min(2.1, 3.2 * Math.sqrt(t / d)), Fb = al * +I.d_fu * d * t / (R.code === 'EN' ? R.gM2 : 1.25);
      fSteps.push(s('α', t1 >= 2.5 * t ? 't_1 ≥ 2.5 t' : '3.2 √(t/d) ≤ 2.1', al), s('F_b,Rd', 'α f_u d t / γM2 (deck sheet)', kN(Fb), 'kN'));
      FRd = isFinite(FRd) ? Math.min(FRd, Fb) : Fb; fClause = 'EN 1993-1-3 Table 8.2 (bearing) and manufacturer shear'; fBasis = 'code';
      if (!(+I.d_fv > 0)) fSteps.push(s('note', 'screw shear F_v,Rd not entered: bearing only (screw shear must exceed 1.2 F_b,Rd – verify)', '', ''));
    }
    const cF = add(CHK.mk({ grp, name: 'Surface fixings: restraint force per fastener', clause: fClause + '; force from EN 1993-1-1 5.3.3 (e_0 = L/500) + torsion-model spring force', Ed: FEd, Rd: FRd, unit: 'kN', fmt: kN, basis: fBasis,
      steps: [s('N_f', 'M_Ed / (h − t)', kN(Nf), 'kN'), s('q_d', '8 N_f e_0 / L²', qd, 'N/mm'), s('spring force', 'from the torsion model (load eccentricity)', x.latCmax || 0, 'N/mm'), s('F_Ed', '(q_d + q_spring) s / n', kN(FEd), 'kN'), ...fSteps] }));
    const anch = I.d_anch === 'yes', Ftot = (qd * L + (x.latCmax || 0) * L) * (nLines || 1) / 2;
    const cA = add(CHK.mk({ grp, name: 'Diaphragm anchorage to a braced bay / rigid support', clause: 'Load path check (user capacity)', Ed: Ftot, Rd: anch ? +I.d_anR * 1e3 : 0, unit: 'kN', fmt: kN, basis: anch ? 'user' : 'code', note: anch ? '' : 'The diaphragm is not anchored: the restraint cannot be credited.' }));
    const lateral = present && basis !== 'none' && cS.status === 'PASS' && cF.status === 'PASS' && cA.status === 'PASS';
    // torsional restraint C_D (EN 1993-1-3 10.1.5.2): only with a C_D,A from test / manufacturer
    const CDA = +I.d_CDA > 0 ? +I.d_CDA * 1e3 : NaN; // kNm/m/rad → N·mm/rad per mm
    const Ieff = (+I.d_I || 0) / 1000, CDC = 2 * E * Ieff / (sbSpacing || 1000);
    const CD = isFinite(CDA) && CDC > 0 ? 1 / (1 / CDA + 1 / CDC) : NaN;
    const tors = lateral && isFinite(CD);
    add(CHK.mk({ grp, name: 'Torsional restraint from the surface (C_D)', clause: 'EN 1993-1-3 10.1.5.2 (C_D = 1/(1/C_D,A + 1/C_D,C), C_D,C = k E I_eff/s, k = 2 – verify)', eta: 0, basis: isFinite(CD) ? 'user' : 'none', review: false,
      steps: [s('C_D,A', 'test / manufacturer', isFinite(CDA) ? CDA / 1e3 : '–', 'kNm/m/rad'), s('C_D,C', '2 E I_s / s', CDC / 1e3, 'kNm/m/rad'), s('C_D', '', isFinite(CD) ? CD / 1e3 : '–', 'kNm/m/rad')],
      note: tors ? 'Credited as a continuous torsional spring in the LTB / torsion model.' : 'Not credited: ' + (!isFinite(CDA) ? 'C_D,A not supplied from test or manufacturer data.' : 'lateral restraint not demonstrated.') }));
    if (!tors) checks[checks.length - 1].status = 'N/A', checks[checks.length - 1].naReason = checks[checks.length - 1].note;
    return { checks, lateral, tors, k: KRIGID, CD, Sreq, Sp, present, status: lateral ? (tors ? 'Lateral + torsional restraint demonstrated' : 'Lateral restraint demonstrated (torsional not credited)') : present ? 'Present but NOT demonstrated – not credited' : 'None' };
  }

  // ---------- section properties of small members (angles, boxes) ----------
  function angle(b, h, t) {
    const A = (b + h - t) * t;
    const yc = (h * t * t / 2 + (b - t) * t * (t + (b - t) / 2)) / A; // from the back of leg h (x) — leg b horizontal
    const zc = (b * t * t / 2 + (h - t) * t * (t + (h - t) / 2)) / A;
    const Iy = b * t ** 3 / 12 + b * t * (zc - t / 2) ** 2 + t * (h - t) ** 3 / 12 + t * (h - t) * (t + (h - t) / 2 - zc) ** 2;
    const Iz = h * t ** 3 / 12 + h * t * (yc - t / 2) ** 2 + t * (b - t) ** 3 / 12 + t * (b - t) * (t + (b - t) / 2 - yc) ** 2;
    const Iyz = b * t * (t / 2 - zc) * (b / 2 - yc) + (h - t) * t * (t + (h - t) / 2 - zc) * (t / 2 - yc);
    const Im = (Iy + Iz) / 2, Ir = Math.hypot((Iy - Iz) / 2, Iyz);
    return { A, yc, zc, Iy, Iz, Iu: Im + Ir, Iv: Im - Ir, iv: Math.sqrt((Im - Ir) / A), iy: Math.sqrt(Iy / A), Wel: Math.min(Iy / (h - zc), Iz / (b - yc)) };
  }
  function box(b, h, t) { const A = b * h - (b - 2 * t) * (h - 2 * t), I = (b * h ** 3 - (b - 2 * t) * (h - 2 * t) ** 3) / 12, Iz = (h * b ** 3 - (h - 2 * t) * (b - 2 * t) ** 3) / 12; return { A, Iy: I, Iz, iv: Math.sqrt(Math.min(I, Iz) / A), Wel: I / (h / 2) }; }

  // AISC 360-16 Appendix 6.3.2a nodal brace for beams: P_br = 0.02 M_r C_d / h_o, β_br = (1/φ) 10 M_r C_d / (L_br h_o), φ = 0.75
  function nodalBrace(Mr, ho, Lbr) { return { Pbr: 0.02 * Mr / ho, beta: 10 * Mr / (Lbr * ho) / 0.75 }; }

  // ---------- joist beams ----------
  function joists(x) {
    const { R, I, sec, Lsb, Lj, MEdSB, hSB } = x, checks = [], add = c => { checks.push(c); return c; }, grp = 'Joist beams';
    const n = Math.round(+I.j_n);
    if (n <= 0) return { checks, n: 0, positions: [], credited: false, k: 0 };
    // joists at a from each end and equally spaced between (one joist: mid-span); restraint spacing = largest unbraced segment
    const a = Math.min(+I.j_aL, Lsb / 2), SJ = n > 1 ? (Lsb - 2 * a) / (n - 1) : Lsb / 2, positions = n === 1 ? [Lsb / 2] : U.range(n, i => a + i * SJ);
    const Lbr = n === 1 ? Lsb / 2 : Math.max(a, SJ);
    const b = +I.j_b, h = +I.j_h, t = +I.j_t, fy = +I.j_fy, fu = +I.j_fu, E = +I.E;
    const gp = I.j_sec === 'box' ? box(b, h, t) : I.j_sec === 'C' ? { A: SEC.gross({ H: h, Bt: b, Bb: b, Ct: Math.min(15, b / 3), Cb: Math.min(15, b / 3), t, r: t }, 'single').A } : angle(b, h, t);
    if (I.j_sec === 'C') { const g = SEC.gross({ H: h, Bt: b, Bb: b, Ct: Math.min(15, b / 3), Cb: Math.min(15, b / 3), t, r: t }, 'single'); Object.assign(gp, { Iy: g.Iyy, iv: Math.sqrt(g.Izz / g.A), Wel: g.Wy }); }
    const g0 = R.code === 'EN' ? R.gM0 : 1.1, g1 = R.code === 'EN' ? R.gM1 : 1.1, g2 = R.code === 'EN' ? R.gM2 : 1.25;
    const brace = nodalBrace(MEdSB, hSB, Lbr);
    const NEd = brace.Pbr, q = +I.j_q, Mq = q * Lj * Lj / 8 + gp.A * 7850e-9 * 9.81 * 1.35 * Lj * Lj / 8;
    const lam = Lj / gp.iv / (Math.PI * Math.sqrt(E / fy)), ch = MEM.chi(lam, 0.34), Nb = ch * gp.A * fy / g1;
    const e = I.j_sec === 'L' ? Math.max(gp.zc || 0, gp.yc || 0) : 0, Mecc = NEd * e;
    const MRd = gp.Wel * fy / g0;
    add(CHK.mk({ grp, name: 'Joist: brace force in compression + bending (eccentric single-leg connection)', clause: 'AISC 360-16 App. 6.3.2a (P_br) with EN 1993-1-1 6.3.1 (curve b, i_min) and a linear N + M interaction (documented approximation)', eta: NEd / Nb + (Mecc + Mq) / MRd, basis: 'approx',
      steps: [s('P_br', '0.02 M_r / h_o', kN(NEd), 'kN'), s('L_J', '', Lj, 'mm'), s('λ̄', 'L/(i_min π √(E/f_y))', lam), s('N_b,Rd', 'χ A f_y/γM1', kN(Nb), 'kN'), s('M (eccentricity + load)', '', kNm(Mecc + Mq), 'kNm')] }));
    const d = +I.j_d, d0 = d <= 14 ? d + 1 : d + 2, nb = Math.round(+I.j_nb);
    const P = RES.provider(R), bs = P.boltShear(d, I.j_bg, 1, true), bb = P.bearingPlate(d, d0, t, fu, I.j_bg, +I.j_e1, Math.min(b, h) / 2, 0, 0);
    add(CHK.mk({ grp, name: 'Joist end bolts: shear and bearing', clause: bs.clause + '; ' + bb.clause, Ed: NEd / nb, Rd: Math.min(bs.Rd, bb.Rd), unit: 'kN', fmt: kN, steps: [...bs.steps, ...bb.steps] }));
    const bThin = P.bearingThin(d, d0, sec.p.t, sec.fu, 3 * d0, 1.5 * d0, 0, 0);
    add(CHK.mk({ grp, name: 'Bearing of the joist bolt on the secondary flange / web', clause: bThin.clause, Ed: NEd / nb, Rd: bThin.Rd, unit: 'kN', fmt: kN, basis: bThin.basis || 'code', steps: bThin.steps }));
    // stiffness: joist axial EA/L in series with the bolt slip stiffness
    const kb = CONN.stiffBolt(d, I.j_bg, t, fu, sec.p.t, sec.fu, E, +I.j_e1, 3 * d);
    const kJ = 1 / (1 / (E * gp.A / Lj) + 1 / (nb * kb.K) + 1 / (nb * kb.K));
    add(CHK.mk({ grp, name: 'Joist restraint stiffness vs. full-bracing requirement (information)', clause: 'AISC 360-16 App. 6.3.2a (β_br); the LTB model uses the actual K_J', eta: brace.beta / kJ, basis: 'num', review: false,
      steps: [s('K_J', '1/(L/EA + 2/(n K_b))', kJ, 'N/mm'), s('β_br (full bracing)', '10 M_r/(φ L_br h_o)', brace.beta, 'N/mm')], note: 'Below the full-bracing stiffness the joists still act as elastic springs in the LTB eigen-analysis (partial restraint).' }));
    checks[checks.length - 1].status = 'PASS'; // informational: stiffness enters the buckling model directly
    const anchored = I.j_anch !== 'none';
    const strengthOK = checks.slice(0, 3).every(c => c.status === 'PASS');
    const credited = anchored && strengthOK;
    return { checks, n, positions, SJ, Lbr, a, credited, k: kJ, at: I.j_at, reason: !anchored ? 'joist lines not anchored' : !strengthOK ? 'joist strength not demonstrated' : 'demonstrated', gp };
  }

  // ---------- knee braces ----------
  function knee(x) {
    const { R, I, Ncol, nCols, hc } = x, checks = [], add = c => { checks.push(c); return c; }, grp = 'Knee bracing';
    if (I.k_use !== 'yes') return { checks, use: false, H: 0, N: 0, Mcol: 0 };
    const th = +I.k_th * Math.PI / 180, a = +I.k_a, dv = a * Math.tan(th), Lkb = a / Math.cos(th);
    // notional horizontal force per column at beam level
    let phi, phiTxt;
    if (R.code === 'EN') { const ah = U.clamp(2 / Math.sqrt(hc / 1000), 2 / 3, 1), am = Math.sqrt(0.5 * (1 + 1 / Math.max(1, nCols))); phi = ah * am / 200; phiTxt = `φ = φ_0 α_h α_m = (1/200)·${U.fmt(ah, 3)}·${U.fmt(am, 3)} (EN 1993-1-1 5.3.2(3))`; }
    else if (R.code === 'AISI') { phi = 0.002; phiTxt = 'N_i = 0.002 Y_i (AISC 360-16 C2.2b)'; }
    else { phi = 0.005; phiTxt = '0.5 % of the factored gravity load (IS 800:2007 4.3.6)'; }
    const H = phi * Ncol + +I.k_H * 1e3;
    const ga = x.ga || null; // global analysis (unified app): brace forces from the frame model, compression and tension separately
    // gravity compression from the beam model with the knee supports (engine v1.6; not with the global analysis, which gives N itself)
    const Ng = !ga && x.grav && x.grav.R > 0 ? x.grav.R / Math.sin(th) : 0;
    const Fh = H * hc / dv, N = ga ? ga.Nc : Fh / Math.cos(th) + Ng, Nt = ga ? ga.Nt : Fh / Math.cos(th), Mcol = H * (hc - dv);
    const nL = +I.k_nL, b = +I.k_b, h = +I.k_h, t = +I.k_t, fy = +I.k_fy, fu = +I.k_fu, E = +I.E;
    const A1 = angle(b, h, t), A = nL * A1.A;
    const g0 = R.code === 'EN' ? R.gM0 : 1.1, g1 = R.code === 'EN' ? R.gM1 : 1.1, g2 = R.code === 'EN' ? R.gM2 : 1.25;
    const d = +I.k_d, d0 = d <= 14 ? d + 1 : d + 2, nb = Math.round(+I.k_nb), e2 = +I.k_e2 > 0 ? +I.k_e2 : b / 2, p1 = +I.k_p1, e1 = +I.k_e1;
    // compression: single angle (EN 1993-1-1 BB.1.2 for ≥ 2 bolts) or two angles (buckling about the axis parallel to the connected legs, packing ≤ 15 i_min)
    let i = nL === 1 ? A1.iv : A1.iy, note = '';
    if (nL === 2 && +I.k_sp > 15 * A1.iv) { i = A1.iv; note = 'Packing spacing > 15 i_min: each angle checked on its own (EN 1993-1-1 6.4.4).'; }
    const lam = Lkb / i / (Math.PI * Math.sqrt(E / fy));
    const lamEff = nL === 1 && nb >= 2 ? 0.35 + 0.7 * lam : lam;
    const ch = MEM.chi(lamEff, 0.34), Nb = ch * A * fy / g1;
    const ecc = nL === 1 && nb < 2;
    const eM = ecc ? N * (A1.zc) / (A1.Wel * fy / g0) : 0;
    add(CHK.mk({ grp, name: 'Knee brace in compression', clause: nL === 1 ? (nb >= 2 ? 'EN 1993-1-1 6.3.1 with BB.1.2 (λ̄_eff,v = 0.35 + 0.7 λ̄_v)' : 'EN 1993-1-1 6.3.1 + eccentricity moment (one bolt: BB.1.2 not applicable – documented approximation)') : 'EN 1993-1-1 6.3.1 / 6.4.4 (two angles)', eta: N / Nb + eM, basis: ecc ? 'approx' : 'code',
      steps: [...(ga ? [s('N_Ed', 'global frame analysis: ' + ga.case, kN(N), 'kN')] : [s('H', phiTxt + ' × N + H_add', kN(H), 'kN'), ...(Ng ? [s('R_knee', `largest knee reaction of the ${x.grav.where} model (ULS)`, kN(x.grav.R), 'kN'), s('N_grav', 'R_knee / sin θ', kN(Ng), 'kN'), s('N_Ed', 'H h_c / (d_v cos θ) + N_grav', kN(N), 'kN')] : [s('N_Ed', 'H h_c / (d_v cos θ)', kN(N), 'kN')])]), s('L_KB', 'a / cos θ', Lkb, 'mm'), s('λ̄', '', lamEff), s('χ', 'curve b', ch), s('N_b,Rd', '', kN(Nb), 'kN')], note }));
    // tension (net section of angles connected by one leg, EN 1993-1-8 3.10.3)
    const Anet = A1.A - d0 * t, beta = nb === 2 ? U.interp(p1, [2.5 * d0, 5 * d0], [0.4, 0.7]) : U.interp(p1, [2.5 * d0, 5 * d0], [0.5, 0.7]);
    const Nu = nb === 1 ? 2 * (e2 - 0.5 * d0) * t * fu / g2 : beta * Anet * fu / g2;
    add(CHK.mk({ grp, name: 'Knee brace in tension (net section, angle connected by one leg)', clause: 'EN 1993-1-8 3.10.3 (eq. 3.11–3.13)', Ed: Nt, Rd: Math.min(nL * Nu, A * fy / g0), unit: 'kN', fmt: kN, basis: R.code === 'EN' ? 'code' : 'approx' }));
    const P = RES.provider(R), planes = nL === 2 ? 2 : 1, bs = P.boltShear(d, I.k_bg, planes, true), bb = P.bearingPlate(d, d0, t, fu, I.k_bg, e1, e2, nb > 1 ? p1 : 0, 0);
    const Nb_ = Math.max(N, Nt);
    add(CHK.mk({ grp, name: 'Knee brace bolts: shear', clause: bs.clause, Ed: Nb_ / nb, Rd: bs.Rd, unit: 'kN', fmt: kN, steps: bs.steps }));
    add(CHK.mk({ grp, name: 'Knee brace bolts: bearing on the angle(s)', clause: bb.clause, Ed: Nb_ / nb / nL, Rd: bb.Rd, unit: 'kN', fmt: kN, steps: bb.steps }));
    if (nL === 2) { const bg = P.bearingPlate(d, d0, +I.k_tg, 430, I.k_bg, e1, e2, nb > 1 ? p1 : 0, 0); add(CHK.mk({ grp, name: 'Knee brace bolts: bearing on the gusset', clause: bg.clause, Ed: Nb_ / nb, Rd: bg.Rd, unit: 'kN', fmt: kN, steps: bg.steps, note: 'Gusset f_u = 430 N/mm² assumed (S275).' })); }
    return { checks, use: true, H, N, Nt, Ng, Fh, Fv: Fh * Math.tan(th), Mcol, dv, Lkb, phi, a, ga: !!ga };
  }

  // ---------- plan and vertical bracing ----------
  function bracing(x) {
    const { R, I, sumNf, nRestr, Lline, Htot, Lmb, Lsb, hc } = x, checks = [], add = c => { checks.push(c); return c; }, grp = 'Bracing', ga = x.ga || null;
    const P = RES.provider(R), g0 = R.code === 'EN' ? R.gM0 : 1.1, g2 = R.code === 'EN' ? R.gM2 : 1.25;
    const memRes = (b, t, typ) => {
      const fy = +I.br_fy, fu = +I.br_fu, d = +I.br_d, d0 = d <= 14 ? d + 1 : d + 2;
      let A, Anet;
      if (typ === 'rod') { A = MEM.boltAs(b) || Math.PI * b * b / 4 * 0.78; Anet = A; }
      else if (typ === 'angle') { A = angle(b, b, t).A; Anet = A - d0 * t; }
      else { A = b * t; Anet = (b - d0) * t; }
      const Npl = A * fy / g0, Nu = 0.9 * Anet * fu / g2;
      return { A, Anet, Rd: Math.min(Npl, Nu), steps: [s('A', '', A, 'mm²'), s('N_pl,Rd', 'A f_y/γM0', kN(Npl), 'kN'), s('N_u,Rd', '0.9 A_net f_u/γM2', kN(Nu), 'kN')] };
    };
    let qd = 0, Fpl = 0;
    if (I.br_use === 'yes') {
      const m = Math.max(1, nRestr), am = Math.sqrt(0.5 * (1 + 1 / m)), e0 = am * Lline / 500;
      qd = sumNf * 8 * e0 / (Lline * Lline);
      const Vb = qd * Lline / 2 / Math.max(1, +I.br_nbay) + (+I.br_H * 1e3) / 2;
      const Ld = Math.hypot(Lmb, Lsb); Fpl = Vb * Ld / Lsb + (ga ? ga.Fplan : 0); // + sway load transferred between the frame lines (global analysis)
      const r = memRes(+I.br_b, +I.br_t, I.br_type);
      add(CHK.mk({ grp, name: 'Plan bracing diagonal (tension)', clause: 'EN 1993-1-1 5.3.3 (q_d = Σ N_Ed 8 e_0 / L², e_0 = α_m L/500, δ_q = 0) and 6.2.3', Ed: Fpl, Rd: r.Rd, unit: 'kN', fmt: kN, basis: 'approx',
        steps: [s('Σ N_Ed', 'compression-flange forces restrained by one bracing', kN(sumNf), 'kN'), s('m', 'restrained members', m), s('e_0', 'α_m L/500', e0, 'mm'), s('q_d', '', qd, 'N/mm'), s('F_diag', ga ? `V L_d / L_sb + ${U.fmt(ga.Fplan / 1e3, 2)} kN transferred between the frame lines (global analysis)` : 'V L_d / L_sb', kN(Fpl), 'kN'), ...r.steps], note: 'δ_q (in-plane deflection of the bracing) taken as 0: verify that the bracing is stiff (EN 1993-1-1 5.3.3(2)).' }));
      const bs = P.boltShear(+I.br_d, I.br_bg, 1, true), bb = P.bearingPlate(+I.br_d, +I.br_d + 1, +I.br_t, +I.br_fu, I.br_bg, 2 * (+I.br_d + 1), (+I.br_b) / 2, 0, 0);
      add(CHK.mk({ grp, name: 'Plan bracing end bolts', clause: bs.clause, Ed: Fpl / Math.round(+I.br_nb), Rd: Math.min(bs.Rd, bb.Rd), unit: 'kN', fmt: kN, steps: [...bs.steps, ...bb.steps] }));
    } else add(CHK.na({ grp, name: 'Plan bracing', clause: '' }, 'No plan bracing: main-beam restraints through SB-Int lines must be anchored otherwise (wall / diaphragm).'));
    let Fv = 0;
    if (I.vb_use === 'yes') {
      const Ld = Math.hypot(Lmb, hc); Fv = ga && ga.Fv !== null ? ga.Fv : Htot * Ld / Lmb;
      const r = memRes(+I.vb_b, +I.vb_t, 'flat');
      add(CHK.mk({ grp, name: 'Vertical bracing diagonal (tension only)', clause: 'EN 1993-1-1 5.3.2 notional sway forces + 6.2.3', Ed: Fv, Rd: r.Rd, unit: 'kN', fmt: kN, steps: [...(ga && ga.Fv !== null ? [s('F', 'tension diagonal, global frame analysis: ' + ga.FvCase, kN(Fv), 'kN')] : [s('H', 'notional + additional, per braced line', kN(Htot), 'kN'), s('F', 'H L_d / L', kN(Fv), 'kN')]), ...r.steps] }));
    } else add(CHK.na({ grp, name: 'Vertical bracing', clause: '' }, 'No vertical bracing: frame stability from knee braces / column bending.'));
    return { checks, qd, Fpl, Fv };
  }
  return { deckVertical, deckRestraint, joists, knee, bracing, angle, box, nodalBrace, KRIGID };
})();

