import { CHK } from '@/shared/check';
import { APP_VERSION } from '@/shared/version';
import { etaTxt } from './format';

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
