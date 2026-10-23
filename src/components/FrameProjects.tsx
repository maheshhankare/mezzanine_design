'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, apiUpload } from '@/lib/api';
import { DESIGN_STANDARD_TITLE } from '@/shared/analysisSettings';

type Row = { id: string; name: string; revision: number; updatedAt: string };

// List of frame analysis / IS 800 design projects. A project is created from project data (JSON, schema "frame-project-1"): the model, loads, combinations,
// design sections and settings. Projects stored with settings of an older version are migrated and ask for a review when opened.
export default function FrameProjects() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(() => api<{ projects: Row[] }>('/api/frame/projects').then((o) => setRows(o.projects)).catch((e) => setMsg(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const upload = async (f: File) => {
    setBusy(true); setMsg('');
    try {
      const project = JSON.parse(await f.text());
      const out = await apiUpload<{ id: string; flags: string[]; reviewRequired: boolean }>('/api/frame/projects', 'POST', { project });
      location.href = `/frame/${out.id}`;
    } catch (e: any) { setMsg(e.data?.issues ? `${e.message}: ${e.data.issues.slice(0, 5).map((i: any) => `${i.path} ${i.message}`).join('; ')}` : e.message); setBusy(false); }
  };
  const del = async (r: Row) => { if (!confirm(`Delete “${r.name}” and all its runs permanently?`)) return; try { await api(`/api/frame/projects/${r.id}`, 'DELETE'); load(); } catch (e: any) { setMsg(e.message); } };

  return (
    <main className="dash">
      <header className="dash-head">
        <h1>Frame analysis and design <small>{DESIGN_STANDARD_TITLE}</small></h1>
        <div className="tools"><Link className="btn" href="/">← Projects</Link></div>
      </header>
      {msg && <p className="hint" role="alert">{msg}</p>}
      <section className="card">
        <h3>Import a frame project</h3>
        <p className="hint">Project data (JSON, schema “frame-project-1”): frame model, load cases, combinations, design sections and settings. The design standard is IS 800:2007 only; settings of an older version are migrated and must be reviewed before anything is run.</p>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button type="button" className="prim" disabled={busy} onClick={() => file.current?.click()}>{busy ? 'Importing…' : 'Import project JSON'}</button>
      </section>
      <section className="card">
        <div className="tscroll">
          <table className="rt"><tbody>
            <tr><th>Project</th><th>Model revision</th><th>Saved</th><th /></tr>
            {rows.map((r) => <tr key={r.id}><td><Link href={`/frame/${r.id}`}>{r.name}</Link></td><td className="num">{r.revision}</td><td>{r.updatedAt.replace('T', ' ').slice(0, 16)}</td><td><button type="button" className="btn sm" onClick={() => del(r)}>Delete</button></td></tr>)}
            {!rows.length && <tr><td colSpan={4}>No frame project yet.</td></tr>}
          </tbody></table>
        </div>
      </section>
    </main>
  );
}
