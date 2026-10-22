// @ts-nocheck — ported verbatim from the mockup (index.html, 55_resist.js); logic unchanged so results match the mockup.
import "server-only";
import { CHK } from '@/shared/check';
import { MEM } from './member';
import * as RD from '../frame/design/restraint';
// ===== Fastener / weld / plate resistances, IS 800:2007 =====
// Each function returns { Rd (N or N/mm), clause, steps }. A check that cites a provision that is not verified in the code register (src/shared/codeRegister.ts)
// is reported as REVIEW by CHK.mk, whatever its value: formulas below are indicative until their clauses are verified.
export const RES: any = (() => {
  const s = CHK.s;
  const As = d => MEM.boltAs(d), Ab = d => Math.PI * d * d / 4;
  const fub = g => MEM.boltFu(g);
  function provider(R) { return isr(R); }
  function isr(R) {
    const g0 = 1.10, g1 = 1.25, gb = 1.25, gw = 1.25;
    return {
      code: 'IS',
      // 10.3.3 with the long-joint (10.3.3.1, lj = distance between the first and last bolt in the load direction) and large-grip (10.3.3.2, lg) reductions
      boltShear(d, gr, planes, thread, lj = 0, lg = 0) {
        const A = thread ? As(d) : Ab(d), v = RD.boltShearCapacity({ d, fub: fub(gr), fyb: MEM.boltFy(gr), An: As(d), Asb: Ab(d) }, { nn: thread ? planes : 0, ns: thread ? 0 : planes, lj, lg });
        return { Rd: v.valid ? v.Vdsb : NaN, clause: 'IS 800:2007 10.3.3' + (v.betaLj < 1 ? ', 10.3.3.1' : '') + (v.betaLg < 1 ? ', 10.3.3.2' : ''), steps: [s('V_dsb', 'f_ub/(√3 γ_mb) (n_n A_nb + n_s A_sb) β_lj β_lg', v.Vdsb / 1e3, 'kN'), ...(v.betaLj < 1 || v.betaLg < 1 ? [s('β_lj, β_lg', '', `${v.betaLj.toFixed(3)}, ${v.betaLg.toFixed(3)}`)] : [])], note: v.notes.join(' '), basis: v.valid ? 'code' : 'none' };
      },
      boltTension(d, gr) { const v = RD.boltTensionCapacity({ d, fub: fub(gr), fyb: MEM.boltFy(gr), An: As(d), Asb: Ab(d) }); return { Rd: v.Tdb, clause: 'IS 800:2007 10.3.5', steps: [s('T_db', 'min(0.9 f_ub A_n; f_yb A_sb γ_mb/γ_m0)/γ_mb', v.Tdb / 1e3, 'kN')] }; },
      bearingPlate(d, d0, t, fu, gr, e1, e2, p1, p2, hole) { const kb = Math.min(e1 / (3 * d0), p1 > 0 ? p1 / (3 * d0) - 0.25 : Infinity, fub(gr) / fu, 1), Rd = (hole === 'oversize' || hole === 'slotV' ? 0.7 : 1) * 2.5 * kb * d * t * fu / gb; return { Rd, clause: 'IS 800:2007 10.3.4', steps: [s('k_b', 'min(e/3d_0; p/3d_0 − 0.25; f_ub/f_u; 1)', kb), s('V_dpb', '2.5 k_b d t f_u / γ_mb', Rd / 1e3, 'kN')] }; },
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
  return { provider };
})();

