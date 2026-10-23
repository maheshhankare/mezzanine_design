/**
 * IS 800:2007 design strength of tension members governed by rupture of the critical section (6.3) and by block shear (6.4).
 * Units: N, mm, N/mm². Text read on the page images (printed p. 32-34, register IS800-6.3 and IS800-6.4); partial factors from Table 5 (printed p. 30):
 * γ_m0 = 1.10 (yielding), γ_m1 = 1.25 (ultimate stress).
 *
 *  6.3.1  plates:            T_dn = 0.9 A_n f_u / γ_m1,   A_n = [b − n d_h + Σ p_si²/(4 g_i)] t   (d_h: hole diameter, +2 mm if directly punched)
 *  6.3.2  threaded rods:     T_dn = 0.9 A_n f_u / γ_m1,   A_n = net root area at the thread
 *  6.3.3  single angles (connected through one leg, shear lag):
 *                            T_dn = 0.9 A_nc f_u / γ_m1 + β A_go f_y / γ_m0,   β = 1.4 − 0.076 (w/t)(f_y/f_u)(b_s/L_c),  0.7 ≤ β ≤ f_u γ_m0/(f_y γ_m1)
 *         b_s = w + w_1 − t (bolted), b_s = w (welded), Fig. 6: w = outstanding-leg width, w_1 = distance from the back of the outstanding leg to the bolt line,
 *         L_c = distance between the outermost bolts in the load direction, or the weld length.
 *  6.3.4  double angles, channels, I-sections and other rolled sections connected through one or more elements: "may also be calculated using equation in 6.3.3",
 *         β from the shear-lag distance b_s (farthest edge of the outstanding leg to the nearest bolt / weld line of the connected leg).
 *  6.3.4a (preliminary sizing) T_dn = α A_n f_u / γ_m1, α = 0.6 (one or two bolts), 0.7 (three), 0.8 (four or more bolts along the connection length) / equivalent weld.
 *  6.4.1  block shear, bolted: T_db = the smaller of  A_vg f_y/(√3 γ_m0) + 0.9 A_tn f_u/γ_m1   and   0.9 A_vn f_u/(√3 γ_m1) + A_tg f_y/γ_m0   (Fig. 7).
 *  6.4.2  welded end connections: the same check "taking an appropriate section in the member around the end weld, which can shear off as a block"
 *         (no geometry is given; the caller supplies the four areas).
 *
 * NOT defined by the text, DECIDED here as engineering judgement (docs/TECHNICAL_DECISIONS_6.3_6.4.md): the areas of an angle are measured along the CENTRE LINES of the legs,
 * A_go = (w − t/2) t and A_nc = (b − t/2) t less the holes, because (i) they then add up to the gross area (b + w − t) t and (ii) the clause's own b_s = w + w_1 − t is the centre-line
 * path (w − t/2) + (w_1 − t/2); fillets neglected (conservative). The functions `shearLagRupture` / `blockShear` still take areas as inputs; `singleAngleRupture` applies the convention.
 * Two angles back to back on both sides of a gusset: 2 × one angle (6.3.4 "may"; each angle is a single-leg connection). Channels, I-sections and other rolled sections: the 6.3.4
 * parameters (w, t, A_nc, A_go) are not defined by the text, so `connectedElementRupture` gives a LOWER BOUND (6.3.1 on the connected elements only, the outstanding elements neglected).
 */
import { GAMMA_M0, GAMMA_M1 } from './is800';

const pos = (v: number, what: string) => { if (!(v > 0) || !isFinite(v)) throw new Error(`IS 800 6.3 / 6.4: ${what} must be a positive number`); };
const nonneg = (v: number, what: string) => { if (!(v >= 0) || !isFinite(v)) throw new Error(`IS 800 6.3 / 6.4: ${what} must be zero or positive`); };

// ---------------------------------------------------------------------------------------------------------- 6.3.1 net area
export interface StaggerLeg { p: number; g: number } // p: staggered pitch between two holes in the load direction; g: gauge between the same two holes (Fig. 5)
/** 6.3.1: hole diameter used in the net area: the diameter of the hole, 2 mm more for directly punched holes. */
export const holeDiameterForNet = (dh: number, punched: boolean) => { pos(dh, 'the hole diameter'); return punched ? dh + 2 : dh; };

