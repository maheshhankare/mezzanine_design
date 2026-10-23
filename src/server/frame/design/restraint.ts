/**
 * IS 800:2007 lateral restraint of a beam by intermediate members (joists) and the bearing-type bolts of their connections.
 * Units: N, mm, N/mm². Provisions read on the page images (register: IS800-8.3.4, IS800-10.3):
 *
 *  8.3.4   Intermediate lateral restraints need "sufficient strength and stiffness"; they must be connected to a bracing system or an independent robust part of
 *          the structure; parallel members needing restraint shall not be simply connected together assuming mutual dependence; the restraint must resist a force
 *          of 2.5 % of the maximum force in the compression flange, divided equally between the restraint points, and each point 1 % of that force.
 *  8.3.4.1 A series of solid-web beams connected by the same restraint system: the SUM of the restraining forces is 2.5 % of the maximum flange force of ONE beam.
 *  10.3    Bearing-type bolts: 10.3.2 (V_sb <= V_db = min(V_dsb, V_dpb)), 10.3.3 (shear, with 10.3.3.1 long joints and 10.3.3.2 large grip), 10.3.4 (bearing),
 *          10.3.5 (tension), 10.3.6 (combined), 10.2.1 Table 19 (hole clearances), 10.2.2 (pitch >= 2.5 d), 10.2.4.2 (edge distance >= 1.7 / 1.5 d_0).
 *
 * IS 800 gives NO numerical criterion for the stiffness of a restraint: the stiffness is therefore not a pass / fail check here; it is an input of the elastic
 * buckling analysis (the actual spring stiffness is used, never "rigid"). That is reported as such.
 */
import { GAMMA_M0 } from './is800';

export const GAMMA_MB = 1.25; // Table 5, connections (bolts)

// ---------------------------------------------------------------------------------------------------------- 8.3.4 restraint demand
export interface RestraintDemand {
  Fcf: number; // maximum force in the compression flange of the restrained beam
  n: number; // restraint points on the beam
  total: number; // 2.5 % of Fcf (sum for the beam)
  perPoint: number; // max(total / n, 1 % Fcf)
  anchorage: number; // sum of the point forces = n x perPoint (>= 2.5 % Fcf), to be carried to the effective lateral supports
  notes: string[];
}

/** 8.3.4: restraint force per point and the force the restraint system must deliver to the lateral supports. `Fcf` = M_max / (distance between flange centroids). */
export function restraintDemand(p: { Fcf: number; n: number }): RestraintDemand {
  if (!(p.n >= 1) || !Number.isInteger(p.n)) throw new Error('IS 800 8.3.4: the number of restraint points must be a positive integer');
  if (!(p.Fcf >= 0)) throw new Error('IS 800 8.3.4: the compression-flange force must be >= 0');
  const total = 0.025 * p.Fcf, perPoint = Math.max(total / p.n, 0.01 * p.Fcf);
  return { Fcf: p.Fcf, n: p.n, total, perPoint, anchorage: perPoint * p.n, notes: ['8.3.4: 2.5 % of the maximum compression-flange force divided equally between the points, each point at least 1 %; 8.3.4.1: for a series of solid-web beams on the same restraint system the sum is that of one beam only'] };
}

// ---------------------------------------------------------------------------------------------------------- 10.2 geometry
export type HoleKind = 'standard' | 'oversize';
/**
 * IS 800:2007 Table 19 (clause 10.2.1, printed p. 73): clearance in diameter [mm] of a standard or over-size round hole by the nominal size of the fastener.
 * 12-14 mm: 1.0 / 3.0; 16-22 mm: 2.0 / 4.0; 24 mm: 2.0 / 6.0; larger than 24 mm: 3.0 / 8.0. The table starts at 12 mm: smaller bolts are not covered (null).
 * Sizes the table does not list (15, 23 mm: not standard bolts) take the row of the next listed size.
 */
