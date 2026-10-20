import { SCHEMA } from '@/engine/schema';
import { XCHK } from '@/engine/xcheck';
import { OPT } from '@/engine/opt';
import { CHK } from '@/engine/check';
import { APP_VERSION } from '@/engine/xbref';
import { etaTxt } from './format';

type Inputs = Record<string, any>;

export const APP_NAME = 'C-Section Beam System Designer';
export { APP_VERSION };

export const TABS: [string, string][] = [
  ['gen', 'General'],
  ['mb', 'Main Beam'],
  ['sbi', 'SB-Int'],
  ['sbe', 'SB-End'],
  ['conn', 'Connections'],
  ['col', 'Box Column'],
  ['joist', 'Joist'],
  ['knee', 'Knee'],
  ['deck', 'Surface / Decking'],
  ['brac', 'Bracing & Restraints'],
  ['sum', 'Summary & Diagnosis'],
  ['opt', 'Optimisation'],
  ['dwg', 'Drawings (DXF)'],
];
export const tabLabel = (t: string) => (TABS.find((x) => x[0] === t) || [t, t])[1];

export const NAV_GROUPS: [string, string[]][] = [
  ['Design modules', ['gen', 'mb', 'sbi', 'sbe', 'conn', 'col', 'joist', 'knee', 'deck', 'brac']],
  ['Results', ['sum', 'opt', 'dwg']],
];

export const TAB_OF: Record<string, string> = {
  mb: 'mb', sbi: 'sbi', sbe: 'sbe', ci: 'conn', ce: 'conn', cm: 'conn', col: 'col', base: 'col', joist: 'joist', knee: 'knee', deck: 'deck', brac: 'brac',
};

// ---------------- design cases, links ----------------
export function diffOf(J: Inputs): Inputs {
  const d = SCHEMA.defaults(),
    o: Inputs = {};
  for (const k in J) if (k in d && String(J[k]) !== String(d[k])) o[k] = J[k];
  return o;
}
export const b64e = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const b64d = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

// preset design cases written into the case list on first use
export const PRESETS: Record<string, { inputs: Inputs; saved: string }> = {
  'Example 3 – mapped to C (as entered)': { inputs: {}, saved: 'preset' },
  'Optimisation demo – main beam C200×50×10×2 (brief §9)': {
    inputs: { ref: 'Optimisation demo: main beam C200×50×10×2', mb_H: 200, mb_Bt: 50, mb_Bb: 50, mb_Ct: 10, mb_Cb: 10, mb_t: 2, sbi_arr: 'b2b', sbe_arr: 'b2b', sbi_t: 1.5, sbe_t: 1.5, ci_nv: 3, ci_p1: 80, ce_nv: 3, ce_p1: 80 },
    saved: 'preset',
  },
  'Example 3 – revised study (all checks PASS)': {
    inputs: { ref: 'Example 3 revised: b2b secondaries, main beam t 2.5', sbi_arr: 'b2b', sbe_arr: 'b2b', sbi_t: 1.5, sbe_t: 2, mb_t: 2.5, ci_nv: 3, ci_p1: 80, ce_nv: 3, ce_p1: 80, k_nL: '2', k_nb: 2, k_tg: 8 },
    saved: 'preset',
  },
};