/** 6.3.1: net area of one failure path across a plate. `n` holes in the path; each inclined leg of a staggered path adds p²/(4 g). */
export function netAreaPlate(p: { b: number; t: number; n: number; dh: number; legs?: StaggerLeg[] }): number {
  pos(p.b, 'the plate width b'); pos(p.t, 'the thickness t'); pos(p.dh, 'the hole diameter d_h');
  if (!Number.isInteger(p.n) || p.n < 0) throw new Error('IS 800 6.3.1: the number of holes in the critical section must be a non-negative integer');
  let add = 0;
  for (const l of p.legs || []) { pos(l.p, 'the staggered pitch p_s'); pos(l.g, 'the gauge g'); add += (l.p * l.p) / (4 * l.g); }
  const An = (p.b - p.n * p.dh + add) * p.t;
  if (!(An > 0)) throw new Error('IS 800 6.3.1: the net area is not positive (holes remove the whole section)');
  return An;
}
/** 6.3.1: the critical section is the path with the smallest net area; the caller lists every possible path. */
export function criticalNetArea(paths: number[]): number {
  if (!paths.length) throw new Error('IS 800 6.3.1: at least one failure path is needed');
  return Math.min(...paths);
}

// ---------------------------------------------------------------------------------------------------------- rupture resistances
export interface Rupture { Tdn: number; clause: string; notes: string[]; detail: Record<string, number | string> }
const ruptureNet = (An: number, fu: number, clause: string, what: string): Rupture => {
  pos(An, `the net area ${what}`); pos(fu, 'f_u');
  return { Tdn: (0.9 * An * fu) / GAMMA_M1, clause, notes: [], detail: { 'T_dn = 0.9 A_n f_u / γ_m1': (0.9 * An * fu) / GAMMA_M1, A_n: An, f_u: fu, γm1: GAMMA_M1 } };
};
/** 6.3.1 plates. */
export const plateRupture = (p: { An: number; fu: number }): Rupture => ruptureNet(p.An, p.fu, 'IS 800:2007 6.3.1', 'of the plate');
/** 6.3.2 threaded rods; A_n is the net ROOT area at the thread (not the tensile stress area). */
export const threadedRodRupture = (p: { An: number; fu: number }): Rupture => ruptureNet(p.An, p.fu, 'IS 800:2007 6.3.2', 'of the threaded rod (root area)');

/** shear-lag width b_s of Fig. 6: bolted b_s = w + w_1 − t; welded b_s = w. */
export function shearLagWidthAngle(p: { w: number; t: number; connection: 'bolted' | 'welded'; w1?: number }): number {
  pos(p.w, 'the outstanding leg width w'); pos(p.t, 'the thickness t');
  if (p.connection === 'welded') return p.w;
  if (!(p.w1 !== undefined && p.w1 > 0)) throw new Error('IS 800 6.3.3: w_1 (back of the outstanding leg to the bolt line) is needed for a bolted connection');
  return p.w + p.w1 - p.t;
}

