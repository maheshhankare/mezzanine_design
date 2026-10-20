// @ts-nocheck — ported verbatim from the mockup (index.html, 10_section.js); logic unchanged so results match the mockup.
// ===== C-section geometry, thin-walled properties, built-up assembly =====
// Geometry convention (all inputs are OUTER dimensions): H overall depth, Bt / Bb overall top / bottom flange widths,
// Ct / Cb overall lip lengths (outer face of the flange to the lip tip), t core thickness (no coating), r internal bend radius.
// Centre-line model: web centre-line at y = 0, bottom flange centre-line at z = 0; flanges point to +y (orientation +1).
// Centre-line lengths: h = H − t (web), b = B − t (flange), c = C − t/2 (lip); corner centre-line radius r_m = r + t/2.
export const SEC = (() => {
  const RHO = 7850e-9; // kg/mm³

  function validate(p) {
    const e = [];
    const pos = (k, nm) => { if (!(p[k] > 0)) e.push(`${nm} must be a positive number`); };
    pos('H', 'Depth H'); pos('Bt', 'Top flange width B_t'); pos('Bb', 'Bottom flange width B_b'); pos('t', 'Thickness t');
    if (!(p.r >= 0)) e.push('Internal bend radius r must be ≥ 0');
    if (!(p.Ct >= 0) || !(p.Cb >= 0)) e.push('Lip lengths must be ≥ 0');
    if (e.length) return e;
    const rm = p.r + p.t / 2;
    if (p.H - p.t < 2 * rm + 1e-6) e.push('H is too small for two bends: H − t must exceed 2(r + t/2)');
    for (const [B, nm] of [[p.Bt, 'top'], [p.Bb, 'bottom']]) {
      const C = nm === 'top' ? p.Ct : p.Cb;
      const need = C > 0 ? 2 * rm : rm;
      if (B - p.t < need + 1e-6) e.push(`The ${nm} flange is too narrow for its bends: B − t must exceed ${C > 0 ? '2' : '1'}(r + t/2)`);
      if (C > 0 && C - p.t / 2 < rm + 1e-6) e.push(`The ${nm} lip is shorter than its bend: C − t/2 must exceed r + t/2 (or enter C = 0 for no lip)`);
      if (C > 0 && C > p.H / 2) e.push(`The ${nm} lip is longer than half the depth`);
    }
    if (p.t > 12) e.push('t > 12 mm is outside the scope of a cold-formed section');
    return e;
  }

  // centre-line path from the top lip tip to the bottom lip tip with corner arcs (nArc segments per 90° bend)
  function path(p, nArc = 4) {
    const t = p.t, h = p.H - t, bt = p.Bt - t, bb = p.Bb - t, ct = p.Ct > 0 ? p.Ct - t / 2 : 0, cb = p.Cb > 0 ? p.Cb - t / 2 : 0, rm = p.r + t / 2;
    const P = [], tag = []; // tag[i] = plate element the segment from P[i] to P[i+1] belongs to
    const push = (pt, tg) => { if (P.length) tag.push(tg); P.push(pt); };
    const arc = (cy, cz, a0, a1, tg) => { for (let k = 1; k <= nArc; k++) { const a = a0 + (a1 - a0) * k / nArc; push([cy + rm * Math.cos(a), cz + rm * Math.sin(a)], tg); } };
    const D = Math.PI / 180;
    if (ct > 0) { P.push([bt, h - ct]); push([bt, h - rm], 'lipT'); if (rm > 0) arc(bt - rm, h - rm, 0, 90 * D, 'bendLT'); }
    else P.push([bt, h]);
    push([rm, h], 'flT'); if (rm > 0) arc(rm, h - rm, 90 * D, 180 * D, 'bendFT');
    // web split at mid-height so built-up links can attach there
    push([0, h / 2], 'web'); push([0, rm], 'web');
    if (rm > 0) arc(rm, rm, 180 * D, 270 * D, 'bendFB');
    push([cb > 0 ? bb - rm : bb, 0], 'flB');
    if (cb > 0) { if (rm > 0) arc(bb - rm, rm, 270 * D, 360 * D, 'bendLB'); push([bb, cb], 'lipB'); }
    return { P, tag, h, bt, bb, ct, cb, rm };
  }

  // generic open thin-walled section from nodes + elements (tree; zero-thickness links allowed for connectivity)
  function thinWalled(nodes, elems) {
    let A = 0, Sy = 0, Sz = 0, Iyy0 = 0, Izz0 = 0, Iyz0 = 0, It = 0;
    for (const e of elems) {
      const a = nodes[e.i], b = nodes[e.j], L = Math.hypot(b[0] - a[0], b[1] - a[1]), dA = e.t * L;
      A += dA; Sy += dA * (a[0] + b[0]) / 2; Sz += dA * (a[1] + b[1]) / 2;
      Izz0 += dA * (a[0] ** 2 + a[0] * b[0] + b[0] ** 2) / 3; Iyy0 += dA * (a[1] ** 2 + a[1] * b[1] + b[1] ** 2) / 3;
      Iyz0 += dA * (2 * a[0] * a[1] + a[0] * b[1] + b[0] * a[1] + 2 * b[0] * b[1]) / 6;
      It += L * e.t ** 3 / 3;
    }
    const yc = Sy / A, zc = Sz / A;
    const Iyy = Iyy0 - A * zc * zc, Izz = Izz0 - A * yc * yc, Iyz = Iyz0 - A * yc * zc;
    const Q = nodes.map(p => [p[0] - yc, p[1] - zc]);
    // sectorial coordinate about the centroid by tree traversal
    const adj = nodes.map(() => []);
    elems.forEach((e, k) => { adj[e.i].push(k); adj[e.j].push(k); });
    const w = new Float64Array(nodes.length).fill(NaN); w[0] = 0;
    const stack = [0], used = new Uint8Array(elems.length);
    while (stack.length) {
      const i = stack.pop();
      for (const k of adj[i]) {
        if (used[k]) continue; const e = elems[k], j = e.i === i ? e.j : e.i;
        if (!isNaN(w[j])) { used[k] = 1; continue; }
        used[k] = 1; w[j] = w[i] + Q[i][0] * Q[j][1] - Q[j][0] * Q[i][1]; stack.push(j);
      }
    }
    for (let i = 0; i < w.length; i++) if (isNaN(w[i])) w[i] = 0;
    let Iwy = 0, Iwz = 0;
    for (const e of elems) {
      const a = Q[e.i], b = Q[e.j], wa = w[e.i], wb = w[e.j], dA = e.t * Math.hypot(b[0] - a[0], b[1] - a[1]);
      Iwy += dA * (2 * a[0] * wa + a[0] * wb + b[0] * wa + 2 * b[0] * wb) / 6;
      Iwz += dA * (2 * a[1] * wa + a[1] * wb + b[1] * wa + 2 * b[1] * wb) / 6;
    }
    const D = Iyy * Izz - Iyz * Iyz;
    const dy = (Izz * Iwz - Iyz * Iwy) / D, dz = (Iyz * Iwz - Iyy * Iwy) / D;
    const ws = Array.from(w, (wi, i) => wi - dy * Q[i][1] + dz * Q[i][0]);
    let wm = 0; for (const e of elems) wm += e.t * Math.hypot(Q[e.j][0] - Q[e.i][0], Q[e.j][1] - Q[e.i][1]) * (ws[e.i] + ws[e.j]) / 2; wm /= A;
    const wn = ws.map(x => x - wm);
    let Iw = 0;
    for (const e of elems) { const L = Math.hypot(Q[e.j][0] - Q[e.i][0], Q[e.j][1] - Q[e.i][1]), wa = wn[e.i], wb = wn[e.j]; Iw += e.t * L * (wa * wa + wa * wb + wb * wb) / 3; }
    const alpha = 0.5 * Math.atan2(-2 * Iyz, Iyy - Izz); // principal angle from y
    const Im = (Iyy + Izz) / 2, Ir = Math.hypot((Iyy - Izz) / 2, Iyz);
    return { A, yc, zc, Iyy, Izz, Iyz, I1: Im + Ir, I2: Im - Ir, alpha, It, Iw, ysc: yc + dy, zsc: zc + dz, wn, nodes };
  }

  function singleModel(p, nArc = 4) {
    const g = path(p, nArc), nodes = g.P.map(q => q.slice()), elems = [];
    for (let i = 0; i < nodes.length - 1; i++) elems.push({ i, j: i + 1, t: p.t, tag: g.tag[i] });
    return { nodes, elems, g };
  }
  // place a single C: mirror (flanges to −y when o = −1) and offset the web centre-line to y0
  function placed(p, o, y0, z0 = 0, nArc = 4) {
    const m = singleModel(p, nArc);
    return { nodes: m.nodes.map(q => [y0 + o * q[0], z0 + q[1]]), elems: m.elems.map(e => Object.assign({}, e)), g: m.g, o, y0 };
  }
  function merge(parts, links) {
    const nodes = [], elems = [], off = [];
    for (const pt of parts) { off.push(nodes.length); for (const n of pt.nodes) nodes.push(n); for (const e of pt.elems) elems.push({ i: e.i + off[off.length - 1], j: e.j + off[off.length - 1], t: e.t, tag: e.tag, part: off.length - 1 }); }
    for (const [pa, na, pb, nb] of links) elems.push({ i: off[pa] + na, j: off[pb] + nb, t: 0, tag: 'link' });
    return { nodes, elems };
  }
  const midWebNode = m => m.g.P.findIndex(q => Math.abs(q[0]) < 1e-9 && Math.abs(q[1] - m.g.h / 2) < 1e-9);

  // arrangement: 'single' | 'b2b' (two C back-to-back, gap g between web outer faces) | 'quad' (two b2b pairs, pair centre-lines s apart)
  function assembly(p, arr, opt = {}) {
    const t = p.t, gap = Math.max(0, opt.gap || 0), s = opt.pairSpacing || 0;
    const yw = gap / 2 + t / 2; // web centre-line offset from the assembly mid-plane
    if (arr === 'single') { const m = placed(p, 1, 0); return { parts: [m], ...merge([m], []) }; }
    const pair = y => { const L = placed(p, -1, y - yw), R = placed(p, 1, y + yw); return [L, R]; };
    if (arr === 'b2b') { const [L, R] = pair(0); const mw = midWebNode(L); return { parts: [L, R], ...merge([L, R], [[0, mw, 1, mw]]) }; }
    if (arr === 'quad') {
      const [L1, R1] = pair(-s / 2), [L2, R2] = pair(s / 2), mw = midWebNode(L1);
      return { parts: [L1, R1, L2, R2], pairLinks: [[0, mw, 1, mw], [2, mw, 3, mw]], ...merge([L1, R1, L2, R2], [[0, mw, 1, mw], [2, mw, 3, mw]]) };
    }
    throw new Error('unknown arrangement ' + arr);
  }

  // outer fibre extents of the assembly (centre-line ± t/2)
  function extents(asm, t) {
    let y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const n of asm.nodes) { y0 = Math.min(y0, n[0] - t / 2); y1 = Math.max(y1, n[0] + t / 2); z0 = Math.min(z0, n[1] - t / 2); z1 = Math.max(z1, n[1] + t / 2); }
    return { y0, y1, z0, z1 };
  }

  // gross properties of the arrangement (centre-line with rounded corners)
  // quad: Iw is taken as the sum of the two pairs (no warping composite action between pairs); Izz composite only if credited
  function gross(p, arr, opt = {}) {
    const asm = assembly(p, arr, opt);
    let pr = thinWalled(asm.nodes, asm.elems);
    const ex = extents(asm, p.t);
    const out = Object.assign({}, pr);
    if (arr === 'quad') {
      const one = gross(p, 'b2b', opt);
      out.Iw = 2 * one.Iw; out.IzzNonComposite = 2 * one.Izz; out.pair = one;
      if (opt.composite === false) out.Izz = out.IzzNonComposite;
    }
    const zt = ex.z1 - out.zc, zb = out.zc - ex.z0, yl = out.yc - ex.y0, yr = ex.y1 - out.yc;
    Object.assign(out, {
      arr, asm, ex, n: asm.parts.length,
      Wy_top: out.Iyy / zt, Wy_bot: out.Iyy / zb, Wy: out.Iyy / Math.max(zt, zb),
      Wz: out.Izz / Math.max(yl, yr), Wz_web: out.Izz / yl, Wz_toe: out.Izz / yr,
      iy: Math.sqrt(out.Iyy / out.A), iz: Math.sqrt(out.Izz / out.A),
      mass: out.A * RHO * 1000, // kg/m
      ysc_rel_web: arr === 'single' ? out.ysc : 0, // shear centre position from the web centre-line (negative = behind the web)
      zt, zb, yl, yr
    });
    // plastic modulus about y (horizontal axis) by bisection of the equal-area axis (used for the box column comparisons and information)
    out.Wpl_y = plasticModulus(asm, p.t, 'z');
    return out;
  }
  function plasticModulus(asm, t, dir) {
    // thin strips: elements discretised into 20 pieces; equal-area axis then first moments
    const pts = [];
    for (const e of asm.elems) { if (e.t <= 0) continue; const a = asm.nodes[e.i], b = asm.nodes[e.j], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let k = 0; k < 20; k++) { const f = (k + 0.5) / 20; pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, e.t * L / 20]); } }
    const c = dir === 'z' ? 1 : 0; const tot = pts.reduce((s, q) => s + q[2], 0);
    let lo = Math.min(...pts.map(q => q[c])), hi = Math.max(...pts.map(q => q[c]));
    for (let it = 0; it < 60; it++) { const m = (lo + hi) / 2; const a = pts.reduce((s, q) => s + (q[c] < m ? q[2] : 0), 0); if (a < tot / 2) lo = m; else hi = m; }
    const m = (lo + hi) / 2; return pts.reduce((s, q) => s + q[2] * Math.abs(q[c] - m), 0);
  }

  // sharp-corner notional widths (EN 1993-1-3 5.1(3), Fig. 5.1) and the rounded-corner factor delta (5.1(4))
  function notional(p) {
    const t = p.t, bp_t = p.Bt - t, bp_b = p.Bb - t, hp = p.H - t, cp_t = p.Ct > 0 ? p.Ct - t / 2 : 0, cp_b = p.Cb > 0 ? p.Cb - t / 2 : 0;
    const nb = 2 + (p.Ct > 0 ? 1 : 0) + (p.Cb > 0 ? 1 : 0);
    const sumBp = hp + bp_t + bp_b + cp_t + cp_b;
    const delta = 0.43 * nb * p.r * 90 / 90 / sumBp;
    const minBp = Math.min(bp_t, bp_b, hp, ...(p.Ct > 0 ? [cp_t] : []), ...(p.Cb > 0 ? [cp_b] : []));
    const neglect = p.r <= 5 * t && p.r <= 0.10 * minBp;
    return { bp_t, bp_b, hp, cp_t, cp_b, delta, neglect, nbends: nb, minBp };
  }

  // drawing outline: polygon of the solid (centre-line offset by ±t/2)
  function outline(nodesPath, t) {
    const n = nodesPath.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = nodesPath[Math.max(0, i - 1)], b = nodesPath[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const nx = -dz, nz = dx;
      L.push([nodesPath[i][0] + nx * t / 2, nodesPath[i][1] + nz * t / 2]); R.push([nodesPath[i][0] - nx * t / 2, nodesPath[i][1] - nz * t / 2]);
    }
    return L.concat(R.reverse());
  }

  return { validate, path, thinWalled, singleModel, placed, assembly, gross, notional, outline, extents, RHO };
})();

