import { writeFileSync } from 'node:fs';
import { SCHEMA } from '../src/shared/schema';
import { compute, toWire } from '../src/server/calc';
import { buildReport } from '../src/server/pdf';

async function main() {
  const I = SCHEMA.defaults();
  const res = compute(I); toWire(res);
  const t0 = Date.now();
  const pdf = await buildReport({ project: { name: 'Test Mezzanine – Example 3', reference: 'TM-001', customer: 'ACME Storage Ltd', customer_contact: 'J. Doe', site: 'Pune', notes: 'Test run', revision: 3, owner: 'Tester' }, inputs: I, res, generatedAt: new Date() });
  const out = process.argv[2] || 'report-test.pdf';
  writeFileSync(out, pdf);
  console.log('pdf bytes', pdf.length, 'ms', Date.now() - t0, '->', out);
}
main().catch((e) => { console.error(e); process.exit(1); });
