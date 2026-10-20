import { SCHEMA } from '../src/engine/schema';
import { MODEL } from '../src/engine/model';
import { XCHK } from '../src/engine/xcheck';

const r = MODEL.compute(SCHEMA.defaults());
if (r.fatal) process.exit(1);
console.log('fatal:', !!r.fatal, 'overall:', r.summary?.overall.status, 'fail/review:', r.summary?.nFail, r.summary?.nReview);
const g = XCHK.selfTest();
let n = 0, last: any;
for (let s = g.next(); !s.done; s = g.next()) { n++; last = s.value; }
console.log('selfTest steps:', n, JSON.stringify(last)?.slice(0, 300));
