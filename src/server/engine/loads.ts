// @ts-nocheck — ported verbatim from the mockup (index.html, 40_loads.js); logic unchanged so results match the mockup.
import "server-only";
import { U } from '@/shared/util';
// ===== Design factors (IS 800:2007), load combinations, layout and load path =====
export const LOADS: any = (() => {
  const g = 9.80665;
  const kg2kN = q => q * g / 1000; // kg/m² → kN/m²
  // IS 800:2007 is the only design standard. Factors displayed in the report; E from IS 800 2.2.4.1 (provisional in the code register: page image of 2.2.4.1 and Table 4 not re-checked).
  function route(I) {
    return {
      code: 'IS', name: 'IS 800:2007 (limit state method) with IS 875 loads; cold-formed members need IS 801, which is not implemented',
      ulsText: 'IS 800:2007 Table 4: 1.5 (DL + IL)', slsText: '1.0 (DL + IL)', gG: 1.5, gQ: 1.5,
      gm0: 1.10, gm1: 1.25, gmb: 1.25, gmw: 1.25, E: 200000
    };
  }
  // ULS factors applied to (G, Q)
  function uls(R, I, G, Q) { return { aG: 1.5, aQ: 1.5, text: '1.5 (DL + IL)' }; }

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
  return { g, kg2kN, route, uls, sbPositions, tributary };
})();

