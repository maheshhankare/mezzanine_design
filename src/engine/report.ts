// @ts-nocheck — ported verbatim from the mockup (index.html, 92_report.js).
import { U } from './util';
import { UNITS } from './units';
import { SCHEMA } from './schema';
import { CHK } from './check';
import { XCHK } from './xcheck';
import { SK } from './svg';
import { METHODS_HTML, TESTLOG } from './docs';
// ===== Printable report: built from the same result object as the screen (so the two always agree) =====
export const REPORT: any = (() => {
  const esc = U.esc, F = U.fmt;
  const BASIS = { code: 'code formula', approx: 'documented approximation – verify', num: 'numerical model (QA log)', user: 'user / manufacturer value', none: 'not established' };
  const etaT = c => c.status === 'N/A' ? '–' : c.eta === null || c.eta === undefined ? '–' : !isFinite(c.eta) ? (c.unstable ? '∞ (unstable)' : c.Ed === undefined ? 'rule' : '∞') : F(c.eta, 3);
  // display units (03_units.js), as on screen
  const UV = (x, u, h, d) => UNITS.show(x, u || '', UNITS.catFor(u || '', h), d, F).txt, UL = (u, h) => u ? UNITS.label(u, UNITS.catFor(u, h)) : '';
  const v = (c, x) => x === undefined || x === null ? '–' : typeof x === 'number' ? UV(c.fmt ? c.fmt(x) : x, c.unit, c.name, 3) : esc(x);
  const sv = (x, u, h) => typeof x === 'number' ? UV(x, u, h, Math.abs(x) >= 100 ? 1 : 4) : esc(x === undefined || x === null ? '–' : x);
  const st = s => `<span class="pill p-${(s || 'NA').replace('/', '')}">${esc(s || '–')}</span>`;
  function hash(o) { const s = JSON.stringify(o); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); }
  function table(list) {
    return `<table class="rp-t"><thead><tr><th>#</th><th>Check</th><th>Clause / method</th><th>E_d</th><th>R_d / limit</th><th>Unit</th><th>η</th><th>Status</th></tr></thead><tbody>${list.map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.name)}</td><td>${esc(c.clause || '')}</td><td class="num">${c.status === 'N/A' ? '–' : v(c, c.Ed)}</td><td class="num">${c.status === 'N/A' ? '–' : v(c, c.Rd)}</td><td>${esc(UL(c.unit, c.name))}</td><td class="num">${etaT(c)}</td><td>${st(c.status)}</td></tr>`).join('')}</tbody></table>`;
  }
  function detail(list, pre) {
    return list.map((c, i) => `<div class="rp-c"><h5>${pre}.${i + 1} ${esc(c.name)} ${st(c.status)}</h5>
      ${c.status === 'N/A' ? `<p>Not applicable: ${esc(c.naReason || '')}</p>` : `
      <p><b>Clause / method:</b> ${esc(c.clause || '–')}. <b>Basis:</b> ${esc(BASIS[c.basis] || c.basis)}.${c.factor ? ` <b>Factors:</b> ${esc(c.factor)}.` : ''}</p>
      ${c.eq ? `<p class="eq">${esc(c.eq)}</p>` : ''}
      ${(c.inputs || []).length ? `<p><b>Inputs:</b> ${c.inputs.map(r => `${esc(r[0])} = ${sv(r[1], r[2], r[0])} ${esc(UL(r[2], r[0]))}`).join('; ')}</p>` : ''}
      ${(c.steps || []).length ? `<table class="rp-s">${c.steps.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1] || '')}</td><td class="num">${sv(r[2], r[3], r[0])}</td><td>${esc(UL(r[3], r[0]))}</td></tr>`).join('')}</table>` : ''}
      <p><b>Result:</b> E_d = ${v(c, c.Ed)} ${esc(UL(c.unit, c.name))}, R_d = ${v(c, c.Rd)} ${esc(UL(c.unit, c.name))}, η = ${etaT(c)} → ${esc(c.status)}</p>
      ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
      ${c.status !== 'PASS' && c.why ? `<p><b>Mechanism:</b> ${esc(c.why)}</p>` : ''}${c.status !== 'PASS' && c.fix ? `<p><b>Remedies:</b> ${esc(c.fix)}</p>` : ''}`}</div>`).join('');
  }
  // inputs in the selected display units (angles stay in degrees); values are stored in the engine units
  const inC = f => { const c = f.type === 'n' && f.unit ? UNITS.catFor(f.unit, f.label) : null; return c === 'rot' ? null : c; };
  const inV = (f, val) => { const c = inC(f), x = Number(val); return c && String(val).trim() !== '' && isFinite(x) ? String(Number(UNITS.toDisp(x, f.unit, c).toPrecision(10))) : val; };
  const inU = f => { const c = inC(f); return c ? UNITS.label(f.unit, c) : f.unit || ''; };
  function inputsTable(I) {
    const tabs = SCHEMA.tabs;
    return tabs.map(t => {
      const fs = SCHEMA.T.filter(f => !f.tabDef && f.tab === t.id);
      return `<h4>${esc(t.label)}</h4><table class="rp-in">${fs.map(f => { let val = I[f.id]; if (f.type === 's' && f.opts) { const o = f.opts.find(x => String(x[0]) === String(val)); if (o) val = o[1]; } return `<tr><td>${esc(f.grp ? f.grp + ' – ' : '')}${esc(f.label)}</td><td>${esc(val === '' ? '(blank: not given)' : inV(f, val))}</td><td>${esc(inU(f))}</td></tr>`; }).join('')}</table>`;
    }).join('');
  }
  function memberSec(res, key, n, title) {
    const d = key === 'mb' ? res.mods.mb.gov : res.mods[key];
    if (!d || d.error) return `<h2>${n}. ${esc(title)}</h2><p>${d ? esc(d.error) : 'Not present in this layout.'}</p>`;
    const g = d.gross, sp = d.spec, cn = res.mods.conn[key === 'mb' ? 'cm' : key === 'sbi' ? 'ci' : 'ce'];
    const restr = [...(sp.restr.lat || []), ...(sp.restr.latC || []), ...(sp.restr.tor || []), ...(sp.restr.torC || [])];
    return `<h2>${n}. ${esc(title)} ${st(d.overall.status)}</h2>
      <p>${esc(sp.arr === 'single' ? 'Single C' : sp.arr === 'b2b' ? 'Two C back-to-back' : 'Four C (two back-to-back pairs)')} ${sp.p.H}×${sp.p.Bt}${sp.p.Bb !== sp.p.Bt ? '/' + sp.p.Bb : ''}×${sp.p.Ct}${sp.p.Cb !== sp.p.Ct ? '/' + sp.p.Cb : ''}×${sp.p.t}, r = ${sp.p.r} mm, f_yb = ${sp.mat.fy}, f_u = ${sp.mat.fu} N/mm². Span ${F(sp.L, 0)} mm, supports ${sp.supports.map(x => F(x, 0)).join(', ')} mm.</p>
      <div class="rp-fig">${SK.section(sp.p, sp.arr, sp.opt, g, { W: 300, H: 300, lp: sp.lp, mT: ((sp.G.udl[0] ? d.comb.aG * sp.G.udl[0].w : 0) + (sp.Q.udl[0] ? d.comb.aQ * sp.Q.udl[0].w : 0)) * (sp.eUdl || 0) / 1e3 })}${cn ? SK.webHoles(cn.geo, cn.adj, { W: 360, H: 300 }) : ''}</div>
      <table class="rp-in"><tr><td>A</td><td>${F(g.A, 1)} mm²</td><td>Mass</td><td>${F(g.mass, 2)} kg/m</td></tr><tr><td>I_y</td><td>${F(g.Iyy / 1e4, 1)} cm⁴</td><td>I_z</td><td>${F(g.Izz / 1e4, 2)} cm⁴</td></tr><tr><td>I_t</td><td>${F(g.It / 1e4, 4)} cm⁴</td><td>I_w</td><td>${F(g.Iw / 1e6, 0)} cm⁶</td></tr><tr><td>y_c, z_c</td><td>${F(g.yc, 2)}, ${F(g.zc, 1)} mm</td><td>y_sc, z_sc</td><td>${F(g.ysc, 2)}, ${F(g.zsc, 1)} mm</td></tr>
      <tr><td>W_eff,y sag / hog</td><td>${F(d.eff.WeffP / 1e3, 2)} / ${F(d.eff.WeffN / 1e3, 2)} cm³</td><td>M_cr credited / forks</td><td>${F(d.Mcr / 1e6, 2)} / ${F(d.Mcr0 / 1e6, 2)} kNm</td></tr></table>
      ${SK.beam(d)}
      <h4>Restraints</h4>${restr.length ? `<table class="rp-in">${restr.map(r => `<tr><td>${esc(r.label)}</td><td>${r.credited ? 'credited' : 'NOT credited'}</td><td>${esc(r.why || '')}</td></tr>`).join('')}</table>` : '<p>Fork supports only.</p>'}
      ${(d.notes || []).map(x => `<p class="note">${esc(x)}</p>`).join('')}
      <h4>Check summary</h4>${table(d.checks)}<h4>Detailed calculations</h4>${detail(d.checks, n)}`;
  }
  function html(res, I, optRec) {
    const S = res.summary, date = XCHK.localDate(), h = XCHK.fingerprint(I); // fingerprint of the canonical inputs: the same project gives the same value in every browser
    let n = 0; const N = () => ++n;
    const conn = ['ci', 'ce', 'cm'].map(k => res.mods.conn[k]).filter(Boolean);
    const sec = [];
    sec.push(`<section class="rp-cover"><h1>C-Section Beam System – Design Report</h1><p class="rp-sub">${esc(I.proj)} · ${esc(I.ref)}</p>
      <table class="rp-in"><tr><td>Designer</td><td>${esc(I.eng || '–')}</td></tr><tr><td>Date</td><td>${date}</td></tr><tr><td>Application</td><td>C-Section Beam System Designer ${esc(APP_VERSION)}, calculation engine ${esc(XCHK.ENGINE_VERSION)}</td></tr><tr><td>Design route</td><td>${esc(res.R.name)}</td></tr><tr><td>ULS / SLS</td><td>${esc(res.R.ulsText)} / ${esc(res.R.slsText)}</td></tr><tr><td>Input fingerprint</td><td>${h} (the screen and this report are generated from the same calculation)</td></tr>
      <tr><td>Overall result</td><td>${st(S.overall.status)} max η ${S.overall.gov ? etaT(S.overall.gov) : '–'} · ${S.nPass} PASS, ${S.nFail} FAIL, ${S.nReview} REVIEW, ${S.nNA} N/A</td></tr></table>
      <p class="note">PASS means the check is satisfied by the stated method. REVIEW means the resistance was not established or the method is outside the implemented scope: an engineer must resolve it. Approximations are labelled in every check and listed in Appendix A. Validation is limited to the tests in Appendix B.</p></section>`);
    const s1 = N(); sec.push(`<h2>${s1}. Summary and diagnosis</h2><table class="rp-t"><thead><tr><th>Module</th><th>Status</th><th>max η</th><th>Governing check</th><th>REVIEW</th></tr></thead><tbody>${S.rows.map(r => `<tr><td>${esc(r.label)}</td><td>${st(r.status)}</td><td class="num">${r.gov ? etaT(r.gov) : '–'}</td><td>${esc(r.gov ? r.gov.name : '–')}</td><td class="num">${r.nReview || 0}</td></tr>`).join('')}</tbody></table>
      ${(() => { const all = S.rows.flatMap(r => r.list.map(c => [r.label, c])); const f = all.filter(([, c]) => c.status === 'FAIL'), rv = all.filter(([, c]) => c.status === 'REVIEW'); return (f.length ? `<h4>Failing checks</h4><ol>${f.map(([m, c]) => `<li><b>${esc(m)}</b> – ${esc(c.name)} (η ${etaT(c)}). ${esc(c.why || '')} <i>Remedies:</i> ${esc(c.fix || '–')}</li>`).join('')}</ol>` : '') + (rv.length ? `<h4>REVIEW items</h4><ol>${rv.map(([m, c]) => `<li><b>${esc(m)}</b> – ${esc(c.name)}: ${esc(c.note || '')}</li>`).join('')}</ol>` : ''); })()}`);
    const s2 = N(); sec.push(`<h2>${s2}. Design basis, analysis model and load path</h2><p>Units: N, mm, N/mm² internally; kN, kNm, kg/m² in the output. Area loads in kg/m² are converted with g = 9.80665 m/s².</p>
      <table class="rp-in"><tr><td>Surface + permanent</td><td>${F(+I.d_sw + +I.qG, 0)} kg/m² = ${F(res.area.Gk, 3)} kN/m²</td></tr><tr><td>Imposed</td><td>${F(+I.qQ, 0)} kg/m² = ${F(res.area.Qk, 3)} kN/m²</td></tr><tr><td>ULS area load</td><td>${F(res.area.qEd, 3)} kN/m² (${esc(res.area.comb.text)})</td></tr>
      <tr><td>SB-Int reaction G / Q</td><td>${F(res.load.RsbiG.G / 1e3, 2)} / ${F(res.load.RsbiG.Q / 1e3, 2)} kN</td></tr><tr><td>SB-End reaction G / Q</td><td>${F(res.load.RsbeGQ.G / 1e3, 2)} / ${F(res.load.RsbeGQ.Q / 1e3, 2)} kN</td></tr><tr><td>Main-beam reaction G / Q</td><td>${F(res.load.RmbGQ.G / 1e3, 2)} / ${F(res.load.RmbGQ.Q / 1e3, 2)} kN</td></tr><tr><td>Column N_Ed</td><td>${F(res.load.Ncol / 1e3, 2)} kN</td></tr></table>
      <div class="rp-fig">${SK.plan(I, res.layout, res.mods)}</div>
      <h4>Load application convention</h4>${(() => { const conv = { cg: 'Through Centroid (CG)', flange: 'On the top flange at mid-width', sc: 'Idealised: through the shear centre (no additional torsion)' }[I.lc_conv]; const rows = ['sbi', 'sbe', 'mb'].map(k => { const d = k === 'mb' ? res.mods.mb.gov : res.mods[k]; if (!d || d.error || !d.spec.lp) return ''; const lp = d.spec.lp; return `<tr><td>${k === 'mb' ? 'Main beam (distributed loads)' : k === 'sbi' ? 'SB-Int' : 'SB-End'}</td><td>${esc(lp.label)}</td><td>${F(lp.yc, 1)}, ${F(lp.zc, 1)}</td><td>${F(lp.ysc, 1)}, ${F(lp.zsc, 1)}</td><td>${F(lp.dyc, 1)}, ${F(lp.dzc, 1)}</td><td>${F(d.spec.eUdl, 1)}</td><td>${F(d.spec.loadA, 1)}</td></tr>`; }).join('');
        return `<p>Global convention: <b>${esc(conv)}</b>. The centroid (CG) of an open lipped C is not its shear centre (SC): a load through the CG is eccentric to the SC by e and applies a torque m_T = q·e, which is included in the torsion (St Venant + warping), lateral bending and stability checks; it is never suppressed because CG loading is selected. LTB load height: ${I.lc_h === 'top' ? 'top flange, where the floor bears (destabilising)' : 'at the convention reference point'}. SB-Int reactions enter the main beam through their physical cleat connection (bolt line), represented separately from the convention.${I.lc_conv === 'sc' || ['sbi_ecc', 'sbe_ecc', 'mb_lcu'].some(k => I[k] === 'sc') ? ` <b>Shear-centre assumption acknowledged</b> – justification: ${esc(I.lc_just)}.` : ''}</p><table class="rp-in"><tr><th>Member</th><th>Load applied</th><th>CG y, z [mm]</th><th>SC y, z [mm]</th><th>CG − SC [mm]</th><th>e to SC [mm]</th><th>LTB load height above SC [mm]</th></tr>${rows}</table>`; })()}
      <p>Analysis: Euler–Bernoulli beam FE for internal forces and deflection; Vlasov thin-walled FE eigenvalue for M_cr with the actual moment diagram, load height and credited restraints; static Vlasov FE for torsion (St Venant + warping) amplified by 1/(1 − M_Ed/M_cr); finite-strip signature curve for the AISI DSM route. Joints pinned for the span unless set semi-rigid; each joint is classified by stiffness and checked for the moment it attracts.</p>`);
    if (optRec) { const so = N(); sec.push(`<h2>${so}. Optimisation record</h2><p>This design was produced by the Optimisation tab on ${esc(optRec.when.slice(0, 16).replace('T', ' '))} (${esc(optRec.mode)} mode, objective ${esc(optRec.obj)}) and applied on ${esc(String(optRec.applied).slice(0, 16).replace('T', ' '))}. Every value below was recalculated by the full model; the checks in this report are those of the applied design.</p>
      <table class="rp-t"><thead><tr><th>Component</th><th>Original</th><th>Optimised</th><th>Mass</th><th>Max η</th><th>Status</th><th>Governing failure mode (original → optimised)</th></tr></thead><tbody>${optRec.comp.map(c => `<tr><td>${esc(c.label)}</td><td>${esc(c.dimsBefore)}</td><td>${esc(c.dimsAfter)}</td><td class="num">${F(c.massBefore, 2)} → ${F(c.massAfter, 2)} ${esc(c.unit)}</td><td class="num">${c.etaBefore === null || !isFinite(c.etaBefore) ? '∞' : F(c.etaBefore, 2)} → ${c.etaAfter === null || !isFinite(c.etaAfter) ? '∞' : F(c.etaAfter, 2)}</td><td>${st(c.statusBefore)} → ${st(c.statusAfter)}</td><td>${esc(c.modeBefore || '')} → ${esc(c.modeAfter || '')}</td></tr>`).join('')}</tbody></table>
      <p>Input changes: ${Object.entries(optRec.ov || {}).map(([k, v]) => esc(k) + ' = ' + esc(String(v))).join('; ')}.</p>`); }
    const s3 = N(); sec.push(`<h2>${s3}. Inputs</h2>${inputsTable(I)}`);
    sec.push(memberSec(res, 'mb', N(), 'Main beam (' + (res.mods.mb.gov ? res.mods.mb.gov.spec.line : '') + ' line governs)'));
    sec.push(memberSec(res, 'sbi', N(), 'SB-Int'));
    sec.push(memberSec(res, 'sbe', N(), 'SB-End'));
    const sc = N(); sec.push(`<h2>${sc}. Connections</h2>` + conn.map((c, i) => `<h3>${sc}.${i + 1} ${esc(c.checks[0] ? c.checks[0].grp : '')}: ${esc(c.typeName)} ${st(c.overall.status)}</h3><div class="rp-fig">${SK.webHoles(c.geo, c.adj, { W: 360, H: 300 })}${SK.connPlan(c.geo, { e: c.e })}</div>
      <p>Bolt-group eccentricity e = ${F(c.e, 1)} mm; S_j,ini = ${F((c.stiff.Sj || 0) / 1e6, 1)} kNm/rad → ${esc(c.stiff.cls || '–')} (limits ${F((c.stiff.pinLim || 0) / 1e6, 1)} / ${F((c.stiff.rigidLim || 0) / 1e6, 1)} kNm/rad). Fork restraint: ${c.fork ? 'demonstrated' : 'not demonstrated'}.</p>${table(c.checks)}${detail(c.checks, sc + '.' + (i + 1))}`).join(''));
    const scol = N(); sec.push(`<h2>${scol}. Box column, base plate and slab ${st(CHK.overall(res.mods.col.checks.concat(res.mods.base.checks)).status)}</h2><div class="rp-fig">${SK.column(I, res.mods.col.props)}${SK.basePlate(I)}</div>
      <p>N_Ed = ${F(res.mods.col.loads.N / 1e3, 2)} kN, M_y,Ed = ${F(res.mods.col.loads.My / 1e6, 3)} kNm, M_z,Ed = ${F(res.mods.col.loads.Mz / 1e6, 3)} kNm, V_Ed = ${F(res.mods.col.loads.V / 1e3, 2)} kN.</p>${table(res.mods.col.checks)}${detail(res.mods.col.checks, scol + 'a')}${table(res.mods.base.checks)}${detail(res.mods.base.checks, scol + 'b')}`);
    const js = ['sbi', 'sbe'].map(k => res.mods[k] && res.mods[k].restrInfo && res.mods[k].restrInfo.joist).filter(Boolean);
    const sj = N(); sec.push(`<h2>${sj}. Joist beams</h2>` + (js.length ? js.map(j => `<p>Positions ${j.positions.map(x => F(x, 0)).join(', ')} mm; credited: ${j.credited ? 'yes' : 'no'} – ${esc(j.reason || '')}</p>${table(j.checks)}${detail(j.checks, sj)}`).join('') : '<p>Joists are not selected as a restraint; they are not credited.</p>'));
    const sk = N(); const kn = res.mods.knee; sec.push(`<h2>${sk}. Knee bracing</h2>` + (kn.use ? `<div class="rp-fig">${SK.knee(I, kn)}</div><p>H = ${F(kn.H / 1e3, 2)} kN, N = ${F(kn.N / 1e3, 2)} kN, φ = ${F(kn.phi, 5)}.</p>${table(kn.checks)}${detail(kn.checks, sk)}` : '<p>No knee braces.</p>'));
    const sd = N(); const dk = [res.mods.deck.vert.checks, ...['sbi', 'sbe'].map(k => res.mods[k] && res.mods[k].restrInfo && res.mods[k].restrInfo.deck ? res.mods[k].restrInfo.deck.checks : null).filter(Boolean)];
    sec.push(`<h2>${sd}. Surface / decking</h2>${dk.map((l, i) => table(l) + detail(l, sd + '.' + (i + 1))).join('')}`);
    const sb = N(); sec.push(`<h2>${sb}. Bracing and restraints</h2>${table(res.mods.brac.checks)}${detail(res.mods.brac.checks, sb)}`);
    sec.push(`<h2>Appendix A. Calculation methods</h2>${typeof METHODS_HTML !== 'undefined' ? METHODS_HTML : '<p>See METHODS.md.</p>'}`);
    sec.push(`<h2>Appendix B. QA test log</h2>${typeof TESTLOG !== 'undefined' ? `<p>${esc(TESTLOG.summary)}</p><table class="rp-t"><thead><tr><th>ID</th><th>Test case</th><th>Reference</th><th>Reference value</th><th>App result</th><th>Discrepancy</th><th>Disposition</th></tr></thead><tbody>${TESTLOG.rows.map(r => `<tr><td>${esc(r.id)}</td><td>${esc(r.test)}</td><td>${esc(r.ref)}</td><td class="num">${esc(r.refVal)}</td><td class="num">${esc(r.app)}</td><td class="num">${esc(r.diff)}</td><td>${esc(r.disp)}</td></tr>`).join('')}</tbody></table>` : '<p>Not embedded.</p>'}`);
    return `<div class="rp">${sec.join('')}<p class="rp-foot">Generated ${date} · input fingerprint ${h} · ${esc(APP_VERSION)} · engine ${esc(XCHK.ENGINE_VERSION)}</p></div>`;
  }
  return { html, hash };
})();

