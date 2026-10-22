// @ts-nocheck — ported verbatim from the mockup (index.html, 45_check.js); logic unchanged so results match the mockup.
import { U } from './util';
import { CODE_REGISTER } from './codeRegister';

// Clause numbers whose provision is VERIFIED in the code register (read in the official text, implemented and tested). A check that cites any other provision
// of IS 800:2007, or another standard that was not supplied (IS 456, IS 801, IS 875, ...), never gives PASS or FAIL: it is reported as REVIEW.
const VERIFIED = (() => {
  const set = new Set();
  for (const i of CODE_REGISTER) if (i.status === 'verified') for (const t of i.clause.match(/Table \d+|\d+(?:\.\d+)+/g) || []) set.add(t);
  return set;
})();
/** true when every IS 800 provision cited in `clause` is verified and no other (unsupplied) standard is cited */
export function clauseVerified(clause) {
  const c = String(clause || '');
  if (/IS (?!800)\d{3}/.test(c)) return false;
  if (!/IS 800/.test(c)) return true;
  const refs = [...c.matchAll(/IS 800(?::2007)?\s+((?:Table \d+|\d+(?:\.\d+)+)(?:\s*(?:,|and|\/)\s*(?:Table \d+|\d+(?:\.\d+)+))*)/g)].flatMap(m => m[1].match(/Table \d+|\d+(?:\.\d+)+/g));
  return refs.length > 0 && refs.every(t => VERIFIED.has(t));
}
// ===== Check records: every check carries its clause, basis, inputs, steps, demand, resistance, utilisation, status and remedies =====
// basis: 'code' (formula of IS 800:2007, verified), 'unverified' (IS 800 formula not yet verified in the code register: indicative, REVIEW), 'code' (formula of the selected standard), 'approx' (documented approximation, see method notes), 'num' (numerical model in this tool,
// validated in the test log), 'user' (user-supplied value), 'none' (resistance not established → REVIEW)
// status: PASS | FAIL | REVIEW | N/A
export const CHK: any = (() => {
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
    // IS 800:2007 provisions that are not verified in the code register (src/shared/codeRegister.ts) never give PASS or FAIL: the utilisation is indicative only
    if ((c.basis === 'code' || c.basis === 'approx' || c.basis === undefined) && !c.pending && !clauseVerified(c.clause)) c.basis = 'unverified';
    if (c.basis === 'unverified') { c.status = 'REVIEW'; c.note = (c.note ? c.note + ' ' : '') + 'The provision used for this check is not verified in the code register: the value is indicative and the check stays under review.'; }
    return c;
  }
  /** a check whose resistance cannot be established: the demand is shown, the resistance is pending (never a PASS) */
  const pending = (o, need) => mk(Object.assign({ basis: 'none', review: true, pending: true, note: need || '' }, o, { eta: null, Rd: undefined }));
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
  return { mk, na, pending, overall, s };
})();

