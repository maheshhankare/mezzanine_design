// Session-token handling with the installed jose, as the application uses it (HS256 JWS: SignJWT at login, jwtVerify in the middleware and in
// currentUser), and the decision of the real middleware (src/middleware.ts). A RANDOM temporary secret is used; the real AUTH_SECRET is never read.
// No database is touched (currentUser / issueSession are not called: they need a request context and the users table).   npm run test:auth
import { randomBytes } from 'node:crypto';
import * as jose from 'jose';
import { NextRequest } from 'next/server';

let passed = 0, failed = 0;
const ok = (name: string, cond: boolean, detail = '') => { if (cond) passed++; else { failed++; console.log(`FAIL ${name} ${detail}`); } };
const code = async (p: Promise<unknown>) => { try { await p; return 'ACCEPTED'; } catch (e: any) { return e?.code ?? e?.name ?? String(e); } };

const secret = randomBytes(32).toString('hex'); // temporary test secret (64 characters)
const key = new TextEncoder().encode(secret);
const verify = (t: string, k = key) => jose.jwtVerify(t, k, { algorithms: ['HS256'] }); // the options used by src/middleware.ts and session.ts
const sign = (o: { sub?: string; exp?: string | number; alg?: string; k?: Uint8Array } = {}) => {
  let j = new jose.SignJWT({ tv: 1 }).setProtectedHeader({ alg: o.alg ?? 'HS256' }).setIssuedAt();
  if (o.sub !== undefined) j = j.setSubject(o.sub);
  j = j.setExpirationTime(o.exp ?? '8h');
  return j.sign(o.k ?? key);
};

(async () => {
  // ---- tokens (jose, as used by login and session validation)
  const good = await sign({ sub: 'test-user' });
  const r = await verify(good);
  ok('HS256 token signed as at login verifies, subject and tv kept', r.payload.sub === 'test-user' && r.payload.tv === 1 && r.protectedHeader.alg === 'HS256');
  ok('the token is a 3-part JWS', good.split('.').length === 3);
  ok('expired token is rejected (ERR_JWT_EXPIRED)', (await code(verify(await sign({ sub: 'u', exp: Math.floor(Date.now() / 1000) - 60 })))) === 'ERR_JWT_EXPIRED');
  ok('tampered signature is rejected', (await code(verify(good.slice(0, -2) + (good.endsWith('AA') ? 'BB' : 'AA')))) === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED');
  ok('tampered payload is rejected', (await code(verify(good.split('.').map((p, i) => (i === 1 ? jose.base64url.encode(JSON.stringify({ sub: 'admin', tv: 1 })) : p)).join('.')))) === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED');
  ok('token signed with another key is rejected', (await code(verify(await sign({ sub: 'u', k: new TextEncoder().encode(randomBytes(32).toString('hex')) })))) === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED');
  ok('"alg": "none" token is rejected', (await code(verify('eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.'))) === 'ERR_JOSE_ALG_NOT_ALLOWED');
  ok('HS512 token is rejected (only HS256 allowed)', (await code(verify(await sign({ sub: 'u', alg: 'HS512' })))) === 'ERR_JOSE_ALG_NOT_ALLOWED');
  ok('garbage token is rejected', (await code(verify('not-a-token'))) === 'ERR_JWS_INVALID');
  // the only input that could reach the deflate code: a compact JWE with "zip": "DEF". jwtVerify rejects it as an invalid JWS before any decryption.
  const jwe = await new jose.CompactEncrypt(new TextEncoder().encode('{"sub":"x"}')).setProtectedHeader({ alg: 'dir', enc: 'A256GCM', zip: 'DEF' }).encrypt(randomBytes(32));
  ok('compressed JWE ("zip": "DEF", 5 parts) is rejected by jwtVerify before decryption (ERR_JWS_INVALID)', jwe.split('.').length === 5 && (await code(verify(jwe))) === 'ERR_JWS_INVALID');

  // ---- the real middleware (src/middleware.ts), run in Node with the temporary secret
  process.env.AUTH_SECRET = secret;
  const { middleware } = await import('../src/middleware');
  const run = async (path: string, token?: string) => {
    const req = new NextRequest(new URL(path, 'http://localhost:3000'), { headers: token !== undefined ? { cookie: `mz_session=${token}` } : {} });
    const res = await middleware(req);
    return { status: res.status, location: res.headers.get('location'), next: res.headers.get('x-middleware-next') === '1' };
  };
  const passes = (x: { next: boolean; status: number }) => x.next && x.status === 200;
  const toLogin = (x: { status: number; location: string | null }) => (x.status === 307 || x.status === 308) && !!x.location && new URL(x.location).pathname === '/login';
  ok('middleware: valid token passes a protected route', passes(await run('/frame', good)));
  ok('middleware: no cookie on a protected route redirects to /login with ?next=', await (async () => { const x = await run('/frame/abc?tab=2'); return toLogin(x) && new URL(x.location!).searchParams.get('next') === '/frame/abc?tab=2'; })());
  ok('middleware: no cookie on / redirects to /login without ?next', await (async () => { const x = await run('/'); return toLogin(x) && new URL(x.location!).search === ''; })());
  ok('middleware: expired token redirects to /login', toLogin(await run('/frame', await sign({ sub: 'u', exp: Math.floor(Date.now() / 1000) - 60 }))));
  ok('middleware: tampered token redirects to /login', toLogin(await run('/frame', good.slice(0, -2) + (good.endsWith('AA') ? 'BB' : 'AA'))));
  ok('middleware: compressed JWE redirects to /login (no decryption)', toLogin(await run('/frame', jwe)));
  ok('middleware: "alg": "none" token redirects to /login', toLogin(await run('/admin', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.')));
  ok('middleware: empty cookie redirects to /login', toLogin(await run('/frame', '')));
  ok('middleware: /login is public (passes without a token)', passes(await run('/login')));
  ok('middleware: /api/* bypasses the middleware (the API routes check the session themselves)', passes(await run('/api/projects')) && passes(await run('/api/auth/login')));
  delete process.env.AUTH_SECRET;
  ok('middleware: without AUTH_SECRET even a valid token is refused (fails closed)', toLogin(await run('/frame', good)));

  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('test crashed:', e); process.exit(1); });
