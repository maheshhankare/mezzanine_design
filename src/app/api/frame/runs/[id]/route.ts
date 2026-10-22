import { route, HttpError } from '@/server/http';
import { pgFrameStore } from '@/server/frameStorePg';
import { readRun, ServiceError } from '@/server/frameService';

export const dynamic = 'force-dynamic';

// GET /api/frame/runs/:id: the stored calculation record of a run, with `current` = false when the model has changed since the run.
export const GET = route({ auth: 'user' }, async ({ params, user }) => {
  const { id } = await params;
  try { const { run, current } = await readRun(pgFrameStore, user.id, id); return { run, current }; } catch (e) { if (e instanceof ServiceError) throw new HttpError(e.status, e.message); throw e; }
});
