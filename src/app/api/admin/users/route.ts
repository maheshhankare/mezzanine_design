import { route, readJson, audit, HttpError } from '@/server/http';
import { q, q1 } from '@/server/db';
import { hashPassword, passwordProblem } from '@/server/auth/password';

export const dynamic = 'force-dynamic';

// Administrator-controlled accounts: there is no self-registration.
export const GET = route({ auth: 'admin' }, async () => ({
  users: await q(
    `select u.id, u.email, u.name, u.role, u.active, u.created_at, u.last_login_at, (select count(*)::int from projects p where p.owner_id = u.id) as projects
       from users u order by u.created_at`,
  ),
}));

export const POST = route({ auth: 'admin' }, async ({ req, user }) => {
  const b = await readJson(req, 10_000);
  const email = String(b.email || '').trim().toLowerCase();
  const name = String(b.name || '').trim();
  const role = b.role === 'admin' ? 'admin' : 'user';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 320) throw new HttpError(400, 'Enter a valid e-mail address');
  if (!name || name.length > 200) throw new HttpError(400, 'Enter the user’s name');
  const problem = passwordProblem(b.password);
  if (problem) throw new HttpError(400, problem);
  if (await q1('select 1 from users where lower(email) = $1', [email])) throw new HttpError(409, 'A user with this e-mail already exists');
  const hash = await hashPassword(b.password);
  const created = await q1<any>('insert into users (email, name, password_hash, role) values ($1, $2, $3, $4) returning id', [email, name, hash, role]);
  await audit(user, 'admin.user.create', req, null, { email, role });
  return { id: created.id };
});
