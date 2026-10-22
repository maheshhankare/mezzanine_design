// @ts-nocheck — ported verbatim from the mockup (index.html, 93_optui.js).
import "server-only";
import { U } from '@/shared/util';
import { SCHEMA } from '@/shared/schema';
import { MEM } from './member';
import { MODEL } from './model';
import { OPT } from './opt';
import { SK } from './svg';
import { REPORT } from './report';
// ===== Optimisation tab: component table, dimension-control table, one-click search with progress / cancel, comparison, apply / revert =====
// The search runs OPT.run (full system model for every candidate). Inputs change only on "Apply Optimised Design".
export const OPTUI: any = (() => {
  const esc = U.esc, F = U.fmt;
  // SERVER SIDE: the module renders from the state the browser sends with each request (S = settings, R = last result, hist = history).
  // HEAD holds the values of the header controls (replaces the DOM reads of the mockup). Dialogs are answered from the request (ANS):
  // when an answer is missing the handler stops with Ask and the browser asks the user, then repeats the event with the answer.
  let H = null, S = null, R = null, job = null, hist = [], HEAD = {}, ANS = [], ASKED = 0;
  class Ask { constructor(a) { this.ask = a; } }
  const $ = s => HEAD[s] || null;
  const confirm = msg => { const i = ASKED++; if (i < ANS.length) return ANS[i]; throw new Ask({ type: 'confirm', text: msg }); };
  const prompt = (msg, def) => { const i = ASKED++; if (i < ANS.length) return ANS[i]; throw new Ask({ type: 'prompt', text: msg, def }); };
  const alert = msg => H.effect({ type: 'alert', text: msg });
  const MODES = [['fixed', 'Fixed'], ['range', 'Optimise within range'], ['step', 'Optimise at specified increments'], ['list', 'Use approved list']];
  const ARRL = { single: 'Single C', b2b: 'Back-to-back C', quad: 'Four C' };
  const st = { get() { return null; }, set() { } };
  const LSH = 'hist';
  const DEFAULT_S = { mode: 'single', one: 'mb', sel: { sbi: true, sbe: true, mb: true }, obj: 'mass', budget: 60, nAlt: 2, maxCombos: 4000, connOpt: true, levers: true, ctrl: {}, edit: 'mb' };
  function load(ctx) {
    H = ctx.host; S = Object.assign({}, DEFAULT_S, ctx.S || {}); hist = ctx.hist || []; R = ctx.R || null; HEAD = ctx.head || {}; ANS = ctx.answers || []; ASKED = 0;
    job = ctx.running ? { msg: ctx.msg || 'Running…', pct: ctx.pct || 0, comps: [] } : null;
  }
  const state = () => ({ S, hist, R });
  // the heavy parts of a result (full model results) are not sent back and forth: they are rebuilt from the snapshot and the proposed changes
  function hydrate() {
    if (!R || R.error || R.base) return null;
    const v = OPT.verify(R.snapshot, R.ov, R.comps);
    if (v.error) { R = { error: v.error }; return v.error; }
    Object.assign(R, { base: v.base, final: v.final, comp: v.comp, inputsBefore: v.inputsBefore, inputsAfter: v.inputsAfter });
    return null;
  }
  const save = () => { };
  const Inorm = () => MODEL.normalise(H.I()).I;
  const present = (k, I) => k === 'sbi' ? +I.nsbi > 0 : k === 'knee' ? I.k_use === 'yes' : true;
  const ctl = (k, I) => { if (!S.ctrl[k]) S.ctrl[k] = OPT.defaults(I || Inorm(), k); return S.ctrl[k]; };
  const hashNow = () => REPORT.hash(H.diffOf(H.I()));
  const etaS = v => v === null || v === undefined ? '–' : !isFinite(v) ? '∞' : F(v, 2);
  const pill = s => H.pill(s);
  // ---------------- size summary of a component for the table ----------------
  function size(k, I) {
    if (OPT.kind(k) === 'C') return { arr: ARRL[I[k + '_arr']], lips: `${+I[k + '_Ct']} / ${+I[k + '_Cb']}`, fl: `${+I[k + '_Bt']} / ${+I[k + '_Bb']}`, depth: +I[k + '_H'], t: +I[k + '_t'], dK: 'H', tK: 't', mu: 'kg/m' };
    if (k === 'col') return { arr: I.col_type === 'weld' ? 'Welded box' : 'RHS / SHS', lips: '–', fl: `${+I.col_b} / ${+I.col_h}`, depth: +I.col_b, t: +I.col_tb, dK: 'b', tK: 'tb', mu: 'kg/m' };
    if (k === 'knee') return { arr: I.k_nL === '2' ? 'Two angles' : 'Single angle', lips: '–', fl: `${+I.k_b} / ${+I.k_h}`, depth: +I.k_b, t: +I.k_t, dK: 'b', tK: 't', mu: 'kg/m' };
    return { arr: `${+I.j_n} per span`, lips: '–', fl: `${I.j_sec === 'box' ? 'SHS' : I.j_sec} ${+I.j_b}×${+I.j_h}`, depth: +I.j_n, t: +I.j_t, dK: 'n', tK: null, mu: 'kg total' };
  }
  function fixedList(k, c) {
    const out = [];
    for (const [key, , desc] of OPT.PARAMS[OPT.kind(k)]) {
      const lk = c.link && OPT.LINKS[OPT.kind(k)].find(l => l[0] === key);
      if (lk) { out.push(`${key} = ${lk[1]}`); continue; }
      if (!c[key] || c[key].mode === 'fixed') out.push(key);
    }
    if (c.arr && c.arr.mode === 'fixed') out.push('arrangement'); if (c.gr && c.gr.mode === 'fixed') out.push('grade');
    return out.join(', ') || 'none';
  }
  // ---------------- panel ----------------
  function panel() {
    const res = H.res();
    if (!res || res.fatal) return `<section class="card bad"><h3>Optimisation unavailable</h3><p>The current inputs are invalid. Correct them first: no candidate is analysed from a substituted value.</p></section>`;
    const I = Inorm();
    return head(I) + compTable(I, res) + dimCard(I, res) + results(I) + histCard();
  }
  function head(I) {
    const running = !!job, costOK = +I.cost_kg > 0;
    return `<section class="card"><h3>Optimisation</h3>
      <ol class="steps8"><li>Select components</li><li>Set fixed dimensions</li><li>Define variable dimensions and limits</li><li>Select the objective</li><li>Review the baseline</li><li>Optimise Design</li><li>Review the proposal</li><li>Apply or reject</li><li>Print the updated report</li></ol>
      <div class="optf">
        <label>Mode <span class="seg" role="radiogroup">${[['single', 'Individual component'], ['system', 'Whole system']].map(([v, l]) => `<button type="button" role="radio" data-omode="${v}" class="${S.mode === v ? 'on' : ''}" aria-checked="${S.mode === v}">${l}</button>`).join('')}</span></label>
        <label>Objective <select id="o_obj">${Object.entries(OPT.OBJ).map(([k, o]) => `<option value="${k}"${S.obj === k ? ' selected' : ''}${k === 'cost' && !costOK ? ' disabled' : ''}>${esc(o.label)}${k === 'cost' && !costOK ? ' – no cost data' : ''}</option>`).join('')}</select></label>
        <label>Max. full analyses per component <input id="o_budget" value="${S.budget}" inputmode="numeric"></label>
        <label>Passing alternatives to keep <input id="o_alt" value="${S.nAlt}" inputmode="numeric"></label>
        <label>Search limit (combinations) <input id="o_max" value="${S.maxCombos}" inputmode="numeric"></label>
        <label class="chkb"><input type="checkbox" id="o_conn"${S.connOpt ? ' checked' : ''}> Optimise the end connection when it governs (Case G)</label>
        <label class="chkb"><input type="checkbox" id="o_lev"${S.levers ? ' checked' : ''}> Lever study of the governing failure mode</label>
      </div>
      <div class="obar"><button type="button" id="o_go" class="btn big-btn"${running ? ' disabled' : ''}>OPTIMISE DESIGN</button>${running ? '<button type="button" id="o_cancel" class="btn">Cancel</button>' : ''}
        <div id="o_prog" ${running ? '' : 'hidden'}><div class="pbar"><span id="o_pb" style="width:${job ? job.pct || 0 : 0}%"></span></div><span id="o_msg" class="hint">${esc(job ? job.msg || '' : '')}</span></div></div>
      <p class="hint">Every candidate is analysed with the full system model (members, connections, restraints, column, base, joists, decking, bracing). A candidate that fails any applicable check is never offered as optimised; candidates that cannot be fully verified are labelled REVIEW. Your inputs change only when you press <b>Apply Optimised Design</b>.</p></section>`;
  }
  function compTable(I, res) {
    const rows = OPT.ORDER.filter(k => present(k, I)).map(k => {
      const c = ctl(k, I), z = size(k, I), m = OPT.metrics(res, k, I), sel = S.mode === 'single' ? S.one === k : !!S.sel[k];
      const after = R && !R.error && R.comp ? R.comp.find(x => x.key === k) : null, stg = R && R.stages ? R.stages.filter(x => x.key === k).slice(-1)[0] : null;
      const ostat = !after ? 'Not optimised' : stg && stg.outcome === 'feasible' ? after.after.status : stg && stg.outcome === 'review' ? 'REVIEW' : stg && /infeasible|budget|cancelled/.test(stg.outcome) ? 'No feasible' : after.after.status;
      const mm = (key, which) => { const p = c[key]; if (!p) return '–'; return `<input class="o_mm" data-k="${k}" data-p="${key}" data-w="${which}" value="${p.mode === 'fixed' || p.mode === 'list' ? '' : esc(p[which])}" placeholder="${p.mode === 'fixed' ? 'fixed' : p.mode === 'list' ? 'list' : ''}" aria-label="${which} ${key}">`; };
      const tK = z.tK;
      return `<tr class="${sel ? 'sel' : ''}"><td>${S.mode === 'single' ? `<input type="radio" name="o_one" value="${k}"${sel ? ' checked' : ''} aria-label="Optimise ${OPT.COMP[k].label}">` : `<input type="checkbox" class="o_sel" value="${k}"${sel ? ' checked' : ''} aria-label="Include ${OPT.COMP[k].label}">`}</td>
        <td>${OPT.COMP[k].id}</td><td>${esc(OPT.COMP[k].label)}</td><td>${esc(z.arr)}</td><td class="num">${z.lips}</td><td class="num">${z.fl}</td><td class="num">${z.depth}</td><td class="num">${z.t}</td>
        <td>${mm(z.dK, 'min')}</td><td>${mm(z.dK, 'max')}</td><td>${tK ? mm(tK, 'min') : '–'}</td><td>${tK ? mm(tK, 'max') : '–'}</td>
        <td class="sm">${esc(fixedList(k, c))}</td><td class="sm">${esc(m.gov || '–')}</td><td class="num">${etaS(m.eta)} ${pill(m.status)}</td>
        <td class="sm">${after ? esc(after.dimsAfter) : '–'}</td><td class="num">${after ? etaS(after.after.eta) : '–'}</td>
        <td class="num">${F(m.mass, 2)} ${z.mu}</td><td class="num">${after ? F(after.after.mass, 2) + ' ' + z.mu : '–'}</td><td>${pill(ostat === 'No feasible' ? 'FAIL' : ostat === 'Not optimised' ? '' : ostat)}${ostat === 'No feasible' ? ' <span class="sm">no feasible solution</span>' : ostat === 'Not optimised' ? '<span class="sm">Not optimised</span>' : ''}</td>
        <td><button type="button" class="btn sm" data-oedit="${k}">Limits</button></td></tr>`;
    }).join('');
    return `<section class="card"><h3>Components</h3><p class="hint">${S.mode === 'single' ? 'Individual mode: pick one component.' : 'Whole-system mode: tick any combination; they are optimised in load-path order (joists → SB-Int → SB-End → main beam → column → knee braces), each with the system re-analysed, then the complete system is recalculated.'} Min / max depth and thickness can be typed here; every other limit is in the dimension-control table (Limits).</p>
      <div class="tscroll"><table class="rt otab"><tr><th>Select</th><th>ID</th><th>Component</th><th>Arrangement</th><th>Lips C_t / C_b</th><th>Flanges B_t / B_b</th><th>Depth</th><th>t</th><th>Min depth</th><th>Max depth</th><th>Min t</th><th>Max t</th><th>Fixed dimensions</th><th>Governing check</th><th>Current η</th><th>Optimised dimensions</th><th>Optimised η</th><th>Original mass</th><th>Optimised mass</th><th>Status</th><th></th></tr>${rows}</table></div></section>`;
  }
  // ---------------- dimension-control table ----------------
  function dimCard(I, res) {
    const k = S.edit && present(S.edit, I) ? S.edit : 'mb', K = OPT.kind(k), c = ctl(k, I);
    const prow = ([key, pid, desc, defStep]) => {
      const id = MEM(k, pid), cur = +I[id], p = c[key] || { mode: 'fixed' };
      const lk = c.link && OPT.LINKS[K].find(l => l[0] === key);
      if (lk) return `<tr><td><b>${key}</b></td><td>${esc(desc)}</td><td class="num">${cur}</td><td colspan="5"><i>follows ${lk[1]} (“${K === 'C' ? 'bottom = top' : 'square / equal'}” ticked)</i></td></tr>`;
      const vals = OPT.values(p, cur, key === 'n', defStep), nv = vals.err ? `<span class="no">${esc(vals.err)}</span>` : vals.v.length;
      const dis = w => p.mode === 'fixed' || (w === 'list') !== (p.mode === 'list') ? ' disabled' : '';
      return `<tr><td><b>${key}</b></td><td>${esc(desc)}</td><td class="num">${cur}</td>
        <td><select class="o_mode" data-k="${k}" data-p="${key}">${MODES.map(([v, l]) => `<option value="${v}"${p.mode === v ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
        <td><input class="o_f" data-k="${k}" data-p="${key}" data-w="min" value="${esc(p.min ?? '')}"${dis('min')}></td><td><input class="o_f" data-k="${k}" data-p="${key}" data-w="max" value="${esc(p.max ?? '')}"${dis('max')}></td>
        <td><input class="o_f" data-k="${k}" data-p="${key}" data-w="step" value="${esc(p.mode === 'range' ? defStep : p.step ?? '')}"${p.mode !== 'step' ? ' disabled' : ''}></td>
        <td><input class="o_f wide" data-k="${k}" data-p="${key}" data-w="list" value="${esc(p.list ?? '')}"${dis('list')}></td><td class="num">${nv}</td></tr>`;
    };
    let extra = '';
    if (K === 'C') {
      extra += `<tr><td><b>arr</b></td><td>Arrangement</td><td>${esc(ARRL[I[k + '_arr']])}</td><td><select class="o_smode" data-k="${k}" data-p="arr"><option value="fixed"${c.arr.mode === 'fixed' ? ' selected' : ''}>Fixed</option><option value="list"${c.arr.mode === 'list' ? ' selected' : ''}>Choose from the permitted set</option></select></td>
        <td colspan="5">${(k === 'mb' ? ['single', 'b2b', 'quad'] : ['single', 'b2b']).map(a => `<label class="chkb"><input type="checkbox" class="o_set" data-k="${k}" data-p="arr" value="${a}"${c.arr.list.includes(a) ? ' checked' : ''}${c.arr.mode === 'fixed' ? ' disabled' : ''}> ${ARRL[a]}</label>`).join(' ')}</td></tr>`;
      extra += `<tr><td><b>grade</b></td><td>Material grade</td><td>${esc(I[k + '_gr'])}</td><td><select class="o_smode" data-k="${k}" data-p="gr"><option value="fixed"${c.gr.mode === 'fixed' ? ' selected' : ''}>Fixed</option><option value="list"${c.gr.mode === 'list' ? ' selected' : ''}>Choose from the permitted set</option></select></td>
        <td colspan="5">${SCHEMA.GRADES.filter(g => g[0] !== 'user').map(g => `<label class="chkb"><input type="checkbox" class="o_set" data-k="${k}" data-p="gr" value="${g[0]}"${c.gr.list.includes(g[0]) ? ' checked' : ''}${c.gr.mode === 'fixed' ? ' disabled' : ''}> ${g[0]}</label>`).join(' ')}</td></tr>`;
    }
    if (K === 'joist') {
      const secs = c.sec || { mode: 'list', list: '' };
      extra += `<tr><td><b>sec</b></td><td>Joist section (approved list: L50x50x5, SHS40x40x3, C100x50x2)</td><td>${esc(OPT.dims(I, 'joist'))}</td><td>Approved list</td><td colspan="5"><input class="o_f wide" data-k="joist" data-p="sec" data-w="list" value="${esc(secs.list)}"></td></tr>`;
      extra += `<tr><td><b>at</b></td><td>Joist connection position</td><td>${esc(I.j_at)}</td><td><select class="o_smode" data-k="joist" data-p="at"><option value="fixed"${c.at.mode === 'fixed' ? ' selected' : ''}>Fixed</option><option value="list"${c.at.mode === 'list' ? ' selected' : ''}>Choose from the permitted set</option></select></td><td colspan="5">${[['top', 'Top flange'], ['bot', 'Bottom flange'], ['web', 'Web']].map(([v, l]) => `<label class="chkb"><input type="checkbox" class="o_set" data-k="joist" data-p="at" value="${v}"${c.at.list.includes(v) ? ' checked' : ''}${c.at.mode === 'fixed' ? ' disabled' : ''}> ${l}</label>`).join(' ')}</td></tr>`;
      extra += `<tr><td><b>s_min</b></td><td>Minimum joist spacing (fabrication / access)</td><td></td><td>Constraint</td><td colspan="5"><input class="o_sm" data-k="joist" value="${esc(c.sMin)}"> mm · end-connection zone kept clear: ${F(OPT.endZone(I), 0)} mm from each end</td></tr>`;
    }
    const nC = OPT.candidates(I, k, c, S.maxCombos);
    const linkLabel = K === 'C' ? 'Bottom = top (B_b = B_t, C_b = C_t)' : K === 'col' ? 'Square (h = b, t_h = t_b)' : K === 'knee' ? 'Equal legs (h = b)' : '';
    const sk = K === 'C' ? sectionInfo(k, res) : '';
    return `<section class="card" id="o_dim"><h3>Dimension control – ${esc(OPT.COMP[k].label)}</h3>
      <div class="optf"><label>Component <select id="o_edit">${OPT.ORDER.filter(x => present(x, I)).map(x => `<option value="${x}"${x === k ? ' selected' : ''}>${esc(OPT.COMP[x].label)}</option>`).join('')}</select></label>
        ${linkLabel ? `<label class="chkb"><input type="checkbox" id="o_link" data-k="${k}"${c.link ? ' checked' : ''}> ${linkLabel}</label>` : ''}
        <button type="button" class="btn" data-oreset="${k}">Reset limits from the current design</button></div>
      <div class="tscroll"><table class="rt otab"><tr><th>Parameter</th><th>Description</th><th>Current</th><th>Mode</th><th>Minimum</th><th>Maximum</th><th>Increment</th><th>Approved list</th><th>Values</th></tr>${OPT.PARAMS[K].map(prow).join('')}${extra}</table></div>
      <p class="hint">${nC.errs.length ? `<span class="no">${nC.errs.map(esc).join('<br>')}</span>` : `${nC.nRaw} combinations → ${nC.cands.length} geometrically valid candidates (${nC.nGeom || 0} rejected: invalid geometry, schema limits${K === 'joist' ? ', joist spacing or the end-connection zone' : ''}).`} “Optimise within range” uses the manufacturing increment shown; “at specified increments” uses yours. The maximum is always examined. Fixed dimensions never change.</p>${sk}</section>`;
  }
  const MEM = (k, pid) => OPT.kind(k) === 'C' ? k + '_' + pid : pid;
  function sectionInfo(k, res) {
    const d = k === 'mb' ? res.mods.mb.gov : res.mods[k]; if (!d || d.error) return '';
    const g = d.gross, lp = d.spec.lp || {};
    return `<div class="rgrid"><div>${SK.section(d.spec.p, d.spec.arr, d.spec.opt, g, { lp, W: 320, H: 320 })}</div><div>${H.kvTable([['A', g.A, 'mm²', 1], ['Mass', g.mass, 'kg/m', 2], ['Centroid CG (y, z)', `${F(lp.yc, 1)}, ${F(lp.zc, 1)}`, 'mm'], ['Shear centre SC (y, z)', `${F(lp.ysc, 1)}, ${F(lp.zsc, 1)}`, 'mm'], ['CG − SC', `${F(lp.dyc, 1)}, ${F(lp.dzc, 1)}`, 'mm'], ['I_y', g.Iyy / 1e4, 'cm⁴', 1], ['I_z', g.Izz / 1e4, 'cm⁴', 2], ['I_t', g.It / 1e4, 'cm⁴', 4], ['I_w', g.Iw / 1e6, 'cm⁶', 0], ['W_el,y', g.Wy / 1e3, 'cm³', 2], ['M_cr credited', d.Mcr / 1e6, 'kNm', 2]], 'Current section properties (calculated)')}</div></div>`;
  }
  // ---------------- results ----------------
  function results(I) {
    if (!R) return '';
    if (R.error) return `<section class="card bad"><h3>Optimisation not started</h3><p>${esc(R.error)}</p>${R.errs ? `<ul class="msgs">${R.errs.map(e => `<li class="error">${esc(e)}</li>`).join('')}</ul>` : ''}</section>`;
    const cur = hashNow(), stale = cur !== R.baseHash && cur !== R.afterHash, applied = cur === R.afterHash;
    const nFeas = R.stages.filter(s => s.outcome === 'feasible').length, nInf = R.stages.filter(s => /infeasible|budget|cancelled/.test(s.outcome)).length, nRev = R.stages.filter(s => s.outcome === 'review').length;
    const head = `<section class="card ${stale ? 'bad' : ''}" id="o_res"><h3>Optimisation result ${pill(R.final.summary.overall.status)}</h3>
      ${stale ? `<p class="no"><b>The inputs have changed since this optimisation.</b> The comparison below is stale: press <b>Recalculate</b> to re-verify the proposal against the current inputs. Apply is disabled until then.</p>` : ''}
      ${applied ? `<p class="ok"><b>Applied.</b> The design inputs now contain the optimised values; “Revert to Original” restores the snapshot taken before the search.</p>` : ''}
      <p>${R.mode === 'system' ? 'Whole-system' : 'Individual'} optimisation, objective: <b>${esc(OPT.OBJ[R.obj].label)}</b>. ${R.evals} full system analyses in ${F(R.ms / 1000, 1)} s${R.cancelled ? ' – <b>cancelled</b>: results are the best found before cancelling, not necessarily optimal' : ''}. ${nFeas} component${nFeas === 1 ? '' : 's'} with a feasible solution${nRev ? `, ${nRev} requiring engineering review` : ''}${nInf ? `, <b class="no">${nInf} without a feasible solution</b>` : ''}. ${R.reverified ? `Re-verified against the current inputs at ${esc(R.reverified)}.` : ''}</p>
      <div class="obar"><button type="button" class="btn" id="o_apply"${stale || applied || !Object.keys(R.ov).length ? ' disabled' : ''}>Apply Optimised Design</button><button type="button" class="btn" id="o_cmp">Compare with Original</button><button type="button" class="btn" id="o_recalc">Recalculate</button><button type="button" class="btn" id="o_revert"${R.snapshot ? '' : ' disabled'}>Revert to Original</button><button type="button" class="btn" id="o_case"${Object.keys(R.ov).length ? '' : ' disabled'}>Save as New Project</button></div>
      ${Object.keys(R.ov).length ? `<p class="hint">Proposed input changes: ${Object.entries(R.ov).map(([k2, v]) => `${esc((SCHEMA.byId[k2] || { label: k2 }).label)} (${esc(k2)}) ${esc(String(R.inputsBefore[k2]))} → <b>${esc(String(v))}</b>`).join('; ')}.</p>` : '<p class="hint">No input change is proposed.</p>'}
      ${systemCmp()}</section>`;
    return head + R.stages.map(stageCard).join('') + `<div id="o_cmpz">${R.comp.map(compCard).join('')}</div>`;
  }
  function systemCmp() {
    const a = R.base, b = R.final, ta = H.takeoff(a, R.inputsBefore), tb = H.takeoff(b, R.inputsAfter);
    const row = (l, x, y, d) => `<tr><th>${l}</th><td>${x}</td><td>${y}</td><td>${d || ''}</td></tr>`;
    return `<div class="tscroll"><table class="rt"><tr><th>System</th><th>Original</th><th>Optimised</th><th>Change</th></tr>
      ${row('Overall status', pill(a.summary.overall.status), pill(b.summary.overall.status))}${row('Checks FAIL / REVIEW', `${a.summary.nFail} / ${a.summary.nReview}`, `${b.summary.nFail} / ${b.summary.nReview}`)}
      ${row('Governing check', esc(a.summary.overall.gov ? a.summary.overall.gov.name + ' (η ' + etaS(a.summary.overall.gov.eta) + ')' : '–'), esc(b.summary.overall.gov ? b.summary.overall.gov.name + ' (η ' + etaS(b.summary.overall.gov.eta) + ')' : '–'))}
      ${ta && tb ? row('Steel take-off (members)', F(ta.tot, 0) + ' kg', F(tb.tot, 0) + ' kg', pct(ta.tot, tb.tot)) + row('Steel per floor area', F(ta.perArea, 2) + ' kg/m²', F(tb.perArea, 2) + ' kg/m²', pct(ta.perArea, tb.perArea)) : ''}</table></div>`;
  }
  const pct = (a, b) => isFinite(a) && a > 0 ? `${b >= a ? '+' : ''}${F(100 * (b - a) / a, 1)} %` : '–';
  function stageCard(sg) {
    if (sg.outcome === 'n/a' || sg.outcome === 'invalid') return `<section class="card"><h3>${esc(sg.label)}</h3><p>${esc((sg.errs || []).join('; '))}</p></section>`;
    const lev = sg.levers && sg.levers.length ? `<h4>Lever study – why it ${sg.before.status === 'FAIL' ? 'fails' : 'passes'} and what helps (one step each, full model)</h4><div class="tscroll"><table class="rt"><tr><th>Change</th><th>Governing η after</th><th>η of the original governing mode</th><th>Governing check after</th><th>Δ mass</th><th>Δη per kg/m</th></tr>${sg.levers.map(l => `<tr><td>${esc(l.desc)}</td><td class="num">${etaS(l.eta)} ${pill(l.status)}</td><td class="num">${etaS(l.catEta)}</td><td>${esc(l.gov || '')}</td><td class="num">${F(l.dMass, 2)}</td><td class="num">${l.eff === null || !isFinite(l.eff) ? '–' : F(l.eff, 3)}</td></tr>`).join('')}</table></div>` : '';
    const top = (sg.rows || []).slice().sort((a, b) => (a.status === 'PASS' ? 0 : a.status === 'REVIEW' ? 1 : 2) - (b.status === 'PASS' ? 0 : b.status === 'REVIEW' ? 1 : 2) || a.score - b.score).slice(0, 8);
    const best = sg.best || sg.bestReview;
    const out = sg.outcome === 'feasible' ? `<p class="ok"><b>Best feasible:</b> ${esc(desc(sg.key, best))} – ${F(best.mass, 2)} ${sg.key === 'joist' ? 'kg' : 'kg/m'}, η ${etaS(best.eta)} (${esc(best.gov)}). ${esc(sg.optimal)}.</p>`
      : sg.outcome === 'review' ? `<p class="no"><b>No candidate passes every check; the best candidate without a FAIL still needs engineering review:</b> ${esc(desc(sg.key, best))} – REVIEW items: ${esc(best.reviews.join('; '))}. It is not labelled optimised or safe.</p>`
      : sg.outcome === 'cancelled' ? `<p class="no"><b>Cancelled before a feasible candidate was found.</b> This does not show that none exists; run again to complete the search.</p>`
      : sg.outcome === 'budget' ? `<p class="no"><b>No feasible candidate among the ${sg.evaluated} analysed before the analysis budget was reached</b> (${sg.pool - sg.rows.length > 0 ? sg.pool - sg.rows.length + ' candidates not analysed' : ''}). This does not prove that no solution exists: increase “Max. full analyses” or narrow the ranges. Checks failing so far: ${esc((sg.unsatisfied || []).join('; ') || '–')}.</p>`
      : `<p class="no"><b>No feasible solution exists within the permitted limits.</b> Checks that remain unsatisfied: ${esc((sg.unsatisfied || []).join('; ') || '–')}. Limits preventing a solution: ${esc((sg.blocking || []).join('; ') || '–')}.</p>`;
    return `<section class="card"><h3>${esc(sg.label)}${sg.pass > 1 ? ' (second pass)' : ''} ${pill(sg.outcome === 'feasible' ? 'PASS' : sg.outcome === 'review' ? 'REVIEW' : 'FAIL')} <span class="sub">search log of the run at ${esc(R.when.slice(11, 16))} UTC</span></h3>
      <p><b>Baseline:</b> ${esc(sg.before.mode || sg.before.gov || '–')} (η ${etaS(sg.before.eta)}, ${esc(sg.before.gov || '')}).</p>${lev}
      <p class="hint">Search: ${sg.nRaw} combinations, ${sg.rejectedGeom} rejected by geometry / constraints, ${sg.screened} screened out by the safe bending / deflection lower bounds, ${sg.evaluated} full analyses (incl. the lever study), stop: ${esc({ found: 'first passing candidate in objective order (+ alternatives)', exhausted: 'all permitted candidates analysed', budget: 'analysis budget reached', cancelled: 'cancelled' }[sg.stop] || sg.stop || '')}.${sg.connSearch ? ` Connection search (Case G): ${sg.connSearch.tried} variants tried.` : ''}</p>${out}
      ${top.length ? `<details><summary>Analysed candidates (best first)</summary><div class="tscroll"><table class="rt"><tr><th>Candidate</th><th>Mass</th><th>Status</th><th>η</th><th>Governing</th><th>Knock-on effects</th></tr>${top.map(r => `<tr><td>${esc(desc(sg.key, r))}</td><td class="num">${F(r.mass, 2)}</td><td>${pill(r.status)}</td><td class="num">${etaS(r.eta)}</td><td>${esc(r.gov || '')}</td><td class="sm">${esc((r.knock || []).join('; '))}</td></tr>`).join('')}</table></div></details>` : ''}</section>`;
  }
  function desc(k, r) {
    if (!r) return '–'; const d = r.d || {};
    if (OPT.kind(k) === 'C') return `${d.arr === 'single' ? '' : d.arr === 'b2b' ? '2× ' : '4× '}C${d.H}×${d.Bt}${d.Bb !== d.Bt ? '/' + d.Bb : ''}×${d.Ct}${d.Cb !== d.Ct ? '/' + d.Cb : ''}×${d.t} ${d.gr || ''}${d.conn ? ' + ' + d.conn : ''}`;
    if (k === 'col') return `${d.b}×${d.h}×${d.tb}${d.th !== d.tb ? '/' + d.th : ''}`;
    if (k === 'knee') return `L${d.b}×${d.h}×${d.t}`;
    if (k === 'joist') return d.n ? `${d.n} × ${d.sec}, a = ${d.a} mm, ${d.at}, max. unbraced ${F(d.Lbr, 0)} mm` : 'no joists';
    return '';
  }
  function compCard(c) {
    const a = c.before, b = c.after, K = OPT.kind(c.key), mu = c.key === 'joist' ? 'kg' : 'kg/m';
    const cat = (m, k) => m.cats[k] ? etaS(m.cats[k].eta) : '–';
    const rows = [['Dimensions', esc(c.dimsBefore), esc(c.dimsAfter), ''], ['Area A', F(a.A, 1) + ' mm²', F(b.A, 1) + ' mm²', pct(a.A, b.A)], ['Mass', F(a.mass, 2) + ' ' + mu, F(b.mass, 2) + ' ' + mu, pct(a.mass, b.mass)]];
    if (K === 'C') rows.push(['Deflection (characteristic)', a.defl ? `${F(a.defl.mm, 1)} / ${F(a.defl.lim, 1)} mm` : '–', b.defl ? `${F(b.defl.mm, 1)} / ${F(b.defl.lim, 1)} mm` : '–', ''], ['Deflection η', cat(a, 'defl'), cat(b, 'defl'), ''], ['Bending η (effective section)', cat(a, 'bend'), cat(b, 'bend'), ''], ['Buckling η (LTB)', cat(a, 'ltb'), cat(b, 'ltb'), ''], ['Shear / web η', cat(a, 'shear'), cat(b, 'shear'), ''], ['Torsion / warping η', cat(a, 'tors'), cat(b, 'tors'), ''], ['Twist η', cat(a, 'twist'), cat(b, 'twist'), ''], ['End connection', a.conn ? `${pill(a.conn.status)} η ${etaS(a.conn.eta)}` : '–', b.conn ? `${pill(b.conn.status)} η ${etaS(b.conn.eta)}` : '–', ''], ['Restraints', esc(a.restr ? a.restr.text : '–'), esc(b.restr ? b.restr.text : '–'), '']);
    if (c.key === 'joist') rows.push(['Joist positions', esc((a.joist.positions || []).map(x => F(x, 0)).join(', ') || 'none'), esc((b.joist.positions || []).map(x => F(x, 0)).join(', ') || 'none'), ''], ['Credited as restraint', a.joist.n ? (a.joist.credited ? 'yes' : 'no') : '–', b.joist.n ? (b.joist.credited ? 'yes' : 'no') : '–', ''], ['Max. unbraced length', a.joist.n ? F(a.joist.Lbr, 0) + ' mm' : '–', b.joist.n ? F(b.joist.Lbr, 0) + ' mm' : '–', '']);
    rows.push(['Governing check', esc(a.gov || '–') + ` (η ${etaS(a.eta)})`, esc(b.gov || '–') + ` (η ${etaS(b.eta)})`, ''], ['Governing failure mode', esc(a.mode || '–'), esc(b.mode || '–'), a.govCat !== b.govCat ? 'changed' : ''], ['Status', pill(a.status), pill(b.status), ''], ['Checks requiring review', esc(a.reviews.join('; ') || 'none'), esc(b.reviews.join('; ') || 'none'), '']);
    const fin = R.final, row = fin.summary.rows.find(r => r.key === (K === 'col' ? 'col' : c.key)), conn = K === 'C' ? fin.summary.rows.find(r => r.key === OPT.CONN_OF[c.key]) : null;
    let pic = '';
    if (K === 'C') { const d0 = c.key === 'mb' ? R.base.mods.mb.gov : R.base.mods[c.key], d1 = c.key === 'mb' ? fin.mods.mb.gov : fin.mods[c.key]; if (d0 && d1 && !d0.error && !d1.error) pic = `<div class="rgrid"><div><h4>Original</h4>${SK.section(d0.spec.p, d0.spec.arr, d0.spec.opt, d0.gross, { lp: d0.spec.lp, W: 300, H: 300 })}</div><div><h4>Optimised</h4>${SK.section(d1.spec.p, d1.spec.arr, d1.spec.opt, d1.gross, { lp: d1.spec.lp, W: 300, H: 300 })}</div></div>`; }
    if (c.key === 'joist') pic = SK.joists(+R.inputsAfter.Lsb, [{ label: `Original: ${c.dimsBefore}`, positions: a.joist.positions, credited: a.joist.credited }, { label: `Proposed: ${c.dimsAfter}`, positions: b.joist.positions, credited: b.joist.credited }], { zone: OPT.endZone(R.inputsAfter) }) + `<p class="hint">Restraint is credited only where the joist strength, bolts, bearing on the secondary and anchorage are checked and pass, and the joist stiffness enters the LTB model. ${b.joist.n ? 'Reason: ' + esc(b.joist.reason) + '.' : ''} A joist at the top flange does not stop twisting of a single C from an eccentric load; that needs a torsional restraint.</p>`;
    return `<section class="card"><h3>${esc(c.label)}: original vs optimised ${pill(b.status)}</h3><div class="tscroll"><table class="rt"><tr><th></th><th>Original</th><th>Optimised</th><th>Change</th></tr>${rows.map(r => `<tr><th>${r[0]}</th><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</table></div>${pic}
      <details><summary>Detailed calculations of the optimised ${esc(c.label)} (every check, clause, inputs and intermediate values)</summary>${row ? H.checksHTML(row.list, c.label + ' – optimised') : ''}${conn ? H.checksHTML(conn.list, conn.label + ' – optimised') : ''}</details></section>`;
  }
  function histCard() {
    if (!hist.length) return '';
    return `<section class="card"><h3>Optimisation history (this browser)</h3><div class="tscroll"><table class="rt"><tr><th>When</th><th>Mode</th><th>Objective</th><th>Components</th><th>Result</th><th>Applied</th></tr>${hist.slice().reverse().map(h => `<tr><td>${esc(h.when.replace('T', ' ').slice(0, 16))}</td><td>${esc(h.mode)}</td><td>${esc(h.obj)}</td><td>${esc(h.comps.join(', '))}</td><td class="sm">${esc(h.summary)}</td><td>${h.applied ? 'yes ' + esc(h.applied.replace('T', ' ').slice(0, 16)) : 'no'}</td></tr>`).join('')}</table></div><button type="button" class="btn sm ghost" id="o_hclr">Clear history</button></section>`;
  }
  // ---------------- run ----------------
  function readHead() {
    const n = (id, d, mn) => { const el = $(id); const v = el ? Math.round(+el.value) : d; return isFinite(v) && v >= mn ? v : d; };
    S.budget = n('#o_budget', 60, 1); S.nAlt = n('#o_alt', 2, 0); S.maxCombos = n('#o_max', 4000, 10);
    const ob = $('#o_obj'); if (ob) S.obj = ob.value; const cc = $('#o_conn'); if (cc) S.connOpt = cc.checked; const lv = $('#o_lev'); if (lv) S.levers = lv.checked;
    save();
  }
  function runSetup() {
    readHead();
    const I0 = JSON.parse(JSON.stringify(H.I())), baseHash = hashNow();
    const comps = S.mode === 'single' ? [S.one] : OPT.ORDER.filter(k => S.sel[k]);
    const set = JSON.parse(JSON.stringify(S)); for (const k of comps) if (!set.ctrl[k]) set.ctrl[k] = OPT.defaults(Inorm(), k);
    return { I0, baseHash, comps, set };
  }
  const runProgress = (comps, v) => { const ci = Math.max(0, comps.indexOf(v.k)); return { msg: v.msg, pct: Math.min(99, 100 * (ci + (v.total ? v.done / v.total : 0.1)) / comps.length) }; };
  function runDone(Rr, baseHash) {
    R = Rr;
    if (!R.error) {
      R.baseHash = baseHash;
      hist.push({ when: R.when, mode: R.mode, obj: R.obj, comps: R.comps.map(k => OPT.COMP[k].label), summary: R.stages.map(s => `${s.label}: ${s.outcome}`).join('; '), before: H.diffOf(R.snapshot), ov: R.ov });
      hist = hist.slice(-20);
    }
    return state();
  }
  // ---------------- events ----------------
  function setCtl(k, p, w, v) { const c = ctl(k); if (!c[p]) c[p] = { mode: 'fixed' }; c[p][w] = v; save(); }
  function onChange(e) {
    const t = e.target; if (!t.closest('#pane')) return false;
    if (t.matches('.o_mode')) { const c = ctl(t.dataset.k), p = c[t.dataset.p]; p.mode = t.value; if (t.value !== 'fixed' && t.value !== 'list' && (+p.min === +p.max)) { const def = OPT.defaults(Inorm(), t.dataset.k)[t.dataset.p]; const cur = +p.min; p.min = rnd(cur * 0.75); p.max = rnd(cur * 1.25); p.step = def.step; } save(); H.render(); return true; }
    if (t.matches('.o_smode')) { const c = ctl(t.dataset.k); c[t.dataset.p].mode = t.value; save(); H.render(); return true; }
    if (t.matches('.o_set')) { const c = ctl(t.dataset.k), L = c[t.dataset.p].list; const i = L.indexOf(t.value); if (t.checked && i < 0) L.push(t.value); if (!t.checked && i >= 0) L.splice(i, 1); save(); H.render(); return true; }
    if (t.matches('.o_f')) { setCtl(t.dataset.k, t.dataset.p, t.dataset.w, t.dataset.w === 'list' ? t.value : t.value === '' ? '' : +t.value); H.render(); return true; }
    if (t.matches('.o_sm')) { ctl(t.dataset.k).sMin = +t.value || 0; save(); H.render(); return true; }
    if (t.matches('.o_mm')) { const c = ctl(t.dataset.k), p = c[t.dataset.p]; if (t.value === '') return true; if (p.mode === 'fixed' || p.mode === 'list') { p.mode = 'step'; p.min = p.min ?? +t.value; p.max = p.max ?? +t.value; } p[t.dataset.w] = +t.value; save(); H.render(); return true; }
    if (t.id === 'o_link') { ctl(t.dataset.k).link = t.checked; save(); H.render(); return true; }
    if (t.id === 'o_edit') { S.edit = t.value; save(); H.render(); return true; }
    if (t.matches('.o_sel')) { S.sel[t.value] = t.checked; save(); H.render(); return true; }
    if (t.name === 'o_one') { S.one = t.value; S.edit = t.value; save(); H.render(); return true; }
    if (/^o_(obj|budget|alt|max|conn|lev)$/.test(t.id)) { readHead(); return true; }
    return false;
  }
  const rnd = v => Math.round(v * 100) / 100;
  function onClick(t) {
    if (t.dataset.omode) { S.mode = t.dataset.omode; save(); H.render(); return true; }
    if (t.dataset.oedit) { S.edit = t.dataset.oedit; save(); H.render(); const d = $('#o_dim'); if (d) d.scrollIntoView({ block: 'start' }); return true; }
    if (t.dataset.oreset) { if (confirm('Reset the limits of this component from the current design?')) { S.ctrl[t.dataset.oreset] = OPT.defaults(Inorm(), t.dataset.oreset); save(); H.render(); } return true; }
    switch (t.id) {
      case 'o_go': return true; // the search is started by the browser through the streaming run endpoint
      case 'o_cancel': if (job) { job.cancel = true; job.msg = 'Cancelling after the current analysis…'; const m = $('#o_msg'); if (m) m.textContent = job.msg; } return true;
      case 'o_apply': {
        if (!R || R.error) return true;
        if (hashNow() !== R.baseHash) { alert('The inputs changed since the optimisation: press Recalculate first.'); return true; }
        const ch = Object.entries(R.ov).map(([k, v]) => `${k}: ${R.inputsBefore[k]} → ${v}`).join('\n');
        if (!confirm(`Apply the optimised design? These inputs change:\n${ch}\n\nThe original is kept: “Revert to Original” restores it.`)) return true;
        H.assign(R.ov); R.afterHash = hashNow(); const h = hist.find(x => x.when === R.when); if (h) { h.applied = new Date().toISOString(); h.afterHash = R.afterHash; h.comp = compact(); st.set(LSH, hist); }
        H.toast('Optimised design applied – recalculated'); H.render(); return true;
      }
      case 'o_cmp': { const z = $('#o_cmpz'); if (z) z.scrollIntoView({ block: 'start' }); return true; }
      case 'o_recalc': {
        if (!R || R.error) return true;
        hydrate(); const applied = hashNow() === R.afterHash, src = applied ? R.snapshot : H.I();
        const v = OPT.verify(src, R.ov, R.comps); if (v.error) { alert(v.error); return true; }
        Object.assign(R, { base: v.base, final: v.final, comp: v.comp, inputsBefore: v.inputsBefore, inputsAfter: v.inputsAfter, reverified: new Date().toISOString().slice(11, 16) + ' UTC' });
        if (!applied) { R.baseHash = hashNow(); R.snapshot = JSON.parse(JSON.stringify(H.I())); }
        H.toast('Proposal re-verified with the full model'); H.render(); return true;
      }
      case 'o_revert': { if (!R || !R.snapshot) return true; if (confirm('Revert all inputs to the original design (snapshot taken before the optimisation)?')) { H.setInputs(R.snapshot); R.afterHash = null; H.toast('Reverted to the original design'); H.render(); } return true; }
      case 'o_case': { const nm = prompt('Save the optimised design as a new project named:', `Optimised – ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`); if (nm) { H.saveCase(nm, H.diffOf(Object.assign({}, R.snapshot, R.ov))); } return true; }
      case 'o_hclr': if (confirm('Clear the optimisation history?')) { hist = []; st.set(LSH, hist); H.render(); } return true;
    }
    return false;
  }
  // compact comparison kept with the history entry (printed in the report of the applied design)
  function compact() { return R.comp.map(c => ({ label: c.label, dimsBefore: c.dimsBefore, dimsAfter: c.dimsAfter, massBefore: c.before.mass, massAfter: c.after.mass, etaBefore: c.before.eta, etaAfter: c.after.eta, statusBefore: c.before.status, statusAfter: c.after.status, modeBefore: c.before.mode, modeAfter: c.after.mode, unit: c.key === 'joist' ? 'kg' : 'kg/m' })); }
  // the optimisation record for the report: only when the current inputs are exactly the applied optimised design
  function reportRecord() { const h = hashNow(); const e = hist.slice().reverse().find(x => x.afterHash === h && x.comp); return e || null; }
  const reset = () => { R = null; job = null; };
  return { load, state, hydrate, panel, onChange, onClick, runSetup, runProgress, runDone, reportRecord, reset, Ask };
})();
