'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SCHEMA } from '@/shared/schema';
import { UNITS } from '@/shared/units';
import { diffOf } from '@/shared/diff';
import { LS, store } from '@/lib/store';
import { intOf } from '@/lib/inputs';
import { ApiError, api, calcRequest, download } from '@/lib/api';
import { TABS } from '@/lib/project';

type Inputs = Record<string, any>;

export interface User { id: string; name: string; email: string; role: 'admin' | 'user' }
export interface ProjectMeta { name: string; reference: string; customer: string; customer_contact: string; site: string; notes: string }
export interface ProjectState extends ProjectMeta { id: string | null; revision: number | null; access: 'owner' | 'editor' | 'viewer'; updated_at?: string | null }
export interface SaveError { message: string; errors?: { id: string; label: string; message: string }[] }

export interface Design {
  user: User;
  project: ProjectState;
  I: Inputs;
  res: any;
  takeoff: any;
  fingerprint: string | null;
  busy: boolean;
  calcError: string | null;
  tab: string;
  connSel: string;
  unitsVer: number;
  toastMsg: string;
  diagOpen: boolean;
  detailsOpen: boolean;
  theme: 'light' | 'dark';
  dirty: boolean;
  saving: boolean;
  saveError: SaveError | null;
  canEdit: boolean;
  setField: (id: string, raw: string) => void;
  setMeta: (m: Partial<ProjectMeta>) => void;
  setTab: (t: string) => void;
  setConnSel: (c: string) => void;
  goto: (tab: string, opts?: { conn?: string; fid?: string }) => void;
  toast: (m: string) => void;
  setTheme: (t: 'light' | 'dark', save?: boolean) => void;
  setDiagOpen: (b: boolean) => void;
  setDetailsOpen: (b: boolean) => void;
  setUnits: (k: string, v: string) => void;
  save: () => Promise<boolean>;
  saveAsNew: () => Promise<void>;
  exportData: () => Promise<void>;
  importData: (f: File) => Promise<void>;
  generatePdf: () => Promise<void>;
  deleteProject: () => Promise<void>;
  resetInputs: () => void;
  logout: () => Promise<void>;
  applyEffects: (effects: any[]) => void;
  getI: () => Inputs;
  dismissSaveError: () => void;
}

const Ctx = createContext<Design | null>(null);
export const useDesign = (): Design => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDesign outside DesignProvider');
  return c;
};

const META_KEYS: (keyof ProjectMeta)[] = ['name', 'reference', 'customer', 'customer_contact', 'site', 'notes'];
const metaOf = (p: ProjectState): ProjectMeta => ({ name: p.name, reference: p.reference, customer: p.customer, customer_contact: p.customer_contact, site: p.site, notes: p.notes });
const keyOf = (I: Inputs, m: ProjectMeta) => JSON.stringify([diffOf(I), META_KEYS.map((k) => m[k])]);

