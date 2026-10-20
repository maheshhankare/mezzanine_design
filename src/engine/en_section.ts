// @ts-nocheck — ported verbatim from the mockup (index.html, 20_en_section.js); logic unchanged so results match the mockup.
import { SEC } from './section';
// ===== EN 1993-1-3 / EN 1993-1-5 effective cross-section of a lipped C (sharp-corner notional model) =====
// Implemented: 5.1(3)-(4) notional widths and rounded-corner factor; 5.2 geometric limits; 5.5.2 / EN 1993-1-5 4.4 effective widths;
// 5.5.3.2 plane element with edge stiffener (initial K = ∞ effective widths, spring stiffness K eq. 5.10b, σcr,s, χd 5.5.3.1(7));
// web effective width from the stress ratio of the section with the effective compression flange and the gross web (EN 1993-1-5 4.4(3)).
// Not implemented: the optional iteration of ρ with σcom,Ed = χd fyb/γM0 (5.5.3.2(10)) – omitting it is conservative.
export const EN = (() => {
  const eps = fy => Math.sqrt(235 / fy);
  // EN 1993-1-5:2006+AC:2009 Table 4.1 (internal) and 4.2 (outstand) buckling factors
  function kInternal(psi) {
    if (psi >= 1) return 4.0;
    if (psi > 0) return 8.2 / (1.05 + psi);
    if (psi === 0) return 7.81;
    if (psi > -1) return 7.81 - 6.29 * psi + 9.78 * psi * psi;
    if (psi === -1) return 23.9;
    return 5.98 * (1 - psi) ** 2;
  }
  // EN 1993-1-5 4.4(2) eq. 4.2 (internal, with the AC:2009 limit) and eq. 4.3 (outstand)
  function rhoInternal(lp, psi) { const lim = 0.5 + Math.sqrt(Math.max(0, 0.085 - 0.055 * psi)); return lp <= lim ? 1 : Math.min(1, (lp - 0.055 * (3 + psi)) / (lp * lp)); }
  function rhoOutstand(lp) { return lp <= 0.748 ? 1 : Math.min(1, (lp - 0.188) / (lp * lp)); }
  const lamP = (b, t, fy, k) => (b / t) / (28.4 * eps(fy) * Math.sqrt(k));
  // EN 1993-1-3 5.5.3.2(5) eq. 5.13b/c, lip buckling factor
  function kLip(cRatio) { if (cRatio <= 0.35) return 0.5; return 0.5 + 0.83 * Math.cbrt((cRatio - 0.35) ** 2); }
  // EN 1993-1-3 5.5.3.1(7) eq. 5.12
  function chiD(ld) { if (ld <= 0.65) return 1.0; if (ld < 1.38) return 1.47 - 0.723 * ld; return 0.66 / ld; }

  // compression flange (width bp) + lip (cp) acting as an edge-stiffened element
  // kf: 0 for bending (other flange in tension), Area ratio for axial compression (both flanges)
  function stiffenedFlange(bp, cp, t, hw, fy, E, nu, kf, bp2) {
    const S = {};
    S.ratio_cb = cp / bp;
    S.lipIgnored = cp > 0 && S.ratio_cb < 0.2;
    // initial effective widths with K = ∞ (doubly supported flange, ψ = 1)
    S.lp_f = lamP(bp, t, fy, 4.0); S.rho_f = rhoInternal(S.lp_f, 1); S.be = S.rho_f * bp; S.be1 = S.be / 2; S.be2 = S.be / 2;
    if (!(cp > 0) || S.lipIgnored) {
      // no effective lip: flange treated as an outstand (EN 1993-1-3 5.2(2): lip ignored when c/b < 0.2)
      S.k_out = 0.43; S.lp_o = lamP(bp, t, fy, 0.43); S.rho_o = rhoOutstand(S.lp_o); S.beOut = S.rho_o * bp;
      S.chi_d = 1; S.mode = 'outstand';
      return S;
    }
    S.mode = 'stiffened';
    S.k_lip = kLip(Math.min(S.ratio_cb, 0.6)); S.lp_c = lamP(cp, t, fy, S.k_lip); S.rho_c = rhoOutstand(S.lp_c); S.ceff = S.rho_c * cp;
    // stiffener (b_e2 of the flange + effective lip): area, centroid and second moment about its own axis parallel to the flange
    S.As = t * (S.be2 + S.ceff);
    S.zs = (S.ceff * t * S.ceff / 2) / S.As; // distance below the flange centre-line
    S.Is = S.be2 * t ** 3 / 12 + S.be2 * t * S.zs ** 2 + t * S.ceff ** 3 / 12 + S.ceff * t * (S.ceff / 2 - S.zs) ** 2;
    // b1: web–flange junction to the stiffener centroid (horizontal)
    S.b1 = bp - (S.be2 * t * S.be2 / 2) / S.As;
    const b2 = bp2 === undefined ? S.b1 : bp2;
    S.K = E * t ** 3 / (4 * (1 - nu * nu)) / (S.b1 ** 2 * hw + S.b1 ** 3 + 0.5 * S.b1 * b2 * hw * kf); // EN 1993-1-3 eq. 5.10b
    S.scr = 2 * Math.sqrt(S.K * E * S.Is) / S.As; // eq. 5.15
    S.ld = Math.sqrt(fy / S.scr); S.chi_d = Math.min(1, chiD(S.ld));
    S.tred = S.chi_d * t;
    return S;
  }

  // effective section of ONE C for: 'My+' (top flange in compression), 'My-' (bottom), 'N' (uniform compression)
  // returns strips [{y0,z0,y1,z1,t}] in the sharp-corner centre-line frame (web y = 0, bottom flange z = 0, flanges to +y)
  function effective(p, fy, E = 210000, nu = 0.3, mode = 'My+') {
    const t = p.t;
    if (mode === 'My-') { // mirror top/bottom
      const q = Object.assign({}, p, { Bt: p.Bb, Bb: p.Bt, Ct: p.Cb, Cb: p.Ct });
      const r = effective(q, fy, E, nu, 'My+');
      const hp = p.H - t; r.strips = r.strips.map(s => ({ y0: s.y0, z0: hp - s.z0, y1: s.y1, z1: hp - s.z1, t: s.t, w: s.w }));
      r.zc = hp - r.zc; r.mode = 'My-'; return r;
    }
    const nt = SEC.notional(p), hp = nt.hp, bt = nt.bp_t, bb = nt.bp_b, ct = nt.cp_t, cb = nt.cp_b;
    const steps = { notional: nt };
    const strips = [];
    const add = (y0, z0, y1, z1, tt, w) => { if (Math.hypot(y1 - y0, z1 - z0) > 1e-9 && tt > 0) strips.push({ y0, z0, y1, z1, t: tt, w }); };
    if (mode === 'N') {
      const kf = 1; // both flanges in compression (symmetric for equal flanges; A_s2/A_s1 otherwise ≈ 1)
      const T = stiffenedFlange(bt, ct, t, hp, fy, E, nu, kf), B = stiffenedFlange(bb, cb, t, hp, fy, E, nu, kf);
      steps.top = T; steps.bot = B;
      placeFlange(add, T, bt, ct, t, hp, +1); placeFlange(add, B, bb, cb, t, 0, -1);
      const lw = lamP(hp, t, fy, 4.0), rw = rhoInternal(lw, 1); steps.web = { psi: 1, k: 4, lp: lw, rho: rw, beff: rw * hp };
      add(0, hp, 0, hp - rw * hp / 2, t, 'web'); add(0, rw * hp / 2, 0, 0, t, 'web');
      const pr = props(strips); return Object.assign(pr, { strips, steps, mode, hp });
    }
    // bending, top flange in compression
    const T = stiffenedFlange(bt, ct, t, hp, fy, E, nu, 0); steps.top = T;
    placeFlange(add, T, bt, ct, t, hp, +1);
    // tension flange and lip: fully effective
    add(0, 0, bb, 0, t, 'flB'); if (cb > 0) add(bb, 0, bb, cb, t, 'lipB');
    // web: EN 1993-1-5 4.4(3) – ψ from the stress distribution of the effective compression flange + GROSS web (single pass)
    const zc = props(strips.concat([{ y0: 0, z0: hp, y1: 0, z1: 0, t, w: 'web' }])).zc;
    const comp = hp - zc, psi = Math.max(-3, -(zc) / comp);
    const k = kInternal(psi), lp = lamP(hp, t, fy, k), rho = rhoInternal(lp, psi);
    const bc = comp, beff = rho * bc, W = { psi, k, lp, rho, bc, beff, be1: 0.4 * beff, be2: 0.6 * beff, zna: zc };
    steps.web = W;
    if (W.rho >= 1) add(0, hp, 0, 0, t, 'web'); else { add(0, hp, 0, hp - W.be1, t, 'web'); add(0, zc + W.be2, 0, 0, t, 'web'); }
    const pr = props(strips);
    return Object.assign(pr, { strips, steps, mode, hp });
  }
  // place a flange of width bp at height z with its lip pointing towards the section (dir = +1 top: lip goes down; −1 bottom: lip goes up)
  function placeFlange(add, S, bp, cp, t, z, dir) {
    const lipDir = dir > 0 ? -1 : 1;
    if (S.mode === 'outstand') { add(0, z, S.beOut, z, t, 'fl'); return; }
    add(0, z, S.be1, z, t, 'fl');
    add(bp - S.be2, z, bp, z, S.tred, 'flS');
    add(bp, z, bp, z + lipDir * S.ceff, S.tred, 'lip');
  }
  function props(strips) {
    let A = 0, Sy = 0, Sz = 0, Iyy0 = 0, Izz0 = 0, own = 0;
    for (const s of strips) {
      const L = Math.hypot(s.y1 - s.y0, s.z1 - s.z0), dA = s.t * L;
      A += dA; Sy += dA * (s.y0 + s.y1) / 2; Sz += dA * (s.z0 + s.z1) / 2;
      Iyy0 += dA * (s.z0 ** 2 + s.z0 * s.z1 + s.z1 ** 2) / 3; Izz0 += dA * (s.y0 ** 2 + s.y0 * s.y1 + s.y1 ** 2) / 3;
      if (Math.abs(s.z1 - s.z0) < 1e-9) own += L * s.t ** 3 / 12; // own bending of horizontal strips
    }
    const yc = Sy / A, zc = Sz / A;
    return { A, yc, zc, Iyy: Iyy0 - A * zc * zc + own, Izz: Izz0 - A * yc * yc };
  }

  // assembled effective properties for the arrangement (each C placed like SEC.assembly); returns W_eff for the mode
  function arrangementEff(p, arr, opt, fy, E, nu, mode) {
    const one = effective(p, fy, E, nu, mode);
    const t = p.t, gap = Math.max(0, (opt && opt.gap) || 0), s = (opt && opt.pairSpacing) || 0, yw = gap / 2 + t / 2;
    const places = arr === 'single' ? [[1, 0]] : arr === 'b2b' ? [[-1, -yw], [1, yw]] : [[-1, -s / 2 - yw], [1, -s / 2 + yw], [-1, s / 2 - yw], [1, s / 2 + yw]];
    const all = [];
    for (const [o, y0] of places) for (const st of one.strips) all.push({ y0: y0 + o * st.y0, z0: st.z0, y1: y0 + o * st.y1, z1: st.z1, t: st.t });
    const pr = props(all);
    const nt = one.steps.notional;
    // rounded corners: 5.1(3) — neglected for resistance when r ≤ 5t and r ≤ 0.10 b_p; otherwise apply 5.1(4) eq. 5.1
    const dl = nt.neglect ? 0 : nt.delta;
    const A = pr.A * (1 - dl), I = pr.Iyy * (1 - 2 * dl);
    // extreme fibres: sharp-corner model, outer faces at z = −t/2 and hp + t/2
    const hp = one.hp, zTop = hp + t / 2 - pr.zc, zBot = pr.zc + t / 2;
    return { one, A, Iyy: I, zc: pr.zc, zTop, zBot, Wtop: I / zTop, Wbot: I / zBot, delta: dl, roundedNeglected: nt.neglect, yc: pr.yc, Izz: pr.Izz * (1 - 2 * dl) };
  }

  // EN 1993-1-3 5.2 geometric limits (Table 5.1 and 5.2(2)) — returns messages; out-of-range = design by testing required
  function limits(p) {
    const t = p.t, out = [];
    const b = Math.max(p.Bt, p.Bb), c = Math.min(p.Ct, p.Cb), h = p.H;
    if (b / t > 60) out.push(`b/t = ${(b / t).toFixed(1)} > 60 (EN 1993-1-3 Table 5.1, lipped flange)`);
    if (Math.max(p.Ct, p.Cb) / t > 50) out.push(`c/t = ${(Math.max(p.Ct, p.Cb) / t).toFixed(1)} > 50 (Table 5.1)`);
    if (h / t > 500) out.push(`h/t = ${(h / t).toFixed(0)} > 500 (Table 5.1)`);
    for (const [C, B, nm] of [[p.Ct, p.Bt, 'top'], [p.Cb, p.Bb, 'bottom']]) {
      if (C > 0 && (C / B < 0.2 || C / B > 0.6)) out.push(`${nm} lip: c/b = ${(C / B).toFixed(2)} outside 0.2…0.6 (EN 1993-1-3 5.2(2))${C / B < 0.2 ? ' – the lip is ignored (flange treated as an outstand)' : ''}`);
    }
    return out;
  }

  return { eps, kInternal, rhoInternal, rhoOutstand, lamP, kLip, chiD, stiffenedFlange, effective, arrangementEff, props, limits };
})();

