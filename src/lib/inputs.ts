import { UNITS } from '@/engine/units';
import { SCHEMA } from '@/engine/schema';

type Inputs = Record<string, any>;

// ---------------- field visibility (irrelevant inputs are hidden, never silently used) ----------------
export function visible(I: Inputs, connSel: string, id: string): boolean {
  const m = id.match(/^(mb|sbi|sbe)_(.*)$/);
  if (m) {
    const arr = I[m[1] + '_arr'],
      k = m[2];
    if (k === 'gap' && arr === 'single') return false;
    if (k === 'ps' && arr !== 'quad') return false;
    if (/^bu|^pc/.test(k) && arr === 'single') return false;
    if (/^pc/.test(k) && arr !== 'quad') return false;
    if (/^pc[TWS]$/.test(k) && I[m[1] + '_pcs'] !== 'tabs') return false;
    if (k === 'e' && I[m[1] + '_ecc'] !== 'user') return false;
    if ((k === 'buA' || k === 'buL') && !/weld/.test(I[m[1] + '_buT'])) return false;
    if (k === 'buL' && I[m[1] + '_buT'] === 'weldCont') return false;
    if (k === 'buD' && !/spot|bolt/.test(I[m[1] + '_buT'])) return false;
    if (k === 'buBg' && I[m[1] + '_buT'] !== 'bolt') return false;
    if ((k === 'buS' || k === 'buN' || k === 'buFu') && I[m[1] + '_buT'] === 'none') return false;
    if (k === 'buS' && I[m[1] + '_buT'] === 'weldCont') return false;
  }
  const c = id.match(/^(ci|ce|cm)_(.*)$/);
  if (c) {
    if (c[1] !== connSel) return false;
    const t = I[c[1] + '_type'],
      k = c[2];
    if (/Adj$/.test(k) && k !== 'nAdj' && !(+I[c[1] + '_nAdj'] > 0)) return false;
    if (k === 'lAdj' && I[c[1] + '_sAdj'] !== 'slot') return false;
    if ((k === 'nvs' || k === 'gs') && !/angle|endplate|boltweld/.test(t)) return false;
    if (/^(nv|nh|p1|p2|z1|es|d|bg|thr|d0|hole|wsh)$/.test(k) && t === 'welded') return false;
    if ((k === 'nh' || k === 'p2') && /endplate|boltweld/.test(t)) return false;
  }
  if ((id === 'lc_ack' || id === 'lc_just') && !(I.lc_conv === 'sc' || ['sbi_ecc', 'sbe_ecc', 'mb_lcu'].some((k) => I[k] === 'sc'))) return false;
  if (id === 'Ssbi' && I.sbiVar !== 'uniform') return false;
  if (id === 'xsbi' && I.sbiVar !== 'var') return false;
  if (id === 'col_ro' && I.col_type === 'weld') return false;
  if ((id === 'col_cw' || id === 'col_aw') && I.col_type !== 'weld') return false;
  if ((id === 'col_ky' || id === 'col_kz') && I.col_frame !== 'user') return false;
  const dt = I.d_type;
  if (/^d_(fmk|Em|kmod|gm)$/.test(id) && dt !== 'mdf') return false;
  if (/^d_(I|W|fy|fu)$/.test(id) && !(dt === 'steel' || dt === 'user')) return false;
  if (id === 'd_qall' && !(dt === 'grating' || dt === 'user')) return false;
  if (/^j_/.test(id) && id !== 'j_n' && !(+I.j_n > 0)) return false;
  if (/^k_/.test(id) && id !== 'k_use' && I.k_use !== 'yes') return false;
  if (/^k_(tg|sp)$/.test(id) && I.k_nL !== '2') return false;
  if (/^br_/.test(id) && id !== 'br_use' && id !== 'br_H' && I.br_use !== 'yes') return false;
  if (/^vb_[bt]$/.test(id) && I.vb_use !== 'yes') return false;
  return true;
}

// ---------------- display-unit conversion of inputs ----------------
// The value is kept in the engine unit (f.unit) in I; the field shows it in the selected display unit.
export function inCat(f: any): string | null {
  const u = UNITS.canon(f.unit),
    q = UNITS.qtyOf(u);
  if (!q || q === 'rotation') return null;
  if (q === 'stress') return /modulus|^E\b|^G\b/i.test(f.label) || f.id === 'E' ? 'E' : 'fy';
  if (q === 'force') return /axial/i.test(f.label) ? 'N' : /shear(?! stiff)/i.test(f.label) ? 'V' : 'P';
  if (q === 'moment') return 'Mload';
  if (q === 'length') return 'len';
  return (
    ({ area: 'area', inertia: 'I', modulus3: 'W', lineLoad: 'w', areaLoad: 'q', spring: 'k', density: 'rho', mass: 'mass' } as Record<string, string>)[q] ||
    null
  );
}
const r12 = (x: number) => Number(x.toPrecision(12));

export function dispOf(f: any, v: any): any {
  const c = inCat(f),
    x = Number(v);
  if (!c || UNITS.native() || f.type !== 'n' || String(v).trim() === '' || !isFinite(x)) return v;
  return String(r12(UNITS.toDisp(x, f.unit, c)));
}
export function intOf(f: any, v: any): any {
  const c = inCat(f),
    x = Number(v);
  if (!c || UNITS.native() || f.type !== 'n' || String(v).trim() === '' || !isFinite(x)) return v;
  return String(r12(UNITS.fromDisp(x, c, f.unit)));
}
export const unitOf = (f: any): string => {
  const c = inCat(f);
  return c ? UNITS.label(f.unit, c) : f.unit;
};

export function validateField(I: Inputs, id: string): string {
  const f = SCHEMA.byId[id];
  if (!f) return '';
  let msg = '';
  if (f.type === 'n') {
    const v = String(I[id]).trim();
    if (v === '') {
      if (!f.opt) msg = 'Required';
    } else if (!isFinite(Number(v))) msg = /^[+-]?\d*,\d+$/.test(v) ? 'Use a point (.) as the decimal separator' : 'Enter a number';
    else {
      const x = Number(v);
      if (f.min !== undefined && x < f.min) msg = `Minimum ${dispOf(f, f.min)} ${unitOf(f) || ''}`.trim();
      else if (f.max !== undefined && x > f.max) msg = `Maximum ${dispOf(f, f.max)} ${unitOf(f) || ''}`.trim();
      else if (f.int && Math.round(x) !== x) msg = 'Whole number';
    }
  }
  if (f.type === 'l' && String(I[id]).split(/[,;\s]+/).filter(Boolean).some((s) => !isFinite(Number(s)))) msg = 'Comma-separated numbers';
  return msg;
}
