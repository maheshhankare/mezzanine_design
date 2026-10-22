// Records the reference results of the engine's reference cases into src/server/engine/xbref.ts.   npx tsx --conditions=react-server scripts/record-xbref.ts
// Run it only after a deliberate change of the calculation engine (and bump ENGINE_VERSION in xcheck.ts): the test compares every later run against these values.
import { writeFileSync } from 'node:fs';
import { XCHK } from '../src/server/engine/xcheck';

const cases: Record<string, { fp: string; digest: unknown }> = {};
for (const c of XCHK.CASES) cases[c.id] = { fp: XCHK.fingerprint(c.inputs), digest: XCHK.runCase(c).digest };
const ref = { engine: XCHK.ENGINE_VERSION, runtime: `Node ${process.version} (V8 ${process.versions.v8})`, recorded: new Date().toISOString(), rtol: XCHK.RTOL, atol: XCHK.ATOL, probe: XCHK.probe(), cases };
writeFileSync('src/server/engine/xbref.ts', `export { APP_VERSION } from "@/shared/version";\nimport "server-only";\nexport const XB_REF = ${JSON.stringify(ref)};\n`);
console.log('xbref.ts written:', Object.keys(cases).join(', '));
