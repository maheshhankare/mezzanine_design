import { route, rateLimit } from '@/server/http';
import { XCHK } from '@/server/engine/xcheck';
import { APP_VERSION } from '@/shared/version';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Versions and the server-side self-test: the calculation engine is checked against the recorded reference cases (no engine code is sent to the browser).
export const GET = route({ auth: 'user' }, async () => ({
  application: 'C-Section Beam System Designer',
  appVersion: APP_VERSION,
  engineVersion: XCHK.ENGINE_VERSION,
  projectFormat: `${XCHK.FORMAT} v${XCHK.FORMAT_VERSION}`,
  referenceSet: XCHK.REF ? `${Object.keys(XCHK.REF.cases).length} cases recorded with ${XCHK.REF.runtime}, engine ${XCHK.REF.engine}` : 'not embedded',
  mathProbe: XCHK.hash(JSON.stringify(XCHK.probe())),
  mathProbeReference: XCHK.REF && XCHK.REF.probe ? XCHK.hash(JSON.stringify(XCHK.REF.probe)) : null,
  tolerance: XCHK.RTOL,
}));

export const POST = route({ auth: 'user' }, async ({ user }) => {
  rateLimit('selftest:' + user.id, 4, 60_000);
  const rows: any[] = [];
  for (const g = XCHK.selfTest(); ; ) {
    const r = g.next();
    if (r.done) break;
    rows.push(r.value);
  }
  return { rows, pass: rows.every((x) => /^IDENTICAL|^MATCH/.test(x.verdict)), tolerance: XCHK.RTOL };
});
