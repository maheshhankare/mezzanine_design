import type { FrameModel, SolveResult } from './types';
import { sectionForcesAt } from './solve';
import { CODE_REGISTER, verificationWarnings, type CodeItem } from '../../shared/codeRegister';
import { validateSettings, type AnalysisSettings, type ValidationResult } from '../../shared/analysisSettings';

/**
 * Calculation record (report data) of a frame analysis: everything that makes the run traceable, with verified, provisional and pending content kept
 * apart. A converged solver run is NOT presented as a code-compliance verdict.
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
  /** how it enters the analysis */
  representation: 'geometry' | 'equivalent loads';
  magnitude: string; // e.g. "φ = 1/200"
  direction: string;
  members: string; // description / list
  note?: string;
}

export interface RecordInput {
  project: { name: string; engineer?: string; date?: string };
  settings: AnalysisSettings;
  model: FrameModel;
  loadCases: { id: string; description: string }[];
  combinations: { id: string; description: string; factors: { lc: string; factor: number }[] }[];
  imperfections: AppliedImperfection[];
  result?: SolveResult;
  /** quantities from the analysis worth reporting (name, value, unit) */
  keyResults?: { name: string; value: number | string; unit: string }[];
  convergenceEvidence?: string[];
  benchmark?: string[];
  utilisations?: { member: string; check: string; ratio: number; clause: string; verified: boolean }[];
  extraWarnings?: string[];
}

export interface RecordSection { n: number; title: string; lines: string[] }
export interface CalculationRecord {
  label: ValidationResult['label'];
  sections: RecordSection[];
  validation: ValidationResult;
  markdown: string;
}

export const RECORD_TITLES = [
  'Project information and design standard', 'Standard edition and National Annex', 'Model and analysis assumptions', 'Solver formulation and analysis order',
  'Load cases and combinations', 'Material and section properties', 'Supports, member releases and stiffness factors', 'Imperfections',
  'First-order and second-order results', 'Member design checks and utilisation', 'Stability-related calculations and code references', 'RSTAB benchmark comparison',
  'Numerical convergence and mesh-refinement evidence', 'Verification status of the code provisions', 'Warnings, limitations and outstanding decisions',
] as const;

const std = (s: AnalysisSettings) => (s.standard === 'IS800' ? 'IS 800:2007' : s.standard === 'EN1993' ? 'EN 1993-1-1' : 'none (user-defined)');
const row = (i: CodeItem) => `- ${i.id} | ${i.clause} | ${i.status.toUpperCase()}${i.textVerified ? '' : ' (text not verified)'} | implementation: ${i.implementation || 'none'} | test: ${i.validation || 'none'}${i.outstanding ? ' | outstanding: ' + i.outstanding : ''}`;

