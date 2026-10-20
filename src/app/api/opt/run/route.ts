import { route, readJson, rateLimit } from '@/server/http';
import { OPT } from '@/server/engine/opt';
import { OPTUI } from '@/server/engine/optui';
import { finishRun, prepareRun } from '@/server/optsession';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// The optimisation search, streamed as one JSON object per line: progress messages, then the final result.
// Closing the connection (Cancel in the browser) stops the search after the analysis in progress.
export const POST = route({ auth: 'user' }, async ({ req, user }) => {
  rateLimit('optrun:' + user.id, 12, 10 * 60_000);
  const body = await readJson(req, 4_000_000);
  const { I, h, setup } = prepareRun(body);
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => { try { controller.enqueue(enc.encode(JSON.stringify(o) + '\n')); } catch { /* client gone */ } };
      try {
        send({ t: 'p', pct: 0, msg: 'Validating the ranges and analysing the baseline…' });
        const g = OPT.run(setup.I0, setup.set, () => req.signal.aborted);
        for (;;) {
          const r = g.next();
          if (r.done) {
            const out = finishRun(body, I, h, r.value, setup.baseHash);
            send({ t: 'done', ...out, error: r.value && r.value.error ? String(r.value.error) : null });
            break;
          }
          send({ t: 'p', ...OPTUI.runProgress(setup.comps, r.value) });
          await new Promise((res) => setImmediate(res)); // let a cancel (aborted request) be noticed between analyses
        }
      } catch (e: any) {
        console.error('[opt.run]', e);
        send({ t: 'error', error: 'Optimisation stopped by an error: ' + (e && e.message ? e.message : e) });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
});
