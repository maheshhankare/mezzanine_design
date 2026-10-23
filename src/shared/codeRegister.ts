/**
 * Code-verification register for IS 800:2007, the only steel design standard supported by the application. Authoritative source for deciding whether a
 * code-specific feature may run: `routeAvailability(feature)`.
 *
 * STATUS RULES
 *  verified     the requirement was read in the OFFICIAL text supplied by the user and checked against the page image, it is implemented, and a
 *               test with a documented basis passes. Nothing else is 'verified'.
 *  provisional  implemented and tested, but it rests on an assumption the clause does not state, or on a decision of the project.
 *  pending      not implemented, or the text was not (completely) verified, or an additional standard (IS 801, IS 875, ...) that was not supplied is needed.
 *
 * Evidence: IS 800:2007 (Third Revision, December 2007), the supplied scan of 150 pages (the text layer is OCR: equations and tables were read on the
 * page images). No amendment is included in the supplied copy; amendments are NOT verified. Page numbers are PDF page numbers of the supplied file.
 * EN 1993 / Eurocode 3 and every National Annex were removed from the application's scope: nothing here refers to them as a design route.
 */
export type CodeStatus = 'verified' | 'provisional' | 'pending';
export type CodeKind = 'mandatory' | 'permitted-alternative' | 'modelling-assumption' | 'finding';
export type CodeScope = 'global-analysis' | 'member-analysis' | 'imperfection' | 'stability' | 'resistance' | 'classification';

/** features that can be enabled or blocked individually */
export type CodeFeature =
  | 'is800.notional-loads' | 'is800.second-order' | 'is800.first-order-amplification' | 'is800.critical-load-factor'
  | 'is800.design.hollow' | 'is800.design.open-sections' | 'is800.design.angles' | 'is800.design.cold-formed' | 'is800.design.connections';

export interface CodeItem {
  id: string;
  standard: 'IS 800';
  edition: string;
  clause: string;
  requirement: string;
  kind: CodeKind;
  scope: CodeScope;
  features: CodeFeature[];
  formula: string; // as printed in the official text
  parameters: string;
  applicability: string;
  status: CodeStatus;
  textVerified: boolean;
  implementation: string; // module / function, '' when none
  validation: string; // test and basis, '' when none
  evidence: string; // document, page
  outstanding: string; // what is still needed; '' when nothing
}

export const IS800_EDITION = 'IS 800:2007 (Third Revision, December 2007), supplied scan; amendments not supplied';
const T = 'scripts/test-codes.ts';
const TD = 'scripts/test-design.ts';

type Req = 'id' | 'clause' | 'requirement' | 'kind' | 'scope' | 'features' | 'status' | 'evidence';
const is = (p: Partial<CodeItem> & Pick<CodeItem, Req>): CodeItem => ({
  standard: 'IS 800', edition: IS800_EDITION, formula: '', parameters: '', applicability: '', textVerified: true, implementation: '', validation: '', outstanding: '', ...p,
});

