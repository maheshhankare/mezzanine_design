import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { currentUser, type SessionUser } from './auth/session';
import { q } from './db';
import { FRAME_UPLOAD_MAX_BYTES, uploadTooLargeMessage } from '@/shared/uploadLimit';

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export const clientIp = (req: NextRequest) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

/** Cross-site request check for state-changing methods (the session cookie is also SameSite=Lax). */
function checkOrigin(req: NextRequest) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (origin) {
    let oh = '';
    try { oh = new URL(origin).host; } catch { /* invalid */ }
    if (oh !== host) throw new HttpError(403, 'Cross-site request refused');
  } else if (req.headers.get('sec-fetch-site') && !['same-origin', 'none'].includes(req.headers.get('sec-fetch-site')!)) {
    throw new HttpError(403, 'Cross-site request refused');
  }
}

// Per-instance sliding-window limiter for the calculation endpoints (best effort on serverless; login throttling is in the database).
const buckets = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) throw new HttpError(429, 'Too many requests: please wait a moment');
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k);
}

/** Reads a JSON body of at most maxBytes BYTES (the declared Content-Length and the bytes actually received; not JavaScript characters).
 *  tooLarge gives the 413 message (default 'Request too large'). */
export async function readJson(req: NextRequest, maxBytes = 2_000_000, tooLarge: (bytes?: number) => string = () => 'Request too large'): Promise<any> {
  const len = +(req.headers.get('content-length') || 0);
  if (len > maxBytes) throw new HttpError(413, tooLarge(len), { limitBytes: maxBytes });
  if (!(req.headers.get('content-type') || '').includes('application/json')) throw new HttpError(415, 'JSON body expected');
  const buf = await req.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new HttpError(413, tooLarge(buf.byteLength), { limitBytes: maxBytes });
  const text = new TextDecoder().decode(buf); // UTF-8, invalid sequences replaced, as req.text() does
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

/** Body of the frame-project import and save routes: the shared 4.4 MB limit (src/shared/uploadLimit.ts) with the readable message. */
export const readFrameProjectBody = (req: NextRequest) => readJson(req, FRAME_UPLOAD_MAX_BYTES, (bytes) => uploadTooLargeMessage(bytes, true));

type Ctx = { user: SessionUser | null; req: NextRequest; params: any };
type Opts = { auth?: 'none' | 'user' | 'admin' };

/** Wraps a route handler: origin check, authentication, uniform JSON errors (details of unexpected errors stay in the server log). */
export function route(opts: Opts, fn: (c: Ctx & { user: any }) => Promise<Response | object>) {
  return async (req: NextRequest, ctx: { params: Promise<any> }) => {
    try {
      checkOrigin(req);
      // a database failure during the session check is reported as such (503), not as "not signed in"
      const user = opts.auth === 'none' ? await currentUser().catch(() => null) : await currentUser({ dbErrors: 'throw' });
      if (opts.auth !== 'none' && !user) throw new HttpError(401, 'Not signed in');
      if (opts.auth === 'admin' && user!.role !== 'admin') throw new HttpError(403, 'Administrator access required');
      const out = await fn({ user, req, params: await ctx.params });
      return out instanceof Response ? out : NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e: any) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status, headers: { 'Cache-Control': 'no-store' } });
      console.error('[api]', req.method, req.nextUrl.pathname, e);
      const db = /ECONN|ETIMEDOUT|connection|terminat/i.test(String(e?.message));
      return NextResponse.json({ error: db ? 'The database is not reachable. Nothing was saved. Please try again.' : 'Server error' }, { status: db ? 503 : 500 });
    }
  };
}

export async function audit(user: SessionUser | null, action: string, req: NextRequest, projectId?: string | null, detail?: unknown) {
  try {
    await q('insert into audit_log (user_id, action, project_id, ip, detail) values ($1, $2, $3, $4, $5)', [user?.id ?? null, action, projectId ?? null, clientIp(req), detail ? JSON.stringify(detail) : null]);
  } catch (e) {
    console.error('[audit]', e);
  }
}
