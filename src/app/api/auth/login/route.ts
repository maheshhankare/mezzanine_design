import { route, readJson, clientIp, audit, HttpError } from '@/server/http';
import { q, q1 } from '@/server/db';
import { DUMMY_HASH, verifyPassword } from '@/server/auth/password';
import { issueSession } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

const MAX_FAILS_EMAIL = 5; // per 15 minutes
const MAX_FAILS_IP = 25;

export const POST = route({ auth: 'none' }, async ({ req }) => {
  const body = await readJson(req, 10_000);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password || email.length > 320 || password.length > 200) throw new HttpError(400, 'Enter your e-mail and password');
  const ip = clientIp(req);

  const [{ n: byEmail }, { n: byIp }] = await Promise.all([
    q1<{ n: number }>(`select count(*)::int as n from login_attempts where lower(email) = $1 and not success and at > now() - interval '15 minutes'`, [email]) as any,
    q1<{ n: number }>(`select count(*)::int as n from login_attempts where ip = $1 and not success and at > now() - interval '15 minutes'`, [ip]) as any,
  ]);
  if (byEmail >= MAX_FAILS_EMAIL || byIp >= MAX_FAILS_IP) throw new HttpError(429, 'Too many failed sign-in attempts. Try again in 15 minutes.');

  const user = await q1<any>('select id, email, name, role, active, password_hash, token_version from users where lower(email) = $1', [email]);
  const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  const success = !!user && ok && user.active;
  await q('insert into login_attempts (email, ip, success) values ($1, $2, $3)', [email.slice(0, 320), ip, success]);
  if (!success) {
    await audit(null, 'login.failed', req, null, { email });
    throw new HttpError(401, 'Invalid e-mail or password');
  }
  await q('update users set last_login_at = now() where id = $1', [user.id]);
  await issueSession(user);
  await audit(user, 'login', req);
  return { user: { id: user.id, email: user.email, name: user.name, role: user.role } };
});