export interface AngleRupture extends Rupture { beta: number; betaRaw: number; betaMax: number; betaLimited: 'none' | 'lower 0.7' | 'upper f_u γ_m0/(f_y γ_m1)' }
/** 6.3.3 (single angle) and, by 6.3.4, any rolled section connected through part of its elements: β from the shear-lag distance b_s. `w`, `t`: outstanding element width and thickness. */
export function shearLagRupture(p: { Anc: number; Ago: number; fu: number; fy: number; w: number; t: number; bs: number; Lc: number; clause?: 'IS 800:2007 6.3.3' | 'IS 800:2007 6.3.4' }): AngleRupture {
  pos(p.Anc, 'the net area A_nc of the connected element'); nonneg(p.Ago, 'the gross area A_go of the outstanding element'); pos(p.fu, 'f_u'); pos(p.fy, 'f_y');
  pos(p.w, 'w'); pos(p.t, 't'); pos(p.bs, 'the shear-lag width b_s'); nonneg(p.Lc, 'the connection length L_c');
  // L_c = 0 (a single bolt): b_s/L_c is unbounded, β falls to its lower limit 0.7
  const betaRaw = p.Lc > 0 ? 1.4 - 0.076 * (p.w / p.t) * (p.fy / p.fu) * (p.bs / p.Lc) : -Infinity;
  const betaMax = (p.fu * GAMMA_M0) / (p.fy * GAMMA_M1);
  // the printed limits are  β ≤ f_u γ_m0/(f_y γ_m1)  and  β ≥ 0.7
  let beta = betaRaw, lim: AngleRupture['betaLimited'] = 'none';
  if (beta > betaMax) { beta = betaMax; lim = 'upper f_u γ_m0/(f_y γ_m1)'; }
  if (beta < 0.7) { beta = 0.7; lim = 'lower 0.7'; }
  const T1 = (0.9 * p.Anc * p.fu) / GAMMA_M1, T2 = (beta * p.Ago * p.fy) / GAMMA_M0, Tdn = T1 + T2;
  return { Tdn, clause: p.clause || 'IS 800:2007 6.3.3', beta, betaRaw, betaMax, betaLimited: lim,
    notes: ['A_nc and A_go (net area of the connected leg, gross area of the outstanding leg) are inputs: the text gives no measuring convention.'],
    detail: { 'T_dn = 0.9 A_nc f_u/γ_m1 + β A_go f_y/γ_m0': Tdn, '0.9 A_nc f_u/γ_m1': T1, 'β A_go f_y/γ_m0': T2, β: beta, 'β (eq.)': isFinite(betaRaw) ? betaRaw : 'L_c = 0: lower limit', 'β max': betaMax, b_s: p.bs, L_c: p.Lc } };
}

/** Angle areas on the centre-line convention (see the header). `connected` / `outstanding`: leg widths (overall, to the heel line); holes: n holes (and staggered legs) in the critical section of the connected leg. */
export function angleAreasCentreLine(p: { connected: number; outstanding: number; t: number; nHoles: number; dh: number; legs?: StaggerLeg[] }): { Anc: number; Ago: number; Agc: number } {
  pos(p.connected, 'the connected leg width'); pos(p.outstanding, 'the outstanding leg width'); pos(p.t, 't');
  const Agc = (p.connected - p.t / 2) * p.t, Ago = (p.outstanding - p.t / 2) * p.t;
  const Anc = netAreaPlate({ b: p.connected - p.t / 2, t: p.t, n: p.nHoles, dh: p.dh, legs: p.legs });
  return { Anc, Ago, Agc };
}

export interface SingleAngleRupture extends AngleRupture { areas: { Anc: number; Ago: number }; bs: number; nAngles: number; TdnOne: number }
/**
 * 6.3.3 for an angle connected through one leg, with the centre-line areas; `nAngles` = 2 for two angles back to back on both sides of a gusset (6.3.4: each angle is a single-leg
 * connection, T_dn = 2 × one angle). `connected` is the leg that carries the bolts / welds, `outstanding` the other; `w1`: back of the outstanding leg to the bolt line (bolted).
 */
export function singleAngleRupture(p: { connected: number; outstanding: number; t: number; fy: number; fu: number; connection: 'bolted' | 'welded'; w1?: number; nHoles: number; dh: number; legs?: StaggerLeg[]; Lc: number; nAngles?: 1 | 2 }): SingleAngleRupture {
  const n = p.nAngles ?? 1;
  if (n !== 1 && n !== 2) throw new Error('IS 800 6.3.4: one angle, or two angles back to back, only');
  const areas = angleAreasCentreLine({ connected: p.connected, outstanding: p.outstanding, t: p.t, nHoles: p.connection === 'welded' ? 0 : p.nHoles, dh: p.dh || 1, legs: p.legs });
  const bs = shearLagWidthAngle({ w: p.outstanding, t: p.t, connection: p.connection, w1: p.w1 });
  const one = shearLagRupture({ Anc: areas.Anc, Ago: areas.Ago, fu: p.fu, fy: p.fy, w: p.outstanding, t: p.t, bs, Lc: p.Lc, clause: n === 2 ? 'IS 800:2007 6.3.4' : 'IS 800:2007 6.3.3' });
  return { ...one, Tdn: one.Tdn * n, TdnOne: one.Tdn, areas: { Anc: areas.Anc, Ago: areas.Ago }, bs, nAngles: n,
    notes: [...one.notes, 'areas on the centre-line convention (decision documented in docs/TECHNICAL_DECISIONS_6.3_6.4.md)', ...(n === 2 ? ['two angles back to back: 2 × one angle (6.3.4 "may"; each angle is a single-leg connection)'] : [])] };
}

