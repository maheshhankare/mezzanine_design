import { Prepared } from './model';
import { LoadCase, MemberLoad, NodalLoad, SolveResult } from './types';
import { routeAvailability } from '../../shared/codeRegister';

/**
 * Imperfections for the second-order frame analysis. Two mechanically equivalent representations, which must never be used together for the
 * same effect (that would count the imperfection twice):
 *
 *  – 'geometry': stress-free initial geometry error (nodal displacement + rotation field, global axes), passed as `SolveInput.imperfection`.
 *    The element formulation carries it only through the geometric term N·G(u+u0): the member is initially crooked, no bending stress.
 *  – 'loads': equivalent horizontal loads. For a sway (lean) imperfection φ0 the pair ±φ0·N at the ends of every compressed column member.
 *
 * The VALUES (φ0, e0/L, which members, which combinations) are user inputs. IS 800:2007 gives no explicit geometric imperfection values for the
 * frame analysis (only the notional forces of 4.3.6): see `resolveImperfectionSource`.
 */

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => { const n = Math.hypot(...a); return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0]; };

/** node indices (internal division nodes included) of a member, in order along the member */
function memberNodeSequence(ps: Prepared, memberId: number): number[] {
  const els = (ps.memberElements.get(memberId) ?? []).map((i) => ps.elements[i]).sort((a, b) => a.x0 - b.x0);
  if (!els.length) return [];
  return [els[0].n1, ...els.map((e) => e.n2)];
}

/** Stress-free initial geometry error: a nodal field (translations; global axes) plus per-element local components. Pass both to the solver. */
export interface GeometricImperfection {
  /** SolveInput.imperfection */
  nodal: Float64Array;
  /** SolveInput.elementImperfection */
  elements: Map<number, Float64Array>;
}

const localOf = (R: number[][], v: V3): V3 => [dot(R[0] as V3, v), dot(R[1] as V3, v), dot(R[2] as V3, v)];

/**
 * Sway (lean) imperfection as initial geometry. `sets` are continuous column lines (member ids; e.g. an RSTAB "set of members"), φ0 the inclination
 * [-], `direction` a horizontal unit vector, `up` the vertical unit vector pointing upwards.
 *
 *  scope 'columns' (default): ONLY the column members are tilted, each element independently, in element-local components: the upper end is
 *    displaced by φ0·Δh·dir relative to the lower end and both ends rotate by ω = φ0·(up × dir), i.e. a straight tilted element without curvature.
 *    Through the geometric term this is exactly the equivalent load pair ±φ0·N at the element ends (with the CURRENT N, not a frozen one), the
 *    imperfection that RSTAB's "inclination on a set of members" represents. Nothing else in the structure is displaced.
 *  scope 'structure': the whole building leans ("shear building"): every node at height h above the foot is displaced by φ0·h·dir, so floors
 *    move rigidly; the column elements get the end rotations of a straight tilt. Braces and beams then also see the lean (their chord changes), so
 *    this is a different imperfection model with different results.
 */
export function swayGeometry(ps: Prepared, sets: number[][], phi0: number, direction: V3, up: V3 = [0, 0, 1], scope: 'columns' | 'structure' = 'columns'): GeometricImperfection {
  const nodal = new Float64Array(ps.nDof), elements = new Map<number, Float64Array>();
  const d = unit(direction), z = unit(up), w = cross(z, d);
  const pos = (n: number): V3 => [ps.coords[3 * n], ps.coords[3 * n + 1], ps.coords[3 * n + 2]];
  const h = (n: number) => dot(pos(n), z);
  const setNodes = [...new Set(sets.flatMap((set) => set.flatMap((m) => memberNodeSequence(ps, m))))];
  if (!setNodes.length) return { nodal, elements };
  if (scope === 'structure') {
    const foot = h(setNodes.reduce((a, b) => (h(b) < h(a) ? b : a)));
    for (let n = 0; n < ps.nNodes; n++) for (let k = 0; k < 3; k++) nodal[6 * n + k] = phi0 * Math.max(0, h(n) - foot) * d[k];
  }
  for (const set of sets) for (const m of set) for (const ei of ps.memberElements.get(m) ?? []) {
    const e = ps.elements[ei]; if (e.kind !== 'beam') continue;
    const wl = localOf(e.R, w), loc = new Float64Array(12);
    for (let k = 0; k < 3; k++) { loc[3 + k] = phi0 * wl[k]; loc[9 + k] = phi0 * wl[k]; }
    if (scope === 'columns') { const dl = localOf(e.R, d), dh = h(e.n2) - h(e.n1); for (let k = 0; k < 3; k++) loc[6 + k] = phi0 * dh * dl[k]; }
    elements.set(ei, loc);
  }
  return { nodal, elements };
}

/**
 * Bow (member curvature) imperfection as initial geometry: w(x) = e0·sin(πx/L) perpendicular to the member in the direction `direction`
 * (projected perpendicular to the member axis), e0 = e0OverL·L, given independently for every element of the member in element-local components
 * (the joints of the member are not touched). Needs at least 4 elements per member for a good sine; slopes are the exact slope of the sine.
 */
