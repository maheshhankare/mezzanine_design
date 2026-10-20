// @ts-nocheck — ported verbatim from the mockup (index.html, 25_fsm.js); logic unchanged so results match the mockup.
import { U } from './util';
// ===== Finite-strip method (semi-analytical, simply supported ends, one half-wave; CUFSM formulation) =====
// Used for (a) the AISI S100-16 Direct Strength Method (local and distortional elastic buckling), (b) a cross-check of the EN 1993-1-3
// distortional σcr,s. Single C, sharp-corner centre-line model, signature curve over the half-wavelength; minima picked automatically.
export const FSM = (() => {
  const G6x = [-0.932469514203152, -0.6612093864662645, -0.2386191860831969, 0.2386191860831969, 0.6612093864662645, 0.932469514203152];
  const G6w = [0.1713244923791704, 0.3607615730481386, 0.467913934572691, 0.467913934572691, 0.3607615730481386, 0.1713244923791704];
  function stripK(b, t, a, s1, s2, E, NU) {
    const k = Math.PI / a, dm = t * E / (1 - NU * NU), db = E * t ** 3 / (12 * (1 - NU * NU));
    const K = new Float64Array(64), Kg = new Float64Array(64);
    const Bm = [new Float64Array(8), new Float64Array(8), new Float64Array(8)], Bb = [new Float64Array(8), new Float64Array(8), new Float64Array(8)];
    const gu = new Float64Array(8), gv = new Float64Array(8), gw = new Float64Array(8);
    for (let q = 0; q < 6; q++) {
      const xi = (G6x[q] + 1) / 2, J = b / 2 * G6w[q] * a / 2;
      const N = [1 - xi, xi], dN = [-1 / b, 1 / b];
      const H = [1 - 3 * xi ** 2 + 2 * xi ** 3, b * (xi - 2 * xi ** 2 + xi ** 3), 3 * xi ** 2 - 2 * xi ** 3, b * (-(xi ** 2) + xi ** 3)];
      const dH = [(-6 * xi + 6 * xi ** 2) / b, (1 - 4 * xi + 3 * xi ** 2), (6 * xi - 6 * xi ** 2) / b, (-2 * xi + 3 * xi ** 2)];
      const ddH = [(-6 + 12 * xi) / b ** 2, (-4 + 6 * xi) / b, (6 - 12 * xi) / b ** 2, (-2 + 6 * xi) / b];
      const sig = s1 * (1 - xi) + s2 * xi;
      for (const r of Bm) r.fill(0); for (const r of Bb) r.fill(0); gu.fill(0); gv.fill(0); gw.fill(0);
      const iu = [0, 4], iv = [1, 5], iw = [2, 3, 6, 7];
      for (let j = 0; j < 2; j++) { Bm[0][iu[j]] = dN[j]; Bm[1][iv[j]] = -k * N[j]; Bm[2][iu[j]] = k * N[j]; Bm[2][iv[j]] = dN[j]; gu[iu[j]] = k * N[j]; gv[iv[j]] = -k * N[j]; }
      for (let j = 0; j < 4; j++) { Bb[0][iw[j]] = -ddH[j]; Bb[1][iw[j]] = k * k * H[j]; Bb[2][iw[j]] = 2 * k * dH[j]; gw[iw[j]] = k * H[j]; }
      const sh = (1 - NU) / 2;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const m = dm * (Bm[0][r] * (Bm[0][c] + NU * Bm[1][c]) + Bm[1][r] * (NU * Bm[0][c] + Bm[1][c]) + sh * Bm[2][r] * Bm[2][c]);
        const bb = db * (Bb[0][r] * (Bb[0][c] + NU * Bb[1][c]) + Bb[1][r] * (NU * Bb[0][c] + Bb[1][c]) + sh * Bb[2][r] * Bb[2][c]);
        K[r * 8 + c] += (m + bb) * J;
        Kg[r * 8 + c] += sig * t * (gu[r] * gu[c] + gv[r] * gv[c] + gw[r] * gw[c]) * J;
      }
    }
    return [K, Kg];
  }
  function factor(pts, t, stress, a, E, NU) {
    const np = pts.length, n = 4 * np, K = new Float64Array(n * n), Kg = new Float64Array(n * n);
    for (let i = 0; i < np - 1; i++) {
      const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], b = Math.hypot(dx, dz), c = dx / b, s = dz / b;
      const [kl, kgl] = stripK(b, t, a, stress[i], stress[i + 1], E, NU);
      const T = new Float64Array(64);
      for (const o of [0, 4]) { T[o * 8 + o] = c; T[o * 8 + o + 2] = s; T[(o + 1) * 8 + o + 1] = 1; T[(o + 2) * 8 + o] = -s; T[(o + 2) * 8 + o + 2] = c; T[(o + 3) * 8 + o + 3] = 1; }
      for (const [src, dst] of [[kl, K], [kgl, Kg]]) {
        const TK = new Float64Array(64);
        for (let r = 0; r < 8; r++) for (let q = 0; q < 8; q++) { let v = 0; for (let m = 0; m < 8; m++) v += src[r * 8 + m] * T[m * 8 + q]; TK[r * 8 + q] = v; }
        for (let r = 0; r < 8; r++) for (let q = 0; q < 8; q++) { let v = 0; for (let m = 0; m < 8; m++) v += T[m * 8 + r] * TK[m * 8 + q]; dst[(4 * i + r) * n + 4 * i + q] += v; }
      }
    }
    const mu = U.maxMu(K, Kg, n);
    return mu > 0 ? 1 / mu : Infinity;
  }
  // sharp-corner centre-line of a single C (lip tip top → lip tip bottom), discretised
  function points(p) {
    const t = p.t, h = p.H - t, bt = p.Bt - t, bb = p.Bb - t, ct = p.Ct > 0 ? p.Ct - t / 2 : 0, cb = p.Cb > 0 ? p.Cb - t / 2 : 0;
    const corners = [], div = [];
    if (ct > 0) { corners.push([bt, h - ct]); div.push(2); }
    corners.push([bt, h]); div.push(4); corners.push([0, h]); div.push(10); corners.push([0, 0]); div.push(4); corners.push([bb, 0]);
    if (cb > 0) { div.push(2); corners.push([bb, cb]); }
    const pts = [corners[0]];
    for (let i = 0; i < corners.length - 1; i++) { const a = corners[i], b = corners[i + 1]; for (let k = 1; k <= div[i]; k++) pts.push([a[0] + (b[0] - a[0]) * k / div[i], a[1] + (b[1] - a[1]) * k / div[i]]); }
    return pts;
  }
  // signature curve; mode 'My' (top compression), 'N'. Returns {curve:[[a, factor]], local, dist, ref}
  const cache = new Map();
  function signature(p, mode, E = 210000, NU = 0.3, fy = 350) {
    const key = JSON.stringify([p.H, p.Bt, p.Bb, p.Ct, p.Cb, p.t, mode, E, NU, fy]);
    if (cache.has(key)) return cache.get(key);
    const res = signature0(p, mode, E, NU, fy); if (cache.size > 200) cache.clear(); cache.set(key, res); return res;
  }
  function signature0(p, mode, E, NU, fy) {
    const pts = points(p), t = p.t;
    // properties of the sharp model (for the reference load)
    let A = 0, Sz = 0, I0 = 0; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); A += t * L; Sz += t * L * (a[1] + b[1]) / 2; I0 += t * L * (a[1] ** 2 + a[1] * b[1] + b[1] ** 2) / 3; }
    const zc = Sz / A, I = I0 - A * zc * zc, zext = (p.H - t) + t / 2 - zc;
    let stress, ref;
    if (mode === 'N') { stress = pts.map(() => fy); ref = { P: fy * A }; }
    else { stress = pts.map(q => fy * (q[1] - zc) / zext); ref = { M: fy * I / zext }; } // first yield at the outer fibre
    const H = p.H, lens = [];
    for (let a = 0.25 * Math.min(p.Bt, p.Bb, H); a <= 10 * H; a *= 1.16) lens.push(a);
    const curve = lens.map(a => [a, factor(pts, t, stress, a, E, NU)]);
    // minima
    const mins = [];
    for (let i = 1; i < curve.length - 1; i++) if (curve[i][1] <= curve[i - 1][1] && curve[i][1] <= curve[i + 1][1]) mins.push(curve[i]);
    let local = null, dist = null, note = '';
    if (mins.length >= 2) { local = mins[0]; dist = mins[1]; }
    else if (mins.length === 1) {
      // single minimum: classify by half-wavelength relative to the largest plate width
      const bmax = Math.max(H, p.Bt, p.Bb);
      if (mins[0][0] < 1.2 * bmax) { local = mins[0]; note = 'no distinct distortional minimum'; } else { dist = mins[0]; note = 'no distinct local minimum'; }
    }
    return { curve, local, dist, ref, note, pts };
  }
  return { signature, points, factor };
})();

