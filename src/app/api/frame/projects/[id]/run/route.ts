import { route, audit, rateLimit, HttpError } from '@/server/http';
import { pgFrameStore } from '@/server/frameStorePg';
import { runStoredProject, ServiceError } from '@/server/frameService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// POST /api/frame/projects/:id/run: validate the SAVED project and settings, run the solver, the IS 800 design checks and the calculation record; store the run.
export const POST = route({ auth: 'user' }, async ({ req, params, user }) => {
  const { id } = await params;
  rateLimit(`frame-run:${user.id}`, 6, 60_000);
  try {
    const out = await runStoredProject(pgFrameStore, user.id, id);
    await audit(user, 'frame.run', req, id, { run: out.runId, label: out.label });
    if (out.blocked.length) throw new HttpError(422, 'The run is blocked: the project or its settings are not valid', { blocked: out.blocked });
    return out;
  } catch (e) { if (e instanceof ServiceError) throw new HttpError(e.status, e.message, e.extra); throw e; }
});
