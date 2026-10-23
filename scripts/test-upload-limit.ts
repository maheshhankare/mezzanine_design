// Upload limit of the frame-project import (POST /api/frame/projects) and save (PUT /api/frame/projects/:id): the shared 4.4 MB limit counted in
// UTF-8 bytes, on the server (readJson / readFrameProjectBody) and in the browser (apiUpload, with fetch replaced by a stub).
// No database, no session, no network: DATABASE_URL is removed before anything is imported.   npm run test:upload
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';

delete process.env.DATABASE_URL;
let passed = 0, failed = 0;
const ok = (name: string, cond: boolean, detail = '') => { if (cond) passed++; else { failed++; console.log(`FAIL ${name} ${detail}`); } };
const status = async (p: Promise<unknown>) => { try { await p; return { status: 200, message: '' }; } catch (e: any) { return { status: e?.status ?? -1, message: String(e?.message ?? e) }; } };

(async () => {
  const L = await import('../src/shared/uploadLimit');
  const { readJson, readFrameProjectBody } = await import('../src/server/http');
  const { apiUpload, api } = await import('../src/lib/api');
  const MAX = L.FRAME_UPLOAD_MAX_BYTES;

  // ---- the shared limit and byte counting
  ok('limit is 4 400 000 bytes (4.4 MB)', MAX === 4_400_000 && L.FRAME_UPLOAD_LIMIT_TEXT === '4.4 MB');
  ok('bytes, not characters: "a" 1, "é" 2, "€" 3, "😀" 4 (2 JS characters)', L.utf8Bytes('a') === 1 && L.utf8Bytes('é') === 2 && L.utf8Bytes('€') === 3 && L.utf8Bytes('😀') === 4 && '😀'.length === 2);
  ok('size shown rounded up: 4 400 001 bytes reads 4.41 MB, not 4.40', L.megabytes(4_400_001) === '4.41 MB' && L.megabytes(4_400_000) === '4.40 MB' && L.megabytes(460_000) === '0.46 MB');
  ok('message states the size and the limit', L.uploadTooLargeMessage(5_200_000) === 'The project data is 5.20 MB; the upload limit is 4.4 MB. Nothing was sent or saved.');
  ok('message after the server refused: "Nothing was saved."', /4\.4 MB\. Nothing was saved\.$/.test(L.uploadTooLargeMessage(5_200_000, true)));

  // a JSON body {"project":"…"} of exactly n UTF-8 bytes, filled with ch (1, 2 or 3 bytes)
  const body = (n: number, ch = 'x') => { const shell = '{"project":""}', w = L.utf8Bytes(ch), k = Math.floor((n - shell.length) / w); const pad = 'x'.repeat(n - shell.length - k * w); return `{"project":"${ch.repeat(k)}${pad}"}`; };
  const req = (text: string, headers: Record<string, string> = {}) => new NextRequest('http://localhost:3000/api/frame/projects', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: text });
  ok('test body builder is exact', L.utf8Bytes(body(MAX)) === MAX && L.utf8Bytes(body(MAX + 1)) === MAX + 1 && L.utf8Bytes(body(MAX, 'é')) === MAX && L.utf8Bytes(body(MAX + 1, '€')) === MAX + 1);

  // ---- server: the helper used by both routes
  const atLimit = await status(readFrameProjectBody(req(body(MAX))));
  ok('server: exactly 4 400 000 bytes accepted', atLimit.status === 200, JSON.stringify(atLimit));
  const below = await readFrameProjectBody(req(body(MAX - 1)));
  ok('server: just below the limit accepted and parsed', typeof below.project === 'string' && below.project.length === MAX - 1 - '{"project":""}'.length);
  const over = await status(readFrameProjectBody(req(body(MAX + 1))));
  ok('server: 4 400 001 bytes refused with 413', over.status === 413, JSON.stringify(over));
  ok('server: 413 message is readable (size and limit)', over.message === 'The project data is 4.41 MB; the upload limit is 4.4 MB. Nothing was saved.', over.message);
  // non-ASCII: fewer JavaScript characters than the limit, more bytes (the old character count accepted this body)
  const e2 = body(MAX + 1, 'é');
  ok('test body: non-ASCII body has fewer characters than the limit', e2.length < MAX, `${e2.length}`);
  ok('server: non-ASCII body above the limit in BYTES refused (413)', (await status(readFrameProjectBody(req(e2)))).status === 413);
  const e3 = body(MAX, '€');
  const ok3 = await status(readFrameProjectBody(req(e3)));
  ok('server: non-ASCII body of exactly 4 400 000 bytes accepted and decoded', ok3.status === 200 && (await readFrameProjectBody(req(e3))).project.startsWith('€€€'));
  // the declared Content-Length is checked before the body is read
  const declared = req('{"project":{}}', { 'content-length': String(MAX + 1) });
  if (declared.headers.get('content-length') === String(MAX + 1)) {
    const d = await status(readFrameProjectBody(declared));
    ok('server: declared Content-Length above the limit refused before reading (413, size from the header)', d.status === 413 && /4\.41 MB/.test(d.message), JSON.stringify(d));
  } else console.log('note: this runtime drops a Content-Length set on a Request object; the declared-length path was not exercised here');
  ok('server: other routes keep their own limit and message ("Request too large")', (await status(readJson(req('{"a":"' + 'é'.repeat(6) + '"}'), 10))).message === 'Request too large');
  ok('server: other routes count bytes too (6 "é" = 12 bytes > 15-byte limit with braces)', (await status(readJson(req('{"a":"' + 'é'.repeat(6) + '"}'), 15))).status === 413 && (await status(readJson(req('{"a":"' + 'e'.repeat(6) + '"}'), 15))).status === 200);
  ok('server: invalid JSON still 400, wrong content type still 415', (await status(readFrameProjectBody(req('{nope')))).status === 400
    && (await status(readFrameProjectBody(new NextRequest('http://localhost:3000/x', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })))).status === 415);

  // ---- both routes use the shared helper (the handlers themselves need a session and the database, so they are not run here)
  for (const f of ['src/app/api/frame/projects/route.ts', 'src/app/api/frame/projects/[id]/route.ts']) {
    const src = readFileSync(f, 'utf8');
    ok(`route ${f}: reads its body with readFrameProjectBody, no other limit`, /readFrameProjectBody\(req\)/.test(src) && !/readJson\(/.test(src) && !/12_000_000/.test(src));
  }
  ok('src/server/http.ts: readFrameProjectBody uses FRAME_UPLOAD_MAX_BYTES', /readJson\(req, FRAME_UPLOAD_MAX_BYTES,/.test(readFileSync('src/server/http.ts', 'utf8')));
  for (const [f, m] of [['src/components/FrameProjects.tsx', /apiUpload<[^>]*>\('\/api\/frame\/projects', 'POST'/], ['src/components/FrameProject.tsx', /apiUpload<any>\(`\/api\/frame\/projects\/\$\{id\}`, 'PUT'/]] as const)
    ok(`browser ${f}: sends through apiUpload (checked before sending)`, m.test(readFileSync(f, 'utf8')));

  // ---- browser: apiUpload with fetch replaced by a stub (nothing leaves this process)
  const calls: { url: string; bytes: number }[] = [];
  let reply: () => Response = () => new Response('{"id":"p1"}', { status: 200, headers: { 'content-type': 'application/json' } });
  (globalThis as any).fetch = async (url: string, init: RequestInit) => { calls.push({ url, bytes: L.utf8Bytes(String(init.body)) }); return reply(); };
  const big = { project: 'x'.repeat(MAX) }; // JSON is MAX + 14 bytes
  const c0 = calls.length, b = await status(apiUpload('/api/frame/projects', 'POST', big));
  ok('browser: oversized import is NOT sent (fetch not called)', calls.length === c0);
  ok('browser: oversized import gives 413 with size and limit', b.status === 413 && b.message === `The project data is ${L.megabytes(MAX + 14)}; the upload limit is 4.4 MB. Nothing was sent or saved.`, b.message);
  const bE = await status(apiUpload('/api/frame/projects/p1', 'PUT', { project: 'é'.repeat(2_200_000), revision: 1 }));
  ok('browser: non-ASCII save above the limit in bytes is not sent (2 200 027 characters, 4 400 027 bytes)', bE.status === 413 && calls.length === c0 && /4\.41 MB/.test(bE.message), bE.message);
  const justBelow = { project: 'x'.repeat(MAX - '{"project":""}'.length) };
  const r1 = await apiUpload<any>('/api/frame/projects', 'POST', justBelow);
  ok('browser: exactly 4 400 000 bytes is sent unchanged and the reply returned', calls.length === c0 + 1 && calls[calls.length - 1].bytes === MAX && r1.id === 'p1');
  // replies from the server or the platform
  reply = () => new Response('{"error":"The project data is 4.41 MB; the upload limit is 4.4 MB. Nothing was saved."}', { status: 413, headers: { 'content-type': 'application/json' } });
  ok('browser: the server\'s own 413 message is shown as it is', (await status(apiUpload('/api/frame/projects', 'POST', { project: {} }))).message === 'The project data is 4.41 MB; the upload limit is 4.4 MB. Nothing was saved.');
  reply = () => new Response('Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE\n', { status: 413, headers: { 'content-type': 'text/plain', 'x-vercel-error': 'FUNCTION_PAYLOAD_TOO_LARGE' } });
  const v = await status(apiUpload('/api/frame/projects', 'POST', { project: {} }));
  ok('browser: a plain-text 413 (Vercel FUNCTION_PAYLOAD_TOO_LARGE) gives a readable message', v.status === 413 && v.message === 'The data sent is larger than the server accepts (HTTP 413). Nothing was saved.', v.message);
  reply = () => new Response('{"error":"Server error"}', { status: 500, headers: { 'content-type': 'application/json' } });
  const s500 = await status(apiUpload('/api/frame/projects', 'POST', { project: {} }));
  ok('browser: an unrelated error (500) is NOT labelled a size error', s500.status === 500 && s500.message === 'Server error');
  reply = () => new Response('<html>Bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } });
  const s502 = await status(apiUpload('/api/frame/projects', 'POST', { project: {} }));
  ok('browser: a non-JSON 502 is NOT labelled a size error', s502.status === 502 && s502.message === 'Request failed (502)' && !/large|MB/.test(s502.message));
  reply = () => new Response('{"error":"Edit conflict"}', { status: 409, headers: { 'content-type': 'application/json' } });
  ok('browser: a 409 keeps its own message', (await status(apiUpload('/api/frame/projects/p1', 'PUT', { project: {}, revision: 1 }))).message === 'Edit conflict');
  reply = () => new Response('{}', { status: 413, headers: { 'content-type': 'application/json' } });
  ok('browser: other requests (api) also read a 413 without a message clearly', (await status(api('/api/projects', 'POST', { a: 1 }))).message === 'The data sent is larger than the server accepts (HTTP 413). Nothing was saved.');

  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('test crashed:', e); process.exit(1); });