export const CODE_REGISTER: CodeItem[] = [
  // ------------------------------------------------------------------ analysis provisions
  is({
    id: 'IS800-4.3.6', clause: '4.3.6', kind: 'mandatory', scope: 'imperfection', features: ['is800.notional-loads'], status: 'verified',
    requirement: 'To analyse a frame under gravity loads, considering its sway stability, notional horizontal forces are applied at each level, equal to 0.5 % of the factored dead load plus vertical imposed loads applied at that level. They account for practical imperfections.',
    formula: 'H_level = 0.005 · (factored dead + vertical imposed loads at that level)', parameters: 'factored vertical loads per level',
    applicability: 'frame under gravity loads; not applied together with other lateral loads such as wind and earthquake',
    implementation: 'src/server/frame/codes/is800.ts: is800NotionalLoads', validation: `${T}: level force = 0.5 % of the level load; sum over nodes = level force (basis: the clause, hand calculation)`,
    evidence: 'IS 800:2007 p. 24 (PDF p. 30), clause 4.3.6; read and checked on the page image',
  }),
  is({
    id: 'IS800-4.3.6-dist', clause: '4.3.6 (distribution within a level)', kind: 'modelling-assumption', scope: 'imperfection', features: ['is800.notional-loads'], status: 'provisional',
    requirement: 'The clause gives the force per LEVEL, not how it is shared between the nodes of the level. The tool distributes it in proportion to the factored vertical load at each node of the level (a modelling assumption).',
    implementation: 'is800NotionalLoads (distribution)', validation: `${T}: proportional distribution, resultant equals the clause value`,
    evidence: 'IS 800:2007 p. 24, 4.3.6 is silent on the distribution', outstanding: 'Project decision: confirm the distribution (by vertical load, by stiffness, by area) for the notional forces.',
  }),
  is({
    id: 'IS800-4.3.6.1', clause: '4.3.6.1', kind: 'mandatory', scope: 'imperfection', features: ['is800.notional-loads'], status: 'verified',
    requirement: 'Notional forces act on the whole structure, in both orthogonal directions, one direction at a time, at roof and all floor levels or their equivalent, simultaneously with the factored gravity loads.',
    implementation: 'is800NotionalLoadCases (one case per direction)', validation: `${T}: separate cases for X and Y, no case with both`,
    evidence: 'IS 800:2007 p. 24 (PDF p. 30), 4.3.6.1', outstanding: 'The clause does not say whether both senses (+/−) of a direction are to be examined; the tool generates +/− as separate cases (assumption, documented).',
  }),
  is({
    id: 'IS800-4.3.6.2', clause: '4.3.6.2 (a)-(d)', kind: 'mandatory', scope: 'imperfection', features: ['is800.notional-loads'], status: 'verified',
    requirement: 'The notional force shall not be (a) applied when considering overturning or overall instability; (b) combined with other horizontal (lateral) loads; (c) combined with temperature effects; (d) taken to contribute to the net shear on the foundation.',
    implementation: 'is800NotionalLoadApplicability; is800FoundationShearWithoutNotional', validation: `${T}: each of (a)-(d) is refused / the foundation shear excludes the notional resultant`,
    evidence: 'IS 800:2007 p. 24 (PDF p. 30), 4.3.6.2; read on the page image',
  }),
  is({
    id: 'IS800-4.3.6.3', clause: '4.3.6.3', kind: 'permitted-alternative', scope: 'imperfection', features: ['is800.notional-loads'], status: 'verified',
    requirement: 'The sway effect using notional load under the gantry load case need not be considered if the ratio of height to lateral width of the building is less than unity.',
    implementation: 'is800GantryNotionalExempt', validation: `${T}: ratio < 1 exempt, ratio >= 1 not exempt`, evidence: 'IS 800:2007 p. 24 (PDF p. 30), 4.3.6.3',
  }),
  is({
    id: 'IS800-4.4.2', clause: '4.4.2 and 4.4.3.1', kind: 'mandatory', scope: 'global-analysis', features: ['is800.first-order-amplification'], status: 'provisional',
    requirement: 'First-order analysis neglects the change of geometry and of the effective member stiffness due to axial force; their effect on the moments is allowed for by moment amplification (4.4.3.2 / 4.4.3.3). Where the amplification factor C_y, C_z is greater than 1.4, a second-order elastic analysis according to Annex B shall be carried out. Second-order effects are taken into account by either (a) first-order analysis with moment amplification provided C_y and C_z are not greater than 1.4, or (b) second-order elastic analysis per Annex B.',
    formula: 'C_y, C_z > 1.4  =>  second-order analysis (Annex B)', parameters: 'C_y, C_z from 4.4.3.2 / 4.4.3.3',
    implementation: 'is800SecondOrderRequired(C)', validation: `${T}: C = 1.4 first order permitted, C = 1.41 second order required`, evidence: 'IS 800:2007 p. 24 (PDF p. 30), 4.4.2 and 4.4.3.1',
    outstanding: 'The decision rule is implemented, but the amplification factor itself is not: 4.4.3.3 refers to C_my, C_mz of 9.3.2.2 / Table 18 (equivalent uniform moment factors), which are not amplification factors in the usual sense. The factor to use is an engineering interpretation to be settled. The application therefore uses the second-order analysis of Annex B (4.4.3.1 b) and does not offer first order with amplification as a design route.',
  }),
  is({
    id: 'IS800-4.6.2b', clause: '4.6.1, 4.6.2 (b)', kind: 'permitted-alternative', scope: 'stability', features: ['is800.critical-load-factor'], status: 'verified',
    requirement: 'The elastic buckling load factor λcr is the ratio of the elastic buckling load set of the frame to the design load set; it shall be determined by approximate methods (4.6.2.1, 4.6.2.2) or by a rational elastic buckling analysis of the whole frame.',
    implementation: 'src/server/frame/solve.ts: criticalLoadFactor (Sturm count on the tangent stiffness, rational whole-frame analysis)', validation: 'scripts/test-frame.ts: Euler and cantilever critical loads (1e-4 %); scripts/test-codes.ts: agreement with the deflection method on a portal frame',
    evidence: 'IS 800:2007 p. 26 (PDF p. 32), 4.6.1-4.6.2', outstanding: 'The approximate methods 4.6.2.1 / 4.6.2.2 need the elastic buckling stress f_cc of 7.1.2.1 (formula verified, methods not implemented).',
  }),
  is({
    id: 'IS800-B-2.1', clause: 'Annex B, B-2.1', kind: 'mandatory', scope: 'global-analysis', features: ['is800.second-order'], status: 'verified',
    requirement: 'In a second-order elastic analysis members remain elastic; changes in frame geometry under the design load and changes in the effective stiffness of members due to axial forces shall be accounted for. If λcr > 5 (determined per 4.6) the changes in effective stiffness due to axial forces may be neglected.',
    applicability: 'the neglect of the stiffness change for λcr > 5 is optional and NOT used by the tool (the solver always includes the geometric stiffness)',
    implementation: 'src/server/frame/solve.ts (Theory II: geometric stiffness N·G on the deformed geometry)', validation: 'scripts/test-frame.ts: P-Delta cantilever (tan kL - kL), P-delta bow, beam-column (errors <= 0.003 %); RSTAB benchmark (docs/RSTAB_BENCHMARK.md)',
    evidence: 'IS 800:2007 p. 120 (PDF p. 126), B-2.1; read on the page image',
  }),
  is({
    id: 'IS800-B-2.2', clause: 'Annex B, B-2.2', kind: 'mandatory', scope: 'member-analysis', features: ['is800.second-order'], status: 'verified',
    requirement: 'The design bending moment under factored load is the maximum bending moment in the length of the member, determined (a) directly from the second-order analysis, (b) approximately, with enough elements, as the greatest of the element end moments, or (c) by amplifying the simple-beam moments. With zero axial force or axial tension no amplification.',
    implementation: 'src/server/frame/record.ts: governingMoment (a: maximum over the stations of the second-order analysis)', validation: `${T}: governing moment of a pinned beam-column equals the closed form`,
    evidence: 'IS 800:2007 p. 120 (PDF p. 126), B-2.2', outstanding: 'Route (c) not implemented (depends on the amplification factor of IS800-4.4.2).',
  }),
  is({
    id: 'IS800-B-3.2', clause: 'Annex B, B-3.1, B-3.2', kind: 'permitted-alternative', scope: 'stability', features: ['is800.critical-load-factor'], status: 'verified',
    requirement: 'Elastic critical load factor by the deflection method: ordinary linear elastic analysis for the horizontal deflections due to horizontal forces equal to the notional load of 4.3.6 at each floor, combined with gravity; λcr = 1/(200 φ_s,max), φ_s = (δ_u − δ_L)/h.',
    formula: 'λcr = 1 / (200 · φ_s,max);  φ_s = (δ_u − δ_L) / h', parameters: 'storey height h; δ_u, δ_L: horizontal deflection of the top / bottom of the storey due to the combined gravity and notional loads; base rigidity per 4.3.4',
    implementation: 'is800LambdaCrDeflection', validation: `${T}: formula on a hand example; comparison with the rational analysis (criticalLoadFactor) on a portal frame`,
    evidence: 'IS 800:2007 p. 120-121 (PDF p. 126-127), B-3.2; formula checked on the page image', outstanding: 'Base stiffness per 4.3.4 must be modelled by the user (supports/springs).',
  }),
  is({
    id: 'IS800-B-1', clause: 'Annex B, B-1', kind: 'permitted-alternative', scope: 'global-analysis', features: [], status: 'pending',
    requirement: 'Advanced structural analysis (residual stresses, geometrical imperfections, reduction in stiffness due to axial compression, second-order effects, section strength and ductility ...), for compact fully-restrained members.',
    evidence: 'IS 800:2007 p. 120 (PDF p. 126), B-1', outstanding: 'Not implemented (needs a material-nonlinear model); the clause gives no imperfection values.',
  }),
  is({
    id: 'IS800-imperfection-values', clause: '4.3.6, 4.4.3, Annex B-2 (finding)', kind: 'finding', scope: 'imperfection', features: ['is800.notional-loads'], status: 'verified',
    requirement: 'FINDING from the text: in 4.3 / 4.4 / Annex B-2 IS 800 represents practical imperfections in the frame analysis by the notional horizontal forces of 4.3.6 only. No initial sway or member bow VALUES for explicit geometric imperfections are given there (B-1.1 names geometrical imperfections for advanced analysis without values). Member bow effects enter through the buckling curves of Section 7. An explicit geometric imperfection is therefore a user-defined value, not a code value, and combining it with the notional forces represents the same practical imperfections twice unless the user justifies it.',
    implementation: 'resolveImperfectionSource (explicit geometry / bow refused as code route)', validation: `${T}: IS 800 route refuses explicit geometry, allows notional loads`,
    evidence: 'IS 800:2007 p. 24 and p. 120 (PDF p. 30, 126)',
  }),

  // ------------------------------------------------------------------ material properties and load combinations (C-section designer)
  is({
    id: 'IS800-2.2.4.1', clause: '2.2.4.1', kind: 'mandatory', scope: 'resistance', features: [], status: 'provisional', textVerified: false,
    requirement: 'Physical properties of structural steel irrespective of its grade: unit mass 7850 kg/m³, modulus of elasticity E = 2.0 × 10⁵ N/mm², Poisson ratio 0.3, modulus of rigidity G = 0.769 × 10⁵ N/mm², coefficient of thermal expansion 12 × 10⁻⁶ /°C.',
    formula: 'E = 200 000 N/mm²', implementation: 'src/server/engine/loads.ts (R.E), src/shared/schema.ts (E default)', validation: 'scripts/test-legacy.ts: the schema default of E is 200 000 N/mm²',
    evidence: 'IS 800:2007 2.2.4.1, OCR text of the supplied scan', outstanding: 'The page image of 2.2.4.1 has not been re-checked (the OCR text is unambiguous but the register rule requires the image).',
  }),
  is({
    id: 'IS800-3.5-Table4', clause: '3.5.1, Table 4', kind: 'mandatory', scope: 'resistance', features: [], status: 'provisional', textVerified: false,
    requirement: 'Load combinations for design: dead + imposed; dead + imposed + wind or earthquake; dead + wind or earthquake; dead + erection load, with the partial safety factors of Table 4. The C-section designer uses 1.5 (DL + IL) at the ultimate limit state and 1.0 (DL + IL) in service.',
    formula: 'ULS: 1.5 (DL + IL); SLS: 1.0 (DL + IL)', implementation: 'src/server/engine/loads.ts (route, uls)', validation: 'scripts/test-legacy.ts: the route is IS 800 with these factors',
    evidence: 'IS 800:2007 3.5.1 (OCR text lists the combinations); Table 4 is not in the OCR text', outstanding: 'The values of Table 4 must be read on the page image; wind, earthquake and erection combinations are not implemented in the C-section designer.',
  }),
  // ------------------------------------------------------------------ lateral restraint and bearing-type bolts
  is({
    id: 'IS800-8.3.4', clause: '8.3, 8.3.2, 8.3.4, 8.3.4.1', kind: 'mandatory', scope: 'stability', features: [], status: 'verified',
    requirement: 'Intermediate lateral restraints of a member must have sufficient strength and stiffness to prevent lateral movement of the compression flange at that point relative to the end supports; they must be connected to a bracing system or an independent robust part of the structure capable of transferring the restraint force; two or more parallel members requiring restraint shall not be simply connected together assuming mutual dependence; the restraint shall be connected as close to the compression flange as practicable. The restraint must resist 2.5 % of the maximum force in the compression flange, divided equally between the restraint points, and each point 1 % of it; in a series of solid-web beams on the same restraint system the sum is 2.5 % of the maximum flange force of ONE beam (8.3.4.1). With restraints at intervals the effective length for lateral-torsional buckling is the distance between them (1.2 times it for a destabilizing load) (8.3.2).',
    formula: 'F_R = max(0.025 F_cf / n ; 0.010 F_cf);  total to the supports = n F_R', parameters: 'F_cf maximum compression-flange force of the restrained beam; n restraint points',
    applicability: 'the clause gives NO numerical criterion for the stiffness: the application models the actual spring stiffness in the elastic buckling analysis and never assumes it rigid',
    implementation: 'src/server/frame/design/restraint.ts: restraintDemand; src/server/engine/restraint.ts: joists', validation: 'scripts/test-restraint.ts: hand values of the restraint force (2.5 %, 1 % minimum), the series rule and the engine response to the joist section, number, connection and anchorage',
    evidence: 'IS 800:2007 p. 58 (PDF p. 64), 8.3.1-8.3.4.2 and Table 15, read on the page image',
    outstanding: 'No numerical stiffness criterion exists in the clause (a finding, not an omission). Restraint of the secondary by decking or sheeting (8.3.5, purlins) is not implemented.',
  }),
  is({
    id: 'IS800-10.3', clause: '10.2.2, 10.2.4.2, 10.3.1, 10.3.2, 10.3.3, 10.3.3.1, 10.3.3.2, 10.3.4, 10.3.5, 10.3.6', kind: 'mandatory', scope: 'resistance', features: [], status: 'verified',
    requirement: 'Bearing-type bolts. Shear V_dsb = V_nsb/γ_mb, V_nsb = f_u/√3 (n_n A_nb + n_s A_sb); long joints l_j > 15 d: β_lj = 1.075 − l_j/(200 d), 0.75 ≤ β_lj ≤ 1.0; grip l_g > 5 d: β_lg = 8/(3 + l_g/d) ≤ β_lj, l_g ≤ 8 d; bearing V_dpb = 2.5 k_b d t f_u/γ_mb, k_b = min(e/3d_0, p/3d_0 − 0.25, f_ub/f_u, 1.0), reduced by 0.7 (oversize, short slot) / 0.5 (long slot); tension T_nb = 0.90 f_ub A_n < f_yb A_sb (γ_mb/γ_m0), T_db = T_nb/γ_mb; combined (V_sb/V_db)² + (T_b/T_db)² ≤ 1.0; V_db = min(V_dsb, V_dpb) (10.3.2). Hole sizes: see IS800-10.2.1-round, IS800-10.2.1-oversize and IS800-10.2.1-slots. Pitch ≥ 2.5 d, end / edge distance ≥ 1.7 d_0 (sheared, hand-flame cut) or 1.5 d_0 (rolled, machine-flame cut, sawn, planed). γ_mb = 1.25 (Table 5).',
    formula: 'V_dsb = f_u (n_n A_nb + n_s A_sb) / (√3 γ_mb);  V_dpb = 2.5 k_b d t f_u / γ_mb;  T_db = min(0.9 f_ub A_n ; f_yb A_sb γ_mb/γ_m0)/γ_mb', parameters: 'bolt grade, d, d_0, e, p, t, f_u; A_n = net tensile stress area (IS 1367 values, the ISO metric tensile stress area)',
    applicability: 'bearing-type bolts, hole diameter d_0 as given by the caller (the hole-size rules are the separate items IS800-10.2.1-round / -oversize / -slots); not implemented: packing plates (10.3.3.3), countersunk heads (10.2.6, 10.3.4), friction-grip bolts (10.4); block shear is IS800-6.4; bearing on cold-formed thin material is outside it (IS 801)',
    implementation: 'src/server/frame/design/restraint.ts: boltShearCapacity, boltBearingCapacity, boltTensionCapacity, boltCombined, boltGeometry; src/server/engine/resist.ts (same equations)', validation: 'scripts/test-restraint.ts: hand values of every equation, the limits of beta_lj / beta_lg, k_b and the geometry rules',
    evidence: 'IS 800:2007 p. 73-76 (PDF p. 79-82), 10.2.2, 10.2.4.2 and 10.3.1-10.3.6, read on the page images and re-read against the code on 23 Oct 2026',
    outstanding: 'A_n (10.3.5) is taken from the ISO metric tensile-stress-area table (the clause refers to the appropriate Indian Standard, IS 1367, not supplied). Conservative readings: 10.3.3.1 is applied whenever l_j > 15 d (the clause says "more than two bolts"); the 10.3.4 factor 0.7 is applied to the vertical-slot option in any direction (the clause reduces the resistance normal to the slots); no long-slot hole type exists in the engine. Not implemented: 10.3.3.3, 10.2.6, 10.4. History: until 23 Oct 2026 this item also listed 10.2.1 and Table 19; those provisions are now IS800-10.2.1-round, -oversize and -slots (the evidence and the verified status of the bolt equations are unchanged). Verified against IS 800:2007 as supplied, WITHOUT its amendments (BIS records 2; not supplied).',
  }),
  is({
    id: 'IS800-10.2.1-round', clause: '10.2.1 a)', kind: 'mandatory', scope: 'resistance', features: [], status: 'verified',
    requirement: 'Standard clearance hole: diameter of the hole = nominal diameter of the fastener + clearance of Table 19 column 3: d = 12-14 mm: 1.0 mm; 16-22 mm: 2.0 mm; 24 mm: 2.0 mm; larger than 24 mm: 3.0 mm.',
    formula: 'd_0 = d + c (c from Table 19 column 3)', parameters: 'nominal bolt diameter d', applicability: 'standard round holes, d ≥ 12 mm; sizes the table does not list (15, 23 mm) take the next listed row; below 12 mm the table gives nothing: d + 1 is an assumption, flagged on the checks',
    implementation: 'src/server/frame/design/restraint.ts: holeClearance, holeDiameter, standardClearance (used by the connections, knee brace, vertical bracing, plan bracing and joist checks)', validation: 'scripts/test-restraint.ts: Table 19 column 3 for 12, 14, 15, 16, 22, 23, 24, 25, 26, 27 and 30 mm, the boundaries at 14/16, 24/25, invalid diameters, and the hole diameter of the connection, knee-brace and vertical-bracing checks from 12 to 30 mm',
    evidence: 'IS 800:2007 p. 73 (PDF p. 79), 10.2.1 a) and Table 19 column 3, read on the page image',
    outstanding: 'Below 12 mm: d + 1 is an assumption (flagged). History: before commit a680a16 five engine rules diverged from this column for d > 24 mm (one for d >= 16 in a check it did not affect); the joist rule already matched. Verified against the 2007 base text, without amendments (not supplied).',
  }),
  is({
    id: 'IS800-10.2.1-oversize', clause: '10.2.1 b), Table 19 column 4, 10.2.4.1 (over-size holes)', kind: 'mandatory', scope: 'resistance', features: [], status: 'provisional',
    requirement: 'Over-size hole: diameter = d + Table 19 column 4 (12-14 mm: 3.0; 16-22: 4.0; 24: 6.0; larger than 24: 8.0 mm); allowed only in slip-resistant and hold-down bolted connections where specified, with the outer ply covered by a cover plate and hardened washer (10.2.1 b); edge and end distances in over-size holes are taken as the distance to the relevant edge plus half the standard clearance hole diameter less the nominal over-size diameter (10.2.4.1); bearing resistance may be reduced by 0.7 (10.3.4).',
    formula: 'd_0 = d + c (c from Table 19 column 4)', parameters: 'nominal bolt diameter d', applicability: 'the hole SIZE of an over-size round hole only',
    implementation: 'src/server/frame/design/restraint.ts: holeClearance(d, oversize), holeDiameter; src/server/engine/conn.ts d0auto', validation: 'scripts/test-restraint.ts: Table 19 column 4 for the same sizes and boundaries, and the over-size hole diameter of the connection checks from 12 to 30 mm',
    evidence: 'IS 800:2007 p. 73-75 (PDF p. 79-81), 10.2.1 b), Table 19 column 4, 10.2.4.1, 10.3.4, read on the page images',
    outstanding: 'The conditions of use of 10.2.1 b) are NOT modelled: the connection input allows an over-size hole in a bearing-type connection without a flag. The edge / end distance rule of 10.2.4.1 is NOT modelled (distances are used as entered). Below 12 mm d + 3 is the previous assumption, flagged. Provisional until these are modelled or the connections are restricted.',
  }),
  is({
    id: 'IS800-10.2.1-slots', clause: '10.2.1 c), Table 19 columns 5-6, 10.2.4.1 (slotted holes)', kind: 'mandatory', scope: 'resistance', features: [], status: 'pending', textVerified: false,
    requirement: 'Short and long slots: length of the slot = d + Table 19 column 5 (4.0 / 6.0 / 8.0 / 10.0 mm by size) or d + 2.5 d (column 6, long slot); allowed in slip-resistant and hold-down bolted connections only where specified (10.2.1 c); edge and end distances in slots are measured from the edge to the centre of the end radius or the slot centre line, whichever is smaller (10.2.4.1); bearing reduced by 0.7 (short) / 0.5 (long), resistance normal to the slots (10.3.4); K_h 0.85 / 0.7 for slip resistance (10.4.3).',
    evidence: 'IS 800:2007 p. 73-76 (PDF p. 79-82), 10.2.1 c), Table 19 columns 5-6, 10.2.4.1, 10.3.4: read for documentation, not implemented',
    outstanding: 'NOT MODELLED: slot length (no slot dimension is used by any check), the usage conditions, the edge-distance rule, and a long-slot hole type. The Short slot, vertical (adjustment) option of the connection input uses the STANDARD hole width with the 0.7 bearing factor and a REVIEW check on slip (10.4); no check on a slotted connection can be PASS or FAIL on the strength of this item. Nothing here is verified.',
  }),
  // ------------------------------------------------------------------ member design
  is({
    id: 'IS800-5.4.1', clause: '5.4.1, Table 5', kind: 'mandatory', scope: 'resistance', features: ['is800.design.hollow', 'is800.design.angles', 'is800.design.open-sections'], status: 'verified',
    requirement: 'Partial safety factors for materials: γ_m0 = 1.10 for resistance governed by yielding and for member buckling; γ_m1 = 1.25 for resistance governed by ultimate stress; connections 1.25 (1.50 field welds).',
    formula: 'γ_m0 = 1.10, γ_m1 = 1.25', implementation: 'src/server/frame/design/is800.ts: GAMMA_M0, GAMMA_M1', validation: `${TD}: constants`, evidence: 'IS 800:2007 p. 30 (PDF p. 36), Table 5',
  }),
  is({
    id: 'IS800-3.7', clause: '3.7, Table 2 (hollow sections, angles)', kind: 'mandatory', scope: 'classification', features: ['is800.design.hollow', 'is800.design.angles'], status: 'verified',
    requirement: 'Cross-section classes 1-4 from the width-to-thickness ratios of the plate elements, ε = (250/f_y)^½. Rectangular hollow sections are treated as box sections: internal compression flange 29.3ε / 33.5ε / 42ε in bending and 42ε (class 3 only) in axial compression; web with neutral axis at mid-depth 84ε / 105ε / 126ε, axial compression 42ε, generally with r1, r2. Angles in bending 9.4ε / 10.5ε / 15.7ε; single or separated double angles in axial compression 15.7ε, 15.7ε, (b+d)/t ≤ 25ε. The section is classified by its most critical element. Class 4 sections are outside IS 800 (refer to IS 801).',
    formula: 'web, r1 negative: 84ε/(1+r1), 105ε/(1+r1), 126ε/(1+2r2) (≤ 42ε); r1 positive: 84ε/(1+r1) (≤ 42ε), 105ε/(1+1.5r1) (≤ 42ε)', parameters: 'b/t, d/t, f_y, r1, r2',
    implementation: 'src/server/frame/design/is800.ts: classifyRhs, classifyAngle', validation: `${TD}: limits of every row against the table, boundary cases, the benchmark box 28 < 29.3`,
    evidence: 'IS 800:2007 p. 17-18 (PDF p. 23-25), Table 2 read on the page image',
    outstanding: 'For a flange under combined axial force and bending the table has no row; the bending row is used (assumption). RSTAB assigns class 3 to some such locations by a rule that could not be reproduced. The flat width of a hollow section is taken between the inner faces.',
  }),
  is({
    id: 'IS800-6.2', clause: '6.1, 6.2', kind: 'mandatory', scope: 'resistance', features: ['is800.design.hollow', 'is800.design.open-sections', 'is800.design.angles'], status: 'verified',
    requirement: 'Design strength in tension is the lowest of yielding of the gross section T_dg = A_g f_y/γ_m0, rupture of the critical section (6.3) and block shear (6.4).',
    formula: 'T_dg = A_g f_y / γ_m0', implementation: 'tensionYield', validation: `${TD}: hand value; scripts/rstab/compare-is-design.ts: 99 RSTAB rows within 0.005`,
    evidence: 'IS 800:2007 p. 32 (PDF p. 38), 6.1-6.2', outstanding: 'Only the yielding check is applied to members: rupture and block shear are IS800-6.3, IS800-6.3.3 and IS800-6.4.',
  }),
  is({
    id: 'IS800-6.3', clause: '6.3, 6.3.1, 6.3.2 (rupture of the net section of plates and threaded rods)', kind: 'mandatory', scope: 'resistance', features: [], status: 'provisional',
    requirement: 'Plates: T_dn = 0.9 A_n f_u/γ_m1 with A_n = [b − n d_h + Σ p_si²/(4 g_i)] t (d_h: hole diameter, 2 mm more for directly punched holes); threaded rods: T_dn = 0.9 A_n f_u/γ_m1 with the net root area; γ_m1 = 1.25 (Table 5).',
    formula: 'T_dn = 0.9 A_n f_u / γ_m1', parameters: 'A_n, f_u (b, t, n, d_h, p_s, g for the net area)', applicability: 'tension members of plate or rod type; the critical section is the failure path of smallest net area, to be listed by the user of the function',
    implementation: 'tension.ts: netAreaPlate, criticalNetArea, plateRupture, threadedRodRupture; applied to the flat vertical bracing diagonal (restraint.ts, one hole assumed)', validation: 'scripts/test-tension.ts: hand values (net area with punched and staggered holes, T_dn of a plate and a rod, invalid inputs refused)',
    evidence: 'IS 800:2007 p. 32-33 (PDF p. 38-39) 6.3.1, 6.3.2 read on the page images; Table 5 (p. 30)',
    outstanding: 'Implemented and tested, awaiting your review (not VERIFIED). The vertical bracing check assumes one hole in the critical section. Threaded rods: the net ROOT area (ISO 724 d_3 = d − 1.22687 P, coarse pitch; `threadRootArea`) is available as a function but no member of the application uses a threaded rod in tension, so it is not applied. The C-section web (thin cold-formed material) stays pending (IS 801).',
  }),
  is({
    id: 'IS800-6.3.3', clause: '6.3.3, 6.3.4, Fig. 6 (angles and rolled sections connected through part of their elements, shear lag)', kind: 'mandatory', scope: 'resistance', features: ['is800.design.angles'], status: 'provisional',
    requirement: 'Single angle: T_dn = 0.9 A_nc f_u/γ_m1 + β A_go f_y/γ_m0, β = 1.4 − 0.076 (w/t)(f_y/f_u)(b_s/L_c), 0.7 ≤ β ≤ f_u γ_m0/(f_y γ_m1); b_s = w + w_1 − t (bolted) or w (welded). 6.3.4: the same equation may be used for double angles, channels, I-sections and other rolled sections with b_s the shear-lag distance.',
    formula: 'T_dn = 0.9 A_nc f_u/γ_m1 + β A_go f_y/γ_m0', parameters: 'A_nc, A_go, w, t, b_s, L_c, f_y, f_u', applicability: 'angles connected through one leg and other rolled sections connected through part of their elements',
    implementation: 'tension.ts: shearLagWidthAngle, shearLagRupture, angleAreasCentreLine, singleAngleRupture, connectedElementRupture; applied to the knee brace in tension (restraint.ts)', validation: 'scripts/test-tension.ts: hand values (β inside and at both limits, single bolt, bolted and welded 100×100×10 angle, back-to-back, lower bound)',
    evidence: 'IS 800:2007 p. 33 (PDF p. 39) 6.3.3, 6.3.4 and Fig. 6 read on the page image',
    outstanding: 'Implemented as engineering decisions (docs/TECHNICAL_DECISIONS_6.3_6.4.md), awaiting your review (not VERIFIED): the text gives no convention for A_nc and A_go (centre-line areas adopted: they close to the gross area and agree with the centre-line path b_s = (w − t/2) + (w_1 − t/2)); two angles back to back = 2 × one angle (6.3.4 "may"); channels, I-sections and other rolled sections: only a lower bound (6.3.1 on the connected elements) is available because 6.3.4 defines neither w, t, A_nc nor A_go for them. The knee-brace check takes leg b as the connected leg and one bolt line. The angle compression check (7.5) is still pending, so the angle route stays blocked.',
  }),
  is({
    id: 'IS800-6.4', clause: '6.4, 6.4.1, 6.4.2, Fig. 7 (block shear)', kind: 'mandatory', scope: 'resistance', features: [], status: 'provisional',
    requirement: 'Block shear strength T_db is the smaller of A_vg f_y/(√3 γ_m0) + 0.9 A_tn f_u/γ_m1 and 0.9 A_vn f_u/(√3 γ_m1) + A_tg f_y/γ_m0 (A_vg, A_vn: gross and net shear areas along the bolt line parallel to the force; A_tg, A_tn: gross and net tension areas from the bolt hole to the toe / end bolt line perpendicular to the force). Welded connections (6.4.2): check an appropriate section around the end weld which can shear off as a block.',
    formula: 'T_db = min[A_vg f_y/(√3 γ_m0) + 0.9 A_tn f_u/γ_m1 ; 0.9 A_vn f_u/(√3 γ_m1) + A_tg f_y/γ_m0]', parameters: 'A_vg, A_vn, A_tg, A_tn, f_y, f_u', applicability: 'bolted end connections of plates and angles (Fig. 7A, 7B); welded: areas given by the user',
    implementation: 'tension.ts: blockShear, blockShearAreas; applied to the plate of the shear connections (conn.ts) and the knee-brace end (restraint.ts), one-sided tear-out with gross and net areas', validation: 'scripts/test-tension.ts: hand values (Fig. 7A plate, Fig. 7B angle end, one and two bolt lines, invalid patterns refused); scripts/test-legacy.ts',
    evidence: 'IS 800:2007 p. 33-34 (PDF p. 39-40) 6.4, 6.4.1, 6.4.2 and Fig. 7 read on the page images',
    outstanding: 'Implemented and tested, awaiting your review (not VERIFIED). The text defines the areas but not where the shear length and tension length start and end: the code measures the shear length from the end of the member to the centre of the last hole and the tension length between hole centres (or from the hole centre to the free edge), as read from Fig. 7. Applied to the plate of the shear connections and to the knee-brace end (one bolt line, Fig. 7B). The vertical bracing end is an explicit PENDING check (no bolt-pattern inputs); the C-section web stays pending (IS 801). The two expressions are cross-checked against a published STAAD.Pro validation problem (docs/TECHNICAL_VALIDATION_REPORT_6.3_6.4.md): its second expression is reproduced, its printed first expression is inconsistent with its printed A_tn (explained there); the areas of that problem are not printed with their geometry, so the Fig. 7 reading is supported, not proven. The welded case (6.4.2) has no geometry in the text: no application.',
  }),
  is({
    id: 'IS800-7.1.2', clause: '7.1.1, 7.1.2, 7.1.2.1, Tables 7, 8, 9', kind: 'mandatory', scope: 'resistance', features: ['is800.design.hollow', 'is800.design.open-sections', 'is800.design.angles'], status: 'verified',
    requirement: 'Design compressive strength P_d = A_e f_cd; f_cd = (f_y/γ_m0)/(φ + (φ² − λ²)^0.5) = χ f_y/γ_m0 ≤ f_y/γ_m0; φ = 0.5[1 + α(λ − 0.2) + λ²]; λ = (f_y/f_cc)^0.5; f_cc = π²E/(KL/r)²; α = 0.21, 0.34, 0.49, 0.76 for buckling class a, b, c, d (Table 7).',
    formula: 'f_cd = χ f_y/γ_m0;  φ = 0.5[1 + α(λ − 0.2) + λ²]', parameters: 'KL/r, f_y, E, buckling class',
    implementation: 'compressiveStress, compressionBuckling', validation: `${TD}: χ and f_cd against the printed Tables 8(a), 8(c) and 9(d) (E = 2e5)`,
    evidence: 'IS 800:2007 p. 34-37 (PDF p. 40-49), 7.1.2.1, Tables 7, 8, 9 read on the page images', outstanding: 'The effective length KL is a user input (7.2 and Table 11 are not implemented).',
  }),
  is({
    id: 'IS800-7.1.2.2', clause: '7.1.2.2, Table 10', kind: 'mandatory', scope: 'resistance', features: ['is800.design.hollow'], status: 'verified',
    requirement: 'Buckling class of the cross-section: hollow sections hot rolled a, cold formed b (any axis); welded box b (generally; c for thick welds); channel, angle, T and solid sections c; built-up members c.',
    implementation: 'bucklingClassFor', validation: `${TD}: Table 10 rows read`, evidence: 'IS 800:2007 p. 44 (PDF p. 50), Table 10 read on the page image',
    outstanding: 'The rows for rolled and welded I-sections (depending on h/b_f and t_f) were not transcribed: open I-sections remain pending.',
  }),
  is({
    id: 'IS800-7.2', clause: '7.2, Table 11, Annex D (effective length)', kind: 'mandatory', scope: 'resistance', features: [], status: 'pending', textVerified: false,
    requirement: 'The effective length KL follows from the end restraint (Table 11) or, for sway frames, from Annex D.',
    implementation: 'NOT implemented: the effective length KL of each member and axis is a REQUIRED USER INPUT of the design (no default is assumed; the RSTAB reference used k = 1.0)', validation: '',
    evidence: 'IS 800:2007 p. 41 (PDF p. 41-45): not read on the page images', outstanding: 'Effective lengths are a user decision (k per axis); Table 11 / Annex D not implemented. The design refuses to run without them.',
  }),
  is({
    id: 'IS800-7.5', clause: '7.5 (angle struts)', kind: 'mandatory', scope: 'resistance', features: ['is800.design.angles'], status: 'pending', textVerified: false,
    requirement: 'Design of angle struts (IS 800:2007 7.5): 7.5.1.1 concentric (7.1.2); 7.5.1.2 loaded through one leg: lambda_e = sqrt(k1 + k2 lambda_vv^2 + k3 lambda_phi^2) with k from Table 12 (bolts at each end, gusset fixity), then the 7.1.2.1 curve; 7.5.2 double angles back to back (7.5.2.1 >= 2 bolts: KL 0.7-0.85 of the intersection distance in the gusset plane; 7.5.2.2 one bolt: as 7.5.1); 7.5.3 continuous members (7.2.4); 7.5.4 with transverse bending (9.3); connectors of two components back to back: 7.8, 10.2.5.', evidence: 'IS 800:2007 p. 47-48 (PDF p. 53-54) 7.5, Table 12; p. 20, 35, 44, 46, 52, 74: 7.5 and the provisions it refers to were READ on the page images for documentation (review-pack/NOTE_Task5_clause_7.5_angle_compression.md); the methodology is NOT approved and NOTHING is implemented',
    outstanding: 'PENDING. Missing before implementation: (1) code references: BIS Amendments No. 1 and No. 2 to IS 800:2007 (2 recorded by BIS, not supplied) or confirmation that 7.5, Table 12, 7.1.2 and 7.8 are untouched; a commentary or a second worked example of 7.5.1.2 that states how lambda_e enters the 7.1.2.1 curve (the clause says the strength may be evaluated using lambda_e without naming the curve) and how partial restraint is interpolated; (2) decisions: A1 lambda_e in the 7.1.2.1 curve with class c (Table 10), A2 partial-restraint rule, A3 the length l, A4 fillets neglected or section-table values, welded end connections (Table 12 speaks of bolts); (3) inputs the knee brace does not have: gusset / connecting-member fixity (fixed, hinged, partial), load-case type for Table 3 (DL + imposed, or wind / earthquake only), the strut length l (centre-to-centre of the supporting members), and for two angles back to back the connectors between the angles (number, spacing, diameter, packing) for 7.8 and 10.2.5. The knee-brace bolt diameter (default 12 mm) is below the 7.8.4 minimum of 16 mm (leg <= 10 mm), 20 mm (<= 16 mm), 22 mm (> 16 mm) if it is also the connector of two angles back to back: flagged by a REVIEW check; no value is changed.',
  }),
  is({
    id: 'IS800-8.2.1.2', clause: '8.2.1, 8.2.1.2', kind: 'mandatory', scope: 'resistance', features: ['is800.design.hollow', 'is800.design.open-sections'], status: 'verified',
    requirement: 'Design bending strength of a laterally supported section when V ≤ 0.6 V_d: M_d = β_b Z_p f_y/γ_m0 (β_b = 1 for plastic and compact, Z_e/Z_p for semi-compact), limited to 1.2 Z_e f_y/γ_m0 for simply supported and 1.5 Z_e f_y/γ_m0 for cantilever beams.',
    formula: 'M_d = β_b Z_p f_y / γ_m0', implementation: 'bendingStrengthSupported', validation: `${TD}: hand values and limits; the benchmark column: Z_p, Z_e from the polygon integration agree with RSTAB within 0.1 %`,
    evidence: 'IS 800:2007 p. 53 (PDF p. 59), 8.2.1.2', outstanding: 'The 1.2 / 1.5 limit is applied only for a stated support case; no value is given for a column in the clause.',
  }),
  is({
    id: 'IS800-8.2.2-hollow', clause: '8.2.2 (a)-(c)', kind: 'permitted-alternative', scope: 'resistance', features: ['is800.design.hollow'], status: 'verified',
    requirement: 'Resistance to lateral-torsional buckling need not be checked separately (the member is treated as laterally supported) when bending is about the minor axis, when the section is hollow (rectangular or tubular) or a solid bar, or for major-axis bending when λ_LT < 0.4.',
    implementation: 'src/server/frame/design/member.ts: designHollowMember (hollow sections: no LTB reduction)', validation: `${TD}: hollow sections use 8.2.1.2`, evidence: 'IS 800:2007 p. 54 (PDF p. 60), 8.2.2',
  }),
  is({
    id: 'IS800-8.2.2-open', clause: '8.2.2, 8.2.2.1, Tables 13 and 14 (open sections)', kind: 'mandatory', scope: 'resistance', features: ['is800.design.open-sections'], status: 'pending', textVerified: false,
    requirement: 'Design bending strength of laterally unsupported beams: M_d = β_b Z_p f_bd, f_bd = χ_LT f_y/γ_m0, φ_LT with α_LT = 0.21 (rolled) / 0.49 (welded), λ_LT from the elastic critical moment M_cr (8.2.2.1).',
    evidence: 'IS 800:2007 p. 54-56 (PDF p. 60-62): OCR read; M_cr formulas and tables not verified on the images', outstanding: 'Read 8.2.2.1 and Tables 13-14, implement and test.',
  }),
  is({
    id: 'IS800-8.4.1', clause: '8.4, 8.4.1, 8.4.1.1', kind: 'mandatory', scope: 'resistance', features: ['is800.design.hollow', 'is800.design.open-sections'], status: 'verified',
    requirement: 'Design shear strength V_d = V_n/γ_m0, V_n = V_p = A_v f_yw/√3; shear area of a rectangular hollow section loaded parallel to the depth h: A h/(b+h), parallel to the width b: A b/(b+h); I and channel sections: h t_w (hot rolled) / d t_w (welded) for major axis bending.',
    formula: 'V_d = A_v f_yw / (√3 γ_m0)', implementation: 'shearPlastic', validation: `${TD}: hand value; scripts/rstab/compare-is-design.ts: 780 RSTAB rows within 0.006`, evidence: 'IS 800:2007 p. 59 (PDF p. 65), 8.4.1',
    outstanding: 'Shear buckling (8.4.2) applies when d/t_w > 67ε and is not implemented: the check is reported pending then.',
  }),
  is({
    id: 'IS800-9.2.2', clause: '9.2.1, 9.2.2', kind: 'mandatory', scope: 'resistance', features: ['is800.design.hollow'], status: 'provisional',
    requirement: 'When the factored shear V exceeds 0.6 V_d the moment capacity is reduced: M_dv = M_d − β (M_d − M_fd) ≤ 1.2 Z_e f_y/γ_m0 (plastic or compact), β = (2V/V_d − 1)², M_fd = plastic design strength of the area excluding the shear area; semi-compact M_dv = Z_e f_y/γ_m0.',
    formula: 'M_dv = M_d − β(M_d − M_fd)', implementation: 'bendingHighShear', validation: `${TD}: hand values`, evidence: 'IS 800:2007 p. 70 (PDF p. 76), 9.2.2 read on the page image',
    outstanding: 'M_fd needs the area excluding the shear area: for a hollow section the two webs are taken as the shear area (assumption). The benchmark never reaches V > 0.6 V_d.',
  }),
  is({
    id: 'IS800-9.3.1', clause: '9.3.1.1, 9.3.1.2, 9.3.1.3, Table 17', kind: 'mandatory', scope: 'resistance', features: ['is800.design.hollow', 'is800.design.open-sections'], status: 'verified',
    requirement: 'Section strength under axial force and bending: plastic and compact sections (M_y/M_ndy)^α1 + (M_z/M_ndz)^α2 ≤ 1.0, conservatively N/N_d + M_y/M_dy + M_z/M_dz ≤ 1.0; M_nd by 9.3.1.2 (rectangular hollow sections symmetric about both axes without bolt holes: M_ndy = M_dy (1−n)/(1−0.5 a_w) ≤ M_dy, M_ndz = M_dz (1−n)/(1−0.5 a_f) ≤ M_dz); Table 17: rectangular tubes α1 = α2 = 1.66/(1 − 1.13 n²) ≤ 6; semi-compact: the linear form with M_d = Z_e f_y/γ_m0.',
    formula: '(M_y/M_ndy)^α1 + (M_z/M_ndz)^α2 ≤ 1;  N/N_d + M_y/M_dy + M_z/M_dz ≤ 1', implementation: 'sectionStrengthRhs, reducedMomentsRhs, alphaTable17',
    validation: `${TD}: hand values and limits; scripts/rstab/compare-is-design.ts: the linear form reproduces 1,138 RSTAB rows within 0.006`,
    evidence: 'IS 800:2007 p. 70-71 (PDF p. 76-77), 9.3.1 and Table 17 read on the page images', outstanding: 'The (α-form) is implemented; RSTAB reports the conservative linear form, which the tool returns as well. Open sections (I, channel) need their own 9.3.1.2 rows.',
  }),
  is({
    id: 'IS800-9.3.2', clause: '9.3.2.1, 9.3.2.2, Table 18', kind: 'mandatory', scope: 'resistance', features: ['is800.design.hollow'], status: 'verified',
    requirement: 'Overall member strength under axial compression and biaxial bending: P/P_dy + K_y C_my M_y/M_dy + K_LT M_z/M_dz ≤ 1 and P/P_dz + 0.6 K_y C_my M_y/M_dy + K_z C_mz M_z/M_dz ≤ 1; M_y, M_z the maximum factored moments of the member; K_y = 1 + (λ_y − 0.2) n_y ≤ 1 + 0.8 n_y (likewise K_z); K_LT = 1 − 0.1 λ_LT n_y/(C_mLT − 0.25) ≥ 1 − 0.1 n_y/(C_mLT − 0.25); C_m from Table 18 (0.9 for members with a sway buckling mode). Tension and bending 9.3.2.1: M_eff = [M − ψ T Z_ec/A] ≤ M_d.',
    formula: 'P/P_dy + K_y C_my M_y/M_dy + K_LT M_z/M_dz ≤ 1', implementation: 'memberInteraction, cmFactor, momentUnderTension',
    validation: `${TD}: hand values of K, C_m (rows A and B, sway 0.9) and both equations`, evidence: 'IS 800:2007 p. 71-72 (PDF p. 77-78), 9.3.2 and Table 18 read on the page images',
    outstanding: 'Table 18 row C (moment diagrams with a concentrated or end moment pattern) prints inconsistent coefficients ("0.095 − 0.05 α_h" for 0.95) and is not implemented. The RSTAB utilisations (equations 341/351) could NOT be reproduced with any tested interpretation (class a or b, E, C_m, axes): the implementation follows the printed text, comparison unresolved. IS 800 names the minor axis y and the major axis z; for a square tube the mapping is arbitrary.',
  }),
  is({
    id: 'IS800-members-open', clause: 'Sections 7-9 for I, channel and built-up sections', kind: 'mandatory', scope: 'resistance', features: ['is800.design.open-sections'], status: 'pending', textVerified: false,
    requirement: 'Member resistance of rolled and welded I sections, channels and built-up members (Table 10 rows, 8.2.2 LTB, shear buckling 8.4.2).',
    evidence: 'IS 800:2007: not complete', outstanding: 'Read and implement the pending items above; then these sections become available.',
  }),
  is({
    id: 'IS800-cold-formed', clause: 'IS 801 (cold-formed light gauge sections)', kind: 'mandatory', scope: 'resistance', features: ['is800.design.cold-formed'], status: 'pending', textVerified: false,
    requirement: 'IS 800 3.7.2 d) refers slender and cold-formed light-gauge sections to IS 801. The C-PAR 200/50/2/25/2 sections of the benchmark (t = 2 mm) are cold-formed; RSTAB designs them as "general cross-sections" (not IS 800 provisions).',
    evidence: 'IS 800:2007 p. 17-19 (PDF p. 23-25)', outstanding: 'IS 801:1975 (and any amendment) must be supplied; until then cold-formed members are NOT designed (reported pending).',
  }),
  is({
    id: 'IS800-connections', clause: 'Section 10 (connections), bolts, welds, base plates', kind: 'mandatory', scope: 'resistance', features: ['is800.design.connections'], status: 'pending', textVerified: false,
    requirement: 'Connection design (bolted, welded, base plates, anchors).', evidence: 'IS 800:2007 Section 10 and Annex F: not read', outstanding: 'Out of the scope of the frame member design implemented so far.',
  }),
];

