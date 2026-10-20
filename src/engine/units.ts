// @ts-nocheck — ported verbatim from the mockup (index.html, 03_units.js); logic unchanged so results match the mockup.
// ===== UNITS: central display-unit system (shared by the C-section tool and the unified Mezzanine shell) =====
// The calculation never changes units: every engine keeps its internal units (N, mm, N·mm, N/mm²; loads kN/m², kN/m; results as
// the engine produced them). UNITS only converts a value FOR DISPLAY (internal → display) and an entered value BACK (display →
// internal), always from an explicitly named unit, so a value is converted exactly once. Each displayed category (geometry, area,
// force, moment, stress …) has its own selected unit; the choice is kept in the project file and in the browser.
// Conversion is dimensional: every unit is a factor to the SI base of its quantity, so compound units (kN/m², kN·m/rad, kN·cm) are
// exact and a round trip display → internal → display returns the original value to rounding (≤ 1e-12 relative).
export const UNITS = (() => {
  const G = 9.80665;
  // quantity → unit → factor to the SI base of the quantity (m, m², m³, m⁴, m⁶, N, N·m, Pa, N/m, N/m², kg/m³, rad, N·m/rad, N/m, kg/m)
  const QTY = {
    length: { mm: 1e-3, cm: 1e-2, m: 1 },
    area: { 'mm²': 1e-6, 'cm²': 1e-4, 'm²': 1 },
    modulus3: { 'mm³': 1e-9, 'cm³': 1e-6, 'm³': 1 },
    inertia: { 'mm⁴': 1e-12, 'cm⁴': 1e-8, 'm⁴': 1 },
    warping: { 'mm⁶': 1e-18, 'cm⁶': 1e-12, 'm⁶': 1 },
    force: { N: 1, kN: 1e3 },
    moment: { 'N·mm': 1e-3, 'N·m': 1, 'kN·mm': 1, 'kN·cm': 10, 'kN·m': 1e3 },
    stress: { MPa: 1e6, 'N/mm²': 1e6, GPa: 1e9, 'kN/cm²': 1e7 },
    lineLoad: { 'N/m': 1, 'kN/m': 1e3, 'N/mm': 1e3, 'kN/mm': 1e6 },
    areaLoad: { 'N/m²': 1, 'kN/m²': 1e3, kPa: 1e3, 'N/mm²': 1e6, 'kg/m²': G },
    density: { 'kg/m³': 1, 't/m³': 1e3, 'kN/m³': 1e3 / G },
    rotation: { rad: 1, mrad: 1e-3, '°': Math.PI / 180 },
    rotStiff: { 'N·mm/rad': 1e-3, 'kN·m/rad': 1e3, 'kN·cm/rad': 10, 'N·m/rad': 1 },
    spring: { 'N/mm': 1e3, 'kN/m': 1e3, 'kN/mm': 1e6, 'N/m': 1 },
    torque: { 'N·mm/mm': 1, 'kN·m/m': 1e3, 'N·m/m': 1, 'kN·mm/mm': 1e3 },
    mass: { 'kg/m': 1, 'kg/mm': 1e3, 't/m': 1e3 }
  };
  // spellings used in the engines' texts → the canonical unit above
  const ALIAS = { kNm: 'kN·m', 'kN.m': 'kN·m', Nmm: 'N·mm', 'N.mm': 'N·mm', kNcm: 'kN·cm', kNmm: 'kN·mm', 'N/mm2': 'N/mm²', mm2: 'mm²', cm2: 'cm²', m2: 'm²', mm3: 'mm³', cm3: 'cm³', mm4: 'mm⁴', cm4: 'cm⁴', mm6: 'mm⁶', cm6: 'cm⁶',
    'kN/m2': 'kN/m²', 'kNm/rad': 'kN·m/rad', 'kN·m/rad ': 'kN·m/rad', 'Nmm/rad': 'N·mm/rad', 'kNm/m': 'kN·m/m', deg: '°', 'kN/cm2': 'kN/cm²' };
  // display categories (RSTAB-like): key → { label, group, qty, default unit (the tools' present units) }
  const CATS = [
    ['len', 'Geometry and dimensions', 'Geometry', 'length', 'mm'],
    ['area', 'Area A', 'Cross-section', 'area', 'mm²'],
    ['I', 'Second moment of area I', 'Cross-section', 'inertia', 'mm⁴'],
    ['W', 'Section modulus W', 'Cross-section', 'modulus3', 'mm³'],
    ['It', 'Torsion constant I_t', 'Cross-section', 'inertia', 'mm⁴'],
    ['Iw', 'Warping constant I_w', 'Cross-section', 'warping', 'mm⁶'],
    ['E', 'Elastic / shear modulus E, G', 'Material', 'stress', 'N/mm²'],
    ['fy', 'Yield / ultimate strength f_y, f_u', 'Material', 'stress', 'N/mm²'],
    ['rho', 'Density', 'Material', 'density', 'kg/m³'],
    ['P', 'Point loads', 'Loads', 'force', 'kN'],
    ['w', 'Distributed (line) loads', 'Loads', 'lineLoad', 'kN/m'],
    ['q', 'Surface (area) loads', 'Loads', 'areaLoad', 'kN/m²'],
    ['Mload', 'Applied moments and torques', 'Loads', 'moment', 'kN·m'],
    ['N', 'Axial force N', 'Results', 'force', 'kN'],
    ['V', 'Shear force V', 'Results', 'force', 'kN'],
    ['M', 'Bending moment M', 'Results', 'moment', 'kN·m'],
    ['R', 'Support reactions (forces)', 'Results', 'force', 'kN'],
    ['MR', 'Support reactions (moments)', 'Results', 'moment', 'kN·m'],
    ['d', 'Deflection and displacement', 'Results', 'length', 'mm'],
    ['sig', 'Stress', 'Results', 'stress', 'N/mm²'],
    ['rot', 'Rotation', 'Results', 'rotation', 'mrad'],
    ['Sj', 'Rotational stiffness S_j', 'Results', 'rotStiff', 'kN·m/rad'],
    ['k', 'Spring stiffness', 'Results', 'spring', 'kN/m'],
    ['mT', 'Distributed torque', 'Results', 'torque', 'kN·m/m'],
    ['mass', 'Mass per length', 'Results', 'mass', 'kg/m']
  ].map(([key, label, group, qty, def]) => ({ key, label, group, qty, def }));
  const BY = Object.fromEntries(CATS.map(c => [c.key, c]));
  // mode 'native': every value is shown in the unit its engine writes (the tools' look before v1.6 / unified v2.3, e.g. cm⁴ and mm⁴
  // side by side); mode 'custom': every value of a category is converted to the unit selected for it
  const defaults = () => Object.assign({ mode: 'native' }, Object.fromEntries(CATS.map(c => [c.key, c.def])));
  // presets (RSTAB offers similar sets)
  const PRESETS = {
    tool: { label: 'Tool units, converted consistently (mm, mm², mm⁴, kN, kN·m, N/mm²)', set: {} },
    rstab: { label: 'RSTAB report (mm, kN, kN·cm, kN/cm²)', set: { M: 'kN·cm', MR: 'kN·cm', Mload: 'kN·cm', sig: 'kN/cm²', area: 'cm²', I: 'cm⁴', W: 'cm³', It: 'cm⁴', Iw: 'cm⁶', Sj: 'kN·cm/rad' } },
    si: { label: 'SI base (m, N, N·m, MPa)', set: { len: 'm', d: 'm', area: 'm²', I: 'm⁴', W: 'm³', It: 'm⁴', Iw: 'm⁶', P: 'N', N: 'N', V: 'N', R: 'N', M: 'N·m', MR: 'N·m', Mload: 'N·m', w: 'N/m', q: 'N/m²', E: 'MPa', fy: 'MPa', sig: 'MPa', rot: 'rad', Sj: 'N·m/rad', k: 'N/m', mT: 'N·m/m' } },
    nmm: { label: 'N and mm throughout (N, N·mm, N/mm, N/mm²)', set: { P: 'N', N: 'N', V: 'N', R: 'N', M: 'N·mm', MR: 'N·mm', Mload: 'N·mm', w: 'N/mm', Sj: 'N·mm/rad', k: 'N/mm', mT: 'N·mm/mm' } },
    kNm: { label: 'kN and m (m, kN, kN·m, GPa for E)', set: { len: 'm', E: 'GPa', area: 'cm²', I: 'cm⁴', W: 'cm³', It: 'cm⁴', Iw: 'cm⁶' } }
  };
  let cur = defaults();
  const listeners = [];
  const canon = u => { const s = String(u || '').trim(); return ALIAS[s] || s; };
  function qtyOf(u) { const c = canon(u); for (const [q, t] of Object.entries(QTY)) if (t[c] !== undefined) return q; return null; }
  function valid(cfg) { // keep only known categories with a unit of the right quantity
    const out = defaults();
    if (cfg && typeof cfg === 'object') {
      for (const c of CATS) { const u = canon(cfg[c.key]); if (u && QTY[c.qty][u] !== undefined) out[c.key] = u; }
      out.mode = cfg.mode === 'custom' ? 'custom' : 'native';
    }
    return out;
  }
  function set(cfg, silent) { cur = valid(cfg); if (!silent) for (const f of listeners.slice()) try { f(cur); } catch (e) { /* a listener must not stop the others */ } return cur; }
  const get = () => Object.assign({}, cur);
  const unit = cat => (BY[cat] ? cur[cat] : '');
  // factor between two units of one quantity (throws on a dimension mismatch: that is a programming error, never silently wrong)
  function factor(from, to) {
    const a = canon(from), b = canon(to), q = Object.keys(QTY).find(k => QTY[k][a] !== undefined && QTY[k][b] !== undefined);
    if (!q) throw new Error(`UNITS: cannot convert ${from} to ${to}`);
    return QTY[q][a] / QTY[q][b];
  }
  const conv = (v, from, to) => (typeof v === 'number' && isFinite(v) ? v * factor(from, to) : v);
  // internal value (in unit `from`) → display value of category `cat`
  const native = () => cur.mode !== 'custom';
  const target = (from, cat) => (native() || !BY[cat] ? canon(from) : cur[cat]);   // the unit a value written in `from` is shown in
  function toDisp(v, from, cat) { return conv(v, from, target(from, cat)); }
  // display value of category `cat` → internal value in unit `to` (inputs); the round trip to → display → to is exact to 1e-12
  function fromDisp(v, cat, to) { return conv(v, target(to, cat), to); }
  // category for a unit as written by an engine, with an optional hint (symbol or name) for forces and moments
  function catFor(u, hint) {
    const c = canon(u), h = String(hint || '');
    let q = qtyOf(c);
    if (!q) return null;
    if (QTY.spring[c] !== undefined && /stiff|^k\b|^K_|^k_|spring/i.test(h)) q = 'spring';   // N/mm, kN/mm: stiffness or line load
    if (q === 'force') return /^V|shear/i.test(h) ? 'V' : /^R|reaction/i.test(h) ? 'R' : /^[PFQ]_?|load/i.test(h) && !/^N/.test(h) ? 'P' : 'N';
    if (q === 'moment') return /^M_?R|reaction|base moment/i.test(h) ? 'MR' : 'M';
    if (q === 'length') return /^[δwvu]|deflection|displacement|sway/i.test(h) ? 'd' : 'len';
    if (q === 'stress') return /^E\b|^G\b|modulus/i.test(h) ? 'E' : /^f_?[yu]|strength/i.test(h) ? 'fy' : 'sig';
    if (q === 'inertia') return /^I_?t|torsion/i.test(h) ? 'It' : 'I';
    return { area: 'area', modulus3: 'W', warping: 'Iw', lineLoad: 'w', areaLoad: 'q', density: 'rho', rotation: 'rot', rotStiff: 'Sj', spring: 'k', torque: 'mT', mass: 'mass' }[q] || null;
  }
  // digits so that a converted value keeps about the precision the engine showed (d digits in the engine unit)
  function digits(v, from, to, d) {
    if (d === undefined || d === null) d = 2;
    const f = Math.abs(factor(from, to));
    const shift = Math.round(-Math.log10(f));   // e.g. kN·m → N·mm: f = 1e6 → −6 digits
    return Math.max(0, Math.min(8, d + shift));
  }
  // value + unit as text, converted; `fmt(x, d)` is the caller's number formatter (keeps its thousands separator / decimal style)
  function show(v, from, cat, d, fmt) {
    if (typeof v !== 'number' || !isFinite(v) || !BY[cat] || !qtyOf(from) || native()) return { v, u: from, txt: fmt ? fmt(v, d) : String(v) };
    const to = cur[cat], x = conv(v, from, to), dd = canon(from) === to ? d : digits(v, from, to, d);
    const s = fmt ? fmt(x, dd) : x.toFixed(dd);
    return { v: x, u: to, txt: s };
  }
  const onChange = f => { listeners.push(f); return () => { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); }; };
  const isDefault = () => native();
  // label of the unit a value written in `from` is shown in (for column headers and axis titles)
  const label = (from, cat) => target(from, cat);
  return { QTY, CATS, BY, PRESETS, defaults, set, get, unit, factor, conv, toDisp, fromDisp, catFor, canon, qtyOf, digits, show, onChange, isDefault, native, label, valid };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = UNITS;

