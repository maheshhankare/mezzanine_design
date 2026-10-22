/**
 * IS 800:2007 member design: the provisions that were read in the supplied official text (scan) and checked on the page images.
 * Units: N, mm, N/mm².
 *
 * AXES. IS 800 names the MINOR axis y-y and the MAJOR axis z-z (9.3.2.2). Functions here take the two principal axes as `minor` / `major`
 * (for a square tube the choice is arbitrary); the caller maps the solver's local axes.
 *
 * SCOPE. Implemented: 3.7 classification (rectangular hollow sections, angles), 6.2 yielding of the gross section, 7.1.2 flexural buckling
 * with Tables 7 and 10, 8.2.1.2 bending of a laterally supported section, 8.2.2 (hollow sections: no LTB check), 8.4.1 plastic shear,
 * 9.2.2 moment under high shear, 9.3.1 section strength under axial force and bending (Table 17, 9.3.1.2 d), 9.3.2.1, 9.3.2.2 with
 * Table 18 rows A and B and the sway value 0.9. NOT implemented (pending, see the register): 6.3 rupture and 6.4 block shear (need hole /
 * connection data), 6.3.3 angles, 7.5 angle struts, 8.2.2 LTB of open sections (Table 14 / Mcr), 8.4.2 shear buckling, Table 18 row C
 * (the printed coefficients are inconsistent), slender (class 4) sections (IS 801), cold-formed sections (IS 801).
 */

export const GAMMA_M0 = 1.10; // Table 5: resistance governed by yielding, and member buckling
export const GAMMA_M1 = 1.25; // Table 5: resistance governed by ultimate stress

export type Status = 'ok' | 'fail' | 'pending';
export interface Check {
  id: string;
  name: string;
  clause: string;
  /** demand and resistance in the unit given; ratio = demand / resistance, or the interaction sum */
  Ed: number | null;
  Rd: number | null;
  unit: string;
  ratio: number | null;
  status: Status;
  /** every assumption or decision the result depends on */
  notes: string[];
  /** formulas and intermediate values, for the calculation record */
  detail: Record<string, number | string>;
}

const mk = (c: Omit<Check, 'ratio' | 'status'> & { status?: Status; ratio?: number | null }): Check => {
  const ratio = c.ratio !== undefined ? c.ratio : c.Ed !== null && c.Rd !== null && c.Rd !== 0 ? Math.abs(c.Ed) / c.Rd : null;
  return { ...c, ratio, status: c.status ?? (ratio === null ? 'pending' : ratio <= 1 ? 'ok' : 'fail') };
};
const pendingCheck = (id: string, name: string, clause: string, why: string): Check => mk({ id, name, clause, Ed: null, Rd: null, unit: '', notes: [why], detail: {}, status: 'pending' });

export interface Material { fy: number; fu: number; E: number }
export const epsilon = (fy: number) => Math.sqrt(250 / fy); // Table 2 note 2

// ---------------------------------------------------------------------------------------------------------------- section properties
export interface RhsGeometry { b: number; h: number; t: number; rOuter: number; rInner: number }
export interface RhsProps {
  A: number; Iy: number; Iz: number; Zey: number; Zez: number; Zpy: number; Zpz: number; ry: number; rz: number;
  /** shear areas, 8.4.1.1: loaded parallel to depth h: A h/(b+h); parallel to width b: A b/(b+h) */
  Avh: number; Avb: number; flatWidth: number; flatDepth: number;
}

