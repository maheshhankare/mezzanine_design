// @ts-nocheck — ported verbatim from the mockup (index.html, 30_fe.js); logic unchanged so results match the mockup.
import { U } from './util';
// ===== Structural analysis: in-plane beam FE and thin-walled (Vlasov) lateral–torsional FE =====
// In-plane: Euler–Bernoulli elements, DOF [v (down), θ]; exact internal forces inside elements (Hermite + fixed-end particular solution).
// Out-of-plane: open thin-walled beam elements, DOF per node [v (lateral, at the shear centre), v', φ (twist), φ'];
//   stiffness EIz (v''), EIw (φ''), GIt (φ'); discrete / continuous lateral springs at a height a above the shear centre and torsional springs;
//   geometric stiffness from the major-axis moment M(x) (term ∫ M v'' φ dx) and the load height (−½ Σ P a φ²).
//   Elastic critical moment = λ_cr × M(x): smallest positive eigenvalue of K d = λ G d (validated in the test log against closed forms).
export const FE = (() => {
  const G6 = U.gauss01;
  function herm(L, x) {
    const s = x;
    return {
      N: [1 - 3 * s * s + 2 * s ** 3, L * (s - 2 * s * s + s ** 3), 3 * s * s - 2 * s ** 3, L * (-s * s + s ** 3)],
      d1: [(-6 * s + 6 * s * s) / L, 1 - 4 * s + 3 * s * s, (6 * s - 6 * s * s) / L, -2 * s + 3 * s * s],
      d2: [(-6 + 12 * s) / L ** 2, (-4 + 6 * s) / L, (6 - 12 * s) / L ** 2, (-2 + 6 * s) / L],
      d3: [12 / L ** 3, 6 / L ** 2, -12 / L ** 3, 6 / L ** 2]
    };
  }
  // mesh: sorted unique positions including key points, max element length hmax
  function mesh(x0, x1, keys, hmax) {
    let pts = [x0, x1, ...keys.filter(k => k > x0 + 1e-6 && k < x1 - 1e-6)];
    pts = Array.from(new Set(pts.map(p => Math.round(p * 1e6) / 1e6))).sort((a, b) => a - b);
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) { const L = pts[i] - pts[i - 1], n = Math.max(1, Math.ceil(L / hmax)); for (let k = 1; k <= n; k++) out.push(pts[i - 1] + L * k / n); }
    return out;
  }
  const near = (xs, x) => { let b = 0; for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[b] - x)) b = i; return b; };

  // ---------- in-plane beam ----------
  // m = {L (total length), EI, supports:[{x, v:true|false|kv, r:false|true|kr}], springs:[{x, k}] (elastic vertical supports in the span,
  //      e.g. knee braces; reaction R = k·v in springR), points:[{x,P}], udl:[{x0,x1,w}], nEl}
  function beam(m) {
    const keys = [...m.supports.map(s => s.x), ...(m.springs || []).map(s => s.x), ...(m.points || []).map(p => p.x), ...(m.udl || []).flatMap(u => [u.x0, u.x1])];
    const xs = mesh(0, m.L, keys, m.L / (m.nEl || 60));
    const nn = xs.length, n = 2 * nn, K = new Float64Array(n * n), F = new Float64Array(n), EI = m.EI;
    const elq = []; // uniform load per element (N/mm)
    for (let e = 0; e < nn - 1; e++) {
      const a = xs[e], b = xs[e + 1], L = b - a, mid = (a + b) / 2;
      let q = 0; for (const u of (m.udl || [])) if (mid >= u.x0 - 1e-9 && mid <= u.x1 + 1e-9) q += u.w;
      elq.push(q);
      const k = EI / L ** 3, ke = [12, 6 * L, -12, 6 * L, 6 * L, 4 * L * L, -6 * L, 2 * L * L, -12, -6 * L, 12, -6 * L, 6 * L, 2 * L * L, -6 * L, 4 * L * L];
      const d = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[d[i] * n + d[j]] += k * ke[i * 4 + j];
      const fe = [q * L / 2, q * L * L / 12, q * L / 2, -q * L * L / 12];
      for (let i = 0; i < 4; i++) F[d[i]] += fe[i];
    }
    for (const p of (m.points || [])) F[2 * near(xs, p.x)] += p.P;
    const fixed = new Uint8Array(n), Kfull = Float64Array.from(K);
    const supNodes = [];
    for (const s of m.supports) {
      const i = near(xs, s.x); supNodes.push(i);
      if (s.v === true) fixed[2 * i] = 1; else if (typeof s.v === 'number') K[2 * i * n + 2 * i] += s.v;
      if (s.r === true) fixed[2 * i + 1] = 1; else if (typeof s.r === 'number' && s.r > 0) K[(2 * i + 1) * n + 2 * i + 1] += s.r;
    }
    // elastic vertical supports inside the span (knee braces): k in N/mm, reaction k·v (upward for a downward deflection)
    const sprNodes = (m.springs || []).map(sp => { const i = near(xs, sp.x); K[2 * i * n + 2 * i] += sp.k; return i; });
    const free = []; for (let i = 0; i < n; i++) if (!fixed[i]) free.push(i);
    const nf = free.length, Kr = new Float64Array(nf * nf), Fr = new Float64Array(nf);
    for (let a = 0; a < nf; a++) { Fr[a] = F[free[a]]; for (let b = 0; b < nf; b++) Kr[a * nf + b] = K[free[a] * n + free[b]]; }
    const Lc = U.cholesky(Kr, nf); if (!Lc) return { error: 'The beam model is a mechanism (check the supports).' };
    const ur = U.cholSolve(Lc, nf, Fr), u = new Float64Array(n); free.forEach((g, a) => { u[g] = ur[a]; });
    // reactions: R = K_with_springs u − F at support DOFs (positive = upward reaction for a downward load)
    const Ku = new Float64Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += Kfull[i * n + j] * u[j]; Ku[i] = s; }
    const reactions = m.supports.map((s, k) => { const i = supNodes[k]; return { x: s.x, R: F[2 * i] - Ku[2 * i], Mr: -(Ku[2 * i + 1] - F[2 * i + 1]) }; });
    // sample internal forces
    const S = []; // {x, V, M, v}
    for (let e = 0; e < nn - 1; e++) {
      const a = xs[e], L = xs[e + 1] - a, q = elq[e], ue = [u[2 * e], u[2 * e + 1], u[2 * e + 2], u[2 * e + 3]];
      const ns = 4;
      for (let k = 0; k <= ns; k++) {
        if (k === 0 && e > 0) { /* keep both sides of a node for jumps */ }
        const s = k / ns, H = herm(L, s);
        let v = 0, d2 = 0, d3 = 0; for (let i = 0; i < 4; i++) { v += H.N[i] * ue[i]; d2 += H.d2[i] * ue[i]; d3 += H.d3[i] * ue[i]; }
        const vp = q * L ** 4 / (24 * EI) * s * s * (1 - s) ** 2, d2p = q * L * L / (24 * EI) * (2 - 12 * s + 12 * s * s), d3p = q * L / (24 * EI) * (-12 + 24 * s);
        S.push({ x: a + s * L, v: v + vp, M: -EI * (d2 + d2p), V: -EI * (d3 + d3p) });
      }
    }
    const Mmax = Math.max(...S.map(s => s.M)), Mmin = Math.min(...S.map(s => s.M)), Vabs = Math.max(...S.map(s => Math.abs(s.V))), vmax = Math.max(...S.map(s => s.v));
    const Mat = x => { // moment at x (binary search in the samples, linear interpolation)
      let lo = 0, hi = S.length - 1; if (x <= S[0].x) return S[0].M; if (x >= S[hi].x) return S[hi].M;
      while (hi - lo > 1) { const md = (lo + hi) >> 1; if (S[md].x <= x) lo = md; else hi = md; }
      const a = S[lo], b = S[hi]; return b.x - a.x < 1e-9 ? a.M : a.M + (b.M - a.M) * (x - a.x) / (b.x - a.x);
    };
    const springR = (m.springs || []).map((sp, k) => ({ x: sp.x, k: sp.k, v: u[2 * sprNodes[k]], R: sp.k * u[2 * sprNodes[k]] }));
    return { xs, u, S, reactions, springR, Mmax, Mmin, Vabs, vmax, Mat, elq };
  }

  // ---------- lateral–torsional thin-walled beam ----------
  // m = { L, EIz, EIw, GIt, supports:[{x, v:true, phi:true, vp:false, phip:false}], Mfun(x) (major-axis moment, sagging +),
  //       loads:[{x, P, a}] (vertical point loads, downward +, a = height above the shear centre), dist:[{x0,x1,q,a}] (vertical UDL),
  //       lat:[{x, k, a}] discrete lateral springs at height a, latC:[{x0,x1,k,a}] continuous (N/mm per mm),
  //       tor:[{x,k}] torsional springs (N·mm/rad), torC:[{x0,x1,k}] continuous (N·mm/rad per mm),
  //       torque:[{x,T}], torqueC:[{x0,x1,m}], latLoad:[{x,F,a}], latLoadC:[{x0,x1,q,a}]  (static analysis loads) }
  const SGN = 1; // sign of the ∫ M v'' φ term relative to the spring convention u_a = v − a φ (fixed by the physical tests in the test log)
  function ltbAssemble(m) {
    const keys = [...m.supports.map(s => s.x), ...(m.loads || []).map(p => p.x), ...(m.lat || []).map(p => p.x), ...(m.tor || []).map(p => p.x),
      ...(m.torque || []).map(p => p.x), ...(m.latLoad || []).map(p => p.x),
      ...['dist', 'latC', 'torC', 'torqueC', 'latLoadC'].flatMap(k => (m[k] || []).flatMap(u => [u.x0, u.x1]))];
    const xs = mesh(0, m.L, keys, m.L / (m.nEl || 40));
    const nn = xs.length, n = 4 * nn, K = new Float64Array(n * n), G = new Float64Array(n * n), F = new Float64Array(n);
    const add = (A, i, j, v) => { A[i * n + j] += v; };
    for (let e = 0; e < nn - 1; e++) {
      const x0 = xs[e], L = xs[e + 1] - x0, dv = [4 * e, 4 * e + 1, 4 * e + 4, 4 * e + 5], dp = [4 * e + 2, 4 * e + 3, 4 * e + 6, 4 * e + 7];
      const mid = x0 + L / 2;
      const within = arr => (arr || []).filter(u => mid >= u.x0 - 1e-9 && mid <= u.x1 + 1e-9);
      for (const [s, w] of G6) {
        const H = herm(L, s), x = x0 + s * L, J = w * L, M = m.Mfun ? m.Mfun(x) : 0;
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
          add(K, dv[i], dv[j], m.EIz * H.d2[i] * H.d2[j] * J);
          add(K, dp[i], dp[j], (m.EIw * H.d2[i] * H.d2[j] + m.GIt * H.d1[i] * H.d1[j]) * J);
          // geometric: ∫ M (v'' φ) → symmetric coupling
          const g = SGN * M * J;
          add(G, dv[i], dp[j], g * H.d2[i] * H.N[j]); add(G, dp[j], dv[i], g * H.d2[i] * H.N[j]);
        }
        for (const u of within(m.dist)) for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) add(G, dp[i], dp[j], u.q * u.a * H.N[i] * H.N[j] * J);
        for (const u of within(m.latC)) { // k (v − a φ)²
          const c = [...dv.map((d, i) => [d, H.N[i]]), ...dp.map((d, i) => [d, -u.a * H.N[i]])];
          for (const [di, ci] of c) for (const [dj, cj] of c) add(K, di, dj, u.k * ci * cj * J);
        }
        for (const u of within(m.torC)) for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) add(K, dp[i], dp[j], u.k * H.N[i] * H.N[j] * J);
        for (const u of within(m.torqueC)) for (let i = 0; i < 4; i++) F[dp[i]] += u.m * H.N[i] * J;
        for (const u of within(m.latLoadC)) for (let i = 0; i < 4; i++) { F[dv[i]] += u.q * H.N[i] * J; F[dp[i]] += -u.a * u.q * H.N[i] * J; }
      }
    }
    for (const p of (m.loads || [])) { const i = near(xs, p.x); G[(4 * i + 2) * n + 4 * i + 2] += p.P * p.a; }
    for (const s of (m.lat || [])) { const i = near(xs, s.x), dv = 4 * i, dp = 4 * i + 2; K[dv * n + dv] += s.k; K[dp * n + dp] += s.k * s.a * s.a; K[dv * n + dp] -= s.k * s.a; K[dp * n + dv] -= s.k * s.a; }
    for (const s of (m.tor || [])) { const i = near(xs, s.x), dp = 4 * i + 2; K[dp * n + dp] += s.k; }
    for (const p of (m.torque || [])) F[4 * near(xs, p.x) + 2] += p.T;
    for (const p of (m.latLoad || [])) { const i = near(xs, p.x); F[4 * i] += p.F; F[4 * i + 2] += -p.a * p.F; }
    const fixed = new Uint8Array(n);
    for (const s of m.supports) { const i = near(xs, s.x); if (s.v !== false) fixed[4 * i] = 1; if (s.phi !== false) fixed[4 * i + 2] = 1; if (s.vp) fixed[4 * i + 1] = 1; if (s.phip) fixed[4 * i + 3] = 1; }
    // elastic vertical supports inside the span (knee braces): k in N/mm, reaction k·v (upward for a downward deflection)
    const sprNodes = (m.springs || []).map(sp => { const i = near(xs, sp.x); K[2 * i * n + 2 * i] += sp.k; return i; });
    const free = []; for (let i = 0; i < n; i++) if (!fixed[i]) free.push(i);
    return { xs, n, K, G, F, free };
  }
  function reduce(A, n, free) { const nf = free.length, R = new Float64Array(nf * nf); for (let a = 0; a < nf; a++) for (let b = 0; b < nf; b++) R[a * nf + b] = A[free[a] * n + free[b]]; return R; }
  // elastic critical load factor
  function ltbFactor(m) {
    const A = ltbAssemble(m), nf = A.free.length;
    const mu = U.maxMu(reduce(A.K, A.n, A.free), reduce(A.G, A.n, A.free), nf);
    return mu > 0 ? 1 / mu : Infinity;
  }
  // static torsion / lateral bending: returns twist, lateral displacement, bimoment, lateral moment, torques and spring forces
  function torsion(m) {
    const A = ltbAssemble(m), nf = A.free.length;
    const Kr = reduce(A.K, A.n, A.free), Fr = A.free.map(i => A.F[i]);
    const L = U.cholesky(Kr, nf); if (!L) return { error: 'torsion model unstable (no torsional support)' };
    const ur = U.cholSolve(L, nf, Fr), u = new Float64Array(A.n); A.free.forEach((g, a) => { u[g] = ur[a]; });
    const xs = A.xs, S = [];
    for (let e = 0; e < xs.length - 1; e++) {
      const x0 = xs[e], Le = xs[e + 1] - x0, dv = [4 * e, 4 * e + 1, 4 * e + 4, 4 * e + 5].map(i => u[i]), dp = [4 * e + 2, 4 * e + 3, 4 * e + 6, 4 * e + 7].map(i => u[i]);
      for (const s of [0, 0.5, 1]) {
        const H = herm(Le, s); let v = 0, v2 = 0, f = 0, f1 = 0, f2 = 0, f3 = 0;
        for (let i = 0; i < 4; i++) { v += H.N[i] * dv[i]; v2 += H.d2[i] * dv[i]; f += H.N[i] * dp[i]; f1 += H.d1[i] * dp[i]; f2 += H.d2[i] * dp[i]; f3 += H.d3[i] * dp[i]; }
        S.push({ x: x0 + s * Le, v, phi: f, B: -m.EIw * f2, Mz: -m.EIz * v2, Tsv: m.GIt * f1, Tw: -m.EIw * f3 });
      }
    }
    const abs = k => Math.max(...S.map(s => Math.abs(s[k])));
    // spring forces (discrete) and maximum distributed spring force per length
    const latF = (m.lat || []).map(s => { const i = near(xs, s.x); return { x: s.x, F: s.k * (u[4 * i] - s.a * u[4 * i + 2]) }; });
    let latCmax = 0; for (const c of (m.latC || [])) for (const s of S) if (s.x >= c.x0 && s.x <= c.x1) latCmax = Math.max(latCmax, Math.abs(c.k * (s.v - c.a * s.phi)));
    let torCmax = 0; for (const c of (m.torC || [])) for (const s of S) if (s.x >= c.x0 && s.x <= c.x1) torCmax = Math.max(torCmax, Math.abs(c.k * s.phi));
    return { S, phiMax: abs('phi'), vMax: abs('v'), Bmax: abs('B'), Mzmax: abs('Mz'), Tsvmax: abs('Tsv'), Twmax: abs('Tw'), latF, latCmax, torCmax };
  }
  return { beam, ltbFactor, torsion, mesh, herm, SGN };
})();