export const featureItems = (f: CodeFeature) => CODE_REGISTER.filter((i) => i.features.includes(f));

export type RouteState = 'verified' | 'provisional' | 'blocked';
export interface RouteAvailability { state: RouteState; reasons: string[]; items: string[] }

export function availabilityOf(items: CodeItem[], feature: CodeFeature): RouteAvailability {
  const it = items.filter((i) => i.features.includes(feature));
  if (!it.length) return { state: 'blocked', reasons: [`no register item covers ${feature}`], items: [] };
  const pending = it.filter((i) => i.status === 'pending'), prov = it.filter((i) => i.status === 'provisional');
  if (pending.length) return { state: 'blocked', reasons: pending.map((i) => `${i.id} (${i.clause}): ${i.outstanding || 'pending'}`), items: it.map((i) => i.id) };
  if (prov.length) return { state: 'provisional', reasons: prov.map((i) => `${i.id} (${i.clause}): ${i.outstanding || 'provisional'}`), items: it.map((i) => i.id) };
  return { state: 'verified', reasons: [], items: it.map((i) => i.id) };
}
/**
 * May a code-specific feature run? 'verified' only if every register item of the feature is verified; 'provisional' if the weakest item is provisional
 * (the run is allowed but must be labelled provisional); 'blocked' if any item is pending. A feature without register items is blocked.
 */
