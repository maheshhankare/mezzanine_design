import type { LoadCase, MemberLoad, NodalLoad } from '../types';
import type { Prepared } from '../model';
import type { SolveResult } from '../types';
import { EN_1993_1_1_NDP_IDS, type NationalAnnex } from '../../../shared/codeRegister';

/**
 * EN 1993-1-1:2005 (incl. corrigenda 2006/2009) analysis provisions read in the supplied text and checked on the page images (register ids EN-*).
 * Independent of the IS 800 route. The National Annex was NOT supplied: every NDP-dependent function takes its values from an `EnValues` object
 * whose origin is recorded; values taken from the Eurocode text itself are 'eurocode-text' and make the result PROVISIONAL.
 */

export type EnBucklingCurve = 'a0' | 'a' | 'b' | 'c' | 'd';
export type EnAnalysis = 'elastic' | 'plastic';

export interface EnValues {
  origin: 'national-annex' | 'eurocode-text';
  /** 'provisional' while any value comes from the Eurocode text instead of a verified National Annex */
  state: 'verified' | 'provisional';
  alphaCr: { elastic: number; plastic: number };
  phi0: number;
  /** Table 5.1: e0/L by curve, elastic and plastic analysis */
  bow: Record<EnAnalysis, Record<EnBucklingCurve, number>>;
  ltbBowK: number;
  annexCountry?: string;
}

/** EN 1993-1-1 Table 5.1 (p. 34, PDF p. 36): design value of initial local bow imperfection e0/L. RECOMMENDED values: the National Annex may choose others. */
export const EN_TABLE_5_1: Record<EnAnalysis, Record<EnBucklingCurve, number>> = {
  elastic: { a0: 1 / 350, a: 1 / 300, b: 1 / 250, c: 1 / 200, d: 1 / 150 },
  plastic: { a0: 1 / 300, a: 1 / 250, b: 1 / 200, c: 1 / 150, d: 1 / 100 },
};

/** the values printed in the Eurocode text (no National Annex): PROVISIONAL */
export function enValuesFromEurocodeText(): EnValues {
  return { origin: 'eurocode-text', state: 'provisional', alphaCr: { elastic: 10, plastic: 15 }, phi0: 1 / 200, bow: EN_TABLE_5_1, ltbBowK: 0.5 };
}

/**
 * Values from a National Annex. Every NDP used must be set AND verified, otherwise nothing is returned and the missing items are listed
 * (no default is substituted). The Table 5.1 values of the Annex (bow.e0L) are taken from `bowTable` when given.
 */
export function enValuesFromAnnex(annex: NationalAnnex, bowTable?: EnValues['bow']): { values: EnValues | null; missing: string[] } {
  const need = ['alphaCr.elastic', 'alphaCr.plastic', 'phi0', 'ltbBow.k'];
  const get = (id: string) => annex.ndps.find((n) => n.id === id);
  const missing: string[] = [];
  for (const id of need) { const n = get(id); if (!n || n.value === null || n.status !== 'verified' || typeof n.value !== 'number') missing.push(`${id} (${EN_1993_1_1_NDP_IDS.find((x) => x.id === id)?.clause})`); }
  if (!bowTable) missing.push('bow.e0L (5.3.2(3)b / Table 5.1): the Annex table is required');
  if (missing.length || !bowTable) return { values: null, missing };
  const v = (id: string) => get(id)!.value as number;
  return { values: { origin: 'national-annex', state: 'verified', alphaCr: { elastic: v('alphaCr.elastic'), plastic: v('alphaCr.plastic') }, phi0: v('phi0'), bow: bowTable, ltbBowK: v('ltbBow.k'), annexCountry: annex.country }, missing: [] };
}

/** 5.3.2(3)a, eq. (5.5): φ = φ0 · α_h · α_m;  α_h = 2/√h, 2/3 ≤ α_h ≤ 1.0 (h in metres);  α_m = √(0.5 (1 + 1/m)). */
export function en1993SwayImperfection(o: { phi0: number; hMetres: number; m: number }): { phi: number; alphaH: number; alphaM: number } {
  if (!(o.phi0 > 0 && o.phi0 <= 0.05)) throw new Error('EN 1993-1-1 5.3.2(3): φ0 must be in (0, 0.05]');
  if (!(o.hMetres > 0)) throw new Error('EN 1993-1-1 5.3.2(3): the height of the structure must be positive (metres)');
  if (!Number.isInteger(o.m) || o.m < 1) throw new Error('EN 1993-1-1 5.3.2(3): m, the number of columns in a row, must be an integer ≥ 1');
  const alphaH = Math.min(1, Math.max(2 / 3, 2 / Math.sqrt(o.hMetres)));
  const alphaM = Math.sqrt(0.5 * (1 + 1 / o.m));
  return { phi: o.phi0 * alphaH * alphaM, alphaH, alphaM };
}

