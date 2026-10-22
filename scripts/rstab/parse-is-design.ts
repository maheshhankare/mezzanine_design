// Parses the RSTAB "STEEL IS" member design summary (section 2.4 of the Detail 3 report) into JSON: per member, the governing check per equation number with
// location, load combination and utilisation ratio. This is RSTAB's own IS 800 design result, used as a reference for implementation tests; it is not
// proof of IS 800 compliance.
//   npx tsx scripts/rstab/parse-is-design.ts <report.txt> benchmarks/rstab-3x5-v3
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const [, , src, outDir = 'benchmarks/rstab-3x5-v3'] = process.argv;
const lines = readFileSync(src, 'utf8').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim());
mkdirSync(outDir, { recursive: true });

// the IS section starts after the heading "STEEL IS" ... "Design of steel members according to IS" of the contents; its tables follow the first "1.1 GENERAL DATA"
// whose next lines say "STEEL IS". Find the member-design table that belongs to the IS add-on: the one whose rows quote IS 800 clauses (7.1.2, 8.4.1, 9.3.1.x).
const isAddOn = lines.findIndex((l, i) => l === 'Design of steel members' && lines[i + 1] === 'according to IS');
const start = lines.findIndex((l, i) => i > isAddOn && /^2.4 DESIGN BY MEMBER/.test(l));
const end = lines.findIndex((l, i) => i > start && /^1\.1\.1 GENERAL DATA/.test(l));
if (isAddOn < 0 || start < 0 || end < 0) throw new Error('IS design table not found');

interface Row { x: number; co: string; ratio: number; eq: number; description: string }
const out: Record<string, { section: number; sectionName: string; rows: Row[] }> = {};
let member = 0;
let cur: Row | null = null;
for (let i = start; i < end; i++) {
  const l = lines[i];
  let m = l.match(/^(\d+) Cross-section No\. (\d+) - (.+)$/);
  if (m) { member = +m[1]; (out[member] ??= { section: +m[2], sectionName: m[3], rows: [] }); cur = null; continue; }
  m = l.match(/^([\d.]+) (CO\d|RC\d) ([\d.]+)\s+\S?\s*1 (\d+)\) (.*)$/); // a status symbol (private-use glyph) sits between the ratio and the design column
  if (m && member) { cur = { x: +m[1], co: m[2], ratio: +m[3], eq: +m[4], description: m[5] }; out[member].rows.push(cur); continue; }
  if (cur && l && !/^(Member|No\.|2\.4 DESIGN|=== PAGE)/.test(l) && !/^[\d.]+ (CO|RC)/.test(l) && !/Non-designabl|^e$|^\d+ 1 ER/.test(l)) cur.description += ' ' + l;
}
writeFileSync(`${outDir}/rstab-is-design.json`, JSON.stringify(out));
const eqs = new Map<number, { n: number; d: string }>();
for (const v of Object.values(out)) for (const r of v.rows) { const e = eqs.get(r.eq) ?? { n: 0, d: r.description }; e.n++; eqs.set(r.eq, e); }
console.log(`members with IS design rows: ${Object.keys(out).length}`);
for (const [k, v] of [...eqs.entries()].sort((a, b) => a[0] - b[0])) console.log(`  eq ${k}: ${v.n} rows  ${v.d}`);
