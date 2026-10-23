// @ts-nocheck — ported from the mockup (index.html, 70_column.js); the design standard is IS 800:2007 only.
import "server-only";
import { U } from '@/shared/util';
import { CHK } from '@/shared/check';
import { MEM } from './member';
import { RES } from './resist';
import { designHollowMember } from '../frame/design/member';
// ===== Box column (welded box / RHS), base plate, anchors and supporting slab =====
export const COL: any = (() => {
  const s = CHK.s, kN = x => x / 1e3, kNm = x => x / 1e6;
  // rounded-rectangle area properties by polygon integration (outer minus inner)
  function rrect(b, h, r, n = 8) {
    const P = [], cs = [[b / 2 - r, h / 2 - r, 0], [-b / 2 + r, h / 2 - r, 90], [-b / 2 + r, -h / 2 + r, 180], [b / 2 - r, -h / 2 + r, 270]];
    for (const [cx, cy, a0] of cs) for (let k = 0; k <= n; k++) { const a = (a0 + 90 * k / n) * Math.PI / 180; P.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    let A = 0, Ix = 0, Iy = 0;
    for (let i = 0; i < P.length; i++) { const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length], c = x1 * y2 - x2 * y1; A += c / 2; Ix += c * (y1 * y1 + y1 * y2 + y2 * y2) / 12; Iy += c * (x1 * x1 + x1 * x2 + x2 * x2) / 12; }
    return { A, Ix, Iy };
  }
  function props(I) {
    const b = +I.col_b, h = +I.col_h, tb = +I.col_tb, th = +I.col_th, type = I.col_type;
    let A, Iy, Iz, Wply, Wplz, Am, per, tmin = Math.min(tb, th), cF, cW;
    if (type === 'weld') {
      // b-faces are full-width plates (thickness tb); h-faces fit between them (thickness th)
      A = 2 * b * tb + 2 * (h - 2 * tb) * th;
      Iy = b * h ** 3 / 12 - (b - 2 * th) * (h - 2 * tb) ** 3 / 12; Iz = h * b ** 3 / 12 - (h - 2 * tb) * (b - 2 * th) ** 3 / 12;
      Wply = b * h * h / 4 - (b - 2 * th) * (h - 2 * tb) ** 2 / 4; Wplz = h * b * b / 4 - (h - 2 * tb) * (b - 2 * th) ** 2 / 4;
      const aw = I.col_cw === 'cjp' ? 0 : +I.col_aw * Math.SQRT2;
      cF = b - 2 * th - 2 * aw; cW = h - 2 * tb - 2 * aw;
    } else {
      const t = tb, ro = I.col_ro > 0 ? +I.col_ro : 2 * t, ri = Math.max(0, ro - t);
      const o = rrect(b, h, ro), i = rrect(b - 2 * t, h - 2 * t, ri);
      A = o.A - i.A; Iy = o.Ix - i.Ix; Iz = o.Iy - i.Iy;
      Wply = b * h * h / 4 - (b - 2 * t) * (h - 2 * t) ** 2 / 4; Wplz = h * b * b / 4 - (h - 2 * t) * (b - 2 * t) ** 2 / 4; // sharp-corner approximation
      cF = b - 3 * t; cW = h - 3 * t; tmin = t;
    }
    Am = (b - th) * (h - tb); per = 2 * (b - th) / tb + 2 * (h - tb) / th;
    const It = 4 * Am * Am / per;
    return { b, h, tb, th, A, Iy, Iz, Wely: Iy / (h / 2), Welz: Iz / (b / 2), Wply, Wplz, iy: Math.sqrt(Iy / A), iz: Math.sqrt(Iz / A), It, Am, tmin, cF, cW, mass: A * 7850e-6 };
  }

  // The IS 800:2007 design of a rectangular hollow section column is the VERIFIED hollow-section design of the frame module (src/server/frame/design/member.ts):
  // classification (Table 2), compression (7.1.2, Tables 7 and 10), shear (8.4.1), bending (8.2.1.2) and the section / member interaction (9.3.1, 9.3.2).
  // Everything IS 800 leaves to the engineer is an input: the effective lengths of 7.2 (Table 11 / Annex D is not verified in the register) come from the user (or a
  // pinned, braced column, k = 1.0 on the storey height); no value is assumed otherwise. A welded box with different wall thicknesses is outside the verified scope.
  function design(x) {
    const { R, I } = x, P = RES.provider(R), checks = [], add = c => { checks.push(c); return c; }, grp = 'Box column';
    const c = props(I), fy = +I.col_fy, fu = +I.col_fu, E = R.E;
    const N = x.N, My = Math.abs(x.My), Mz = Math.abs(x.Mz), V = Math.abs(x.V), T = Math.abs(x.T), hc = +I.hc;
    const frame = I.col_frame;
    const geomNote = `Section ${c.b} × ${c.h} × ${c.tb}/${c.th} mm (${I.col_type === 'weld' ? 'welded box' : I.col_type === 'rhsH' ? 'hot-finished RHS' : 'cold-formed RHS'}).`;
    const out = { checks, props: c, cls: '-', curve: '-', Lcy: NaN, Lcz: NaN, Aeff: c.A, NbY: NaN, NbZ: NaN };
    const pend = (name, clause, why, Ed, unit, fmt) => add(CHK.pending({ grp, name, clause, Ed, unit, fmt, note: geomNote }, why));
    // ---- effective lengths (IS 800 7.2): required input, none is assumed
    let ky, kz, kNote = '';
    if (frame === 'user') { ky = +I.col_ky; kz = +I.col_kz; kNote = 'user-defined effective-length factors'; }
    else if (frame === 'braced' && I.col_base === 'pin') { ky = 1.0; kz = 1.0; kNote = 'pinned base, braced frame: k = 1.0 on the column height (assumption; IS 800 Table 11 / Annex D are not verified in the register)'; }
    else { ky = NaN; kz = NaN; }
    const Lz = (+I.col_zr > 0 && frame !== 'knee') ? Math.max(+I.col_zr, hc - +I.col_zr) : hc;
    if (!(ky > 0) || !(kz > 0)) {
      pend('Column design', 'IS 800:2007 7.2', 'The effective lengths of this frame configuration (sway frame with knee braces or a fixed base) must be entered as user-defined k factors (IS 800 7.2, Table 11 and Annex D are not verified): no value is assumed.', N, 'kN', kN);
      out.overall = CHK.overall(checks); return out;
    }
    out.Lcy = ky * hc; out.Lcz = kz * Lz;
    const hollow = I.col_type === 'rhsH' || I.col_type === 'rhsC';
    if (!hollow) {
      pend('Welded box column design', 'IS 800:2007 3.7, 7.1.2, 9.3', 'The verified IS 800 hollow-section design covers rolled / cold-formed rectangular hollow sections; a welded box column is not implemented (the manufacture class of Table 10 and the welded corners are not verified).', N, 'kN', kN);
      if (I.col_type === 'weld') add(CHK.pending({ grp, name: 'Corner welds', clause: 'IS 800:2007 10.5', note: geomNote }, 'Section 10 (connections, welds) is not verified in the code register.'));
      out.overall = CHK.overall(checks); return out;
    }
    const geom = { b: c.b, h: c.h, t: c.tb, rOuter: I.col_ro > 0 ? +I.col_ro : 2 * c.tb, rInner: Math.max(0, (I.col_ro > 0 ? +I.col_ro : 2 * c.tb) - c.tb) };
    // moments: top of the column as given; the base end moment of a pinned base is zero; Table 18 C_m = 0.9 only for a sway buckling mode (knee-braced frame)
    const sway = frame === 'knee';
    const base = I.col_base === 'fix' ? -0.5 : 0;
    const top = { x: 0, N: -N, Vy: 0, Vz: V, T, My, Mz }, bot = { x: hc, N: -N, Vy: 0, Vz: V, T, My: base * My, Mz: base * Mz };
    const res = designHollowMember({ memberId: 0, combination: 'ULS', geom, material: { fy, fu, E }, manufacture: I.col_type === 'rhsH' ? 'hollow-hot-rolled' : 'hollow-cold-formed', length: hc, KLy: out.Lcy, KLz: out.Lcz, stations: [top, bot], cm: sway ? 'sway' : 'table' });
    const conv = ch => {
      const u = ch.unit === 'N' ? ['kN', kN] : ch.unit === 'N·mm' ? ['kNm', kNm] : [ch.unit, x => x];
      const o = { grp, name: ch.name, clause: ch.clause, steps: Object.entries(ch.detail || {}).map(([k, v]) => s(k, '', v)), note: [geomNote, ...(ch.notes || [])].join(' ') };
      if (ch.status === 'pending') return CHK.pending(o, (ch.notes || []).join(' '));
      return CHK.mk(Object.assign(o, ch.Ed !== null && ch.Rd !== null ? { Ed: ch.Ed, Rd: ch.Rd, unit: u[0], fmt: u[1] } : { eta: ch.ratio }));
    };
    for (const ch of res.checks) add(conv(ch));
    for (const nt of res.notes) if (/class|provisional|assumption/.test(nt)) out.note = (out.note ? out.note + ' ' : '') + nt;
    if (kNote) add(CHK.mk({ grp, name: 'Effective lengths (IS 800 7.2)', clause: '', review: true, note: kNote + `: KL_y = ${U.fmt(out.Lcy, 0)} mm, KL_z = ${U.fmt(out.Lcz, 0)} mm.` }));
    if (I.col_base === 'fix') add(CHK.mk({ grp, name: 'Base end moment', clause: '', review: true, note: 'Fixed base: the end-moment ratio ψ = −0.5 for Table 18 (row A) is an assumption of this tool; use the frame analysis for the real value.' }));
    if (I.col_type === 'weld') add(CHK.pending({ grp, name: 'Corner welds', clause: 'IS 800:2007 10.5', note: geomNote }, 'Section 10 (welds) is not verified in the code register.'));
    else add(CHK.na({ grp, name: 'Corner welds', clause: '' }, 'Seamless / seam-welded hollow section.'));
    if (I.col_spl === 'yes') add(CHK.pending({ grp, name: 'Column splice', clause: 'IS 800:2007 10', note: 'Splice design is not implemented: design the splice for N, M and the notional moment.' }, 'Section 10 (connections) is not verified in the code register.'));
    else add(CHK.na({ grp, name: 'Column splice', clause: '' }, 'No splice.'));
    out.overall = CHK.overall(checks);
    return out;
  }

  // base plate, anchors, slab
  function base(x) {
    const { R, I, N, V, M, col } = x, checks = [], add = c => { checks.push(c); return c; }, grp = 'Base plate & foundation';
    const a = +I.bp_a, b = +I.bp_b, tp = +I.bp_t, fyp = +I.bp_fy, fck = +I.fck, cb = col.b, ch = col.h, tw = Math.min(col.tb, col.th);
    if (a < ch || b < cb) add(CHK.mk({ grp, name: 'Base plate size', clause: '', eta: Infinity, note: 'The base plate is smaller than the column.' }));
    const P = RES.provider(R);
      const w = N / (a * b), fb = 0.6 * fck, ex = Math.max((a - ch) / 2, (b - cb) / 2), treq = Math.sqrt(2.5 * w * (ex * ex - 0.3 * Math.min((a - ch) / 2, (b - cb) / 2) ** 2) * 1.10 / fyp);
      add(CHK.mk({ grp, name: 'Concrete bearing', clause: 'IS 800:2007 7.4.1 (0.6 f_ck)', Ed: w, Rd: fb, unit: 'N/mm²', fmt: x => x }));
      add(CHK.mk({ grp, name: 'Base plate thickness', clause: 'IS 800:2007 7.4.3.1 (slab base, t_s = √(2.5 w (a² − 0.3 b²) γ_m0 / f_y))', Ed: treq, Rd: tp, unit: 'mm', fmt: x => x, basis: 'code',
        // IS 800 Table 1 (IS 2062): the minimum yield stress falls for t ≥ 20 mm; the value entered is used as it is, not reduced
        ...(tp >= 20 ? { note: 'Plate thickness ' + U.fmt(tp, 0) + ' mm ≥ 20 mm: the f_y entered (' + U.fmt(fyp, 0) + ' N/mm²) must be the value for this thickness band (IS 800:2007 Table 1, IS 2062 E 250: 240 for 20-40 mm, 230 above 40 mm); it is not reduced automatically.' } : {}) }));
    if (Math.abs(M) > 1) add(CHK.mk({ grp, name: 'Base plate with moment (fixed base)', clause: 'IS 800:2007 7.4 (not implemented)', review: true, note: 'Design the fixed base for N and M separately.' }));
    // shear at the base and anchors in concrete: the provisions (friction, anchor shear and tension, anchorage in concrete) are not verified in the code register
    const Ff = 0.2 * N;
    add(CHK.pending({ grp, name: 'Shear at the base: friction + anchors', clause: 'IS 800:2007 10.3, 7.4', Ed: V, unit: 'kN', fmt: kN, note: 'Shear at the base ' + U.fmt(V / 1e3, 2) + ' kN.' }, 'Section 10 (anchor bolts) and 7.4 (column bases) are not verified in the code register.'));
    add(CHK.pending({ grp, name: 'Anchors in concrete (pull-out, cone, pry-out, edge)', clause: 'IS 456 (not supplied)', Ed: V, unit: 'kN', fmt: kN, note: V > Ff || Math.abs(M) > 1 ? 'The anchors carry load: verify the anchorage in concrete with the anchor manufacturer data.' : 'No uplift or moment: anchors are nominal, but the friction resistance is not verified.' }, 'The concrete design standard is not supplied.'));
    // slab punching
    const d = +I.slab_d, rho = +I.slab_rho;
    if (d > 0) {
        const u = 2 * (a + d) + 2 * (b + d), ks = Math.min(1, 0.5 + Math.min(a, b) / Math.max(a, b)), tc = ks * 0.25 * Math.sqrt(fck), VRd = tc * u * d;
        add(CHK.mk({ grp, name: 'Slab punching shear', clause: 'IS 456:2000 31.6 (perimeter at d/2)', Ed: N, Rd: VRd, unit: 'kN', fmt: kN, basis: 'code', note: 'Suspended-slab formula; for a ground-bearing slab use a slab-on-grade method (e.g. TR34).' }));
    }
    return { checks, overall: CHK.overall(checks) };
  }
  return { design, base, props, rrect };
})();

