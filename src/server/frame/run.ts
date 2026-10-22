import { createHash } from 'node:crypto';
import type { FrameModel, LoadCase, NodalLoad } from './types';
import { prepare, type Prepared } from './model';
import { solveFrame, sectionForcesAt } from './solve';
import { localAxes } from './element';
import { swayLoads, swayGeometry, bowEquivalentLoads, bowGeometry, addImperfections, resolveImperfectionSource } from './imperfection';
import { is800NotionalLoads, type NotionalLevel } from './codes/is800';
import { designHollowMember, pendingMember, type MemberDesignResult, type Station, type SectionKind } from './design/member';
import { buildCalculationRecord, type AppliedImperfection, type CalculationRecord, type CombinationSummary, type DesignSummary, type RunIdentity } from './record';
import { validateSettings, type AnalysisSettings } from '../../shared/analysisSettings';
import { validateFrameProject, type FrameProjectData, type Combination } from '../../shared/frameProject';

/**
 * The project-to-results workflow on the server: project data and settings → validation → solver (every combination) → IS 800 member design from the
 * actual analysis results and member properties → calculation record. Nothing is read from anywhere but the project data; nothing is hard-coded.
 */
export const ENGINE_VERSION = 'frame-1.0 (IS 800:2007 design, solver Theory II)';

export const fingerprint = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16);
/** fingerprint of everything that determines the analysis result (model, loads, combinations, settings that affect the numbers) */
export function modelFingerprint(p: FrameProjectData) {
  const s = p.settings;
  return fingerprint({ frame: p.frame, design: p.design, loadCases: p.loadCases, combinations: p.combinations, up: p.up, s: { order: s.order, theory: s.theory, shear: s.shearDeformation, k: s.stiffnessFactors, sway: s.sway, bow: s.bow, design: s.design } });
}

const DIRS: Record<string, [number, number, number]> = { '+X': [1, 0, 0], '-X': [-1, 0, 0], '+Y': [0, 1, 0], '-Y': [0, -1, 0] };
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export interface RunResult {
  ok: boolean;
  blocked: string[];
  record: CalculationRecord | null;
  summary: { combinations: CombinationSummary[]; design: DesignSummary | null; label: string; elapsedMs: number };
  /** member design results in full (checks with details), per member and combination */
  designResults: MemberDesignResult[];
  /** the raw solver results per combination (for tests and in-process consumers; never serialised) */
  raw?: Map<string, ReturnType<typeof solveFrame>>;
}

/** model after the settings are applied: stiffness factors on every member, shear areas removed when shear deformation is off */
export function applySettings(p: FrameProjectData): FrameModel {
  const s = p.settings;
  const sections = Object.fromEntries(Object.entries(p.frame.sections).map(([k, x]) => [k, s.shearDeformation ? x : { A: x.A, Iy: x.Iy, Iz: x.Iz, J: x.J }]));
  const members = p.frame.members.map((m) => ({ ...m, fEA: (m.fEA ?? 1) * s.stiffnessFactors.EA, fEI: (m.fEI ?? 1) * s.stiffnessFactors.EI, fGJ: (m.fGJ ?? 1) * s.stiffnessFactors.GJ }));
  return { ...p.frame, sections, members };
}

/** vertical members (axis parallel to `up`) grouped into continuous column lines by their plan position */
function columnSets(frame: FrameModel, up: number[]): number[][] {
  const node = new Map(frame.nodes.map((n) => [n.id, n]));
  const by = new Map<string, number[]>();
  for (const m of frame.members) {
    if (m.type !== 'beam') continue;
    const a = node.get(m.n1)!, b = node.get(m.n2)!, d = [b.x - a.x, b.y - a.y, b.z - a.z], L = Math.hypot(...d);
    if (L === 0 || Math.abs(Math.abs(dot(d, up)) / L - 1) > 1e-6) continue;
    const key = [a.x - up[0] * dot([a.x, a.y, a.z], up), a.y - up[1] * dot([a.x, a.y, a.z], up), a.z - up[2] * dot([a.x, a.y, a.z], up)].map((v) => Math.round(v * 10) / 10).join('|');
    (by.get(key) ?? by.set(key, []).get(key)!).push(m.id);
  }
  return [...by.values()];
}

