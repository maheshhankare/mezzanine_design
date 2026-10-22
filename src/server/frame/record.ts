import type { SolveResult } from './types';
import { sectionForcesAt } from './solve';
import { CODE_REGISTER, IS800_EDITION, verificationWarnings } from '../../shared/codeRegister';
import { DESIGN_STANDARD, DESIGN_STANDARD_TITLE, validateSettings, type AnalysisSettings, type ValidationResult } from '../../shared/analysisSettings';
import type { FrameProjectData } from '../../shared/frameProject';
import type { MemberDesignResult } from './design/member';

/**
 * Calculation record (the data of the report): everything that makes one analysis and design run traceable, with analysis results, verified checks,
 * provisional checks and pending items kept apart. A converged solver run is NOT presented as a code-compliance verdict. A record belongs to one model
 * revision and one run; when the model changes, earlier records stay and are identified as belonging to an earlier revision.
 */

/** IS 800 B-2.2(a): the design bending moment is the maximum bending moment in the length of the member, taken directly from the second-order analysis. */
export function governingMoment(res: SolveResult, memberId: number, pointsPerElement = 25): { My: number; Mz: number; resultant: number; x: number; stationsChecked: number } {
  const els = res.elements.filter((e) => e.member === memberId).sort((a, b) => (a.x0 ?? 0) - (b.x0 ?? 0));
  let best = { My: 0, Mz: 0, resultant: 0, x: 0, stationsChecked: 0 };
  for (const el of els) {
    if (el.kind !== 'beam' || !el.L) continue;
    for (let i = 0; i <= pointsPerElement; i++) {
      const x = (el.L * i) / pointsPerElement;
      const f = sectionForcesAt(el, x, false);
      const My = f[4], Mz = f[5], R = Math.hypot(My, Mz);
      best.stationsChecked++;
      if (R > best.resultant) best = { ...best, My, Mz, resultant: R, x: (el.x0 ?? 0) + x };
    }
  }
  return best;
}

export interface AppliedImperfection {
  kind: 'sway' | 'bow' | 'notional';
  source: 'code' | 'user';
  clause?: string;
  representation: 'geometry' | 'equivalent loads';
  magnitude: string;
  direction: string;
  members: string;
  combination?: string;
  note?: string;
}

export interface RunIdentity { projectId: string; projectName: string; modelRevision: number; runId: string; createdAt: string; modelFingerprint: string; engineVersion: string }

export interface CombinationSummary {
  id: string; name: string; status: string; converged: boolean; iterations: number; steps: number; message: string;
  maxDisplacement: { node: number; value: number; direction: string } | null;
  reactionSum: [number, number, number];
  imperfection?: string;
}

export interface DesignSummary {
  enabled: boolean;
  membersDesigned: number;
  membersPending: number;
  maxRatio: number | null;
  failing: number;
  /** compact per-member result: governing check, ratio, status, label */
  members: { member: number; combination: string; status: string; label: string; governing: string | null; ratio: number | null; clause: string | null; x: number | null }[];
  pendingReasons: { reason: string; count: number }[];
}

export interface RecordInput {
  identity: RunIdentity;
  project: FrameProjectData;
  settingsUsed: AnalysisSettings;
  combinations: CombinationSummary[];
  imperfections: AppliedImperfection[];
  keyResults?: { name: string; value: number | string; unit: string }[];
  design?: DesignSummary;
  convergenceEvidence?: string[];
  benchmark?: string[];
  extraWarnings?: string[];
  modelWarnings?: string[];
}

export interface RecordSection { n: number; title: string; lines: string[] }
export interface CalculationRecord {
  identity: RunIdentity;
  standard: typeof DESIGN_STANDARD;
  label: 'blocked' | 'analysis-only' | 'provisional' | 'user-defined';
  sections: RecordSection[];
  validation: ValidationResult;
  settingsUsed: AnalysisSettings;
  design?: DesignSummary;
  markdown: string;
}

export const RECORD_TITLES = [
  'Project, model revision and run identification', 'Design standard and edition', 'Model and analysis assumptions', 'Solver formulation and analysis order',
  'Load cases and combinations', 'Material and section properties', 'Supports, member releases and stiffness factors', 'Imperfections',
  'Displacements, support reactions and member forces', 'IS 800 member design checks and utilisation', 'Stability and buckling checks, code references', 'RSTAB benchmark validation status',
  'Numerical convergence and mesh-refinement evidence', 'Verification status of the IS 800 provisions', 'Warnings, limitations and unresolved items',
] as const;

