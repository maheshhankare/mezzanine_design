import * as D from './is800';
import { routeAvailability, type CodeFeature } from '../../../shared/codeRegister';

/**
 * IS 800:2007 design of one hot-rolled / welded rectangular hollow section member from the stations of the analysis result. Everything the design needs
 * that the standard leaves to the engineer (effective lengths, the manufacturing route that decides the buckling class, the sway-mode C_m) is a REQUIRED
 * input: nothing is defaulted. Sections that the implemented provisions do not cover (cold-formed, open, angles) are reported PENDING with the reason,
 * never silently designed with another standard's rules.
 */

export interface Station { x: number; N: number; Vy: number; Vz: number; T: number; My: number; Mz: number } // N, N·mm; tension positive
export type SectionKind = 'rhs' | 'open' | 'angle' | 'cold-formed' | 'unknown';

export interface HollowMemberInput {
  memberId: number;
  combination: string;
  geom: D.RhsGeometry; // b along local y, h along local z
  material: D.Material;
  /** Table 10: hot-rolled hollow section (class a), cold-formed hollow section (b), welded box (b) */
  manufacture: 'hollow-hot-rolled' | 'hollow-cold-formed' | 'welded-box';
  length: number;
  /** effective lengths for flexural buckling about the local y axis and the local z axis [mm]: REQUIRED (IS 800 7.2) */
  KLy?: number;
  KLz?: number;
  stations: Station[];
  /** C_my, C_mz: 'sway' = 0.9 (Table 18, members with a sway buckling mode) or 'table' = row A (ψ from the end moments) */
  cm: 'sway' | 'table';
  /** 1.2 / 1.5 limit of 8.2.1.2 only for a stated support case */
  supportCase?: 'simply-supported' | 'cantilever';
}

export interface MemberDesignResult {
  memberId: number;
  combination: string;
  checks: (D.Check & { x?: number })[];
  governing: D.Check | null;
  /** the worst status of the checks: 'fail' > 'pending' > 'ok' */
  status: D.Status;
  notes: string[];
  label: 'verified' | 'provisional' | 'pending';
}

/** Which register feature governs a section kind. */
export function featureFor(kind: SectionKind): CodeFeature | null {
  return kind === 'rhs' ? 'is800.design.hollow' : kind === 'open' ? 'is800.design.open-sections' : kind === 'angle' ? 'is800.design.angles' : kind === 'cold-formed' ? 'is800.design.cold-formed' : null;
}

export function pendingMember(memberId: number, combination: string, kind: SectionKind, why?: string): MemberDesignResult {
  const f = featureFor(kind);
  const a = f ? routeAvailability(f) : null;
  const reason = why ?? (a ? a.reasons.join(' ') : 'the section type is not known to the design');
  return { memberId, combination, checks: [D.pendingCheck('member', 'Member design', 'IS 800', reason)], governing: null, status: 'pending', notes: [reason], label: 'pending' };
}

const worst = (cs: D.Check[]): D.Status => (cs.some((c) => c.status === 'fail') ? 'fail' : cs.some((c) => c.status === 'pending') ? 'pending' : 'ok');

