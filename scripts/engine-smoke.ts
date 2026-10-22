// The C-section designer (IS 800:2007 only): default project, and the six reference cases against the results recorded by scripts/record-xbref.ts.   npm run test:engine
import { SCHEMA } from '../src/shared/schema';
import { MODEL } from '../src/server/engine/model';
import { XCHK } from '../src/server/engine/xcheck';

const r = MODEL.compute(SCHEMA.defaults());
if (r.fatal) { console.log('FAIL the default project is not calculated'); process.exit(1); }
console.log('default project: overall', r.summary?.overall.status, '| fail', r.summary?.nFail, '| review', r.summary?.nReview, '| pass', r.summary?.nPass, '| route', r.R.code);
let failed = 0;
const g = XCHK.selfTest();
for (let s = g.next(); !s.done; s = g.next()) {
  const row = s.value;
  const good = /^IDENTICAL|^MATCH/.test(row.verdict);
  console.log(`${good ? 'ok  ' : 'FAIL'} ${row.id} ${row.verdict} (${row.values ?? 0} values, ${row.status})`);
  if (!good) failed++;
}
if (r.R.code !== 'IS') { console.log('FAIL route is not IS 800'); failed++; }
console.log(failed ? `${failed} failed` : 'all reference cases reproduced');
process.exit(failed ? 1 : 0);