export function bowGeometry(ps: Prepared, memberIds: number[], e0OverL: number, direction: V3): GeometricImperfection {
  const nodal = new Float64Array(ps.nDof), elements = new Map<number, Float64Array>();
  for (const id of memberIds) {
    const eis = (ps.memberElements.get(id) ?? []).slice().sort((a, b) => ps.elements[a].x0 - ps.elements[b].x0);
    if (eis.length < 3) continue; // fewer elements cannot carry a bow
    const last = ps.elements[eis[eis.length - 1]];
    const L = last.x0 + last.L;
    const axis: V3 = [ps.elements[eis[0]].R[0][0], ps.elements[eis[0]].R[0][1], ps.elements[eis[0]].R[0][2]];
    const dir = unit(direction), t = dot(dir, axis);
    const nPerp = unit([dir[0] - t * axis[0], dir[1] - t * axis[1], dir[2] - t * axis[2]]);
    if (!nPerp[0] && !nPerp[1] && !nPerp[2]) continue; // direction parallel to the member axis
    const e0 = e0OverL * L, rotAxis = cross(axis, nPerp);
    for (const ei of eis) {
      const e = ps.elements[ei], nl = localOf(e.R, nPerp), wl = localOf(e.R, rotAxis), loc = new Float64Array(12);
      [[0, e.x0], [6, e.x0 + e.L]].forEach(([o, x]) => {
        const wv = e0 * Math.sin((Math.PI * x) / L), sl = ((e0 * Math.PI) / L) * Math.cos((Math.PI * x) / L);
        for (let k = 0; k < 3; k++) { loc[o + k] = wv * nl[k]; loc[o + 3 + k] = sl * wl[k]; }
      });
      elements.set(ei, loc);
    }
  }
  return { nodal, elements };
}

/** Sum of geometric imperfections (nodal fields add, element components add). */
export function addImperfections(...parts: (GeometricImperfection | null | undefined)[]): GeometricImperfection | null {
  const f = parts.filter((x): x is GeometricImperfection => !!x);
  if (!f.length) return null;
  const nodal = new Float64Array(f[0].nodal.length), elements = new Map<number, Float64Array>();
  for (const p of f) {
    for (let i = 0; i < nodal.length; i++) nodal[i] += p.nodal[i];
    for (const [k, v] of p.elements) { const c = elements.get(k) ?? new Float64Array(v.length); for (let i = 0; i < v.length; i++) c[i] += v[i]; elements.set(k, c); }
  }
  return { nodal, elements };
}

/**
 * Equivalent horizontal loads of a sway imperfection φ0: every compressed column member (`memberIds`, N from a FIRST-ORDER gravity analysis
 * `gravity`) gives +φ0·N·dir at its upper node and −φ0·N·dir at its lower node. At a joint where a vertical load is introduced the sum is
 * φ0 times that load. N is frozen at the first-order value (the geometric imperfection uses the current N: the two differ by the N change).
 */
export function swayLoads(ps: Prepared, gravity: SolveResult, memberIds: number[], phi0: number, direction: V3, up: V3 = [0, 0, 1]): NodalLoad[] {
  const d = unit(direction), z = unit(up);
  const N = new Map<number, number>();
  for (const e of gravity.elements) if (!N.has(e.member)) N.set(e.member, e.stations[0][1]); // tension positive
  const acc = new Map<number, V3>();
  const add = (node: number, s: number) => { const c = acc.get(node) ?? [0, 0, 0]; acc.set(node, [c[0] + s * d[0], c[1] + s * d[1], c[2] + s * d[2]]); };
  for (const id of memberIds) {
    const m = ps.model.members.find((x) => x.id === id); if (!m || m.type !== 'beam') continue;
    const a = ps.model.nodes.find((n) => n.id === m.n1)!, b = ps.model.nodes.find((n) => n.id === m.n2)!;
    const comp = -(N.get(id) ?? 0);
    const topIsB = dot([b.x, b.y, b.z], z) > dot([a.x, a.y, a.z], z);
    add(topIsB ? m.n2 : m.n1, phi0 * comp); add(topIsB ? m.n1 : m.n2, -phi0 * comp);
  }
  return [...acc.entries()].map(([node, v]) => ({ node, f: [v[0], v[1], v[2], 0, 0, 0] }));
}

export type ImperfectionMode = 'loads' | 'geometry';
export interface ImperfectionSettings {
  /** sway: 'notional' = the IS 800 4.3.6 notional forces (the only code representation), otherwise a user-defined value */
  sway?: { mode: 'notional' | ImperfectionMode; source: 'code' | 'user' };
  /** member bow: IS 800 gives no value for the frame analysis, so it is always user-defined */
  bow?: { mode: ImperfectionMode };
  /** the same imperfection is ALSO represented by notional / equivalent horizontal loads defined elsewhere (e.g. in a load case) */
  notionalLoadsInLoadCases?: boolean;
}

