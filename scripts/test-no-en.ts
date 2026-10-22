// The Eurocode and AISI design routes are gone: no source, test, script, document or stored data of the repository may refer to them, except the files that
// DESCRIBE their removal or MIGRATE data stored under them (the allow-list below, each with its reason).   npm run test:no-en
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'benchmarks', 'fonts', 'public']);
const TEXT = /\.(ts|tsx|js|mjs|cjs|json|md|sql|css|html|txt|yml|yaml)$/i;
// the removed standards, whatever their form
const PATTERN = /EN[ -]?19\d\d|EN[ -]?10\d{3}|EN[ -]?ISO|EN[ -]?12\d{3}|Eurocode|National Annex|\bNDP\b|AISI|AISC|ASCE[ -]?7|\bSCI P\d+|CIDECT|\bS355\b|\bS275\b|\bS235\b/i;
const ALLOW: Record<string, string> = {
  'scripts/test-no-en.ts': 'this test (defines the pattern)',
  'scripts/test-restraint.ts': 'asserts that no joist check cites a removed standard',
  'scripts/test-legacy.ts': 'tests that the removed routes cannot be selected or reached, and that stored data are migrated',
  'scripts/test-api.mjs': 'end-to-end test that inputs stored by a removed route are migrated and not calculated before the review',
  'scripts/test-integration.ts': 'tests the migration of stored frame-project settings of the removed route',
  'scripts/test-codes.ts': 'tests that the settings of the removed route are migrated and cannot select a design route',
  'src/shared/codeRegister.ts': 'states the removal and contains the integrity rule that rejects an item referring to a removed route',
  'src/shared/analysisSettings.ts': 'migration of stored frame-project settings (names the removed keys)',
  'src/shared/schema.ts': 'migration of stored C-section inputs (names the removed inputs)',
  'docs/IS800_ONLY_CONVERSION.md': 'documents the removal of the Eurocode and AISI routes',
};

const hits: string[] = [];
(function walk(d: string) {
  for (const f of readdirSync(d)) {
    if (SKIP_DIRS.has(f)) continue;
    const p = join(d, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    const rel = relative(ROOT, p).split(sep).join('/');
    if (!TEXT.test(f) || /package-lock\.json$|tsconfig\.tsbuildinfo$/.test(f) || ALLOW[rel]) continue;
    const lines = readFileSync(p, 'utf8').split('\n');
    lines.forEach((l, i) => { if (PATTERN.test(l)) hits.push(`${rel}:${i + 1}: ${l.trim().slice(0, 140)}`); });
  }
})(ROOT);

let failed = 0;
const ok = (name: string, cond: boolean, detail = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); if (!cond) failed++; };
ok('no reference to a removed design standard outside the allow-listed files', hits.length === 0, hits.length ? `\n  ${hits.slice(0, 40).join('\n  ')}${hits.length > 40 ? `\n  … ${hits.length - 40} more` : ''}` : '');
for (const [f, why] of Object.entries(ALLOW)) { try { statSync(join(ROOT, f)); } catch { ok(`allow-list entry exists: ${f}`, false, `(${why})`); } }
console.log(failed ? `\n${hits.length} reference(s)` : '\nclean');
process.exit(failed ? 1 : 0);