type P = [number, number];
function corner(cx: number, cy: number, r: number, a0: number, a1: number, n = 90): P[] {
  const out: P[] = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return out;
}
function roundedRect(b: number, h: number, r: number): P[] {
  const x = b / 2, y = h / 2; if (r <= 0) return [[x, y], [-x, y], [-x, -y], [x, -y]];
  return [...corner(x - r, y - r, r, 0, Math.PI / 2), ...corner(-x + r, y - r, r, Math.PI / 2, Math.PI), ...corner(-x + r, -y + r, r, Math.PI, 1.5 * Math.PI), ...corner(x - r, -y + r, r, 1.5 * Math.PI, 2 * Math.PI)];
}
/** polygon area and second moments about the origin (counter-clockwise positive) */
function poly(pts: P[]) {
  let A = 0, Sx = 0, Sy = 0, Ix = 0, Iy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length], c = x0 * y1 - x1 * y0;
    A += c / 2; Sx += ((y0 + y1) * c) / 6; Sy += ((x0 + x1) * c) / 6;
    Ix += ((y0 * y0 + y0 * y1 + y1 * y1) * c) / 12; Iy += ((x0 * x0 + x0 * x1 + x1 * x1) * c) / 12;
  }
  return { A, Sx, Sy, Ix, Iy };
}
/** half of a polygon on the side y >= 0 (Sutherland-Hodgman against the line y = 0) or x >= 0 */
function clip(pts: P[], axis: 0 | 1): P[] {
  const out: P[] = []; const inside = (p: P) => p[axis] >= 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) { const t = (0 - a[axis]) / (b[axis] - a[axis]); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
  }
  return out;
}

/** Properties of a doubly symmetric rectangular hollow section with rounded outer and (optionally) rounded inner corners, by polygon integration. */
export function rhsProps(g: RhsGeometry): RhsProps {
  const outer = roundedRect(g.b, g.h, g.rOuter), inner = roundedRect(g.b - 2 * g.t, g.h - 2 * g.t, g.rInner);
  const o = poly(outer), i = poly(inner);
  const A = o.A - i.A, Iz = o.Iy - i.Iy, Iy = o.Ix - i.Ix; // Iy: about the horizontal axis (depth h), Iz about the vertical axis
  // plastic modulus of a doubly symmetric hollow section: twice the first moment of the half area about the axis
  const half = (axis: 0 | 1) => { const ho = poly(clip(outer, axis)), hi = poly(clip(inner, axis)); return axis === 1 ? ho.Sx - hi.Sx : ho.Sy - hi.Sy; };
  const Zpy = 2 * half(1), Zpz = 2 * half(0);
  const Zey = Iy / (g.h / 2), Zez = Iz / (g.b / 2);
  return { A, Iy, Iz, Zey, Zez, Zpy, Zpz, ry: Math.sqrt(Iy / A), rz: Math.sqrt(Iz / A), Avh: (A * g.h) / (g.b + g.h), Avb: (A * g.b) / (g.b + g.h), flatWidth: g.b - 2 * g.t, flatDepth: g.h - 2 * g.t };
}

// ---------------------------------------------------------------------------------------------------------------- 3.7 classification
export type SectionClass = 1 | 2 | 3 | 4;
export interface ClassResult { cls: SectionClass; elements: { name: string; ratio: number; limits: [number, number, number]; cls: SectionClass }[]; notes: string[] }
const clsOf = (r: number, l: [number, number, number]): SectionClass => (r <= l[0] ? 1 : r <= l[1] ? 2 : r <= l[2] ? 3 : 4);

/**
 * Table 2 (IS 800 p. 17-18) for a rectangular hollow section. Internal element of the compression flange: bending 29.3ε / 33.5ε / 42ε; axial compression:
 * class 3 limit 42ε only. Web of a box section: neutral axis at mid-depth 84ε / 105ε / 126ε; axial compression 42ε (class 3 only); generally with r1:
 * class 1 84ε/(1+r1) (but ≤ 42ε for r1 positive), class 2 105ε/(1+r1) for r1 negative and 105ε/(1+1.5 r1) (≤ 42ε) for r1 positive, class 3 126ε/(1+2 r2) (≤ 42ε).
 * r1 = actual average axial stress (negative if tensile) / design compressive stress of the web alone; r2 likewise for the overall section (Table 2 note 5).
 * `state`: 'axial' = axial compression only; 'bending' = bending about the axis perpendicular to the flange/web being checked with the neutral axis at mid-depth;
 * 'combined' = axial force with bending: the web uses r1, r2; the flange uses the bending row (ASSUMPTION: the table gives no row for flanges under
 * combined stress; the bending row is the one for "compression due to bending").
 */
