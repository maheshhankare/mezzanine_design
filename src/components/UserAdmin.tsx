'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type U = { id: string; email: string; name: string; role: 'admin' | 'user'; active: boolean; created_at: string; last_login_at: string | null; projects: number };

// Administrator-controlled accounts: create, disable / enable, change role, reset password.
export default function UserAdmin({ me }: { me: string }) {
  const [users, setUsers] = useState<U[]>([]);
  const [msg, setMsg] = useState('');
  const [f, setF] = useState({ email: '', name: '', role: 'user', password: '' });

  const load = useCallback(() => api<{ users: U[] }>('/api/admin/users').then((o) => setUsers(o.users)).catch((e) => setMsg(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg('');
    try { await fn(); setMsg(ok); load(); } catch (e: any) { setMsg(e.message); }
  };
  const create = (e: React.FormEvent) => {
    e.preventDefault();
    act(async () => { await api('/api/admin/users', 'POST', f); setF({ email: '', name: '', role: 'user', password: '' }); }, 'User created.');
  };
  const reset = (u: U) => {
    const pw = prompt(`New password for ${u.email} (at least 10 characters). They are signed out everywhere.`);
    if (pw) act(() => api(`/api/admin/users/${u.id}`, 'PATCH', { password: pw }), 'Password reset.');
  };

  return (
    <main className="dash">
      <header className="dash-head">
        <h1>Users</h1>
        <div className="tools"><Link className="btn" href="/">← Projects</Link></div>
      </header>
      {msg && <p className="hint" role="status">{msg}</p>}
      <section className="card">
        <h3>Create a user</h3>
        <form className="optf" onSubmit={create}>
          <label>Name <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label>E-mail <input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label>Initial password <input required type="password" autoComplete="new-password" minLength={10} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
          <label>Role <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="user">User</option><option value="admin">Administrator</option></select></label>
          <button type="submit" className="prim">Create</button>
        </form>
        <p className="hint">Administrators manage accounts; they do not automatically see other users’ projects.</p>
      </section>
      <section className="card">
        <div className="tscroll">
          <table className="rt">
            <tbody>
              <tr><th>Name</th><th>E-mail</th><th>Role</th><th>Status</th><th>Projects</th><th>Last sign-in</th><th /></tr>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td><td>{u.email}</td><td>{u.role}</td>
                  <td>{u.active ? <b className="ok">active</b> : <b className="no">disabled</b>}</td>
                  <td className="num">{u.projects}</td>
                  <td>{u.last_login_at ? u.last_login_at.replace('T', ' ').slice(0, 16) : '–'}</td>
                  <td className="nw">
                    <button type="button" className="btn sm" disabled={u.id === me} onClick={() => act(() => api(`/api/admin/users/${u.id}`, 'PATCH', { active: !u.active }), u.active ? 'User disabled.' : 'User enabled.')}>{u.active ? 'Disable' : 'Enable'}</button>
                    <button type="button" className="btn sm" onClick={() => reset(u)}>Reset password</button>
                    <button type="button" className="btn sm" disabled={u.id === me} onClick={() => act(() => api(`/api/admin/users/${u.id}`, 'PATCH', { role: u.role === 'admin' ? 'user' : 'admin' }), 'Role changed.')}>{u.role === 'admin' ? 'Make user' : 'Make admin'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