/** factored vertical (gravity) load at each node [N, along −up] from nodal loads, member loads and self-weight of the combination */
export function factoredVerticalNodeLoads(p: FrameProjectData, combo: Combination): Map<number, number> {
  const out = new Map<number, number>(); const add = (n: number, v: number) => out.set(n, (out.get(n) ?? 0) + v);
  const node = new Map(p.frame.nodes.map((n) => [n.id, n])), member = new Map(p.frame.members.map((m) => [m.id, m]));
  const down = [-p.up[0], -p.up[1], -p.up[2]];
  for (const { lc, factor } of combo.factors) {
    const load = p.loadCases.find((l) => l.id === lc)!;
    for (const n of load.nodal ?? []) add(n.node, factor * dot(n.f.slice(0, 3), down));
    for (const ml of load.member ?? []) {
      const m = member.get(ml.member)!, a = node.get(m.n1)!, b = node.get(m.n2)!, d = [b.x - a.x, b.y - a.y, b.z - a.z], L = Math.hypot(...d);
      let q = ml.q;
      if (ml.system === 'local') { const R = localAxes(d[0], d[1], d[2], m.beta ?? 0); q = [0, 1, 2].map((k) => ml.q[0] * R[0][k] + ml.q[1] * R[1][k] + ml.q[2] * R[2][k]) as [number, number, number]; }
      const f = factor * dot(q, down) * L / 2; add(m.n1, f); add(m.n2, f);
    }
    if (load.selfWeight) for (const m of p.frame.members) {
      if (m.type !== 'beam' && m.type !== 'truss') continue;
      const a = node.get(m.n1)!, b = node.get(m.n2)!, L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), sec = p.frame.sections[m.section], mat = p.frame.materials[m.material];
      if (!sec || !mat?.w) continue;
      const f = factor * dot(load.selfWeight, down) * sec.A * mat.w * L / 2; add(m.n1, f); add(m.n2, f);
    }
  }
  return out;
}

/** floor levels: heights (along up) of the horizontal members; the nodes of a level are the nodes at that height */
export function floorLevels(p: FrameProjectData): { height: number; nodes: number[] }[] {
  const node = new Map(p.frame.nodes.map((n) => [n.id, n])); const h = (id: number) => Math.round(dot([node.get(id)!.x, node.get(id)!.y, node.get(id)!.z], p.up) * 1000) / 1000;
  const heights = new Set<number>();
  for (const m of p.frame.members) { if (m.type !== 'beam') continue; const a = node.get(m.n1)!, b = node.get(m.n2)!; const d = [b.x - a.x, b.y - a.y, b.z - a.z], L = Math.hypot(...d); if (L > 0 && Math.abs(dot(d, p.up)) / L < 1e-6) heights.add(h(m.n1)); }
  return [...heights].sort((x, y) => x - y).map((height) => ({ height, nodes: p.frame.nodes.filter((n) => h(n.id) === height).map((n) => n.id) }));
}

export function notionalLevels(p: FrameProjectData, combo: Combination): NotionalLevel[] {
  const v = factoredVerticalNodeLoads(p, combo);
  const levels: NotionalLevel[] = [];
  for (const lv of floorLevels(p)) {
    const nodes = lv.nodes.map((n) => ({ node: n, vertical: Math.max(0, v.get(n) ?? 0) })).filter((n) => n.vertical > 0);
    if (nodes.length) levels.push({ id: `h=${lv.height}`, nodes });
  }
  return levels;
}

export function designSectionKind(p: FrameProjectData, sectionId: string): SectionKind { return (p.design.sections[sectionId]?.kind ?? 'unknown') as SectionKind; }