export function classifyRhs(p: { flatWidth: number; flatDepth: number; t: number; fy: number; state: 'axial' | 'bending' | 'combined'; r1?: number; r2?: number }): ClassResult {
  const e = epsilon(p.fy), notes: string[] = [];
  const bt = p.flatWidth / p.t, dt = p.flatDepth / p.t;
  const flangeLim: [number, number, number] = p.state === 'axial' ? [0, 0, 42 * e] : [29.3 * e, 33.5 * e, 42 * e];
  const out: ClassResult['elements'] = [];
  const f1 = { name: 'flange (internal element) b/t', ratio: bt, limits: flangeLim, cls: clsOf(bt, flangeLim) };
  let webLim: [number, number, number];
  if (p.state === 'axial') webLim = [0, 0, 42 * e];
  else if (p.state === 'bending') webLim = [84 * e, 105 * e, 126 * e];
  else {
    const r1 = p.r1 ?? 0, r2 = p.r2 ?? 0;
    const l1 = r1 < 0 ? 84 * e / (1 + r1) : Math.min(84 * e / (1 + r1), 42 * e);
    const l2 = r1 < 0 ? 105 * e / (1 + r1) : Math.min(105 * e / (1 + 1.5 * r1), 42 * e);
    const l3 = Math.min(126 * e / (1 + 2 * r2), 42 * e);
    webLim = [l1, l2, l3];
    notes.push(`web limits from r1 = ${r1.toFixed(3)}, r2 = ${r2.toFixed(3)}`);
  }
  out.push(f1, { name: 'web (internal element) d/t', ratio: dt, limits: webLim, cls: clsOf(dt, webLim) });
  if (p.state === 'combined') notes.push('flange classified with the bending row (assumption: Table 2 has no row for combined stress)');
  const cls = Math.max(...out.map((x) => x.cls)) as SectionClass;
  if (cls === 4) notes.push('class 4 (slender): outside the scope of IS 800, refer to IS 801 (3.7.2 d)');
  return { cls, elements: out, notes };
}

/** Table 2, angles: compression due to bending (b/t and d/t) 9.4ε / 10.5ε / 15.7ε; single angle or separated double angles in axial compression: class 3 at b/t, d/t ≤ 15.7ε and (b+d)/t ≤ 25ε. */
export function classifyAngle(p: { b: number; d: number; t: number; fy: number; state: 'bending' | 'axial' }): ClassResult {
  const e = epsilon(p.fy);
  if (p.state === 'bending') {
    const l: [number, number, number] = [9.4 * e, 10.5 * e, 15.7 * e];
    const el = [{ name: 'leg b/t', ratio: p.b / p.t, limits: l, cls: clsOf(p.b / p.t, l) }, { name: 'leg d/t', ratio: p.d / p.t, limits: l, cls: clsOf(p.d / p.t, l) }];
    return { cls: Math.max(...el.map((x) => x.cls)) as SectionClass, elements: el, notes: [] };
  }
  const l3: [number, number, number] = [0, 0, 15.7 * e], l4: [number, number, number] = [0, 0, 25 * e];
  const el = [{ name: 'leg b/t', ratio: p.b / p.t, limits: l3, cls: clsOf(p.b / p.t, l3) }, { name: 'leg d/t', ratio: p.d / p.t, limits: l3, cls: clsOf(p.d / p.t, l3) }, { name: '(b+d)/t', ratio: (p.b + p.d) / p.t, limits: l4, cls: clsOf((p.b + p.d) / p.t, l4) }];
  return { cls: Math.max(...el.map((x) => x.cls)) as SectionClass, elements: el, notes: [] };
}

