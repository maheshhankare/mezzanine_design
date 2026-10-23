import { route, readFrameProjectBody, audit, HttpError } from '@/server/http';
import { pgFrameStore } from '@/server/frameStorePg';
import { readFrameProject, saveFrameProject, listRunsWithStatus, ServiceError } from '@/server/frameService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const wrap = async <T,>(f: () => Promise<T>): Promise<T> => { try { return await f(); } catch (e) { if (e instanceof ServiceError) throw new HttpError(e.status, e.message, e.extra); throw e; } };

// GET /api/frame/projects/:id: the project (settings migrated if stored by an older version: `migrated`, `flags`) and its runs, each marked current / earlier model.
export const GET = route({ auth: 'user' }, async ({ params, user }) => {
  const { id } = await params;
  const r = await wrap(() => readFrameProject(pgFrameStore, user.id, id));
  const runs = await wrap(() => listRunsWithStatus(pgFrameStore, user.id, id));
  return { id, name: r.stored.name, revision: r.stored.revision, project: r.project, migrated: r.migrated, flags: r.flags, runs };
});

// PUT /api/frame/projects/:id { project, revision, confirmSettings? }: save (revision-checked). confirmSettings clears the review of migrated settings.
export const PUT = route({ auth: 'user' }, async ({ req, params, user }) => {
  const { id } = await params;
  const body = await readFrameProjectBody(req);
  if (!Number.isInteger(body.revision)) throw new HttpError(422, 'The revision of the project being saved is required');
  const out = await wrap(() => saveFrameProject(pgFrameStore, user.id, id, body.revision, body.project, { confirmSettings: body.confirmSettings === true }));
  await audit(user, 'frame.update', req, id, { confirm: body.confirmSettings === true });
  return out;
});

export const DELETE = route({ auth: 'user' }, async ({ req, params, user }) => {
  const { id } = await params;
  if (!(await pgFrameStore.deleteProject(id, user.id))) throw new HttpError(404, 'Project not found');
  await audit(user, 'frame.delete', req, id, {});
  return { deleted: true };
});
