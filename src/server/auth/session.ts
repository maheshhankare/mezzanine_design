import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { q1 } from '../db';

export const COOKIE = 'mz_session';
export const SESSION_HOURS = 8;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

const key = () => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET is not configured (at least 32 characters)');
  return new TextEncoder().encode(s);
};

/** The deployment a session belongs to ('production', 'preview', 'development' on Vercel; 'local' elsewhere). A token issued by one
 *  deployment is refused by another, even if both were (wrongly) given the same AUTH_SECRET. */
export const sessionEnv = () => process.env.VERCEL_ENV || 'local';

export async function issueSession(user: { id: string; token_version: number }) {
  const token = await new SignJWT({ tv: user.token_version, env: sessionEnv() })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, // not readable by page scripts
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function clearSession() {
  (await cookies()).set(COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
}

/** The signed-in user, or null. The user row is re-read on every request: a disabled user or a changed password ends the session at once.
 *  dbErrors: 'signed-out' (pages: a database failure looks like no session, the page sends the visitor to the sign-in page) or 'throw'
 *  (API routes: the failure reaches the route wrapper, which answers 503 "The database is not reachable"). */
export async function currentUser(opts: { dbErrors?: 'signed-out' | 'throw' } = {}): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  let payload;
  try {
    ({ payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] }));
  } catch {
    return null; // expired, forged, or no secret configured
  }
  if (!payload.sub || payload.env !== sessionEnv()) return null;
  let u;
  try {
    u = await q1<{ id: string; email: string; name: string; role: 'admin' | 'user'; active: boolean; token_version: number }>(
      'select id, email, name, role, active, token_version from users where id = $1',
      [payload.sub],
    );
  } catch (e) {
    if (opts.dbErrors === 'throw') throw e;
    return null;
  }
  if (!u || !u.active || u.token_version !== payload.tv) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}
