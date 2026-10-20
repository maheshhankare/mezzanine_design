// @ts-nocheck — ported verbatim from the mockup (index.html, 00_util.js); logic unchanged so results match the mockup.
// ===== C-section beam system designer: numerical utilities =====
// Units used throughout the engine: N, mm, N/mm² (MPa). Moments N·mm. Display layer converts to kN, kN·m.
export const U: any = (() => {
  const isNum = v => typeof v === 'number' && isFinite(v);
  const num = (v, d) => { const x = typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v)) : Number(v); return isFinite(x) ? x : d; };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sum = a => a.reduce((s, x) => s + x, 0);
  const range = (n, f) => Array.from({ length: n }, (_, i) => f ? f(i) : i);
  const r2 = (x, d = 2) => isNum(x) ? Number(x.toFixed(d)) : x;
  // 6-point Gauss–Legendre on [0,1]
  const GX = [-0.932469514203152, -0.6612093864662645, -0.2386191860831969, 0.2386191860831969, 0.6612093864662645, 0.932469514203152];
  const GW = [0.1713244923791704, 0.3607615730481386, 0.467913934572691, 0.467913934572691, 0.3607615730481386, 0.1713244923791704];
  const gauss01 = GX.map((x, i) => [(x + 1) / 2, GW[i] / 2]);

  // dense matrix helpers (row-major Float64Array n×n)
  const zeros = n => new Float64Array(n * n);
  // symmetric positive definite solve via Cholesky; returns null if not SPD
  function cholesky(K, n) {
    const L = new Float64Array(n * n);
    // skyline: first non-zero column of each row of K (the factor keeps this profile)
    const f = new Int32Array(n); for (let i = 0; i < n; i++) { let k = 0; while (k < i && K[i * n + k] === 0) k++; f[i] = k; }
    for (let j = 0; j < n; j++) {
      let s = K[j * n + j];
      for (let k = f[j]; k < j; k++) s -= L[j * n + k] * L[j * n + k];
      if (!(s > 0)) return null;
      const d = Math.sqrt(s); L[j * n + j] = d;
      for (let i = j + 1; i < n; i++) {
        if (f[i] > j) continue;
        let v = K[i * n + j];
        for (let k = Math.max(f[i], f[j]); k < j; k++) v -= L[i * n + k] * L[j * n + k];
        L[i * n + j] = v / d;
      }
    }
    return L;
  }
  function cholSolve(L, n, b) {
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) { let v = b[i]; for (let k = 0; k < i; k++) v -= L[i * n + k] * y[k]; y[i] = v / L[i * n + i]; }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) { let v = y[i]; for (let k = i + 1; k < n; k++) v -= L[k * n + i] * x[k]; x[i] = v / L[i * n + i]; }
    return x;
  }
  // general solve with partial pivoting (for small systems)
  function gaussSolve(A0, n, b0) {
    const A = Float64Array.from(A0), b = Float64Array.from(b0);
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r * n + c]) > Math.abs(A[p * n + c])) p = r;
      if (Math.abs(A[p * n + c]) < 1e-300) return null;
      if (p !== c) { for (let k = 0; k < n; k++) { const t = A[c * n + k]; A[c * n + k] = A[p * n + k]; A[p * n + k] = t; } const t = b[c]; b[c] = b[p]; b[p] = t; }
      for (let r = c + 1; r < n; r++) { const f = A[r * n + c] / A[c * n + c]; if (f === 0) continue; for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k]; b[r] -= f * b[c]; }
    }
    const x = new Float64Array(n);
    for (let r = n - 1; r >= 0; r--) { let v = b[r]; for (let k = r + 1; k < n; k++) v -= A[r * n + k] * x[k]; x[r] = v / A[r * n + r]; }
    return x;
  }
  // largest algebraic eigenvalue mu of  G x = mu K x  (K SPD, G symmetric).
  // Cholesky K = L L', C = L^-1 G L^-T, Householder tridiagonalisation, Sturm-sequence bisection.
  // The smallest positive buckling factor of K x = lambda G x is 1/mu (mu > 0).
  function maxMu(K, G, n) {
    const L = cholesky(K, n); if (!L) return NaN;
    // first non-zero column of each row of L (K is banded for the FE models, so the triangular solves skip the zeros)
    const f0 = new Int32Array(n); for (let i = 0; i < n; i++) { let k = 0; while (k < i && L[i * n + k] === 0) k++; f0[i] = k; }
    const X = new Float64Array(n * n); // X = L^-1 G
    for (let c = 0; c < n; c++) for (let i = 0; i < n; i++) { let v = G[i * n + c]; for (let k = f0[i]; k < i; k++) v -= L[i * n + k] * X[k * n + c]; X[i * n + c] = v / L[i * n + i]; }
    const A = new Float64Array(n * n); // A = L^-1 X'  = L^-1 G L^-T (symmetric)
    for (let c = 0; c < n; c++) for (let i = 0; i < n; i++) { let v = X[c * n + i]; for (let k = f0[i]; k < i; k++) v -= L[i * n + k] * A[k * n + c]; A[i * n + c] = v / L[i * n + i]; }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const v = (A[i * n + j] + A[j * n + i]) / 2; A[i * n + j] = A[j * n + i] = v; }
    return maxEigSym(A, n);
  }
  function maxEigSym(A, n) {
    if (n === 1) return A[0];
    const d = new Float64Array(n), e = new Float64Array(n), v = new Float64Array(n), p = new Float64Array(n);
    for (let k = 0; k < n - 2; k++) {
      let al = 0; for (let i = k + 1; i < n; i++) al += A[i * n + k] ** 2; al = Math.sqrt(al);
      if (al < 1e-300) { e[k] = 0; continue; }
      const x0 = A[(k + 1) * n + k], sgn = x0 >= 0 ? -1 : 1; al *= sgn; e[k] = al;
      v.fill(0); v[k + 1] = x0 - al; for (let i = k + 2; i < n; i++) v[i] = A[i * n + k];
      let vn = 0; for (let i = k + 1; i < n; i++) vn += v[i] * v[i]; if (vn < 1e-300) continue;
      for (let i = k + 1; i < n; i++) { let s = 0; for (let j = k + 1; j < n; j++) s += A[i * n + j] * v[j]; p[i] = 2 * s / vn; }
      let K2 = 0; for (let i = k + 1; i < n; i++) K2 += v[i] * p[i]; K2 /= vn;
      for (let i = k + 1; i < n; i++) p[i] -= K2 * v[i];
      for (let i = k + 1; i < n; i++) for (let j = k + 1; j <= i; j++) { const val = A[i * n + j] - v[i] * p[j] - p[i] * v[j]; A[i * n + j] = A[j * n + i] = val; }
    }
    for (let i = 0; i < n; i++) d[i] = A[i * n + i];
    e[n - 2] = A[(n - 1) * n + n - 2];
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) { const r = (i > 0 ? Math.abs(e[i - 1]) : 0) + (i < n - 1 ? Math.abs(e[i]) : 0); lo = Math.min(lo, d[i] - r); hi = Math.max(hi, d[i] + r); }
    const count = x => { let c = 0, q = d[0] - x; if (q < 0) c++; for (let i = 1; i < n; i++) { q = d[i] - x - e[i - 1] ** 2 / (q === 0 ? 1e-300 : q); if (q < 0) c++; } return c; };
    for (let it = 0; it < 200 && hi - lo > 1e-13 * Math.max(1e-30, Math.abs(hi)); it++) { const m = (lo + hi) / 2; if (count(m) >= n) hi = m; else lo = m; }
    return (lo + hi) / 2;
  }
  // linear interpolation on sorted xs
  function interp(x, xs, ys) {
    if (x <= xs[0]) return ys[0];
    for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + (x - xs[i - 1]) * (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1]);
    return ys[ys.length - 1];
  }
  const fmt = (x, d = 2) => {
    if (x === null || x === undefined || x === '') return '–';
    if (typeof x !== 'number') return String(x);
    if (!isFinite(x)) return x > 0 ? '∞' : '–';
    const a = Math.abs(x);
    if (a !== 0 && (a >= 1e7 || a < Math.pow(10, -d) / 2)) return x.toExponential(2);
    return x.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return { isNum, num, clamp, sum, range, r2, gauss01, zeros, cholesky, cholSolve, gaussSolve, maxMu, maxEigSym, interp, fmt, esc };
})();