/** 5.3.2(3)b, Table 5.1: e0/L by buckling curve and analysis type (recommended values unless the Annex table is supplied). */
export function en1993BowRatio(curve: EnBucklingCurve, analysis: EnAnalysis, table: EnValues['bow'] = EN_TABLE_5_1): number {
  const v = table[analysis]?.[curve];
  if (!(v > 0)) throw new Error(`EN 1993-1-1 Table 5.1: no value for curve ${curve} / ${analysis}`);
  return v;
}

/** 5.2.1(3), eq. (5.1): first-order analysis may be used if α_cr ≥ 10 (elastic) / 15 (plastic) (limits are an NDP). */
export function en1993FirstOrderPermitted(alphaCr: number, analysis: EnAnalysis, limits: { elastic: number; plastic: number }): { permitted: boolean; limit: number } {
  if (!(alphaCr > 0)) throw new Error('EN 1993-1-1 5.2.1(3): α_cr must be positive');
  const limit = limits[analysis];
  return { permitted: alphaCr >= limit, limit };
}

/** 5.2.1(4)B, eq. (5.2): α_cr = (H_Ed/V_Ed)(h/δ_H,Ed), per storey, for beam-and-column plane frames when the beam axial compression is not significant. */
export function en1993AlphaCrStorey(o: { HEd: number; VEd: number; h: number; deltaHEd: number }): number {
  if (!(o.HEd > 0 && o.VEd > 0 && o.h > 0)) throw new Error('EN 1993-1-1 (5.2): H_Ed, V_Ed and h must be positive');
  if (!(Math.abs(o.deltaHEd) > 0)) throw new Error('EN 1993-1-1 (5.2): δ_H,Ed is zero; α_cr is not defined');
  return (o.HEd / o.VEd) * (o.h / Math.abs(o.deltaHEd));
}

/** 5.2.1 note 2B, eq. (5.3): the axial compression in beams or rafters is significant if λ̄ ≥ 0.3 √(A f_y / N_Ed). */
export function en1993BeamAxialSignificant(o: { lambdaBar: number; A: number; fy: number; NEd: number }): boolean {
  if (!(o.NEd > 0 && o.A > 0 && o.fy > 0)) throw new Error('EN 1993-1-1 (5.3): N_Ed, A and f_y must be positive');
  return o.lambdaBar >= 0.3 * Math.sqrt((o.A * o.fy) / o.NEd);
}

/** 5.2.2(5)B, eq. (5.4): factor 1/(1 − 1/α_cr) on horizontal and equivalent loads from first-order theory, only for α_cr ≥ 3.0. */
export function en1993SwayAmplification(alphaCr: number): { allowed: boolean; factor: number | null; reason: string } {
  if (!(alphaCr > 0)) throw new Error('EN 1993-1-1 5.2.2(5)B: α_cr must be positive');
  if (alphaCr < 3) return { allowed: false, factor: null, reason: `α_cr = ${alphaCr.toFixed(3)} < 3.0: the amplification factor (5.4) does not apply, a more accurate second-order analysis is required (5.2.2(5)B note).` };
  return { allowed: true, factor: 1 / (1 - 1 / alphaCr), reason: `α_cr = ${alphaCr.toFixed(3)} ≥ 3.0` };
}

/** 5.3.2(4)B, eq. (5.7): for building frames sway imperfections may be disregarded where H_Ed ≥ 0.15 V_Ed. */
export function en1993SwayMayBeDisregarded(HEd: number, VEd: number): boolean {
  if (!(VEd > 0) || !(HEd >= 0)) throw new Error('EN 1993-1-1 (5.7): V_Ed must be positive and H_Ed non-negative');
  return HEd >= 0.15 * VEd;
}

/**
 * 5.3.2(6), eq. (5.8): local bow imperfections are to be introduced IN ADDITION to the global sway imperfections, for frames sensitive to second-order
 * effects, in each compressed member that has at least one moment-resistant joint at a member end and λ̄ > 0.5 √(A f_y / N_Ed). The "frame sensitive to
 * second-order effects" is a decision of the user (e.g. from α_cr), not decided here.
 */
