// @ts-nocheck — ported verbatim from the mockup (index.html, 86_opt.js); logic unchanged so results match the mockup.
import { LOADS } from './loads';
import { SEC } from './section';
import { EN } from './en_section';
import { RST } from './restraint';
import { U } from './util';
import { COL } from './column';
import { MODEL } from './model';
import { SCHEMA } from './schema';
import { CHK } from './check';
// ===== Optimisation engine: parametric search driven by the full system model. Never changes the user's inputs by itself =====
// Every candidate is checked by MODEL.compute (the same engine as the design tabs); nothing is estimated except two safe screens:
//  • bending:    M_Ed,lb = M_Ed − M_self-weight(current) is a lower bound on the candidate's M_Ed; M_c,Rd from W_eff (EN) or φ S f_y (AISI)
//                is the candidate's exact cross-section resistance (EN) or an upper bound (AISI) → η_lb ≤ η_actual.
//  • deflection: δ_lb = (δ − δ_self-weight,max) · I_y / I_y,cand (linear elastic, uniform EI, rigid supports) ≤ δ_actual.
//  Screens are only used with pinned member ends (a semi-rigid end makes the moment depend on the member stiffness).
// Search = enumeration of the user's permitted grid, screened, then evaluated best-first by the objective: with an objective that is
// known before analysis, the first candidate that passes every applicable check is the optimum of the grid (given the safe screens).
export const OPT: any = (() => {
  const list = s => String(s).split(/[,;\s]+/).map(Number).filter(v => isFinite(v) && v > 0);
  const MEM_KEYS = { mb: 'mb_', sbi: 'sbi_', sbe: 'sbe_' };
  const CONN_OF = { mb: 'cm', sbi: 'ci', sbe: 'ce' };
  const COMP = {
    joist: { label: 'Joist beams', type: 'Joist / restraint', id: 'J1' },
    sbi: { label: 'SB-Int', type: 'Secondary beam (C)', id: 'SB-I' }, sbe: { label: 'SB-End', type: 'Secondary beam (C)', id: 'SB-E' },
    mb: { label: 'Main beam', type: 'Main beam (C)', id: 'MB' }, col: { label: 'Box column', type: 'Column', id: 'COL' }, knee: { label: 'Knee bracing', type: 'Knee brace', id: 'KB' }
  };
  const ORDER = ['joist', 'sbi', 'sbe', 'mb', 'col', 'knee']; // load-path order used by the whole-system mode
  // parameters of each component: [key, input id, description, default manufacturing step]
  const PARAMS = {
    C: [['H', 'H', 'Section depth – overall C height', 10], ['Bt', 'Bt', 'Top flange width', 5], ['Bb', 'Bb', 'Bottom flange width', 5], ['Ct', 'Ct', 'Top lip length', 5], ['Cb', 'Cb', 'Bottom lip length', 5], ['t', 't', 'Core thickness (excl. coating)', 0.5], ['r', 'r', 'Internal bend radius', 0.5]],
    col: [['b', 'col_b', 'Width b (main-beam face)', 10], ['h', 'col_h', 'Depth h (SB-End face)', 10], ['tb', 'col_tb', 'Wall thickness, b-faces', 1], ['th', 'col_th', 'Wall thickness, h-faces', 1]],
    knee: [['b', 'k_b', 'Angle leg b (connected)', 5], ['h', 'k_h', 'Angle leg h', 5], ['t', 'k_t', 'Angle thickness', 1]],
    joist: [['n', 'j_n', 'Number of joists per secondary span', 1], ['a', 'j_aL', 'First / last joist distance from the secondary ends', 100]]
  };
  const LINKS = { C: [['Bb', 'Bt'], ['Cb', 'Ct']], col: [['h', 'b'], ['th', 'tb']], knee: [['h', 'b']], joist: [] };
  const kind = k => MEM_KEYS[k] ? 'C' : k;
  const idOf = (k, pid) => MEM_KEYS[k] ? MEM_KEYS[k] + pid : pid;
  const ARRS = ['single', 'b2b', 'quad'];

  // ---------- default controls (built from the current inputs; "fixed" always means the current input value) ----------
  function defaults(I, k) {
    const K = kind(k), c = { link: true };
    for (const [key, pid, , st] of PARAMS[K]) {
      const cur = +I[idOf(k, pid)];
      c[key] = { mode: 'fixed', min: cur, max: cur, step: st, list: String(cur) };
    }
    if (K === 'C') {
      const H = +I[k + '_H'], t = +I[k + '_t'];
      c.H = { mode: 'step', min: Math.max(60, H - 50), max: H + 50, step: 10, list: '150, 200, 250, 300, 350, 400' };
      c.t = { mode: 'step', min: t, max: t + 2, step: 0.5, list: '1.2, 1.5, 2, 2.5, 3, 4' };
      c.link = +I[k + '_Bt'] === +I[k + '_Bb'] && +I[k + '_Ct'] === +I[k + '_Cb'];
      c.arr = { mode: 'fixed', list: [I[k + '_arr']] };
      c.gr = { mode: 'fixed', list: [I[k + '_gr']] };
    } else if (K === 'col') {
      c.link = +I.col_b === +I.col_h && +I.col_tb === +I.col_th;
      c.b = { mode: 'step', min: Math.max(60, +I.col_b - 50), max: +I.col_b + 50, step: 10, list: '100, 120, 150, 180, 200' };
      c.tb = { mode: 'list', min: 2, max: 12, step: 1, list: '3, 4, 5, 6, 8, 10' };
      if (!c.link) { c.h = Object.assign({}, c.b, { min: Math.max(60, +I.col_h - 50), max: +I.col_h + 50 }); c.th = Object.assign({}, c.tb); }
    } else if (K === 'knee') {
      c.link = +I.k_b === +I.k_h;
      c.b = { mode: 'list', min: 30, max: 100, step: 5, list: '40, 45, 50, 60, 70, 80' };
      c.t = { mode: 'list', min: 3, max: 10, step: 1, list: '4, 5, 6, 8' };
    } else if (K === 'joist') {
      c.n = { mode: 'step', min: 0, max: 6, step: 1, list: '0, 1, 2, 3, 4, 5, 6' };
      c.a = { mode: 'fixed', min: +I.j_aL, max: +I.j_aL, step: 100, list: String(I.j_aL) };
      c.sec = { mode: 'list', list: `${({ L: 'L', box: 'SHS', C: 'C' })[I.j_sec] || 'L'}${I.j_sec === 'C' ? I.j_h + 'x' + I.j_b : I.j_b + 'x' + I.j_h}x${I.j_t}, L40x40x4, L50x50x5, L60x60x6` };
      c.at = { mode: 'fixed', list: [I.j_at] };
      c.sMin = 300;
    }
    return c;
  }
  // ---------- value lists ----------
  const rnd = v => Math.round(v * 1e6) / 1e6;
  function values(ctl, cur, intOnly, defStep) {
    if (!ctl || ctl.mode === 'fixed') return { v: [cur] };
    if (ctl.mode === 'list') { const v = [...new Set(String(ctl.list).split(/[,;\s]+/).filter(x => x !== '').map(Number).filter(x => isFinite(x) && x >= 0))]; return v.length ? { v: v.sort((a, b) => a - b) } : { err: 'the approved list is empty' }; }
    const mn = +ctl.min, mx = +ctl.max, st = ctl.mode === 'range' ? +(defStep || ctl.step) : +ctl.step; // range: manufacturing increment
    if (!isFinite(mn) || !isFinite(mx)) return { err: 'minimum and maximum must be numbers' };
    if (mn > mx) return { err: `minimum ${mn} exceeds maximum ${mx}` };
    if (!(st > 0)) return { err: 'the increment must be positive' };
    if (intOnly && (Math.round(st) !== st || Math.round(mn) !== mn)) return { err: 'whole numbers only' };
    const n = Math.floor((mx - mn) / st + 1e-9);
    if (n > 400) return { err: `${n + 1} values: increase the increment` };
    const v = []; for (let i = 0; i <= n; i++) v.push(rnd(mn + i * st));
    if (mx - v[v.length - 1] > 1e-6) v.push(rnd(mx)); // the maximum is always examined
    return { v };
  }
  function parseSec(s) {
    const m = String(s).trim().match(/^(L|SHS|RHS|BOX|C)\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)$/i);
    if (!m) return null;
    const T = m[1].toUpperCase(), a = +m[2], b = +m[3], t = +m[4];
    if (T === 'C') return { j_sec: 'C', j_h: a, j_b: b, j_t: t, name: `C${a}×${b}×${t}` };
    return { j_sec: T === 'L' ? 'L' : 'box', j_b: a, j_h: b, j_t: t, name: `${T === 'L' ? 'L' : T}${a}×${b}×${t}` };
  }
  // ---------- candidate generation with constraint validation ----------
  // returns { cands: [{ ov, dims, score fields }], errs, nRaw, nGeomRejected }
  function candidates(I, k, ctl, maxCombos = 4000) {
    const K = kind(k), errs = [], dimV = {};
    for (const [key, pid, desc, defStep] of PARAMS[K]) {
      const linkedTo = ctl.link ? (LINKS[K].find(l => l[0] === key) || [])[1] : null;
      if (linkedTo) continue;
      const r = values(ctl[key], +I[idOf(k, pid)], key === 'n', defStep);
      if (r.err) errs.push(`${COMP[k].label} – ${desc}: ${r.err}`); else dimV[key] = r.v;
    }
    let sets = { arr: [null], gr: [null], sec: [null], at: [null] };
    if (K === 'C') {
      const arrs = ctl.arr && ctl.arr.mode === 'list' ? ctl.arr.list.filter(a => ARRS.includes(a)) : [I[k + '_arr']];
      sets.arr = arrs.filter(a => k === 'mb' || a !== 'quad');
      if (!sets.arr.length) errs.push(`${COMP[k].label} – arrangement: select at least one permitted arrangement`);
      sets.gr = ctl.gr && ctl.gr.mode === 'list' ? ctl.gr.list.filter(g => SCHEMA.GV[g]) : [I[k + '_gr']];
      if (!sets.gr.length) errs.push(`${COMP[k].label} – steel grade: select at least one listed grade`);
      if (ctl.link && (+I[k + '_Bt'] !== +I[k + '_Bb'] || +I[k + '_Ct'] !== +I[k + '_Cb']) && ctl.Bt.mode === 'fixed' && ctl.Ct.mode === 'fixed') errs.push(`${COMP[k].label}: “bottom = top” is ticked but the current section is asymmetric – untick it to keep B_b / C_b`);
    }
    if (K === 'joist') {
      const secs = ctl.sec && ctl.sec.mode === 'list' ? String(ctl.sec.list).split(/[,;]+/).map(x => x.trim()).filter(Boolean) : [];
      sets.sec = secs.length ? secs.map(parseSec) : [{ j_sec: I.j_sec, j_b: +I.j_b, j_h: +I.j_h, j_t: +I.j_t, name: 'current' }];
      if (sets.sec.some(x => !x)) errs.push('Joist sections: use the form L50x50x5, SHS40x40x3 or C100x50x2');
      sets.at = ctl.at && ctl.at.mode === 'list' && ctl.at.list.length ? ctl.at.list : [I.j_at];
      if ((dimV.n || []).some(n => n > 8)) errs.push('Joists: at most 8 per secondary span');
    }
    if (errs.length) return { errs, cands: [], nRaw: 0 };
    const keys = Object.keys(dimV);
    let nRaw = keys.reduce((a, kk) => a * dimV[kk].length, 1) * sets.arr.length * sets.gr.length * sets.sec.length * sets.at.length;
    if (nRaw > maxCombos) return { errs: [`${COMP[k].label}: ${nRaw} combinations exceed the search limit of ${maxCombos} – use larger increments or fewer free dimensions`], cands: [], nRaw };
    const cands = [], seen = new Set(); let nGeom = 0;
    const rec = (i, cur) => {
      if (i < keys.length) { for (const v of dimV[keys[i]]) { cur[keys[i]] = v; rec(i + 1, cur); } return; }
      for (const arr of sets.arr) for (const gr of sets.gr) for (const sec of sets.sec) for (const at of sets.at) {
        const d = Object.assign({}, cur);
        for (const [a, b] of (ctl.link ? LINKS[K] : [])) d[a] = d[b];
        const ov = {};
        for (const [key, pid] of PARAMS[K]) if (d[key] !== undefined) ov[idOf(k, pid)] = d[key];
        if (K === 'C') {
          ov[k + '_arr'] = arr; ov[k + '_gr'] = gr; if (SCHEMA.GV[gr]) { ov[k + '_fy'] = SCHEMA.GV[gr][0]; ov[k + '_fu'] = SCHEMA.GV[gr][1]; }
          if (gr === I[k + '_gr']) { ov[k + '_fy'] = +I[k + '_fy']; ov[k + '_fu'] = +I[k + '_fu']; }
          const p = { H: ov[k + '_H'], Bt: ov[k + '_Bt'], Bb: ov[k + '_Bb'], Ct: ov[k + '_Ct'], Cb: ov[k + '_Cb'], t: ov[k + '_t'], r: ov[k + '_r'] };
          const outOfSchema = ['H', 'Bt', 'Bb', 'Ct', 'Cb', 't', 'r'].some(f => { const sf = SCHEMA.byId[k + '_' + f]; return sf && ((sf.min !== undefined && p[f] < sf.min) || (sf.max !== undefined && p[f] > sf.max)); });
          if (outOfSchema || SEC.validate(p).length) { nGeom++; continue; }
          d.arr = arr; d.gr = gr;
        } else if (K === 'col') {
          if (ov.col_tb * 2 >= ov.col_b || ov.col_th * 2 >= ov.col_h) { nGeom++; continue; }
        } else if (K === 'knee') {
          if (ov.k_t * 3 > Math.min(ov.k_b, ov.k_h)) { nGeom++; continue; }
          if (I.k_e2 !== '' && +I.k_e2 > 0 && +I.k_e2 >= ov.k_b) { nGeom++; continue; }
        } else if (K === 'joist') {
          Object.assign(ov, { j_sec: sec.j_sec, j_b: sec.j_b, j_h: sec.j_h, j_t: sec.j_t, j_at: at });
          d.sec = sec.name; d.at = at;
          const n = ov.j_n, L = +I.Lsb, a = Math.min(ov.j_aL, L / 2), zone = endZone(I);
          if (n > 0) {
            if (n > 1 && a < zone) { nGeom++; continue; } // joist inside the end-connection zone
            const SJ = n > 1 ? (L - 2 * a) / (n - 1) : L / 2;
            if (n > 1 && SJ < (+ctl.sMin || 0)) { nGeom++; continue; }
            if (2 * a > L) { nGeom++; continue; }
            d.positions = n === 1 ? [L / 2] : U.range(n, i => a + i * SJ); d.SJ = SJ; d.Lbr = n === 1 ? L / 2 : Math.max(a, SJ);
            for (const m of ['sbi', 'sbe']) { const rs = I[m + '_rst']; ov[m + '_rst'] = rs === 'deck' ? 'both' : rs === 'none' ? 'joist' : rs; }
          } else { d.positions = []; d.sec = '–'; d.a = +I.j_aL; Object.assign(ov, { j_aL: +I.j_aL, j_sec: I.j_sec, j_b: +I.j_b, j_h: +I.j_h, j_t: +I.j_t, j_at: I.j_at }); for (const m of ['sbi', 'sbe']) ov[m + '_rst'] = I[m + '_rst']; }
        }
        const key = JSON.stringify(ov); if (seen.has(key)) continue; seen.add(key);
        cands.push({ ov, d });
      }
    };
    rec(0, {});
    for (const c of cands) Object.assign(c, quantities(I, k, c.ov));
    return { errs: [], cands, nRaw, nGeom };
  }
  // end zone of the secondary connections (cleat / plate projection + gap): joists must stay clear of it
  const endZone = I => Math.max(+I.ci_bp + +I.ci_gap, +I.ce_bp + +I.ce_gap) + 20;
  // mass and area of a candidate (calculated from its geometry, before any analysis)
  function quantities(I, k, ov) {
    const J = Object.assign({}, I, ov), K = kind(k);
    if (K === 'C') { const p = { H: +J[k + '_H'], Bt: +J[k + '_Bt'], Bb: +J[k + '_Bb'], Ct: +J[k + '_Ct'], Cb: +J[k + '_Cb'], t: +J[k + '_t'], r: +J[k + '_r'] }; const g = SEC.gross(p, J[k + '_arr'], { gap: +J[k + '_gap'], pairSpacing: +J[k + '_ps'] }); return { mass: g.mass, A: g.A, H: p.H, t: p.t, nC: g.n, Iyy: g.Iyy }; }
    if (K === 'col') { const c = COL.props(J); return { mass: c.A * 7850e-6, A: c.A, H: +J.col_b, t: +J.col_tb }; }
    if (K === 'knee') { const a = RST.angle(+J.k_b, +J.k_h, +J.k_t), n = +J.k_nL; return { mass: n * a.A * 7850e-6, A: n * a.A, H: +J.k_b, t: +J.k_t }; }
    if (K === 'joist') { const A = joistA(J), n = +J.j_n, tot = n * (+J.nm) * (+J.nb) * (+J.Lmb) / 1e3 * A * 7850e-6; return { mass: tot, A, H: n, t: +J.j_t, perM: A * 7850e-6 }; }
    return { mass: NaN, A: NaN };
  }
  function joistA(J) { const b = +J.j_b, h = +J.j_h, t = +J.j_t; if (J.j_sec === 'box') return RST.box(b, h, t).A; if (J.j_sec === 'C') return SEC.gross({ H: h, Bt: b, Bb: b, Ct: Math.min(15, b / 3), Cb: Math.min(15, b / 3), t, r: t }, 'single').A; return RST.angle(b, h, t).A; }
  // ---------- objectives (lower score = better); "util" needs the analysis ----------
  const OBJ = {
    mass: { label: 'Minimum steel weight (default)', pre: true }, area: { label: 'Minimum cross-sectional area', pre: true },
    cost: { label: 'Minimum material cost (needs the cost data on the General tab)', pre: true }, depth: { label: 'Minimum depth subject to all checks', pre: true },
    thick: { label: 'Minimum thickness subject to all checks', pre: true }, util: { label: 'Minimum utilisation ratio within the design space', pre: false },
    bal: { label: 'Balanced: 60 % weight, 20 % depth, 20 % thickness (relative to the current design)', pre: true }
  };
  function score(obj, c, ref, I) {
    switch (obj) {
      case 'area': return c.A + c.mass * 1e-6;
      case 'cost': return c.mass * (+I.cost_kg || 0) + ((c.nC || 1) - 1) * (+I.cost_bu || 0) + c.mass * 1e-9;
      case 'depth': return c.H * 1e4 + c.mass;
      case 'thick': return c.t * 1e4 + c.mass;
      case 'bal': return 0.6 * c.mass / ref.mass + 0.2 * c.H / ref.H + 0.2 * c.t / ref.t;
      default: return c.mass + c.A * 1e-9;
    }
  }
  // ---------- classification of a check into the failure mode it represents (Cases A–G of the brief) ----------
  const CATS = [
    ['defl', 'Deflection (stiffness)', /Vertical deflection/], ['hdefl', 'Horizontal deflection', /Horizontal deflection/], ['twist', 'Twist', /Twist/],
    ['ltb', 'Lateral-torsional buckling', /Lateral-torsional|Flexure: global|LTB \+ torsion|Single C between connector/],
    ['bend', 'Bending resistance (effective section)', /Major-axis bending|Bending and shear|Axial force and bending/],
    ['shear', 'Shear / web', /Shear|Web crippling/], ['tors', 'Torsion / warping / minor-axis bending', /torsion|warping|Minor-axis/i],
    ['buckN', 'Member buckling (axial)', /buckling and N|Flexural \/ torsional|Buckling interaction/], ['bu', 'Built-up connection', /Built-up|connector|Pair-to-pair|Closely spaced/],
    ['geom', 'Geometric proportions', /Geometric proportions/], ['fork', 'End fork restraint', /End fork/]
  ];
  const catOf = c => (CATS.find(x => x[2].test(c.name)) || ['other', 'Other'])[0];
  const catLabel = k => (CATS.find(x => x[0] === k) || [k, k === 'conn' ? 'End connection (Case G)' : k === 'other' ? 'Other' : k])[1];
  function rowOf(res, key) { return res.summary.rows.find(r => r.key === key) || null; }
  const isAct = c => c && c.status !== 'N/A';
  // metrics of a component in a result (everything read from the engine output)
  function metrics(res, k, I) {
    const out = { key: k, status: 'N/A', eta: null, gov: '', govCat: '', cats: {}, fails: [], reviews: [] };
    if (!res || res.fatal) { out.status = 'REVIEW'; out.gov = 'inputs invalid'; return out; }
    const K = kind(k), rk = K === 'col' ? 'col' : k, row = rowOf(res, rk);
    const lists = [];
    if (row) lists.push(...row.list);
    if (K === 'col') { const b = rowOf(res, 'base'); if (b) lists.push(...b.list); }
    if (K === 'joist') for (const m of ['sbi', 'sbe']) { const r = rowOf(res, m); if (r) lists.push(...r.list.map(c => Object.assign({}, c, { name: c.name + ' (' + COMP[m].label + ')' }))); }
    const conn = K === 'C' ? rowOf(res, CONN_OF[k]) : null;
    const all = lists.concat(conn ? conn.list.map(c => Object.assign({}, c, { conn: true })) : []);
    const ov = CHK.overall(all);
    out.status = ov.status; out.eta = ov.eta; out.gov = ov.gov ? ov.gov.name : ''; out.govCat = ov.gov ? (ov.gov.conn ? 'conn' : ov.gov.unstable ? 'ltb' : catOf(ov.gov)) : '';
    out.unstable = !!(ov.gov && ov.gov.unstable);
    for (const c of all) {
      if (!isAct(c)) continue;
      const cat = c.conn ? 'conn' : catOf(c);
      if (!out.cats[cat] || (c.eta || 0) > (out.cats[cat].eta || 0)) out.cats[cat] = { eta: c.eta, name: c.name, Ed: c.Ed, Rd: c.Rd, unit: c.unit, fmt: c.fmt, status: c.status };
      if (c.status === 'FAIL') out.fails.push(c.name); else if (c.status === 'REVIEW') out.reviews.push(c.name);
    }
    out.member = row ? CHK.overall(row.list) : null; out.conn = conn ? CHK.overall(conn.list) : null; out.connKey = conn ? CONN_OF[k] : null;
    if (K === 'C') {
      const d = k === 'mb' ? res.mods.mb.gov : res.mods[k];
      if (d && !d.error) {
        out.mass = d.gross.mass; out.A = d.gross.A; out.p = d.spec.p; out.arr = d.spec.arr; out.gr = I[k + '_gr'];
        const rl = [...(d.spec.restr.lat || []), ...(d.spec.restr.latC || []), ...(d.spec.restr.tor || []), ...(d.spec.restr.torC || [])];
        out.restr = { n: rl.length, credited: rl.filter(r => r.credited).length, text: rl.length ? `${rl.filter(r => r.credited).length} of ${rl.length} credited` : 'fork supports only' };
        const dc = d.checks.find(c => /Vertical deflection/.test(c.name)); out.defl = dc && isAct(dc) ? { mm: dc.Ed, lim: dc.Rd } : null;
        out.mode = modeText(out, d);
      }
    } else if (K === 'col') { const c = res.mods.col.props; out.mass = c.A * 7850e-6; out.A = c.A; out.mode = out.gov ? 'Governing: ' + out.gov : ''; }
    else if (K === 'knee') { const q = quantities(I, 'knee', {}); out.mass = q.mass; out.A = q.A; out.mode = out.gov ? 'Governing: ' + out.gov : ''; }
    else if (K === 'joist') {
      const q = quantities(I, 'joist', {}); out.mass = q.mass; out.A = q.A;
      const js = ['sbi', 'sbe'].map(m => res.mods[m] && !res.mods[m].error && res.mods[m].restrInfo && res.mods[m].restrInfo.joist).filter(Boolean);
      out.joist = js.length ? { n: js[0].n, positions: js[0].positions, credited: js.every(j => j.credited), Lbr: js[0].Lbr, reason: js.map(j => j.reason).join('; ') } : { n: 0, positions: [], credited: false, reason: 'no joists' };
      out.mode = out.gov ? 'Governing: ' + out.gov : '';
    }
    return out;
  }
  // plain-language failure mode of the governing check, with the effective-section detail for bending (local vs distortional)
  function modeText(m, d) {
    const c = m.govCat;
    if (m.unstable) return `Case E – member unstable: M_Ed ≥ M_cr with the credited restraints (M_cr = ${U.fmt(d.Mcr / 1e6, 2)} kNm); the torsion-dependent checks cannot be satisfied`;
    if (c === 'bend') {
      const tp = d.eff && d.eff.P && d.eff.P.one && d.eff.P.one.steps ? d.eff.P.one.steps : {}, top = tp.top || {}, web = tp.web || {};
      if (top.chi_d !== undefined && top.chi_d < 0.999) return `Case C/D – bending resistance of the effective section: distortional buckling of the compression flange (χ_d = ${U.fmt(top.chi_d, 3)})${web.rho < 0.999 ? ' and local buckling of the web (ρ = ' + U.fmt(web.rho, 3) + ')' : ''}`;
      if ((top.rho_f !== undefined && top.rho_f < 0.999) || (web.rho !== undefined && web.rho < 0.999)) return 'Case C – bending resistance governed by local buckling (effective widths)';
      return 'Case B – bending resistance (yielding of the effective section)';
    }
    return ({ defl: 'Case A – deflection (stiffness) governs', ltb: 'Case E – lateral-torsional buckling governs', shear: 'Case F – shear / web check governs', conn: 'Case G – the end connection governs', tors: 'Torsion from the eccentric load governs (warping / minor-axis stresses)', twist: 'Twist (serviceability of the torsion) governs', hdefl: 'Horizontal deflection from the torsion governs', bu: 'Built-up connection governs', buckN: 'Member buckling under axial force governs', geom: 'Geometric proportions (EN 1993-1-3 Table 5.1)', fork: 'End fork restraint not demonstrated' })[c] || (m.gov || '');
  }
  // which parameters influence which failure mode (used to explain and to order the lever study)
  const LEVERS = { defl: ['H', 'arr', 't', 'Bt'], bend: ['t', 'H', 'Bt', 'Ct', 'arr'], ltb: ['arr', 'Bt', 't', 'H', 'Ct'], shear: ['t', 'H'], tors: ['arr', 'Bt', 't', 'H'], twist: ['arr', 'Bt', 't', 'H'], hdefl: ['arr', 'Bt', 't'], conn: ['t'], bu: [], buckN: ['t', 'Bt', 'arr'], geom: ['t', 'Ct'] };
  // ---------- safe screens (see header) ----------
  function screenData(res, k, I) {
    if (kind(k) !== 'C') return null;
    const d = k === 'mb' ? res.mods.mb.gov : res.mods[k];
    if (!d || d.error || d.spec.endKr || res.R.code === 'IS') return null;
    const sw = d.gross.A * 7850e-9 * LOADS.g, aG = d.comb.aG, L = Math.max(...d.spec.supports.slice(1).map((x, i) => x - d.spec.supports[i]));
    const Msw = aG * sw * L * L / 8, MsagLB = Math.max(0, d.env.Mmax - Msw), MhogLB = Math.max(0, -d.env.Mmin - Msw);
    const dc = d.checks.find(c => /Vertical deflection/.test(c.name) && isAct(c));
    const dsw = 5 * sw * L ** 4 / (384 * res.R.E * d.gross.Iyy);
    return { MsagLB, MhogLB, dLB: dc ? Math.max(0, dc.Ed - dsw) : 0, dlim: dc ? dc.Rd : Infinity, Iyy: d.gross.Iyy, code: res.R.code, gM0: res.R.code === 'EN' ? res.R.gM0 : 1 };
  }
  function screen(sd, I, k, c) {
    if (!sd) return { lb: 0 };
    const J = Object.assign({}, I, c.ov), p = { H: +J[k + '_H'], Bt: +J[k + '_Bt'], Bb: +J[k + '_Bb'], Ct: +J[k + '_Ct'], Cb: +J[k + '_Cb'], t: +J[k + '_t'], r: +J[k + '_r'] };
    const arr = J[k + '_arr'], opt = { gap: +J[k + '_gap'], pairSpacing: +J[k + '_ps'] }, fy = +J[k + '_fy'], E = +J.E, nu = +J.nu;
    let lbB = 0, why = '';
    try {
      if (sd.code === 'EN') {
        const eP = EN.arrangementEff(p, arr, opt, fy, E, nu, 'My+'), McP = Math.min(eP.Wtop, eP.Wbot) * fy / sd.gM0;
        lbB = sd.MsagLB / McP;
        if (sd.MhogLB > 1e3) { const eN = EN.arrangementEff(p, arr, opt, fy, E, nu, 'My-'); lbB = Math.max(lbB, sd.MhogLB / (Math.min(eN.Wtop, eN.Wbot) * fy / sd.gM0)); }
      } else { const g = SEC.gross(p, arr, opt); lbB = Math.max(sd.MsagLB, sd.MhogLB) / (0.9 * fy * Math.min(g.Wy_top, g.Wy_bot)); }
    } catch (e) { lbB = 0; }
    const lbD = sd.dLB * sd.Iyy / c.Iyy / sd.dlim;
    if (lbB > 1 + 1e-9) why = `bending lower bound η ≥ ${U.fmt(lbB, 2)}`;
    else if (lbD > 1 + 1e-9) why = `deflection lower bound η ≥ ${U.fmt(lbD, 2)}`;
    return { lb: Math.max(lbB, lbD), lbB, lbD, why };
  }
  // ---------- evaluation of one candidate with the full system model ----------
  function evaluate(Iw, k, c, baseRes) {
    const J = Object.assign({}, Iw, c.ov);
    let r; try { r = MODEL.compute(J); } catch (e) { return { status: 'REVIEW', error: String(e.message || e) }; }
    if (r.fatal) return { status: 'REVIEW', error: (r.msgs.find(m => m.level === 'error') || { text: 'invalid inputs' }).text };
    const m = metrics(r, k, J);
    // knock-on effects: a module that did not fail before must not fail now (connections, anchors, bracing, decking, column …)
    const before = {}; for (const row of baseRes.summary.rows) before[row.key] = row.status;
    const own = new Set([kind(k) === 'col' ? 'col' : k, 'base', CONN_OF[k], k === 'joist' ? 'sbi' : '', k === 'joist' ? 'sbe' : ''].filter(Boolean));
    if (kind(k) === 'col') own.delete('base');
    // a module that becomes worse (PASS → REVIEW / FAIL, REVIEW → FAIL) because of the candidate blocks it
    const rank = s => s === 'FAIL' ? 2 : s === 'REVIEW' ? 1 : 0;
    const knock = r.summary.rows.filter(row => !own.has(row.key) && before[row.key] !== undefined && rank(row.status) > rank(before[row.key])).map(row => `${row.label} (${row.status})`);
    if (kind(k) === 'col' && rowOf(r, 'base') && rank(rowOf(r, 'base').status) > rank(before.base)) knock.push(`Base plate & foundation (${rowOf(r, 'base').status})`);
    let status = m.status;
    if (status === 'PASS' && knock.length) status = 'FAIL';
    if (status === 'REVIEW' && knock.length) status = 'FAIL';
    if (k === 'joist' && status === 'PASS' && +J.j_n > 0 && !(m.joist && m.joist.credited)) status = 'FAIL';
    return { status, m, knock, sys: r.summary.overall.status, sysFail: r.summary.nFail, res: r };
  }
  // ---------- the search for one component (generator: yields after every full analysis) ----------
  function* searchComp(Iw, k, set, ctx) {
    const ctl = set.ctrl[k] || defaults(Iw, k), base = ctx.stageBase, m0 = metrics(base, k, Iw);
    const st = { key: k, label: COMP[k].label, before: m0, levers: [], log: [], evaluated: 0, screened: 0, rejectedGeom: 0, errs: [] };
    if (k === 'joist' && !(+Iw.nsbi > 0) && false) { st.errs.push('no secondaries'); return st; }
    const gen = candidates(Iw, k, ctl, set.maxCombos || 4000);
    if (gen.errs.length) { st.errs = gen.errs; st.outcome = 'invalid'; return st; }
    st.nRaw = gen.nRaw; st.rejectedGeom = gen.nGeom || 0;
    // fixed dimensions never change: assert on every candidate
    for (const [key, pid] of PARAMS[kind(k)]) {
      const linked = ctl.link && LINKS[kind(k)].find(l => l[0] === key);
      const src = linked ? ctl[linked[1]] : ctl[key];
      if (!src || src.mode === 'fixed') { const id = idOf(k, pid), cur = +Iw[id]; if (gen.cands.some(c => c.ov[id] !== undefined && Math.abs(c.ov[id] - (linked ? +Iw[idOf(k, PARAMS[kind(k)].find(p => p[0] === linked[1])[1])] : cur)) > 1e-9)) throw new Error('internal: a fixed dimension changed (' + id + ')'); }
    }
    const ref = Object.assign({ mass: m0.mass, H: kind(k) === 'C' ? +Iw[k + '_H'] : 1, t: kind(k) === 'C' ? +Iw[k + '_t'] : 1 }, quantities(Iw, k, {}));
    const obj = set.obj === 'cost' && !(+Iw.cost_kg > 0) ? 'mass' : set.obj;
    if (obj !== set.obj) st.log.push('No cost data entered (General tab): the minimum-weight objective is used instead.');
    for (const c of gen.cands) c.score = score(obj, c, ref, Iw) + (c.d.Lbr ? c.d.Lbr * 1e-9 : 0); // joists: equal mass → shorter unbraced length first
    // lever study: one step of each free parameter from the current design, full model (explains the governing mode)
    const sd = screenData(base, k, Iw);
    if (set.levers !== false && kind(k) === 'C') {
      const curKey = JSON.stringify(quantities(Iw, k, {}).H), failing = m0.status === 'FAIL';
      const order = (LEVERS[m0.govCat] || ['t', 'H', 'Bt', 'Ct', 'arr']).concat(['t', 'H', 'Bt', 'Ct', 'arr']).filter((v, i, a) => a.indexOf(v) === i);
      for (const lv of order) {
        if (st.levers.length >= 5 || ctx.cancel()) break;
        let cand = null;
        if (lv === 'arr') { const alts = gen.cands.filter(c => c.d.arr !== Iw[k + '_arr'] && ['H', 'Bt', 'Ct', 't'].every(p => Math.abs((c.ov[k + '_' + p]) - +Iw[k + '_' + p]) < 1e-9)); cand = alts.sort((a, b) => a.mass - b.mass)[0]; }
        else {
          const id = k + '_' + lv, cur = +Iw[id];
          const same = c => c.d.arr === Iw[k + '_arr'] && ['H', 'Bt', 'Ct', 't'].filter(p => p !== lv).every(p => Math.abs(c.ov[k + '_' + p] - +Iw[k + '_' + p]) < 1e-9);
          const pool = gen.cands.filter(c => same(c) && (failing ? c.ov[id] > cur + 1e-9 : c.ov[id] < cur - 1e-9)).sort((a, b) => failing ? a.ov[id] - b.ov[id] : b.ov[id] - a.ov[id]);
          cand = pool[0];
        }
        if (!cand) continue;
        const ev = evaluate(Iw, k, cand, base); ctx.evals++; st.evaluated++;
        const dEta = (m0.eta || 0) - (ev.m ? ev.m.eta || 0 : 0), dMass = cand.mass - m0.mass;
        st.levers.push({ lever: lv, desc: lv === 'arr' ? `arrangement → ${cand.d.arr}` : `${lv} ${U.fmt(+Iw[k + '_' + lv], 2)} → ${U.fmt(cand.ov[k + '_' + lv], 2)}`, eta: ev.m ? ev.m.eta : null, gov: ev.m ? ev.m.gov : ev.error, mode: ev.m ? catLabel(ev.m.govCat) : '', dMass, eff: Math.abs(dMass) > 1e-9 ? dEta / dMass : null, status: ev.status, catEta: ev.m ? (ev.m.cats[m0.govCat] || {}).eta : null });
        yield { k, phase: 'levers', msg: `${COMP[k].label}: studying ${st.levers[st.levers.length - 1].desc}` };
      }
    }
    // screens
    const pool = [];
    for (const c of gen.cands) { const sc = screen(sd, Iw, k, c); c.lb = sc.lb; if (sc.lb > 1 + 1e-9) { st.screened++; continue; } pool.push(c); }
    pool.sort((a, b) => a.score - b.score);
    st.pool = pool.length; st.nCands = gen.cands.length;
    const budget = Math.max(1, set.budget || 60), nAlt = Math.max(0, set.nAlt === undefined ? 2 : set.nAlt);
    const rows = []; let best = null, bestReview = null, nPass = 0, i = 0, stop = '';
    const needAll = !OBJ[obj].pre;
    for (; i < pool.length; i++) {
      if (ctx.cancel()) { stop = 'cancelled'; break; }
      if (st.evaluated >= budget) { stop = 'budget'; break; }
      const c = pool[i], ev = evaluate(Iw, k, c, base); ctx.evals++; st.evaluated++;
      const row = Object.assign({ d: c.d, ov: c.ov, mass: c.mass, A: c.A, score: c.score, lb: c.lb }, { status: ev.status, eta: ev.m ? ev.m.eta : null, gov: ev.m ? ev.m.gov : ev.error, govCat: ev.m ? ev.m.govCat : '', knock: ev.knock || [], fails: ev.m ? ev.m.fails : [], reviews: ev.m ? ev.m.reviews : [], m: ev.m, sys: ev.sys });
      rows.push(row);
      if (ev.status === 'PASS') { nPass++; if (needAll) { if (!best || row.eta < best.eta - 1e-12 || (Math.abs(row.eta - best.eta) < 1e-12 && row.mass < best.mass)) best = row; } else if (!best) best = row; }
      else if (ev.status === 'REVIEW' && !bestReview) bestReview = row;
      yield { k, phase: 'search', msg: `${COMP[k].label}: candidate ${i + 1} of ${pool.length} – ${row.status}${row.gov ? ' (' + row.gov + ')' : ''}`, done: i + 1, total: Math.min(pool.length, budget) };
      if (!needAll && best && nPass > nAlt) { stop = 'found'; i++; break; }
    }
    if (!stop) stop = 'exhausted';
    st.rows = rows; st.stop = stop; st.nPass = nPass;
    // Case G: the member passes but its end connection fails → search the connection parameters with the lightest member-passing section
    if (!best && set.connOpt !== false && kind(k) === 'C' && !ctx.cancel()) {
      const near = rows.filter(r => r.m && r.m.member && r.m.member.status === 'PASS' && r.m.conn && r.m.conn.status === 'FAIL' && !r.knock.length).sort((a, b) => a.score - b.score)[0];
      if (near) {
        const cn = CONN_OF[k], J0 = Object.assign({}, Iw, near.ov), cg = [];
        const nvs = [+J0[cn + '_nv'], +J0[cn + '_nv'] + 1, +J0[cn + '_nv'] + 2], p1s = [...new Set([+J0[cn + '_p1'], 60, 70, 80, 100])], ds = [...new Set([+J0[cn + '_d'], 16])], tps = [+J0[cn + '_tp'], +J0[cn + '_tp'] + 1, +J0[cn + '_tp'] + 3];
        for (const nv of nvs) for (const p1 of p1s) for (const d of ds) for (const tp of tps) cg.push({ ov: Object.assign({}, near.ov, { [cn + '_nv']: nv, [cn + '_nvs']: Math.max(+J0[cn + '_nvs'], nv), [cn + '_p1']: p1, [cn + '_d']: d, [cn + '_tp']: tp }), cost: nv * 10 + (d > 12 ? 5 : 0) + tp + p1 / 1000, d: Object.assign({}, near.d, { conn: `${cn}: ${nv} rows @ ${p1}, M${d}, t_p ${tp}` }), mass: near.mass, A: near.A, score: near.score });
        cg.sort((a, b) => a.cost - b.cost);
        st.connSearch = { tried: 0, from: near.d };
        for (const c of cg) {
          if (ctx.cancel() || st.evaluated >= budget + 30) break;
          const ev = evaluate(Iw, k, c, base); ctx.evals++; st.evaluated++; st.connSearch.tried++;
          yield { k, phase: 'conn', msg: `${COMP[k].label}: connection governs – trying ${c.d.conn}` };
          if (ev.status === 'PASS') { best = Object.assign({ d: c.d, ov: c.ov, mass: c.mass, A: c.A, score: c.score }, { status: 'PASS', eta: ev.m.eta, gov: ev.m.gov, govCat: ev.m.govCat, knock: [], fails: [], reviews: ev.m.reviews, m: ev.m, connChanged: true }); rows.push(best); break; }
        }
      }
    }
    st.best = best; st.bestReview = best ? null : bestReview;
    // "infeasible" only when every permitted candidate was analysed or safely screened; otherwise the search was cut short
    st.outcome = best ? 'feasible' : bestReview ? 'review' : stop === 'cancelled' ? 'cancelled' : stop === 'budget' ? 'budget' : 'infeasible';
    st.optimal = best && (stop === 'found' || stop === 'exhausted') && !best.connChanged && OBJ[obj].pre ? 'optimum of the permitted grid (best-first search with safe screens)' : best && needAll && stop === 'exhausted' ? 'optimum of the permitted grid (all candidates analysed)' : best ? 'best feasible solution found within the search limits – not necessarily the global optimum' : '';
    if (!best) {
      // explain which checks keep failing and which limits block a solution
      const tally = {};
      for (const r of rows) for (const f of r.fails.concat(r.knock.map(x => 'causes a failure in: ' + x))) tally[f] = (tally[f] || 0) + 1;
      st.unsatisfied = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, c]) => `${n} (fails in ${c} of ${rows.length} analysed candidates)`);
      st.blocking = blocking(ctl, k, m0, st);
    }
    return st;
  }
  // limits that prevent a feasible solution (the dimensions that would help the governing mode but are fixed or at their maximum)
  function blocking(ctl, k, m0, st) {
    if (k === 'joist') {
      const out = ['number of joists limited to ' + (ctl.n.mode === 'fixed' ? 'the current value' : ctl.n.mode === 'list' ? 'the list ' + ctl.n.list : 'max ' + ctl.n.max)];
      const tw = (st.rows || []).length && (st.rows || []).every(r => (r.fails || []).some(f => /Twist|torsion/.test(f)));
      if (tw) out.push('the governing failure is torsion / twist of a single C from the eccentric load: lateral restraint by joists does not stop the rotation (the free flange still swings); a demonstrated torsional restraint (deck C_D) or a back-to-back arrangement is needed');
      return out;
    }
    if (kind(k) !== 'C') return st.screened && !st.pool ? ['every candidate is screened out by bending / deflection – allow larger sections'] : ['the permitted values are all too small or too weak'];
    const out = [];
    for (const lv of (LEVERS[m0.govCat] || ['t', 'H'])) {
      if (lv === 'arr') { if (!ctl.arr || ctl.arr.mode === 'fixed') out.push(`arrangement is fixed (${m0.arr === 'single' ? 'a back-to-back' : m0.arr === 'b2b' && k === 'mb' ? 'a four-C' : 'another'} arrangement may help)`); continue; }
      const c = ctl[lv]; if (!c) continue;
      if (c.mode === 'fixed') out.push(`${lv} is fixed`); else out.push(`${lv} limited to ${c.mode === 'list' ? 'the list ' + c.list : 'max ' + c.max}`);
    }
    if (st.screened && !st.pool) out.push(`all ${st.screened} candidates fail the bending / deflection lower bound`);
    if (st.stop === 'budget') out.push('search stopped at the analysis budget – increase it');
    return out;
  }
  // ---------- whole run (individual or whole-system) ----------
  function* run(Iuser, set, cancelFn = () => false) {
    const t0 = Date.now(), Inorm = MODEL.normalise(Iuser).I, snapshot = JSON.parse(JSON.stringify(Iuser));
    const base0 = MODEL.compute(Inorm);
    if (base0.fatal) return { error: 'The current inputs are invalid: correct them before optimising.', snapshot };
    const comps = (set.mode === 'single' ? [set.one] : ORDER.filter(k => set.sel && set.sel[k])).filter(k => COMP[k]);
    if (!comps.length) return { error: 'Select at least one component.', snapshot };
    // validate every component's controls before any analysis
    const errs = []; for (const k of comps) { const g = candidates(Inorm, k, set.ctrl[k] || defaults(Inorm, k), set.maxCombos || 4000); errs.push(...g.errs); if (!g.errs.length && !g.cands.length) errs.push(`${COMP[k].label}: no geometrically valid candidate in the permitted ranges`); }
    if (set.obj === 'cost' && !(+Inorm.cost_kg > 0)) errs.push('Minimum cost needs a steel price per kg (General tab → Cost data).');
    if (errs.length) return { error: 'Input ranges are not valid:', errs, snapshot };
    const ctx = { evals: 0, cancel: cancelFn, stageBase: base0 };
    let Iw = Object.assign({}, Inorm);
    const stages = [];
    const passes = set.mode === 'single' ? 1 : 2;
    for (let pass = 1; pass <= passes; pass++) {
      let todo = comps;
      if (pass > 1) { const cur = MODEL.compute(Iw); todo = comps.filter(k => { const m = metrics(cur, k, Iw); return m.status === 'FAIL'; }); if (!todo.length) break; ctx.stageBase = cur; }
      for (const k of todo) {
        if (cancelFn()) break;
        if (pass > 1 || stages.length) ctx.stageBase = MODEL.compute(Iw);
        if (k === 'sbi' && !(+Iw.nsbi > 0)) { stages.push({ key: k, label: COMP[k].label, outcome: 'n/a', errs: ['No SB-Int in this layout'] }); continue; }
        const st = yield* searchComp(Iw, k, set, ctx);
        st.pass = pass; stages.push(st);
        if (st.best) Object.assign(Iw, st.best.ov);
      }
    }
    // recalculate the complete affected system with every accepted change
    const final = MODEL.compute(Iw), ov = {};
    for (const key in Iw) if (String(Iw[key]) !== String(Inorm[key])) ov[key] = Iw[key];
    const comp = comps.map(k => ({ key: k, label: COMP[k].label, before: metrics(base0, k, Inorm), after: metrics(final, k, Iw), dimsBefore: dims(Inorm, k), dimsAfter: dims(Iw, k) }));
    return { snapshot, inputsBefore: Inorm, inputsAfter: Iw, ov, base: base0, final, stages, comp, comps, evals: ctx.evals, ms: Date.now() - t0, cancelled: cancelFn(), obj: set.obj, mode: set.mode, when: new Date().toISOString() };
  }
  // human-readable dimensions of a component
  function dims(I, k) {
    const K = kind(k);
    if (K === 'C') { const a = I[k + '_arr']; return `${a === 'single' ? '' : a === 'b2b' ? '2× ' : '4× '}C${+I[k + '_H']}×${+I[k + '_Bt']}${+I[k + '_Bb'] !== +I[k + '_Bt'] ? '/' + +I[k + '_Bb'] : ''}×${+I[k + '_Ct']}${+I[k + '_Cb'] !== +I[k + '_Ct'] ? '/' + +I[k + '_Cb'] : ''}×${+I[k + '_t']} r${+I[k + '_r']} ${I[k + '_gr']}`; }
    if (K === 'col') return `${I.col_type === 'weld' ? 'Box' : 'RHS'} ${+I.col_b}×${+I.col_h}×${+I.col_tb}${+I.col_th !== +I.col_tb ? '/' + +I.col_th : ''}`;
    if (K === 'knee') return `${I.k_nL === '2' ? '2× ' : ''}L${+I.k_b}×${+I.k_h}×${+I.k_t}`;
    if (K === 'joist') return +I.j_n > 0 ? `${+I.j_n} × ${I.j_sec === 'box' ? 'SHS' : I.j_sec}${I.j_sec === 'C' ? +I.j_h + '×' + +I.j_b : +I.j_b + '×' + +I.j_h}×${+I.j_t}, a = ${+I.j_aL} mm, at the ${I.j_at === 'top' ? 'top flange' : I.j_at === 'bot' ? 'bottom flange' : 'web'}` : 'none';
    return '';
  }
  // re-verify a proposal against the CURRENT inputs (no stale results: both designs are recomputed now)
  function verify(Iuser, ov, comps) {
    const Inorm = MODEL.normalise(Iuser).I, Iw = Object.assign({}, Inorm, ov);
    const base = MODEL.compute(Inorm), final = MODEL.compute(Iw);
    if (base.fatal || final.fatal) return { error: 'The inputs are invalid: no comparison can be made.' };
    return { base, final, inputsBefore: Inorm, inputsAfter: Iw, comp: comps.map(k => ({ key: k, label: COMP[k].label, before: metrics(base, k, Inorm), after: metrics(final, k, Iw), dimsBefore: dims(Inorm, k), dimsAfter: dims(Iw, k) })) };
  }
  // synchronous driver (tests)
  function runSync(I, set, cancelFn) { const g = run(I, set, cancelFn); let r; do { r = g.next(); } while (!r.done); return r.value; }

  // ---------- v1.0 interface kept for compatibility (Summary tab of v1.0, regression test R9) ----------
  function grid(I, m, g) {
    const pre = MEM_KEYS[m], out = [];
    const Hs = list(g.H), Bs = list(g.B), Cs = list(g.C).concat(String(g.C).split(/[,;\s]+/).includes('0') ? [0] : []), ts = list(g.t);
    const arrs = (g.arr && g.arr.length ? g.arr : [I[pre + 'arr']]).filter(a => m === 'mb' || a !== 'quad');
    for (const arr of arrs) for (const H of Hs) for (const B of Bs) for (const C of Cs) for (const t of ts) {
      const p = { H, Bt: B, Bb: B, Ct: C, Cb: C, t, r: +I[pre + 'r'] };
      if (SEC.validate(p).length) continue;
      out.push({ arr, H, B, C, t, r: p.r, p });
    }
    return out;
  }
  function prepare(I, base, m, g) {
    const pre = MEM_KEYS[m], sd = screenData(base, m, I), cands = grid(I, m, g);
    const rows = cands.map(c => { const ov = { [pre + 'arr']: c.arr, [pre + 'H']: c.H, [pre + 'Bt']: c.B, [pre + 'Bb']: c.B, [pre + 'Ct']: c.C, [pre + 'Cb']: c.C, [pre + 't']: c.t }; const q = quantities(I, m, ov); const sc = screen(sd, I, m, Object.assign({ ov }, q)); return Object.assign(c, q, { quick: sc.lb }); });
    const keep = rows.filter(c => c.quick <= 1.0).sort((a, b) => a.mass - b.mass);
    return { all: rows.length, screened: rows.length - keep.length, cands: keep };
  }
  function evalOne(I, m, c) { const ev = evaluate(I, m, { ov: apply(m, c) }, MODEL.compute(I)); return Object.assign({}, c, { status: ev.status, eta: ev.m ? ev.m.eta : null, gov: ev.m ? ev.m.gov : ev.error }); }
  const apply = (m, c) => { const pre = MEM_KEYS[m]; return { [pre + 'arr']: c.arr, [pre + 'H']: c.H, [pre + 'Bt']: c.B, [pre + 'Bb']: c.B, [pre + 'Ct']: c.C, [pre + 'Cb']: c.C, [pre + 't']: c.t }; };

  return { COMP, ORDER, PARAMS, LINKS, OBJ, CATS, verify, defaults, values, candidates, quantities, metrics, screenData, screen, evaluate, run, runSync, dims, parseSec, catLabel, kind, endZone,
    grid, prepare, evalOne, apply, list, CONN_OF };
})();