export function holeClearance(d: number, kind: HoleKind = 'standard'): number | null {
  if (!(d > 0) || !Number.isFinite(d)) throw new Error('IS 800 10.2.1: the bolt diameter must be a positive number');
  if (d < 12) return null;
  const row = d <= 14 ? [1, 3] : d <= 22 ? [2, 4] : d <= 24 ? [2, 6] : [3, 8];
  return kind === 'standard' ? row[0] : row[1];
}
/** Table 19: standard clearance of a hole [mm]; the table starts at d = 12 mm (smaller bolts: not covered, null). */
export function standardClearance(d: number): number | null { return holeClearance(d, 'standard'); }
/**
 * Hole diameter for the engine checks. Below 12 mm Table 19 gives nothing: the previous assumption is kept and FLAGGED (`outsideTable`):
 * standard hole d + 1, over-size hole d + 3. The caller shows the flag with the check.
 */
export function holeDiameter(d: number, kind: HoleKind = 'standard'): { d0: number; outsideTable: boolean } {
  const c = holeClearance(d, kind);
  return c === null ? { d0: d + (kind === 'standard' ? 1 : 3), outsideTable: true } : { d0: d + c, outsideTable: false };
}
export const OUTSIDE_TABLE_19 = 'The bolt diameter is below 12 mm, outside Table 19 of IS 800:2007 (clause 10.2.1): the hole diameter d + 1 (over-size d + 3) is an assumption, not a code value.';

export interface BoltGeometryCheck { ok: boolean; messages: string[]; d0: number | null }
/** 10.2.2 minimum pitch 2.5 d; 10.2.4.2 minimum end / edge distance 1.7 d_0 (sheared or hand-flame cut edges) or 1.5 d_0 (rolled, machine-flame cut, sawn, planed). */
export function boltGeometry(p: { d: number; pitch?: number; e1: number; e2?: number; edge: 'rolled' | 'sheared' }): BoltGeometryCheck {
  const c = standardClearance(p.d), messages: string[] = [];
  if (c === null) return { ok: false, d0: null, messages: [`bolt diameter ${p.d} mm is below the first row of Table 19 (12 mm): hole clearance not covered`] };
  const d0 = p.d + c, f = p.edge === 'sheared' ? 1.7 : 1.5;
  if (p.pitch !== undefined && p.pitch < 2.5 * p.d - 1e-9) messages.push(`pitch ${p.pitch} mm < 2.5 d = ${2.5 * p.d} mm (10.2.2)`);
  if (p.e1 < f * d0 - 1e-9) messages.push(`end distance ${p.e1} mm < ${f} d_0 = ${(f * d0).toFixed(1)} mm (10.2.4.2)`);
  if (p.e2 !== undefined && p.e2 < f * d0 - 1e-9) messages.push(`edge distance ${p.e2} mm < ${f} d_0 = ${(f * d0).toFixed(1)} mm (10.2.4.2)`);
  return { ok: messages.length === 0, d0, messages };
}

// ---------------------------------------------------------------------------------------------------------- 10.3 bolt capacities
export interface BoltInput {
  d: number; // nominal diameter
  fub: number; // ultimate tensile stress of the bolt
  fyb: number; // yield stress of the bolt
  An: number; // net tensile stress area (10.3.1.1: also used as the area at the threads)
  Asb: number; // plain shank area (pi d^2 / 4)
}

/** 10.3.3 with 10.3.3.1 (long joints, lj = distance between first and last bolt of the joint in the load direction) and 10.3.3.2 (grip length lg). */
export function boltShearCapacity(b: BoltInput, p: { nn: number; ns: number; lj?: number; lg?: number }): { Vdsb: number; Vnsb: number; betaLj: number; betaLg: number; valid: boolean; notes: string[] } {
  const notes: string[] = [];
  const Vnsb = (b.fub / Math.SQRT2 / Math.sqrt(1.5)) * (p.nn * b.An + p.ns * b.Asb); // fub/sqrt(3) (nn Anb + ns Asb)
  let betaLj = 1, betaLg = 1, valid = true;
  if ((p.lj ?? 0) > 15 * b.d) { betaLj = Math.min(1, Math.max(0.75, 1.075 - (p.lj as number) / (200 * b.d))); notes.push(`10.3.3.1 long joint (l_j = ${p.lj} mm > 15 d): beta_lj = ${betaLj.toFixed(3)}`); }
  if ((p.lg ?? 0) > 5 * b.d) {
    if ((p.lg as number) > 8 * b.d) { valid = false; notes.push('10.3.3.2: the grip length shall in no case be greater than 8 d'); }
    betaLg = Math.min(8 / (3 + (p.lg as number) / b.d), betaLj);
    notes.push(`10.3.3.2 large grip (l_g = ${p.lg} mm > 5 d): beta_lg = ${betaLg.toFixed(3)} (not more than beta_lj)`);
  }
  return { Vnsb, Vdsb: (Vnsb * betaLj * betaLg) / GAMMA_MB, betaLj, betaLg, valid, notes };
}

