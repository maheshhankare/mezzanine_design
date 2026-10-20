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

export async function issueSession(user: { id: string; token_version: number }) {
  const token = await new SignJWT({ tv: user.token_version })
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

/** The signed-in user, or null. The user row is re-read on every request: a disabled user or a changed password ends the session at once. */
export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    if (!payload.sub) return null;
    const u = await q1<{ id: string; email: string; name: string; role: 'admin' | 'user'; active: boolean; token_version: number }>(
      'select id, email, name, role, active, token_version from users where id = $1',
      [payload.sub],
    );
    if (!u || !u.active || u.token_version !== payload.tv) return null;
    return { id: u.id, email: u.email, name: u.name, role: u.role };
  } catch {
    return null;
  }
}
