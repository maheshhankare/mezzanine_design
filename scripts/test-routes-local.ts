// The REAL frame-project route handlers (import, save, open, run, run record, PDF) called in this process, with two test-only stand-ins installed
// through Node module hooks before anything is imported:
//   * src/server/db.ts  -> an in-memory table store that answers exactly the SQL statements these routes send (any other statement fails the test);
//   * next/headers      -> cookies() returns the session cookie set by the test (outside a request there is no cookie store).
// Everything else is the application code as deployed: origin check, session-token verification (jose, a RANDOM temporary AUTH_SECRET),
// user lookup, ownership checks, the 4.4 MB limit, validation, the solver and design checks, the calculation record, the PDF, the error mapping.
// No real database, account, credential or saved project is used.   npm run test:routes
import { registerHooks } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

delete process.env.DATABASE_URL; // the real database module is never loaded; this makes sure nothing could reach a database anyway
process.env.AUTH_SECRET = randomBytes(32).toString('hex');

// ---------------- test-only stand-ins ----------------
// the two stand-ins are written to a new temporary folder (outside the project) and removed at the end
const stubDir = mkdtempSync(join(tmpdir(), 'mz-route-test-'));
const STUB_DB = join(stubDir, 'db.cjs'), STUB_HEADERS = join(stubDir, 'next-headers.cjs');
writeFileSync(STUB_DB, `exports.q = (t, p) => globalThis.__routeTestDb.q(t, p || []);
exports.q1 = async (t, p) => (await globalThis.__routeTestDb.q(t, p || []))[0] ?? null;
exports.tx = async () => { throw new Error('tx is not used by these routes'); };
`);
writeFileSync(STUB_HEADERS, `exports.cookies = async () => ({ get: (n) => (n === 'mz_session' && globalThis.__routeTestCookie !== undefined ? { name: n, value: globalThis.__routeTestCookie } : undefined), set() {}, delete() {} });
exports.headers = async () => new Headers();
`);
process.on('exit', () => rmSync(stubDir, { recursive: true, force: true }));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'next/headers') return { url: pathToFileURL(STUB_HEADERS).href, format: 'commonjs', shortCircuit: true };
    if (/^\.{1,2}\/db$/.test(specifier) && /\/src\/server\//.test(context.parentURL || '')) return { url: pathToFileURL(STUB_DB).href, format: 'commonjs', shortCircuit: true };
    return next(specifier, context);
  },
});

/** In-memory tables. Only the statements of these routes are answered (any other SQL throws), and a SELECT returns only the columns it names. */
class TestDb {
  users = new Map<string, any>(); projects = new Map<string, any>(); runs: any[] = []; audit: any[] = []; sql: string[] = []; unexpected: string[] = []; failNext: string | null = null; failOn: RegExp | null = null;
  async q(text: string, p: any[]): Promise<any[]> {
    const s = text.replace(/\s+/g, ' ').trim(); this.sql.push(s);
    if (this.failNext && (!this.failOn || this.failOn.test(s))) { const m = this.failNext; this.failNext = null; this.failOn = null; throw new Error(m); }
    const now = () => new Date();
    const pick = (row: any, cols: string) => Object.fromEntries(cols.split(',').map((c) => c.trim()).map((c) => [c, row[c]]));
    let m: RegExpMatchArray | null;
    if (s === 'select id, email, name, role, active, token_version from users where id = $1') { const u = this.users.get(p[0]); return u ? [{ ...u }] : []; }
    if (s.startsWith('insert into audit_log ')) { this.audit.push({ user_id: p[0], action: p[1], project_id: p[2] }); return []; }
    if (s === 'insert into frame_projects (owner_id, name, data, model_fingerprint) values ($1, $2, $3, $4) returning *') {
      const r = { id: randomUUID(), owner_id: p[0], name: p[1], data: JSON.parse(p[2]), revision: 1, model_fingerprint: p[3], created_at: now(), updated_at: now() };
      this.projects.set(r.id, r); return [structuredClone(r)];
    }
    if (s === 'select * from frame_projects where id = $1 and owner_id = $2') { const r = this.projects.get(p[0]); return r && r.owner_id === p[1] ? [structuredClone(r)] : []; }
    if (s.startsWith('update frame_projects set name = $4, data = $5, model_fingerprint = $6, revision = revision + 1, updated_at = now() where id = $1 and owner_id = $2 and revision = $3 returning *')) {
      const r = this.projects.get(p[0]); if (!r || r.owner_id !== p[1] || r.revision !== p[2]) return [];
      Object.assign(r, { name: p[3], data: JSON.parse(p[4]), model_fingerprint: p[5], revision: r.revision + 1, updated_at: now() }); return [structuredClone(r)];
    }
    if (s.startsWith('insert into frame_runs (project_id, user_id, model_revision, model_fingerprint, engine_version, status, label, settings, summary, record) values')) {
      const r = { id: randomUUID(), project_id: p[0], user_id: p[1], model_revision: p[2], model_fingerprint: p[3], engine_version: p[4], status: p[5], label: p[6], settings: JSON.parse(p[7]), summary: JSON.parse(p[8]), record: JSON.parse(p[9]), created_at: now() };
      this.runs.push(r); return [structuredClone(r)];
    }
    if ((m = s.match(/^select (.+) from frame_runs where project_id = \$1 order by created_at desc limit 100$/))) {
      return this.runs.filter((r) => r.project_id === p[0]).slice().reverse().map((r) => pick(structuredClone(r), m![1]));
    }
    if (s === 'select r.* from frame_runs r join frame_projects p on p.id = r.project_id where r.id = $1 and p.owner_id = $2') {
      const r = this.runs.find((x) => x.id === p[0]); const pr = r && this.projects.get(r.project_id); return r && pr && pr.owner_id === p[1] ? [structuredClone(r)] : [];
    }
    this.unexpected.push(s.slice(0, 120));
    throw new Error('route test: unexpected SQL: ' + s.slice(0, 120));
  }
}
const db = new TestDb();
(globalThis as any).__routeTestDb = db;