/** 10.3.4: V_dpb = 2.5 k_b d t f_u / gamma_mb; k_b = min(e/3d_0, p/3d_0 - 0.25, f_ub/f_u, 1.0). `t` = sum of the thicknesses bearing in the same direction. */
export function boltBearingCapacity(b: BoltInput, p: { e: number; pitch?: number; d0: number; t: number; fu: number; hole?: 'standard' | 'oversize-short-slot' | 'long-slot' }): { Vdpb: number; kb: number; notes: string[] } {
  const kb = Math.min(p.e / (3 * p.d0), p.pitch !== undefined && p.pitch > 0 ? p.pitch / (3 * p.d0) - 0.25 : Infinity, b.fub / p.fu, 1.0);
  const red = p.hole === 'oversize-short-slot' ? 0.7 : p.hole === 'long-slot' ? 0.5 : 1;
  return { kb, Vdpb: (red * 2.5 * Math.max(0, kb) * b.d * p.t * p.fu) / GAMMA_MB, notes: red < 1 ? [`bearing reduced by ${red} for oversize / slotted holes (10.3.4)`] : [] };
}

/** 10.3.5: T_nb = 0.90 f_ub A_n < f_yb A_sb (gamma_mb / gamma_m0); T_db = T_nb / gamma_mb. */
export function boltTensionCapacity(b: BoltInput): { Tdb: number; Tnb: number; limitedByYield: boolean } {
  const a = 0.9 * b.fub * b.An, y = b.fyb * b.Asb * (GAMMA_MB / GAMMA_M0), Tnb = Math.min(a, y);
  return { Tnb, Tdb: Tnb / GAMMA_MB, limitedByYield: y < a };
}

/** 10.3.6 (V_sb/V_db)^2 + (T_b/T_db)^2 <= 1.0 */
export const boltCombined = (Vsb: number, Vdb: number, Tb: number, Tdb: number) => (Vsb / Vdb) ** 2 + (Tb / Tdb) ** 2;

// ---------------------------------------------------------------------------------------------------------- the restraint verification
export type Verdict = 'PASS' | 'FAIL' | 'REVIEW';
export interface RestraintItem {
  id: string;
  name: string;
  clause: string;
  verdict: Verdict;
  Ed: number | null;
  Rd: number | null;
  unit: string;
  ratio: number | null;
  equation: string;
  inputs: Record<string, number | string>;
  steps: Record<string, number | string>;
  notes: string[];
}

export const item = (o: Omit<RestraintItem, 'ratio' | 'verdict'> & { verdict?: Verdict }): RestraintItem => {
  const ratio = o.Ed !== null && o.Rd !== null && o.Rd > 0 ? Math.abs(o.Ed) / o.Rd : null;
  return { ...o, ratio, verdict: o.verdict ?? (ratio === null ? 'REVIEW' : ratio <= 1 + 1e-9 ? 'PASS' : 'FAIL') };
};

/** Overall verdict: FAIL if any item fails, REVIEW if any is missing, else PASS. */
export const overall = (items: RestraintItem[]): Verdict => (items.some((i) => i.verdict === 'FAIL') ? 'FAIL' : items.some((i) => i.verdict === 'REVIEW') ? 'REVIEW' : 'PASS');