/** Channels, I-sections and other rolled sections (6.3.4): the parameters of the shear-lag equation are not defined for them, so the strength is bounded from below by the net rupture of the CONNECTED elements alone (6.3.1); the outstanding elements are neglected. */
export function connectedElementRupture(p: { An: number; fu: number }): Rupture {
  const r = plateRupture(p);
  return { ...r, clause: 'IS 800:2007 6.3.1 (lower bound for 6.3.4 sections)', notes: ['lower bound: the connected elements only, the outstanding elements are neglected; the 6.3.4 shear-lag equation is not applied'] };
}

/** Net root area of a metric screw thread (ISO 724: d_3 = d − 1.22687 P, coarse pitch of ISO 261): the "net root area" of 6.3.2. IS 1367 tables are not supplied; d between 8 and 36 mm. */
const COARSE_PITCH: Record<number, number> = { 8: 1.25, 10: 1.5, 12: 1.75, 14: 2, 16: 2, 18: 2.5, 20: 2.5, 22: 2.5, 24: 3, 27: 3, 30: 3.5, 33: 3.5, 36: 4 };
export function threadRootArea(d: number): number {
  const P = COARSE_PITCH[d];
  if (!P) throw new Error('IS 800 6.3.2: the root area is tabulated here for the metric coarse threads M8-M36 only');
  const d3 = d - 1.22687 * P;
  return (Math.PI * d3 * d3) / 4;
}

/** 6.3 note "for preliminary sizing": T_dn = α A_n f_u/γ_m1; α by the number of bolts along the end connection (or the equivalent weld length). */
export function preliminaryRupture(p: { An: number; fu: number; nBoltsAlong: number }): Rupture {
  pos(p.An, 'A_n'); pos(p.fu, 'f_u');
  if (!Number.isInteger(p.nBoltsAlong) || p.nBoltsAlong < 1) throw new Error('IS 800 6.3: the number of bolts along the connection must be a positive integer');
  const alpha = p.nBoltsAlong <= 2 ? 0.6 : p.nBoltsAlong === 3 ? 0.7 : 0.8;
  const Tdn = (alpha * p.An * p.fu) / GAMMA_M1;
  return { Tdn, clause: 'IS 800:2007 6.3 (preliminary sizing)', notes: ['approximate rule for preliminary sizing only'], detail: { 'T_dn = α A_n f_u/γ_m1': Tdn, α: alpha } };
}

// ---------------------------------------------------------------------------------------------------------- 6.4 block shear
export interface BlockShear { Tdb: number; T1: number; T2: number; governing: 1 | 2; clause: string; detail: Record<string, number | string> }
/** 6.4.1 (bolted) and 6.4.2 (welded: the caller defines the section around the weld): the smaller of the two printed expressions. */
export function blockShear(p: { Avg: number; Avn: number; Atg: number; Atn: number; fy: number; fu: number; welded?: boolean }): BlockShear {
  pos(p.Avg, 'A_vg'); pos(p.Avn, 'A_vn'); pos(p.Atg, 'A_tg'); pos(p.Atn, 'A_tn'); pos(p.fy, 'f_y'); pos(p.fu, 'f_u');
  if (p.Avn > p.Avg * (1 + 1e-9) || p.Atn > p.Atg * (1 + 1e-9)) throw new Error('IS 800 6.4.1: a net area cannot exceed the corresponding gross area');
  const T1 = (p.Avg * p.fy) / (Math.sqrt(3) * GAMMA_M0) + (0.9 * p.Atn * p.fu) / GAMMA_M1;
  const T2 = (0.9 * p.Avn * p.fu) / (Math.sqrt(3) * GAMMA_M1) + (p.Atg * p.fy) / GAMMA_M0;
  const Tdb = Math.min(T1, T2);
  return { Tdb, T1, T2, governing: T1 <= T2 ? 1 : 2, clause: p.welded ? 'IS 800:2007 6.4.2' : 'IS 800:2007 6.4.1',
    detail: { 'T_db = min(T1, T2)': Tdb, 'T1 = A_vg f_y/(√3 γ_m0) + 0.9 A_tn f_u/γ_m1': T1, 'T2 = 0.9 A_vn f_u/(√3 γ_m1) + A_tg f_y/γ_m0': T2, A_vg: p.Avg, A_vn: p.Avn, A_tg: p.Atg, A_tn: p.Atn } };
}

