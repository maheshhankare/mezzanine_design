// INVESTIGATION ONLY (no calculation code is changed): which simple reading of IS 800 9.3.2.2 / Table 18 reproduces RSTAB's STEEL IS ratios of equations 341 / 351
// for the 150x150x5 box columns of the benchmark?   Usage:
//   DUMP=dump.json npx tsx scripts/rstab/compare-is-design.ts      (writes the member forces and RSTAB ratios)
//   node scripts/rstab/explore-9322.cjs dump.json
// Variants: moments at the design station (as RSTAB prints per location) vs the member maximum; C_m from the member end moments (Table 18, linear diagram, floor 0.4)
// vs 0.9; which local axis is taken as IS "y"; which printed equation RSTAB's number corresponds to. The result is a table of agreement, not a calibration.
const rows = require(require('node:path').resolve(process.argv[2] || 'dump.json'));
const fy = 250, A = 2878.5358, r = 59.108, E = 210000, g0 = 1.10, Zpy = 120500, sc = 1e4, Md = Zpy * fy / g0; // 150x150x5, r_o = 5 (rhsProps), N·mm
const chi = (sl, al) => { const fcc = Math.PI ** 2 * E / sl ** 2, lam = Math.sqrt(fy / fcc), phi = 0.5 * (1 + al * (lam - 0.2) + lam * lam); return { chi: Math.min(1, 1 / (phi + Math.sqrt(Math.max(0, phi * phi - lam * lam)))), lam }; };
const psiOf = (a, b) => { const [lo, hi] = Math.abs(a) <= Math.abs(b) ? [a, b] : [b, a]; return Math.abs(hi) < 1e-9 ? 1 : Math.max(-1, Math.min(1, lo / hi)); };
const cmTable = (a, b) => Math.max(0.4, 0.6 + 0.4 * psiOf(a, b));
const res = {}; const stat = (k, d) => { const o = res[k] || (res[k] = { n: 0, s: 0, mx: 0, ok: 0 }); o.n++; o.s += Math.abs(d); o.mx = Math.max(o.mx, Math.abs(d)); if (Math.abs(d) <= 0.015) o.ok++; };
for (const q of rows) {
  if (q.eq !== 341 && q.eq !== 351) continue;
  const c = chi(q.L / r, 0.21), Pd = c.chi * A * fy / g0, P = Math.max(0, -q.f[0] * 1e3), n = P / Pd, K = Math.min(1 + (c.lam - 0.2) * n, 1 + 0.8 * n);
  const st = [Math.abs(q.f[4]) * sc, Math.abs(q.f[5]) * sc], a = [q.a[4] * sc, q.a[5] * sc], b = [q.b[4] * sc, q.b[5] * sc];
  const mx = [Math.max(Math.abs(a[0]), Math.abs(b[0]), st[0]), Math.max(Math.abs(a[1]), Math.abs(b[1]), st[1])];
  for (const [mname, M] of [['station moments', st], ['member maximum', mx]]) for (const msw of [0, 1]) for (const cm of ['table', '0.9']) {
    const My = M[msw], Mz = M[1 - msw], cmy = cm === '0.9' ? 0.9 : cmTable(a[msw], b[msw]), cmz = cm === '0.9' ? 0.9 : cmTable(a[1 - msw], b[1 - msw]);
    const e1 = n + K * cmy * My / Md + Mz / Md, e2 = n + 0.6 * K * cmy * My / Md + K * cmz * Mz / Md;
    const tag = `${mname} | IS y <- local ${msw ? 'z' : 'y'} | C_m ${cm}`;
    stat(`RSTAB ${q.eq} vs printed eq.1 | ${tag}`, e1 - q.ratio); stat(`RSTAB ${q.eq} vs printed eq.2 | ${tag}`, e2 - q.ratio);
  }
}
for (const [k, v] of Object.entries(res).sort()) console.log(k.padEnd(98), 'mean|d| ' + (v.s / v.n).toFixed(3), 'max ' + v.mx.toFixed(2), 'within 0.015: ' + v.ok + '/' + v.n);
