// End-to-end API checks against a running server.
//   E2E_BASE=http://localhost:3000 E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... node scripts/test-api.mjs
// It creates a second throw-away user through the admin API and leaves it DISABLED afterwards (the test projects are deleted).
import { parse } from 'devalue';

const BASE = process.env.E2E_BASE || 'http://localhost:3000';
const AE = process.env.E2E_ADMIN_EMAIL, AP = process.env.E2E_ADMIN_PASSWORD;
if (!AE || !AP) { console.error('set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD'); process.exit(2); }

let failed = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failed++; };

class Client {
  jar = '';
  async req(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
    const h = { ...headers, Origin: BASE };
    if (this.jar) h.Cookie = this.jar;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    const set = r.headers.getSetCookie?.() || [];
    for (const c of set) {
      const [kv] = c.split(';'); const [k, v] = kv.split('=');
      const rest = this.jar.split('; ').filter((x) => x && !x.startsWith(k + '='));
      this.jar = (v ? [...rest, `${k}=${v}`] : rest).join('; ');
    }
    if (raw) return r;
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, data: ct.includes('json') ? await r.json() : await r.text(), headers: r.headers };
  }
  login(email, password) { return this.req('/api/auth/login', { method: 'POST', body: { email, password } }); }
}

const rnd = () => Math.random().toString(36).slice(2, 8);
const bEmail = `qa-b-${rnd()}@example.test`, bPw = 'Qb-' + rnd() + rnd() + rnd();

const anon = new Client();
const A = new Client(), B = new Client();

// ---- unauthenticated access is refused
let r = await anon.req('/api/calc', { method: 'POST', body: { inputs: {} } });
ok('anonymous /api/calc -> 401', r.status === 401);
r = await anon.req('/api/projects');
ok('anonymous /api/projects -> 401', r.status === 401);
r = await anon.req('/api/admin/users');
ok('anonymous /api/admin/users -> 401', r.status === 401);
r = await anon.req('/api/frame/projects');
ok('anonymous /api/frame/projects -> 401', r.status === 401);
r = await anon.req('/frame', { raw: true });
ok('anonymous page /frame redirects to /login', r.status >= 300 && r.status < 400 && (r.headers.get('location') || '').includes('/login'));
r = await anon.req('/', { raw: true });
ok('anonymous page / redirects to /login', r.status >= 300 && r.status < 400 && (r.headers.get('location') || '').includes('/login'));
r = await anon.req('/p/anything', { raw: true });
ok('anonymous project page redirects to /login', r.status >= 300 && r.status < 400);

// ---- cross-site request refused
r = await anon.req('/api/auth/login', { method: 'POST', body: { email: 'x@y.z', password: 'x' }, headers: { Origin: 'https://evil.example' } });
// (Client.req overrides Origin with BASE, so send this one by hand)
const evil = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify({ email: AE, password: AP }) });
ok('login with a foreign Origin -> 403', evil.status === 403);

// ---- login
r = await A.login(AE, 'wrong-password-xyz');
ok('wrong password -> 401', r.status === 401);
r = await A.login(AE, AP);
ok('admin login -> 200 + session cookie', r.status === 200 && A.jar.includes('mz_session='));
r = await A.req('/api/auth/me');
ok('/api/auth/me returns the user', r.status === 200 && r.data.user?.email === AE);

// ---- admin creates user B
r = await A.req('/api/admin/users', { method: 'POST', body: { email: bEmail, name: 'QA B', role: 'user', password: bPw } });
ok('admin creates a user', r.status === 200, JSON.stringify(r.data));
const bId = r.data.id;
r = await A.req('/api/admin/users', { method: 'POST', body: { email: 'weak@example.test', name: 'W', role: 'user', password: 'short' } });
ok('weak password rejected (400)', r.status === 400);
r = await B.login(bEmail, bPw);
ok('user B login', r.status === 200);
r = await B.req('/api/admin/users');
ok('non-admin cannot list users (403)', r.status === 403);

