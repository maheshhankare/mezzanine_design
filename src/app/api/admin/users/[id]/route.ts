import { route, readJson, audit, HttpError } from '@/server/http';
import { q, q1 } from '@/server/db';
import { hashPassword, passwordProblem } from '@/server/auth/password';
import { isUuid } from '@/server/projects';

export const dynamic = 'force-dynamic';

// Enable / disable, change role or name, reset the password. Disabling or resetting signs the user out everywhere (token_version).
export const PATCH = route({ auth: 'admin' }, async ({ req, user, params }) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'User not found');
  const b = await readJson(req, 10_000);
  const target = await q1<any>('select id, role, active from users where id = $1', [params.id]);
  if (!target) throw new HttpError(404, 'User not found');
  const sets: string[] = [], vals: unknown[] = [];
  const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length + 1}`); };
  let bump = false;

  if (b.active !== undefined) {
    if (target.id === user.id && !b.active) throw new HttpError(400, 'You cannot disable your own account');
    add('active', !!b.active);
    if (!b.active) bump = true;
  }
  if (b.role !== undefined) {
    if (!['admin', 'user'].includes(b.role)) throw new HttpError(400, 'Invalid role');
    if (target.id === user.id && b.role !== 'admin') throw new HttpError(400, 'You cannot remove your own administrator role');
    add('role', b.role);
  }
  if (b.name !== undefined) {
    const n = String(b.name).trim();
    if (!n || n.length > 200) throw new HttpError(400, 'Invalid name');
    add('name', n);
  }
  if (b.password !== undefined) {
    const problem = passwordProblem(b.password);
    if (problem) throw new HttpError(400, problem);
    add('password_hash', await hashPassword(b.password));
    bump = true;
  }
  if (!sets.length) throw new HttpError(400, 'Nothing to change');
  if (bump) sets.push('token_version = token_version + 1');
  await q(`update users set ${sets.join(', ')}, updated_at = now() where id = $1`, [params.id, ...vals]);
  await audit(user, 'admin.user.update', req, null, { target: params.id, fields: Object.keys(b).filter((k) => k !== 'password') });
  return { ok: true };
});
