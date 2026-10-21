import type { LoadCase, NodalLoad } from '../types';

/**
 * IS 800:2007 analysis provisions that were read in the official text and checked on the page images (register: src/shared/codeRegister.ts,
 * ids IS800-*). Independent of the EN 1993 route: nothing here uses a Eurocode equation or factor. Member design (Sections 7-9) is NOT here.
 */

/** one floor / roof level of the structure with the vertical loads that act there */
export interface NotionalLevel {
  id: string;
  /** nodes of the level with the FACTORED vertical load (dead + imposed, N, positive magnitude) introduced at each node */
  nodes: { node: number; vertical: number }[];
}

export const IS800_NOTIONAL_FRACTION = 0.005; // 4.3.6: 0.5 percent

export interface NotionalResult {
  level: string;
  /** 4.3.6: 0.5 % of the factored dead + vertical imposed load at the level [N] */
  total: number;
  loads: NodalLoad[];
}

/**
 * 4.3.6: the notional horizontal force of one level, equal to 0.5 % of the factored dead load plus vertical imposed loads applied at that level.
 * Distribution to the nodes of the level: in proportion to their vertical load (ASSUMPTION, register IS800-4.3.6-dist: the clause is silent).
 * direction: horizontal unit vector.
 */
export function is800NotionalLoads(level: NotionalLevel, direction: [number, number, number]): NotionalResult {
  const d = Math.hypot(...direction);
  if (!(d > 0)) throw new Error('IS 800 4.3.6: the direction of the notional force is a zero vector');
  if (Math.abs(direction[2]) > 1e-9 * d) throw new Error('IS 800 4.3.6.1: notional forces are horizontal; the direction has a vertical component');
  for (const n of level.nodes) if (!(n.vertical >= 0) || !Number.isFinite(n.vertical)) throw new Error(`IS 800 4.3.6: level ${level.id}, node ${n.node}: the factored vertical load must be a non-negative number`);
  const sum = level.nodes.reduce((s, n) => s + n.vertical, 0);
  if (!(sum > 0)) throw new Error(`IS 800 4.3.6: level ${level.id} carries no vertical load; no notional force can be derived`);
  const total = IS800_NOTIONAL_FRACTION * sum;
  const u = direction.map((v) => v / d);
  return { level: level.id, total, loads: level.nodes.filter((n) => n.vertical > 0).map((n) => { const f = (total * n.vertical) / sum; return { node: n.node, f: [f * u[0], f * u[1], 0, 0, 0, 0] as NodalLoad['f'] }; }) };
}

/**
 * 4.3.6.1: notional forces act on the whole structure, at the roof and all floor levels, in both orthogonal directions, ONE DIRECTION AT A TIME.
 * One load case per direction (X, Y) and sense (+/−: the clause does not state the sense; both are generated, ASSUMPTION documented).
 * The cases contain the notional forces ONLY; they are combined with the factored gravity cases by the caller ("simultaneously with factored gravity loads").
 */
export function is800NotionalLoadCases(levels: NotionalLevel[], senses: 'both' | 'positive' = 'both'): { lc: LoadCase; total: number; direction: string }[] {
  const out: { lc: LoadCase; total: number; direction: string }[] = [];
  const dirs: [string, [number, number, number]][] = [['+X', [1, 0, 0]], ['-X', [-1, 0, 0]], ['+Y', [0, 1, 0]], ['-Y', [0, -1, 0]]];
  for (const [name, d] of dirs) {
    if (senses === 'positive' && name[0] === '-') continue;
    const parts = levels.map((l) => is800NotionalLoads(l, d));
    out.push({ lc: { id: `NL${name}`, name: `IS 800 4.3.6 notional forces ${name}`, nodal: parts.flatMap((p) => p.loads) }, total: parts.reduce((s, p) => s + p.total, 0), direction: name });
  }
  return out;
}

export interface NotionalContext {
  /** the notional force is used when considering overturning or overall instability (4.3.6.2 a) */
  checkingOverturningOrOverallInstability?: boolean;
  /** combined with other horizontal (lateral) loads, e.g. wind or earthquake (4.3.6 and 4.3.6.2 b) */
  withOtherLateralLoads?: boolean;
  /** combined with temperature effects (4.3.6.2 c) */
  withTemperatureEffects?: boolean;
  /** the notional force is taken to contribute to the net shear on the foundation (4.3.6.2 d) */
  contributesToFoundationShear?: boolean;
}

