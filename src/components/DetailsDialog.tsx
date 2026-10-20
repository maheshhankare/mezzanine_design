'use client';

import { useEffect, useState } from 'react';
import { useDesign } from '@/state/DesignProvider';
import { api } from '@/lib/api';

type Member = { id: string; name: string; email: string; role: 'viewer' | 'editor' };

// Project identification (name, reference, customer, site, notes) and the authorised users of the project.
export function DetailsDialog() {
  const d = useDesign();
  const { project, detailsOpen, setDetailsOpen, setMeta, canEdit } = d;
  const [members, setMembers] = useState<Member[]>([]);
  const [owner, setOwner] = useState<{ name: string; email: string } | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer');
  const [msg, setMsg] = useState('');

  const load = () => {
    if (!project.id) return;
    api<{ owner: any; members: Member[] }>(`/api/projects/${project.id}/members`).then((o) => { setOwner(o.owner); setMembers(o.members); }).catch((e) => setMsg(e.message));
  };
  useEffect(() => { if (detailsOpen) { setMsg(''); load(); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [detailsOpen, project.id]);

  useEffect(() => {
    if (!detailsOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDetailsOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [detailsOpen, setDetailsOpen]);

  if (!detailsOpen) return null;
  const isOwner = project.access === 'owner' && !!project.id;
  const txt = (k: 'name' | 'reference' | 'customer' | 'customer_contact' | 'site', label: string, max: number) => (
    <label className="dlg-f">{label}<input value={project[k]} maxLength={max} disabled={!canEdit} onChange={(e) => setMeta({ [k]: e.target.value })} /></label>
  );

  const share = async () => {
    setMsg('');
    try { await api(`/api/projects/${project.id}/members`, 'POST', { email, role }); setEmail(''); load(); }
    catch (e: any) { setMsg(e.message); }
  };
  const unshare = async (id: string) => {
    try { await api(`/api/projects/${project.id}/members?userId=${id}`, 'DELETE'); load(); } catch (e: any) { setMsg(e.message); }
  };

  return (
    <div id="diag" role="dialog" aria-modal="true" aria-labelledby="detT" onClick={(e) => e.target === e.currentTarget && setDetailsOpen(false)}>
      <div className="dg-box">
        <div className="dg-head">
          <h2 id="detT">Project details</h2>
          <button type="button" className="btn" onClick={() => setDetailsOpen(false)}>Close</button>
        </div>
        <p className="hint">These details are saved with the project and appear in the PDF report. Press Save Project to store changes.</p>
        <div className="dlg-grid">
          {txt('name', 'Project name', 200)}
          {txt('reference', 'Project reference', 200)}
          {txt('customer', 'Customer', 200)}
          {txt('customer_contact', 'Customer contact', 300)}
          {txt('site', 'Site / location', 300)}
        </div>
        <label className="dlg-f">Notes<textarea rows={3} maxLength={4000} value={project.notes} disabled={!canEdit} onChange={(e) => setMeta({ notes: e.target.value })} /></label>

        <h3>Authorised users</h3>
        {!project.id && <p className="hint">Save the project first; then you can give other users access.</p>}
        {project.id && (
          <>
            <table className="rt">
              <tbody>
                <tr><th>User</th><th>E-mail</th><th>Access</th><th /></tr>
                {owner && <tr><td>{owner.name}</td><td>{owner.email}</td><td>Owner</td><td /></tr>}
                {members.map((m) => (
                  <tr key={m.id}><td>{m.name}</td><td>{m.email}</td><td>{m.role === 'editor' ? 'Can edit' : 'View only'}</td><td>{isOwner && <button type="button" className="btn sm" onClick={() => unshare(m.id)}>Remove</button>}</td></tr>
                ))}
              </tbody>
            </table>
            {isOwner && (
              <div className="optf">
                <label>E-mail of an existing user <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
                <label>Access <select value={role} onChange={(e) => setRole(e.target.value as any)}><option value="viewer">View only</option><option value="editor">Can edit</option></select></label>
                <button type="button" className="btn" disabled={!email} onClick={share}>Add</button>
              </div>
            )}
          </>
        )}
        {msg && <p className="no">{msg}</p>}
      </div>
    </div>
  );
}