// ---------------- project files (versioned JSON) ----------------
// Validate a project file before anything is changed: format, version, every input key and every option value.
export function checkProject(o: any): { errors: string[]; notes: string[]; inputs?: Inputs; cases?: any; desc?: string } {
  const errors: string[] = [],
    notes: string[] = [];
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { errors: ['the file does not contain a project object'], notes };
  const framed = 'format' in o || 'app' in o || 'inputs' in o;
  if (o.format !== undefined && o.format !== XCHK.FORMAT) errors.push(`format “${o.format}” is not a C-Section project`);
  if (o.app !== undefined && o.app !== APP_NAME) errors.push(`written by “${o.app}”, not by the ${APP_NAME}`);
  if (+o.formatVersion > XCHK.FORMAT_VERSION)
    errors.push(`written by a newer version (file format ${o.formatVersion}; this version reads up to ${XCHK.FORMAT_VERSION}): open it with ${o.version || 'the newer version'}`);
  const inp = framed ? o.inputs : o;
  if (!inp || typeof inp !== 'object' || Array.isArray(inp)) {
    errors.push('the file has no inputs');
    return { errors, notes };
  }
  const inputs: Inputs = {},
    unknown: string[] = [];
  for (const k in inp) {
    const f = SCHEMA.byId[k],
      v = inp[k];
    if (!f) {
      unknown.push(k);
      continue;
    }
    if (v !== null && typeof v === 'object') {
      errors.push(`${f.label}: not a single value`);
      continue;
    }
    if ((f.type === 's' || f.type === 'b') && !(f.type === 'b' ? ['yes', 'no'] : f.opts.map((x: any) => x[0])).some((x: any) => String(x) === String(v))) {
      errors.push(`${f.label}: “${v}” is not an option of this version`);
      continue;
    }
    inputs[k] = v === null ? '' : v;
  }
  if (unknown.length) notes.push(`${unknown.length} input name(s) not used by this version are ignored: ${unknown.slice(0, 8).join(', ')}${unknown.length > 8 ? ' …' : ''}`);
  let cs: any = null;
  if (o.cases !== undefined) {
    if (!o.cases || typeof o.cases !== 'object') notes.push('the design-case list is not readable and is ignored');
    else {
      cs = {};
      let bad = 0;
      for (const n in o.cases) {
        const c = o.cases[n];
        if (c && typeof c === 'object' && c.inputs && typeof c.inputs === 'object' && !checkProject(c.inputs).errors.length) cs[n] = c;
        else bad++;
      }
      if (bad) notes.push(`${bad} design case(s) with invalid inputs are ignored`);
    }
  }
  if (o.version && o.version !== APP_VERSION) notes.push(`saved with ${o.version}; this is ${APP_VERSION}`);
  if (o.engine && o.engine !== XCHK.ENGINE_VERSION) notes.push(`calculation engine ${o.engine} in the file, ${XCHK.ENGINE_VERSION} here: results can differ by design (see CHANGES)`);
  if (o.fingerprint && o.version === APP_VERSION && o.fingerprint !== XCHK.fingerprint(inputs)) notes.push('the inputs do not match the fingerprint stored in the file: the file was edited after it was saved');
  const desc = framed ? `Saved ${o.saved ? o.saved.slice(0, 16).replace('T', ' ') + ' UTC' : '(date not recorded)'} with ${o.version || 'an unknown version'}.` : 'Inputs only (no version information).';
  return { errors, notes, inputs, cases: cs, desc };
}

// ---------------- steel take-off ----------------
export function takeoff(r: any, J: Inputs) {
  if (!r || r.fatal) return null;
  const g = r.gross,
    nb = +J.nb,
    nm = +J.nm,
    mb = (g.mb.mass * (nm + 1) * nb * J.Lmb) / 1e3,
    sbi = (g.sbi.mass * +J.nsbi * nb * nm * J.Lsb) / 1e3,
    sbe = (g.sbe.mass * (nb + 1) * nm * J.Lsb) / 1e3;
  const col = ((r.mods.col.props ? r.mods.col.props.A : 0) * 7850e-6 * +J.hc / 1e3) * (nb + 1) * (nm + 1);
  const jr = ['sbi', 'sbe'].some((k) => /joist|both/.test(J[k + '_rst'])) && +J.j_n > 0 ? OPT.quantities(J, 'joist', {}).mass : 0;
  const area = (nb * J.Lmb * nm * J.Lsb) / 1e6,
    tot = mb + sbi + sbe + col + jr;
  return { mb, sbi, sbe, col, joist: jr, tot, area, perArea: tot / area };
}

// ---------------- tab status ----------------
export function tabStatus(res: any, t: string): string {
  if (!res || res.fatal) return ((res && res.msgs) || []).some((m: any) => m.tab === t && m.level === 'error') ? 'FAIL' : '';
  const keys = Object.keys(TAB_OF).filter((k) => TAB_OF[k] === t),
    rows = res.summary.rows.filter((r: any) => keys.includes(r.key));
  if (t === 'sum') return res.summary.overall.status;
  if (!rows.length) return '';
  return CHK.overall(rows.flatMap((r: any) => r.list)).status;
}

// η of the governing check of a tab, for the pill on the tab and in the left navigation
export function tabPillText(res: any, t: string, st: string): string {
  let gov: any = null;
  if (res && !res.fatal) {
    if (t === 'sum') gov = res.summary.overall.gov;
    else {
      const keys = Object.keys(TAB_OF).filter((k) => TAB_OF[k] === t),
        L = res.summary.rows.filter((r: any) => keys.includes(r.key)).flatMap((r: any) => r.list);
      gov = L.length ? CHK.overall(L).gov : null;
    }
  }
  return gov ? etaTxt(gov).replace(' (unstable)', '') : st === 'PASS' ? 'OK' : st === 'N/A' ? '—' : st;
}