export function buildCalculationRecord(inp: RecordInput): CalculationRecord {
  const s = inp.settings, v = validateSettings(s), r = inp.result;
  const items = CODE_REGISTER.filter((i) => (s.standard === 'IS800' ? i.standard === 'IS 800' : s.standard === 'EN1993' ? i.standard === 'EN 1993-1-1' : false));
  const sec: RecordSection[] = RECORD_TITLES.map((title, k) => ({ n: k + 1, title, lines: [] }));
  const put = (n: number, ...l: string[]) => sec[n - 1].lines.push(...l);

  put(1, `Project: ${inp.project.name}`, `Engineer: ${inp.project.engineer ?? 'not given'}`, `Date: ${inp.project.date ?? 'not given'}`, `Design standard selected: ${std(s)}`);
  put(2, items[0] ? `Edition: ${items[0].edition}` : 'No design standard selected.',
    s.standard === 'EN1993' ? (s.nationalAnnex ? `National Annex: ${s.nationalAnnex.country} (${s.nationalAnnex.documentTitle || 'title not given'}); NDPs not set/verified: ${s.nationalAnnex.ndps.filter((n) => n.value === null || n.status !== 'verified').map((n) => n.id).join(', ') || 'none'}` : 'National Annex: NONE selected (none is assumed).') : 'National Annex: not applicable',
    ...(s.standard === 'EN1993' && s.acceptEurocodeTextValues ? ['Values printed in the Eurocode text are used where the National Annex would decide: PROVISIONAL.'] : []));
  put(3, `Nodes: ${inp.model.nodes.length}; members: ${inp.model.members.length}; supports: ${inp.model.supports.length}`, `Shear deformation: ${s.shearDeformation ? 'on (printed shear areas)' : 'off'}`, 'Linear elastic material; small strains, moderate rotations; no warping DOF (lateral-torsional buckling is not captured by the frame analysis).');
  put(4, `Analysis order: ${s.order === 'second' ? 'second order' : 'first order'}`, `Second-order theory: ${s.order === 'second' ? (s.theory === 'II' ? 'Theory II (linear strains, geometric stiffness on the deformed geometry): P-Δ and P-δ through the same geometric term N·G' : 'von Kármán (adds membrane coupling)') : 'not applicable'}`,
    `Iteration limit ${s.maxIterations} (reaching it is never treated as convergence); load steps ${s.loadSteps}`);
  put(5, ...inp.loadCases.map((l) => `${l.id}: ${l.description}`), ...inp.combinations.map((c) => `${c.id}: ${c.description} = ${c.factors.map((f) => `${f.factor} × ${f.lc}`).join(' + ')}`));
  put(6, ...Object.entries(inp.model.materials).map(([k, m]) => `Material ${k}: E = ${m.E} N/mm², G = ${m.G} N/mm²`), ...Object.entries(inp.model.sections).map(([k, x]) => `Section ${k}: A = ${x.A} mm², Iy = ${x.Iy} mm⁴, Iz = ${x.Iz} mm⁴, J = ${x.J} mm⁴${x.Ay ? `, Ay = ${x.Ay}, Az = ${x.Az} mm²` : ''}`));
  const rel = inp.model.members.filter((m) => m.rel1 || m.rel2).length;
  put(7, `Supports: ${inp.model.supports.length}; members with end releases: ${rel}`, `Global stiffness factors: EA ${s.stiffnessFactors.EA}, EI ${s.stiffnessFactors.EI}, GJ ${s.stiffnessFactors.GJ}`, `Member-level factors: ${inp.model.members.filter((m) => (m.fEA ?? 1) !== 1 || (m.fEI ?? 1) !== 1 || (m.fGJ ?? 1) !== 1).length} members with a factor other than 1`);
  if (inp.imperfections.length) for (const i of inp.imperfections) put(8, `${i.kind.toUpperCase()} | source: ${i.source === 'code' ? 'CODE' + (i.clause ? ' ' + i.clause : '') : 'USER-DEFINED (not a code value)'} | ${i.representation} | ${i.magnitude} | direction ${i.direction} | members: ${i.members}${i.note ? ' | ' + i.note : ''}`);
  else put(8, 'No imperfection is applied.');
  if (r) {
    put(9, `Status: ${r.status}${r.converged ? '' : ' (NOT converged: ' + r.message + ')'}`, `Iterations: ${r.totalIterations} in ${r.steps.length} load step(s)`, ...(inp.keyResults ?? []).map((k) => `${k.name}: ${typeof k.value === 'number' ? k.value.toPrecision(5) : k.value} ${k.unit}`));
  } else put(9, 'No analysis result attached.');
  if (inp.utilisations?.length) for (const u of inp.utilisations) put(10, `${u.member} | ${u.check} | ${u.ratio.toFixed(3)} | ${u.clause} | ${u.verified ? 'verified route' : 'PROVISIONAL'}`);
  else put(10, 'No member design check was performed: the member design clauses of the standard are not implemented (register: IS800-members / EN-6).');
  put(11, ...(items.filter((i) => i.scope === 'stability' || i.scope === 'global-analysis').map((i) => `${i.id} (${i.clause}): ${i.status}`)));
  put(12, ...(inp.benchmark?.length ? inp.benchmark : ['No benchmark comparison attached to this record. The RSTAB comparison of the solver is in docs/RSTAB_BENCHMARK.md.']));
  put(13, ...(inp.convergenceEvidence?.length ? inp.convergenceEvidence : ['No mesh-refinement evidence attached. See docs/SECOND_ORDER.md section 7.']));
  put(14, ...(items.length ? items.map(row) : ['No design standard selected: no code provision is claimed.']));
  const warn = [...v.errors.map((e) => `ERROR ${e.field}: ${e.message}`), ...v.warnings.map((w) => `warning ${w.field}: ${w.message}`),
    ...(s.standard === 'IS800' ? verificationWarnings({ route: 'IS', features: v.usedFeatures }) : s.standard === 'EN1993' ? verificationWarnings({ route: 'EN', annex: s.nationalAnnex, features: v.usedFeatures }) : []),
    ...(inp.extraWarnings ?? [])];
  put(15, 'A converged analysis is not proof of design-code compliance.', ...warn);
  const label = r && !r.converged ? 'blocked' : v.label;

  const md = [`# Calculation record: ${inp.project.name}`, '', `**Result labelling: ${label.toUpperCase()}**`, '',
    ...sec.flatMap((x) => [`## ${x.n}. ${x.title}`, ...(x.lines.length ? x.lines.map((l) => `- ${l}`) : ['- (nothing to report)']), ''])].join('\n');
  return { label, sections: sec, validation: v, markdown: md };
}
