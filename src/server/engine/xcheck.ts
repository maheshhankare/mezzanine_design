// @ts-nocheck — ported from the mockup (index.html, 88_xcheck.js). The reference cases are IS 800:2007 cases; the reference set was recorded again for the IS-only engine (scripts/record-xbref.ts).
import "server-only";
import { XB_REF } from './xbref';
import { DWG } from './dxf';
import { MODEL } from './model';
import { SCHEMA } from '@/shared/schema';
// ===== Reproducibility: engine version, canonical inputs, input fingerprint, result digest, reference cases and the cross-browser self-test =====
// No DOM here: the same code runs in every browser and in the Node tests, so a browser is compared against exactly the values the tests check.
export const XCHK: any = (() => {
  // the calculation-engine version changes only when a formula, method or default that can change a result changes (the app version also changes for UI work)
  const ENGINE_VERSION = '2.1.0 (IS 800:2007 only)';
  // project-file format: 1 = v1.0–v1.2 export {app, version, inputs, cases}; 2 = adds format, engine, fingerprint and a result summary for comparison
  const FORMAT = 'csbd-project', FORMAT_VERSION = 2;
  // tolerance for comparing the same calculation on two JavaScript engines (see METHODS.md, "Reproducibility"). Statuses must match exactly.
  // Engines may differ in the last bit of Math.pow / exp / sin …; through the eigen-solvers and amplifiers this grows to ≈6e-10 relative (measured,
  // V8 vs JavaScriptCore vs SpiderMonkey). 1e-6 relative is 1000× below the displayed precision and >1000× above that noise. The absolute floor
  // of 1e-6 engine units (N, mm, N·mm) covers values that are zero in theory and come out as round-off (e.g. 1e-7 N·mm hogging in a simple span).
  const RTOL = 1e-6, ATOL = 1e-6;

  // 64-bit FNV-1a (two 32-bit lanes) of a string, as 16 hex digits
  function hash(s) {
    let a = 2166136261, b = 2166136261 ^ 0x5bd1e995;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a ^= c; a = Math.imul(a, 16777619); b ^= c; b = Math.imul(b, 0x5bd1e995); b ^= b >>> 15; }
    const h = x => (x >>> 0).toString(16).padStart(8, '0');
    return h(a) + h(b);
  }
  // canonical form of the inputs: every schema field, keys sorted, numbers as numbers, lists as "a,b,c"; independent of how a value was typed or loaded
  function canon(raw) {
    const d = SCHEMA.defaults(), o = {};
    for (const k of Object.keys(d).sort()) {
      let v = raw && k in raw ? raw[k] : d[k];
      const f = SCHEMA.byId[k];
      if (v === null || v === undefined) v = '';
      if (f.type === 'n') { const s = String(v).trim(), x = Number(s); v = s !== '' && isFinite(x) ? x : s; }
      else if (f.type === 'l') { const p = String(v).split(/[,;\s]+/).filter(Boolean); v = p.every(x => isFinite(Number(x))) ? p.map(Number).join(',') : String(v); }
      else v = String(v);
      o[k] = v;
    }
    return o;
  }
  const fingerprint = raw => hash(JSON.stringify(canon(raw)));
  // local calendar date YYYY-MM-DD (not the UTC date, which differs near midnight)
  const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // ---------------- result digest: statuses, demands, resistances, utilisations and every numerical step of every check, plus key intermediates ----------------
  const nv = x => typeof x === 'number' ? (isFinite(x) ? x : isNaN(x) ? 'NaN' : x > 0 ? 'Inf' : '-Inf') : x === undefined || x === null ? null : typeof x === 'boolean' ? x : String(x);
  function memberInter(d) {
    if (!d || d.error) return null;
    const g = d.gross || {}, o = {};
    // values that are zero in theory (centroid / shear-centre offsets of a symmetric section, hogging moment of a simple span) are round-off:
    // below 1e-12 of their scale they are recorded as 0, so engines are not compared on noise
    const z = (v, sc) => typeof v === 'number' && Math.abs(v) <= 1e-12 * sc ? 0 : v;
    const sc = Math.sqrt(g.A || 1) * 10, ms = d.env ? Math.max(Math.abs(d.env.Mmax), Math.abs(d.env.Mmin)) : 1;
    for (const k of ['A', 'yc', 'zc', 'Iyy', 'Izz', 'It', 'Iw', 'ysc', 'zsc', 'Wy', 'Wz']) o[k] = nv(/^(yc|zc|ysc|zsc)$/.test(k) ? z(g[k], sc) : g[k]);
    o.Mcr = nv(d.Mcr); o.Mcr0 = nv(d.Mcr0); o.amp = nv(d.amp); o.mass = nv(d.mass);
    if (d.env) { o.Mmax = nv(z(d.env.Mmax, ms)); o.Mmin = nv(z(d.env.Mmin, ms)); }
    if (d.Rmax) o.Rmax = d.Rmax.map(nv);
    return o;
  }
  function digest(res, opt = {}) {
    if (!res || res.fatal) return { fatal: true, msgs: (res && res.msgs || []).filter(m => m.level === 'error').map(m => m.id || m.text) };
    const S = res.summary, checks = [], seen = {};
    for (const r of S.rows) for (const c of r.list) {
      let k = `${r.key}|${c.grp || ''}|${c.name}`; seen[k] = (seen[k] || 0) + 1; if (seen[k] > 1) k += '#' + seen[k];
      checks.push([k, c.status, nv(c.eta), nv(c.Ed), nv(c.Rd), (c.steps || []).map(s => nv(s[2]))]);
    }
    const M = res.mods, L = res.load || {};
    const out = {
      overall: [S.overall.status, nv(S.overall.eta), S.nFail, S.nReview, S.nPass, S.nNA],
      rows: S.rows.map(r => [r.key, r.status, nv(r.eta)]),
      checks,
      inter: {
        mb: memberInter(M.mb && M.mb.gov), sbi: memberInter(M.sbi), sbe: memberInter(M.sbe),
        load: { Ncol: nv(L.Ncol), tribI: nv(L.tribI), tribE: nv(L.tribE) },
        col: M.col && M.col.loads ? { N: nv(M.col.loads.N), My: nv(M.col.loads.My), Mz: nv(M.col.loads.Mz), V: nv(M.col.loads.V) } : null
      },
      warnings: res.msgs.filter(m => m.level !== 'error').map(m => `${m.level}:${m.id || ''}`)
    };
    if (opt.dxf !== false && typeof DWG !== 'undefined') { try { const B = DWG.build(res, { date: '2000-01-01', ver: 'reference' }); out.dxf = B.error ? 'error' : hash(DWG.dxf(B.list)); out.nDwg = B.list.length; } catch (e) { out.dxf = 'exception: ' + e.message; } }
    return out;
  }
  // compact summary written into project files, re-checked when the file is opened elsewhere
  const summary = res => !res || res.fatal ? { fatal: true } : { status: res.summary.overall.status, eta: nv(res.summary.overall.eta), rows: res.summary.rows.map(r => [r.key, r.status, nv(r.eta)]) };

  // ---------------- comparison with tolerance ----------------
  function compare(exp, act) {
    const st = { n: 0, exact: 0, tol: 0, maxRel: 0, fails: [], textDiff: [] };
    const walk = (a, b, p) => {
      if (typeof a === 'number' && typeof b === 'number') {
        st.n++;
        if (a === b) { st.exact++; return; }
        const d = Math.abs(a - b), sc = Math.max(Math.abs(a), Math.abs(b)), rel = sc > 0 ? d / sc : 0;
        if (sc > 1e3 * ATOL) st.maxRel = Math.max(st.maxRel, rel);
        if (d <= ATOL || rel <= RTOL) { st.tol++; return; }
        st.fails.push({ path: p, exp: a, act: b, rel }); return;
      }
      if (Array.isArray(a) && Array.isArray(b)) { if (a.length !== b.length) { st.fails.push({ path: p, exp: `${a.length} items`, act: `${b.length} items` }); return; } a.forEach((x, i) => walk(x, b[i], `${p}[${i}]`)); return; }
      if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], p ? `${p}.${k}` : k); return; }
      st.n++;
      if (a === b) { st.exact++; return; }
      // DXF text is fixed to 0.01 mm: a last-digit rounding difference changes the hash without a meaningful change, so it is reported separately
      if (/\.dxf$/.test(p)) { st.textDiff.push({ path: p, exp: a, act: b }); return; }
      st.fails.push({ path: p, exp: a, act: b });
    };
    walk(exp, act, '');
    // name the check for each failing path
    for (const f of st.fails) { const m = f.path.match(/^checks\[(\d+)\]/); if (m && exp.checks && exp.checks[+m[1]]) f.check = exp.checks[+m[1]][0]; }
    return st;
  }

  // ---------------- reference cases (the same inputs in every browser and in the Node tests) ----------------
  const REV = { sbi_arr: 'b2b', sbe_arr: 'b2b', sbi_t: 1.5, sbe_t: 2, mb_t: 2.5, ci_nv: 3, ci_p1: 80, ce_nv: 3, ce_p1: 80, k_nL: '2', k_nb: 2, k_tg: 8 };
  const CASES = [
    { id: 'X1', name: 'Example 3 mapped to C, as entered (defaults)', inputs: {} },
    { id: 'X2', name: 'Example 3 revised study', inputs: REV },
    { id: 'X3', name: 'Optimisation demo: main beam C200×50×10×2', inputs: { mb_H: 200, mb_Bt: 50, mb_Bb: 50, mb_Ct: 10, mb_Cb: 10, mb_t: 2, sbi_arr: 'b2b', sbe_arr: 'b2b', sbi_t: 1.5, sbe_t: 1.5, ci_nv: 3, ci_p1: 80, ce_nv: 3, ce_p1: 80 } },
    { id: 'X4', name: 'Revised study, top-flange loading, user effective lengths, cold-formed RHS column', inputs: Object.assign({}, REV, { lc_conv: 'flange', col_frame: 'user', col_ky: 1.0, col_kz: 1.0, col_type: 'rhsC' }) },
    { id: 'X5', name: 'Revised study, hot-finished RHS column, MDF floor, variable SB-Int positions', inputs: Object.assign({}, REV, { col_type: 'rhsH', d_type: 'mdf', sbiVar: 'var', xsbi: '900, 2100' }) },
    { id: 'X6', name: 'Revised study, knee-braced sway frame with user effective lengths', inputs: Object.assign({}, REV, { col_frame: 'user', col_ky: 2.0, col_kz: 2.0, col_type: 'rhsH' }) }
  ];
  // elementary maths of this JavaScript engine (Math.sin, exp, pow …): bit-equality with the reference shows whether the maths libraries agree
  const PROBE_X = [0.1, 0.7, 1.3, 2.9, 7.3, 31.7];
  const probe = () => PROBE_X.flatMap(x => [Math.sin(x), Math.cos(x), Math.tan(x), Math.atan(x), Math.exp(x / 4), Math.log(x), Math.pow(x, 1.37), Math.sqrt(x), Math.cbrt(x), Math.atan2(x, 1.9), Math.sinh(x / 9), Math.cosh(x / 9), Math.tanh(x / 9), Math.log10(x), Math.expm1(x / 9), Math.hypot(x, 2.3), Math.acos(x / 40), Math.asin(x / 40)]);
  // reference results recorded with the reference engine (Node / V8) by test/xb_ref.js; embedded by build.js
  const REF = XB_REF;

  function runCase(c, opt) { const t0 = Date.now(); const res = MODEL.compute(c.inputs); return { digest: digest(res, opt), ms: Date.now() - t0 }; }
  // run every reference case, one per call of step(), so a browser stays responsive; returns the per-case comparison with the embedded reference
  function* selfTest(ref = REF) {
    const out = [];
    for (const c of CASES) {
      const r = runCase(c), e = ref && ref.cases && ref.cases[c.id];
      const row = { id: c.id, name: c.name, ms: r.ms, fp: fingerprint(c.inputs), status: r.digest.overall ? r.digest.overall[0] : 'invalid', eta: r.digest.overall ? r.digest.overall[1] : null };
      if (!e) row.verdict = 'NO REFERENCE';
      else if (e.fp !== row.fp) row.verdict = 'INPUTS DIFFER';
      else {
        const cmp = compare(e.digest, r.digest);
        Object.assign(row, { values: cmp.n, exact: cmp.exact, withinTol: cmp.tol, maxRel: cmp.maxRel, fails: cmp.fails.slice(0, 20), nFail: cmp.fails.length, textDiff: cmp.textDiff.length });
        row.verdict = cmp.fails.length ? 'DIFFERENT' : cmp.textDiff.length ? 'MATCH (DXF text differs)' : cmp.tol ? 'MATCH (within tolerance)' : 'IDENTICAL';
      }
      out.push(row);
      yield row;
    }
    return out;
  }
  return { ENGINE_VERSION, FORMAT, FORMAT_VERSION, RTOL, ATOL, hash, canon, fingerprint, localDate, digest, summary, compare, CASES, REF, runCase, selfTest, probe };
})();