// ---------------------------------------------------------------------------------------------------------------- 6.2 tension
export function tensionYield(p: { N: number; Ag: number; fy: number }): Check {
  const Td = (p.Ag * p.fy) / GAMMA_M0;
  return mk({ id: 'tension-6.2', name: 'Tension: yielding of the gross section', clause: 'IS 800 6.2', Ed: p.N, Rd: Td, unit: 'N', notes: ['rupture of the net section (6.3) and block shear (6.4) need hole and connection data: not checked'], detail: { 'T_dg = A_g f_y / γ_m0': Td, γm0: GAMMA_M0 } });
}

// ---------------------------------------------------------------------------------------------------------------- 7.1.2 compression
export type BucklingClass = 'a' | 'b' | 'c' | 'd';
export const IMPERFECTION_ALPHA: Record<BucklingClass, number> = { a: 0.21, b: 0.34, c: 0.49, d: 0.76 }; // Table 7

export interface CompressionResult { lambda: number; phi: number; chi: number; fcd: number; fcc: number }
/** 7.1.2.1: f_cd = (f_y/γ_m0)/(φ + (φ² − λ²)^0.5) = χ f_y/γ_m0 ≤ f_y/γ_m0; φ = 0.5[1 + α(λ − 0.2) + λ²]; λ = (f_y/f_cc)^0.5; f_cc = π²E/(KL/r)². */
export function compressiveStress(p: { fy: number; E: number; slenderness: number; cls: BucklingClass }): CompressionResult {
  if (!(p.slenderness >= 0) || !Number.isFinite(p.slenderness)) throw new Error('IS 800 7.1.2.1: KL/r must be a non-negative number');
  const fcc = (Math.PI ** 2 * p.E) / Math.max(p.slenderness, 1e-9) ** 2;
  const lambda = Math.sqrt(p.fy / fcc);
  const alpha = IMPERFECTION_ALPHA[p.cls];
  const phi = 0.5 * (1 + alpha * (lambda - 0.2) + lambda * lambda);
  const chi = Math.min(1, 1 / (phi + Math.sqrt(Math.max(0, phi * phi - lambda * lambda))));
  return { lambda, phi, chi, fcd: (chi * p.fy) / GAMMA_M0, fcc };
}

/** Table 10 (clause 7.1.2.2) for the cross-section types that were read: hollow hot-rolled a, hollow cold-formed b, welded box b (generally), channel / angle / T / solid c, built-up c. */
export function bucklingClassFor(kind: 'hollow-hot-rolled' | 'hollow-cold-formed' | 'welded-box' | 'channel-angle-tee-solid' | 'built-up'): BucklingClass {
  return { 'hollow-hot-rolled': 'a', 'hollow-cold-formed': 'b', 'welded-box': 'b', 'channel-angle-tee-solid': 'c', 'built-up': 'c' }[kind] as BucklingClass;
}

export function compressionBuckling(p: { P: number; Ae: number; fy: number; E: number; KL: number; r: number; cls: BucklingClass; axis: string }): Check & { res: CompressionResult; Pd: number } {
  const slender = p.KL / p.r, res = compressiveStress({ fy: p.fy, E: p.E, slenderness: slender, cls: p.cls });
  const Pd = p.Ae * res.fcd;
  const c = mk({ id: `compression-7.1.2-${p.axis}`, name: `Compression: flexural buckling about the ${p.axis} axis`, clause: 'IS 800 7.1.2, 7.1.2.1, Tables 7 and 10', Ed: p.P, Rd: Pd, unit: 'N', notes: [`buckling class ${p.cls}, α = ${IMPERFECTION_ALPHA[p.cls]}`], detail: { 'KL/r': slender, λ: res.lambda, φ: res.phi, χ: res.chi, 'f_cd [N/mm²]': res.fcd, 'f_cc [N/mm²]': res.fcc, 'P_d = A_e f_cd': Pd } });
  return Object.assign(c, { res, Pd });
}