export interface BlockGeometry {
  /** 'plate': two shear planes (1-2 and 4-3 of Fig. 7A) and the tension plane between the two outer bolt lines (2-3);
   *  'one-sided': one shear plane (1-2 of Fig. 7B, an angle or a plate that tears out towards one edge) and tension from the last bolt line to the free edge. */
  kind: 'plate' | 'one-sided';
  t: number;
  /** bolts along the force in each line */ nAlong: number;
  /** end distance from the end of the member to the first bolt centre */ e1: number;
  /** pitch along the force */ p1: number;
  /** bolt lines across the force */ nAcross: number;
  /** gauge between the lines across the force */ g: number;
  /** distance from the last bolt line to the free edge (one-sided only) */ e2?: number;
  /** hole diameter */ d0: number;
}
/**
 * The four areas of Fig. 7 from the bolt pattern. Reading of the figure (stated, not given by the text): the shear length of a line runs from the end of the member to
 * the centre of the last bolt hole of that line (L_v = e_1 + (n − 1) p_1), so a line of n holes removes (n − ½) d_0 from it; the tension length runs between the centres of the
 * outer holes of the end bolt line ('plate') or from the centre of the hole of the line nearest the shear plane to the free edge ('one-sided', Fig. 7B "from the bolt hole to
 * the toe"), removing the full holes between and half a hole at the end.
 */
export function blockShearAreas(g: BlockGeometry): { Avg: number; Avn: number; Atg: number; Atn: number; Lv: number; Lt: number } {
  pos(g.t, 't'); pos(g.d0, 'the hole diameter'); pos(g.e1, 'the end distance e_1'); nonneg(g.p1, 'the pitch p_1'); nonneg(g.g, 'the gauge g');
  if (!Number.isInteger(g.nAlong) || g.nAlong < 1 || !Number.isInteger(g.nAcross) || g.nAcross < 1) throw new Error('IS 800 6.4.1: the bolt numbers must be positive integers');
  if (g.nAlong > 1) pos(g.p1, 'the pitch p_1');
  const Lv = g.e1 + (g.nAlong - 1) * g.p1, planes = g.kind === 'plate' ? 2 : 1;
  const Avg = planes * Lv * g.t, Avn = planes * (Lv - (g.nAlong - 0.5) * g.d0) * g.t;
  let Lt: number, Atn: number;
  if (g.kind === 'plate') {
    if (g.nAcross < 2) throw new Error('IS 800 6.4.1: a plate block (Fig. 7A) needs at least two bolt lines across the force');
    Lt = (g.nAcross - 1) * g.g; Atn = (Lt - (g.nAcross - 1) * g.d0) * g.t;
  } else {
    pos(g.e2 ?? NaN, 'the edge distance e_2');
    Lt = (g.nAcross - 1) * g.g + (g.e2 as number); Atn = (Lt - (g.nAcross - 0.5) * g.d0) * g.t;
  }
  if (!(Avn > 0) || !(Atn > 0)) throw new Error('IS 800 6.4.1: the holes remove the whole shear or tension area; the pattern is not admissible');
  return { Avg, Avn, Atg: Lt * g.t, Atn, Lv, Lt };
}