/** Runs the whole workflow. `identity` carries the project id, model revision and run id that the caller assigns. */
export function runFrameProject(p: FrameProjectData, identity: Omit<RunIdentity, 'modelFingerprint' | 'engineVersion' | 'createdAt'> & { createdAt?: string }): RunResult {
  const t0 = Date.now(), s: AnalysisSettings = p.settings;
  const empty = (blocked: string[]): RunResult => ({ ok: false, blocked, record: null, summary: { combinations: [], design: null, label: 'blocked', elapsedMs: Date.now() - t0 }, designResults: [] });
  const v = validateSettings(s);
  if (!v.ok) return empty(v.errors.map((e) => `${e.field}: ${e.message}`));
  const pv = validateFrameProject(p).filter((i) => !/has no design data/.test(i.message));
  if (pv.length) return empty(pv.map((i) => `${i.path}: ${i.message}`));
  if (s.sway || s.bow) {
    const r = resolveImperfectionSource({ sway: s.sway ? { mode: s.sway.mode === 'notional-loads' ? 'notional' : s.sway.mode === 'geometry' ? 'geometry' : 'loads', source: s.sway.source } : undefined, bow: s.bow ? { mode: s.bow.mode === 'geometry' ? 'geometry' : 'loads' } : undefined, notionalLoadsInLoadCases: s.imperfectionLoadsInLoadCases });
    if (!r.allowed) return empty(r.blocked);
  }

  const model = applySettings(p);
  const ps = prepare(model, 1);
  if (ps.messages.length) return empty(ps.messages);
  const lcById = new Map(p.loadCases.map((l) => [l.id, l]));
  const columns = columnSets(p.frame, p.up);
  const colMembers = columns.flat();
  const imperfections: AppliedImperfection[] = [];
  const combSummaries: CombinationSummary[] = [];
  const results = new Map<string, ReturnType<typeof solveFrame>>();
  const warnings: string[] = [];

  for (const c of p.combinations) {
    const terms = c.factors.map((f) => ({ lc: lcById.get(f.lc)!, factor: f.factor }));
    let imperfection: Float64Array | null = null, elementImperfection: Map<number, Float64Array> | null = null, impNote: string | undefined;
    const extra: { lc: LoadCase; factor: number }[] = [];
    if (c.sway && s.sway) {
      const dir = DIRS[c.sway];
      if (s.sway.mode === 'notional-loads') {
        const levels = notionalLevels(p, c);
        if (!levels.length) warnings.push(`${c.id}: no floor level carries vertical load: no notional force was generated`);
        const nodal: NodalLoad[] = []; let total = 0;
        for (const lv of levels) { const r = is800NotionalLoads(lv, dir); nodal.push(...r.loads); total += r.total; }
        extra.push({ lc: { id: `NL-${c.id}`, name: 'IS 800 4.3.6 notional forces', nodal }, factor: 1 });
        imperfections.push({ kind: 'notional', source: 'code', clause: '4.3.6, 4.3.6.1', representation: 'equivalent loads', magnitude: `0.5 % of the factored vertical load per level, ${levels.length} level(s), total ${(total / 1e3).toFixed(2)} kN`, direction: c.sway, members: `levels ${levels.map((l) => l.id).join(', ')}`, combination: c.id, note: 'distribution over the nodes of a level in proportion to their vertical load (assumption, register IS800-4.3.6-dist)' });
        impNote = `notional forces ${(total / 1e3).toFixed(2)} kN along ${c.sway}`;
      } else if (s.sway.mode === 'equivalent-loads') {
        const g = solveFrame({ prepared: ps, combo: terms, options: { secondOrder: false } });
        const loads = swayLoads(ps, g, colMembers, s.sway.phi0!, dir, p.up);
        extra.push({ lc: { id: `SW-${c.id}`, name: 'equivalent sway loads (user-defined)', nodal: loads }, factor: 1 });
        imperfections.push({ kind: 'sway', source: 'user', representation: 'equivalent loads', magnitude: `φ0 = ${s.sway.phi0} (±φ0·N from the first-order gravity solution)`, direction: c.sway, members: `${colMembers.length} column members`, combination: c.id });
        impNote = `equivalent sway loads φ0 = ${s.sway.phi0}`;
      } else {
        const gm = swayGeometry(ps, columns, s.sway.phi0!, dir, p.up, 'columns');
        imperfection = gm.nodal; elementImperfection = gm.elements;
        imperfections.push({ kind: 'sway', source: 'user', representation: 'geometry', magnitude: `φ0 = ${s.sway.phi0} (stress-free lean of the column elements)`, direction: c.sway, members: `${colMembers.length} column members`, combination: c.id });
        impNote = `geometric sway φ0 = ${s.sway.phi0}`;
      }
    }
    if (s.bow && c.sway) {
      const bowDir = DIRS[c.sway];
      if (s.bow.mode === 'geometry') {
        const bg = bowGeometry(ps, colMembers, s.bow.e0OverL!, bowDir);
        const merged = addImperfections(imperfection ? { nodal: imperfection, elements: elementImperfection ?? new Map() } : null, bg);
        if (merged) { imperfection = merged.nodal; elementImperfection = merged.elements; }
        imperfections.push({ kind: 'bow', source: 'user', representation: 'geometry', magnitude: `e0/L = ${s.bow.e0OverL} (half sine)`, direction: c.sway, members: `${colMembers.length} column members`, combination: c.id });
      } else {
        const g = solveFrame({ prepared: ps, combo: terms, options: { secondOrder: false } });
        const bl = bowEquivalentLoads(ps, g, colMembers.map((id) => ({ id, e0OverL: s.bow!.e0OverL! })), bowDir);
        extra.push({ lc: bl.lc, factor: 1 });
        imperfections.push({ kind: 'bow', source: 'user', representation: 'equivalent loads', magnitude: `e0/L = ${s.bow.e0OverL} (parabolic: q = 8 N e0/L², end forces 4 N e0/L)`, direction: c.sway, members: `${bl.applied.length} compressed column members`, combination: c.id });
      }
    }
    const res = solveFrame({ prepared: ps, combo: [...terms, ...extra], imperfection, elementImperfection, options: { secondOrder: s.order === 'second', theory: s.theory, maxIterations: s.maxIterations, steps: s.loadSteps } });
    results.set(c.id, res);
    let maxD: CombinationSummary['maxDisplacement'] = null;
    for (const [node, d] of res.displacement) for (let k = 0; k < 3; k++) if (!maxD || Math.abs(d[k]) > Math.abs(maxD.value)) maxD = { node, value: d[k], direction: 'XYZ'[k] };
    const rs: [number, number, number] = [0, 0, 0]; for (const r of res.reactions.values()) { rs[0] += r[0]; rs[1] += r[1]; rs[2] += r[2]; }
    combSummaries.push({ id: c.id, name: c.name, status: res.status, converged: res.converged, iterations: res.totalIterations, steps: res.steps.length, message: res.message, maxDisplacement: maxD, reactionSum: rs, imperfection: impNote });
  }

  // ---- IS 800 member design from the actual results
  let design: DesignSummary | undefined; const designResults: MemberDesignResult[] = [];
  if (s.design.enabled) {
    const memberLen = new Map(p.frame.members.map((m) => { const a = p.frame.nodes.find((n) => n.id === m.n1)!, b = p.frame.nodes.find((n) => n.id === m.n2)!; return [m.id, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)] as const; }));
    for (const c of p.combinations) {
      const res = results.get(c.id)!;
      const byMember = new Map<number, typeof res.elements>(); for (const e of res.elements) (byMember.get(e.member) ?? byMember.set(e.member, []).get(e.member)!).push(e);
      for (const m of p.frame.members) {
        const kind = designSectionKind(p, m.section);
        if (m.type !== 'beam') { designResults.push(pendingMember(m.id, c.id, 'angle', 'axial-only member (brace): the IS 800 angle / tension design (6.3, 7.5) is not implemented')); continue; }
        const ds = p.design.sections[m.section];
        if (!res.converged) { designResults.push(pendingMember(m.id, c.id, kind, 'the analysis did not converge: no design on unconverged results')); continue; }
        if (!ds || ds.kind !== 'rhs') { designResults.push(pendingMember(m.id, c.id, kind)); continue; }
        const mat = p.design.materials[ds.material], els = (byMember.get(m.id) ?? []).sort((a, b) => a.x0! - b.x0!);
        const L = memberLen.get(m.id)!, stations: Station[] = [];
        for (const el of els) for (const xl of [0, el.L! / 2, el.L!]) { const f = sectionForcesAt(el, xl, true); stations.push({ x: el.x0! + xl, N: f[0], Vy: f[1], Vz: f[2], T: f[3], My: f[4], Mz: f[5] }); }
        designResults.push(designHollowMember({ memberId: m.id, combination: c.id, geom: { b: ds.b, h: ds.h, t: ds.t, rOuter: ds.rOuter, rInner: ds.rInner }, material: mat, manufacture: ds.manufacture, length: L, KLy: s.design.kLy! * L, KLz: s.design.kLz! * L, stations, cm: s.design.cm, supportCase: s.design.supportCase }));
      }
    }
    const reasons = new Map<string, number>(); let failing = 0, maxRatio: number | null = null, designed = 0, pend = 0;
    const members: DesignSummary['members'] = designResults.map((r) => {
      if (r.status === 'pending' && !r.governing) { pend++; const k = r.notes[0] ?? 'pending'; reasons.set(k, (reasons.get(k) ?? 0) + 1); } else designed++;
      if (r.status === 'fail') failing++;
      const g = r.governing; if (g?.ratio !== null && g?.ratio !== undefined) maxRatio = Math.max(maxRatio ?? 0, g.ratio);
      return { member: r.memberId, combination: r.combination, status: r.status, label: r.label, governing: g?.name ?? null, ratio: g?.ratio ?? null, clause: g?.clause ?? null, x: (r.checks.find((c) => c === g) as any)?.x ?? null };
    });
    design = { enabled: true, membersDesigned: designed, membersPending: pend, maxRatio, failing, members: members.filter((m) => m.ratio !== null || m.status === 'pending').slice(0, 5000), pendingReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })) };
  }

  const identityFull: RunIdentity = { ...identity, createdAt: identity.createdAt ?? new Date().toISOString(), modelFingerprint: modelFingerprint(p), engineVersion: ENGINE_VERSION };
  const record = buildCalculationRecord({ identity: identityFull, project: p, settingsUsed: s, combinations: combSummaries, imperfections, design, modelWarnings: warnings });
  return { ok: combSummaries.every((c) => c.converged), blocked: [], record, summary: { combinations: combSummaries, design: design ?? null, label: record.label, elapsedMs: Date.now() - t0 }, designResults, raw: results };
}

export type { Prepared };
