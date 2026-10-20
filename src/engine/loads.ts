// @ts-nocheck — ported verbatim from the mockup (index.html, 40_loads.js); logic unchanged so results match the mockup.
import { U } from './util';
// ===== Design route factors, load combinations, layout and load path =====
export const LOADS = (() => {
  const g = 9.80665;
  const kg2kN = q => q * g / 1000; // kg/m² → kN/m²
  // route-specific factors (all values displayed in the report; EN values come from the inputs so a national annex can be applied)
  function route(I) {
    const c = I.code;
    if (c === 'AISI') return {
      code: 'AISI', name: 'AISI S100-16 (LRFD) with AISC 360-16 and ASCE/SEI 7-16 load combinations',
      ulsText: 'ASCE 7-16 2.3.1: max(1.4 D, 1.2 D + 1.6 L)', slsText: 'D + L (service)', gG: 1.2, gQ: 1.6, gGonly: 1.4,
      phi: { b: 0.90, c: 0.85, v: 0.95, wc: null, boltV: 0.75, bear: 0.60, weld: 0.75, yield: 0.90, rupt: 0.75, hssC: 0.90, hssB: 0.90 }, E: 203000
    };
    if (c === 'IS') return {
      code: 'IS', name: 'IS 800:2007 (limit state) with IS 875 loads; cold-formed members: IS 801 (working stress) not implemented',
      ulsText: 'IS 800:2007 Table 4: 1.5 (DL + IL)', slsText: '1.0 (DL + IL)', gG: 1.5, gQ: 1.5,
      gm0: 1.10, gm1: 1.25, gmb: 1.25, gmw: 1.25, E: 200000
    };
    const cmb = I.combo === '610ab' ? '6.10a / 6.10b' : '6.10';
    return { code: 'EN', name: 'EN 1990 / EN 1993-1-1, -1-3, -1-5, -1-8 (' + (I.na || 'recommended values') + ')', ulsText: `EN 1990 eq. ${cmb}: γG = ${I.gG}, γQ = ${I.gQ}, ψ0 = ${I.psi0}`, slsText: 'EN 1990 6.5.3 characteristic: G + Q', gG: +I.gG, gQ: +I.gQ, gM0: +I.gM0, gM1: +I.gM1, gM2: +I.gM2, E: +I.E };
  }
  // ULS factors applied to (G, Q): returns {aG, aQ, text}; for EN 6.10a/b the less favourable is chosen for the given G, Q
  function uls(R, I, G, Q) {
    if (R.code === 'AISI') { const a = 1.4 * G, b = 1.2 * G + 1.6 * Q; return a > b ? { aG: 1.4, aQ: 0, text: '1.4 D' } : { aG: 1.2, aQ: 1.6, text: '1.2 D + 1.6 L' }; }
    if (R.code === 'IS') return { aG: 1.5, aQ: 1.5, text: '1.5 (DL + IL)' };
    if (I.combo === '610ab') {
      const a = R.gG * G + R.gQ * I.psi0 * Q, b = 0.85 * R.gG * G + R.gQ * Q;
      return a >= b ? { aG: R.gG, aQ: R.gQ * I.psi0, text: `6.10a: ${R.gG} G + ${(R.gQ * I.psi0).toFixed(2)} Q` } : { aG: 0.85 * R.gG, aQ: R.gQ, text: `6.10b: ${(0.85 * R.gG).toFixed(3)} G + ${R.gQ} Q` };
    }
    return { aG: R.gG, aQ: R.gQ, text: `6.10: ${R.gG} G + ${R.gQ} Q` };
  }
  // favourable / unfavourable split used for pattern loading (EN: γG,inf = 1.0; AISI 0.9 D only with uplift – here 1.2 kept; IS 1.5)
  const gInf = R => R.code === 'EN' ? 1.0 : R.code === 'AISI' ? 1.2 : 1.5;

  // SB-Int positions along a main-beam span
  function sbPositions(I) {
    const L = +I.Lmb, n = Math.round(+I.nsbi);
    const msg = [];
    let x;
    if (n <= 0) x = [];
    else if (I.sbiVar === 'var') {
      x = String(I.xsbi).split(/[,; ]+/).map(Number).filter(v => isFinite(v) && v > 0);
      if (x.length !== n) msg.push(`Variable spacing: ${x.length} positions entered for ${n} SB-Int`);
      x = x.slice(0, n).sort((a, b) => a - b);
    } else x = U.range(n, i => (i + 1) * +I.Ssbi);
    for (const v of x) if (!(v > 0 && v < L)) msg.push(`SB-Int at x = ${v} mm lies outside the span 0…${L} mm`);
    x = x.filter(v => v > 0 && v < L);
    for (let i = 1; i < x.length; i++) if (x[i] - x[i - 1] < 50) msg.push('Two SB-Int closer than 50 mm');
    return { x, msg };
  }
  // tributary widths: SB-Int i → (x_{i+1} − x_{i−1})/2; SB-End → half the distance to the first / last SB-Int on each side
  function tributary(I, xs) {
    const L = +I.Lmb, pts = [0, ...xs, L];
    const sbi = xs.map((x, i) => (pts[i + 2] - pts[i]) / 2);
    const endA = xs.length ? xs[0] / 2 : L / 2, endB = xs.length ? (L - xs[xs.length - 1]) / 2 : L / 2;
    return { sbi, sbeEdge: Math.max(endA, endB), sbeInt: endA + endB };
  }
  return { g, kg2kN, route, uls, gInf, sbPositions, tributary };
})();

