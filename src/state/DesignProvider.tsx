'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SCHEMA } from '@/engine/schema';
import { MODEL } from '@/engine/model';
import { UNITS } from '@/engine/units';
import { XCHK } from '@/engine/xcheck';
import { REPORT } from '@/engine/report';
import { OPTUI } from '@/engine/optui';
import { LS, store, download } from '@/lib/store';
import { dispOf, intOf } from '@/lib/inputs';
import { APP_NAME, APP_VERSION, PRESETS, TABS, b64d, b64e, checkProject, diffOf, takeoff } from '@/lib/project';
import { optHost } from '@/lib/optHost';

type Inputs = Record<string, any>;
type Src = { kind: string; name?: string; version?: string | null; saved?: string | null; edited?: boolean; reproduced?: boolean };

export interface Design {
  I: Inputs;
  res: any;
  busy: boolean;
  tab: string;
  connSel: string;
  unitsVer: number;
  toastMsg: string;
  reportHtml: string;
  diagOpen: boolean;
  theme: 'light' | 'dark';
  caseNames: string[];
  setField: (id: string, raw: string) => void;
  setTab: (t: string) => void;
  setConnSel: (c: string) => void;
  goto: (tab: string, opts?: { conn?: string; fid?: string }) => void;
  toast: (m: string) => void;
  flush: () => void;
  setTheme: (t: 'light' | 'dark', save?: boolean) => void;
  saveCase: () => void;
  loadCase: (n: string) => void;
  deleteCase: () => void;
  exportProject: () => void;
  importFile: (f: File) => void;
  copyLink: () => void;
  resetAll: () => void;
  printReport: () => void;
  setDiagOpen: (b: boolean) => void;
  diagState: () => any;
  setUnits: (k: string, v: string) => void;
  tick: number;
  bumpOpt: () => void;
  getI: () => Inputs;
  getRes: () => any;
}

const Ctx = createContext<Design | null>(null);
export const useDesign = (): Design => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDesign outside DesignProvider');
  return c;
};

const cases = (): Record<string, any> => store.get(LS.cases) || {};

