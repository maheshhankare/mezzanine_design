// @ts-nocheck — ported verbatim from the mockup (index.html, 91_svg.js).
import { U } from './util';
import { UNITS } from './units';
import { SEC } from './section';
// ===== Sketches (SVG strings): dimensioned sections, hole layouts, connections, plan, beam diagrams, column, base plate, knee =====
// Drawing units are mm; each sketch scales its model to the view box. Colours come from CSS classes (light / dark themes).
export const SK: any = (() => {
  let uid = 0;
  const f1 = v => U.fmt(v, Math.abs(v) < 10 && v % 1 ? 1 : 0);
  // a view maps model (y right, z up) to screen
  function view(bb, W, H, pad = 34) {
    const sx = (W - 2 * pad) / Math.max(1e-9, bb.y1 - bb.y0), sz = (H - 2 * pad) / Math.max(1e-9, bb.z1 - bb.z0), s = Math.min(sx, sz);
    const ox = pad + ((W - 2 * pad) - s * (bb.y1 - bb.y0)) / 2 - s * bb.y0, oz = pad + ((H - 2 * pad) - s * (bb.z1 - bb.z0)) / 2 + s * bb.z1;
    return { s, X: y => ox + s * y, Y: z => oz - s * z, W, H };
  }
  // caption at the foot of a sketch, wrapped to the view width
  const cap = (W, H, t) => { const n = Math.max(20, Math.floor((W - 16) / 5.6)), words = String(t).split(' '), L = ['']; for (const w of words) { if ((L[L.length - 1] + ' ' + w).length > n) L.push(w); else L[L.length - 1] = (L[L.length - 1] + ' ' + w).trim(); } return L.map((l, i) => txt(8, H - 6 - (L.length - 1 - i) * 12, l, 'sk-cap', 'start')).join(''); };
  const wrap = (W, H, body, title, id) => `<svg class="sk" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${Math.round(W * 1.6)}px" role="img" aria-label="${U.esc(title || 'sketch')}" preserveAspectRatio="xMidYMid meet"><defs>` +
    `<marker id="ar${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" class="sk-arrowhead"/></marker></defs>${body}</svg>`;
  const poly = (v, pts, cls) => `<polygon class="${cls}" points="${pts.map(p => `${v.X(p[0]).toFixed(1)},${v.Y(p[1]).toFixed(1)}`).join(' ')}"/>`;
  const pline = (v, pts, cls) => `<polyline class="${cls}" fill="none" points="${pts.map(p => `${v.X(p[0]).toFixed(1)},${v.Y(p[1]).toFixed(1)}`).join(' ')}"/>`;
  const line = (v, a, b, cls) => `<line class="${cls}" x1="${v.X(a[0]).toFixed(1)}" y1="${v.Y(a[1]).toFixed(1)}" x2="${v.X(b[0]).toFixed(1)}" y2="${v.Y(b[1]).toFixed(1)}"/>`;
  const txt = (x, y, s, cls = 'sk-t', anchor = 'middle', rot = 0) => `<text class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}"${rot ? ` transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"` : ''}>${U.esc(s)}</text>`;
  // dimension between model points a and b, offset (screen px) perpendicular, label
  function dim(v, a, b, off, label, id) {
    const x1 = v.X(a[0]), y1 = v.Y(a[1]), x2 = v.X(b[0]), y2 = v.Y(b[1]);
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const p1 = [x1 + nx * off, y1 + ny * off], p2 = [x2 + nx * off, y2 + ny * off];
    const ext = (x, y, p) => `<line class="sk-ext" x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(p[0] + nx * Math.sign(off) * 3).toFixed(1)}" y2="${(p[1] + ny * Math.sign(off) * 3).toFixed(1)}"/>`;
    const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2, ang = Math.atan2(dy, dx) * 180 / Math.PI, rot = ang > 90 || ang < -90 ? ang + 180 : ang;
    const tx = mx + nx * Math.sign(off) * 9 * (Math.abs(rot) > 45 ? 1 : 1), ty = my + ny * Math.sign(off) * 9 + 3;
    return ext(x1, y1, p1) + ext(x2, y2, p2) + `<line class="sk-dim" x1="${p1[0].toFixed(1)}" y1="${p1[1].toFixed(1)}" x2="${p2[0].toFixed(1)}" y2="${p2[1].toFixed(1)}" marker-start="url(#ar${id})" marker-end="url(#ar${id})"/>` + txt(tx, ty, label, 'sk-dt', 'middle', Math.round(rot));
  }
  const parts = (p, arr, opt) => {
    const t = p.t, gap = Math.max(0, +(opt && opt.gap) || 0), s = +(opt && opt.pairSpacing) || 0, yw = gap / 2 + t / 2;
    const pl = arr === 'single' ? [[1, 0]] : arr === 'b2b' ? [[-1, -yw], [1, yw]] : [[-1, -s / 2 - yw], [1, -s / 2 + yw], [-1, s / 2 - yw], [1, s / 2 + yw]];
    const P = SEC.path(p, 6).P;
    return pl.map(([o, y0]) => P.map(q => [y0 + o * q[0], q[1]]));
  };
  // ---------- 1 dimensioned cross-section ----------
  function section(p, arr, opt, g, o = {}) {
    const id = ++uid, W = o.W || 360, H = o.H || 380, t = p.t;
    const ps = parts(p, arr, opt);
    let bb = { y0: Infinity, y1: -Infinity, z0: -t / 2, z1: p.H - t / 2 };
    for (const P of ps) for (const q of P) { bb.y0 = Math.min(bb.y0, q[0] - t / 2); bb.y1 = Math.max(bb.y1, q[0] + t / 2); }
    const bw = bb.y1 - bb.y0, ext = Math.max(bw, p.H * 0.45);
    bb = { y0: bb.y0 - (ext - bw) / 2 - 0.12 * ext, y1: bb.y1 + (ext - bw) / 2 + 0.18 * ext, z0: bb.z0 - (o.lp ? 0.16 : 0.06) * p.H, z1: bb.z1 + (o.lp ? 0.2 : 0.07) * p.H };
    const v = view(bb, W, H, 40);
    let s = ps.map(P => poly(v, SEC.outline(P, t), 'sk-steel')).join('');
    // connector marks at the top and bottom web junctions of each back-to-back pair
    if (arr !== 'single') { const pairsY = arr === 'b2b' ? [0] : [-(+opt.pairSpacing) / 2, (+opt.pairSpacing) / 2]; for (const y of pairsY) for (const z of [p.H - t - p.r - 3, p.r + 3]) s += `<circle class="sk-weld" cx="${v.X(y).toFixed(1)}" cy="${v.Y(z).toFixed(1)}" r="2.6"/>`; }
    // dimensions: H on the left of the whole arrangement, flanges / lips on the right-most C
    let yL = Infinity; for (const P of ps) for (const q of P) yL = Math.min(yL, q[0] - t / 2);
    const R = ps[ps.length - 1], yWeb = R[Math.floor(R.length / 2)][0], yOut = yWeb - t / 2, zTop = p.H - t / 2, zBot = -t / 2;
    const offH = g && isFinite(g.ysc) && g.ysc - 6 < yL ? (yL - g.ysc) * v.s + 30 : 20;
    s += dim(v, [yL, zTop], [yL, zBot], offH, `H = ${f1(p.H)}`, id);
    s += dim(v, [yOut, zTop], [yOut + p.Bt, zTop], o.lp ? -48 : -16, `Bt = ${f1(p.Bt)}`, id);
    s += dim(v, [yOut, zBot], [yOut + p.Bb, zBot], 16, `Bb = ${f1(p.Bb)}`, id);
    if (p.Ct > 0) s += dim(v, [yOut + p.Bt, zTop], [yOut + p.Bt, zTop - p.Ct], -14, `Ct = ${f1(p.Ct)}`, id);
    if (p.Cb > 0) s += dim(v, [yOut + p.Bb, zBot + p.Cb], [yOut + p.Bb, zBot], -14, `Cb = ${f1(p.Cb)}`, id);
    s += txt(v.X(yOut + Math.max(p.Bt, p.Bb)) + 26, v.Y(p.H / 2) - 6, `t = ${f1(t)}`, 'sk-dt', 'start') + txt(v.X(yOut + Math.max(p.Bt, p.Bb)) + 26, v.Y(p.H / 2) + 8, `r = ${f1(p.r)}`, 'sk-dt', 'start');
    if (arr === 'b2b' && +opt.gap > 0) s += txt(v.X(0), v.Y(p.H * 0.3), `gap ${f1(+opt.gap)}`, 'sk-dt');
    if (arr === 'quad') s += dim(v, [-(+opt.pairSpacing) / 2, p.H * 0.15], [(+opt.pairSpacing) / 2, p.H * 0.15], 0, `pairs @ ${f1(+opt.pairSpacing)}`, id);
    if (g) {
      const yc = g.yc, zc = g.zc;
      s += `<g class="sk-cg"><circle cx="${v.X(yc).toFixed(1)}" cy="${v.Y(zc).toFixed(1)}" r="4"/><line x1="${(v.X(yc) - 7).toFixed(1)}" y1="${v.Y(zc).toFixed(1)}" x2="${(v.X(yc) + 7).toFixed(1)}" y2="${v.Y(zc).toFixed(1)}"/><line x1="${v.X(yc).toFixed(1)}" y1="${(v.Y(zc) - 7).toFixed(1)}" x2="${v.X(yc).toFixed(1)}" y2="${(v.Y(zc) + 7).toFixed(1)}"/></g>` + txt(v.X(yc) + 9, v.Y(zc) - 6, 'G', 'sk-cgt', 'start');
      if (isFinite(g.ysc)) s += `<g class="sk-sc"><rect x="${(v.X(g.ysc) - 4).toFixed(1)}" y="${(v.Y(g.zsc) - 4).toFixed(1)}" width="8" height="8"/></g>` + txt(v.X(g.ysc) - 7, v.Y(g.zsc) + 4, 'SC', 'sk-sct', 'end');
    }
    if (o.lp && g) {
      // applied load line at the convention reference point, its eccentricity e to the shear centre and the resulting torque
      const lp = o.lp, yA = lp.y, zA = g.zsc + lp.z, x = v.X(yA), yTopScr = v.Y(zTop) - 34, yEnd = v.Y(zA);
      s += `<line class="sk-loadline" x1="${x.toFixed(1)}" y1="${(yTopScr - 6).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(yEnd - 5).toFixed(1)}" marker-end="url(#ar${id})"/><circle class="sk-lpt" cx="${x.toFixed(1)}" cy="${yEnd.toFixed(1)}" r="3"/>`;
      s += txt(x + 5, yTopScr - 2, `q (${lp.conv === 'cg' ? 'CG' : lp.conv === 'sc' ? 'SC' : lp.conv === 'flange' ? 'flange' : 'user'})`, 'sk-lt', 'start');
      if (Math.abs(lp.e) > 0.05) {
        const yS = v.Y(zTop) - 20, xs = v.X(g.ysc);
        s += `<line class="sk-ext" x1="${xs.toFixed(1)}" y1="${v.Y(g.zsc).toFixed(1)}" x2="${xs.toFixed(1)}" y2="${(yS - 3).toFixed(1)}"/>`;
        s += `<line class="sk-ecc" x1="${xs.toFixed(1)}" y1="${yS.toFixed(1)}" x2="${x.toFixed(1)}" y2="${yS.toFixed(1)}" marker-start="url(#ar${id})" marker-end="url(#ar${id})"/>` + txt(Math.min(xs, x) - 5, yS + 4, `e = ${f1(Math.abs(lp.e))}`, 'sk-et', 'end');
      }
      o.lpCap = (Math.abs(lp.e) > 0.05 ? `e = ${f1(Math.abs(lp.e))} mm${o.mT !== undefined ? ` → m_T = q·e = ${U.fmt(Math.abs(o.mT), 3)} kNm/m (ULS)` : ''}` : 'load line through the SC: e = 0, no torque') + `; CG − SC Δy ${f1(lp.dyc)}, Δz ${f1(lp.dzc)} mm. `;
    }
    s += cap(W, H, o.caption || ((o.lpCap || '') + (W < 340 ? 'G = CG, SC = shear centre, arrow = load line' : 'Outer H, B, C; G = centroid (CG), SC = shear centre' + (o.lp ? '; arrow = applied load line' : ''))));
    return wrap(W, H, s, 'Cross-section', id);
  }
  // ---------- 2 web elevation at the member end: bolt holes, adjustment holes, plate ----------
  function webHoles(geo, adj, o = {}) {
    const id = ++uid, W = o.W || 420, H = o.H || 380;
    const { H: D, t, r, zs, ys, d0, dw, zp, hp, bp, gapTot } = geo;
    const yEndC = 0; // C end at y = 0, member extends to +y; support face at y = −gapTot
    const yMax = Math.max(...ys, ...(adj && adj.holes ? adj.holes.map(h => h.y) : [0])) + 80;
    const bb = { y0: -gapTot - 30, y1: yMax, z0: -D - 40, z1: 45 };
    const v = view(bb, W, H, 38);
    let s = '';
    // support face
    s += `<rect class="sk-support" x="${v.X(-gapTot - 22).toFixed(1)}" y="${v.Y(20).toFixed(1)}" width="${(22 * v.s).toFixed(1)}" height="${((D + 40) * v.s).toFixed(1)}"/>`;
    // C web panel (elevation): flanges as bands
    s += `<rect class="sk-web" x="${v.X(yEndC).toFixed(1)}" y="${v.Y(0).toFixed(1)}" width="${((yMax - 10) * v.s).toFixed(1)}" height="${(D * v.s).toFixed(1)}"/>`;
    s += `<rect class="sk-flange" x="${v.X(yEndC).toFixed(1)}" y="${v.Y(0).toFixed(1)}" width="${((yMax - 10) * v.s).toFixed(1)}" height="${((t + r) * v.s).toFixed(1)}"/>`;
    s += `<rect class="sk-flange" x="${v.X(yEndC).toFixed(1)}" y="${v.Y(-D + t + r).toFixed(1)}" width="${((yMax - 10) * v.s).toFixed(1)}" height="${((t + r) * v.s).toFixed(1)}"/>`;
    // plate / cleat
    if (hp > 0 && geo.type !== 'welded' || geo.type === 'welded') s += `<rect class="sk-plate" x="${v.X(-gapTot).toFixed(1)}" y="${v.Y(-zp).toFixed(1)}" width="${(bp * v.s).toFixed(1)}" height="${(hp * v.s).toFixed(1)}"/>`;
    // bolt holes
    for (const z of zs) for (const y of ys) s += `<circle class="sk-hole" cx="${v.X(y).toFixed(1)}" cy="${v.Y(-z).toFixed(1)}" r="${(d0 / 2 * v.s).toFixed(1)}"/><circle class="sk-washer" cx="${v.X(y).toFixed(1)}" cy="${v.Y(-z).toFixed(1)}" r="${(dw / 2 * v.s).toFixed(1)}"/>`;
    // adjustment holes
    if (adj && adj.holes) for (const h of adj.holes) {
      const w = h.d * v.s, hh = h.lv * v.s;
      s += `<rect class="sk-adj" x="${(v.X(h.y) - w / 2).toFixed(1)}" y="${(v.Y(-h.z) - hh / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${hh.toFixed(1)}" rx="${(w / 2).toFixed(1)}"/>`;
    }
    // dimensions: z1, p1, plate, es, p2, gap
    if (zs.length) {
      s += dim(v, [ys[ys.length - 1] + 30, 0], [ys[ys.length - 1] + 30, -zs[0]], -14, `z1 ${f1(zs[0])}`, id);
      if (zs.length > 1) s += dim(v, [ys[ys.length - 1] + 30, -zs[0]], [ys[ys.length - 1] + 30, -zs[1]], -14, `p1 ${f1(zs[1] - zs[0])}`, id);
      s += dim(v, [0, -zs[zs.length - 1]], [ys[0], -zs[zs.length - 1]], -22, `es ${f1(ys[0])}`, id);
      if (ys.length > 1) s += dim(v, [ys[0], -zs[zs.length - 1]], [ys[1], -zs[zs.length - 1]], -22, `p2 ${f1(ys[1] - ys[0])}`, id);
    }
    s += dim(v, [-gapTot, -zp], [-gapTot, -zp - hp], 14, `hp ${f1(hp)}`, id);
    s += dim(v, [-gapTot, 0], [-gapTot + bp, 0], -28, `bp ${f1(bp)}`, id);
    if (gapTot > 0) s += dim(v, [-gapTot, 0], [0, 0], -12, `gap ${f1(gapTot)}`, id);
    s += cap(W, H, o.caption || 'Elevation of the C web at the member end: bolt holes (d₀, washer), adjustment holes, plate / cleat');
    return wrap(W, H, s, 'Hole layout', id);
  }
  // ---------- 3 connection plan (schematic) ----------
  function connPlan(geo, x = {}) {
    const id = ++uid, W = 420, H = 230, { tp, bp, gapTot, t, B, type, nWebs, sup } = geo;
    const webs = nWebs >= 2 ? 2 : 1, gW = webs === 2 ? Math.max(2 * tp, 0) : 0;
    const bb = { y0: -40 - (sup === 'mb' ? B : 0), y1: bp + 140, z0: -80, z1: 80 };
    const v = view(bb, W, H, 26);
    let s = '';
    // support
    if (sup === 'col') s += `<rect class="sk-support" x="${v.X(-40).toFixed(1)}" y="${v.Y(70).toFixed(1)}" width="${(40 * v.s).toFixed(1)}" height="${(140 * v.s).toFixed(1)}"/>` + txt(v.X(-20), v.Y(-74), 'column face', 'sk-dt');
    else {
      // main-beam webs (back-to-back) with flanges to the flange tips
      const yW = -B - 6;
      s += `<rect class="sk-support" x="${v.X(-B - 6 - 10).toFixed(1)}" y="${v.Y(70).toFixed(1)}" width="${(10 * v.s).toFixed(1)}" height="${(140 * v.s).toFixed(1)}"/>`;
      s += line(v, [yW, 60], [-6, 60], 'sk-line') + line(v, [yW, -60], [-6, -60], 'sk-line') + txt(v.X(-B / 2), v.Y(66), 'main-beam flange', 'sk-dt');
    }
    // plate(s) / cleat legs
    const plates = type === 'ucleat' ? [tp / 2 + t + 1, -(tp / 2 + t + 1)] : type === 'endplate' ? [] : [tp / 2 + t / 2];
    for (const zc of plates) s += `<rect class="sk-plate" x="${v.X(-gapTot + (sup === 'mb' ? B : 0) * 0).toFixed(1)}" y="${v.Y(zc + tp / 2).toFixed(1)}" width="${(bp * v.s).toFixed(1)}" height="${(tp * v.s).toFixed(1)}"/>`;
    if (type === 'endplate') s += `<rect class="sk-plate" x="${v.X(-tp - 0).toFixed(1)}" y="${v.Y(60).toFixed(1)}" width="${(tp * v.s).toFixed(1)}" height="${(120 * v.s).toFixed(1)}"/>`;
    if (type === 'angle') s += `<rect class="sk-plate" x="${v.X(-gapTot).toFixed(1)}" y="${v.Y(tp / 2 + t / 2 + tp).toFixed(1)}" width="${(tp * v.s).toFixed(1)}" height="${(50 * v.s).toFixed(1)}"/>`;
    // C web(s) and flanges in plan
    const webZ = type === 'ucleat' ? [0] : [0];
    for (const z of webZ) {
      s += `<rect class="sk-steel" x="${v.X(0).toFixed(1)}" y="${v.Y(z + t / 2).toFixed(1)}" width="${((bp + 120) * v.s).toFixed(1)}" height="${Math.max(1.5, t * v.s).toFixed(1)}"/>`;
      s += `<rect class="sk-steelfaint" x="${v.X(0).toFixed(1)}" y="${v.Y(z - t / 2).toFixed(1)}" width="${((bp + 120) * v.s).toFixed(1)}" height="${(B * v.s).toFixed(1)}"/>`;
    }
    // bolt axes
    for (const y of geo.ys) s += line(v, [y, 40], [y, -40], 'sk-bolt');
    // welds
    if (type === 'fin' || type === 'ucleat' || type === 'welded') for (const zc of plates) s += `<path class="sk-weldp" d="M${v.X(-gapTot).toFixed(1)},${v.Y(zc + tp / 2).toFixed(1)} l6,-6 l0,6 z"/><path class="sk-weldp" d="M${v.X(-gapTot).toFixed(1)},${v.Y(zc - tp / 2).toFixed(1)} l6,6 l0,-6 z"/>`;
    s += dim(v, [-gapTot, -50], [geo.yg + (gapTot - gapTot), -50], 10, `e = ${f1(x.e || geo.e)}`, id);
    s += cap(W, H, 'Plan (schematic): support, plate / cleat, C web, bolt lines; e = support line to the bolt-group centroid');
    return wrap(W, H, s, 'Connection plan', id);
  }
  // ---------- 4 floor plan ----------
  function plan(I, layout, M) {
    const id = ++uid, W = 640, H = 420, nb = +I.nb, nm = +I.nm, Lmb = +I.Lmb, Lsb = +I.Lsb;
    const Lx = nb * Lmb, Ly = nm * Lsb;
    const v = view({ y0: -0.08 * Lx, y1: 1.08 * Lx, z0: -0.1 * Ly, z1: 1.1 * Ly }, W, H, 34);
    let s = '';
    // main-beam lines along x at each module line
    for (let j = 0; j <= nm; j++) s += line(v, [0, j * Lsb], [Lx, j * Lsb], 'sk-mb');
    // SB-End at the column lines, SB-Int at xs
    for (let i = 0; i <= nb; i++) for (let j = 0; j < nm; j++) s += line(v, [i * Lmb, j * Lsb], [i * Lmb, (j + 1) * Lsb], 'sk-sbe');
    for (let i = 0; i < nb; i++) for (const x of layout.xs) for (let j = 0; j < nm; j++) s += line(v, [i * Lmb + x, j * Lsb], [i * Lmb + x, (j + 1) * Lsb], 'sk-sbi');
    // joists
    const nJ = +I.j_n;
    if (nJ > 0 && (I.sbi_rst === 'joist' || I.sbi_rst === 'both' || I.sbe_rst === 'joist' || I.sbe_rst === 'both')) {
      const a = Math.min(+I.j_aL, Lsb / 2), SJ = nJ > 1 ? (Lsb - 2 * a) / (nJ - 1) : 0;
      for (let j = 0; j < nm; j++) for (let k = 0; k < nJ; k++) { const y = j * Lsb + (nJ > 1 ? a + k * SJ : Lsb / 2); s += line(v, [0, y], [Lx, y], 'sk-joist'); }
    }
    // plan bracing in bay 1 of every module
    if (I.br_use === 'yes') for (let j = 0; j < nm; j++) for (let b = 0; b < Math.min(nb, +I.br_nbay || 1); b++) s += line(v, [b * Lmb, j * Lsb], [(b + 1) * Lmb, (j + 1) * Lsb], 'sk-brace') + line(v, [(b + 1) * Lmb, j * Lsb], [b * Lmb, (j + 1) * Lsb], 'sk-brace');
    // columns
    for (let i = 0; i <= nb; i++) for (let j = 0; j <= nm; j++) s += `<rect class="sk-col" x="${(v.X(i * Lmb) - 5).toFixed(1)}" y="${(v.Y(j * Lsb) - 5).toFixed(1)}" width="10" height="10"/>`;
    // dimensions
    s += dim(v, [0, 0], [Lmb, 0], 18, `Lmb ${f1(Lmb)}`, id) + dim(v, [Lx, 0], [Lx, Lsb], -16, `Lsb ${f1(Lsb)}`, id);
    if (layout.xs.length) s += dim(v, [0, Ly], [layout.xs[0], Ly], -14, f1(layout.xs[0]), id);
    // legend
    const lg = [['sk-mb', 'Main beam'], ['sk-sbi', 'SB-Int'], ['sk-sbe', 'SB-End'], ['sk-joist', 'Joist'], ['sk-brace', 'Plan bracing']];
    s += lg.map(([c, l], k) => `<line class="${c}" x1="${12 + k * 118}" y1="14" x2="${40 + k * 118}" y2="14"/>` + txt(44 + k * 118, 18, l, 'sk-dt', 'start')).join('');
    s += cap(W, H, `${nb} bays × ${nm} modules, ${(nb + 1) * (nm + 1)} columns (■). Main beams run along the bays, secondaries span between main-beam lines.`);
    return wrap(W, H, s, 'Arrangement plan', id);
  }
  // ---------- 5 beam elevation, restraints, SFD, BMD, deflection ----------
  function beam(d, o = {}) {
    if (!d || d.error || !d.spec) return '';
    const id = ++uid, W = 640, spec = d.spec, L = spec.L, rowH = 92, H = 120 + 3 * rowH + 30;
    const X = x => 40 + (W - 80) * x / L;
    let s = '';
    const yb = 70;
    s += `<line class="sk-beam" x1="${X(0)}" y1="${yb}" x2="${X(L)}" y2="${yb}"/>`;
    for (const x of spec.supports) s += `<path class="sk-supp" d="M${X(x).toFixed(1)},${yb + 2} l-8,12 l16,0 z"/>`;
    // knee braces (engine model: elastic supports; unified app: members of the frame): drawn from below the support to the knee point
    const kneeX = spec.knees ? spec.knees.map(k => k.x) : d.uls && d.uls[0] && d.uls[0].ga && d.uls[0].kneeX ? d.uls[0].kneeX : [];
    for (const x of kneeX) { const xs = spec.supports.reduce((b, q) => Math.abs(q - x) < Math.abs(b - x) ? q : b, spec.supports[0]); s += `<line class="sk-kbl" x1="${X(xs).toFixed(1)}" y1="${yb + 26}" x2="${X(x).toFixed(1)}" y2="${yb + 2}"><title>knee brace at ${f1(x)} mm</title></line>`; }
    // loads
    const G = spec.G, Q = spec.Q;
    if ((G.udl[0] && G.udl[0].w) || (Q.udl[0] && Q.udl[0].w)) { for (let k = 0; k <= 20; k++) s += `<line class="sk-load" x1="${X(L * k / 20).toFixed(1)}" y1="${yb - 22}" x2="${X(L * k / 20).toFixed(1)}" y2="${yb - 4}" marker-end="url(#ar${id})"/>`; s += `<line class="sk-load" x1="${X(0)}" y1="${yb - 22}" x2="${X(L)}" y2="${yb - 22}"/>`; }
    for (const p of (Q.points || [])) s += `<line class="sk-loadp" x1="${X(p.x).toFixed(1)}" y1="${yb - 48}" x2="${X(p.x).toFixed(1)}" y2="${yb - 3}" marker-end="url(#ar${id})"/>`;
    // restraints: credited (solid) / not credited (open)
    const rs = [...(spec.restr.lat || []), ...(spec.restr.tor || [])];
    for (const r of rs) s += `<circle class="${r.credited ? 'sk-rok' : 'sk-rno'}" cx="${X(r.x).toFixed(1)}" cy="${yb}" r="5"><title>${U.esc(r.label + ': ' + (r.credited ? 'credited' : 'not credited') + ' – ' + r.why)}</title></circle>`;
    for (const r of (spec.restr.latC || []).concat(spec.restr.torC || [])) s += `<line class="${r.credited ? 'sk-rcok' : 'sk-rcno'}" x1="${X(r.x0)}" y1="${yb - 8}" x2="${X(r.x1)}" y2="${yb - 8}"><title>${U.esc(r.label + ': ' + (r.credited ? 'credited' : 'not credited'))}</title></line>`;
    s += txt(40, 16, `${spec.title}: L = ${f1(L)} mm. ● credited restraint, ○ not credited, ─ continuous (green credited / grey not)`, 'sk-dt', 'start');
    // diagrams
    const diag = (row, arrs, key, scaleUnit, label, cls) => {
      const y0 = 120 + row * rowH + rowH / 2;
      let mx = 1e-9; for (const a of arrs) for (const q of a.S) mx = Math.max(mx, Math.abs(q[key]));
      const sc = (rowH / 2 - 10) / mx, sg = key === 'v' ? 1 : -1;
      let g = `<line class="sk-axis" x1="${X(0)}" y1="${y0}" x2="${X(L)}" y2="${y0}"/>`;
      for (const a of arrs) g += `<polyline class="${cls}" fill="none" points="${a.S.map(q => `${X(q.x).toFixed(1)},${(y0 + sg * q[key] * sc * (key === 'v' ? 1 : 1)).toFixed(1)}`).join(' ')}"/>`;
      // extreme values
      const all = arrs.flatMap(a => a.S), qmax = all.reduce((b, q) => q[key] > b[key] ? q : b, all[0]), qmin = all.reduce((b, q) => q[key] < b[key] ? q : b, all[0]);
      const un = label[1], cat = label[2], show = x => UNITS.show(x * scaleUnit, un, cat, 2, U.fmt).txt;
      const lab = q => txt(X(q.x), y0 + sg * q[key] * sc + (sg * q[key] > 0 ? 12 : -4), show(q[key]), 'sk-dt');
      if (Math.abs(qmax[key]) > 1e-9 * mx) g += lab(qmax); if (Math.abs(qmin[key]) > 1e-3 * mx && qmin !== qmax) g += lab(qmin);
      // values at the knee points (moment): the local hogging the knee braces cause
      if (key === 'M') for (const x of kneeX) { const a = arrs[0], q = a.S.reduce((b, r) => Math.abs(r.x - x) < Math.abs(b.x - x) ? r : b, a.S[0]); if (q !== qmax && q !== qmin && Math.abs(q[key]) > 0.05 * mx) g += lab(q); }
      g += txt(8, y0 - rowH / 2 + 12, label[0].replace('{u}', UNITS.label(un, cat)), 'sk-dt', 'start');
      return g;
    };
    const src = d.uls && d.uls[0] && d.uls[0].ga ? 'global frame analysis' : kneeX.length ? 'knee braces as elastic supports' : '';
    s += diag(0, d.uls, 'V', 1e-3, [`Shear V_Ed [{u}] (ULS patterns${src ? '; ' + src : ''})`, 'kN', 'V'], 'sk-sfd');
    s += diag(1, d.uls, 'M', 1e-6, [`Moment M_Ed [{u}] (ULS patterns, sagging down${src ? '; ' + src : ''})`, 'kN·m', 'M'], 'sk-bmd');
    s += diag(2, [d.sls], 'v', 1, ['Deflection [{u}] (characteristic G + Q, gross section)', 'mm', 'd'], 'sk-defl');
    return wrap(W, H, s, 'Beam elevation and diagrams', id);
  }
  // ---------- 6 box column section ----------
  function column(I, pr) {
    const id = ++uid, W = 300, H = 300, b = +I.col_b, h = +I.col_h, tb = +I.col_tb, th = +I.col_th;
    const v = view({ y0: -0.75 * b, y1: 0.75 * b, z0: -0.75 * h, z1: 0.75 * h }, W, H, 30);
    let s = '';
    if (I.col_type === 'weld') {
      s += poly(v, [[-b / 2, h / 2], [b / 2, h / 2], [b / 2, h / 2 - tb], [-b / 2, h / 2 - tb]], 'sk-steel') + poly(v, [[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, -h / 2 + tb], [-b / 2, -h / 2 + tb]], 'sk-steel');
      s += poly(v, [[-b / 2, h / 2 - tb], [-b / 2 + th, h / 2 - tb], [-b / 2 + th, -h / 2 + tb], [-b / 2, -h / 2 + tb]], 'sk-steel') + poly(v, [[b / 2, h / 2 - tb], [b / 2 - th, h / 2 - tb], [b / 2 - th, -h / 2 + tb], [b / 2, -h / 2 + tb]], 'sk-steel');
    } else {
      const ro = +I.col_ro > 0 ? +I.col_ro : 2 * tb, ri = Math.max(0, ro - tb);
      s += `<rect class="sk-steel" x="${v.X(-b / 2)}" y="${v.Y(h / 2)}" width="${b * v.s}" height="${h * v.s}" rx="${ro * v.s}"/><rect class="sk-bg" x="${v.X(-b / 2 + th)}" y="${v.Y(h / 2 - tb)}" width="${(b - 2 * th) * v.s}" height="${(h - 2 * tb) * v.s}" rx="${ri * v.s}"/>`;
    }
    s += dim(v, [-b / 2, h / 2], [b / 2, h / 2], -14, `b ${f1(b)}`, id) + dim(v, [b / 2, h / 2], [b / 2, -h / 2], -14, `h ${f1(h)}`, id);
    s += txt(v.X(0), v.Y(h / 2 - tb) + 14, `t ${f1(tb)}`, 'sk-dt') + txt(v.X(-b / 2 + th) + 4, v.Y(0), `t ${f1(th)}`, 'sk-dt', 'start');
    s += txt(v.X(0), v.Y(-h / 2) + 26, 'main beam → b-face, SB-End → h-face', 'sk-cap');
    return wrap(W, H, s, 'Box column', id);
  }
  // ---------- 7 base plate ----------
  function basePlate(I) {
    const id = ++uid, W = 300, H = 300, a = +I.bp_a, b = +I.bp_b, cb = +I.col_b, ch = +I.col_h, n = +I.bp_nA, dA = +I.bp_dA;
    const v = view({ y0: -0.7 * b, y1: 0.7 * b, z0: -0.7 * a, z1: 0.7 * a }, W, H, 30);
    let s = `<rect class="sk-plate" x="${v.X(-b / 2)}" y="${v.Y(a / 2)}" width="${b * v.s}" height="${a * v.s}"/><rect class="sk-steelfaint" x="${v.X(-cb / 2)}" y="${v.Y(ch / 2)}" width="${cb * v.s}" height="${ch * v.s}"/>`;
    const ex = Math.max(dA * 2, (b - cb) / 4 + 0), pos = n >= 4 ? [[-1, -1], [1, -1], [1, 1], [-1, 1]] : n === 2 ? [[-1, 0], [1, 0]] : [];
    for (const [i, j] of pos) s += `<circle class="sk-hole" cx="${v.X(i * (b / 2 - ex))}" cy="${v.Y(j * (a / 2 - ex))}" r="${dA / 2 * v.s + 1}"/>`;
    s += dim(v, [-b / 2, a / 2], [b / 2, a / 2], -14, `${f1(b)}`, id) + dim(v, [b / 2, a / 2], [b / 2, -a / 2], -14, `${f1(a)}`, id);
    s += txt(v.X(0), v.Y(-a / 2) + 22, `${n} × M${f1(dA)} anchors, t = ${f1(+I.bp_t)} mm (schematic positions)`, 'sk-cap');
    return wrap(W, H, s, 'Base plate', id);
  }
  // ---------- 8 knee brace elevation ----------
  function knee(I, kn) {
    const id = ++uid, W = 320, H = 260, hc = 1000, a = +I.k_a, th = +I.k_th * Math.PI / 180, dv = a * Math.tan(th);
    const v = view({ y0: -200, y1: a + 400, z0: -dv - 300, z1: 120 }, W, H, 24);
    let s = `<rect class="sk-steel" x="${v.X(-75)}" y="${v.Y(100)}" width="${75 * v.s}" height="${(dv + 400) * v.s}"/>`;
    s += `<rect class="sk-steelfaint" x="${v.X(0)}" y="${v.Y(0)}" width="${(a + 380) * v.s}" height="${60 * v.s}"/>`;
    s += line(v, [0, -dv - 60], [a, -60], 'sk-kb');
    s += dim(v, [0, -60], [a, -60], 12, `a ${f1(a)}`, id);
    s += txt(v.X(a * 0.25) + 12, v.Y(-60 - dv * 0.6), `θ ${f1(+I.k_th)}°`, 'sk-dt', 'start');
    s += txt(v.X(a / 2), v.Y(30), I.k_to === 'mb' ? 'main beam' : I.k_to === 'both' ? 'main beam / SB-End' : 'SB-End', 'sk-dt');
    s += cap(W, H, 'Knee brace: column face to the beam soffit');
    return wrap(W, H, s, 'Knee brace', id);
  }
  // ---------- 9 joist / restraint layout along a secondary (optimisation proposal) ----------
  function joists(L, rows, o = {}) {
    const id = ++uid, W = 640, H = 70 + rows.length * 46, X = x => 40 + (W - 80) * x / L;
    let s = txt(8, 14, `Secondary span L = ${f1(L)} mm · ● joist credited as lateral restraint, ○ not credited · shaded = end-connection zone (${f1(o.zone || 0)} mm)`, 'sk-dt', 'start');
    rows.forEach((r, i) => {
      const y = 46 + i * 46;
      s += txt(8, y - 12, r.label, 'sk-dt', 'start');
      if (o.zone) s += `<rect class="sk-zone" x="${X(0)}" y="${y - 7}" width="${(X(o.zone) - X(0)).toFixed(1)}" height="14"/><rect class="sk-zone" x="${X(L - o.zone).toFixed(1)}" y="${y - 7}" width="${(X(L) - X(L - o.zone)).toFixed(1)}" height="14"/>`;
      s += `<line class="sk-beam" x1="${X(0)}" y1="${y}" x2="${X(L)}" y2="${y}"/>` + `<path class="sk-supp" d="M${X(0)},${y + 2} l-7,10 l14,0 z"/><path class="sk-supp" d="M${X(L)},${y + 2} l-7,10 l14,0 z"/>`;
      const P = r.positions || [];
      for (const x of P) s += `<circle class="${r.credited ? 'sk-rok' : 'sk-rno'}" cx="${X(x).toFixed(1)}" cy="${y}" r="5"><title>${U.esc(f1(x) + ' mm')}</title></circle>`;
      const pts = [0, ...P, L]; let mx = 0, at = 0; for (let k = 1; k < pts.length; k++) if (pts[k] - pts[k - 1] > mx) { mx = pts[k] - pts[k - 1]; at = k; }
      if (P.length) s += txt((X(pts[at - 1]) + X(pts[at])) / 2, y + 20, `max. unbraced ${f1(mx)} mm`, 'sk-cap');
      else s += txt(X(L / 2), y + 20, 'no joists: fork supports only', 'sk-cap');
    });
    return wrap(W, H, s, 'Joist layout', id);
  }
  // ---------- small utilisation bar ----------
  const bar = eta => { if (eta === null || eta === undefined || !isFinite(eta)) return ''; const w = Math.min(100, Math.max(0, eta * 100)); return `<span class="bar"><span class="${eta > 1 ? 'b-fail' : eta > 0.9 ? 'b-warn' : 'b-ok'}" style="width:${w.toFixed(0)}%"></span></span>`; };
  return { section, webHoles, connPlan, plan, beam, column, basePlate, knee, joists, bar };
})();