export function en1993BowRequired(o: { momentResistantJointAtAnEnd: boolean; lambdaBar: number; A: number; fy: number; NEd: number; frameSensitiveToSecondOrder: boolean }): { required: boolean; reason: string } {
  if (!o.frameSensitiveToSecondOrder) return { required: false, reason: '5.3.2(6): the frame is not declared sensitive to second-order effects; local bow may be neglected in the global analysis.' };
  if (!(o.NEd > 0)) return { required: false, reason: '5.3.2(6): the member is not in compression.' };
  if (!o.momentResistantJointAtAnEnd) return { required: false, reason: '5.3.2(6): no moment-resistant joint at either member end.' };
  const lim = 0.5 * Math.sqrt((o.A * o.fy) / o.NEd);
  return o.lambdaBar > lim ? { required: true, reason: `λ̄ = ${o.lambdaBar.toFixed(3)} > ${lim.toFixed(3)}` } : { required: false, reason: `λ̄ = ${o.lambdaBar.toFixed(3)} ≤ ${lim.toFixed(3)}` };
}

const unit = (a: number[]): [number, number, number] => { const n = Math.hypot(a[0], a[1], a[2]); return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0]; };

/**
 * 5.3.2(7), Figure 5.4: equivalent horizontal forces of a bow imperfection e0 of a compressed member: a uniform load q = 8 N_Ed e0/L² over the length
 * with end forces 4 N_Ed e0/L in the opposite sense (they equilibrate q·L). N_Ed from a FIRST-ORDER analysis (`gravity`, compression positive here).
 * The shape of the bow is the parabola of Figure 5.4 (the geometric alternative in imperfection.ts uses a half sine: a different shape, ≈ 1.5 % apart in
 * the second-order mid moment at P = 0.5 P_cr). `direction` is projected perpendicular to the member axis. Returns the load case and the data per member.
 */
export function en1993BowEquivalentLoads(ps: Prepared, gravity: SolveResult, members: { id: number; e0OverL: number }[], direction: [number, number, number]): { lc: LoadCase; applied: { member: number; N: number; L: number; q: number; endForce: number }[] } {
  const Ntens = new Map<number, number>();
  for (const e of gravity.elements) if (!Ntens.has(e.member)) Ntens.set(e.member, e.stations[0][1]);
  const member: MemberLoad[] = [], nodal: NodalLoad[] = [], applied: { member: number; N: number; L: number; q: number; endForce: number }[] = [];
  for (const { id, e0OverL } of members) {
    if (!(e0OverL > 0 && e0OverL <= 0.02)) throw new Error(`EN 1993-1-1 5.3.2(3)b: member ${id}: e0/L must be in (0, 0.02]`);
    const m = ps.model.members.find((x) => x.id === id); if (!m) throw new Error(`member ${id} not found`);
    const a = ps.model.nodes.find((n) => n.id === m.n1)!, b = ps.model.nodes.find((n) => n.id === m.n2)!;
    const axis = unit([b.x - a.x, b.y - a.y, b.z - a.z]), L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const N = -(Ntens.get(id) ?? 0); // compression positive
    if (!(N > 0)) continue; // only compressed members (5.3.2(6)/5.3.4(2))
    const d = unit(direction), t = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
    const n = unit([d[0] - t * axis[0], d[1] - t * axis[1], d[2] - t * axis[2]]);
    if (!(n[0] || n[1] || n[2])) throw new Error(`EN 1993-1-1 5.3.2(7): member ${id}: the bow direction is parallel to the member axis`);
    const e0 = e0OverL * L, q = (8 * N * e0) / (L * L), F = (4 * N * e0) / L;
    member.push({ member: id, q: [q * n[0], q * n[1], q * n[2]], system: 'global' });
    nodal.push({ node: m.n1, f: [-F * n[0], -F * n[1], -F * n[2], 0, 0, 0] }, { node: m.n2, f: [-F * n[0], -F * n[1], -F * n[2], 0, 0, 0] });
    applied.push({ member: id, N, L, q, endForce: F });
  }
  return { lc: { id: 'EN-BOW', name: 'EN 1993-1-1 5.3.2(7) equivalent bow forces', member, nodal }, applied };
}