function initial() {
  const th = store.get(LS.theme) === 'dark' ? 'dark' : 'light';
  UNITS.set(store.get(LS.units) || {}, true);
  let src: Src = { kind: 'defaults' };
  let start: Inputs | null = null;
  const m = location.hash.match(/#c=([\w-]+)/);
  if (m) {
    try {
      start = JSON.parse(b64d(m[1]));
      src = { kind: 'link' };
    } catch {
      start = null;
    }
  }
  if (!start) {
    start = store.get(LS.last);
    if (start && Object.keys(start).length) src = { kind: 'browser' };
  }
  const ex = cases();
  let ch = false;
  for (const n in PRESETS) if (!ex[n]) { ex[n] = PRESETS[n]; ch = true; }
  if (ch) store.set(LS.cases, ex);
  const I = Object.assign(SCHEMA.defaults(), start || {});
  let tab = store.get(LS.tab) || 'gen';
  if (!TABS.some((x) => x[0] === tab)) tab = 'gen';
  return { I, src, tab, th: th as 'light' | 'dark' };
}

export function DesignProvider({ children }: { children: ReactNode }) {
  const init = useRef<ReturnType<typeof initial> | null>(null);
  if (!init.current) init.current = initial();

  const [I, setI] = useState<Inputs>(init.current.I);
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(true);
  const [tab, setTabState] = useState<string>(init.current.tab);
  const [connSel, setConnSel] = useState('ci');
  const [unitsVer, setUnitsVer] = useState(0);
  const [toastMsg, setToastMsg] = useState('');
  const [reportHtml, setReportHtml] = useState('');
  const [diagOpen, setDiagOpen] = useState(false);
  const [theme, setThemeState] = useState<'light' | 'dark'>(init.current.th);
  const [caseNames, setCaseNames] = useState<string[]>([]);
  const [tick, setTick] = useState(0);

  const Iref = useRef(I);
  const resRef = useRef<any>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const src = useRef<Src>(init.current.src);
  const resFp = useRef<string | null>(null);
  const resAt = useRef<Date | null>(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToastMsg(''), 2600);
  }, []);

  const refreshCases = useCallback(() => setCaseNames(Object.keys(cases()).sort()), []);

  const recompute = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const cur = Iref.current;
    store.set(LS.last, diffOf(cur));
    let r: any;
    try {
      r = MODEL.compute(cur);
    } catch (e: any) {
      r = { fatal: true, msgs: [{ level: 'error', tab: 'gen', text: 'Calculation error: ' + (e && e.message ? e.message : e) }], crash: true };
      console.error(e);
    }
    resRef.current = r;
    resFp.current = XCHK.fingerprint(cur);
    resAt.current = new Date();
    setRes(r);
    setBusy(false);
  }, []);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    timer.current = setTimeout(recompute, 300);
  }, [recompute]);

  // run a pending (debounced) recalculation now, so an action never uses results older than the inputs on screen
  const flush = useCallback(() => {
    if (timer.current) recompute();
  }, [recompute]);

  const replaceInputs = useCallback(
    (obj: Inputs | null) => {
      const next = Object.assign(SCHEMA.defaults(), obj || {});
      Iref.current = next;
      setI(next);
      recompute();
    },
    [recompute],
  );

  // The optimisation panel (imperative module) must be bound before the first paint: child effects run before this one's.
  useState(() => {
    optHost.bind({
      getI: () => Iref.current,
      getRes: () => resRef.current,
      toast,
      render: () => setTick((t) => t + 1),
      assign: (ov: Inputs) => {
        Iref.current = { ...Iref.current, ...ov };
        setI(Iref.current);
        recompute();
      },
      setInputs: (obj: Inputs) => replaceInputs(JSON.parse(JSON.stringify(obj))),
      saveCase: (n: string, inputs: Inputs) => {
        const c = cases();
        c[n] = { inputs, saved: new Date().toISOString() };
        store.set(LS.cases, c);
        refreshCases();
      },
    });
    return 0;
  });

  // ---------------- one-time setup ----------------
  useEffect(() => {
    document.documentElement.dataset.theme = init.current!.th;
    const off = UNITS.onChange(() => setUnitsVer((v) => v + 1));
    refreshCases();
    recompute();
    if (src.current.kind === 'browser') toast('Restored the last inputs saved in this browser (other browsers keep their own): see Diagnostics');
    const onBefore = () => {
      const r = resRef.current;
      if (r && !r.fatal) setReportHtml((h) => h || REPORT.html(r, Iref.current, OPTUI.reportRecord()));
    };
    const onAfter = () => setReportHtml('');
    window.addEventListener('beforeprint', onBefore);
    window.addEventListener('afterprint', onAfter);
    return () => {
      if (typeof off === 'function') off();
      window.removeEventListener('beforeprint', onBefore);
      window.removeEventListener('afterprint', onAfter);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------- inputs ----------------
  const setField = useCallback(
    (id: string, raw: string) => {
      const f = SCHEMA.byId[id];
      const next: Inputs = { ...Iref.current, [id]: f ? intOf(f, raw) : raw };
      src.current.edited = true;
      // grade → f_y / f_u (only when a listed grade is picked; values stay editable)
      const gm = id.match(/^(.*)(gr|pgr)$/);
      if (gm && SCHEMA.GV[raw]) {
        const base = gm[1],
          fy = gm[2] === 'pgr' ? base + 'pfy' : base + 'fy',
          fu = gm[2] === 'pgr' ? base + 'pfu' : base + 'fu';
        for (const [k, v] of [[fy, SCHEMA.GV[raw][0]], [fu, SCHEMA.GV[raw][1]]] as [string, any][]) if (SCHEMA.byId[k]) next[k] = v;
      }
      Iref.current = next;
      setI(next);
      schedule();
    },
    [schedule],
  );

  const setTab = useCallback((t: string) => {
    setTabState(t);
    store.set(LS.tab, t);
    window.scrollTo(0, 0);
  }, []);

  const goto = useCallback(
    (t: string, opts?: { conn?: string; fid?: string }) => {
      if (opts?.conn) setConnSel(opts.conn);
      else if (opts?.fid && /^(ci|ce|cm)_/.test(opts.fid)) setConnSel(opts.fid.slice(0, 2));
      setTab(t);
      if (opts?.fid) {
        const fid = opts.fid;
        setTimeout(() => {
          const el = document.getElementById('f_' + fid);
          if (el) {
            el.scrollIntoView({ block: 'center' });
            (el as HTMLElement).focus();
          }
        }, 60);
      }
    },
    [setTab],
  );

  // ---------------- theme ----------------
  const setTheme = useCallback(
    (th: 'light' | 'dark', save?: boolean) => {
      document.documentElement.dataset.theme = th;
      setThemeState(th);
      if (save) {
        store.set(LS.theme, th);
        toast(th === 'dark' ? 'Dark Mode' : 'Light Mode');
      }
    },
    [toast],
  );

  // ---------------- units ----------------
  const setUnits = useCallback(
    (k: string, v: string) => {
      const u = UNITS.get();
      if (k === 'mode') u.mode = v;
      else if (k === 'preset') {
        if (!v) return;
        Object.assign(u, UNITS.defaults(), UNITS.PRESETS[v].set, { mode: 'custom' });
      } else u[k] = v;
      UNITS.set(u);
      store.set(LS.units, UNITS.get());
      toast(UNITS.native() ? 'Units: as calculated' : 'Units converted (the results are unchanged)');
    },
    [toast],
  );

  // ---------------- cases, links, import / export ----------------
  const saveCase = useCallback(() => {
    const n = prompt('Save the current inputs as design case:', Iref.current.ref || 'Case');
    if (!n) return;
    const c = cases();
    if (c[n] && !confirm(`Overwrite “${n}”?`)) return;
    c[n] = { inputs: diffOf(Iref.current), saved: new Date().toISOString() };
    if (store.set(LS.cases, c)) {
      refreshCases();
      toast('Saved “' + n + '” in this browser');
    } else toast('Browser storage is not available: use Export');
  }, [refreshCases, toast]);

  const loadCase = useCallback(
    (n: string) => {
      if (!n) return;
      const c = cases()[n];
      if (c && confirm(`Load design case “${n}”? Unsaved changes are replaced.`)) {
        replaceInputs(c.inputs);
        src.current = { kind: 'case', name: n };
        toast('Loaded “' + n + '”');
      }
    },
    [replaceInputs, toast],
  );

  const deleteCase = useCallback(() => {
    const c = cases(),
      names = Object.keys(c);
    if (!names.length) return toast('No saved cases');
    const n = prompt('Delete which case?\n' + names.join('\n'));
    if (n && c[n] && confirm(`Delete “${n}”?`)) {
      delete c[n];
      store.set(LS.cases, c);
      refreshCases();
      toast('Deleted');
    }
  }, [refreshCases, toast]);

  const exportProject = useCallback(() => {
    flush();
    const cur = Iref.current;
    const file = {
      format: XCHK.FORMAT, formatVersion: XCHK.FORMAT_VERSION, app: APP_NAME, version: APP_VERSION, engine: XCHK.ENGINE_VERSION,
      saved: new Date().toISOString(), fingerprint: XCHK.fingerprint(cur), results: XCHK.summary(resRef.current),
      inputs: diffOf(cur), cases: cases(), units: UNITS.get(),
    };
    download(`${(cur.ref || 'design').replace(/[^\w-]+/g, '_')}.csbd.json`, JSON.stringify(file, null, 2), 'application/json');
    toast('Project exported: open it in any browser with Import');
  }, [flush, toast]);

  const importFile = useCallback(
    (f: File) => {
      const rd = new FileReader();
      rd.onerror = () => alert('The file could not be read.');
      rd.onload = () => {
        const fname = f.name;
        let o: any;
        try {
          o = JSON.parse(String(rd.result));
        } catch (err: any) {
          alert(`“${fname}” is not a valid project file (not JSON): ${err.message}`);
          return;
        }
        const P = checkProject(o);
        if (P.errors.length) {
          alert(`“${fname}” cannot be opened; nothing was changed:\n• ${P.errors.join('\n• ')}`);
          return;
        }
        if (!confirm(`Open “${fname}”?\n${P.desc}${P.notes.length ? '\n\n• ' + P.notes.join('\n• ') : ''}\n\nThe current inputs are replaced (Export them first if you need them).`)) return;
        if (P.cases) {
          const c = cases(),
            clash = Object.keys(P.cases).filter((n) => c[n] && JSON.stringify(c[n].inputs) !== JSON.stringify(P.cases[n].inputs));
          const over = !clash.length || confirm(`${clash.length} design case(s) in the file have the same name as different cases in this browser:\n${clash.join('\n')}\n\nOK = replace them. Cancel = keep yours and add the file's as “… (imported)”.`);
          for (const n in P.cases) c[clash.includes(n) && !over ? n + ' (imported)' : n] = P.cases[n];
          store.set(LS.cases, c);
          refreshCases();
        }
        if (o.units && typeof o.units === 'object') {
          UNITS.set(o.units, true);
          store.set(LS.units, UNITS.get());
        }
        replaceInputs(P.inputs!);
        src.current = { kind: 'file', name: fname, version: o.version || null, saved: o.saved || null };
        const r = resRef.current;
        // the same project, version and engine must give the same results in every browser
        if (o.results && !o.results.fatal && r && !r.fatal) {
          const cmp = XCHK.compare(o.results, XCHK.summary(r));
          src.current.reproduced = !cmp.fails.length;
          if (cmp.fails.length)
            alert(
              `The results calculated now differ from those recorded in “${fname}”:\n${cmp.fails.slice(0, 8).map((x: any) => `• ${x.path}: file ${x.exp}, now ${x.act}`).join('\n')}\n\n` +
                (o.version === APP_VERSION && o.engine === XCHK.ENGINE_VERSION
                  ? 'The versions are the same, so this is a reproducibility problem: export Diagnostics in both browsers and compare them.'
                  : `The file was saved with ${o.version || '?'} (engine ${o.engine || '?'}); this is ${APP_VERSION} (engine ${XCHK.ENGINE_VERSION}). A version change can explain the difference: see CHANGES.`),
            );
          else toast(`Opened “${fname}”: results reproduce the saved file`);
        } else toast(o.results ? `Opened “${fname}”` : `Opened “${fname}” (the file has no recorded results to compare)`);
      };
      rd.readAsText(f);
    },
    [refreshCases, replaceInputs, toast],
  );

  const copyLink = useCallback(() => {
    const url = location.href.split('#')[0] + '#c=' + b64e(JSON.stringify(diffOf(Iref.current)));
    history.replaceState(null, '', url);
    const ok = () => toast('Link copied');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, () => prompt('Copy this link:', url));
    else prompt('Copy this link:', url);
  }, [toast]);

  const resetAll = useCallback(() => {
    if (!confirm('Reset all inputs to the Example 3 defaults? Saved design cases are kept.')) return;
    src.current = { kind: 'defaults' };
    history.replaceState(null, '', location.href.split('#')[0]);
    OPTUI.reset();
    replaceInputs({});
    toast('Reset to defaults');
  }, [replaceInputs, toast]);

  const printReport = useCallback(() => {
    flush();
    const r = resRef.current;
    if (!r || r.fatal) {
      alert('Correct the invalid inputs first: the report needs a complete calculation.');
      return;
    }
    setReportHtml(REPORT.html(r, Iref.current, OPTUI.reportRecord()));
    setTimeout(() => window.print(), 50);
  }, [flush]);

  const diagState = useCallback(
    () => ({
      src: { ...src.current }, resFp: resFp.current, resAt: resAt.current, curFp: XCHK.fingerprint(Iref.current), pending: !!timer.current,
      fatal: !!(resRef.current && resRef.current.fatal), res: resRef.current, nChanged: Object.keys(diffOf(Iref.current)).length,
    }),
    [],
  );

  const value = useMemo<Design>(
    () => ({
      I, res, busy, tab, connSel, unitsVer, toastMsg, reportHtml, diagOpen, theme, caseNames, tick,
      setField, setTab, setConnSel, goto, toast, flush, setTheme, saveCase, loadCase, deleteCase, exportProject, importFile, copyLink,
      resetAll, printReport, setDiagOpen, diagState, setUnits, bumpOpt: () => setTick((t) => t + 1),
      getI: () => Iref.current, getRes: () => resRef.current,
    }),
    [I, res, busy, tab, connSel, unitsVer, toastMsg, reportHtml, diagOpen, theme, caseNames, tick, setField, setTab, goto, toast, flush, setTheme, saveCase, loadCase, deleteCase, exportProject, importFile, copyLink, resetAll, printReport, diagState, setUnits],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
