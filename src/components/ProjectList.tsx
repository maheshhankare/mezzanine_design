'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TEMPLATES } from '@/shared/templates';
import { api } from '@/lib/api';
import { Pill } from './common';

type Row = { id: string; name: string; reference: string; customer: string; site: string; design_status: string | null; max_utilisation: number | null; revision: number; updated_at: string; owner_name: string; access: string };

export default function ProjectList({ user, initial }: { user: { name: string; email: string; role: string }; initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [tpl, setTpl] = useState(TEMPLATES[0].id);
  const [error, setError] = useState('');

  const del = async (r: Row) => {
    if (!confirm(`Delete the project “${r.name}” permanently? This cannot be undone.`)) return;
    try { await api(`/api/projects/${r.id}`, 'DELETE'); setRows((x) => x.filter((y) => y.id !== r.id)); }
    catch (e: any) { setError(e.message); }
  };
  const signOut = async () => { try { await api('/api/auth/logout', 'POST'); } catch { /* ignore */ } location.href = '/login'; };

  return (
    <main className="dash">
      <header className="dash-head">
        <h1>Projects</h1>
        <div className="tools">
          <Link className="btn" href="/frame">Frame analysis (IS 800)</Link>
          {user.role === 'admin' && <Link className="btn" href="/admin">Manage users</Link>}
          <span className="puser">{user.name}</span>
          <button type="button" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {!creating ? (
        <button type="button" className="prim" onClick={() => setCreating(true)}>+ New project</button>
      ) : (
        <section className="card">
          <h3>New project</h3>
          <div className="optf">
            <label>Project name <input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder="e.g. Warehouse A mezzanine" autoFocus /></label>
            <label>Start from
              <select value={tpl} onChange={(e) => setTpl(e.target.value)}>{TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
            </label>
            <Link className="btn prim" href={`/p/new?t=${encodeURIComponent(tpl)}&name=${encodeURIComponent(name)}`}>Create</Link>
            <button type="button" onClick={() => setCreating(false)}>Cancel</button>
          </div>
          <p className="hint">The project is stored in the database the first time you press Save Project.</p>
        </section>
      )}

      {error && <p className="no" role="alert">{error}</p>}
      <section className="card">
        {rows.length === 0 ? (
          <p>No projects yet. Create one to start.</p>
        ) : (
          <div className="tscroll">
            <table className="rt">
              <tbody>
                <tr><th>Project</th><th>Reference</th><th>Customer</th><th>Status</th><th>η max</th><th>Rev.</th><th>Updated</th><th>Owner</th><th>Access</th><th /></tr>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/p/${r.id}`}><b>{r.name}</b></Link></td>
                    <td>{r.reference}</td><td>{r.customer}</td>
                    <td>{r.design_status ? <Pill st={r.design_status === 'INVALID' ? 'REVIEW' : r.design_status} /> : '–'}</td>
                    <td className="num">{r.max_utilisation != null ? r.max_utilisation.toFixed(2) : '–'}</td>
                    <td className="num">{r.revision}</td>
                    <td>{r.updated_at.replace('T', ' ').slice(0, 16)}</td>
                    <td>{r.owner_name}</td>
                    <td>{r.access === 'owner' ? 'Owner' : r.access === 'editor' ? 'Can edit' : 'View only'}</td>
                    <td className="nw"><Link className="btn sm" href={`/p/${r.id}`}>Open</Link>{r.access === 'owner' && <button type="button" className="btn sm" onClick={() => del(r)}>Delete</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
