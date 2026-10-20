// @ts-nocheck — ported verbatim from the mockup (index.html, 55_resist.js); logic unchanged so results match the mockup.
import "server-only";
import { CHK } from '@/shared/check';
import { MEM } from './member';
// ===== Fastener / weld / plate resistance providers per design route =====
// Each function returns { Rd (N or N/mm), clause, steps, basis } so the connection engine stays route-independent.
export const RES: any = (() => {
  const s = CHK.s;
  const As = d => MEM.boltAs(d), Ab = d => Math.PI * d * d / 4;
  const fub = g => MEM.boltFu(g);
  const betaW = fu => fu < 400 ? 0.8 : fu < 470 ? 0.85 : fu < 520 ? 0.9 : 1.0; // EN 1993-1-8 Table 4.1 by the weaker part (approximate grade mapping)
  function provider(R) {
    if (R.code === 'AISI') return aisi(R);
    if (R.code === 'IS') return isr(R);
    return en(R);
  }
  function en(R) {
    const g0 = R.gM0, g2 = R.gM2;
    return {
      code: 'EN',
      boltShear(d, gr, planes, thread) {
        const A = thread ? As(d) : Ab(d), av = thread && gr === '10.9' ? 0.5 : (thread && gr === '4.8' ? 0.5 : 0.6);
        const Rd = planes * av * fub(gr) * A / g2;
        return { Rd, clause: 'EN 1993-1-8 Table 3.4', steps: [s('α_v', thread ? 'thread in the shear plane' : 'shank', av), s('A', thread ? 'A_s' : 'π d²/4', A, 'mm²'), s('F_v,Rd', `${planes} × α_v f_ub A / γM2`, Rd / 1e3, 'kN')] };
      },
      boltTension(d, gr) { const Rd = 0.9 * fub(gr) * As(d) / g2; return { Rd, clause: 'EN 1993-1-8 Table 3.4', steps: [s('F_t,Rd', '0.9 f_ub A_s / γM2', Rd / 1e3, 'kN')] }; },
      bearingPlate(d, d0, t, fu, gr, e1, e2, p1, p2) {
        const ab = Math.min(e1 / (3 * d0), p1 > 0 ? p1 / (3 * d0) - 0.25 : Infinity, fub(gr) / fu, 1);
        const k1 = Math.min(2.8 * e2 / d0 - 1.7, p2 > 0 ? 1.4 * p2 / d0 - 1.7 : Infinity, 2.5);
        const Rd = Math.max(0, k1) * Math.max(0, ab) * fu * d * t / g2;
        return { Rd, clause: 'EN 1993-1-8 Table 3.4 (bearing)', steps: [s('α_b', 'min(e_1/3d_0; p_1/3d_0 − ¼; f_ub/f_u; 1)', ab), s('k_1', 'min(2.8 e_2/d_0 − 1.7; 1.4 p_2/d_0 − 1.7; 2.5)', k1), s('F_b,Rd', 'k_1 α_b f_u d t / γM2', Rd / 1e3, 'kN')] };
      },
      // thin sheet, EN 1993-1-3 Table 8.4 (0.75 ≤ t < 3 mm)
      bearingThin(d, d0, t, fu, e1, e2, p1, p2) {
        const ab = Math.min(1, e1 / (3 * d)), kt = t > 1.25 ? 1.0 : (0.8 * t + 1.5) / 2.5;
        const Rd = 2.5 * ab * kt * fu * d * t / g2;
        const valid = e1 >= 1.0 * d0 - 1e-6 && e2 >= 1.5 * d0 - 1e-6 && (p1 <= 0 || p1 >= 3 * d0 - 1e-6) && (p2 <= 0 || p2 >= 3 * d0 - 1e-6) && t >= 0.75;
        return { Rd, valid, clause: 'EN 1993-1-3 Table 8.4 (bolts, thin sheet)', steps: [s('α_b', 'min(1; e_1/3d)', ab), s('k_t', t > 1.25 ? 't > 1.25 mm' : '(0.8 t + 1.5)/2.5', kt), s('F_b,Rd', '2.5 α_b k_t f_u d t / γM2', Rd / 1e3, 'kN')],
          note: valid ? '' : 'Spacing / edge limits of EN 1993-1-3 Table 8.4 (e_1 ≥ d_0, e_2 ≥ 1.5 d_0, p ≥ 3 d_0) not met.' };
      },
      pullThrough(dw, t, fu) { const Rd = dw * t * fu / g2; return { Rd, clause: 'EN 1993-1-3 Table 8.4 (pull-through, d_w t f_u / γM2 – verify)', steps: [s('F_p,Rd', 'd_w t f_u / γM2', Rd / 1e3, 'kN')], basis: 'approx' }; },
      weldPerLength(a, fu) { const bw = betaW(fu), f = fu / (Math.sqrt(3) * bw * g2) * a; return { Rd: f, clause: 'EN 1993-1-8 4.5.3.3 (simplified)', steps: [s('β_w', 'Table 4.1', bw), s('f_vw,d', 'f_u/(√3 β_w γM2)', f / a, 'N/mm²'), s('F_w,Rd', 'f_vw,d a', f, 'N/mm')] }; },
      // EN 1993-1-3 8.6 side fillet weld on thin sheet
      weldThin(t, Lw, b, fu) {
        const Rd = Lw <= b ? t * Lw * (0.9 - 0.45 * Lw / b) * fu / g2 : 0.45 * t * b * fu / g2;
        return { Rd, clause: 'EN 1993-1-3 8.6 (side fillet welds, t ≤ 4 mm)', steps: [s('F_w,Rd', Lw <= b ? 't L_w (0.9 − 0.45 L_w/b) f_u / γM2' : '0.45 t b f_u / γM2', Rd / 1e3, 'kN')] };
      },
      blockShear(Anv, Ant, fy, fu, ecc) { const Rd = (ecc ? 0.5 : 1) * fu * Ant / g2 + fy * Anv / (Math.sqrt(3) * g0); return { Rd, clause: `EN 1993-1-8 3.10.2 (eq. ${ecc ? '3.10' : '3.9'})`, steps: [s('A_nv', '', Anv, 'mm²'), s('A_nt', '', Ant, 'mm²'), s('V_eff,Rd', `${ecc ? '0.5 ' : ''}f_u A_nt/γM2 + f_y A_nv/(√3 γM0)`, Rd / 1e3, 'kN')] }; },
      shearYield(Av, fy) { const Rd = Av * fy / (Math.sqrt(3) * g0); return { Rd, clause: 'EN 1993-1-1 6.2.6', steps: [s('V_pl,Rd', 'A_v f_y / (√3 γM0)', Rd / 1e3, 'kN')] }; },
      shearRupture(Anv, fu) { const Rd = Anv * fu / (Math.sqrt(3) * g2); return { Rd, clause: 'Net shear f_u/(√3 γM2) (EN 1993-1-8 3.10.2 basis)', steps: [s('V_net,Rd', 'A_v,net f_u / (√3 γM2)', Rd / 1e3, 'kN')], basis: 'approx' }; },
      plateBending(W, fy, rho) { const Rd = W * fy * (1 - rho) / g0; return { Rd, clause: 'EN 1993-1-1 6.2.5 / 6.2.8', steps: [s('ρ', '(2 V/V_pl − 1)² if V > 0.5 V_pl', rho), s('M_Rd', 'W_el f_y (1 − ρ) / γM0', Rd / 1e6, 'kNm')] }; },
      gM0: g0, gM2: g2, gM5: 1.0
    };
  }
  function aisi(R) {
    const p = R.phi;
    return {
      code: 'AISI',
      boltShear(d, gr, planes, thread) { const F = (thread ? 0.45 : 0.563) * fub(gr), Rd = planes * p.boltV * F * Ab(d); return { Rd, clause: 'AISC 360-16 J3.6, F_nv as the Table J3.2 ratio to F_u (verify for metric grades)', steps: [s('F_nv', thread ? '0.45 f_ub' : '0.563 f_ub', F, 'N/mm²'), s('φR_n', `${planes} × 0.75 F_nv A_b`, Rd / 1e3, 'kN')], basis: 'approx' }; },
      boltTension(d, gr) { const Rd = p.boltV * 0.75 * fub(gr) * Ab(d); return { Rd, clause: 'AISC 360-16 J3.6 (F_nt = 0.75 F_u)', steps: [s('φR_n', '0.75 × 0.75 f_ub A_b', Rd / 1e3, 'kN')] }; },
      bearingPlate(d, d0, t, fu, gr, e1, e2, p1, p2) { const lc = Math.min(e1 - d0 / 2, p1 > 0 ? p1 - d0 : Infinity); const Rn = Math.min(2.4 * d * t * fu, 1.2 * lc * t * fu); const Rd = 0.75 * Rn; return { Rd, clause: 'AISC 360-16 J3.10(a)', steps: [s('l_c', 'clear distance', lc, 'mm'), s('φR_n', '0.75 min(2.4 d t F_u, 1.2 l_c t F_u)', Rd / 1e3, 'kN')] }; },
      bearingThin(d, d0, t, fu, e1, e2, p1, p2, mf = 1.0) {
        const r = d / t, C = r < 10 ? 3.0 : r <= 22 ? 4 - 0.1 * r : 1.8, Rd = 0.60 * C * mf * d * t * fu;
        return { Rd, valid: true, clause: 'AISI S100-16 J3.3.1 (bearing without deformation consideration; verify C and m_f)', steps: [s('C', 'Table J3.3.1-1', C), s('m_f', '', mf), s('φR_n', '0.60 C m_f d t F_u', Rd / 1e3, 'kN')], basis: 'approx' };
      },
      pullThrough(dw, t, fu) { return { Rd: NaN, clause: 'AISI S100-16: pull-over of bolts in thin sheet not implemented', steps: [], basis: 'none' }; },
      weldPerLength(a, fu) { const f = p.weld * 0.6 * 480 * 0.707 * a / 0.707; return { Rd: p.weld * 0.6 * 480 * a, clause: 'AISC 360-16 J2.4 (E70 / F_EXX = 480 N/mm², throat a)', steps: [s('φR_n', '0.75 × 0.6 F_EXX a', p.weld * 0.6 * 480 * a, 'N/mm')] }; },
      weldThin(t, Lw, b, fu) { const r = Lw / t, Rd = r < 25 ? 0.60 * (1 - 0.01 * r) * t * Lw * fu : 0.55 * 0.75 * t * Lw * fu; return { Rd, clause: 'AISI S100-16 J2.5 longitudinal fillet welds (verify)', steps: [s('φR_n', r < 25 ? '0.60 (1 − 0.01 L/t) t L F_u' : '0.55 × 0.75 t L F_u', Rd / 1e3, 'kN')], basis: 'approx' }; },
      blockShear(Anv, Ant, fy, fu, ecc) { const Ubs = ecc ? 0.5 : 1, Rn = Math.min(0.6 * fu * Anv, 0.6 * fy * Anv) + Ubs * fu * Ant, Rd = 0.75 * Rn; return { Rd, clause: 'AISC 360-16 J4.3', steps: [s('φR_n', '0.75 [min(0.6 F_u A_nv, 0.6 F_y A_gv) + U_bs F_u A_nt]', Rd / 1e3, 'kN')] }; },
      shearYield(Av, fy) { const Rd = 1.0 * 0.6 * fy * Av; return { Rd, clause: 'AISC 360-16 J4.2(a)', steps: [s('φR_n', '1.0 × 0.6 F_y A_gv', Rd / 1e3, 'kN')] }; },
      shearRupture(Anv, fu) { const Rd = 0.75 * 0.6 * fu * Anv; return { Rd, clause: 'AISC 360-16 J4.2(b)', steps: [s('φR_n', '0.75 × 0.6 F_u A_nv', Rd / 1e3, 'kN')] }; },
      plateBending(W, fy, rho) { const Rd = 0.9 * fy * W * (1 - rho); return { Rd, clause: 'AISC 360-16 F11 (elastic modulus, conservative)', steps: [s('φM_n', '0.9 F_y S', Rd / 1e6, 'kNm')] }; },
      gM0: 1, gM2: 1, gM5: 1
    };
  }
  function isr(R) {
    const g0 = 1.10, g1 = 1.25, gb = 1.25, gw = 1.25;
    return {
      code: 'IS',
      boltShear(d, gr, planes, thread) { const A = thread ? As(d) : Ab(d), Rd = fub(gr) / (Math.sqrt(3) * gb) * planes * A; return { Rd, clause: 'IS 800:2007 10.3.3', steps: [s('V_dsb', 'f_ub/(√3 γ_mb) (n_n A_nb + n_s A_sb)', Rd / 1e3, 'kN')] }; },
      boltTension(d, gr) { const Rd = 0.9 * fub(gr) * As(d) / gb; return { Rd, clause: 'IS 800:2007 10.3.5', steps: [s('T_db', '0.9 f_ub A_n / γ_mb', Rd / 1e3, 'kN')] }; },
      bearingPlate(d, d0, t, fu, gr, e1, e2, p1, p2) { const kb = Math.min(e1 / (3 * d0), p1 > 0 ? p1 / (3 * d0) - 0.25 : Infinity, fub(gr) / fu, 1), Rd = 2.5 * kb * d * t * fu / gb; return { Rd, clause: 'IS 800:2007 10.3.4', steps: [s('k_b', 'min(e/3d_0; p/3d_0 − 0.25; f_ub/f_u; 1)', kb), s('V_dpb', '2.5 k_b d t f_u / γ_mb', Rd / 1e3, 'kN')] }; },
      bearingThin(d, d0, t, fu) { return { Rd: NaN, valid: false, clause: 'Thin sheet (t < 3 mm): outside IS 800:2007; IS 801 not implemented', steps: [], basis: 'none' }; },
      pullThrough() { return { Rd: NaN, clause: 'Thin sheet pull-through: outside IS 800:2007', steps: [], basis: 'none' }; },
      weldPerLength(a, fu) { const f = fu / (Math.sqrt(3) * gw) * a; return { Rd: f, clause: 'IS 800:2007 10.5.7.1.1', steps: [s('f_wd', 'f_u/(√3 γ_mw)', f / a, 'N/mm²'), s('per length', 'f_wd t_t', f, 'N/mm')] }; },
      weldThin() { return { Rd: NaN, clause: 'Welds on thin sheet: outside IS 800:2007', steps: [], basis: 'none' }; },
      blockShear(Anv, Ant, fy, fu) { const Rd = Math.min(Anv * fy / (Math.sqrt(3) * g0) + 0.9 * Ant * fu / g1, 0.9 * Anv * fu / (Math.sqrt(3) * g1) + Ant * fy / g0); return { Rd, clause: 'IS 800:2007 6.4.1 (gross areas taken as net – conservative)', steps: [s('T_db', 'min(…)', Rd / 1e3, 'kN')] }; },
      shearYield(Av, fy) { const Rd = Av * fy / (Math.sqrt(3) * g0); return { Rd, clause: 'IS 800:2007 8.4.1', steps: [s('V_d', 'A_v f_y/(√3 γ_m0)', Rd / 1e3, 'kN')] }; },
      shearRupture(Anv, fu) { const Rd = 0.9 * Anv * fu / (Math.sqrt(3) * g1); return { Rd, clause: 'IS 800:2007 6.4.1 (rupture term)', steps: [s('V_n', '0.9 A_vn f_u/(√3 γ_m1)', Rd / 1e3, 'kN')] }; },
      plateBending(W, fy, rho) { const Rd = W * fy * (1 - rho) / g0; return { Rd, clause: 'IS 800:2007 8.2.1.2 (elastic modulus)', steps: [s('M_d', 'Z_e f_y / γ_m0', Rd / 1e6, 'kNm')] }; },
      gM0: g0, gM2: g1, gM5: g0
    };
  }
  return { provider, betaW };
})();

