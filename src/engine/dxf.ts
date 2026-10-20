// @ts-nocheck — ported verbatim from the mockup (index.html, 87_dxf.js); logic unchanged so results match the mockup.
import { SEC } from './section';
import { XCHK } from './xcheck';
import { U } from './util';
// ===== Drawings: DXF (AutoCAD R12 ASCII, millimetres, 1:1 model space) and an SVG preview, both from one entity list =====
// Every drawing is generated from the calculated model (res) and its normalised inputs (res.I); nothing is drawn from stale values.
// Coordinates: x to the right, y up, mm. Entities: line, pl (polyline), circ, arc, text. Dimensions are drawn as lines + ticks + text.
export const DWG = (() => {
  // layer → AutoCAD colour index, linetype, SVG preview class
  const LAYERS = {
    OUTLINE: [7, 'CONTINUOUS'], HIDDEN: [8, 'DASHED'], CENTER: [1, 'CENTER'], GRID: [8, 'CENTER'], DIM: [3, 'CONTINUOUS'], TEXT: [7, 'CONTINUOUS'],
    HOLES: [4, 'CONTINUOUS'], PLATE: [2, 'CONTINUOUS'], WELD: [6, 'CONTINUOUS'], LOAD: [1, 'CONTINUOUS'], CGSC: [6, 'CONTINUOUS'],
    JOIST: [30, 'CONTINUOUS'], BRACE: [5, 'DASHED'], SUPPORT: [8, 'CONTINUOUS'], TITLE: [7, 'CONTINUOUS']
  };
  const f1 = v => { const r = Math.round(v * 10) / 10; return Math.abs(r - Math.round(r)) < 1e-9 ? String(Math.round(r)) : r.toFixed(1); };
  const deg = Math.PI / 180;

  // ---------- drawing builder ----------
  function drawing(id, title, h) {
    const e = [];
    const D = {
      id, title, h, e, notes: [],
      line(a, b, L = 'OUTLINE') { e.push({ t: 'line', a, b, L }); return D; },
      pl(pts, closed, L = 'OUTLINE') { e.push({ t: 'pl', pts, closed: !!closed, L }); return D; },
      rect(x0, y0, x1, y1, L = 'OUTLINE') { return D.pl([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true, L); },
      circ(c, r, L = 'HOLES') { e.push({ t: 'circ', c, r, L }); return D; },
      arc(c, r, a0, a1, L = 'OUTLINE') { e.push({ t: 'arc', c, r, a0, a1, L }); return D; },
      text(p, s, o = {}) { e.push({ t: 'text', p, s: String(s), h: o.h || h, al: o.al || 'l', rot: o.rot || 0, L: o.L || 'TEXT' }); return D; },
      // aligned dimension a→b, offset perpendicular (left of a→b is positive), label defaults to the length
      dim(a, b, off, label) {
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
        if (len < 1e-6) return D;
        const u = [dx / len, dy / len], n = [-u[1], u[0]], sg = Math.sign(off) || 1;
        const p1 = [a[0] + n[0] * off, a[1] + n[1] * off], p2 = [b[0] + n[0] * off, b[1] + n[1] * off];
        const g = h * 0.3, ov = h * 0.5;
        for (const [q, p] of [[a, p1], [b, p2]]) D.line([q[0] + n[0] * sg * g, q[1] + n[1] * sg * g], [p[0] + n[0] * sg * ov, p[1] + n[1] * sg * ov], 'DIM');
        D.line(p1, p2, 'DIM');
        const tk = h * 0.35, d45 = [(u[0] + n[0]) * tk, (u[1] + n[1]) * tk];
        for (const p of [p1, p2]) D.line([p[0] - d45[0], p[1] - d45[1]], [p[0] + d45[0], p[1] + d45[1]], 'DIM');
        let ang = Math.atan2(u[1], u[0]) / deg; if (ang > 90.01 || ang < -89.99) ang += 180; if (ang > 180) ang -= 360;
        const up = [-Math.sin(ang * deg), Math.cos(ang * deg)], m = [(p1[0] + p2[0]) / 2 + up[0] * h * 0.35, (p1[1] + p2[1]) / 2 + up[1] * h * 0.35];
        const lab = label === undefined ? f1(len) : String(label), tw = lab.length * h * 0.62;
        if (tw <= len * 0.85) D.text(m, lab, { al: 'c', rot: ang, L: 'DIM' });
        else if (Math.abs(u[0]) < 0.5) { const no = [n[0] * sg, n[1] * sg], x = (p1[0] + p2[0]) / 2 + no[0] * h * 0.5, y = (p1[1] + p2[1]) / 2 - h * 0.45; D.text([x, y], lab, { al: no[0] >= 0 ? 'l' : 'r', L: 'DIM' }); }
        else { const e2 = u[0] >= 0 ? p2 : p1; D.text([e2[0] + h * 0.6, e2[1] - h * 0.45], lab, { al: 'l', L: 'DIM' }); }
        return D;
      },
      // horizontal chain dimension through x positions at height y
      chainX(xs, y, off, labels) { for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > 1e-6) D.dim([xs[i - 1], y], [xs[i], y], off, labels ? labels[i - 1] : undefined); return D; },
      chainY(ys, x, off) { for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > 1e-6) D.dim([x, ys[i - 1]], [x, ys[i]], off); return D; },
      // filled-looking arrowhead (closed triangle) pointing along dir at tip
      arrow(tip, dir, L = 'LOAD') { const s = h * 0.9, w = h * 0.35, u = [dir[0], dir[1]], n = [-u[1], u[0]]; return D.pl([tip, [tip[0] - u[0] * s + n[0] * w, tip[1] - u[1] * s + n[1] * w], [tip[0] - u[0] * s - n[0] * w, tip[1] - u[1] * s - n[1] * w]], true, L); },
      cross(c, r, L = 'CGSC') { D.line([c[0] - r, c[1]], [c[0] + r, c[1]], L); D.line([c[0], c[1] - r], [c[0], c[1] + r], L); return D; }
    };
    return D;
  }
  // rounded rectangle as a polyline (corner arcs as 6 segments)
  function rrect(x0, y0, x1, y1, r) {
    if (!(r > 0)) return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const P = [], c = [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]];
    for (const [cx, cy, a] of c) for (let k = 0; k <= 6; k++) { const t = (a + 15 * k) * deg; P.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
    return P;
  }
  // slot (rounded ends) centred at c, width w, length l (vertical)
  function slot(c, w, l) { return l <= w + 1e-6 ? null : rrect(c[0] - w / 2, c[1] - l / 2, c[0] + w / 2, c[1] + l / 2, w / 2 - 1e-6); }
  const bbox = D => {
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }, add = (x, y) => { if (!isFinite(x) || !isFinite(y)) return; b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); };
    for (const q of D.e) {
      if (q.t === 'line') { add(...q.a); add(...q.b); }
      else if (q.t === 'pl') q.pts.forEach(p => add(...p));
      else if (q.t === 'circ' || q.t === 'arc') { add(q.c[0] - q.r, q.c[1] - q.r); add(q.c[0] + q.r, q.c[1] + q.r); }
      else if (q.t === 'text') {
        const w = q.s.length * q.h * 0.62, c = Math.cos(q.rot * deg), s = Math.sin(q.rot * deg), x0 = q.al === 'c' ? -w / 2 : q.al === 'r' ? -w : 0;
        for (const [dx, dy] of [[x0, 0], [x0 + w, 0], [x0, q.h], [x0 + w, q.h]]) add(q.p[0] + dx * c - dy * s, q.p[1] + dx * s + dy * c);
      }
    }
    return b;
  };
  const translate = (D, dx, dy) => {
    const m = p => [p[0] + dx, p[1] + dy];
    for (const q of D.e) { if (q.a) q.a = m(q.a); if (q.b) q.b = m(q.b); if (q.c) q.c = m(q.c); if (q.p) q.p = m(q.p); if (q.pts) q.pts = q.pts.map(m); }
  };

  // ---------- section geometry ----------
  const designation = (p, arr) => {
    const n = arr === 'single' ? '' : arr === 'b2b' ? '2×' : '4×';
    const B = p.Bt === p.Bb ? f1(p.Bt) : `${f1(p.Bt)}/${f1(p.Bb)}`, C = p.Ct === p.Cb ? f1(p.Ct) : `${f1(p.Ct)}/${f1(p.Cb)}`;
    return `${n}C${f1(p.H)}×${B}×${C}×${f1(p.t)}`;
  };
  const arrName = { single: 'single C', b2b: 'two C back-to-back', quad: 'four C (two back-to-back pairs)' };
  // centre-line paths of every C of the arrangement (same placement as the on-screen sketch); y horizontal, z up, bottom flange centre-line at z = 0
  const parts = (p, arr, opt) => {
    const t = p.t, gap = Math.max(0, +(opt && opt.gap) || 0), s = +(opt && opt.pairSpacing) || 0, yw = gap / 2 + t / 2;
    const pl = arr === 'single' ? [[1, 0]] : arr === 'b2b' ? [[-1, -yw], [1, yw]] : [[-1, -s / 2 - yw], [1, -s / 2 + yw], [-1, s / 2 - yw], [1, s / 2 + yw]];
    const P = SEC.path(p, 6).P;
    return pl.map(([o, y0]) => P.map(q => [y0 + o * q[0], q[1]]));
  };
  // outlines of the arrangement placed with the web(s) centred on x = xc and the top of steel at y = yTop
  function outlines(p, arr, opt, xc, yTop, flip) {
    const t = p.t, ps = parts(p, arr, opt), dz = yTop - (p.H - t / 2);
    return ps.map(P => SEC.outline(P, t).map(q => [xc + (flip ? -1 : 1) * q[0], q[1] + dz]));
  }
  const widthOf = (p, arr, opt) => { let a = Infinity, b = -Infinity; for (const P of parts(p, arr, opt)) for (const q of P) { a = Math.min(a, q[0] - p.t / 2); b = Math.max(b, q[0] + p.t / 2); } return { y0: a, y1: b, w: b - a }; };
  // distance from the support centre-line to the outer face of a main-beam web
  const webFace = (p, arr, opt) => arr === 'single' ? p.t / 2 : arr === 'b2b' ? (+opt.gap || 0) / 2 + p.t : (+opt.pairSpacing || 0) / 2 + (+opt.gap || 0) / 2 + p.t;

  // ---------- context shared by the drawings ----------
  function ctx(res) {
    const I = res.I, M = res.mods, C = M.conn || {};
    const mem = k => { const d = k === 'mb' ? M.mb && M.mb.gov : M[k]; return d && !d.error && d.spec ? d : null; };
    const opt = m => ({ gap: +I[m + '_gap'] || 0, pairSpacing: +I[m + '_ps'] || 0 });
    const P = {}; for (const k of ['mb', 'sbi', 'sbe']) { const d = mem(k); P[k] = d ? { d, p: d.spec.p, arr: d.spec.arr, opt: d.spec.opt || opt(k), g: d.gross } : null; }
    const conn = { sbi: C.ci, sbe: C.ce, mb: C.cm };
    // end offset of each C: support centre-line to the C end (support half-width + gap / flange stand-off)
    const colB = +I.col_b, colH = +I.col_h;
    const mbFace = P.mb ? webFace(P.mb.p, P.mb.arr, P.mb.opt) : 0;
    const endOff = { sbi: mbFace + (conn.sbi ? conn.sbi.geo.gapTot : 0), sbe: colB / 2 + (conn.sbe ? conn.sbe.geo.gapTot : 0), mb: colH / 2 + (conn.mb ? conn.mb.geo.gapTot : 0) };
    const span = { sbi: +I.Lsb, sbe: +I.Lsb, mb: +I.Lmb };
    const nJ = +I.j_n, aJ = Math.min(+I.j_aL, +I.Lsb / 2), SJ = nJ > 1 ? (+I.Lsb - 2 * aJ) / (nJ - 1) : 0;
    const joistsOn = k => nJ > 0 && (I[k + '_rst'] === 'joist' || I[k + '_rst'] === 'both');
    const joistPos = nJ > 0 ? U.range(nJ, i => nJ === 1 ? +I.Lsb / 2 : aJ + i * SJ) : [];
    const nsbi = res.layout.xs.length, nb = +I.nb, nm = +I.nm;
    const qty = { mb: nb * (nm + 1), sbi: nb * nsbi * nm, sbe: (nb + 1) * nm, col: (nb + 1) * (nm + 1) };
    const status = res.summary && res.summary.overall ? res.summary.overall.status : 'FAIL';
    return { I, M, P, conn, endOff, span, joistsOn, joistPos, qty, status, colB, colH, xs: res.layout.xs, nb, nm, mbFace };
  }
  const NAMES = { mb: 'Main beam', sbi: 'SB-Int', sbe: 'SB-End' };
  const MARK = { mb: 'MB', sbi: 'SBI', sbe: 'SBE' };

  // ---------- 1 cross-sections ----------
  function sectionDwg(X, k) {
    const m = X.P[k]; if (!m) return null;
    const { p, arr, opt, g, d } = m, t = p.t, lp = d.spec.lp, wd = widthOf(p, arr, opt);
    const h = Math.max(2.5, Math.round(Math.max(p.H, wd.w) / 16 * 2) / 2);
    const D = drawing('sec_' + k, `${NAMES[k]} – cross-section ${designation(p, arr)}`, h);
    // place: bottom flange centre-line at z = 0 as in the section model, top of steel at H − t/2
    for (const o of outlines(p, arr, opt, 0, p.H - t / 2)) D.pl(o, true, 'OUTLINE');
    // built-up connectors at the web junctions
    if (arr !== 'single') { const ys = arr === 'b2b' ? [0] : [-opt.pairSpacing / 2, opt.pairSpacing / 2]; for (const y of ys) for (const z of [p.H - t - p.r - 3, p.r + 3]) D.circ([y, z], Math.max(1, h * 0.2), 'WELD'); }
    // CG and SC, centre lines through the CG
    const ext = Math.max(p.H, wd.w) * 0.08;
    D.line([wd.y0 - ext, g.zc], [wd.y1 + ext, g.zc], 'CENTER').line([g.yc, -t / 2 - ext], [g.yc, p.H - t / 2 + ext], 'CENTER');
    D.circ([g.yc, g.zc], h * 0.45, 'CGSC').cross([g.yc, g.zc], h * 0.7).text([g.yc + h * 0.7, g.zc + h * 0.5], 'CG', { L: 'CGSC' });
    if (isFinite(g.ysc)) { const s = h * 0.4; D.rect(g.ysc - s, g.zsc - s, g.ysc + s, g.zsc + s, 'CGSC').text([g.ysc - h * 0.7, g.zsc - h * 1.4], 'SC', { al: 'r', L: 'CGSC' }); }
    // dimensions: H on the left, flanges and lips on the right-most C
    const zTop = p.H - t / 2, zBot = -t / 2, R = parts(p, arr, opt).pop(), yWeb = R[Math.floor(R.length / 2)][0], yOut = yWeb - t / 2;
    const yL = Math.min(wd.y0, isFinite(g.ysc) ? g.ysc - h : wd.y0);
    D.dim([wd.y0, zBot], [wd.y0, zTop], (wd.y0 - yL) + 2.2 * h, `H = ${f1(p.H)}`);
    D.dim([yOut, zTop], [yOut + p.Bt, zTop], 1.6 * h + (lp ? 3.5 * h : 0), `Bt = ${f1(p.Bt)}`);
    D.dim([yOut, zBot], [yOut + p.Bb, zBot], -1.6 * h, `Bb = ${f1(p.Bb)}`);
    if (p.Ct > 0) D.dim([yOut + p.Bt, zTop - p.Ct], [yOut + p.Bt, zTop], -1.6 * h, `Ct = ${f1(p.Ct)}`);
    if (p.Cb > 0) D.dim([yOut + p.Bb, zBot], [yOut + p.Bb, zBot + p.Cb], -1.6 * h, `Cb = ${f1(p.Cb)}`);
    if (arr === 'quad') D.dim([-opt.pairSpacing / 2, p.H * 0.12], [opt.pairSpacing / 2, p.H * 0.12], 0, `pairs @ ${f1(opt.pairSpacing)}`);
    // applied load line, eccentricity to the SC
    if (lp && isFinite(g.ysc)) {
      const x = lp.y, zA = g.zsc + lp.z, yT = zTop + 3 * h;
      D.line([x, yT], [x, zA + h * 0.9], 'LOAD').arrow([x, zA], [0, -1]).text([x + h * 0.5, yT - h * 0.4], `q (${lp.conv === 'cg' ? 'through CG' : lp.conv === 'sc' ? 'through SC' : lp.conv === 'flange' ? 'top flange' : 'user'})`, { L: 'LOAD' });
      if (Math.abs(lp.e) > 0.05) D.line([g.ysc, g.zsc], [g.ysc, zTop + 1.4 * h], 'DIM').dim([Math.min(g.ysc, x), zTop + 1.4 * h], [Math.max(g.ysc, x), zTop + 1.4 * h], 0, `e = ${f1(Math.abs(lp.e))}`);
    }
    const xr = Math.max(wd.y1, yOut + Math.max(p.Bt, p.Bb)) + 3.5 * h;
    D.text([xr, p.H * 0.62], `t = ${f1(t)}`).text([xr, p.H * 0.62 - 1.6 * h], `r = ${f1(p.r)} (internal)`).text([xr, p.H * 0.62 - 3.2 * h], arrName[arr]);
    D.notes.push(`${designation(p, arr)}, ${arrName[arr]}, ${X.I[k + '_gr']}`, `A = ${f1(g.A)} mm², mass ${U.fmt(g.mass, 2)} kg/m, I_y = ${U.fmt(g.Iyy / 1e4, 1)} cm⁴`,
      `CG (${f1(g.yc)}, ${f1(g.zc)}), SC (${f1(g.ysc)}, ${f1(g.zsc)}) mm from the web centre-line / bottom flange centre-line`,
      lp ? `Load convention: ${lp.label}; e = ${f1(Math.abs(lp.e))} mm to the SC` : '');
    return D;
  }

  // ---------- 2 column section and base plate ----------
  function columnDwg(X) {
    const I = X.I, b = +I.col_b, hh = +I.col_h, tb = +I.col_tb, th = +I.col_th, h = Math.max(2.5, Math.round(Math.max(b, hh, +I.bp_a, +I.bp_b) / 18 * 2) / 2);
    const D = drawing('col', `Box column ${f1(b)}×${f1(hh)}×${f1(tb)}${th !== tb ? '/' + f1(th) : ''} and base plate`, h);
    // column section: b horizontal, h vertical (as on the Box Column tab)
    if (I.col_type === 'weld') {
      D.rect(-b / 2, hh / 2 - tb, b / 2, hh / 2).rect(-b / 2, -hh / 2, b / 2, -hh / 2 + tb).rect(-b / 2, -hh / 2 + tb, -b / 2 + th, hh / 2 - tb).rect(b / 2 - th, -hh / 2 + tb, b / 2, hh / 2 - tb);
      for (const [x, y] of [[-b / 2 + th, hh / 2 - tb], [b / 2 - th, hh / 2 - tb], [-b / 2 + th, -hh / 2 + tb], [b / 2 - th, -hh / 2 + tb]]) D.circ([x, y], Math.max(0.8, +I.col_aw * 0.5 || 1), 'WELD');
    } else {
      const ro = +I.col_ro > 0 ? +I.col_ro : 2 * tb, ri = Math.max(0, ro - tb);
      D.pl(rrect(-b / 2, -hh / 2, b / 2, hh / 2, ro), true).pl(rrect(-b / 2 + th, -hh / 2 + tb, b / 2 - th, hh / 2 - tb, ri), true);
    }
    D.line([-b / 2 - h, 0], [b / 2 + h, 0], 'CENTER').line([0, -hh / 2 - h], [0, hh / 2 + h], 'CENTER');
    D.dim([-b / 2, hh / 2], [b / 2, hh / 2], 1.6 * h, `b = ${f1(b)}`).dim([-b / 2, -hh / 2], [-b / 2, hh / 2], 1.6 * h, `h = ${f1(hh)}`);
    D.text([b / 2 + h, hh / 2 - tb - 1.5 * h], `t(b) = ${f1(tb)}`).text([b / 2 + h, hh / 2 - tb - 3 * h], `t(h) = ${f1(th)}`);
    D.text([0, -hh / 2 - 3 * h], 'Main beam → b-face, SB-End → h-face', { al: 'c' });
    // base plate (plan), to the right
    const a = +I.bp_a, w = +I.bp_b, n = +I.bp_nA, dA = +I.bp_dA, x0 = b / 2 + Math.max(w, b) * 0.9 + 6 * h;
    D.rect(x0 - w / 2, -a / 2, x0 + w / 2, a / 2, 'PLATE');
    if (I.col_type === 'weld') D.rect(x0 - b / 2, -hh / 2, x0 + b / 2, hh / 2, 'HIDDEN'); else D.pl(rrect(x0 - b / 2, -hh / 2, x0 + b / 2, hh / 2, +I.col_ro > 0 ? +I.col_ro : 2 * tb), true, 'HIDDEN');
    const ex = Math.max(dA * 2, (w - b) / 4), pos = n >= 4 ? [[-1, -1], [1, -1], [1, 1], [-1, 1]] : n === 2 ? [[-1, 0], [1, 0]] : [];
    for (const [i, j] of pos) { const c = [x0 + i * (w / 2 - ex), j * (a / 2 - ex)]; D.circ(c, dA / 2 + (dA <= 14 ? 1 : 2) / 2).cross(c, dA * 0.8, 'CENTER'); }
    D.dim([x0 - w / 2, a / 2], [x0 + w / 2, a / 2], 1.6 * h, f1(w)).dim([x0 + w / 2, -a / 2], [x0 + w / 2, a / 2], -1.6 * h, f1(a));
    if (pos.length) D.dim([x0 - w / 2, -a / 2], [x0 - w / 2 + ex, -a / 2], -1.6 * h, f1(ex));
    D.text([x0, -a / 2 - 4 * h], `Base plate ${f1(w)}×${f1(a)}×${f1(+I.bp_t)}, ${n} × M${f1(dA)} ${I.bp_gA} anchors (positions schematic)`, { al: 'c' });
    D.notes.push(`Column: ${I.col_type === 'weld' ? 'welded box from four plates' : I.col_type === 'rhsH' ? 'hot-finished RHS' : 'cold-formed RHS'}, ${I.col_gr}, height ${f1(+I.hc)} mm (base to main-beam top), quantity ${X.qty.col}`);
    return D;
  }

  // ---------- 3 arrangement plan ----------
  function planDwg(X) {
    const I = X.I, nb = X.nb, nm = X.nm, Lmb = +I.Lmb, Lsb = +I.Lsb, Lx = nb * Lmb, Ly = nm * Lsb;
    const h = Math.max(20, Math.round(Math.max(Lx, Ly) / 110 / 5) * 5), D = drawing('plan', 'Arrangement plan', h);
    const cb = X.colB, ch = X.colH;
    const wM = X.P.mb ? widthOf(X.P.mb.p, X.P.mb.arr, X.P.mb.opt) : { y0: -50, y1: 50 }, wI = X.P.sbi ? widthOf(X.P.sbi.p, X.P.sbi.arr, X.P.sbi.opt) : { y0: -25, y1: 25 }, wE = X.P.sbe ? widthOf(X.P.sbe.p, X.P.sbe.arr, X.P.sbe.opt) : { y0: -25, y1: 25 };
    // grids: numbers along x (column lines), letters along y (main-beam lines)
    const R = h * 1.1, gx = Lx * 0.04 + 3 * R, gy = Ly * 0.04 + 3 * R, letter = j => j < 26 ? String.fromCharCode(65 + j) : 'A' + String.fromCharCode(65 + j - 26);
    for (let i = 0; i <= nb; i++) { D.line([i * Lmb, -gy], [i * Lmb, Ly + gy * 0.4], 'GRID'); D.circ([i * Lmb, -gy - R], R, 'GRID').text([i * Lmb, -gy - R - h / 2], i + 1, { al: 'c', L: 'GRID' }); }
    for (let j = 0; j <= nm; j++) { D.line([-gx, j * Lsb], [Lx + gx * 0.4, j * Lsb], 'GRID'); D.circ([-gx - R, j * Lsb], R, 'GRID').text([-gx - R, j * Lsb - h / 2], letter(j), { al: 'c', L: 'GRID' }); }
    // columns (h along x, b along y)
    for (let i = 0; i <= nb; i++) for (let j = 0; j <= nm; j++) D.rect(i * Lmb - ch / 2, j * Lsb - cb / 2, i * Lmb + ch / 2, j * Lsb + cb / 2, 'OUTLINE');
    // main beams between column faces
    for (let j = 0; j <= nm; j++) for (let i = 0; i < nb; i++) {
      const x0 = i * Lmb + ch / 2, x1 = (i + 1) * Lmb - ch / 2, y = j * Lsb;
      D.rect(x0, y + wM.y0, x1, y + wM.y1, 'OUTLINE');
      if (i === 0) D.text([x0 + h, y + wM.y1 + h * 0.5], 'MB');
    }
    // SB-End at the column lines, SB-Int at their positions; both between main-beam / column faces
    for (let i = 0; i <= nb; i++) for (let j = 0; j < nm; j++) {
      const x = i * Lmb, y0 = j * Lsb + cb / 2, y1 = (j + 1) * Lsb - cb / 2;
      D.rect(x + wE.y0 * (i === nb ? -1 : 1), y0, x + wE.y1 * (i === nb ? -1 : 1), y1, 'OUTLINE');
      if (i === 0 && j === 0) D.text([x + Math.max(wE.y1, 0) + h * 0.5, (y0 + y1) / 2], 'SBE', { rot: 90 });
    }
    const mbHalf = X.mbFace + (X.P.mb ? Math.max(X.P.mb.p.Bt, X.P.mb.p.Bb) : 0);
    for (let i = 0; i < nb; i++) for (const xs of X.xs) for (let j = 0; j < nm; j++) {
      const x = i * Lmb + xs, y0 = j * Lsb + mbHalf, y1 = (j + 1) * Lsb - mbHalf;
      D.rect(x + wI.y0, y0, x + wI.y1, y1, 'OUTLINE');
      if (i === 0 && j === 0 && xs === X.xs[0]) D.text([x + wI.y1 + h * 0.5, (y0 + y1) / 2], 'SBI', { rot: 90 });
    }
    // joists (centre lines across the secondaries) where they restrain a secondary
    if (X.joistPos.length && (X.joistsOn('sbi') || X.joistsOn('sbe'))) {
      for (let j = 0; j < nm; j++) for (const y of X.joistPos) D.line([0, j * Lsb + y], [Lx, j * Lsb + y], 'JOIST');
      D.text([Lx + h, X.joistPos[0]], 'J (joist lines)', { L: 'JOIST' });
    }
    // plan bracing in the braced bays
    if (I.br_use === 'yes') for (let j = 0; j < nm; j++) for (let b = 0; b < Math.min(nb, +I.br_nbay || 1); b++) D.line([b * Lmb, j * Lsb], [(b + 1) * Lmb, (j + 1) * Lsb], 'BRACE').line([(b + 1) * Lmb, j * Lsb], [b * Lmb, (j + 1) * Lsb], 'BRACE');
    // dimensions: bays and overall along the bottom, modules and overall on the left, SB-Int positions in bay 1, joists in module 1
    const xsB = U.range(nb + 1, i => i * Lmb), ysM = U.range(nm + 1, j => j * Lsb);
    D.chainX(xsB, -gy * 0.35, 0).dim([0, -gy * 0.65], [Lx, -gy * 0.65], 0, `${f1(Lx)}`);
    D.chainY(ysM, -gx * 0.35, 0).dim([-gx * 0.65, 0], [-gx * 0.65, Ly], 0, `${f1(Ly)}`);
    if (X.xs.length) D.chainX([0, ...X.xs, Lmb], Ly + gy * 0.2, 0);
    if (X.joistPos.length && (X.joistsOn('sbi') || X.joistsOn('sbe'))) D.chainY([0, ...X.joistPos, Lsb], Lx + gx * 0.25, 0);
    // member schedule
    const rows = scheduleRows(X), x0 = Lx + gx * 0.8 + 6 * h, cw = [6, 5, 30, 9, 10, 10].map(c => c * h * 0.72);
    let y = Ly;
    D.text([x0, y + h * 1.2], 'MEMBER SCHEDULE (for information – check before ordering)');
    const head = ['Mark', 'Qty', 'Section', 'Length', 'kg each', 'kg total'];
    const rowTxt = (cells, yy) => { let x = x0; cells.forEach((c, i) => { D.text([x + h * 0.3, yy], c); x += cw[i]; }); };
    rowTxt(head, y - h * 1.3); D.line([x0, y], [x0 + cw.reduce((a, b) => a + b, 0), y], 'TEXT');
    rows.forEach((r, i) => rowTxt([r.mark, String(r.qty), r.sec, f1(r.L), U.fmt(r.kg, 1), U.fmt(r.kg * r.qty, 0)], y - h * (1.3 + 1.6 * (i + 1))));
    const yb = y - h * (1.3 + 1.6 * rows.length) - h * 0.6; D.line([x0, yb], [x0 + cw.reduce((a, b) => a + b, 0), yb], 'TEXT');
    D.text([x0, yb - h * 1.6], `Total ${U.fmt(rows.reduce((s, r) => s + r.kg * r.qty, 0), 0)} kg (members only; plates, bolts and decking excluded)`);
    D.notes.push(`${nb} bays × ${f1(Lmb)} mm along the main beams, ${nm} modules × ${f1(Lsb)} mm along the secondaries, ${X.qty.col} columns`, 'Member outlines are plan widths of the arrangements; joists and bracing are shown as centre lines');
    return D;
  }
  function cutLength(X, k) { return X.span[k] - 2 * X.endOff[k]; }
  function scheduleRows(X) {
    const I = X.I, rows = [];
    for (const k of ['mb', 'sbi', 'sbe']) { const m = X.P[k]; if (!m || !X.qty[k]) continue; const L = cutLength(X, k); rows.push({ mark: MARK[k], qty: X.qty[k], sec: designation(m.p, m.arr) + ' ' + (I[k + '_gr'] || ''), L, kg: m.g.mass * L / 1e3 }); }
    const colA = X.M.col && X.M.col.pr ? X.M.col.pr.A : (2 * (+I.col_b) * (+I.col_tb) + 2 * (+I.col_h - 2 * +I.col_tb) * (+I.col_th));
    rows.push({ mark: 'COL', qty: X.qty.col, sec: `Box ${f1(+I.col_b)}×${f1(+I.col_h)}×${f1(+I.col_tb)} ${I.col_gr}`, L: +I.hc - (X.P.mb ? 0 : 0), kg: colA * 7850e-9 * +I.hc });
    if (X.joistPos.length && (X.joistsOn('sbi') || X.joistsOn('sbe'))) {
      const nGap = X.nb * (X.xs.length + 1), Lj = +I.Lmb / (X.xs.length + 1), A = I.j_sec === 'L' ? (+I.j_b + +I.j_h - +I.j_t) * +I.j_t : I.j_sec === 'box' ? 2 * (+I.j_b + +I.j_h - 2 * +I.j_t) * +I.j_t : (+I.j_h + 2 * +I.j_b) * +I.j_t;
      rows.push({ mark: 'J', qty: nGap * X.nm * X.joistPos.length, sec: `${I.j_sec === 'L' ? 'L' : I.j_sec === 'box' ? 'Box' : 'C'}${f1(+I.j_b)}×${f1(+I.j_h)}×${f1(+I.j_t)}`, L: Lj, kg: A * 7850e-9 * Lj });
    }
    return rows;
  }

  // ---------- 4 elevations ----------
  function elevationDwg(X, dir) {
    const I = X.I, hc = +I.hc, along = dir === 'x', n = along ? X.nb : X.nm, Ls = along ? +I.Lmb : +I.Lsb, Ltot = n * Ls;
    const h = Math.max(15, Math.round(Math.max(Ltot, hc) / 90 / 5) * 5);
    const D = drawing(along ? 'elev_A' : 'elev_1', along ? 'Elevation on grid A (along the main beams)' : 'Elevation on grid 1 (along the SB-End)', h);
    const cw = along ? X.colH : X.colB; // column width seen in this elevation
    const beam = along ? X.P.mb : X.P.sbe, cross = along ? X.P.sbi : X.P.mb;
    const Hb = beam ? beam.p.H : 300;
    // ground, columns, base plates
    D.line([-Ls * 0.15, 0], [Ltot + Ls * 0.15, 0], 'HIDDEN');
    for (let i = 0; i <= n; i++) {
      const x = i * Ls; D.rect(x - cw / 2, 0, x + cw / 2, hc).rect(x - (along ? +I.bp_b : +I.bp_a) / 2, -(+I.bp_t), x + (along ? +I.bp_b : +I.bp_a) / 2, 0, 'PLATE');
      D.line([x, -h * 2], [x, hc + h * 3], 'GRID').circ([x, hc + h * 3 + h * 1.1], h * 1.1, 'GRID').text([x, hc + h * 3 + h * 0.6], along ? i + 1 : String.fromCharCode(65 + i), { al: 'c', L: 'GRID' });
    }
    // beams in elevation: top at hc (top of steel), between column faces
    for (let i = 0; i < n; i++) {
      const x0 = i * Ls + cw / 2, x1 = (i + 1) * Ls - cw / 2;
      D.rect(x0, hc - Hb, x1, hc);
      if (beam) { const tt = beam.p.t + beam.p.r; D.line([x0, hc - tt], [x1, hc - tt], 'HIDDEN').line([x0, hc - Hb + tt], [x1, hc - Hb + tt], 'HIDDEN'); }
      // members framing in, shown in section (top of steel flush with the beam – assumed)
      if (along && cross) for (const xs of X.xs) for (const o of outlines(cross.p, cross.arr, cross.opt, i * Ls + xs, hc)) D.pl(o, true, 'OUTLINE');
    }
    if (!along && cross) for (let i = 0; i <= n; i++) for (const o of outlines(cross.p, cross.arr, cross.opt, i * Ls, hc)) D.pl(o, true, 'HIDDEN');
    // knee braces in the plane of this elevation
    const kTo = I.k_to === 'both' ? ['x', 'y'] : [I.k_to === 'mb' ? 'x' : 'y'];
    if (I.k_use === 'yes' && kTo.includes(dir)) {
      const a = +I.k_a, dv = a * Math.tan(+I.k_th * deg), yb = hc - Hb;
      for (let i = 0; i <= n; i++) for (const s of [-1, 1]) {
        if ((i === 0 && s < 0) || (i === n && s > 0)) continue;
        const xf = i * Ls + s * cw / 2; D.line([xf, yb - dv], [xf + s * a, yb], 'BRACE');
        if (i === 0) D.dim([xf, yb], [xf + a, yb], -1.2 * h, `a = ${f1(a)}`).text([xf + h, yb - dv - 1.5 * h], `knee θ = ${f1(+I.k_th)}°`);
      }
    }
    // dimensions
    D.dim([n * Ls + cw / 2, 0], [n * Ls + cw / 2, hc], -2 * h, `${f1(hc)}`).dim([n * Ls + cw / 2, hc - Hb], [n * Ls + cw / 2, hc], -5 * h, `${f1(Hb)}`);
    D.chainX(U.range(n + 1, i => i * Ls), -(+I.bp_t) - 3 * h, 0);
    if (along && X.xs.length) D.chainX([0, ...X.xs, Ls], hc + 1.5 * h, 0);
    D.text([-Ls * 0.15, hc + h * 0.5], 'T.O.S.', { L: 'TEXT' }).text([-Ls * 0.15, h * 0.5], 'Base', { L: 'TEXT' });
    D.notes.push(along ? 'Main beam between column faces; SB-Int shown in section with tops flush with the main beam (assumed – confirm the detail)' : 'SB-End between column faces; main beams shown dashed in section at the columns', `Column height ${f1(hc)} mm from base to top of main beam`);
    return D;
  }

  // ---------- 5 fabrication drawing of a C member (web elevation with holes) ----------
  function memberDwg(X, k) {
    const m = X.P[k]; if (!m) return null;
    const I = X.I, { p, arr, opt, g } = m, H = p.H, t = p.t, c = X.conn[k], geo = c && c.geo, Lc = cutLength(X, k), eo = X.endOff[k];
    const h = Math.max(6, Math.min(30, Math.round(Lc / 160))), D = drawing('fab_' + k, `${NAMES[k]} (${MARK[k]}) – fabrication, ${designation(p, arr)} × ${f1(Lc)}`, h);
    // web elevation: x along the member from the left C end, y up from the bottom of steel
    D.rect(0, 0, Lc, H);
    D.line([0, H - t - p.r], [Lc, H - t - p.r], 'HIDDEN').line([0, t + p.r], [Lc, t + p.r], 'HIDDEN');
    D.line([-2 * h, H / 2], [Lc + 2 * h, H / 2], 'CENTER');
    // end holes (both ends, mirrored)
    const bolts = geo && ['fin', 'ucleat', 'angle'].includes(geo.type);
    let nh = 0;
    if (bolts) for (const z of geo.zs) for (const y of geo.ys) for (const x of [y, Lc - y]) { D.circ([x, H - z], geo.d0 / 2); nh++; }
    if (geo && geo.adj && geo.adj.length) for (const a of geo.adj) for (const x of [a.y, Lc - a.y]) { const s = slot([x, H - a.z], a.d, a.lv); if (s) D.pl(s, true, 'HOLES'); else D.circ([x, H - a.z], a.d / 2); }
    // end-detail dimensions on the left end
    if (bolts) {
      const zs = geo.zs, ys = geo.ys;
      D.chainY([...zs.map(z => H - z), H].sort((a, b) => a - b), 0, 2 * h);
      D.chainX([0, ...ys], H, 1.6 * h);
    }
    // joist positions (SB) or SB-Int positions (MB)
    const marks = [];
    if (k !== 'mb' && X.joistsOn(k)) X.joistPos.forEach((x, i) => marks.push({ x: x - eo, lab: `J${i + 1}` }));
    if (k === 'mb') X.xs.forEach((x, i) => marks.push({ x: x - eo, lab: `SBI ${i + 1}` }));
    for (const q of marks) D.line([q.x, -h], [q.x, H + h], 'CENTER').text([q.x, H + 1.4 * h], q.lab, { al: 'c' });
    if (marks.length) D.chainX([0, ...marks.map(q => q.x), Lc], 0, -2.2 * h);
    // built-up connectors along the member
    if (arr !== 'single' && I[k + '_buT'] && I[k + '_buT'] !== 'none') {
      const s = Math.max(20, +I[k + '_buS'] || 300), lw = I[k + '_buT'] === 'weldInt' ? Math.min(+I[k + '_buL'] || 40, s) : 0, n = Math.max(1, Math.floor((Lc - 2 * 50) / s));
      const x0 = (Lc - n * s) / 2;
      for (let i = 0; i <= n; i++) for (const z of [H - t - p.r - 3, t + p.r + 3]) { const x = x0 + i * s; if (lw) D.line([x - lw / 2, z], [x + lw / 2, z], 'WELD'); else D.circ([x, z], Math.max(1.5, (+I[k + '_buD'] || 8) / 2), 'WELD'); }
      D.notes.push(`Built-up connection: ${I[k + '_buT'] === 'weldInt' ? `intermittent welds a = ${f1(+I[k + '_buA'])}, ${f1(lw)} long` : I[k + '_buT'] === 'weldCont' ? `continuous welds a = ${f1(+I[k + '_buA'])} (stations shown for reference)` : I[k + '_buT'] === 'spot' ? `spot welds Ø${f1(+I[k + '_buD'])}` : `bolts M${f1(+I[k + '_buD'])} ${I[k + '_buBg']}`} at ${f1(s)} pitch, top and bottom web junctions`);
    }
    // overall length and depth
    D.dim([0, 0], [Lc, 0], -(marks.length ? 4.4 : 2.2) * h, `L = ${f1(Lc)}`).dim([Lc, 0], [Lc, H], -2 * h, `${f1(H)}`);
    // section beside the elevation
    const wd = widthOf(p, arr, opt), xs = Lc + 8 * h - wd.y0;
    for (const o of outlines(p, arr, opt, xs, H)) D.pl(o, true);
    D.text([xs + (wd.y0 + wd.y1) / 2, -2.2 * h], designation(p, arr), { al: 'c' });
    D.notes.push(`Mark ${MARK[k]}, quantity ${X.qty[k]}, ${designation(p, arr)} ${arrName[arr]}, ${I[k + '_gr']}, mass ${U.fmt(g.mass * Lc / 1e3, 1)} kg each`,
      `Cut length L = ${f1(X.span[k])} (centres) − 2 × ${f1(eo)} (support half-width + stand-off) = ${f1(Lc)} mm – confirm against the support details`,
      geo ? `End detail: ${c.typeName}${bolts ? `; ${geo.zs.length * geo.ys.length} holes Ø${f1(geo.d0)} each end for M${f1(geo.d)} bolts (${nh} total)` : ''}${geo.adj && geo.adj.length ? `; ${geo.adj.length} adjustment hole(s) each end` : ''}` : 'End detail: not analysed',
      k !== 'mb' && X.joistsOn(k) ? `Joist connections J1–J${X.joistPos.length} on the ${I.j_at === 'top' ? 'top flange' : I.j_at === 'bot' ? 'bottom flange' : 'web'}: ${I.j_nb} × M${f1(+I.j_d)} per joist` : '',
      k === 'mb' && X.xs.length ? `SB-Int connections at the marked positions (${X.conn.sbi ? X.conn.sbi.typeName : 'see Connections tab'})` : '',
      'Elevation looking at the web; dashed lines = flat-web limits (t + r from the outer face)');
    return D;
  }

  // ---------- 6 connection detail (end of the supported C) ----------
  function connDwg(X, k) {
    const c = X.conn[k]; if (!c || !c.geo) return null;
    const geo = c.geo, { H, t, r, zs, ys, d0, dw, zp, hp, bp, gapTot } = geo, h = Math.max(2.5, Math.round(H / 22 * 2) / 2);
    const D = drawing('conn_' + k, `Connection ${NAMES[k]} → ${k === 'sbi' ? 'main beam' : 'column'}: ${c.typeName.split(' (')[0]}`, h);
    const Lshow = Math.max(...ys, ...(geo.adj || []).map(a => a.y), bp - gapTot) + Math.max(80, H * 0.3);
    // support face (left of x = −gapTot), C web panel from x = 0, y from the top of the C (0) downwards (−H)
    D.rect(-gapTot - Math.max(12, H * 0.06), -H - 20, -gapTot, 20, 'SUPPORT');
    D.rect(0, -H, Lshow, 0).line([0, -t - r], [Lshow, -t - r], 'HIDDEN').line([0, -H + t + r], [Lshow, -H + t + r], 'HIDDEN');
    if (geo.type !== 'endplate') D.rect(-gapTot, -zp - hp, -gapTot + bp, -zp, 'PLATE'); else D.rect(-Math.max(geo.tp, 1), -zp - hp, 0, -zp, 'PLATE');
    const bolts = ['fin', 'ucleat', 'angle'].includes(geo.type);
    if (bolts) for (const z of zs) for (const y of ys) D.circ([y, -z], d0 / 2).circ([y, -z], dw / 2, 'HIDDEN').cross([y, -z], dw * 0.7, 'CENTER');
    for (const a of (geo.adj || [])) { const s = slot([a.y, -a.z], a.d, a.lv); if (s) D.pl(s, true, 'HOLES'); else D.circ([a.y, -a.z], a.d / 2); }
    if (geo.type === 'fin' || geo.type === 'ucleat' || geo.type === 'welded') D.line([-gapTot, -zp], [-gapTot, -zp - hp], 'WELD');
    // dimensions
    const xr = Lshow;
    if (bolts) {
      D.chainY([-zs[zs.length - 1], ...zs.slice(0, -1).map(z => -z).reverse(), 0].sort((a, b) => a - b), xr, -1.8 * h);
      D.chainX([0, ...ys], -H, -1.8 * h);
    }
    D.dim([-gapTot, -zp - hp], [-gapTot, -zp], 2.4 * h, `hp ${f1(hp)}`).dim([-gapTot, 0], [-gapTot + bp, 0], 3.4 * h, `bp ${f1(bp)}`);
    if (gapTot > 0) D.dim([-gapTot, 0], [0, 0], 1.6 * h, `${f1(gapTot)}`);
    D.dim([xr, -H], [xr, 0], -(bolts ? 4.6 : 1.8) * h, `H ${f1(H)}`);
    const I = X.I, pre = { sbi: 'ci_', sbe: 'ce_', mb: 'cm_' }[k];
    D.notes.push(c.typeName, bolts ? `${zs.length * ys.length} × M${f1(geo.d)} ${I[pre + 'bg'] || ''} bolts, holes Ø${f1(d0)}, washer Ø${f1(dw)}`.replace('  ', ' ') : '',
      `Plate ${f1(bp)} × ${f1(hp)} × ${f1(geo.tp)} starting ${f1(zp)} below the top of the C`, gapTot > 0 ? `Stand-off from the support face ${f1(gapTot)} mm${geo.offMB ? ` (incl. main-beam flange ${f1(geo.offMB)})` : ''}` : '',
      'Elevation on the C web at the member end; dashed circles = washers; dashed lines = flat-web limits');
    return D;
  }

  // ---------- title block ----------
  function frame(D, meta) {
    const b = bbox(D), h = D.h, m = 2.5 * h, x0 = b.x0 - m, y1 = b.y1 + m;
    const notes = D.notes.filter(Boolean), lines = [D.title, ...notes, `${meta.proj}${meta.ref ? ' – ' + meta.ref : ''}`, `${meta.app} ${meta.ver} · generated ${meta.date} · units mm · drawn 1:1 in model space`, meta.status];
    const x1 = Math.max(b.x1 + m, x0 + 2 * h + Math.max(...lines.map((s, i) => s.length * (i === 0 ? 1.15 : 0.9) * h * 0.66)));
    const th = h * 1.6 * (lines.length + 0.6), y0 = b.y0 - m - th;
    D.rect(x0, y0, x1, y1, 'TITLE').line([x0, b.y0 - m], [x1, b.y0 - m], 'TITLE');
    lines.forEach((s, i) => D.text([x0 + h, b.y0 - m - h * 1.6 * (i + 1)], s, { h: i === 0 ? h * 1.15 : h * 0.9, L: 'TITLE' }));
    return D;
  }

  // ---------- all drawings ----------
  function build(res, meta = {}) {
    if (!res || res.fatal || !res.mods || !res.layout) return { error: 'No valid calculation: correct the inputs first (drawings are generated only from a complete analysis).', list: [] };
    const X = ctx(res), I = X.I;
    const st = X.status;
    const M = {
      proj: I.proj || 'Project', ref: I.ref || '', app: 'C-Section Beam System Designer', ver: meta.ver || (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''), date: meta.date || (typeof XCHK !== 'undefined' ? XCHK.localDate() : new Date().toISOString().slice(0, 10)),
      status: st === 'PASS' ? 'Design status from the calculation: PASS – check all dimensions and details before fabrication' : `Design status from the calculation: ${st} – NOT FOR FABRICATION until every check passes`
    };
    const list = [planDwg(X), elevationDwg(X, 'x'), elevationDwg(X, 'y'), sectionDwg(X, 'mb'), sectionDwg(X, 'sbi'), sectionDwg(X, 'sbe'), memberDwg(X, 'mb'), memberDwg(X, 'sbi'), memberDwg(X, 'sbe'), connDwg(X, 'mb'), connDwg(X, 'sbi'), connDwg(X, 'sbe'), columnDwg(X)].filter(Boolean);
    for (const D of list) frame(D, M);
    return { list, status: st, meta: M, schedule: scheduleRows(X) };
  }

  // ---------- DXF writer (R12 / AC1009) ----------
  // R12 text is single-byte: map the symbols used in the labels, drop anything else
  const asc = s => String(s).replace(/×/g, 'x').replace(/[–—−]/g, '-').replace(/²/g, '2').replace(/³/g, '3').replace(/⁴/g, '4').replace(/°/g, '%%d').replace(/[Ø⌀]/g, '%%c').replace(/±/g, '%%p').replace(/→/g, '->').replace(/·/g, '.').replace(/θ/g, 'theta').replace(/η/g, 'eta').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7e]/g, '?');
  const n = v => (Math.round(v * 1e4) / 1e4).toString();
  function dxf(drawings, opt = {}) {
    const list = Array.isArray(drawings) ? drawings : [drawings];
    // lay several drawings out in rows (no scaling – every drawing stays 1:1)
    const items = list.map(D => ({ D, b: bbox(D) }));
    if (list.length > 1) {
      const gap = Math.max(...items.map(i => i.D.h)) * 8, rowW = Math.max(...items.map(i => i.b.x1 - i.b.x0)) * 1.05;
      let x = 0, y = 0, rowH = 0;
      for (const it of items) {
        const w = it.b.x1 - it.b.x0, hh = it.b.y1 - it.b.y0;
        if (x > 0 && x + w > rowW) { x = 0; y -= rowH + gap; rowH = 0; }
        it.dx = x - it.b.x0; it.dy = y - it.b.y1; x += w + gap; rowH = Math.max(rowH, hh);
      }
    } else items.forEach(it => { it.dx = 0; it.dy = 0; });
    const out = [], g = (c, v) => out.push(String(c), String(v));
    const E = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const it of items) { E.x0 = Math.min(E.x0, it.b.x0 + it.dx); E.y0 = Math.min(E.y0, it.b.y0 + it.dy); E.x1 = Math.max(E.x1, it.b.x1 + it.dx); E.y1 = Math.max(E.y1, it.b.y1 + it.dy); }
    const hMed = items.map(i => i.D.h).sort((a, b) => a - b)[Math.floor(items.length / 2)] || 5;
    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, 'AC1009');
    g(9, '$INSBASE'); g(10, 0); g(20, 0); g(30, 0);
    g(9, '$EXTMIN'); g(10, n(E.x0)); g(20, n(E.y0)); g(30, 0);
    g(9, '$EXTMAX'); g(10, n(E.x1)); g(20, n(E.y1)); g(30, 0);
    g(9, '$LIMMIN'); g(10, n(E.x0)); g(20, n(E.y0));
    g(9, '$LIMMAX'); g(10, n(E.x1)); g(20, n(E.y1));
    g(9, '$LTSCALE'); g(40, n(Math.max(1, hMed / 2.5)));
    g(9, '$LUNITS'); g(70, 2); g(9, '$LUPREC'); g(70, 1);
    g(9, '$TEXTSIZE'); g(40, n(hMed));
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 3);
    const lt = (name, desc, pat) => { g(0, 'LTYPE'); g(2, name); g(70, 0); g(3, desc); g(72, 65); g(73, pat.length); g(40, n(pat.reduce((a, b) => a + Math.abs(b), 0))); for (const p of pat) g(49, n(p)); };
    lt('CONTINUOUS', 'Solid line', []); lt('DASHED', '__ __ __', [6, -3]); lt('CENTER', '____ _ ____', [16, -3, 3, -3]);
    g(0, 'ENDTAB');
    const used = Object.keys(LAYERS);
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, used.length + 1);
    g(0, 'LAYER'); g(2, '0'); g(70, 0); g(62, 7); g(6, 'CONTINUOUS');
    for (const L of used) { g(0, 'LAYER'); g(2, L); g(70, 0); g(62, LAYERS[L][0]); g(6, LAYERS[L][1]); }
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1);
    g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, n(hMed)); g(3, 'txt'); g(4, '');
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    for (const it of items) {
      const P = q => [q[0] + it.dx, q[1] + it.dy];
      for (const q of it.D.e) {
        if (q.t === 'line') { const a = P(q.a), b = P(q.b); g(0, 'LINE'); g(8, q.L); g(10, n(a[0])); g(20, n(a[1])); g(30, 0); g(11, n(b[0])); g(21, n(b[1])); g(31, 0); }
        else if (q.t === 'pl') { g(0, 'POLYLINE'); g(8, q.L); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, q.closed ? 1 : 0); for (const v of q.pts) { const a = P(v); g(0, 'VERTEX'); g(8, q.L); g(10, n(a[0])); g(20, n(a[1])); g(30, 0); } g(0, 'SEQEND'); g(8, q.L); }
        else if (q.t === 'circ') { const c = P(q.c); g(0, 'CIRCLE'); g(8, q.L); g(10, n(c[0])); g(20, n(c[1])); g(30, 0); g(40, n(q.r)); }
        else if (q.t === 'arc') { const c = P(q.c); g(0, 'ARC'); g(8, q.L); g(10, n(c[0])); g(20, n(c[1])); g(30, 0); g(40, n(q.r)); g(50, n(q.a0)); g(51, n(q.a1)); }
        else if (q.t === 'text') {
          const a = P(q.p); g(0, 'TEXT'); g(8, q.L); g(10, n(a[0])); g(20, n(a[1])); g(30, 0); g(40, n(q.h)); g(1, asc(q.s)); if (q.rot) g(50, n(q.rot));
          if (q.al !== 'l') { g(72, q.al === 'c' ? 1 : 2); g(11, n(a[0])); g(21, n(a[1])); g(31, 0); }
        }
      }
    }
    g(0, 'ENDSEC'); g(0, 'EOF');
    return out.join('\r\n') + '\r\n';
  }

  // ---------- SVG preview (theme colours from CSS classes dx-<LAYER>) ----------
  function svg(D, o = {}) {
    const b = bbox(D), pad = D.h * 2, W = b.x1 - b.x0 + 2 * pad, H = b.y1 - b.y0 + 2 * pad, x0 = b.x0 - pad, y0 = -(b.y1 + pad);
    const X = v => (+v).toFixed(2), Y = v => (-v).toFixed(2);
    const dash = { HIDDEN: `${D.h * 0.8} ${D.h * 0.4}`, BRACE: `${D.h * 0.8} ${D.h * 0.4}`, CENTER: `${D.h * 2} ${D.h * 0.4} ${D.h * 0.4} ${D.h * 0.4}`, GRID: `${D.h * 2} ${D.h * 0.4} ${D.h * 0.4} ${D.h * 0.4}` };
    const sd = L => dash[L] ? ` stroke-dasharray="${dash[L]}"` : '';
    let s = '';
    for (const q of D.e) {
      if (q.t === 'line') s += `<line class="dx-${q.L}"${sd(q.L)} x1="${X(q.a[0])}" y1="${Y(q.a[1])}" x2="${X(q.b[0])}" y2="${Y(q.b[1])}"/>`;
      else if (q.t === 'pl') s += `<${q.closed ? 'polygon' : 'polyline'} class="dx-${q.L}"${sd(q.L)} points="${q.pts.map(p => X(p[0]) + ',' + Y(p[1])).join(' ')}"/>`;
      else if (q.t === 'circ') s += `<circle class="dx-${q.L}"${sd(q.L)} cx="${X(q.c[0])}" cy="${Y(q.c[1])}" r="${X(q.r)}"/>`;
      else if (q.t === 'arc') { const p0 = [q.c[0] + q.r * Math.cos(q.a0 * deg), q.c[1] + q.r * Math.sin(q.a0 * deg)], p1 = [q.c[0] + q.r * Math.cos(q.a1 * deg), q.c[1] + q.r * Math.sin(q.a1 * deg)], large = ((q.a1 - q.a0 + 360) % 360) > 180 ? 1 : 0; s += `<path class="dx-${q.L}" d="M${X(p0[0])},${Y(p0[1])} A${X(q.r)},${X(q.r)} 0 ${large} 0 ${X(p1[0])},${Y(p1[1])}"/>`; }
      else if (q.t === 'text') s += `<text class="dxt dx-${q.L}" x="${X(q.p[0])}" y="${Y(q.p[1])}" font-size="${X(q.h)}" text-anchor="${q.al === 'c' ? 'middle' : q.al === 'r' ? 'end' : 'start'}"${q.rot ? ` transform="rotate(${X(-q.rot)} ${X(q.p[0])} ${Y(q.p[1])})"` : ''}>${U.esc(q.s)}</text>`;
    }
    return `<svg class="dxsvg" viewBox="${X(x0)} ${X(y0)} ${X(W)} ${X(H)}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${U.esc(D.title)}"${o.maxH ? ` style="max-height:${o.maxH}px"` : ''}>${s}</svg>`;
  }
  const fileName = (I, id) => `${String((I && (I.ref || I.proj)) || 'design').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'design'}_${id}.dxf`;
  return { build, dxf, svg, bbox, asc, designation, fileName, LAYERS };
})();