// ---------------------------------------------------------------------------------------------------------------- 8.4.1 shear
/** V_d = V_n/γ_m0, V_n = A_v f_yw / √3; shear area of a rectangular hollow section loaded parallel to the depth: A h/(b+h) (8.4.1.1). */
export function shearPlastic(p: { V: number; Av: number; fyw: number; label: string; dOverT?: number }): Check & { Vd: number } {
  const Vd = (p.Av * p.fyw) / Math.sqrt(3) / GAMMA_M0;
  const notes = ['shear buckling (8.4.2) is checked only when d/t_w exceeds 67ε'];
  const e = epsilon(p.fyw);
  if (p.dOverT !== undefined && p.dOverT > 67 * e) notes.push('d/t_w > 67ε: shear buckling per 8.4.2 is required and is NOT implemented');
  const c = mk({ id: `shear-8.4.1-${p.label}`, name: `Shear force (${p.label})`, clause: 'IS 800 8.4.1, 8.4.1.1', Ed: p.V, Rd: Vd, unit: 'N', notes, detail: { 'V_d = A_v f_yw/(√3 γ_m0)': Vd, A_v: p.Av }, status: p.dOverT !== undefined && p.dOverT > 67 * e ? 'pending' : undefined });
  return Object.assign(c, { Vd });
}

// ---------------------------------------------------------------------------------------------------------------- 8.2 bending
export interface BendingStrength { Md: number; betaB: number; limited: boolean; notes: string[] }
/**
 * 8.2.1.2 (V ≤ 0.6 V_d): M_d = β_b Z_p f_y/γ_m0 (β_b = 1.0 plastic and compact, Z_e/Z_p semi-compact); limited to 1.2 Z_e f_y/γ_m0 for simply supported
 * and 1.5 Z_e f_y/γ_m0 for cantilever beams ("to avoid irreversible deformation under serviceability loads"). The limit is applied only when
 * `supportCase` is given; for a member that is neither (a column) the clause gives no value and none is applied (notes).
 */
export function bendingStrengthSupported(p: { Ze: number; Zp: number; fy: number; cls: SectionClass; supportCase?: 'simply-supported' | 'cantilever' }): BendingStrength {
  if (p.cls === 4) throw new Error('IS 800 8.2: class 4 sections are outside the scope (IS 801)');
  const betaB = p.cls === 3 ? p.Ze / p.Zp : 1;
  let Md = (betaB * p.Zp * p.fy) / GAMMA_M0; const notes: string[] = []; let limited = false;
  if (p.supportCase) { const lim = ((p.supportCase === 'simply-supported' ? 1.2 : 1.5) * p.Ze * p.fy) / GAMMA_M0; if (Md > lim) { Md = lim; limited = true; } }
  else notes.push('8.2.1.2: the 1.2 / 1.5 Z_e f_y/γ_m0 limit applies to simply supported / cantilever beams; no limit applied to this member');
  return { Md, betaB, limited, notes };
}

/**
 * 9.2.2: moment capacity under high shear (V > 0.6 V_d).  Plastic or compact: M_dv = M_d − β (M_d − M_fd) ≤ 1.2 Z_e f_y/γ_m0, β = (2V/V_d − 1)²,
 * M_fd = plastic design strength of the area excluding the shear area. Semi-compact: M_dv = Z_e f_y/γ_m0.
 */
export function bendingHighShear(p: { V: number; Vd: number; Md: number; Mfd: number; Ze: number; fy: number; cls: SectionClass }): { Mdv: number; beta: number } {
  if (p.cls === 3) return { Mdv: (p.Ze * p.fy) / GAMMA_M0, beta: NaN };
  const beta = (2 * Math.abs(p.V) / p.Vd - 1) ** 2;
  return { Mdv: Math.min(p.Md - beta * (p.Md - p.Mfd), (1.2 * p.Ze * p.fy) / GAMMA_M0), beta };
}

// ---------------------------------------------------------------------------------------------------------------- 9.3.1 section strength
/** Table 17: constants α1, α2 for rectangular tubes: 1.66/(1 − 1.13 n²) ≤ 6 (n = N/N_d). I and channel sections: α1 = 5n ≥ 1, α2 = 2. */
export function alphaTable17(section: 'rectangular-tube' | 'I-channel' | 'circular-tube', n: number): [number, number] {
  if (section === 'circular-tube') return [2, 2];
  if (section === 'I-channel') return [Math.max(1, 5 * n), 2];
  const a = Math.min(6, 1.66 / (1 - 1.13 * n * n)); return [a, a];
}

