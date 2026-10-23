import 'server-only';
import { q, q1 } from './db';
import type { FrameStore, StoredProject, StoredRun } from './frameStore';
import { isUuid } from './projects';

const proj = (r: any): StoredProject => ({ id: r.id, ownerId: r.owner_id, name: r.name, data: r.data, revision: r.revision, modelFingerprint: r.model_fingerprint, createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString() });
const runOf = (r: any): StoredRun => ({ id: r.id, projectId: r.project_id, userId: r.user_id, modelRevision: r.model_revision, modelFingerprint: r.model_fingerprint, engineVersion: r.engine_version, status: r.status, label: r.label, settings: r.settings, summary: r.summary, record: r.record, createdAt: new Date(r.created_at).toISOString() });

/** PostgreSQL implementation: every query is scoped to the owner; a project that belongs to somebody else does not exist for the caller. */
export const pgFrameStore: FrameStore = {
  async createProject(ownerId, name, data, fingerprint) {
    const r = await q1(`insert into frame_projects (owner_id, name, data, model_fingerprint) values ($1, $2, $3, $4) returning *`, [ownerId, name, JSON.stringify(data), fingerprint]);
    return proj(r);
  },
  async getProject(id, ownerId) { if (!isUuid(id)) return null; const r = await q1(`select * from frame_projects where id = $1 and owner_id = $2`, [id, ownerId]); return r ? proj(r) : null; },
  async updateProject(id, ownerId, expectedRevision, name, data, fingerprint) {
    if (!isUuid(id)) return null;
    const r = await q1(`update frame_projects set name = $4, data = $5, model_fingerprint = $6, revision = revision + 1, updated_at = now()
                         where id = $1 and owner_id = $2 and revision = $3 returning *`, [id, ownerId, expectedRevision, name, JSON.stringify(data), fingerprint]);
    return r ? proj(r) : null;
  },
  async listProjects(ownerId) {
    const rows = await q(`select id, owner_id, name, revision, model_fingerprint, created_at, updated_at from frame_projects where owner_id = $1 order by updated_at desc limit 200`, [ownerId]);
    return rows.map((r: any) => { const { data: _d, ...rest } = proj({ ...r, data: null }); return rest; });
  },
  async deleteProject(id, ownerId) { if (!isUuid(id)) return false; return (await q(`delete from frame_projects where id = $1 and owner_id = $2 returning id`, [id, ownerId])).length > 0; },
  async addRun(run) {
    const r = await q1(`insert into frame_runs (project_id, user_id, model_revision, model_fingerprint, engine_version, status, label, settings, summary, record)
                        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
      [run.projectId, run.userId, run.modelRevision, run.modelFingerprint, run.engineVersion, run.status, run.label, JSON.stringify(run.settings), JSON.stringify(run.summary), JSON.stringify(run.record)]);
    return runOf(r);
  },
  async listRuns(projectId) {
    if (!isUuid(projectId)) return [];
    const rows = await q(`select id, project_id, user_id, model_revision, model_fingerprint, engine_version, status, label, created_at from frame_runs where project_id = $1 order by created_at desc limit 100`, [projectId]);
    return rows.map((r: any) => { const { record: _r, settings: _s, summary: _m, ...rest } = runOf({ ...r, record: null, settings: null, summary: null }); return rest; });
  },
  async getRun(runId, ownerId) {
    if (!isUuid(runId)) return null;
    const r = await q1(`select r.* from frame_runs r join frame_projects p on p.id = r.project_id where r.id = $1 and p.owner_id = $2`, [runId, ownerId]);
    return r ? runOf(r) : null;
  },
};