export const routeAvailability = (feature: CodeFeature) => availabilityOf(CODE_REGISTER, feature);

/** Integrity rules of the register itself: a 'verified' item must have verified text, an implementation, a validation and evidence. */
export function registerProblems(items: CodeItem[]): string[] {
  const p: string[] = [], seen = new Set<string>();
  for (const i of items) {
    if (seen.has(i.id)) p.push(`${i.id}: duplicate id`);
    seen.add(i.id);
    if ((i.standard as string) !== 'IS 800') p.push(`${i.id}: standard ${i.standard} is not supported (IS 800 is the only design standard)`);
    if (/EN ?1993|Eurocode|National Annex/i.test(i.requirement + i.formula + i.implementation)) p.push(`${i.id}: refers to a removed design route`);
    if (!i.evidence) p.push(`${i.id}: no evidence reference`);
    if (i.status === 'verified' && !i.textVerified) p.push(`${i.id}: status verified but the text is not verified`);
    if (i.status === 'verified') {
      if (!i.implementation && i.kind !== 'finding') p.push(`${i.id}: verified without an implementation`);
      if (!i.validation) p.push(`${i.id}: verified without a validation test`);
    }
    if (i.status === 'provisional' && !i.outstanding) p.push(`${i.id}: provisional without saying what is outstanding`);
  }
  return p;
}

/** Warnings the UI and the report must show while anything the analysis depends on is unverified. */
export function verificationWarnings(opts: { features?: CodeFeature[] } = {}): string[] {
  const w: string[] = [];
  for (const it of CODE_REGISTER) {
    if (it.status === 'verified') continue;
    if (opts.features && !it.features.some((f) => opts.features!.includes(f))) continue;
    w.push(`${it.standard} ${it.clause}: ${it.status}${it.outstanding ? ' (' + it.outstanding + ')' : ''}`);
  }
  return w;
}
