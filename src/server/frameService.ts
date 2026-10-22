import { randomUUID } from 'node:crypto';
import type { FrameStore, StoredProject } from './frameStore';
import { loadFrameProject, validateFrameProject, type FrameProjectData } from '../shared/frameProject';
import { validateSettings, type AnalysisSettings } from '../shared/analysisSettings';
import { modelFingerprint, runFrameProject, type RunResult } from './frame/run';

/**
 * The workflow behind the frame API: create / save a project, run the analysis and design on the SAVED project, store the run, read it back.
 * No part of it depends on Next.js, so the same code is tested with an in-memory store and used with PostgreSQL.
 */
export class ServiceError extends Error { constructor(public status: number, message: string, public extra?: Record<string, unknown>) { super(message); } }

/** Parses incoming project JSON: schema check, settings migration (never silent), structural validation. */
export function parseProject(raw: any): { project: FrameProjectData; flags: string[]; migrated: boolean } {
  if (!raw || typeof raw !== 'object' || raw.schema !== 'frame-project-1') throw new ServiceError(422, 'Not a frame project (schema "frame-project-1" expected)');
  for (const k of ['frame', 'design', 'loadCases', 'combinations', 'up']) if (!(k in raw)) throw new ServiceError(422, `The project data lack "${k}"`);
  const { project, migrated, flags } = loadFrameProject(raw);
  const issues = validateFrameProject(project).filter((i) => !/has no design data/.test(i.message));
  if (issues.length) throw new ServiceError(422, 'The project data are not valid; nothing was saved', { issues: issues.slice(0, 50), total: issues.length });
  return { project, flags, migrated };
}

export const projectName = (p: FrameProjectData) => (p.meta?.name || 'Frame project').slice(0, 200);

export async function createFrameProject(store: FrameStore, userId: string, raw: any) {
  const { project, flags, migrated } = parseProject(raw);
  const stored = await store.createProject(userId, projectName(project), project, modelFingerprint(project));
  return { id: stored.id, revision: stored.revision, migrated, flags, reviewRequired: project.settings.review.required };
}

export interface SaveOptions {
  /** the user has reviewed the IS 800 settings of a migrated project and confirms them */
  confirmSettings?: boolean;
}

export async function saveFrameProject(store: FrameStore, userId: string, id: string, expectedRevision: number, raw: any, opts: SaveOptions = {}) {
  const { project, flags, migrated } = parseProject(raw);
  if (opts.confirmSettings) {
    // the review can be confirmed only if everything else in the settings is valid: confirming never bypasses a validation error
    const probe: AnalysisSettings = { ...project.settings, review: { required: false, reasons: [] } };
    const v = validateSettings(probe);
    if (!v.ok) throw new ServiceError(422, 'The settings cannot be confirmed: they contain errors', { errors: v.errors });
    project.settings = { ...probe, review: { required: false, reasons: [], confirmedAt: new Date().toISOString() } };
  }
  const prev = await store.getProject(id, userId);
  if (!prev) throw new ServiceError(404, 'Project not found');
  const fp = modelFingerprint(project);
  const saved = await store.updateProject(id, userId, expectedRevision, projectName(project), project, fp);
  if (!saved) throw new ServiceError(409, 'The project was changed by someone else: reload it before saving');
  return { id, revision: saved.revision, migrated, flags, modelChanged: prev.modelFingerprint !== fp, reviewRequired: project.settings.review.required };
}

export async function readFrameProject(store: FrameStore, userId: string, id: string) {
  const p = await store.getProject(id, userId);
  if (!p) throw new ServiceError(404, 'Project not found');
  // stored settings of an earlier version are migrated on every read: an old project cannot silently carry a removed design route
  const { project, migrated, flags } = loadFrameProject(p.data);
  return { stored: p, project, migrated, flags };
}

export interface RunOutcome { runId: string | null; ok: boolean; blocked: string[]; summary: RunResult['summary'] | null; label: string; modelRevision: number }

/** Runs the analysis and design on the stored project and stores the run with the settings actually used. */
export async function runStoredProject(store: FrameStore, userId: string, id: string): Promise<RunOutcome> {
  const { stored, project } = await readFrameProject(store, userId, id);
  const runId = randomUUID();
  const res = runFrameProject(project, { projectId: stored.id, projectName: stored.name, modelRevision: stored.revision, runId });
  if (!res.record) return { runId: null, ok: false, blocked: res.blocked, summary: null, label: 'blocked', modelRevision: stored.revision };
  const run = await store.addRun({
    projectId: stored.id, userId, modelRevision: stored.revision, modelFingerprint: res.record.identity.modelFingerprint, engineVersion: res.record.identity.engineVersion,
    status: res.ok ? 'completed' : 'not-converged', label: res.record.label, settings: res.record.settingsUsed, summary: res.summary, record: res.record,
  });
  return { runId: run.id, ok: res.ok, blocked: [], summary: res.summary, label: res.record.label, modelRevision: stored.revision };
}

/** the runs of a project, each marked current or belonging to an earlier model */
export async function listRunsWithStatus(store: FrameStore, userId: string, id: string) {
  const p = await store.getProject(id, userId);
  if (!p) throw new ServiceError(404, 'Project not found');
  const runs = await store.listRuns(id);
  return runs.map((r) => ({ ...r, current: r.modelFingerprint === p.modelFingerprint, note: r.modelFingerprint === p.modelFingerprint ? 'current model' : `earlier model revision ${r.modelRevision} (the model or the analysis / design settings have changed since)` }));
}

export async function readRun(store: FrameStore, userId: string, runId: string) {
  const r = await store.getRun(runId, userId);
  if (!r) throw new ServiceError(404, 'Run not found');
  const p = await store.getProject(r.projectId, userId);
  return { run: r, current: !!p && p.modelFingerprint === r.modelFingerprint };
}

export type { StoredProject };
