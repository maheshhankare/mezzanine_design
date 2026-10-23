import { route, readFrameProjectBody, audit, HttpError } from '@/server/http';
import { pgFrameStore } from '@/server/frameStorePg';
import { createFrameProject, ServiceError } from '@/server/frameService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const wrap = async <T,>(f: () => Promise<T>): Promise<T> => { try { return await f(); } catch (e) { if (e instanceof ServiceError) throw new HttpError(e.status, e.message, e.extra); throw e; } };

// GET /api/frame/projects: the signed-in user's frame projects (no model data).
export const GET = route({ auth: 'user' }, async ({ user }) => ({ projects: await pgFrameStore.listProjects(user.id) }));

// POST /api/frame/projects: create a frame project from project data (schema "frame-project-1"). Settings of an older version are migrated and flagged for review.
export const POST = route({ auth: 'user' }, async ({ req, user }) => {
  const body = await readFrameProjectBody(req);
  const out = await wrap(() => createFrameProject(pgFrameStore, user.id, body.project ?? body));
  await audit(user, 'frame.create', req, out.id, {});
  return out;
});
