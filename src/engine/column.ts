// @ts-nocheck — ported verbatim from the mockup (index.html, 70_column.js); logic unchanged so results match the mockup.
import { U } from './util';
import { CHK } from './check';
import { MEM } from './member';
import { RES } from './resist';
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

  function design(x) {
    const { R, I } = x, P = RES.provider(R), checks = [], add = c => { checks.push(c); return c; }, grp = 'Box column';
    const c = props(I), fy = +I.col_fy, fu = +I.col_fu, E = R.code === 'IS' ? 200000 : R.code === 'AISI' ? 200000 : +I.E;
    const N = x.N, My = Math.abs(x.My), Mz = Math.abs(x.Mz), V = Math.abs(x.V), T = Math.abs(x.T), hc = +I.hc;
    const eps = Math.sqrt(235 / fy);
    // classification (EN 1993-1-1 Table 5.2, internal parts)
    const rF = c.cF / c.tb, rW = c.cW / c.th;
    const clsC = r => r <= 33 * eps ? 1 : r <= 38 * eps ? 2 : r <= 42 * eps ? 3 : 4;
    const clsB = r => r <= 72 * eps ? 1 : r <= 83 * eps ? 2 : r <= 124 * eps ? 3 : 4;
    const clsN = Math.max(clsC(rF), clsC(rW)), clsM = Math.max(clsC(rF), clsB(rW));
    const cls = N > 0 ? clsN : clsM;
    // effective area for class 4 (EN 1993-1-5 4.4, ψ = 1)
    const red = (cc, t) => { const lp = (cc / t) / (28.4 * eps * 2), rho = lp <= 0.673 ? 1 : Math.min(1, (lp - 0.22) / (lp * lp)); return (1 - rho) * cc * t; };
    const Aeff = cls === 4 ? c.A - 2 * red(c.cF, c.tb) - 2 * red(c.cW, c.th) : c.A;
    const Wy = cls <= 2 ? c.Wply : cls === 3 ? c.Wely : c.Wely * Aeff / c.A, Wz = cls <= 2 ? c.Wplz : cls === 3 ? c.Welz : c.Welz * Aeff / c.A;
    // effective lengths
    const frame = I.col_frame;
    let ky = frame === 'user' ? +I.col_ky : frame === 'knee' ? 2.0 : (I.col_base === 'fix' ? 0.7 : 1.0), kz = frame === 'user' ? +I.col_kz : ky;
    const ga = x.ga || null; // global analysis (unified app): k from α_cr (1st order) or system length k = 1 (2nd order)
    if (ga) { ky = ga.ky; kz = ga.kz; }
    const Lz = (+I.col_zr > 0 && frame !== 'knee') ? Math.max(+I.col_zr, hc - +I.col_zr) : hc;
    const Lcy = ky * hc, Lcz = kz * Lz;
    const Ncy = Math.PI ** 2 * E * c.Iy / Lcy ** 2, Ncz = Math.PI ** 2 * E * c.Iz / Lcz ** 2;
    const thick = I.col_type === 'weld' && I.col_cw !== 'cjp' && +I.col_aw > 0.5 * c.tmin && c.b / c.tb < 30 && c.h / c.th < 30;
    const curve = I.col_type === 'rhsH' ? 'a' : I.col_type === 'rhsC' ? 'c' : thick ? 'c' : 'b';
    const alpha = MEM.curveAlpha[curve];
    const info = { steps: [], inputs: [] };
    const geomNote = `Section ${c.b} × ${c.h} × ${c.tb}/${c.th} mm (${I.col_type === 'weld' ? 'welded box' : I.col_type === 'rhsH' ? 'hot-finished RHS' : 'cold-formed RHS'}), class ${cls}, buckling curve ${curve}.`;
    if (R.code === 'AISI') return aisc(x, c, fy, fu, E, N, My, Mz, V, T, Lcy, Lcz, add, checks, grp, P);
    const g0 = R.code === 'IS' ? 1.10 : R.gM0, g1 = R.code === 'IS' ? 1.10 : R.gM1; // IS 800 7.1.2.1 uses γm0 in f_cd
    const isIS = R.code === 'IS', cl = (en, is) => isIS ? is : en;
    add(CHK.mk({ grp, name: 'Section classification (wall slenderness)', clause: cl('EN 1993-1-1 Table 5.2 (internal parts)', 'IS 800:2007 Table 2 (limits taken as EN 1993-1-1 Table 5.2 – verify)'), eta: 0, basis: isIS ? 'approx' : 'code',
      steps: [s('c/t (b-faces)', '', rF), s('c/t (h-faces)', '', rW), s('ε', '√(235/f_y)', eps), s('class', cls === 4 ? 'slender: effective area used (EN 1993-1-5 4.4)' : '', cls)], note: geomNote }));
    const NRd = Aeff * fy / g0;
    add(CHK.mk({ grp, name: 'Axial compression resistance of the cross-section', clause: cl('EN 1993-1-1 6.2.4', 'IS 800:2007 7.1.2'), Ed: N, Rd: NRd, unit: 'kN', fmt: kN, steps: [s('A', '', c.A, 'mm²'), s('A_eff', '', Aeff, 'mm²'), s('N_c,Rd', 'A_eff f_y / γM0', kN(NRd), 'kN')] }));
    const MyRd = Wy * fy / g0, MzRd = Wz * fy / g0;
    add(CHK.mk({ grp, name: 'Bending about y (main-beam reactions eccentric, knee brace)', clause: cl('EN 1993-1-1 6.2.5', 'IS 800:2007 8.2.1.2'), Ed: My, Rd: MyRd, unit: 'kNm', fmt: kNm, steps: [s('W_y', cls <= 2 ? 'W_pl' : 'W_el', Wy / 1e3, 'cm³')] }));
    add(CHK.mk({ grp, name: 'Bending about z (SB-End reactions eccentric)', clause: cl('EN 1993-1-1 6.2.5', 'IS 800:2007 8.2.1.2'), Ed: Mz, Rd: MzRd, unit: 'kNm', fmt: kNm, steps: [s('W_z', cls <= 2 ? 'W_pl' : 'W_el', Wz / 1e3, 'cm³')] }));
    const Av = I.col_type === 'weld' ? 2 * (c.h - 2 * c.tb) * c.th : c.A * c.h / (c.b + c.h);
    const tauT = T / (2 * c.Am * c.tmin), tRd = fy / (Math.sqrt(3) * g0);
    const Vpl = Av * fy / (Math.sqrt(3) * g0), VplT = Math.max(0, 1 - tauT / tRd) * Vpl;
    add(CHK.mk({ grp, name: 'Shear (with torsion)', clause: cl('EN 1993-1-1 6.2.6 and 6.2.7(9) eq. 6.28', 'IS 800:2007 8.4'), Ed: V, Rd: VplT, unit: 'kN', fmt: kN, steps: [s('A_v', '', Av, 'mm²'), s('τ_t,Ed', 'T/(2 A_m t)', tauT, 'N/mm²'), s('V_pl,T,Rd', '[1 − τ_t/(f_y/(√3γM0))] V_pl,Rd', kN(VplT), 'kN')] }));
    if (T > 0) add(CHK.mk({ grp, name: 'Torsion (closed section, St Venant)', clause: cl('EN 1993-1-1 6.2.7', 'IS 800:2007 (verify)'), Ed: tauT, Rd: tRd, unit: 'N/mm²', fmt: x => x }));
    // cross-section interaction
    const n = N / NRd;
    let csEta;
    if (cls <= 2 && !isIS) {
      const aw = Math.min(0.5, (c.A - 2 * c.b * c.tb) / c.A), af = Math.min(0.5, (c.A - 2 * c.h * c.th) / c.A);
      const MNy = Math.min(c.Wply * fy / g0, c.Wply * fy / g0 * (1 - n) / (1 - 0.5 * aw)), MNz = Math.min(c.Wplz * fy / g0, c.Wplz * fy / g0 * (1 - n) / (1 - 0.5 * af));
      const a = Math.min(6, 1.66 / (1 - 1.13 * n * n));
      csEta = n >= 1 ? n : Math.pow(My / MNy, a) + Math.pow(Mz / MNz, a);
      add(CHK.mk({ grp, name: 'Cross-section: axial force and biaxial bending', clause: 'EN 1993-1-1 6.2.9.1 (eq. 6.39, 6.40, 6.41 hollow sections)', eta: csEta, steps: [s('n', 'N/N_pl,Rd', n), s('M_N,y,Rd', '', kNm(MNy), 'kNm'), s('M_N,z,Rd', '', kNm(MNz), 'kNm'), s('α = β', '1.66/(1 − 1.13 n²) ≤ 6', a)] }));
    } else {
      csEta = n + My / MyRd + Mz / MzRd;
      add(CHK.mk({ grp, name: 'Cross-section: axial force and biaxial bending (linear)', clause: cl('EN 1993-1-1 6.2.9.2 / 6.2.9.3 (eq. 6.42/6.44)', 'IS 800:2007 9.3.1.3'), eta: csEta, steps: [s('N/N_Rd + M_y/M_y,Rd + M_z/M_z,Rd', '', csEta)] }));
    }
    // member buckling
    const lam = Ncr => Math.sqrt(Aeff * fy / Ncr), ly = lam(Ncy), lz = lam(Ncz);
    const chiY = ga && ga.csY ? 1 : MEM.chi(ly, alpha), chiZ = ga && ga.csZ ? 1 : MEM.chi(lz, alpha), NbY = chiY * Aeff * fy / g1, NbZ = chiZ * Aeff * fy / g1;
    add(CHK.mk({ grp, name: 'Flexural buckling about both axes', clause: cl(`EN 1993-1-1 6.3.1 (curve ${curve}, Table 6.2)`, `IS 800:2007 7.1.2.1 (buckling class ${curve === 'a' ? 'a' : curve === 'c' ? 'c' : 'b'}, Table 10)`), Ed: N, Rd: Math.min(NbY, NbZ), unit: 'kN', fmt: kN,
      steps: [s('L_cr,y / L_cr,z', `k_y = ${U.fmt(ky, 3)}, k_z = ${U.fmt(kz, 3)}${ga ? ' (' + ga.note + ')' : frame === 'knee' ? ' (sway frame with knee braces: k = 2.0, documented approximation)' : ''}`, `${U.fmt(Lcy, 0)} / ${U.fmt(Lcz, 0)}`, 'mm'), s('λ̄_y / λ̄_z', '', `${U.fmt(ly, 3)} / ${U.fmt(lz, 3)}`), s('χ_y / χ_z', `α = ${alpha}`, `${U.fmt(chiY, 3)} / ${U.fmt(chiZ, 3)}`), s('N_b,Rd', 'min χ A f_y / γM1', kN(Math.min(NbY, NbZ)), 'kN')], basis: frame === 'knee' ? 'approx' : 'code' }));
    // interaction (Annex B, method 2; hollow sections χ_LT = 1)
    const Cm = ga && ga.Cm ? ga.Cm : frame === 'knee' ? 0.9 : I.col_base === 'fix' ? 0.4 : 0.6;
    const ny = N / NbY, nz = N / NbZ;
    let kyy, kzz, kyz, kzy;
    if (isIS) { kyy = Math.min(1 + (ly - 0.2) * ny, 1 + 0.8 * ny); kzz = Math.min(1 + (lz - 0.2) * nz, 1 + 0.8 * nz); kyz = kzz; kzy = 0.6 * kyy; }
    else if (cls <= 2) { kyy = Cm * Math.min(1 + Math.max(0, ly - 0.2) * ny, 1 + 0.8 * ny); kzz = Cm * Math.min(1 + Math.max(0, lz - 0.2) * nz, 1 + 0.8 * nz); kyz = 0.6 * kzz; kzy = 0.6 * kyy; }
    else { kyy = Cm * Math.min(1 + 0.6 * ly * ny, 1 + 0.6 * ny); kzz = Cm * Math.min(1 + 0.6 * lz * nz, 1 + 0.6 * nz); kyz = kzz; kzy = 0.8 * kyy; }
    const MyRk = Wy * fy / g1, MzRk = Wz * fy / g1;
    const e61 = isIS ? N / NbY + kyy * Cm * My / MyRk + kyz * Cm * Mz / MzRk : N / NbY + kyy * My / MyRk + kyz * Mz / MzRk;
    const e62 = isIS ? N / NbZ + kzy * Cm * My / MyRk + kzz * Cm * Mz / MzRk : N / NbZ + kzy * My / MyRk + kzz * Mz / MzRk;
    add(CHK.mk({ grp, name: 'Member: compression + biaxial bending', clause: cl('EN 1993-1-1 6.3.3 eq. 6.61 / 6.62 with Annex B (method 2), χ_LT = 1 for closed sections', 'IS 800:2007 9.3.2.2 (verify)'), eta: Math.max(e61, e62),
      steps: [s('C_m', ga && ga.Cm ? ga.CmTxt : frame === 'knee' ? 'sway mode 0.9' : I.col_base === 'fix' ? '0.6 + 0.4ψ, ψ = −0.5' : '0.6 + 0.4ψ, ψ = 0', Cm), s('k_yy / k_zz', '', `${U.fmt(kyy, 3)} / ${U.fmt(kzz, 3)}`), s('k_yz / k_zy', '', `${U.fmt(kyz, 3)} / ${U.fmt(kzy, 3)}`), s('eq. 6.61', '', e61), s('eq. 6.62', '', e62)], why: 'Column buckling with the bending from eccentric beam reactions and knee braces.', fix: 'Larger or thicker box, braced frame (shorter L_cr), or reduce the eccentricity.' }));
    // corner welds
    if (I.col_type === 'weld') {
      if (I.col_cw === 'cjp') add(CHK.mk({ grp, name: 'Corner welds (full penetration)', clause: 'EN 1993-1-8 4.7.1 (full-strength butt weld)', eta: 0, note: 'Full-penetration welds develop the plate: composite box action credited.' }));
      else {
        const Sfl = c.b * c.tb * (c.h - c.tb) / 2, q = V * Sfl / c.Iy / 2 + T / (2 * c.Am) * 1; // per corner weld: shear flow from V (2 welds per face) + torsion
        const wr = P.weldPerLength(+I.col_aw, fu);
        add(CHK.mk({ grp, name: 'Corner welds: longitudinal shear flow (V S/I + T/(2A_m))', clause: wr.clause, Ed: q, Rd: wr.Rd, unit: 'N/mm', fmt: x => x, steps: [s('S', 'first moment of one b-face plate', Sfl, 'mm³'), s('q', 'V S/(2 I) + T/(2 A_m)', q, 'N/mm'), ...wr.steps], note: 'Continuous corner welds assumed. Composite box action is credited only when this check passes.', why: 'The corner welds hold the four plates together as one box.', fix: 'Larger corner weld throat or full-penetration welds.' }));
      }
    } else add(CHK.na({ grp, name: 'Corner welds', clause: '' }, 'Seamless / seam-welded hollow section.'));
    if (I.col_spl === 'yes') add(CHK.mk({ grp, name: 'Column splice', clause: 'EN 1993-1-8 6.2.7 / EN 1993-1-1 6.3.3', review: true, note: 'Splice design is not implemented: design the splice for N, M and the notional moment.' }));
    else add(CHK.na({ grp, name: 'Column splice', clause: '' }, 'No splice.'));
    return { checks, props: c, cls, curve, Lcy, Lcz, Aeff, NbY, NbZ, overall: CHK.overall(checks) };
  }
  function aisc(x, c, fy, fu, E, N, My, Mz, V, T, Lcy, Lcz, add, checks, grp, P) {
    const lamW = Math.max(c.cF / c.tb, c.cW / c.th), lr = 1.40 * Math.sqrt(E / fy), lp = 1.12 * Math.sqrt(E / fy), lr2 = 1.40 * Math.sqrt(E / fy);
    add(CHK.mk({ grp, name: 'Wall slenderness', clause: 'AISC 360-16 Table B4.1a/b (case 6 / 17)', eta: lamW / lr, steps: [s('b/t', '', lamW), s('λ_r (compression)', '1.40√(E/F_y)', lr)], review: lamW > lr, note: lamW > lr ? 'Slender walls: AISC E7 effective width not implemented.' : '' }));
    const KLr = Math.max(Lcy / c.iy, Lcz / c.iz), Fe = Math.PI ** 2 * E / KLr ** 2, Fcr = fy / Fe <= 2.25 ? Math.pow(0.658, fy / Fe) * fy : 0.877 * Fe, Pc = 0.9 * Fcr * c.A;
    add(CHK.mk({ grp, name: 'Compression (flexural buckling)', clause: 'AISC 360-16 E3', Ed: N, Rd: Pc, unit: 'kN', fmt: kN, steps: [s('KL/r', '', KLr), s('F_e', '', Fe, 'N/mm²'), s('F_cr', '', Fcr, 'N/mm²')] }));
    const Mp = (W, Sx, bt) => bt <= lp ? fy * W : bt <= lr2 ? Math.min(fy * W, fy * W - (fy * W - fy * Sx) * (3.57 * bt * Math.sqrt(fy / E) - 4.0)) : NaN;
    const Mcy = 0.9 * Mp(c.Wply, c.Wely, c.cF / c.tb), Mcz = 0.9 * Mp(c.Wplz, c.Welz, c.cW / c.th);
    const Pe = Math.PI ** 2 * E * Math.min(c.Iy / Lcy ** 2, c.Iz / Lcz ** 2), B1 = Math.max(1, 0.6 / (1 - N / Pe));
    add(CHK.mk({ grp, name: 'Flexure (HSS)', clause: 'AISC 360-16 F7', Ed: My * B1, Rd: Mcy, unit: 'kNm', fmt: kNm }));
    const r = N / Pc, h1 = r >= 0.2 ? r + 8 / 9 * (B1 * My / Mcy + B1 * Mz / Mcz) : r / 2 + (B1 * My / Mcy + B1 * Mz / Mcz);
    add(CHK.mk({ grp, name: 'Combined compression and flexure', clause: 'AISC 360-16 H1.1 with B1 (App. 8, C_m = 0.6)', eta: h1, basis: 'code', steps: [s('B_1', 'C_m/(1 − P/P_e1)', B1)] }));
    const Aw = 2 * (c.h - 3 * c.th) * c.th, Vn = 0.9 * 0.6 * fy * Aw;
    add(CHK.mk({ grp, name: 'Shear', clause: 'AISC 360-16 G4', Ed: V, Rd: Vn, unit: 'kN', fmt: kN }));
    return { checks, props: c, cls: '-', curve: '-', Lcy, Lcz, Aeff: c.A, overall: CHK.overall(checks) };
  }

  // base plate, anchors, slab
  function base(x) {
    const { R, I, N, V, M, col } = x, checks = [], add = c => { checks.push(c); return c; }, grp = 'Base plate & foundation';
    const a = +I.bp_a, b = +I.bp_b, tp = +I.bp_t, fyp = +I.bp_fy, fck = +I.fck, cb = col.b, ch = col.h, tw = Math.min(col.tb, col.th);
    if (a < ch || b < cb) add(CHK.mk({ grp, name: 'Base plate size', clause: '', eta: Infinity, note: 'The base plate is smaller than the column.' }));
    const P = RES.provider(R);
    if (R.code === 'IS') {
      const w = N / (a * b), fb = 0.6 * fck, ex = Math.max((a - ch) / 2, (b - cb) / 2), treq = Math.sqrt(2.5 * w * (ex * ex - 0.3 * Math.min((a - ch) / 2, (b - cb) / 2) ** 2) * 1.10 / fyp);
      add(CHK.mk({ grp, name: 'Concrete bearing', clause: 'IS 800:2007 7.4.1 (0.6 f_ck)', Ed: w, Rd: fb, unit: 'N/mm²', fmt: x => x }));
      add(CHK.mk({ grp, name: 'Base plate thickness', clause: 'IS 800:2007 7.4.3.1 (slab base, t_s = √(2.5 w (a² − 0.3 b²) γ_m0 / f_y))', Ed: treq, Rd: tp, unit: 'mm', fmt: x => x, basis: 'code' }));
    } else if (R.code === 'AISI') {
      const A1 = a * b, Pp = 0.65 * 0.85 * fck * A1 * Math.min(2, Math.sqrt(+I.ac1 || 1));
      add(CHK.mk({ grp, name: 'Concrete bearing', clause: 'AISC 360-16 J8 (φ_c = 0.65)', Ed: N, Rd: Pp, unit: 'kN', fmt: kN }));
      const m = (a - 0.95 * ch) / 2, n = (b - 0.8 * cb) / 2, l = Math.max(m, n), treq = l * Math.sqrt(2 * N / (0.9 * fyp * a * b));
      add(CHK.mk({ grp, name: 'Base plate thickness', clause: 'AISC Design Guide 1 (2nd ed.) 4.3 (cantilever m, n)', Ed: treq, Rd: tp, unit: 'mm', fmt: x => x, basis: 'approx' }));
    } else {
      const fcd = 1.0 * fck / 1.5, alpha = Math.min(3, Math.sqrt(+I.ac1 || 1)), fjd = 2 / 3 * alpha * fcd;
      const c = tp * Math.sqrt(fyp / (3 * fjd * R.gM0));
      // effective area around the hollow-section walls, clipped to the plate
      const ow = Math.min(cb + 2 * c, b), oh = Math.min(ch + 2 * c, a), iw = Math.max(0, cb - 2 * tw - 2 * c), ih = Math.max(0, ch - 2 * tw - 2 * c);
      const Aeff = ow * oh - iw * ih, NjRd = Aeff * fjd;
      add(CHK.mk({ grp, name: 'Base plate and concrete in compression (equivalent T-stub)', clause: 'EN 1993-1-8 6.2.5 (f_jd = β_j α f_cd, c = t √(f_y/(3 f_jd γM0)))', Ed: N, Rd: NjRd, unit: 'kN', fmt: kN,
        steps: [s('f_cd', 'α_cc f_ck/γ_c (α_cc = 1.0, γ_c = 1.5)', fcd, 'N/mm²'), s('f_jd', '2/3 α f_cd', fjd, 'N/mm²'), s('c', '', c, 'mm'), s('A_eff', 'walls + c, clipped to the plate', Aeff, 'mm²'), s('N_j,Rd', 'A_eff f_jd', kN(NjRd), 'kN')] }));
    }
    if (Math.abs(M) > 1) add(CHK.mk({ grp, name: 'Base plate with moment (fixed base)', clause: 'EN 1993-1-8 6.2.8 (not implemented)', review: true, note: 'Design the fixed base for N and M separately.' }));
    // shear: friction then anchors
    const Ff = 0.2 * N, nA = Math.round(+I.bp_nA), dA = +I.bp_dA;
    const abc = 0.44 - 0.0003 * MEM.boltFy(I.bp_gA), Fvb = nA * abc * MEM.boltFu(I.bp_gA) * MEM.boltAs(dA) / (R.code === 'EN' ? R.gM2 : 1.25);
    add(CHK.mk({ grp, name: 'Shear at the base: friction + anchors', clause: 'EN 1993-1-8 6.2.2(6)–(8) (C_f,d = 0.2; α_bc = 0.44 − 0.0003 f_yb)', Ed: V, Rd: Ff + Fvb, unit: 'kN', fmt: kN, basis: R.code === 'EN' ? 'code' : 'approx', steps: [s('F_f,Rd', '0.2 N_c,Ed', kN(Ff), 'kN'), s('F_vb,Rd', `${nA} × α_bc f_ub A_s / γM2`, kN(Fvb), 'kN')] }));
    if (V > Ff || Math.abs(M) > 1) add(CHK.mk({ grp, name: 'Anchors in concrete (pull-out, cone, pry-out, edge)', clause: 'EN 1992-4 / ACI 318 ch. 17 / IS 456 (not implemented)', review: true, note: 'The anchors carry load: verify the anchorage in concrete with the anchor manufacturer data.' }));
    else add(CHK.na({ grp, name: 'Anchors in concrete', clause: 'EN 1992-4' }, 'No uplift or moment and the shear is carried by friction: anchors are nominal (positional).'));
    // slab punching
    const d = +I.slab_d, rho = +I.slab_rho;
    if (d > 0) {
      if (R.code === 'IS') {
        const u = 2 * (a + d) + 2 * (b + d), ks = Math.min(1, 0.5 + Math.min(a, b) / Math.max(a, b)), tc = ks * 0.25 * Math.sqrt(fck), VRd = tc * u * d;
        add(CHK.mk({ grp, name: 'Slab punching shear', clause: 'IS 456:2000 31.6 (perimeter at d/2)', Ed: N, Rd: VRd, unit: 'kN', fmt: kN, basis: 'code', note: 'Suspended-slab formula; for a ground-bearing slab use a slab-on-grade method (e.g. TR34).' }));
      } else if (R.code === 'AISI') {
        const b0 = 2 * (a + d) + 2 * (b + d), VRd = 0.75 * 0.33 * Math.sqrt(fck) * b0 * d;
        add(CHK.mk({ grp, name: 'Slab punching shear', clause: 'ACI 318-19 22.6.5.2 (λ_s = λ = 1)', Ed: N, Rd: VRd, unit: 'kN', fmt: kN, basis: 'approx', note: 'Suspended-slab formula; size effect λ_s not applied.' }));
      } else {
        const k = Math.min(2, 1 + Math.sqrt(200 / d)), vmin = 0.035 * k ** 1.5 * Math.sqrt(fck), vc = Math.max(0.18 / 1.5 * k * Math.cbrt(100 * rho * fck), vmin);
        const u1 = 2 * (a + b) + 2 * Math.PI * 2 * d, beta = 1.15, vEd = beta * N / (u1 * d);
        const u0 = 2 * (a + b), nu = 0.6 * (1 - fck / 250), vmax = 0.4 * nu * fck / 1.5, v0 = beta * N / (u0 * d);
        add(CHK.mk({ grp, name: 'Slab punching shear at the basic control perimeter (2d)', clause: 'EN 1992-1-1 6.4.4 (eq. 6.47), β = 1.15 (6.4.3(6))', Ed: vEd, Rd: vc, unit: 'N/mm²', fmt: x => x, steps: [s('k', '1 + √(200/d) ≤ 2', k), s('u_1', '', u1, 'mm'), s('v_Rd,c', 'max(0.12 k (100 ρ f_ck)^⅓; 0.035 k^1.5 √f_ck)', vc, 'N/mm²')], note: 'Suspended-slab formula; for a ground-bearing slab use a slab-on-grade method (e.g. TR34).' }));
        add(CHK.mk({ grp, name: 'Slab punching at the loaded perimeter', clause: 'EN 1992-1-1 6.4.5(3) (0.4 ν f_cd)', Ed: v0, Rd: vmax, unit: 'N/mm²', fmt: x => x }));
      }
    }
    return { checks, overall: CHK.overall(checks) };
  }
  return { design, base, props, rrect };
})();

