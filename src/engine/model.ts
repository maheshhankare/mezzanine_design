// @ts-nocheck — ported verbatim from the mockup (index.html, 85_model.js); logic unchanged so results match the mockup.
import { LOADS } from './loads';
import { SEC } from './section';
import { RST } from './restraint';
import { U } from './util';
import { COL } from './column';
import { SCHEMA } from './schema';
import { CHK } from './check';
import { MEM } from './member';
import { CONN } from './conn';
import { RES } from './resist';
import { FE } from './fe';
// ===== Orchestrator: inputs → load path → members, connections, column, restraints → summary =====
export const MODEL: any = (() => {
  const kN = x => x / 1e3, s = CHK.s;
  // External global frame analysis (set only by the unified Mezzanine app; null in this tool = the published behaviour):
  // { beam(dir, spec, ctx) → analyse function or null, system(ctx) → column / knee / bracing / base forces }
  let EXT = null;
  function normalise(raw) {
    const I = SCHEMA.defaults();
    for (const k in raw) if (k in I) I[k] = raw[k];
    const msgs = [];
    for (const f of SCHEMA.T) {
      if (f.tabDef || f.type !== 'n') continue;
      const v = I[f.id];
      if (v === '' || v === null || v === undefined) { if (f.opt) { I[f.id] = ''; continue; } msgs.push({ id: f.id, tab: f.tab, level: 'error', text: `${f.label}: a value is required` }); I[f.id] = f.def; continue; }
      const x = Number(v);
      if (!isFinite(x)) { msgs.push({ id: f.id, tab: f.tab, level: 'error', text: `${f.label}: not a number` }); I[f.id] = f.def; continue; }
      if (f.min !== undefined && x < f.min) msgs.push({ id: f.id, tab: f.tab, level: 'error', text: `${f.label}: ${x} is below the minimum ${f.min}` });
      if (f.max !== undefined && x > f.max) msgs.push({ id: f.id, tab: f.tab, level: 'error', text: `${f.label}: ${x} is above the maximum ${f.max}` });
      if (f.int && Math.round(x) !== x) msgs.push({ id: f.id, tab: f.tab, level: 'warn', text: `${f.label}: rounded to ${Math.round(x)}` });
      I[f.id] = x;
    }
    // grade consistency
    for (const m of ['mb_', 'sbi_', 'sbe_']) {
      const gv = SCHEMA.GV[I[m + 'gr']];
      if (gv && (Math.abs(gv[0] - I[m + 'fy']) > 0.5 || Math.abs(gv[1] - I[m + 'fu']) > 0.5)) msgs.push({ id: m + 'fy', tab: m.replace('_', ''), level: 'warn', text: `f_y / f_u (${I[m + 'fy']} / ${I[m + 'fu']}) differ from grade ${I[m + 'gr']} (${gv[0]} / ${gv[1]}): the entered values are used` });
      if (I[m + 'fu'] <= I[m + 'fy']) msgs.push({ id: m + 'fu', tab: m.replace('_', ''), level: 'error', text: 'f_u must exceed f_y' });
    }
    return { I, msgs };
  }
  const sec = (I, m) => ({ H: I[m + 'H'], Bt: I[m + 'Bt'], Bb: I[m + 'Bb'], Ct: I[m + 'Ct'], Cb: I[m + 'Cb'], t: I[m + 't'], r: I[m + 'r'] });
  const bu = (I, m) => ({ type: I[m + 'buT'], a: I[m + 'buA'], Lw: I[m + 'buL'], s: I[m + 'buS'], n: I[m + 'buN'], d: I[m + 'buD'], bg: I[m + 'buBg'], fuw: I[m + 'buFu'], pcs: I[m + 'pcs'], pcT: I[m + 'pcT'], pcW: I[m + 'pcW'], pcS: I[m + 'pcS'] });
  const connIn = (I, c) => { const o = {}; for (const k in I) if (k.startsWith(c)) o[k.slice(c.length)] = I[k]; return o; };
  const swN = A => A * 7850e-9 * LOADS.g; // N/mm self-weight

  // Load Application Convention → line of action of the distributed load relative to the shear centre.
  // e = horizontal eccentricity of the load line to the SC (torque m_T = q e); aLT = load height above the SC used in the LTB eigen-analysis.
  // The CG is never equated with the SC: with the CG convention e = y_CG − y_SC, which is non-zero for a single C.
  function loadPoint(I, choice, p, g, arr, m) {
    const conv = !choice || choice === 'glob' ? I.lc_conv : choice;
    const zTop = g.ex.z1 - g.zsc, dyc = g.yc - g.ysc, dzc = g.zc - g.zsc;
    let e = 0, z = zTop, y = g.ysc, label = '';
    if (conv === 'cg') { e = dyc; z = dzc; y = g.yc; label = 'through the centroid (CG)'; }
    else if (conv === 'flange') { y = arr === 'single' ? (p.Bt - p.t) / 2 : g.yc; e = y - g.ysc; z = zTop; label = 'on the top flange at mid-width'; }
    else if (conv === 'sc') { e = 0; z = I.lc_h === 'top' ? zTop : 0; y = g.ysc; label = 'through the shear centre (idealised, acknowledged)'; }
    else if (conv === 'user') { e = +I[m + 'e'] || 0; y = g.ysc + e; label = 'user eccentricity to the shear centre'; }
    if (Math.abs(e) < 1e-6) e = 0;
    const aLT = I.lc_h === 'top' ? zTop : z;
    const cl = v => Math.abs(v) < 1e-6 ? 0 : v;
    return { conv, choice: choice || 'glob', e, y: cl(y), z: cl(z), aLT, label, dyc: cl(dyc), dzc: cl(dzc), yc: cl(g.yc), zc: cl(g.zc), ysc: cl(g.ysc), zsc: cl(g.zsc), zTop,
      ltbNote: I.lc_h === 'top' ? 'LTB load height: top flange (where the floor bears)' : 'LTB load height: at the convention reference point' };
  }
  function compute(raw) {
    const { I, msgs } = normalise(raw);
    const R = LOADS.route(I), E = R.E, nu = +I.nu;
    const out = { I, R, msgs, mods: {} };
    const P = RES.provider(R);
    // sections
    const pM = sec(I, 'mb_'), pI = sec(I, 'sbi_'), pE = sec(I, 'sbe_');
    for (const [p, m, tab] of [[pM, 'Main beam', 'mb'], [pI, 'SB-Int', 'sbi'], [pE, 'SB-End', 'sbe']]) for (const e of SEC.validate(p)) msgs.push({ id: tab + '_H', tab, level: 'error', text: `${m}: ${e}` });
    const usesSC = I.lc_conv === 'sc' && ['sbi_ecc', 'sbe_ecc', 'mb_lcu'].some(k => I[k] === 'glob') || ['sbi_ecc', 'sbe_ecc', 'mb_lcu'].some(k => I[k] === 'sc');
    if (usesSC && (I.lc_ack !== 'yes' || !String(I.lc_just || '').trim())) msgs.push({ id: 'lc_ack', tab: 'gen', level: 'error', text: 'Shear-centre (no-torsion) loading is selected: tick the acknowledgement and describe the physical load path that enforces it, or choose the CG / top-flange convention' });
    // any invalid input stops the calculation: no result (and so no PASS) is produced from a substituted value
    if (msgs.some(m => m.level === 'error')) { out.fatal = true; return out; }
    const optOf = m => ({ gap: I[m + 'gap'], pairSpacing: I[m + 'ps'] });
    const gM = SEC.gross(pM, I.mb_arr, optOf('mb_')), gI = SEC.gross(pI, I.sbi_arr, optOf('sbi_')), gE = SEC.gross(pE, I.sbe_arr, optOf('sbe_'));
    out.gross = { mb: gM, sbi: gI, sbe: gE };
    // layout
    const lay = LOADS.sbPositions(I); for (const m of lay.msg) msgs.push({ id: 'xsbi', tab: 'gen', level: 'error', text: m });
    if (lay.msg.length) { out.fatal = true; return out; }
    const xs = lay.x, Lmb = +I.Lmb, Lsb = +I.Lsb, trib = LOADS.tributary(I, xs);
    const pts = [0, ...xs, Lmb], sbSpacing = Math.max(...pts.slice(1).map((v, i) => v - pts[i]));
    out.layout = { xs, trib, sbSpacing, nLinesMB: I.nm + 1, nCol: (I.nb + 1) * (I.nm + 1) };
    // area loads
    const Gk = LOADS.kg2kN(+I.d_sw + +I.qG), Qk = LOADS.kg2kN(+I.qQ); // kN/m²
    const combArea = LOADS.uls(R, I, Gk, Qk);
    out.area = { Gk, Qk, comb: combArea, qEd: combArea.aG * Gk + combArea.aQ * Qk };
    // decking vertical
    out.mods.deck = { vert: RST.deckVertical({ R: Object.assign({ E }, R), I, span: sbSpacing, comb: combArea }) };
    // ---------- connections (stiffness pass with unit forces) ----------
    const memInfo = (p, arr, m, g, L) => ({ p, arr, fy: I[m + 'fy'], fu: I[m + 'fu'], I: g.Iyy, L, gap: I[m + 'gap'] });
    const colSup = { kind: 'col', col: { t0: +I.col_tb, b0: +I.col_b, fy: +I.col_fy, fu: +I.col_fu } };
    const colSupH = { kind: 'col', col: { t0: +I.col_th, b0: +I.col_h, fy: +I.col_fy, fu: +I.col_fu } };
    const mbSup = { kind: 'mb', mb: { p: pM, arr: I.mb_arr, fy: I.mb_fy, fu: I.mb_fu } };
    const conn0 = (key, mem, sup, V, N, Mj, extra = {}) => CONN.design(Object.assign({ R, P, c: connIn(I, key + '_'), mem, sup, V, N, Mj, E, title: TITLES[key], eccTo: key === 'ci' ? I.mb_ecc : 'sb' }, extra));
    const TITLES = { ci: 'Connection SB-Int → main beam', ce: 'Connection SB-End → box column', cm: 'Connection main beam → box column' };
    const LsbSpan = Lsb, mI = memInfo(pI, I.sbi_arr, 'sbi_', gI, LsbSpan), mE = memInfo(pE, I.sbe_arr, 'sbe_', gE, LsbSpan), mM = memInfo(pM, I.mb_arr, 'mb_', gM, Lmb);
    let ci = conn0('ci', mI, mbSup, 1e3, 0, 0), ce = conn0('ce', mE, colSupH, 1e3, 0, 0), cm = conn0('cm', mM, colSup, 1e3, 0, 0);
    // ---------- secondary beams ----------
    const kneeTo = I.k_use === 'yes' ? I.k_to : null;
    const kneeOn = b => kneeTo === b || kneeTo === 'both';   // knee braces column → main beam ('mb') / column → SB-End ('sbe')
    // knee braces in the beam analysis (engine model; the global analysis of the unified app replaces it by the frame): an elastic
    // vertical support at a + half the column depth from each column axis (stiffness: see below; columns rigid). Without it (k_an = 'no') the braces are checked for the sway force only, as before v1.6.
    const kneeSprings = (b, L, supports) => {
      if (!kneeOn(b) || I.k_an === 'no') return null;
      const th = +I.k_th * Math.PI / 180, a = +I.k_a, Lkb = a / Math.cos(th), A = (+I.k_nL) * RST.angle(+I.k_b, +I.k_h, +I.k_t).A, cp = COL.props(I);
      // vertical stiffness of the knee point: the brace (axial, k_a = E A / L_KB) in series with the beam's axial stiffness that holds the
      // brace's horizontal component (k_b: the beam segment to the column node and the half segment to the opposite knee, in parallel):
      // k = sin²θ / (1/k_a + cos²θ/k_b). Without the beam term the knee would be too stiff (more hogging, less sagging than a frame)
      const off = (b === 'mb' ? cp.h : cp.b) / 2 + a, ka = E * A / Lkb, Ab = (b === 'mb' ? gM : gE).A, out = [];
      if (!(ka > 0) || !(a > 0) || !(Ab > 0)) return null;
      const xs0 = supports.slice().sort((p, q) => p - q);
      for (const x of xs0) for (const sg of [1, -1]) {
        const xk = x + sg * off; if (!(xk > 1e-6 && xk < L - 1e-6)) continue;
        const nb = xs0.find(y => sg > 0 ? y > x + 1e-6 : false) ?? [...xs0].reverse().find(y => sg < 0 ? y < x - 1e-6 : false), inner = nb === undefined ? (sg > 0 ? L - xk : xk) : (Math.abs(nb - x) - 2 * off) / 2;
        const kb = E * Ab * (1 / off + (inner > 1 ? 1 / inner : 0)), k = Math.sin(th) ** 2 / (1 / ka + Math.cos(th) ** 2 / kb);
        out.push({ x: xk, k, ka, kb });
      }
      return out.length ? out : null;
    };
    function secondarySpec(m, p, g, tribW, conn, label) {
      const o = secondarySpec0(m, p, g, tribW, conn, label);
      if (EXT && m === 'sbe_') o.ga = EXT.beam('Y', o, { I, R, E, gM, gE, pM, pE, xs, ci, ce, cm, sbi: out.mods.sbi, reactionsGQ, swN });
      return o;
    }
    function secondarySpec0(m, p, g, tribW, conn, label) {
      const arr = I[m + 'arr'], L = I.sbCont === 'cont' ? I.nm * Lsb : Lsb;
      const supports = I.sbCont === 'cont' ? U.range(I.nm + 1, i => i * Lsb) : [0, Lsb];
      const wG = Gk * 1e-3 * tribW + swN(g.A), wQ = Qk * 1e-3 * tribW;
      const lp = loadPoint(I, I[m + 'ecc'], p, g, arr, m), zTop = g.ex.z1 - g.zsc, eUdl = lp.e;
      return {
        key: m.replace('_', ''), title: label, R, I, p, arr, opt: optOf(m), mat: { fy: I[m + 'fy'], fu: I[m + 'fu'], E, nu },
        L, supports, G: { udl: [{ x0: 0, x1: L, w: wG }], points: [] }, Q: { udl: [{ x0: 0, x1: L, w: wQ }], points: [] },
        loadA: lp.aLT, eUdl, lp, N: (+I[m + 'N'] || 0) * 1e3, restr: { lat: [], latC: [], tor: [], torC: [] }, bu: bu(I, m),
        dl: I[m + 'dl'], twist: I[m + 'tw'], ss: 0, stiffSupport: conn.geo.hp >= 0.5 * (p.H - 2 * p.t), endKr: I[conn === ci ? 'ci_cls' : 'ce_cls'] === 'semi' ? conn.stiff.Sj : null,
        trib: tribW, wG, wQ, knees: m === 'sbe_' ? kneeSprings('sbe', L, supports) : null
      };
    }
    const tribI = Math.max(0, ...trib.sbi), tribE = I.sbe_pos === 'edge' ? trib.sbeEdge : trib.sbeInt;
    const restrSB = (spec, g, label, MEd) => {
      const rs = I[spec.key + '_rst'], info = { deck: null, joist: null, list: [] };
      const zTop = g.ex.z1 - g.zsc, zBot = g.zsc - g.ex.z0;
      if (rs === 'deck' || rs === 'both') {
        const pre = spec.prelimT;
        const dr = RST.deckRestraint({ R, I, mem: { E, nu, g: spec.arr === 'single' ? g : SEC.gross(spec.p, 'single'), p: spec.p }, L: spec.L, label, MEd, sbSpacing, nLines: xs.length + 2, latCmax: pre ? pre.latCmax : 0 });
        info.deck = dr;
        const r1 = { x0: 0, x1: spec.L, k: dr.k, a: zTop, credited: dr.lateral, label: 'Surface / decking (continuous, top flange)', why: dr.status };
        spec.restr.latC.push(r1); info.list.push(r1);
        if (dr.tors) { const r2 = { x0: 0, x1: spec.L, k: dr.CD, credited: true, label: 'Surface C_D (continuous torsional)', why: 'C_D from test / manufacturer' }; spec.restr.torC.push(r2); info.list.push(r2); }
      }
      if (rs === 'joist' || rs === 'both') {
        const jr = RST.joists({ R, I, sec: { p: spec.p, fu: spec.mat.fu }, Lsb: spec.L, Lj: sbSpacing, MEdSB: MEd, hSB: spec.p.H - spec.p.t });
        info.joist = jr;
        const a = I.j_at === 'top' ? zTop : I.j_at === 'bot' ? -zBot : 0;
        for (const x of jr.positions) { const r = { x, k: jr.k, a, credited: jr.credited, label: `Joist at ${Math.round(x)} mm`, why: jr.reason }; spec.restr.lat.push(r); info.list.push(r); }
      }
      return info;
    };
    function runSecondary(m, p, g, tribW, conn, label) {
      const spec = secondarySpec(m, p, g, tribW, conn, label);
      if (kneeTo === 'sbe' && m === 'sbe_') spec.kneeHook = true;
      // preliminary analysis for M_Ed and the torsion spring forces
      const pre = MEM.design(Object.assign({}, spec, { restr: { lat: [], latC: [], tor: [], torC: [] } }));
      if (pre.error) return { error: pre.error };
      const MEd = Math.max(pre.env.Mmax, -pre.env.Mmin);
      const sp2 = secondarySpec(m, p, g, tribW, conn, label);
      // with the deck credited the spring force is taken from a torsion run with the deck springs
      const info = restrSB(sp2, g, label, MEd);
      if (info.deck && info.deck.lateral) {
        const tmp = MEM.design(sp2); if (!tmp.error && tmp.tU && !tmp.tU.error) { sp2.prelimT = tmp.tU; const sp3 = secondarySpec(m, p, g, tribW, conn, label); const info3 = restrSB(sp3, g, label, MEd); return finishSecondary(sp3, info3, conn, label); }
      }
      return finishSecondary(sp2, info, conn, label);
    }
    function finishSecondary(spec, info, conn, label) {
      const d = MEM.design(spec);
      d.spec = spec; d.restrInfo = info;
      return d;
    }
    const sbi = I.nsbi > 0 ? runSecondary('sbi_', pI, gI, tribI, ci, 'SB-Int') : null;
    out.mods.sbi = sbi;
    let kn = null;
    const sbe = runSecondary('sbe_', pE, gE, tribE, ce, 'SB-End');
    out.mods.sbi = sbi; out.mods.sbe = sbe;
    // ---------- main beam ----------
    const RsbiG = sbi && !sbi.error ? reactionsGQ(sbi) : { G: 0, Q: 0 };
    const RsbeGQ = sbe && !sbe.error ? reactionsGQ(sbe) : { G: 0, Q: 0 };
    const mbDesigns = {};
    const mbOffset = (I.mb_arr === 'single' ? pM.t / 2 : (I.mb_gap / 2 + pM.t)) + (+I.ci_tp) / 2; // web face to cleat mid-plane
    for (const line of ['interior', 'edge']) {
      if (line === 'interior' && I.nm < 2) continue;
      const sides = line === 'interior' ? 2 : 1;
      const L = I.mbCont === 'cont' ? I.nb * Lmb : Lmb, supports = I.mbCont === 'cont' ? U.range(I.nb + 1, i => i * Lmb) : [0, Lmb];
      const xsAll = I.mbCont === 'cont' ? U.range(I.nb).flatMap(k => xs.map(x => x + k * Lmb)) : xs;
      const off = I.mb_ecc === 'mb' ? ci.e : mbOffset;
      const torques = xsAll.map(x => ({ x, TG: line === 'edge' ? RsbiG.G * off : 0, TQ: RsbiG.Q * off })); // interior: pattern (imposed load on one side only)
      const lpM = loadPoint(I, I.mb_lcu, pM, gM, I.mb_arr, 'mb_');
      const spec = {
        key: 'mb', title: `Main beam (${line} line)`, R, I, p: pM, arr: I.mb_arr, opt: optOf('mb_'), mat: { fy: I.mb_fy, fu: I.mb_fu, E, nu },
        L, supports, G: { udl: [{ x0: 0, x1: L, w: swN(gM.A) + I.mb_gU }], points: xsAll.map(x => ({ x, P: sides * RsbiG.G })) },
        Q: { udl: [{ x0: 0, x1: L, w: +I.mb_qU }], points: xsAll.map(x => ({ x, P: sides * RsbiG.Q })) },
        loadA: lpM.aLT, lp: lpM, pointA: (pM.H / 2) - ci.geo.zg, eUdl: lpM.e, torques, N: (+I.mb_N || 0) * 1e3,
        restr: { lat: [], latC: [], tor: [], torC: [] }, bu: bu(I, 'mb_'), dl: I.mb_dl, twist: I.mb_tw, ss: I.mb_ss, stiffSupport: cm.geo.hp >= 0.5 * (pM.H - 2 * pM.t),
        endKr: I.mb_sup === 'semi' ? cm.stiff.Sj : null, line, sides, knees: kneeSprings('mb', L, supports)
      };
      if (EXT) spec.ga = EXT.beam('X', spec, { I, R, E, gM, gE, pM, pE, xs, ci, ce, cm, sbi, sbe, RsbiG, RsbeGQ, reactionsGQ, swN, line, sides });
      // preliminary run for M_Ed (brace force), then restraint crediting
      const pre = MEM.design(spec);
      if (pre.error) { mbDesigns[line] = pre; continue; }
      const MEd = Math.max(pre.env.Mmax, -pre.env.Mmin), ho = pM.H - pM.t;
      const brace = RST.nodalBrace(MEd, ho, sbSpacing);
      // SB-Int connection checked with the brace force (axial) to decide whether the restraint can be credited
      const ciR = sbi && !sbi.error ? conn0('ci', mI, mbSup, Math.max(...sbi.Rmax), brace.Pbr, 0, { bothSides: sides === 2 }) : null;
      const Esb = E * gI.A / Lsb, Kc = ciR ? ciR.stiff.Kc : 0, Klat = Kc > 0 ? 1 / (1 / Esb + 1 / Kc) : 0;
      const connOK = ciR && ciR.overall.status === 'PASS';
      const anch = I.mb_anch === 'yes';
      const credit = I.mb_lat === 'auto' && anch && connOK;
      const why = I.mb_lat !== 'auto' ? 'not credited by choice' : !anch ? 'SB-Int lines not anchored' : !connOK ? 'SB-Int connection does not pass with the restraint force' : 'demonstrated: stiffness in the LTB model, strength checked';
      const aR = pM.H / 2 - ci.geo.zg;
      for (const x of xsAll) spec.restr.lat.push({ x, k: sides * Klat, a: aR, credited: credit && Klat > 0, label: `SB-Int at ${Math.round(x)} mm`, why });
      const torCredit = I.mb_tor === 'auto' && ciR && ciR.stiff.cls !== 'nominally pinned' && connOK;
      if (torCredit) for (const x of xsAll) { const bt = sides / (1 / ciR.stiff.Sj + 1 / (2 * E * gI.Iyy / Lsb)); spec.restr.tor.push({ x, k: bt, credited: true, label: `SB-Int torsional at ${Math.round(x)} mm`, why: 'connection classified semi-rigid / rigid' }); }
      if (I.d_mb === 'yes') {
        const dr = RST.deckRestraint({ R, I, mem: { E, nu, g: gM, p: pM }, L, label: 'Main beam', MEd, sbSpacing, nLines: 1, latCmax: 0 });
        spec.restr.latC.push({ x0: 0, x1: L, k: dr.k, a: gM.ex.z1 - gM.zsc, credited: dr.lateral, label: 'Surface on the main-beam top flange', why: dr.status });
        spec.deckR = dr;
      }
      const d = MEM.design(spec); d.spec = spec; d.brace = brace; d.Klat = Klat; d.restrWhy = why; d.ciR = ciR;
      if (!d.error && xsAll.length && !(credit && Klat > 0)) d.notes.push(`SB-Int lateral restraints are not credited (${why}); the main beam is checked for LTB between its end forks only.`);
      mbDesigns[line] = d;
    }
    const mbGov = ['interior', 'edge'].map(k => mbDesigns[k]).filter(d => d && !d.error).sort((a, b) => (b.overall.eta || 0) - (a.overall.eta || 0))[0];
    out.mods.mb = { lines: mbDesigns, gov: mbGov };
    // ---------- connections with the design forces ----------
    const endMoment = (d, Sj) => { // M_j at the ends if the joint stiffness is used (robustness check of a "pinned" joint)
      if (!d || d.error) return 0;
      const spec = Object.assign({}, d.spec, { endKr: Sj });
      const comb = d.comb, a = FE.beam({ L: spec.L, EI: E * d.gross.Iyy, supports: spec.supports.map((x, i) => ({ x, v: true, r: (i === 0 || i === spec.supports.length - 1) ? Sj : false })), points: [...spec.G.points.map(q => ({ x: q.x, P: comb.aG * q.P })), ...spec.Q.points.map(q => ({ x: q.x, P: comb.aQ * q.P }))], udl: [...spec.G.udl.map(u => ({ ...u, w: comb.aG * u.w })), ...spec.Q.udl.map(u => ({ ...u, w: comb.aQ * u.w }))] });
      return a.error ? 0 : Math.max(0, -a.Mmin);
    };
    const mjOf = (d, cn) => cn.stiff.cls === 'nominally pinned' ? 0 : endMoment(d, cn.stiff.Sj);
    // knee brace (needs the column load) – first estimate the governing column load
    const RmbGQ = mbGov ? reactionsGQ(mbGov) : { G: 0, Q: 0 };
    const nbMB = I.nb >= 2 ? 2 : 1, nbSE = I.nm >= 2 ? 2 : 1;
    const colA = COL.props(I).A, colSW = colA * 7850e-9 * LOADS.g * +I.hc;
    const combCol = LOADS.uls(R, I, 1, 1);
    const Ncol = nbMB * (combCol.aG * RmbGQ.G + combCol.aQ * RmbGQ.Q) + nbSE * (combCol.aG * RsbeGQ.G + combCol.aQ * RsbeGQ.Q) + combCol.aG * colSW + (+I.col_N) * 1e3;
    // global frame analysis of the column lines (unified app only)
    const GAs = EXT ? EXT.system({ I, R, E, gM, gE, gI, pM, pE, xs, ci, ce, cm, sbi, sbe, mbDesigns, mbGov, RsbiG, RsbeGQ, RmbGQ, reactionsGQ, swN, Ncol }) : null;
    if (GAs) out.ga = GAs;
    const gaOK = GAs && !GAs.error;
    // gravity force of the knee braces from the beam analysis with the knee supports (largest vertical knee reaction, ULS)
    const kR = d => d && !d.error && d.kneeR ? d.kneeR.uls : 0;
    const Rk = { mb: kneeOn('mb') ? Math.max(kR(mbDesigns.interior), kR(mbDesigns.edge)) : 0, sbe: kneeOn('sbe') ? kR(sbe) : 0 };
    kn = RST.knee({ R, I, Ncol, nCols: I.nb + 1, hc: +I.hc, ga: gaOK && GAs.knee ? GAs.knee : null, grav: gaOK ? null : { R: Math.max(Rk.mb, Rk.sbe), where: Rk.mb >= Rk.sbe ? 'main beam' : 'SB-End' } });
    const tie = b => kn.use && !gaOK && Rk[b] > 0 ? Rk[b] / Math.tan(+I.k_th * Math.PI / 180) : 0;   // horizontal knee component: beam end segment in tension
    out.mods.knee = kn;
    const Fknee = kn.use ? kn.Fh : 0;
    const sbiV = sbi && !sbi.error ? Math.max(...sbi.Rmax) : 0, sbeV = sbe && !sbe.error ? Math.max(...sbe.Rmax) : 0, mbV = mbGov ? Math.max(...mbGov.Rmax) : 0;
    const brGov = mbGov && mbGov.brace ? mbGov.brace.Pbr : 0;
    ci = sbi && !sbi.error ? conn0('ci', mI, mbSup, sbiV, brGov, mjOf(sbi, ci), { bothSides: I.nm >= 2 }) : null;
    ce = conn0('ce', mE, colSupH, sbeV, kneeOn('sbe') ? Fknee + tie('sbe') : 0, mjOf(sbe, ce), { colStressRatio: Ncol / (colA * +I.col_fy) });
    cm = mbGov ? conn0('cm', mM, colSup, mbV, kneeOn('mb') ? Fknee + tie('mb') : 0, mjOf(mbGov, cm), { colStressRatio: Ncol / (colA * +I.col_fy) }) : null;
    out.mods.conn = { ci, ce, cm };
    // fork restraint flags into the member results
    for (const [d, cn] of [[sbi, ci], [sbe, ce], [mbGov, cm]]) if (d && !d.error && cn && !cn.fork) d.checks.push(CHK.mk({ grp: 'Member', name: 'End fork restraint assumed in the LTB model', clause: 'see connection', review: true, note: 'The end connection does not demonstrate a fork support.' }));
    // ---------- column ----------
    const ecm = cm ? cm.e : 0, ece = ce ? ce.e : 0;
    const MyCol = (I.nb >= 2 ? combCol.aQ * RmbGQ.Q : (combCol.aG * RmbGQ.G + combCol.aQ * RmbGQ.Q)) * (+I.col_h / 2 + ecm) + (kn.use && kneeOn('mb') ? kn.Mcol + tie('mb') * kn.dv : 0) + (+I.col_My) * 1e6;
    const MzCol = (I.nm >= 2 ? combCol.aQ * RsbeGQ.Q : (combCol.aG * RsbeGQ.G + combCol.aQ * RsbeGQ.Q)) * (+I.col_b / 2 + ece) + (kn.use && kneeOn('sbe') ? kn.Mcol + tie('sbe') * kn.dv : 0) + (+I.col_Mz) * 1e6;
    const Vcol = (kn.use ? kn.H : 0) + (+I.col_V) * 1e3, Tcol = (+I.col_T) * 1e6;
    const gc = gaOK ? GAs.col : null; // frame forces + the user's additional column actions
    const cN = gc ? gc.N + (+I.col_N) * 1e3 : Ncol, cMy = gc ? gc.My + (+I.col_My) * 1e6 : MyCol, cMz = gc ? gc.Mz + (+I.col_Mz) * 1e6 : MzCol, cV = gc ? gc.V + (+I.col_V) * 1e3 : Vcol;
    const col = COL.design({ R, I, N: cN, My: cMy, Mz: cMz, V: cV, T: Tcol, ga: gc ? gc.k : null });
    col.loads = { N: cN, My: cMy, Mz: cMz, V: cV, T: Tcol, nbMB, nbSE, RmbGQ, RsbeGQ, colSW, ecm, ece, comb: combCol, ga: !!gc };
    const gb = gaOK ? GAs.base : null;
    const bas = COL.base({ R, I, N: gb ? gb.N : Ncol, V: gb ? gb.V : Vcol, M: gb ? gb.M : I.col_base === 'fix' ? MyCol : 0, col: col.props });
    out.mods.col = col; out.mods.base = bas;
    // ---------- bracing ----------
    const NfMB = mbGov ? Math.max(mbGov.env.Mmax, -mbGov.env.Mmin) / (pM.H - pM.t) : 0;
    const brc = RST.bracing({ R, I, sumNf: NfMB * (I.nm + 1), nRestr: I.nm + 1, Lline: Lmb, Htot: (kn.use ? kn.H : (R.code === 'EN' ? 1 / 200 : 0.002) * Ncol) * (I.nb + 1) + (+I.br_H) * 1e3 / (I.nm + 1), Lmb, Lsb, hc: +I.hc, ga: gaOK ? GAs.brac : null });
    out.mods.brac = brc;
    // ---------- summary ----------
    out.summary = summarise(out);
    out.load = { RsbiG, RsbeGQ, RmbGQ, Ncol, tribI, tribE };
    return out;
  }
  // characteristic end reactions (max over the supports) split into G and Q
  // knee braces (springs) carry part of the beam load down into the column: each spring
  // reaction is added to its nearest support so the column receives the full load
  function supR(fe) {
    const R = fe.reactions.map(r => r.R);
    for (const sp of fe.springR || []) {
      let i = 0; fe.reactions.forEach((r, j) => { if (Math.abs(r.x - sp.x) < Math.abs(fe.reactions[i].x - sp.x)) i = j; });
      R[i] += sp.R;
    }
    return R;
  }
  function reactionsGQ(d) {
    const a = supR(d.slsG), b = supR(d.sls);
    const i = b.indexOf(Math.max(...b));
    return { G: a[i], Q: b[i] - a[i] };
  }
  function summarise(out) {
    const M = out.mods, rows = [];
    const add = (key, label, list, extra) => { const o = CHK.overall(list); rows.push(Object.assign({ key, label, list, ...o }, extra || {})); };
    if (M.mb.gov) add('mb', 'Main beam (' + M.mb.gov.spec.line + ' line governs)', M.mb.gov.checks);
    if (M.sbi && !M.sbi.error) add('sbi', 'SB-Int', M.sbi.checks.concat(M.sbi.restrInfo.deck ? M.sbi.restrInfo.deck.checks : []));
    if (M.sbe && !M.sbe.error) add('sbe', 'SB-End', M.sbe.checks.concat(M.sbe.restrInfo.deck ? M.sbe.restrInfo.deck.checks : []));
    for (const k of ['ci', 'ce', 'cm']) if (M.conn[k]) add(k, M.conn[k].checks[0] ? M.conn[k].checks[0].grp : k, M.conn[k].checks);
    add('col', 'Box column', M.col.checks); add('base', 'Base plate & foundation', M.base.checks);
    const jl = ['sbi', 'sbe'].flatMap(k => { const j = M[k] && !M[k].error && M[k].restrInfo && M[k].restrInfo.joist; return j && j.n ? j.checks.map(c => Object.assign({}, c, { name: c.name + (k === 'sbi' ? ' – on SB-Int' : ' – on SB-End') })) : []; });
    if (jl.length) add('joist', 'Joist beams', jl);
    if (M.knee.use) add('knee', 'Knee bracing', M.knee.checks);
    add('deck', 'Surface / decking', M.deck.vert.checks); add('brac', 'Bracing', M.brac.checks);
    const all = rows.flatMap(r => r.list);
    const ov = CHK.overall(all);
    return { rows, overall: ov, nFail: all.filter(c => c.status === 'FAIL').length, nReview: all.filter(c => c.status === 'REVIEW').length, nPass: all.filter(c => c.status === 'PASS').length, nNA: all.filter(c => c.status === 'N/A').length };
  }
  return { compute, normalise, reactionsGQ, loadPoint, setExternal: f => { EXT = f || null; }, get external() { return EXT; } };
})();