/** 9.3.1.2 d): rectangular hollow sections, symmetric about both axes, without bolt holes. a_w = (A − 2 b t_f)/A ≤ 0.5; a_f = (A − 2 h t_w)/A ≤ 0.5. */
export function reducedMomentsRhs(p: { n: number; A: number; b: number; h: number; tf: number; tw: number; Mdy: number; Mdz: number }) {
  const aw = Math.min(0.5, (p.A - 2 * p.b * p.tf) / p.A), af = Math.min(0.5, (p.A - 2 * p.h * p.tw) / p.A);
  return { aw, af, Mndy: Math.min(p.Mdy, (p.Mdy * (1 - p.n)) / (1 - 0.5 * aw)), Mndz: Math.min(p.Mdz, (p.Mdz * (1 - p.n)) / (1 - 0.5 * af)) };
}

/**
 * 9.3.1.1 (plastic and compact): (M_y/M_ndy)^α1 + (M_z/M_ndz)^α2 ≤ 1.0, applicable to the bending moments with the reduced strengths of 9.3.1.2.
 * The conservative alternative N/N_d + M_y/M_dy + M_z/M_dz ≤ 1.0 is also returned. 9.3.1.3 (semi-compact): the linear form.
 */
export function sectionStrengthRhs(p: { N: number; Nd: number; My: number; Mz: number; Mdy: number; Mdz: number; geom: RhsGeometry; props: RhsProps; cls: SectionClass }): Check {
  const n = Math.abs(p.N) / p.Nd;
  const lin = n + Math.abs(p.My) / p.Mdy + Math.abs(p.Mz) / p.Mdz;
  if (p.cls >= 3) {
    return mk({ id: 'section-9.3.1.3', name: 'Section strength, axial force and biaxial bending (semi-compact)', clause: 'IS 800 9.3.1.3', Ed: null, Rd: null, ratio: lin, unit: '-', notes: p.cls === 4 ? ['class 4: outside the scope of IS 800 (IS 801)'] : [], status: p.cls === 4 ? 'pending' : undefined, detail: { n, 'N/N_d + M_y/M_dy + M_z/M_dz': lin } });
  }
  const { aw, af, Mndy, Mndz } = reducedMomentsRhs({ n, A: p.props.A, b: p.geom.b, h: p.geom.h, tf: p.geom.t, tw: p.geom.t, Mdy: p.Mdy, Mdz: p.Mdz });
  const [a1, a2] = alphaTable17('rectangular-tube', n);
  const inter = (Math.abs(p.My) / Mndy) ** a1 + (Math.abs(p.Mz) / Mndz) ** a2;
  return mk({ id: 'section-9.3.1.1', name: 'Section strength, axial force and biaxial bending (plastic / compact)', clause: 'IS 800 9.3.1.1, 9.3.1.2 d), Table 17', Ed: null, Rd: null, ratio: inter, unit: '-',
    notes: ['the interaction (M_y/M_ndy)^α1 + (M_z/M_ndz)^α2 is applied with the reduced moment strengths of 9.3.1.2 d); the axial force enters through n = N/N_d in M_nd and α'],
    detail: { n, a_w: aw, a_f: af, 'M_ndy [Nmm]': Mndy, 'M_ndz [Nmm]': Mndz, α1: a1, α2: a2, 'linear form N/N_d + M_y/M_dy + M_z/M_dz': lin } });
}