let passed = 0, failed = 0;
const ok = (name: string, cond: boolean, detail = '') => { if (cond) passed++; else { failed++; console.log(`FAIL ${name} ${detail}`); } };
const bytes = (s: string) => new TextEncoder().encode(s).length;

(async () => {
  const { SignJWT } = await import('jose');
  const { NextRequest } = await import('next/server');
  const L = await import('../src/shared/uploadLimit');
  const projects = await import('../src/app/api/frame/projects/route');
  const project = await import('../src/app/api/frame/projects/[id]/route');
  const runRoute = await import('../src/app/api/frame/projects/[id]/run/route');
  const runGet = await import('../src/app/api/frame/runs/[id]/route');
  const report = await import('../src/app/api/frame/runs/[id]/report/route');
  const { apiUpload, api } = await import('../src/lib/api');
  const { buildBenchmarkProject } = await import('./rstab/project');
  const MAX = L.FRAME_UPLOAD_MAX_BYTES;

  // two test users (no real account); the session token is signed exactly as at login, with the temporary secret
  const mkUser = (email: string) => { const u = { id: randomUUID(), email, name: email.split('@')[0], role: 'user', active: true, token_version: 1 }; db.users.set(u.id, u); return u; };
  const A = mkUser('route-test-a@example.test'), B = mkUser('route-test-b@example.test');
  const token = (u: any) => new SignJWT({ tv: u.token_version }).setProtectedHeader({ alg: 'HS256' }).setSubject(u.id).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
  const tokA = await token(A), tokB = await token(B);
  const as = (t: string | undefined) => { (globalThis as any).__routeTestCookie = t; };

  // calls a real handler with a request as a browser sends it (Content-Length = UTF-8 bytes, same-origin)
  const call = async (h: any, method: string, path: string, params: any = {}, body?: string, opts: { noLength?: boolean } = {}) => {
    const headers: Record<string, string> = { host: 'localhost:3000', origin: 'http://localhost:3000' };
    if (body !== undefined) { headers['content-type'] = 'application/json'; if (!opts.noLength) headers['content-length'] = String(bytes(body)); }
    const res: Response = await h(new NextRequest('http://localhost:3000' + path, { method, headers, body }), { params: Promise.resolve(params) });
    const ct = res.headers.get('content-type') || '';
    const raw = Buffer.from(await res.arrayBuffer());
    return { status: res.status, ct, size: raw.length, json: ct.includes('json') ? JSON.parse(raw.toString('utf8')) : null, raw };
  };
  // a JSON text of the project padded with JSON whitespace (valid JSON, same project) to exactly n bytes
  const padTo = (obj: any, n: number) => { const t = JSON.stringify(obj); if (bytes(t) > n) throw new Error('already larger'); return t.slice(0, -1) + ' '.repeat(n - bytes(t)) + '}'; };
  const bench = buildBenchmarkProject({ design: true });

  // ---- authentication and ownership (real session code)
  as(undefined);
  ok('import without a session: 401', (await call(projects.POST, 'POST', '/api/frame/projects', {}, JSON.stringify({ project: bench }))).status === 401);
  as('not-a-token');
  ok('import with an invalid token: 401', (await call(projects.POST, 'POST', '/api/frame/projects', {}, JSON.stringify({ project: bench }))).status === 401);
  as(tokA);

  // ---- import (POST /api/frame/projects)
  const imp = await call(projects.POST, 'POST', '/api/frame/projects', {}, JSON.stringify({ project: bench }));
  ok('import: benchmark project (0.46 MB) accepted', imp.status === 200 && !!imp.json?.id && db.projects.has(imp.json.id), JSON.stringify(imp.json).slice(0, 200));
  const pid = imp.json.id;
  ok('import: stored for its owner, audited', db.projects.get(pid)?.owner_id === A.id && db.audit.some((x) => x.action === 'frame.create' && x.project_id === pid));
  const named = (name: string) => ({ project: { ...bench, meta: { ...bench.meta, name } } });
  const atLimit = await call(projects.POST, 'POST', '/api/frame/projects', {}, padTo(named('at the limit'), MAX));
  ok('import: exactly 4 400 000 bytes accepted (valid project padded with JSON spaces)', atLimit.status === 200 && db.projects.get(atLimit.json?.id)?.name === 'at the limit', `${atLimit.status} ${JSON.stringify(atLimit.json).slice(0, 150)}`);
  const nBefore = db.projects.size;
  const over = await call(projects.POST, 'POST', '/api/frame/projects', {}, padTo(named('over'), MAX + 1));
  ok('import: 4 400 001 bytes refused with 413 and a readable message', over.status === 413 && over.json?.error === 'The project data is 4.41 MB; the upload limit is 4.4 MB. Nothing was saved.', JSON.stringify(over.json));
  ok('import: nothing stored when refused', db.projects.size === nBefore);
  const overChunked = await call(projects.POST, 'POST', '/api/frame/projects', {}, padTo(named('over'), MAX + 1), { noLength: true });
  ok('import: refused also without a Content-Length header (bytes counted as read)', overChunked.status === 413 && db.projects.size === nBefore);
  // non-ASCII: one "é" (2 bytes) makes the body 4 400 001 BYTES but only 4 400 000 characters (a character count would have let it through)
  const eOver = padTo(named('Mézzanine'), MAX + 1);
  ok('test body: 4 400 001 bytes, 4 400 000 characters', bytes(eOver) === MAX + 1 && eOver.length === MAX);
  ok('import: non-ASCII body over the limit in bytes refused (413)', (await call(projects.POST, 'POST', '/api/frame/projects', {}, eOver)).status === 413 && db.projects.size === nBefore);
  const eAt = await call(projects.POST, 'POST', '/api/frame/projects', {}, padTo(named('Mézzanine €'), MAX));
  ok('import: non-ASCII body of exactly 4 400 000 bytes accepted and the name kept intact', eAt.status === 200 && db.projects.get(eAt.json?.id)?.name === 'Mézzanine €', `${eAt.status}`);

  // ---- save (PUT /api/frame/projects/:id)
  const g0 = await call(project.GET, 'GET', `/api/frame/projects/${pid}`, { id: pid });
  ok('open: project returned with revision 1', g0.status === 200 && g0.json.revision === 1 && g0.json.project?.schema === bench.schema);
  const save = (rev: number, n: number) => call(project.PUT, 'PUT', `/api/frame/projects/${pid}`, { id: pid }, padTo({ project: g0.json.project, revision: rev }, n));
  const s1 = await save(1, MAX);
  ok('save: exactly 4 400 000 bytes accepted, revision 2', s1.status === 200 && s1.json.revision === 2, JSON.stringify(s1.json).slice(0, 200));
  const s2 = await save(2, MAX + 1);
  ok('save: 4 400 001 bytes refused with 413 and the readable message', s2.status === 413 && s2.json?.error === 'The project data is 4.41 MB; the upload limit is 4.4 MB. Nothing was saved.');
  ok('save: the stored project is unchanged after the refusal (still revision 2)', db.projects.get(pid).revision === 2);
  as(tokB);
  ok('save: another user cannot save this project (404, nothing changed)', (await save(2, 2000 + bytes(JSON.stringify({ project: g0.json.project, revision: 2 })))).status === 404 && db.projects.get(pid).revision === 2);
  ok('open: another user cannot open this project (404)', (await call(project.GET, 'GET', `/api/frame/projects/${pid}`, { id: pid })).status === 404);
  as(tokA);

  // ---- run, open, run record, PDF (the real solver and IS 800 design checks)
  const t0 = Date.now();
  const run = await call(runRoute.POST, 'POST', `/api/frame/projects/${pid}/run`, { id: pid });
  ok('run: design run completed and stored with its summary', run.status === 200 && !!run.json.runId && !!db.runs.find((r) => r.id === run.json.runId)?.summary?.design, `${run.status} ${JSON.stringify(run.json).slice(0, 200)}`);
  console.log(`  (run took ${((Date.now() - t0) / 1000).toFixed(1)} s; "Run" reply ${(run.size / 1e6).toFixed(2)} MB)`);
  const rid = run.json.runId;
  const sqlBefore = db.sql.length;
  const g1 = await call(project.GET, 'GET', `/api/frame/projects/${pid}`, { id: pid });
  const listSql = db.sql.slice(sqlBefore).find((x) => x.includes('from frame_runs where project_id'));
  ok('open: the run-list query does not ask for the summary column', !!listSql && !/\bsummary\b/.test(listSql.split(' from ')[0]), listSql);
  ok('open: the run row has no summary, record or settings', g1.status === 200 && g1.json.runs.length === 1 && !('summary' in g1.json.runs[0]) && !('record' in g1.json.runs[0]) && !('settings' in g1.json.runs[0]), JSON.stringify(Object.keys(g1.json.runs[0] || {})));
  const row = g1.json.runs[0];
  ok('open: the run row has what the page shows (time, revision, status, label, note, current)', row.id === rid && /^\d{4}-\d\d-\d\dT/.test(row.createdAt) && row.modelRevision === 2 && row.status === 'completed' && !!row.label && row.current === true && row.note === 'current model');
  ok('open: the response is the project plus a small run list (under 5 KB more than the project)', g1.size - bytes(JSON.stringify(g1.json.project)) < 5000, `${g1.size} bytes`);
  ok('open: the project data is returned unchanged by the run', JSON.stringify(g1.json.project) === JSON.stringify(g0.json.project));
  const rec = await call(runGet.GET, 'GET', `/api/frame/runs/${rid}`, { id: rid });
  ok('run record: still has the full summary (design results) and the 15-section record', rec.status === 200 && !!rec.json.run.summary?.design && rec.json.run.record?.sections?.length === 15 && rec.json.current === true);
  const pdf = await call(report.GET, 'GET', `/api/frame/runs/${rid}/report`, { id: rid });
  ok('PDF report: built from the stored record', pdf.status === 200 && pdf.ct === 'application/pdf' && pdf.raw.subarray(0, 5).toString() === '%PDF-' && pdf.size > 3000);
  as(tokB);
  ok('run record: another user cannot read it (404)', (await call(runGet.GET, 'GET', `/api/frame/runs/${rid}`, { id: rid })).status === 404);
  as(tokA);

  // ---- unrelated server errors keep their own meaning
  // a database failure while reading the project (after the session check): the route's own 503 message
  db.failNext = 'connect ECONNREFUSED'; db.failOn = /^select \* from frame_projects/;
  const dbDown = await call(project.GET, 'GET', `/api/frame/projects/${pid}`, { id: pid });
  ok('database failure while reading the project (simulated): 503 with the database message, not a size message', dbDown.status === 503 && /database is not reachable/.test(dbDown.json?.error) && !/MB|large/.test(dbDown.json?.error), JSON.stringify(dbDown.json));
  // existing behaviour, recorded (not changed): a database failure during the session check is treated as "not signed in" (currentUser catches every error)
  db.failNext = 'connect ECONNREFUSED'; db.failOn = /from users where id/;
  ok('database failure during the session check (simulated): 401 "Not signed in" (existing behaviour, recorded)', (await call(project.GET, 'GET', `/api/frame/projects/${pid}`, { id: pid })).status === 401);
  const bad = await call(project.PUT, 'PUT', `/api/frame/projects/${pid}`, { id: pid }, JSON.stringify({ project: g0.json.project }));
  ok('save without a revision: 422 with its own message, not a size message', bad.status === 422 && /revision/.test(bad.json?.error) && !/MB/.test(bad.json?.error), JSON.stringify(bad.json));
  ok('invalid JSON: 400', (await call(projects.POST, 'POST', '/api/frame/projects', {}, '{"project": ')).status === 400);

  // ---- the browser side against the REAL handlers: fetch is connected in-process to the route handlers above (no network)
  const handlers: [RegExp, Record<string, any>, (m: RegExpMatchArray) => any][] = [
    [/^\/api\/frame\/projects$/, projects, () => ({})],
    [/^\/api\/frame\/projects\/([0-9a-f-]+)$/, project, (m) => ({ id: m[1] })],
  ];
  const sent: { path: string; bytes: number }[] = [];
  let platform413 = false;
  (globalThis as any).fetch = async (path: string, init: RequestInit) => {
    sent.push({ path, bytes: bytes(String(init.body ?? '')) });
    if (platform413) return new Response('Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE\n', { status: 413, headers: { 'content-type': 'text/plain', 'x-vercel-error': 'FUNCTION_PAYLOAD_TOO_LARGE' } }); // what Vercel answers above 4.5 MB (simulated)
    for (const [re, mod, params] of handlers) { const m = path.match(re); if (m) {
      const headers = new Headers(init.headers); headers.set('host', 'localhost:3000'); headers.set('origin', 'http://localhost:3000'); if (init.body) headers.set('content-length', String(bytes(String(init.body))));
      return mod[init.method || 'GET'](new NextRequest('http://localhost:3000' + path, { method: init.method, headers, body: init.body as string }), { params: Promise.resolve(params(m)) });
    } }
    return new Response('{"error":"Not found"}', { status: 404, headers: { 'content-type': 'application/json' } });
  };
  const err = async (p: Promise<unknown>) => { try { await p; return { status: 200, message: '' }; } catch (e: any) { return { status: e.status, message: e.message }; } };
  const nSent = sent.length, nProj = db.projects.size;
  const big = await err(apiUpload('/api/frame/projects', 'POST', { project: { ...bench, meta: { ...bench.meta, description: 'x'.repeat(MAX) } } }));
  ok('browser: oversized import is not sent at all, message states size and limit', sent.length === nSent && big.status === 413 && /^The project data is 4\.\d\d MB; the upload limit is 4\.4 MB\. Nothing was sent or saved\.$/.test(big.message) && db.projects.size === nProj, big.message);
  const viaBrowser = await apiUpload<any>('/api/frame/projects', 'POST', named('from the browser path'));
  ok('browser: a normal import goes through the real route and is stored', sent.length === nSent + 1 && db.projects.get(viaBrowser.id)?.name === 'from the browser path');
  const latest = await api<any>(`/api/frame/projects/${pid}`);
  const savedB = await apiUpload<any>(`/api/frame/projects/${pid}`, 'PUT', { project: latest.project, revision: latest.revision });
  ok('browser: a normal save goes through the real route (revision 3)', savedB.revision === 3 && db.projects.get(pid).revision === 3);
  // the browser size check bypassed on purpose (plain api()): a project whose JSON is 4 400 001 bytes, filled through its description
  const fill = (n: number) => { const o: any = { project: { ...bench, meta: { ...bench.meta, description: '' } } }; o.project.meta.description = 'x'.repeat(n - bytes(JSON.stringify(o))); return o; };
  ok('test body: 4 400 001 bytes as sent', bytes(JSON.stringify(fill(MAX + 1))) === MAX + 1);
  const serverSays = await err(api(`/api/frame/projects`, 'POST', fill(MAX + 1)));
  ok('browser: the server\'s own 413 message reaches the user unchanged', serverSays.status === 413 && serverSays.message === 'The project data is 4.41 MB; the upload limit is 4.4 MB. Nothing was saved.', serverSays.message);
  platform413 = true;
  const vercel = await err(apiUpload('/api/frame/projects', 'POST', { project: bench }));
  ok('browser: a plain-text 413 from the platform (simulated) gives a readable message', vercel.status === 413 && vercel.message === 'The data sent is larger than the server accepts (HTTP 413). Nothing was saved.');
  platform413 = false;
  db.failNext = 'connect ECONNREFUSED'; db.failOn = /^update frame_projects/;
  const down = await err(apiUpload(`/api/frame/projects/${pid}`, 'PUT', { project: latest.project, revision: 3 }));
  ok('browser: a database failure is shown as such, not as a size error', down.status === 503 && /database is not reachable/.test(down.message) && !/MB|large/.test(down.message), down.message);
  const conflict = await err(apiUpload(`/api/frame/projects/${pid}`, 'PUT', { project: latest.project, revision: 1 }));
  ok('browser: an edit conflict keeps its own message (409), not a size error', conflict.status === 409 && !/MB|large/.test(conflict.message), `${conflict.status} ${conflict.message}`);

  // ---- the stand-in answered only the statements of these routes
  ok('no unexpected SQL statement was sent', db.unexpected.length === 0, db.unexpected.join(' | '));
  console.log(`  (${db.sql.length} SQL statements answered by the in-memory stand-in; none sent to any database)`);
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('test crashed:', e); process.exit(1); });
