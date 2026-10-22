import type { FrameModel, LoadCase } from '../server/frame/types';
import { type AnalysisSettings, migrateSettings, SETTINGS_VERSION } from './analysisSettings';

/**
 * A frame project: the structural model, the data the IS 800 member design needs about each section, the load cases and combinations, and the analysis /
 * design settings. This is exactly what is stored with a project and what the solver and the design read: nothing is taken from anywhere else.
 */
export type DesignSection =
  | { kind: 'rhs'; b: number; h: number; t: number; rOuter: number; rInner: number; material: string; manufacture: 'hollow-hot-rolled' | 'hollow-cold-formed' | 'welded-box' }
  | { kind: 'cold-formed' | 'open' | 'angle'; material: string; description: string };

export interface DesignMaterial { fy: number; fu: number; E: number; description?: string }

export interface Combination {
  id: string;
  name: string;
  factors: { lc: string; factor: number }[];
  /** the gravity combination in which the sway imperfection acts (notional forces / equivalent loads / geometry) and its direction (one at a time) */
  sway?: '+X' | '-X' | '+Y' | '-Y';
}

export interface FrameProjectData {
  schema: 'frame-project-1';
  meta: { name: string; description?: string };
  frame: FrameModel;
  design: { sections: Record<string, DesignSection>; materials: Record<string, DesignMaterial> };
  loadCases: LoadCase[];
  combinations: Combination[];
  /** the vertical direction of the model: 'up' = +Z or -Z is up (RSTAB models have Z downwards, i.e. up = [0, 0, -1]) */
  up: [number, number, number];
  settings: AnalysisSettings;
}

export interface ProjectIssue { path: string; message: string }

/** Structural validation of a project before anything is run. Returns every problem found. */
export function validateFrameProject(p: FrameProjectData): ProjectIssue[] {
  const issues: ProjectIssue[] = [];
  const bad = (path: string, message: string) => issues.push({ path, message });
  if (p.schema !== 'frame-project-1') bad('schema', 'unknown project schema');
  const ids = new Set<number>();
  for (const n of p.frame.nodes) { if (ids.has(n.id)) bad(`nodes.${n.id}`, 'duplicate node id'); ids.add(n.id); if (![n.x, n.y, n.z].every(Number.isFinite)) bad(`nodes.${n.id}`, 'non-finite coordinates'); }
  const mids = new Set<number>();
  for (const m of p.frame.members) {
    if (mids.has(m.id)) bad(`members.${m.id}`, 'duplicate member id'); mids.add(m.id);
    if (!ids.has(m.n1) || !ids.has(m.n2)) bad(`members.${m.id}`, 'unknown end node');
    if (!p.frame.sections[m.section]) bad(`members.${m.id}`, `unknown section ${m.section}`);
    if (!p.frame.materials[m.material]) bad(`members.${m.id}`, `unknown material ${m.material}`);
  }
  if (!p.frame.supports.length) bad('supports', 'the model has no support');
  for (const s of p.frame.supports) if (!ids.has(s.node)) bad(`supports.${s.node}`, 'support at an unknown node');
  const lcs = new Set(p.loadCases.map((l) => l.id));
  if (lcs.size !== p.loadCases.length) bad('loadCases', 'duplicate load case ids');
  for (const c of p.combinations) for (const f of c.factors) { if (!lcs.has(f.lc)) bad(`combinations.${c.id}`, `unknown load case ${f.lc}`); if (!Number.isFinite(f.factor)) bad(`combinations.${c.id}`, 'non-finite factor'); }
  if (!p.combinations.length) bad('combinations', 'no load combination');
  for (const [k, s] of Object.entries(p.design.sections)) if (!p.design.materials[s.material]) bad(`design.sections.${k}`, `unknown design material ${s.material}`);
  for (const m of p.frame.members) if (m.type === 'beam' && !p.design.sections[m.section]) bad(`members.${m.id}`, `section ${m.section} has no design data (kind, material): the design reports the member pending`);
  const u = p.up; if (!(Math.abs(Math.hypot(...u) - 1) < 1e-9)) bad('up', 'the vertical direction must be a unit vector');
  return issues.filter((i) => !/has no design data/.test(i.message) || true);
}

/** Loads stored project JSON of any version and brings its settings to the current schema (migration never silently reinterprets old values). */
export function loadFrameProject(raw: any): { project: FrameProjectData; migrated: boolean; flags: string[] } {
  const m = migrateSettings(raw?.settings);
  return { project: { ...raw, settings: m.settings } as FrameProjectData, migrated: m.migrated, flags: m.flags };
}

export { SETTINGS_VERSION };