// ---------------------------------------------------------------------------------------------------------------- 9.3.2 overall member strength
/** Table 18 equivalent uniform moment factor, the rows that are unambiguous in the printed table; `swayMode` gives 0.9 ("members with sway buckling mode"). */
export function cmFactor(p: { swayMode: boolean } | { psi: number } | { alphaS: number; psi: number; loading: 'uniform' | 'concentrated' }): number {
  if ('swayMode' in p) { if (!p.swayMode) throw new Error('Table 18: not a sway mode'); return 0.9; }
  if ('alphaS' in p) {
    const { alphaS: a, psi, loading } = p; let v: number;
    if (a >= 0) { if (a > 1) throw new Error('Table 18: α_s must be in [-1, 1]'); v = 0.2 + 0.8 * a; }
    else if (psi >= 0) v = loading === 'uniform' ? 0.1 - 0.8 * a : -0.8 * a;
    else v = loading === 'uniform' ? 0.1 * (1 - psi) - 0.8 * a : 0.2 * (1 - psi) - 0.8 * a;
    return Math.max(0.4, v);
  }
  if (!(p.psi >= -1 && p.psi <= 1)) throw new Error('Table 18: ψ must be in [-1, 1]');
  return Math.max(0.4, 0.6 + 0.4 * p.psi);
}

/** 9.3.2.1: reduced effective moment under tension and bending, M_eff = [M − ψ T Z_ec / A] ≤ M_d, ψ = 0.8 if T and M can vary independently, otherwise 1.0. */
export function momentUnderTension(p: { M: number; T: number; Zec: number; A: number; psi: 0.8 | 1.0 }): number {
  return Math.abs(p.M) - (p.psi * p.T * p.Zec) / p.A;
}

/**
 * 9.3.2.2 (members under axial compression and biaxial bending):
 *   P/P_dy + K_y C_my M_y/M_dy + K_LT M_z/M_dz ≤ 1.0
 *   P/P_dz + 0.6 K_y C_my M_y/M_dy + K_z C_mz M_z/M_dz ≤ 1.0
 * K_y = 1 + (λ_y − 0.2) n_y ≤ 1 + 0.8 n_y;  K_z = 1 + (λ_z − 0.2) n_z ≤ 1 + 0.8 n_z;  K_LT = 1 − 0.1 λ_LT n_y/(C_mLT − 0.25) ≥ 1 − 0.1 n_y/(C_mLT − 0.25);
 * n_y = P/P_dy, n_z = P/P_dz. y = minor axis, z = major axis (IS 800 convention). For hollow sections no LTB: λ_LT = 0, K_LT = 1 (8.2.2 b), documented.
 * The equations are printed with the moment indices as above; the C_m factors are inputs (Table 18).
 */
export function memberInteraction(p: { P: number; Pdy: number; Pdz: number; My: number; Mz: number; Mdy: number; Mdz: number; lambdaY: number; lambdaZ: number; lambdaLT: number; Cmy: number; Cmz: number; CmLT: number }): Check {
  const ny = p.P / p.Pdy, nz = p.P / p.Pdz;
  const Ky = Math.min(1 + (p.lambdaY - 0.2) * ny, 1 + 0.8 * ny), Kz = Math.min(1 + (p.lambdaZ - 0.2) * nz, 1 + 0.8 * nz);
  const KLT = Math.max(1 - (0.1 * p.lambdaLT * ny) / (p.CmLT - 0.25), 1 - (0.1 * ny) / (p.CmLT - 0.25));
  const e1 = p.P / p.Pdy + (Ky * p.Cmy * Math.abs(p.My)) / p.Mdy + (KLT * Math.abs(p.Mz)) / p.Mdz;
  const e2 = p.P / p.Pdz + (0.6 * Ky * p.Cmy * Math.abs(p.My)) / p.Mdy + (Kz * p.Cmz * Math.abs(p.Mz)) / p.Mdz;
  return mk({ id: 'member-9.3.2.2', name: 'Member strength, axial compression and biaxial bending', clause: 'IS 800 9.3.2.2, Table 18', Ed: null, Rd: null, ratio: Math.max(e1, e2), unit: '-', notes: [],
    detail: { 'eq. 1': e1, 'eq. 2': e2, K_y: Ky, K_z: Kz, K_LT: KLT, n_y: ny, n_z: nz, C_my: p.Cmy, C_mz: p.Cmz, C_mLT: p.CmLT } });
}

export { pendingCheck, mk as makeCheck };
