import type { FrameProjectData } from '../shared/frameProject';

/** Persistence of frame projects and runs. The interface has an in-memory implementation (tests, development) and a PostgreSQL one (frameStorePg.ts). */
export interface StoredProject { id: string; ownerId: string; name: string; data: FrameProjectData; revision: number; modelFingerprint: string; createdAt: string; updatedAt: string }
export interface StoredRun {
  id: string; projectId: string; userId: string | null; modelRevision: number; modelFingerprint: string; engineVersion: string; status: string; label: string;
  settings: unknown; summary: unknown; record: unknown; createdAt: string;
}

export interface FrameStore {
  createProject(ownerId: string, name: string, data: FrameProjectData, fingerprint: string): Promise<StoredProject>;
  getProject(id: string, ownerId: string): Promise<StoredProject | null>;
  /** returns null when the revision does not match (somebody saved in between) */
  updateProject(id: string, ownerId: string, expectedRevision: number, name: string, data: FrameProjectData, fingerprint: string): Promise<StoredProject | null>;
  listProjects(ownerId: string): Promise<Omit<StoredProject, 'data'>[]>;
  deleteProject(id: string, ownerId: string): Promise<boolean>;
  addRun(run: Omit<StoredRun, 'id' | 'createdAt'>): Promise<StoredRun>;
  listRuns(projectId: string): Promise<Omit<StoredRun, 'record' | 'settings'>[]>;
  getRun(runId: string, ownerId: string): Promise<StoredRun | null>;
}

let counter = 0;
const uid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

export class MemoryFrameStore implements FrameStore {
  projects = new Map<string, StoredProject>();
  runs: StoredRun[] = [];
  async createProject(ownerId: string, name: string, data: FrameProjectData, fingerprint: string) {
    const now = new Date().toISOString(); const p: StoredProject = { id: uid(), ownerId, name, data: JSON.parse(JSON.stringify(data)), revision: 1, modelFingerprint: fingerprint, createdAt: now, updatedAt: now };
    this.projects.set(p.id, p); return p;
  }
  async getProject(id: string, ownerId: string) { const p = this.projects.get(id); return p && p.ownerId === ownerId ? JSON.parse(JSON.stringify(p)) : null; }
  async updateProject(id: string, ownerId: string, expectedRevision: number, name: string, data: FrameProjectData, fingerprint: string) {
    const p = this.projects.get(id); if (!p || p.ownerId !== ownerId || p.revision !== expectedRevision) return null;
    const n: StoredProject = { ...p, name, data: JSON.parse(JSON.stringify(data)), revision: p.revision + 1, modelFingerprint: fingerprint, updatedAt: new Date().toISOString() };
    this.projects.set(id, n); return JSON.parse(JSON.stringify(n));
  }
  async listProjects(ownerId: string) { return [...this.projects.values()].filter((p) => p.ownerId === ownerId).map(({ data: _d, ...rest }) => rest); }
  async deleteProject(id: string, ownerId: string) { const p = this.projects.get(id); if (!p || p.ownerId !== ownerId) return false; this.projects.delete(id); this.runs = this.runs.filter((r) => r.projectId !== id); return true; }
  async addRun(run: Omit<StoredRun, 'id' | 'createdAt'>) { const r: StoredRun = { ...run, id: uid(), createdAt: new Date().toISOString() }; this.runs.push(JSON.parse(JSON.stringify(r))); return r; }
  async listRuns(projectId: string) { return this.runs.filter((r) => r.projectId === projectId).map(({ record: _r, settings: _s, ...rest }) => rest).reverse(); }
  async getRun(runId: string, ownerId: string) { const r = this.runs.find((x) => x.id === runId); const p = r && this.projects.get(r.projectId); return r && p && p.ownerId === ownerId ? JSON.parse(JSON.stringify(r)) : null; }
}
