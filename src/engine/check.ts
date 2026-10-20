// @ts-nocheck — ported verbatim from the mockup (index.html, 45_check.js); logic unchanged so results match the mockup.
import { U } from './util';
// ===== Check records: every check carries its clause, basis, inputs, steps, demand, resistance, utilisation, status and remedies =====
// basis: 'code' (formula of the selected standard), 'approx' (documented approximation, see method notes), 'num' (numerical model in this tool,
// validated in the test log), 'user' (user-supplied value), 'none' (resistance not established → REVIEW)
// status: PASS | FAIL | REVIEW | N/A
export const CHK = (() => {
  function mk(o) {
    const c = Object.assign({ inputs: [], steps: [], basis: 'code', unit: '', why: '', fix: '', note: '' }, o);
    if (c.na) { c.status = 'N/A'; c.eta = null; return c; }
    if (c.eta === undefined) {
      if (U.isNum(c.Ed) && U.isNum(c.Rd) && c.Rd > 0) c.eta = Math.abs(c.Ed) / c.Rd;
      else if (U.isNum(c.Ed) && Math.abs(c.Ed) < 1e-12) c.eta = 0;
      else c.eta = null;
    }
    if (c.review) c.status = 'REVIEW';
    else if (c.eta === null || !isFinite(c.eta)) { c.status = c.eta === Infinity ? 'FAIL' : 'REVIEW'; if (c.eta !== Infinity) c.note = (c.note ? c.note + ' ' : '') + 'Resistance could not be established from the inputs.'; }
    else c.status = c.eta <= 1.0 + 1e-9 ? 'PASS' : 'FAIL';
    if (c.basis === 'none' && c.status === 'PASS') c.status = 'REVIEW';
    return c;
  }
  const na = (o, reason) => mk(Object.assign({}, o, { na: true, naReason: reason }));
  // overall status of a list: FAIL if any FAIL, REVIEW if any REVIEW, else PASS
  function overall(list) {
    const L = list.filter(c => c && c.status !== 'N/A');
    if (!L.length) return { status: 'N/A', eta: null, gov: null };
    let gov = null; for (const c of L) if (c.eta !== null && (!gov || c.eta > gov.eta)) gov = c;
    const st = L.some(c => c.status === 'FAIL') ? 'FAIL' : L.some(c => c.status === 'REVIEW') ? 'REVIEW' : 'PASS';
    return { status: st, eta: gov ? gov.eta : null, gov, nReview: L.filter(c => c.status === 'REVIEW').length };
  }
  const s = (sym, expr, val, unit) => [sym, expr, val, unit || ''];
  return { mk, na, overall, s };
})();

