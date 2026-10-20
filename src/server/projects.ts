import 'server-only';
import { q, q1 } from './db';
import { HttpError } from './http';
import type { SessionUser } from './auth/session';
import { compute, compactResults } from './calc';
import { XCHK } from './engine/xcheck';

export type Access = 'owner' | 'editor' | 'viewer';
const RANK: Record<Access, number> = { viewer: 1, editor: 2, owner: 3 };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

/**
 * The single authorisation point for project data. A project is reachable only by its owner or a member added by the owner;
 * everyone else (administrators included) gets "not found", so the existence of other users' projects is not revealed.
 */
export async function loadProject(id: string, user: SessionUser, need: Access = 'viewer') {
  if (!isUuid(id)) throw new HttpError(404, 'Project not found');
  const p = await q1<any>(
    `select p.*, u.name as owner_name, u.email as owner_email, m.role as member_role
       from projects p join users u on u.id = p.owner_id
       left join project_members m on m.project_id = p.id and m.user_id = $2
      where p.id = $1 and (p.owner_id = $2 or m.user_id is not null)`,
    [id, user.id],
  );
  if (!p) throw new HttpError(404, 'Project not found');
  const access: Access = p.owner_id === user.id ? 'owner' : p.member_role;
  if (RANK[access] < RANK[need]) throw new HttpError(403, 'You do not have permission to do this on this project');
  return { p, access };
}

export const publicProject = (p: any, access: Access) => ({
  id: p.id, name: p.name, reference: p.reference, customer: p.customer, customer_contact: p.customer_contact, site: p.site, notes: p.notes,
  inputs: p.inputs, revision: p.revision, access, owner: { name: p.owner_name, email: p.owner_email },
  design_status: p.design_status, max_utilisation: p.max_utilisation, n_fail: p.n_fail, n_review: p.n_review,
  calculated_at: p.calculated_at, engine_version: p.engine_version, created_at: p.created_at, updated_at: p.updated_at,
});

export type Meta = { name: string; reference: string; customer: string; customer_contact: string; site: string; notes: string };

/** Recomputes on the server from the validated inputs (never from client-supplied results) and returns the columns to store. */
export function calcForStorage(inputs: Record<string, any>) {
  const res = compute(inputs);
  const c = compactResults(res);
  return { status: c.status, maxEta: c.maxEta, nFail: c.nFail, nReview: c.nReview, summary: c.summary, fingerprint: XCHK.fingerprint(inputs), engine: XCHK.ENGINE_VERSION, res };
}

export async function recordCalculation(run: typeof q, projectId: string, userId: string, revision: number, c: ReturnType<typeof calcForStorage>) {
  await run(
    `insert into calculations (project_id, user_id, revision, engine_version, input_fingerprint, design_status, max_utilisation, n_fail, n_review)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [projectId, userId, revision, c.engine, c.fingerprint, c.status, c.maxEta, c.nFail, c.nReview],
  );
}