export function DesignProvider({ user, initial, children }: { user: User; initial: { project: ProjectState; inputs: Inputs; isNew: boolean }; children: ReactNode }) {
  const [project, setProject] = useState<ProjectState>(initial.project);
  const [I, setI] = useState<Inputs>(() => Object.assign(SCHEMA.defaults(), initial.inputs));
  const [res, setRes] = useState<any>(null);
  const [takeoff, setTakeoff] = useState<any>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [tab, setTabState] = useState<string>('gen');
  const [connSel, setConnSel] = useState('ci');
  const [unitsVer, setUnitsVer] = useState(0);
  const [toastMsg, setToastMsg] = useState('');
  const [diagOpen, setDiagOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<SaveError | null>(null);
  const [savedKey, setSavedKey] = useState<string>(() => (initial.isNew ? '' : keyOf(Object.assign(SCHEMA.defaults(), initial.inputs), metaOf(initial.project))));

  const Iref = useRef(I);
  const projRef = useRef(project);
  projRef.current = project;
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const savingRef = useRef(false);

  const canEdit = project.access !== 'viewer';
  const dirty = keyOf(I, metaOf(project)) !== savedKey;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToastMsg(''), 3200);
  }, []);

  // ---------------- one-time setup ----------------
  useEffect(() => {
    const th = store.get(LS.theme) === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = th;
    setThemeState(th);
    UNITS.set(store.get(LS.units) || {}, true);
    const t = store.get(LS.tab);
    if (TABS.some((x) => x[0] === t)) setTabState(t);
    const off = UNITS.onChange(() => setUnitsVer((v) => v + 1));
    return () => { if (typeof off === 'function') off(); };
  }, []);

  // ---------------- calculation (server) ----------------
  useEffect(() => {
    const my = ++seq.current;
    setBusy(true);
    const timer = setTimeout(async () => {
      abort.current?.abort();
      const ac = (abort.current = new AbortController());
      try {
        const out = await calcRequest(Iref.current, ac.signal);
        if (my !== seq.current) return;
        setRes(out.res);
        setTakeoff(out.takeoff);
        setFingerprint(out.fingerprint);
        setCalcError(null);
      } catch (e: any) {
        if (e?.name === 'AbortError' || my !== seq.current) return;
        setCalcError(e instanceof ApiError ? e.message : 'Calculation failed');
      } finally {
        if (my === seq.current) setBusy(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [I, unitsVer]);

  // leaving with unsaved changes
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, []);

  // ---------------- inputs ----------------
  const setField = useCallback((id: string, raw: string) => {
    if (projRef.current.access === 'viewer') return;
    const f = SCHEMA.byId[id];
    const next: Inputs = { ...Iref.current, [id]: f ? intOf(f, raw) : raw };
    // grade → f_y / f_u (only when a listed grade is picked; values stay editable)
    const gm = id.match(/^(.*)(gr|pgr)$/);
    if (gm && SCHEMA.GV[raw]) {
      const base = gm[1], fy = gm[2] === 'pgr' ? base + 'pfy' : base + 'fy', fu = gm[2] === 'pgr' ? base + 'pfu' : base + 'fu';
      for (const [k, v] of [[fy, SCHEMA.GV[raw][0]], [fu, SCHEMA.GV[raw][1]]] as [string, any][]) if (SCHEMA.byId[k]) next[k] = v;
    }
    Iref.current = next;
    setI(next);
  }, []);

  const replaceInputs = useCallback((obj: Inputs | null) => {
    const next = Object.assign(SCHEMA.defaults(), obj || {});
    Iref.current = next;
    setI(next);
  }, []);

  const setMeta = useCallback((m: Partial<ProjectMeta>) => setProject((p) => ({ ...p, ...m })), []);

  const setTab = useCallback((t: string) => {
    setTabState(t);
    store.set(LS.tab, t);
    window.scrollTo(0, 0);
  }, []);

  const goto = useCallback((t: string, opts?: { conn?: string; fid?: string }) => {
    if (opts?.conn) setConnSel(opts.conn);
    else if (opts?.fid && /^(ci|ce|cm)_/.test(opts.fid)) setConnSel(opts.fid.slice(0, 2));
    setTab(t);
    if (opts?.fid) {
      const fid = opts.fid;
      setTimeout(() => {
        const el = document.getElementById('f_' + fid);
        if (el) { el.scrollIntoView({ block: 'center' }); (el as HTMLElement).focus(); }
      }, 60);
    }
  }, [setTab]);

  const setTheme = useCallback((th: 'light' | 'dark', save?: boolean) => {
    document.documentElement.dataset.theme = th;
    setThemeState(th);
    if (save) { store.set(LS.theme, th); toast(th === 'dark' ? 'Dark Mode' : 'Light Mode'); }
  }, [toast]);

  const setUnits = useCallback((k: string, v: string) => {
    const u = UNITS.get();
    if (k === 'mode') u.mode = v;
    else if (k === 'preset') { if (!v) return; Object.assign(u, UNITS.defaults(), UNITS.PRESETS[v].set, { mode: 'custom' }); }
    else u[k] = v;
    UNITS.set(u);
    store.set(LS.units, UNITS.get());
    toast(UNITS.native() ? 'Units: as calculated' : 'Units converted (the results are unchanged)');
  }, [toast]);

  // ---------------- project: save / save as new / export / import / pdf / delete ----------------
  const saveBody = () => {
    const p = projRef.current;
    const meta = metaOf(p);
    if (!meta.name.trim()) meta.name = String(Iref.current.proj || '').trim() || 'Untitled project';
    if (!meta.reference.trim()) meta.reference = String(Iref.current.ref || '').trim().slice(0, 200);
    return { meta, inputs: Iref.current };
  };

  const fail = useCallback((e: unknown, what: string) => {
    const err = e instanceof ApiError ? e : null;
    const se: SaveError = { message: err ? err.message : `${what} failed`, errors: err?.data?.errors };
    setSaveError(se);
    toast(`${what} failed: ${se.message}`);
  }, [toast]);

  /** Save Project / Update Project. Returns true only after the server has confirmed that the data is stored. */
  const save = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) return false;
    if (projRef.current.access === 'viewer') { toast('You have view-only access to this project.'); return false; }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const body = saveBody();
      const p = projRef.current;
      let revision: number;
      let id = p.id;
      if (!id) {
        const out = await api<{ id: string; revision: number }>('/api/projects', 'POST', body);
        id = out.id; revision = out.revision;
        window.history.replaceState(null, '', '/p/' + id);
      } else {
        const out = await api<{ revision: number }>(`/api/projects/${id}`, 'PUT', { ...body, expectedRevision: p.revision });
        revision = out.revision;
      }
      const next: ProjectState = { ...p, ...body.meta, id, revision, updated_at: new Date().toISOString() };
      setProject(next);
      projRef.current = next;
      setSavedKey(keyOf(Iref.current, metaOf(next)));
      toast(`Project saved to the database (revision ${revision}).`);
      return true;
    } catch (e) {
      fail(e, 'Saving');
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [fail, toast]);

  const saveAsNew = useCallback(async () => {
    const cur = projRef.current;
    const name = prompt('Save a copy as a NEW project named:', `${cur.name || 'Project'} (copy)`);
    if (!name || !name.trim()) return;
    try {
      const b = saveBody();
      b.meta.name = name.trim();
      const out = await api<{ id: string }>('/api/projects', 'POST', b);
      toast(`Saved as new project “${b.meta.name}”.`);
      if (confirm(`Saved as new project “${b.meta.name}”.\n\nOpen the new project now? (This project stays as it is.)`)) {
        dirtyRef.current = false;
        window.location.href = '/p/' + out.id;
      }
    } catch (e) {
      fail(e, 'Save as new project');
    }
  }, [fail, toast]);

  const exportData = useCallback(async () => {
    const p = projRef.current;
    if (!p.id) { toast('Save the project first: only saved projects can be exported.'); return; }
    try { await download(`/api/projects/${p.id}/export`, { method: 'GET' }, 'project.json'); toast('Project data exported (inputs and results only).'); }
    catch (e) { fail(e, 'Export'); }
  }, [fail, toast]);

  const importData = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      let o: any;
      try { o = JSON.parse(text); } catch { alert(`“${file.name}” is not a valid project data file (not JSON).`); return; }
      if (!o || o.format !== 'mezzanine-project-data' || !o.inputs || typeof o.inputs !== 'object') { alert(`“${file.name}” is not a project data file exported from this tool. Nothing was changed.`); return; }
      const v = await api<{ ok: boolean; errors: { label: string; message: string }[]; inputs: Inputs }>('/api/validate', 'POST', { inputs: o.inputs });
      if (!v.ok) { alert(`“${file.name}” contains invalid values; nothing was changed:\n• ` + v.errors.slice(0, 12).map((x) => `${x.label}: ${x.message}`).join('\n• ')); return; }
      if (!confirm(`Replace the current inputs with the data in “${file.name}”?\nThe project is not saved until you press Save Project.`)) return;
      replaceInputs(v.inputs);
      toast(`Imported “${file.name}”. Press Save Project to store it.`);
    } catch (e) { fail(e, 'Import'); }
  }, [fail, replaceInputs, toast]);

  const generatePdf = useCallback(async () => {
    const p0 = projRef.current;
    // the report is built from the SAVED state: save first when something changed
    if (!p0.id || dirtyRef.current) {
      if (p0.access === 'viewer') { toast('The report is generated from the saved project.'); }
      else if (!(await save())) { toast('The report was not generated because the project could not be saved.'); return; }
    }
    const id = projRef.current.id;
    if (!id) return;
    try {
      toast('Generating the PDF report…');
      await download(`/api/projects/${id}/report`, { method: 'GET' }, 'report.pdf');
      toast('PDF report generated.');
    } catch (e) { fail(e, 'PDF report'); }
  }, [fail, save, toast]);

  const deleteProject = useCallback(async () => {
    const p = projRef.current;
    if (!p.id) return;
    if (!confirm(`Delete the project “${p.name}” permanently? This cannot be undone.`)) return;
    try {
      await api(`/api/projects/${p.id}`, 'DELETE');
      dirtyRef.current = false;
      window.location.href = '/';
    } catch (e) { fail(e, 'Delete'); }
  }, [fail]);

  const resetInputs = useCallback(() => {
    if (!confirm('Reset all inputs to the Example 3 defaults? (Not saved until you press Save Project.)')) return;
    replaceInputs({});
    toast('Inputs reset to the defaults');
  }, [replaceInputs, toast]);

  const logout = useCallback(async () => {
    if (dirtyRef.current && !confirm('You have unsaved changes. Sign out anyway?')) return;
    dirtyRef.current = false;
    try { await api('/api/auth/logout', 'POST'); } catch { /* ignore */ }
    window.location.href = '/login';
  }, []);

  // effects returned by the server-side optimisation panel
  const applyEffects = useCallback((effects: any[]) => {
    for (const e of effects || []) {
      if (e.type === 'toast') toast(e.text);
      else if (e.type === 'alert') alert(e.text);
      else if (e.type === 'assign') { const next = { ...Iref.current, ...e.ov }; Iref.current = next; setI(next); }
      else if (e.type === 'setInputs') replaceInputs(JSON.parse(JSON.stringify(e.inputs)));
      else if (e.type === 'newProject') {
        const b = saveBody();
        b.meta.name = String(e.name).trim().slice(0, 200) || 'Optimised design';
        b.inputs = Object.assign(SCHEMA.defaults(), Iref.current, e.inputs);
        api('/api/projects', 'POST', b).then(() => toast(`Saved as new project “${b.meta.name}” (see the Projects list).`)).catch((er) => fail(er, 'Save as new project'));
      }
    }
  }, [fail, replaceInputs, toast]);

  // Ctrl+S / Ctrl+Shift+S: never the browser's "Save page as"; saves the PROJECT DATA to the database instead.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        toast('Saving or downloading the application source file is not permitted. Saving your project data…');
        save();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [save, toast]);

  const value = useMemo<Design>(
    () => ({
      user, project, I, res, takeoff, fingerprint, busy, calcError, tab, connSel, unitsVer, toastMsg, diagOpen, detailsOpen, theme, dirty, saving, saveError, canEdit,
      setField, setMeta, setTab, setConnSel, goto, toast, setTheme, setDiagOpen, setDetailsOpen, setUnits, save, saveAsNew, exportData, importData, generatePdf,
      deleteProject, resetInputs, logout, applyEffects, getI: () => Iref.current, dismissSaveError: () => setSaveError(null),
    }),
    [user, project, I, res, takeoff, fingerprint, busy, calcError, tab, connSel, unitsVer, toastMsg, diagOpen, detailsOpen, theme, dirty, saving, saveError, canEdit,
      setField, setMeta, setTab, goto, toast, setTheme, setUnits, save, saveAsNew, exportData, importData, generatePdf, deleteProject, resetInputs, logout, applyEffects],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