// ---- C-section inputs of a removed design route are migrated, never calculated before the review (needs the migration of the project data)
{
  const legacyInputs = { code: 'EN', na: 'x', gM0: 1.0, combo: '610ab', mb_gr: 'S355' };
  let q = await A.req('/api/calc', { method: 'POST', body: { inputs: legacyInputs, units: {} } });
  const lres = q.status === 200 && typeof q.data === 'string' ? parse(q.data) : null;
  ok('legacy inputs (removed route) -> migrated, calculation withheld until reviewed', !!lres && lres.res.fatal === true && lres.res.msgs.some((m) => m.id === 'mig_ack'), q.status);
  q = await A.req('/api/calc', { method: 'POST', body: { inputs: { code: 'IS', mb_gr: 'user', mb_fy: 355, mb_fu: 490, mig_ack: 'yes' }, units: {} } });
  const lok = q.status === 200 && typeof q.data === 'string' ? parse(q.data) : null;
  ok('legacy inputs after the review -> IS 800 route', !!lok && !lok.res.fatal && lok.res.R.code === 'IS');
}
// ---- frame API: refuses data that is not a frame project
{
  const q = await A.req('/api/frame/projects', { method: 'POST', body: { project: { schema: 'x' } } });
  ok('frame project: wrong schema -> 422', q.status === 422);
  const l = await A.req('/api/frame/projects');
  ok('frame project list -> 200', l.status === 200 && Array.isArray(l.data.projects));
}