export interface ImperfectionCheck {
  /** false: the settings cannot be used (a method that IS 800 does not provide as a code value) */
  allowed: boolean;
  label: 'provisional' | 'user-defined' | 'blocked';
  blocked: string[];
  warnings: string[];
}

/**
 * Decides whether the requested imperfections can be produced under IS 800:2007. Code values are never invented: IS 800 has no explicit geometric imperfection
 * provisions in the frame analysis (only the notional forces of 4.3.6), so geometry and bow are available as USER-DEFINED values only.
 */
export function resolveImperfectionSource(s: ImperfectionSettings): ImperfectionCheck {
  const blocked: string[] = [], warnings: string[] = [];
  let label: ImperfectionCheck['label'] = 'user-defined';
  if (s.sway) {
    if (s.sway.source === 'code') {
      if (s.sway.mode !== 'notional') blocked.push('IS 800 gives no provisions for an explicit geometric sway imperfection or imperfection loads other than the notional forces of 4.3.6; use the notional forces or mark the imperfection user-defined.');
      else { const a = routeAvailability('is800.notional-loads'); if (a.state === 'blocked') blocked.push(...a.reasons); else { label = 'provisional'; warnings.push(...a.reasons.map((r) => `provisional: ${r}`)); } }
    } else if (s.sway.mode === 'notional') blocked.push('the notional forces of 4.3.6 are code values: mark the source "code".');
  }
  if (s.notionalLoadsInLoadCases && s.sway) warnings.push('Notional / equivalent horizontal loads are already in the load cases and a sway imperfection is generated here: the same imperfection would be applied twice.');
  if (s.sway?.source === 'user' && s.sway.mode === 'geometry') warnings.push('A user-defined geometric sway together with the IS 800 notional forces counts the practical imperfections twice.');
  if (s.bow) warnings.push('Member bow is user-defined (IS 800 gives no frame-analysis value); a bow combined with a sway imperfection is a project decision.');
  if (s.sway?.mode === 'loads' && s.bow?.mode === 'geometry') warnings.push('Sway as loads with bow as geometry: the two representations see the member N differently (frozen vs current); use one representation or document why mixing is intended.');
  if (blocked.length) label = 'blocked';
  return { allowed: blocked.length === 0, label, blocked, warnings };
}

/**
 * Equivalent horizontal forces of a bow imperfection e0 of a compressed member (a mechanical equivalence, not a code provision): a uniform load q = 8 N e0/L²
 * over the length with end forces 4 N e0/L in the opposite sense (they equilibrate q·L), for a PARABOLIC bow. N from a first-order analysis (`gravity`).
 * `direction` is projected perpendicular to the member axis; the loads act towards the bow. The half-sine geometry of bowGeometry has a different shape
 * (about 1.5 % apart in the second-order mid moment at P = 0.5 P_cr).
 */
export function bowEquivalentLoads(ps: Prepared, gravity: SolveResult, members: { id: number; e0OverL: number }[], direction: V3): { lc: LoadCase; applied: { member: number; N: number; L: number; q: number; endForce: number }[] } {
  const Ntens = new Map<number, number>();
  for (const e of gravity.elements) if (!Ntens.has(e.member)) Ntens.set(e.member, e.stations[0][1]);
  const member: MemberLoad[] = [], nodal: NodalLoad[] = [], applied: { member: number; N: number; L: number; q: number; endForce: number }[] = [];
  for (const { id, e0OverL } of members) {
    if (!(e0OverL > 0 && e0OverL <= 0.02)) throw new Error(`member ${id}: e0/L must be in (0, 0.02]`);
    const m = ps.model.members.find((x) => x.id === id); if (!m) throw new Error(`member ${id} not found`);
    const a = ps.model.nodes.find((n) => n.id === m.n1)!, b = ps.model.nodes.find((n) => n.id === m.n2)!;
    const axis = unit([b.x - a.x, b.y - a.y, b.z - a.z]), L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const N = -(Ntens.get(id) ?? 0);
    if (!(N > 0)) continue; // only compressed members
    const d = unit(direction), t = dot(d, axis);
    const n = unit([d[0] - t * axis[0], d[1] - t * axis[1], d[2] - t * axis[2]]);
    if (!(n[0] || n[1] || n[2])) throw new Error(`member ${id}: the bow direction is parallel to the member axis`);
    const e0 = e0OverL * L, q = (8 * N * e0) / (L * L), F = (4 * N * e0) / L;
    member.push({ member: id, q: [q * n[0], q * n[1], q * n[2]], system: 'global' });
    nodal.push({ node: m.n1, f: [-F * n[0], -F * n[1], -F * n[2], 0, 0, 0] }, { node: m.n2, f: [-F * n[0], -F * n[1], -F * n[2], 0, 0, 0] });
    applied.push({ member: id, N, L, q, endForce: F });
  }
  return { lc: { id: 'BOW', name: 'equivalent bow forces (parabolic)', member, nodal }, applied };
}
