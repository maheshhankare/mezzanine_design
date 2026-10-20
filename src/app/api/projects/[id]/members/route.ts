import { route, readJson, audit, HttpError } from '@/server/http';
import { q, q1 } from '@/server/db';
import { loadProject, isUuid } from '@/server/projects';

export const dynamic = 'force-dynamic';

// Authorised users of a project (the owner manages them).
export const GET = route({ auth: 'user' }, async ({ user, params }) => {
  const { p } = await loadProject(params.id, user, 'viewer');
  const members = await q(
    `select u.id, u.name, u.email, m.role, m.created_at from project_members m join users u on u.id = m.user_id where m.project_id = $1 order by u.name`,
    [p.id],
  );
  return { owner: { name: p.owner_name, email: p.owner_email }, members };
});

export const POST = route({ auth: 'user' }, async ({ req, user, params }) => {
  const { p } = await loadProject(params.id, user, 'owner');
  const body = await readJson(req, 10_000);
  const email = String(body.email || '').trim().toLowerCase();
  const role = body.role === 'editor' ? 'editor' : body.role === 'viewer' ? 'viewer' : null;
  if (!role) throw new HttpError(400, 'role must be viewer or editor');
  const target = await q1<any>('select id, active from users where lower(email) = $1', [email]);
  if (!target || !target.active) throw new HttpError(404, 'No active user with that e-mail');
  if (target.id === user.id) throw new HttpError(400, 'You already own this project');
  await q(
    `insert into project_members (project_id, user_id, role, added_by) values ($1, $2, $3, $4)
     on conflict (project_id, user_id) do update set role = excluded.role`,
    [p.id, target.id, role, user.id],
  );
  await audit(user, 'project.share', req, p.id, { email, role });
  return { ok: true };
});

export const DELETE = route({ auth: 'user' }, async ({ req, user, params }) => {
  const { p } = await loadProject(params.id, user, 'owner');
  const uid = req.nextUrl.searchParams.get('userId') || '';
  if (!isUuid(uid)) throw new HttpError(400, 'userId required');
  await q('delete from project_members where project_id = $1 and user_id = $2', [p.id, uid]);
  await audit(user, 'project.unshare', req, p.id, { userId: uid });
  return { ok: true };
});