export function buildCalculationRecord(inp: RecordInput): CalculationRecord {
  const s = inp.settingsUsed, p = inp.project, v = validateSettings(s), id = inp.identity;
  const sec: RecordSection[] = RECORD_TITLES.map((title, k) => ({ n: k + 1, title, lines: [] }));
  const put = (n: number, ...l: string[]) => sec[n - 1].lines.push(...l);

  put(1, `Project: ${id.projectName} (${id.projectId})`, `Model revision: ${id.modelRevision}`, `Analysis run: ${id.runId}`, `Calculated: ${id.createdAt}`, `Model fingerprint: ${id.modelFingerprint}`, `Engine: ${id.engineVersion}`);
  put(2, `Design standard: ${DESIGN_STANDARD_TITLE}`, `Edition used for the checks: ${IS800_EDITION}`, 'IS 800:2007 is the only design standard of this application.');
  put(3, `Nodes: ${p.frame.nodes.length}; members: ${p.frame.members.length}; supports: ${p.frame.supports.length}`, `Shear deformation: ${s.shearDeformation ? 'on (printed shear areas)' : 'off'}`, 'Linear elastic material; small strains, moderate rotations; no warping DOF.');
  put(4, `Analysis order: ${s.order === 'second' ? 'second order (IS 800 Annex B-2)' : 'first order'}`, s.order === 'second' ? `Second-order theory: ${s.theory === 'II' ? 'Theory II: linear strains, geometric stiffness on the deformed geometry, global P-Δ and member P-δ through one term' : 'von Kármán (adds membrane coupling; not the code second-order analysis)'}` : 'First order: member design is not run on first-order results (IS 800 4.4.2).',
    `Iteration limit ${s.maxIterations} (reaching it is never treated as convergence); load steps ${s.loadSteps}`);
  put(5, ...p.loadCases.map((l) => `${l.id}: ${l.name ?? ''} (${(l.member?.length ?? 0)} member loads, ${(l.nodal?.length ?? 0)} nodal loads${l.selfWeight ? ', self-weight ' + l.selfWeight.join(',') : ''})`), ...p.combinations.map((c) => `${c.id} ${c.name}: ${c.factors.map((f) => `${f.factor} × ${f.lc}`).join(' + ')}${c.sway ? ` + sway imperfection ${c.sway}` : ''}`));
  put(6, ...Object.entries(p.frame.materials).map(([k, m]) => `Material ${k}: E = ${m.E} N/mm², G = ${m.G} N/mm²${m.E !== 200000 ? ' (IS 800 2.2.4.1: E = 200000 N/mm²; the value of the project model is used, as entered)' : ''}`), ...Object.entries(p.frame.sections).map(([k, x]) => `Section ${k}: A = ${x.A} mm², Iy = ${x.Iy} mm⁴, Iz = ${x.Iz} mm⁴, J = ${x.J} mm⁴${x.Ay ? `, Ay = ${x.Ay}, Az = ${x.Az} mm²` : ''}${p.design.sections[k] ? ` | design: ${p.design.sections[k].kind}` : ''}`),
    ...Object.entries(p.design.materials).map(([k, m]) => `Design material ${k}: f_y = ${m.fy}, f_u = ${m.fu}, E = ${m.E} N/mm²`));
  const rel = p.frame.members.filter((m) => m.rel1 || m.rel2).length;
  put(7, `Supports: ${p.frame.supports.length}; members with end releases: ${rel}`, `Global stiffness factors: EA ${s.stiffnessFactors.EA}, EI ${s.stiffnessFactors.EI}, GJ ${s.stiffnessFactors.GJ}`, `Members with their own factor: ${p.frame.members.filter((m) => (m.fEA ?? 1) !== 1 || (m.fEI ?? 1) !== 1 || (m.fGJ ?? 1) !== 1).length}`);
  if (inp.imperfections.length) for (const i of inp.imperfections) put(8, `${i.kind.toUpperCase()}${i.combination ? ' in ' + i.combination : ''} | source: ${i.source === 'code' ? 'IS 800' + (i.clause ? ' ' + i.clause : '') : 'USER-DEFINED (not a code value)'} | ${i.representation} | ${i.magnitude} | direction ${i.direction} | members: ${i.members}${i.note ? ' | ' + i.note : ''}`);
  else put(8, 'No imperfection is applied.');
  for (const c of inp.combinations) put(9, `${c.id}: status ${c.status}${c.converged ? '' : ' (NOT converged: ' + c.message + ')'}; ${c.iterations} iterations; reaction sum Fx ${(c.reactionSum[0] / 1e3).toFixed(2)}, Fy ${(c.reactionSum[1] / 1e3).toFixed(2)}, Fz ${(c.reactionSum[2] / 1e3).toFixed(2)} kN; max displacement ${c.maxDisplacement ? `${c.maxDisplacement.value.toFixed(2)} mm (node ${c.maxDisplacement.node}, ${c.maxDisplacement.direction})` : 'n/a'}${c.imperfection ? '; ' + c.imperfection : ''}`);
  for (const k of inp.keyResults ?? []) put(9, `${k.name}: ${typeof k.value === 'number' ? k.value.toPrecision(5) : k.value} ${k.unit}`);
  const d = inp.design;
  if (d?.enabled) {
    put(10, `Members designed: ${d.membersDesigned}; pending: ${d.membersPending}; failing (utilisation > 1): ${d.failing}; maximum utilisation ${d.maxRatio === null ? 'n/a' : d.maxRatio.toFixed(3)}`);
    const top = d.members.filter((m) => m.ratio !== null).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0)).slice(0, 15);
    for (const m of top) put(10, `member ${m.member} ${m.combination}: ${m.governing} ${m.ratio!.toFixed(3)} (${m.clause}${m.x !== null ? ', x = ' + m.x.toFixed(0) + ' mm' : ''}) [${m.status.toUpperCase()}, ${m.label}]`);
    for (const r of d.pendingReasons) put(10, `PENDING (${r.count} member results): ${r.reason}`);
  } else put(10, s.design.enabled ? 'The member design was requested but not run (see the warnings).' : 'The member design was not requested: this record contains structural analysis results only; no IS 800 design check was performed.');
  put(11, ...CODE_REGISTER.filter((i) => i.scope === 'stability' || i.scope === 'global-analysis' || i.scope === 'classification' || i.scope === 'resistance').filter((i) => i.status !== 'pending').map((i) => `${i.id} (${i.clause}): ${i.status}`));
  put(12, ...(inp.benchmark?.length ? inp.benchmark : ['Benchmark status: the solver is compared with the RSTAB reference model in docs/RSTAB_BENCHMARK.md (CO1 / CO2); no comparison is attached to this project run.']));
  put(13, ...(inp.convergenceEvidence?.length ? inp.convergenceEvidence : ['See docs/SECOND_ORDER.md section 7 for mesh refinement and sensitivity evidence of the benchmark model.']));
  put(14, ...CODE_REGISTER.map((i) => `${i.id} | ${i.clause} | ${i.status.toUpperCase()}${i.textVerified ? '' : ' (text not verified)'}${i.outstanding ? ' | outstanding: ' + i.outstanding : ''}`));
  const warn = [...v.errors.map((e) => `ERROR ${e.field}: ${e.message}`), ...v.warnings.map((w) => `warning ${w.field}: ${w.message}`), ...verificationWarnings({ features: v.usedFeatures }), ...(inp.modelWarnings ?? []), ...(inp.extraWarnings ?? [])];
  put(15, 'A converged analysis is not proof of design-code compliance. Agreement with RSTAB internal forces is not proof of IS 800 compliance.', ...warn);

  const anyBad = inp.combinations.some((c) => !c.converged);
  const label: CalculationRecord['label'] = anyBad || !v.ok ? 'blocked' : !d?.enabled ? 'analysis-only' : v.label === 'user-defined' ? 'user-defined' : 'provisional';
  const md = [`# Calculation record: ${id.projectName}`, '', `**Standard: ${DESIGN_STANDARD}. Result labelling: ${label.toUpperCase()}**`, '', `Model revision ${id.modelRevision} · run ${id.runId} · ${id.createdAt}`, '',
    ...sec.flatMap((x) => [`## ${x.n}. ${x.title}`, ...(x.lines.length ? x.lines.map((l) => `- ${l}`) : ['- (nothing to report)']), ''])].join('\n');
  return { identity: id, standard: DESIGN_STANDARD, label, sections: sec, validation: v, settingsUsed: s, design: d, markdown: md };
}
