// After `npm run build`: checks that nothing sensitive is in what the BROWSER downloads (.next/static) and that no source maps are published.
//   node scripts/test-bundle.mjs
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = '.next/static';
if (!existsSync(root)) { console.error('run `npm run build` first'); process.exit(2); }

const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } })(root);
const all = files.filter((f) => /\.(js|css|html|json|txt)$/.test(f)).map((f) => [f, readFileSync(f, 'utf8')]);

// markers taken from the calculation engine (function names, method names and clause texts that exist only there) and from the secrets
const engine = ['searchComp', 'ltbAssemble', 'ltbFactor', 'Timoshenko', 'bimoment', 'Hermite', 'XB_REF', 'MODEL.compute', 'Block tearing', 'lever study', 'runSetup', 'OPT.run', 'rhsProps', 'solveFrame', 'buildCalculationRecord'];
const secrets = ['neondb_owner', 'npg_', 'neon.tech', 'DATABASE_URL', 'AUTH_SECRET', 'postgresql://', 'scrypt$'];
let failed = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failed++; };

console.log(`${all.length} client files, ${Math.round(all.reduce((a, [, t]) => a + t.length, 0) / 1024)} KB scanned`);
for (const m of engine) {
  const hits = all.filter(([, t]) => t.includes(m)).map(([f]) => f);
  ok(`engine marker not in the browser bundle: "${m}"`, hits.length === 0, hits.slice(0, 2).join(', '));
}
for (const m of secrets) {
  const hits = all.filter(([, t]) => t.includes(m)).map(([f]) => f);
  ok(`secret marker not in the browser bundle: "${m}"`, hits.length === 0, hits.slice(0, 2).join(', '));
}
ok('no source maps published', files.filter((f) => f.endsWith('.map')).length === 0);

// The middleware (Edge runtime). The build warns that jose uses CompressionStream / DecompressionStream because it scans every module the jose
// package exports; only its JWE "zip" code uses them. This checks that the middleware actually built and deployed does not contain that code,
// and still contains the HS256 session check.
const mm = '.next/server/middleware-manifest.json';
if (!existsSync(mm)) ok('middleware manifest present', false, mm);
else {
  const entry = JSON.parse(readFileSync(mm, 'utf8')).middleware?.['/'];
  ok('middleware is built', !!entry && entry.files.length > 0);
  const mfiles = (entry?.files ?? []).map((f) => [f, readFileSync(join('.next', f), 'utf8')]);
  for (const m of ['CompressionStream', 'DecompressionStream', 'deflate-raw']) {
    const hits = mfiles.filter(([, t]) => t.includes(m)).map(([f]) => f);
    ok(`middleware bundle does not contain "${m}"`, hits.length === 0, hits.join(', '));
  }
  ok('middleware bundle still contains the HS256 session check', mfiles.some(([, t]) => t.includes('HS256')));
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
