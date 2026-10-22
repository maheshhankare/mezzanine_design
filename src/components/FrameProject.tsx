'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, download } from '@/lib/api';
import { DESIGN_STANDARD_TITLE, optionAvailability, validateSettings, type AnalysisSettings } from '@/shared/analysisSettings';
import type { FrameProjectData } from '@/shared/frameProject';

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="fld"><label>{label}</label><div className="ctl">{children}</div></div>;
}
const Chk = ({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
  <div className="fld"><label>{label}</label><div className="ctl"><input type="checkbox" style={{ width: 'auto' }} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /></div></div>
);
const BAD = { color: 'var(--bad, #b3261e)' };

type RunRow = { id: string; modelRevision: number; status: string; label: string; createdAt: string; current: boolean; note: string; summary: any };
type Loaded = { id: string; name: string; revision: number; project: FrameProjectData; migrated: boolean; flags: string[]; runs: RunRow[] };

/**
 * One frame project: IS 800:2007 is the only design standard, so there is no code selector. The settings form is bound to the project's saved settings;
 * validation (the same rules as the server) is shown live; a migrated project must have its settings reviewed and confirmed before it can be run;
 * a run always uses the SAVED project, and earlier runs of a changed model are marked.
 */
export default function FrameProject({ id }: { id: string }) {
  const [d, setD] = useState<Loaded | null>(null);
  const [s, setS] = useState<AnalysisSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [record, setRecord] = useState<any>(null);

  const load = useCallback(async () => {
    try { const o = await api<Loaded>(`/api/frame/projects/${id}`); setD(o); setS(o.project.settings); setDirty(false); }
    catch (e: any) { setMsg(e.message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const v = useMemo(() => (s ? validateSettings(s) : null), [s]);
  const avail = useMemo(() => optionAvailability(), []);
  const set = (f: (x: AnalysisSettings) => void) => { if (!s) return; const n = structuredClone(s); f(n); setS(n); setDirty(true); };
  const num = (t: string) => (t.trim() === '' ? undefined : Number(t));

  const save = async (confirmSettings = false) => {
    if (!d || !s) return;
    setBusy('save'); setMsg('');
    try {
      const out = await api<any>(`/api/frame/projects/${id}`, 'PUT', { project: { ...d.project, settings: s }, revision: d.revision, confirmSettings });
      setMsg(out.modelChanged ? 'Saved. The model changed: earlier runs now belong to an earlier model revision.' : 'Saved.');
      await load();
    } catch (e: any) { setMsg(e.data?.errors ? `${e.message}: ${e.data.errors.map((i: any) => i.message).join(' ')}` : e.message); }
    setBusy('');
  };
  const run = async () => {
    setBusy('run'); setMsg('');
    try { const out = await api<any>(`/api/frame/projects/${id}/run`, 'POST'); setMsg(out.ok ? `Run completed (${out.label}).` : `Run finished without convergence (${out.label}).`); await load(); if (out.runId) await show(out.runId); }
    catch (e: any) { setMsg(e.data?.blocked ? `${e.message}: ${e.data.blocked.join(' ')}` : e.message); }
    setBusy('');
  };
  const show = async (rid: string) => { try { const o = await api<any>(`/api/frame/runs/${rid}`); setRecord(o); } catch (e: any) { setMsg(e.message); } };

  if (!d || !s || !v) return <main className="dash"><p className="hint" role={msg ? 'alert' : undefined}>{msg || 'Loading…'}</p></main>;
  const blockedByReview = s.review.required;

  return (
    <main className="dash">
      <header className="dash-head">
        <h1>{d.name} <small>model revision {d.revision}</small></h1>
        <div className="tools"><Link className="btn" href="/frame">← Frame projects</Link></div>
      </header>
      {msg && <p className="hint" role="alert">{msg}</p>}

      <section className="card">
        <h3>Design standard</h3>
        <p>{DESIGN_STANDARD_TITLE}</p>
        <p className="hint">IS 800:2007 is the only design standard of this application. Provisions that are not verified are marked pending and block the feature that needs them.</p>
      </section>

      {(d.migrated || blockedByReview) && (
        <section className="card" role="alert">
          <h3>Settings need review</h3>
          <p className="hint">This project was stored with settings of an older version. Nothing was reinterpreted; removed items were dropped. Review the settings below, then confirm. Nothing can be run until you do.</p>
          <ul>{[...new Set([...d.flags, ...s.review.reasons])].map((f, i) => <li key={i}>{f}</li>)}</ul>
          <button type="button" className="prim" disabled={busy !== '' || !v.errors.every((e) => e.field === 'review')} onClick={() => save(true)}>Confirm the reviewed settings</button>
        </section>
      )}

      <section className="card">
        <h3>Analysis settings</h3>
        <Fld label="Analysis order"><select value={s.order} onChange={(e) => set((x) => { x.order = e.target.value as any; })}>
            <option value="second">Second order (P-Δ and P-δ), IS 800 Annex B</option>
            <option value="first">First order</option>
          </select></Fld>
        <Fld label="Second-order theory"><select value={s.theory} disabled={s.order === 'first'} onChange={(e) => set((x) => { x.theory = e.target.value as any; })}>
            <option value="II">Theory II (design)</option>
            <option value="vonKarman">Von Kármán (comparison only)</option>
          </select></Fld>
        <Chk label="Shear deformation" checked={s.shearDeformation} onChange={(v) => set((x) => { x.shearDeformation = v; })} />
        {(['EA', 'EI', 'GJ'] as const).map((k) => (
          <Fld key={k} label={`Stiffness factor ${k}`}><input type="number" step="0.01" value={s.stiffnessFactors[k]} onChange={(e) => set((x) => { x.stiffnessFactors[k] = Number(e.target.value); })} /></Fld>
        ))}
        <Fld label="Max. iterations"><input type="number" value={s.maxIterations} onChange={(e) => set((x) => { x.maxIterations = Number(e.target.value); })} /></Fld>
        <Fld label="Load steps"><input type="number" value={s.loadSteps} onChange={(e) => set((x) => { x.loadSteps = Number(e.target.value); })} /></Fld>
      </section>

      <section className="card">
        <h3>Imperfections</h3>
        <Fld label="Sway imperfection"><select value={!s.sway ? 'none' : s.sway.mode === 'notional-loads' ? 'notional' : `user-${s.sway.mode}`}
            onChange={(e) => set((x) => {
              const val = e.target.value;
              if (val === 'none') delete x.sway;
              else if (val === 'notional') x.sway = { mode: 'notional-loads', source: 'code', direction: x.sway?.direction ?? '+X' };
              else x.sway = { mode: val === 'user-geometry' ? 'geometry' : 'equivalent-loads', source: 'user', phi0: x.sway?.phi0, direction: x.sway?.direction ?? '+X' };
            })}>
            <option value="none">None</option>
            <option value="notional" disabled={!avail['notional horizontal loads'].available}>IS 800 notional horizontal loads (4.3.6)</option>
            <option value="user-equivalent-loads">User-defined, equivalent loads</option>
            <option value="user-geometry">User-defined, initial geometry</option>
          </select></Fld>
        {s.sway && s.sway.source === 'user' && <Fld label="φ0 (dimensionless, e.g. 0.005 = 1/200)"><input type="number" step="0.0005" value={s.sway.phi0 ?? ''} onChange={(e) => set((x) => { x.sway!.phi0 = num(e.target.value); })} /></Fld>}
        {s.sway && <Fld label="Direction"><select value={s.sway.direction} onChange={(e) => set((x) => { x.sway!.direction = e.target.value as any; })}>{['+X', '-X', '+Y', '-Y'].map((o) => <option key={o}>{o}</option>)}</select></Fld>}
        {s.sway?.source === 'user' && <p className="hint">User-defined: not an IS 800 provision; the result is not labelled code-compliant.</p>}
        <p className="hint">{avail['explicit geometric sway (code)'].reason}</p>
        <Chk label="User-defined member bow" checked={!!s.bow} onChange={(v) => set((x) => { if (v) x.bow = { mode: 'geometry', source: 'user', e0OverL: undefined }; else delete x.bow; })} />
        {s.bow && <Fld label="e0/L (e.g. 0.004 = L/250)"><input type="number" step="0.0005" value={s.bow.e0OverL ?? ''} onChange={(e) => set((x) => { x.bow!.e0OverL = num(e.target.value); })} /></Fld>}
        <p className="hint">Notional loads (4.3.6) may not be combined with other lateral loads, temperature, overturning or foundation shear checks:</p>
        {([['otherLateralLoadsInCombination', 'Wind / earthquake act in the combinations with the sway imperfection'], ['temperatureInCombination', 'Temperature acts in the combinations with the sway imperfection'], ['usedForOverturningCheck', 'The results are used for overturning / overall instability / foundation shear'], ['imperfectionLoadsInLoadCases', 'Equivalent imperfection loads are already present in my load cases']] as const).map(([k, t]) => (
          <Chk key={k} label={t} checked={s[k]} onChange={(v) => set((x) => { x[k] = v; })} />
        ))}
      </section>

      <section className="card">
        <h3>IS 800 member design</h3>
        <Chk label="Run the member design checks" checked={s.design.enabled} onChange={(v) => set((x) => { x.design.enabled = v; })} />
        {s.design.enabled && <>
          <Fld label="Effective-length factor k, minor axis (y) (7.2, required)"><input type="number" step="0.05" value={s.design.kLy ?? ''} onChange={(e) => set((x) => { x.design.kLy = num(e.target.value); })} /></Fld>
          <Fld label="Effective-length factor k, major axis (z) (7.2, required)"><input type="number" step="0.05" value={s.design.kLz ?? ''} onChange={(e) => set((x) => { x.design.kLz = num(e.target.value); })} /></Fld>
          <Fld label="Equivalent uniform moment factor C_m (Table 18)"><select value={s.design.cm} onChange={(e) => set((x) => { x.design.cm = e.target.value as any; })}><option value="sway">0.9 (sway buckling mode)</option><option value="table">Row A, from end moments</option></select></Fld>
          <Fld label="Hollow section manufacture (Table 10)"><select value={s.design.manufacture} onChange={(e) => set((x) => { x.design.manufacture = e.target.value as any; })}><option value="hollow-hot-rolled">Hot rolled (curve a)</option><option value="hollow-cold-formed">Cold formed (curve b)</option><option value="welded-box">Welded box</option></select></Fld>
        </>}
        <table className="rt"><tbody>
          <tr><th>Feature</th><th>State</th><th>Reason</th></tr>
          {Object.entries(avail).filter(([k]) => k.startsWith('design')).map(([k, a]) => <tr key={k}><td>{k}</td><td>{a.state}</td><td>{a.reason || a.clause}</td></tr>)}
        </tbody></table>
      </section>

      <section className="card" aria-live="polite">
        <h3>Validation <small>label: {v.label}</small></h3>
        {v.errors.map((e, i) => <p key={'e' + i} style={BAD}>ERROR {e.clause ? `[${e.clause}] ` : ''}{e.message}</p>)}
        {v.warnings.map((e, i) => <p key={'w' + i} className="hint">Warning {e.clause ? `[${e.clause}] ` : ''}{e.message}</p>)}
        {!v.errors.length && !v.warnings.length && <p>No issues.</p>}
        <div className="tools">
          <button type="button" className="btn" disabled={!dirty || busy !== ''} onClick={() => save(false)}>Save settings</button>
          <button type="button" className="prim" disabled={dirty || !v.ok || busy !== ''} onClick={run} title={dirty ? 'Save first: a run always uses the saved project' : undefined}>{busy === 'run' ? 'Running…' : 'Run analysis and IS 800 design'}</button>
        </div>
      </section>

      <section className="card">
        <h3>Runs</h3>
        <div className="tscroll"><table className="rt"><tbody>
          <tr><th>Time</th><th>Model revision</th><th>Status</th><th>Label</th><th>Model</th><th /></tr>
          {d.runs.map((r) => <tr key={r.id} className={r.current ? '' : 'stale'}><td>{r.createdAt.replace('T', ' ').slice(0, 19)}</td><td className="num">{r.modelRevision}</td><td>{r.status}</td><td>{r.label}</td><td>{r.note}</td>
            <td><button type="button" className="btn sm" onClick={() => show(r.id)}>Record</button> <button type="button" className="btn sm" onClick={() => download(`/api/frame/runs/${r.id}/report`, { credentials: 'same-origin' }, 'calculation-record.pdf').catch((e) => setMsg(e.message))}>PDF</button></td></tr>)}
          {!d.runs.length && <tr><td colSpan={6}>No run yet.</td></tr>}
        </tbody></table></div>
      </section>

      {record && (
        <section className="card">
          <h3>Calculation record <small>{record.current ? 'current model' : 'EARLIER MODEL REVISION: the model has changed since this run'}</small></h3>
          <p className="hint">Result labelling: {record.run.record.label}. Analysis results are kept apart from IS 800 design checks.</p>
          {record.run.record.sections.map((sec: any) => (
            <details key={sec.n} open={sec.n === 10}><summary>{sec.n}. {sec.title}</summary>
              <ul>{sec.lines.map((l: string, i: number) => <li key={i}>{l}</li>)}{!sec.lines.length && <li>(nothing to report)</li>}</ul>
            </details>
          ))}
        </section>
      )}
    </main>
  );
}