export function designHollowMember(inp: HollowMemberInput): MemberDesignResult {
  const avail = routeAvailability('is800.design.hollow');
  if (avail.state === 'blocked') return pendingMember(inp.memberId, inp.combination, 'rhs');
  const errs: string[] = [];
  if (!(inp.KLy! > 0) || !(inp.KLz! > 0)) errs.push('effective lengths KL_y and KL_z are required (IS 800 7.2): none is assumed');
  if (!(inp.material.fy > 0) || !(inp.material.E > 0)) errs.push('f_y and E must be positive');
  if (!inp.stations.length) errs.push('no stations of the analysis result');
  if (errs.length) return pendingMember(inp.memberId, inp.combination, 'rhs', errs.join('; '));

  const { geom, material } = inp, fy = material.fy, E = material.E, p = D.rhsProps(geom);
  const NdA = (p.A * fy) / D.GAMMA_M0, cls = D.bucklingClassFor(inp.manufacture);
  const checks: (D.Check & { x?: number })[] = [], notes: string[] = [];
  const tag = (c: D.Check, x?: number) => { const o = Object.assign(c, { x }); checks.push(o); return o; };

  // ---- the stations: governing values
  const maxBy = (f: (s: Station) => number) => inp.stations.reduce((a, s) => (f(s) > f(a) ? s : a));
  const sC = maxBy((s) => -s.N), sT = maxBy((s) => s.N), sVy = maxBy((s) => Math.abs(s.Vy)), sVz = maxBy((s) => Math.abs(s.Vz));
  const Pmax = Math.max(0, -sC.N);

  // ---- classification: the most critical class over the stations (combined stress, web with r1 = r2 = average axial stress / f_y/γ_m0)
  let clsRes: D.ClassResult | null = null;
  for (const s of inp.stations) {
    const sigma = Math.max(0, -s.N) / p.A, fcd = fy / D.GAMMA_M0;
    const hasM = Math.abs(s.My) + Math.abs(s.Mz) > 0;
    const c = D.classifyRhs({ flatWidth: p.flatWidth, flatDepth: p.flatDepth, t: geom.t, fy, state: s.N < 0 ? (hasM ? 'combined' : 'axial') : hasM ? 'bending' : 'axial', r1: s.N < 0 ? sigma / fcd : (s.N / p.A) / fcd, r2: s.N < 0 ? sigma / fcd : (s.N / p.A) / fcd });
    if (!clsRes || c.cls > clsRes.cls) clsRes = c;
  }
  const section = clsRes!;
  notes.push(`section class ${section.cls} (IS 800 3.7, Table 2): ${section.elements.map((e) => `${e.name} ${e.ratio.toFixed(1)} limits ${e.limits.map((l) => l.toFixed(1)).join('/')}`).join('; ')}`, ...section.notes);
  if (section.cls === 4) return Object.assign(pendingMember(inp.memberId, inp.combination, 'rhs', 'class 4 (slender) section: outside IS 800, refer to IS 801 (3.7.2 d)'), { notes: [...notes, 'class 4 section'] });

  // ---- 6.2 tension
  if (sT.N > 0) tag(D.tensionYield({ N: sT.N, Ag: p.A, fy }), sT.x);
  // ---- 7.1.2 compression: section and flexural buckling about both axes
  if (Pmax > 0) {
    tag(D.makeCheck({ id: 'compression-section', name: 'Compression: section resistance A f_y/γ_m0', clause: 'IS 800 7.1.2 (squash limit f_cd ≤ f_y/γ_m0)', Ed: Pmax, Rd: NdA, unit: 'N', notes: [], detail: { 'N_d = A f_y/γ_m0': NdA } }), sC.x);
  }
  const rMinorLocalY = Math.sqrt(p.Iy / p.A), rLocalZ = Math.sqrt(p.Iz / p.A); // about local y (bending in x-z) and local z
  const cy = D.compressionBuckling({ P: Pmax, Ae: p.A, fy, E, KL: inp.KLy!, r: rMinorLocalY, cls, axis: 'local y' });
  const cz = D.compressionBuckling({ P: Pmax, Ae: p.A, fy, E, KL: inp.KLz!, r: rLocalZ, cls, axis: 'local z' });
  if (Pmax > 0) { tag(cy, sC.x); tag(cz, sC.x); }
  // ---- 8.4.1 shear (Vz parallel to the depth h, Vy parallel to the width b)
  const shz = D.shearPlastic({ V: sVz.Vz, Av: p.Avh, fyw: fy, label: 'z', dOverT: p.flatDepth / geom.t }), shy = D.shearPlastic({ V: sVy.Vy, Av: p.Avb, fyw: fy, label: 'y', dOverT: p.flatWidth / geom.t });
  tag(shz, sVz.x); tag(shy, sVy.x);

  // ---- 8.2 bending strength, 9.2.2 under high shear
  const bz = D.bendingStrengthSupported({ Ze: p.Zey, Zp: p.Zpy, fy, cls: section.cls, supportCase: inp.supportCase }); // bending about local y
  const by = D.bendingStrengthSupported({ Ze: p.Zez, Zp: p.Zpz, fy, cls: section.cls, supportCase: inp.supportCase }); // bending about local z
  notes.push(...bz.notes);
  let MdY = bz.Md, MdZ = by.Md;
  const highShear = (V: number, Vd: number) => Math.abs(V) > 0.6 * Vd;
  if (highShear(sVz.Vz, shz.Vd) || highShear(sVy.Vy, shy.Vd)) {
    notes.push('V > 0.6 V_d: moment capacity reduced per 9.2.2 (the two webs are taken as the shear area: assumption); the reduction is applied to both axes at the governing station');
    const Mfd = ((p.Zpy - (geom.t * p.flatDepth ** 2) / 2) * fy) / D.GAMMA_M0;
    if (highShear(sVz.Vz, shz.Vd)) MdY = D.bendingHighShear({ V: sVz.Vz, Vd: shz.Vd, Md: bz.Md, Mfd, Ze: p.Zey, fy, cls: section.cls }).Mdv;
    if (highShear(sVy.Vy, shy.Vd)) MdZ = D.bendingHighShear({ V: sVy.Vy, Vd: shy.Vd, Md: by.Md, Mfd, Ze: p.Zez, fy, cls: section.cls }).Mdv;
  }

  // ---- 9.3.1 section strength at each station: the governing one
  let secWorst: (D.Check & { x?: number }) | null = null, linWorst = 0, linStation: Station | null = null;
  for (const s of inp.stations) {
    const c = D.sectionStrengthRhs({ N: s.N, Nd: NdA, My: s.My, Mz: s.Mz, Mdy: MdY, Mdz: MdZ, geom, props: p, cls: section.cls });
    const lin = Math.abs(s.N) / NdA + Math.abs(s.My) / MdY + Math.abs(s.Mz) / MdZ;
    if (!secWorst || (c.ratio ?? 0) > (secWorst.ratio ?? 0)) secWorst = Object.assign(c, { x: s.x });
    if (lin > linWorst) { linWorst = lin; linStation = s; }
  }
  tag(secWorst!, secWorst!.x);
  tag(D.makeCheck({ id: 'section-9.3.1.1-linear', name: 'Section strength, conservative linear form N/N_d + M_y/M_dy + M_z/M_dz', clause: 'IS 800 9.3.1.1 (conservative form)', Ed: null, Rd: null, ratio: linWorst, unit: '-', notes: ['the form reported by the RSTAB reference'], detail: {} }), linStation?.x);

  // ---- 9.3.2.2 overall member strength under compression and biaxial bending
  if (Pmax > 0) {
    const mx = (f: (s: Station) => number) => Math.max(...inp.stations.map((s) => Math.abs(f(s))));
    const first = inp.stations[0], last = inp.stations[inp.stations.length - 1];
    const psi = (a: number, b: number) => { const [lo, hi] = Math.abs(a) <= Math.abs(b) ? [a, b] : [b, a]; return Math.abs(hi) < 1e-9 ? 1 : Math.max(-1, Math.min(1, lo / hi)); };
    const cmY = inp.cm === 'sway' ? 0.9 : D.cmFactor({ psi: psi(first.My, last.My) }), cmZ = inp.cm === 'sway' ? 0.9 : D.cmFactor({ psi: psi(first.Mz, last.Mz) });
    // IS 800 names the minor axis y and the major axis z: assign by the second moments of area (a square tube: arbitrary)
    const minorIsLocalY = p.Iy <= p.Iz;
    const [Mminor, Mmajor] = minorIsLocalY ? [mx((s) => s.My), mx((s) => s.Mz)] : [mx((s) => s.Mz), mx((s) => s.My)];
    const [Mdminor, Mdmajor] = minorIsLocalY ? [MdY, MdZ] : [MdZ, MdY];
    const [Pdminor, Pdmajor] = minorIsLocalY ? [cy.Pd, cz.Pd] : [cz.Pd, cy.Pd];
    const [lamMinor, lamMajor] = minorIsLocalY ? [cy.res.lambda, cz.res.lambda] : [cz.res.lambda, cy.res.lambda];
    const [cmMinor, cmMajor] = minorIsLocalY ? [cmY, cmZ] : [cmZ, cmY];
    const c = D.memberInteraction({ P: Pmax, Pdy: Pdminor, Pdz: Pdmajor, My: Mminor, Mz: Mmajor, Mdy: Mdminor, Mdz: Mdmajor, lambdaY: lamMinor, lambdaZ: lamMajor, lambdaLT: 0, Cmy: cmMinor, Cmz: cmMajor, CmLT: 0.9 });
    c.notes.push('M_y, M_z are the maximum factored moments of the member (9.3.2.2); P is the largest compression along the member (conservative); hollow section: no lateral-torsional buckling (8.2.2 b), λ_LT = 0');
    tag(c, sC.x);
  }
  const status = worst(checks);
  const gov = checks.filter((c) => c.ratio !== null).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))[0] ?? null;
  const label: MemberDesignResult['label'] = avail.state === 'verified' ? 'verified' : 'provisional';
  if (avail.state === 'provisional') notes.push(...avail.reasons.map((r) => `provisional: ${r}`));
  return { memberId: inp.memberId, combination: inp.combination, checks, governing: gov, status, notes, label };
}