// ---- calculation service
const defaults = {};
r = await A.req('/api/calc', { method: 'POST', body: { inputs: defaults, units: {} } });
ok('calc with defaults -> 200', r.status === 200 && typeof r.data === 'string');
const out = parse(r.data);
ok('calc result has summary, sketches, take-off', !!out.res.summary && typeof out.res.svg?.plan === 'string' && typeof out.takeoff?.tot === 'number');
ok('calc payload carries no source text', !/function\s*\(|=>\s*\{|require\(/.test(r.data.slice(0, 400000)));
r = await A.req('/api/calc', { method: 'POST', body: { inputs: { nonsense_key: 1 } } });
ok('unknown input key -> 400', r.status === 400);
r = await A.req('/api/calc', { method: 'POST', body: { inputs: { Lmb: { a: 1 } } } });
ok('object-valued input -> 400', r.status === 400);

// ---- projects
const meta = { name: 'QA project ' + rnd(), reference: 'QA-1', customer: 'QA Co', customer_contact: '', site: 'Test', notes: '' };
r = await A.req('/api/projects', { method: 'POST', body: { meta, inputs: { Lmb: 3000 } } });
ok('create project (valid inputs)', r.status === 200 && r.data.id, JSON.stringify(r.data).slice(0, 120));
const pid = r.data.id;
r = await A.req('/api/projects', { method: 'POST', body: { meta, inputs: { Lmb: -5 } } });
ok('create with out-of-range input -> 422 with field list', r.status === 422 && Array.isArray(r.data.errors) && r.data.errors.length > 0);
r = await A.req('/api/projects', { method: 'POST', body: { meta: { name: '' }, inputs: {} } });
ok('create without a name -> 400', r.status === 400);
r = await A.req('/api/projects');
ok('list contains the project once', r.status === 200 && r.data.projects.filter((p) => p.id === pid).length === 1);
r = await A.req('/api/projects/' + pid);
const rev1 = r.data.project?.revision;
ok('open project returns inputs + revision 1', r.status === 200 && rev1 === 1 && r.data.project.inputs && r.data.project.inputs.nb !== undefined);
r = await A.req('/api/projects/' + pid, { method: 'PUT', body: { meta, inputs: { Lmb: 3200 }, expectedRevision: 1 } });
ok('update -> revision 2 (same record)', r.status === 200 && r.data.revision === 2 && r.data.id === pid);
r = await A.req('/api/projects/' + pid, { method: 'PUT', body: { meta, inputs: { Lmb: 3300 }, expectedRevision: 1 } });
ok('stale update -> 409 (nothing overwritten)', r.status === 409);
r = await A.req('/api/projects');
ok('still exactly one record after updates', r.data.projects.filter((p) => p.name === meta.name).length === 1);
r = await A.req('/api/projects/' + pid);
ok('reopened project holds the saved value', String(r.data.project.inputs.Lmb) === '3200');

// ---- access control between users
r = await B.req('/api/projects/' + pid);
ok('user B cannot open A\'s project (404)', r.status === 404);
r = await B.req('/api/projects/' + pid, { method: 'PUT', body: { meta, inputs: {}, expectedRevision: 2 } });
ok('user B cannot update it (404)', r.status === 404);
r = await B.req('/api/projects/' + pid, { method: 'DELETE' });
ok('user B cannot delete it (404)', r.status === 404);
r = await B.req(`/api/projects/${pid}/report`);
ok('user B cannot get its report (404)', r.status === 404);
r = await A.req('/api/projects/' + pid, { method: 'GET' });
r = await B.req('/api/projects');
ok('user B list does not include it', !r.data.projects.some((p) => p.id === pid));
r = await A.req(`/api/projects/${pid}/members`, { method: 'POST', body: { email: bEmail, role: 'viewer' } });
ok('owner shares as viewer', r.status === 200);
r = await B.req('/api/projects/' + pid);
ok('viewer can open', r.status === 200 && r.data.project.access === 'viewer');
r = await B.req('/api/projects/' + pid, { method: 'PUT', body: { meta, inputs: {}, expectedRevision: 2 } });
ok('viewer cannot update (403)', r.status === 403);
r = await B.req('/api/projects/' + pid, { method: 'DELETE' });
ok('viewer cannot delete (403)', r.status === 403);
r = await A.req('/api/projects/not-a-uuid');
ok('malformed id -> 404', r.status === 404);

// ---- PDF report and export
const pdf = await A.req(`/api/projects/${pid}/report`, { raw: true });
const buf = Buffer.from(await pdf.arrayBuffer());
ok('PDF report generated', pdf.status === 200 && (pdf.headers.get('content-type') || '').includes('application/pdf') && buf.subarray(0, 5).toString() === '%PDF-', `${buf.length} bytes`);
ok('PDF contains no HTML/JS/credentials markers', !/<script|<html|DATABASE_URL|AUTH_SECRET|postgres(ql)?:\/\//i.test(buf.toString('latin1')));
r = await A.req(`/api/projects/${pid}/export`);
ok('export has inputs and results, no source', r.status === 200 && r.data.format === 'mezzanine-project-data' && r.data.inputs && r.data.results && !/function\s*\(/.test(JSON.stringify(r.data)));

// ---- drawings and diagnostics
r = await A.req('/api/drawings', { method: 'POST', body: { inputs: {}, units: {} } });
ok('drawings list', r.status === 200 && r.data.list?.length > 5 && r.data.list[0].svg.startsWith('<svg'));
const dxf = await A.req('/api/drawings/dxf', { method: 'POST', body: { inputs: {}, id: 'drawings' }, raw: true });
const dtxt = await dxf.text();
ok('DXF download', dxf.status === 200 && dtxt.includes('SECTION') && dtxt.includes('ENTITIES'));
r = await A.req('/api/diag');
ok('diag info', r.status === 200 && r.data.engineVersion);

// ---- optimiser endpoints
r = await A.req('/api/opt/render', { method: 'POST', body: { inputs: {}, units: {}, S: {}, hist: [], Rtxt: null } });
ok('optimiser panel renders on the server', r.status === 200 && r.data.html.includes('OPTIMISE DESIGN'));
r = await A.req('/api/opt/event', { method: 'POST', body: { inputs: {}, units: {}, S: r.data.S, hist: [], Rtxt: null, head: {}, ev: { type: 'click', id: '', dataset: { omode: 'system' }, className: '' } } });
ok('optimiser event changes the mode', r.status === 200 && r.data.S.mode === 'system');

// ---- delete
r = await A.req('/api/projects/' + pid, { method: 'DELETE' });
ok('owner deletes the project', r.status === 200);
r = await A.req('/api/projects/' + pid);
ok('deleted project is gone (404)', r.status === 404);

// ---- disabled user loses access immediately
r = await A.req('/api/admin/users/' + bId, { method: 'PATCH', body: { active: false } });
ok('admin disables user B', r.status === 200);
r = await B.req('/api/projects');
ok('disabled user\'s existing session stops working (401)', r.status === 401);
r = await new Client().login(bEmail, bPw);
ok('disabled user cannot sign in (401)', r.status === 401);
r = await A.req('/api/admin/users/' + bId, { method: 'PATCH', body: { active: false } });

// ---- sign out
r = await A.req('/api/auth/logout', { method: 'POST' });
const after = await A.req('/api/auth/me');
ok('logout ends the session', r.status === 200 && after.status === 401);

// ---- login throttling (last: it blocks this e-mail for 15 minutes)
let blocked = false;
for (let i = 0; i < 8; i++) { const x = await new Client().login(`throttle-${rnd()}@example.test`, 'nope' + i); void x; }
const t = 'throttle-same@example.test';
for (let i = 0; i < 7; i++) { const x = await new Client().login(t, 'nope' + i); if (x.status === 429) blocked = true; }
ok('repeated failed sign-ins are throttled (429)', blocked);

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