/** 4.3.6 and 4.3.6.2 (a)-(d): in which situations the notional force must NOT be used. */
export function is800NotionalLoadApplicability(c: NotionalContext): { allowed: boolean; violations: string[] } {
  const v: string[] = [];
  if (c.checkingOverturningOrOverallInstability) v.push('IS 800 4.3.6.2(a): the notional force shall not be applied when considering overturning or overall instability.');
  if (c.withOtherLateralLoads) v.push('IS 800 4.3.6 / 4.3.6.2(b): the notional force shall not be combined with other horizontal (lateral) loads such as wind and earthquake.');
  if (c.withTemperatureEffects) v.push('IS 800 4.3.6.2(c): the notional force shall not be combined with temperature effects.');
  if (c.contributesToFoundationShear) v.push('IS 800 4.3.6.2(d): the notional force shall not be taken to contribute to the net shear on the foundation.');
  return { allowed: v.length === 0, violations: v };
}

/**
 * 4.3.6.2(d): net shear on the foundation WITHOUT the notional force. `reactionsOnStructure` = sum of the horizontal support reactions (force of
 * the supports on the structure, N); `notionalTotal` = resultant of all applied notional forces (N). The notional forces are in equilibrium with the
 * support reactions, so the foundation shear of all OTHER loads is  −ΣR − ΣH_notional.
 */
export function is800FoundationShearWithoutNotional(reactionsOnStructure: [number, number], notionalTotal: [number, number]): [number, number] {
  return [-reactionsOnStructure[0] - notionalTotal[0], -reactionsOnStructure[1] - notionalTotal[1]];
}

/** 4.3.6.3: the sway effect of notional load under the gantry load case need not be considered if height / lateral width < 1. */
export function is800GantryNotionalExempt(height: number, lateralWidth: number): boolean {
  if (!(height > 0) || !(lateralWidth > 0)) throw new Error('IS 800 4.3.6.3: height and lateral width must be positive');
  return height / lateralWidth < 1;
}

/**
 * 4.4.2 / 4.4.3.1: where the moment amplification factor C_y or C_z is greater than 1.4 a second-order elastic analysis per Annex B shall be carried out;
 * up to 1.4 first-order analysis with moment amplification is permitted. (The factor itself is NOT computed here: register IS800-4.4.2, outstanding.)
 */
export function is800SecondOrderRequired(Cy: number, Cz: number): { secondOrderRequired: boolean; reason: string } {
  if (!Number.isFinite(Cy) || !Number.isFinite(Cz)) throw new Error('IS 800 4.4.2: C_y and C_z must be numbers');
  const req = Cy > 1.4 || Cz > 1.4;
  return { secondOrderRequired: req, reason: req ? `C_y = ${Cy}, C_z = ${Cz}: at least one is greater than 1.4, a second-order elastic analysis per Annex B shall be carried out (4.4.2, 4.4.3.1).` : `C_y = ${Cy}, C_z = ${Cz}: not greater than 1.4, first-order analysis with moment amplification is permitted (4.4.3.1 a).` };
}

export interface StoreyDeflection {
  /** storey height h [mm] */
  h: number;
  /** horizontal deflection of the top / bottom of the storey due to the combined gravity and notional loads (linear elastic analysis) [mm] */
  deltaTop: number;
  deltaBottom: number;
}

/**
 * Annex B-3.2, deflection method: λcr = 1 / (200 φ_s,max), φ_s = (δ_u − δ_L)/h. This is the code's approximate method (an estimate, not the
 * rational whole-frame buckling analysis of 4.6.2 b); the deflections come from an ORDINARY linear analysis with the notional forces of 4.3.6 at each floor.
 */
export function is800LambdaCrDeflection(storeys: StoreyDeflection[]): { lambdaCr: number; sway: number[]; governing: number } {
  if (!storeys.length) throw new Error('IS 800 B-3.2: no storey given');
  const sway = storeys.map((s, i) => { if (!(s.h > 0)) throw new Error(`IS 800 B-3.2: storey ${i + 1} height must be positive`); return Math.abs(s.deltaTop - s.deltaBottom) / s.h; });
  const max = Math.max(...sway);
  if (!(max > 0)) throw new Error('IS 800 B-3.2: all sway indices are zero; λcr is not defined by the deflection method');
  return { lambdaCr: 1 / (200 * max), sway, governing: sway.indexOf(max) };
}
