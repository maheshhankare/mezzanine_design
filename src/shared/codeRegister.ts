/**
 * Code-verification register for IS 800 and EN 1993-1-1 (and the National Annex parameters). Authoritative source for deciding whether a
 * code-specific feature may run: `routeAvailability(feature)`.
 *
 * STATUS RULES
 *  verified     the requirement was read in the OFFICIAL text supplied by the user and checked against the page image, it is implemented, and a
 *               test with a documented basis passes. Nothing else is 'verified'.
 *  provisional  implemented and tested, but it depends on a value or decision that is not confirmed (EN: National Annex not supplied, so only the
 *               values recommended in the Eurocode text itself can be used, and they are labelled as such), or on a modelling assumption that the
 *               clause does not state.
 *  pending      not implemented, or the text was not (completely) verified, or a project decision is open. Nothing is assumed.
 *
 * Evidence = the supplied documents: IS 800:2007 (Third Revision, Dec 2007, scan, 150 pages, amendments NOT included) and
 * BS EN 1993-1-1:2005 incl. corrigenda Feb 2006 and Mar 2009 (93 pages). EN 1993-1-1:2005/A1:2014 and any National Annex were NOT supplied.
 * Page numbers are PDF page numbers of the supplied files.
 */
export type CodeStatus = 'verified' | 'provisional' | 'pending';
export type CodeKind = 'mandatory' | 'permitted-alternative' | 'recommended-value' | 'modelling-assumption' | 'finding';
export type CodeScope = 'global-analysis' | 'member-analysis' | 'imperfection' | 'stability' | 'resistance';

/** analysis features that can be enabled or blocked individually */
export type CodeFeature =
  | 'is800.notional-loads' | 'is800.second-order' | 'is800.first-order-amplification' | 'is800.critical-load-factor' | 'is800.member-design'
  | 'en.alpha-cr' | 'en.sway-imperfection' | 'en.bow-imperfection' | 'en.equivalent-forces' | 'en.sway-amplification'
  | 'en.critical-mode-imperfection' | 'en.bracing-imperfection' | 'en.diaphragm-torsional-imperfection' | 'en.member-design';

export interface CodeItem {
  id: string;
  standard: 'IS 800' | 'EN 1993-1-1';
  edition: string;
  nationalAnnex: string; // '' for IS 800
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

const IS = 'IS 800:2007 (Third Revision, December 2007), supplied scan; amendments not supplied';
const EN = 'EN 1993-1-1:2005 incl. corrigenda 2006/2009 (supplied); A1:2014 not supplied';
const NA_MISSING = 'National Annex not supplied; none selected';
const T = 'scripts/test-codes.ts';

type Req = 'id' | 'clause' | 'requirement' | 'kind' | 'scope' | 'features' | 'status' | 'evidence';
const is = (p: Partial<CodeItem> & Pick<CodeItem, Req>): CodeItem => ({
  standard: 'IS 800', edition: IS, nationalAnnex: '', formula: '', parameters: '', applicability: '', textVerified: true, implementation: '', validation: '', outstanding: '', ...p,
});
const en = (p: Partial<CodeItem> & Pick<CodeItem, Req>): CodeItem => ({
  standard: 'EN 1993-1-1', edition: EN, nationalAnnex: NA_MISSING, formula: '', parameters: '', applicability: '', textVerified: true, implementation: '', validation: '', outstanding: '', ...p,
});

export const CODE_REGISTER: CodeItem[] = [
  // ------------------------------------------------------------------ IS 800:2007
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
    outstanding: 'The decision rule is implemented, but the amplification factor itself is not: 4.4.3.3 refers to C_my, C_mz of 9.3.2.2 / Table 18 (equivalent uniform moment factors), which are not amplification factors in the usual sense. The exact factor to use is an interpretation to be settled together with the member-design clauses (Section 9).',
  }),
  is({
    id: 'IS800-4.4.3.2-3', clause: '4.4.3.2, 4.4.3.3, 9.3.2.2, Table 18', kind: 'mandatory', scope: 'member-analysis', features: ['is800.first-order-amplification', 'is800.member-design'], status: 'pending', textVerified: false,
    requirement: 'Moment amplification for members in non-sway and sway frames; interaction of axial compression and bending with C_my, C_mz (Table 18), K_y, K_z.',
    evidence: 'IS 800:2007 p. 24 and p. 71-72 (PDF p. 30, 77-78); the OCR of 9.3.2.2 is garbled and Table 18 is a rotated image: not verified', outstanding: 'Read 9.3.2.2 and Table 18 on the page images and decide the amplification-factor definition (see IS800-4.4.2); implement and test.',
  }),
  is({
    id: 'IS800-4.6.2b', clause: '4.6.1, 4.6.2 (b)', kind: 'permitted-alternative', scope: 'stability', features: ['is800.critical-load-factor'], status: 'verified',
    requirement: 'The elastic buckling load factor λcr is the ratio of the elastic buckling load set of the frame to the design load set; it shall be determined by approximate methods (4.6.2.1, 4.6.2.2) or by a rational elastic buckling analysis of the whole frame.',
    implementation: 'src/server/frame/solve.ts: criticalLoadFactor (Sturm count on the tangent stiffness, rational whole-frame analysis)', validation: 'scripts/test-frame.ts: Euler and cantilever critical loads (1e-4 %); scripts/test-codes.ts: agreement with the deflection method on a portal frame',
    evidence: 'IS 800:2007 p. 26 (PDF p. 32), 4.6.1-4.6.2', outstanding: 'The approximate methods 4.6.2.1 / 4.6.2.2 need the elastic buckling stress f_cc of 7.1.2.1 (not implemented).',
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
    evidence: 'IS 800:2007 p. 120 (PDF p. 126), B-2.2', outstanding: 'Route (c) not implemented (depends on IS800-4.4.3.2-3).',
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
    requirement: 'FINDING from the text: in 4.3 / 4.4 / Annex B-2 IS 800 represents practical imperfections in the frame analysis by the notional horizontal forces of 4.3.6 only. No initial sway or member bow VALUES for explicit geometric imperfections are given there (B-1.1 names geometrical imperfections for advanced analysis without values). Member bow effects enter through the buckling curves of Section 7. An explicit geometric imperfection in the IS 800 route is therefore a user-defined value, not a code value, and combining it with the notional forces represents the same practical imperfections twice unless the user justifies it.',
    implementation: 'resolveImperfectionSource (IS800 route: geometry/bow refused as code route)', validation: `${T}: IS 800 route refuses explicit geometry, allows notional loads`,
    evidence: 'IS 800:2007 p. 24 and p. 120 (PDF p. 30, 126)',
  }),
  is({
    id: 'IS800-members', clause: 'Sections 7, 8, 9 (7.1.2 buckling classes and Table 7/10, 8.2 lateral-torsional buckling, 9.3 combined forces, Table 18)', kind: 'mandatory', scope: 'resistance', features: ['is800.member-design'], status: 'pending', textVerified: false,
    requirement: 'Member resistance and interaction checks of the Indian route.', evidence: 'IS 800:2007 Sections 7-9: not yet read on the page images',
    outstanding: 'Read, implement and test the clauses; many tables are scans (OCR unreliable) and must be read from the page images.',
  }),

  // ------------------------------------------------------------------ EN 1993-1-1:2005
  en({
    id: 'EN-5.2.1(3)', clause: '5.2.1(3), eq. (5.1) [NDP]', kind: 'mandatory', scope: 'global-analysis', features: ['en.alpha-cr'], status: 'provisional',
    requirement: 'First-order analysis may be used if the increase of the relevant internal forces or any other change of structural behaviour caused by deformations can be neglected; assumed fulfilled if α_cr = F_cr/F_Ed ≥ 10 for elastic analysis, ≥ 15 for plastic analysis. The National Annex may give a lower limit for certain types of frames.',
    formula: 'α_cr = F_cr / F_Ed ≥ 10 (elastic), ≥ 15 (plastic)', parameters: 'α_cr, limits (NDP)',
    implementation: 'src/server/frame/codes/en1993.ts: en1993FirstOrderPermitted', validation: `${T}: limits 10 / 15`,
    evidence: 'EN 1993-1-1 p. 30 (PDF p. 32), 5.2.1(3); NDP list p. 8 (PDF p. 10)', outstanding: 'The limits 10 / 15 are the values printed in the text; the clause is an NDP (NA may lower them). Needs the National Annex of the project.',
  }),
  en({
    id: 'EN-5.2.1(4)B', clause: '5.2.1(4)B, eq. (5.2), (5.3)', kind: 'permitted-alternative', scope: 'global-analysis', features: ['en.alpha-cr'], status: 'verified',
    requirement: 'For portal frames with shallow roof slopes and beam-and-column plane frames in buildings, α_cr may be estimated per storey if the axial compression in the beams/rafters is not significant.',
    formula: 'α_cr = (H_Ed / V_Ed) · (h / δ_H,Ed)', parameters: 'H_Ed storey shear including equivalent forces 5.3.2(7); V_Ed storey thrust; δ_H,Ed relative horizontal displacement top/bottom of the storey under horizontal and fictitious horizontal loads; h storey height',
    applicability: 'shallow roof (not steeper than 1:2, note 1B); axial compression in beams significant if λ̄ ≥ 0.3 √(A f_y / N_Ed) (5.3, note 2B)',
    implementation: 'en1993AlphaCrStorey; en1993BeamAxialSignificant', validation: `${T}: formula on a hand example; comparison with criticalLoadFactor`,
    evidence: 'EN 1993-1-1 p. 30-31 (PDF p. 32-33), (5.2) checked on the page image',
  }),
  en({
    id: 'EN-5.2.2(3)(7)', clause: '5.2.2(2), (3), (7)', kind: 'permitted-alternative', scope: 'stability', features: ['en.sway-imperfection', 'en.member-design'], status: 'verified',
    requirement: 'Stability of frames is verified considering imperfections and second-order effects, accounted for (a) totally by the global analysis, (b) partially by the global analysis and partially by member checks per 6.3, or (c) for basic cases by equivalent-member checks. If second-order effects in members and the relevant member imperfections are totally accounted for in the global analysis, no member stability check per 6.3 is necessary; otherwise 6.3 is checked for the effects not included.',
    implementation: 'AnalysisSettings.stabilityMethod (a / b / c) and the report', validation: `${T}: setting validation`, evidence: 'EN 1993-1-1 p. 31-32 (PDF p. 33-34)', outstanding: 'The member checks of 6.3 themselves are not implemented (EN-6).',
  }),
  en({
    id: 'EN-5.2.2(5)B', clause: '5.2.2(5)B, (6)B, eq. (5.4)', kind: 'permitted-alternative', scope: 'global-analysis', features: ['en.sway-amplification'], status: 'verified',
    requirement: 'For single-storey frames (and multi-storey frames with similar storeys) designed with elastic global analysis, second-order sway effects due to vertical loads may be calculated by increasing the horizontal loads and equivalent loads φ V_Ed from first-order theory by the factor 1/(1 − 1/α_cr), provided α_cr ≥ 3.0. For α_cr < 3.0 a more accurate second-order analysis applies.',
    formula: '1 / (1 − 1/α_cr), α_cr ≥ 3.0',
    implementation: 'en1993SwayAmplification', validation: `${T}: factor and the α_cr < 3 refusal`, evidence: 'EN 1993-1-1 p. 32 (PDF p. 34); equation checked on the page image',
  }),
  en({
    id: 'EN-5.3.2(3)a', clause: '5.3.2(3)a, eq. (5.5) [NDP]', kind: 'mandatory', scope: 'imperfection', features: ['en.sway-imperfection', 'en.equivalent-forces'], status: 'provisional',
    requirement: 'Initial sway imperfection of frames sensitive to buckling in a sway mode: φ = φ0 · α_h · α_m, φ0 = 1/200 (basic value), α_h = 2/√h with 2/3 ≤ α_h ≤ 1.0 (h height of the structure in m), α_m = √(0.5 (1 + 1/m)), m = number of columns in a row carrying a vertical load of at least 50 % of the average column load in the vertical plane considered.',
    formula: 'φ = φ0 α_h α_m;  α_h = 2/√h (2/3 ≤ α_h ≤ 1);  α_m = √(0.5(1 + 1/m))', parameters: 'φ0, h [m], m',
    implementation: 'en1993SwayImperfection', validation: `${T}: formula values, bounds of α_h, m = 1 limit`,
    evidence: 'EN 1993-1-1 p. 33 (PDF p. 35), (5.5) checked on the page image; NDP list p. 8', outstanding: 'The clause 5.3.2(3) is an NDP. φ0 = 1/200 is the value printed in the text; the project National Annex may differ. The tool applies it only when the user accepts the Eurocode text values or supplies verified Annex values.',
  }),
  en({
    id: 'EN-5.3.2(3)b', clause: '5.3.2(3)b, eq. (5.6), Table 5.1 [NDP]', kind: 'recommended-value', scope: 'imperfection', features: ['en.bow-imperfection', 'en.equivalent-forces'], status: 'provisional',
    requirement: 'Relative initial local bow imperfection of members for flexural buckling e0/L; the values may be chosen in the National Annex; recommended values in Table 5.1 by buckling curve (a0, a, b, c, d): elastic analysis 1/350, 1/300, 1/250, 1/200, 1/150; plastic analysis 1/300, 1/250, 1/200, 1/150, 1/100.',
    implementation: 'en1993BowRatio', validation: `${T}: Table 5.1 values`, evidence: 'EN 1993-1-1 p. 33-34 (PDF p. 35-36), Table 5.1 checked on the page image',
    outstanding: 'Recommended values only; National Annex of the project needed. The buckling curve per cross-section comes from Table 6.2 (not implemented).',
  }),
  en({
    id: 'EN-5.3.2(4)B', clause: '5.3.2(4)B, eq. (5.7)', kind: 'permitted-alternative', scope: 'imperfection', features: ['en.sway-imperfection'], status: 'verified',
    requirement: 'For building frames sway imperfections may be disregarded where H_Ed ≥ 0.15 V_Ed.',
    formula: 'H_Ed ≥ 0.15 V_Ed', implementation: 'en1993SwayMayBeDisregarded', validation: `${T}: threshold`, evidence: 'EN 1993-1-1 p. 34 (PDF p. 36), (5.7) checked on the page image',
  }),
  en({
    id: 'EN-5.3.2(6)', clause: '5.3.2(6), eq. (5.8)', kind: 'mandatory', scope: 'imperfection', features: ['en.bow-imperfection'], status: 'verified',
    requirement: 'Local bow imperfections may be neglected in the global analysis for member end forces used in member checks per 6.3. For frames sensitive to second-order effects they should additionally to the global sway imperfections be introduced for each compressed member where at least one member end is a moment-resistant joint and λ̄ > 0.5 √(A f_y / N_Ed) (λ̄ in-plane slenderness for the member considered hinged at its ends).',
    formula: 'λ̄ > 0.5 √(A f_y / N_Ed)', implementation: 'en1993BowRequired', validation: `${T}: threshold and the moment-resistant-joint condition`, evidence: 'EN 1993-1-1 p. 34 (PDF p. 36), (5.8) checked on the page image',
  }),
  en({
    id: 'EN-5.3.2(7)', clause: '5.3.2(7), Figure 5.4', kind: 'permitted-alternative', scope: 'imperfection', features: ['en.equivalent-forces'], status: 'verified',
    requirement: 'The effects of initial sway and local bow imperfections may be replaced by systems of equivalent horizontal forces for each column: sway: ±φ N_Ed at the column ends; bow: a uniform load 8 N_Ed e0/L² with end forces 4 N_Ed e0/L opposing it.',
    formula: 'sway: φ N_Ed;  bow: q = 8 N_Ed e0 / L², end forces 4 N_Ed e0 / L', implementation: 'src/server/frame/imperfection.ts: swayLoads; en1993BowEquivalentLoads',
    validation: `scripts/test-frame.ts (sway loads = geometry); ${T}: bow loads = bow geometry on a pinned column (basis: P e0/(1 − P/Pcr))`,
    evidence: 'EN 1993-1-1 p. 35 (PDF p. 37), Figure 5.4 checked on the page image',
  }),
  en({
    id: 'EN-5.3.2(8)-(9)', clause: '5.3.2(8), (9)B', kind: 'mandatory', scope: 'imperfection', features: ['en.sway-imperfection', 'en.equivalent-forces'], status: 'verified',
    requirement: 'The initial sway imperfections apply in all relevant horizontal directions but need only be considered in one direction at a time; in multi-storey beam-and-column building frames equivalent forces are applied at each floor and roof level.',
    implementation: 'AnalysisSettings validation (one direction per case)', validation: `${T}: one direction per case`, evidence: 'EN 1993-1-1 p. 35 (PDF p. 37)',
  }),
  en({
    id: 'EN-5.3.2(5)(10)', clause: '5.3.2(5)B (Figure 5.3, floor diaphragms), 5.3.2(10) (torsional effects, Figure 5.5)', kind: 'mandatory', scope: 'imperfection', features: ['en.diaphragm-torsional-imperfection'], status: 'pending',
    requirement: 'Sway configuration for horizontal forces to floor diaphragms (φ from (5.5) for a single storey); torsional effects of anti-symmetric sway of opposite faces.',
    evidence: 'EN 1993-1-1 p. 34-35 (PDF p. 36-37)', outstanding: 'Not implemented.',
  }),
  en({
    id: 'EN-5.3.2(11)', clause: '5.3.2(11), eq. (5.9)-(5.11) [NDP]', kind: 'permitted-alternative', scope: 'imperfection', features: ['en.critical-mode-imperfection'], status: 'pending',
    requirement: 'As an alternative, the elastic critical buckling mode may be used as a unique global and local imperfection with an amplitude from (5.9)-(5.11).', evidence: 'EN 1993-1-1 p. 36 (PDF p. 38); equations not yet checked on the page image',
    outstanding: 'Not implemented; needs α_ult,k, α_cr, χ, M_Rk, N_Rk, and the National Annex for the scope of application.',
  }),
  en({
    id: 'EN-5.3.3', clause: '5.3.3, eq. (5.12)-(5.14)', kind: 'mandatory', scope: 'imperfection', features: ['en.bracing-imperfection'], status: 'pending',
    requirement: 'Imperfections for the analysis of bracing systems (e0 = α_m L/500, equivalent stabilising force, splice forces).', evidence: 'EN 1993-1-1 p. 36-38 (PDF p. 38-40)', outstanding: 'Not implemented.',
  }),
  en({
    id: 'EN-5.3.4', clause: '5.3.4(1)-(3) [NDP (3)]', kind: 'mandatory', scope: 'imperfection', features: ['en.bow-imperfection'], status: 'provisional',
    requirement: 'Local bow imperfections are incorporated in the member buckling formulas of 6.3. Where member stability is accounted for by second-order analysis per 5.2.2(7)a), bow imperfections e0 per 5.3.2(3)b), (5) or (6) shall be considered for compression members. For second-order analysis with lateral-torsional buckling the imperfection may be k·e0,d (weak axis); recommended k = 0.5; no additional torsional imperfection.',
    implementation: 'bow imperfection for flexural buckling: bowGeometry / en1993BowEquivalentLoads; the LTB imperfection k·e0 is NOT implemented (needs warping DOF)', validation: 'scripts/test-frame.ts (bow geometry), ' + T,
    evidence: 'EN 1993-1-1 p. 38 (PDF p. 40)', outstanding: 'k and e0 are NDP-dependent; LTB second-order analysis not available (no warping DOF).',
  }),
  en({
    id: 'EN-6', clause: '6.1, 6.2, 6.3 (partial factors [NDP], resistance, buckling, interaction)', kind: 'mandatory', scope: 'resistance', features: ['en.member-design'], status: 'pending', textVerified: false,
    requirement: 'Cross-section and member resistance for the EN route.', evidence: 'EN 1993-1-1 section 6: not yet read on the page images', outstanding: 'Read, implement and test; γM0, γM1, γM2 and the 6.3.2 NDPs need the National Annex.',
  }),
];

export const featureItems = (f: CodeFeature) => CODE_REGISTER.filter((i) => i.features.includes(f));

export type RouteState = 'verified' | 'provisional' | 'blocked';
export interface RouteAvailability { state: RouteState; reasons: string[]; items: string[] }

/**
 * May a code-specific feature run? 'verified' only if every register item of the feature is verified; 'provisional' if the weakest item is
 * provisional (the run is allowed but must be labelled provisional); 'blocked' if any item is pending. A feature without register items is blocked.
 */
export function availabilityOf(items: CodeItem[], feature: CodeFeature): RouteAvailability {
  const it = items.filter((i) => i.features.includes(feature));
  if (!it.length) return { state: 'blocked', reasons: [`no register item covers ${feature}`], items: [] };
  const pending = it.filter((i) => i.status === 'pending'), prov = it.filter((i) => i.status === 'provisional');
  if (pending.length) return { state: 'blocked', reasons: pending.map((i) => `${i.id} (${i.clause}): ${i.outstanding || 'pending'}`), items: it.map((i) => i.id) };
  if (prov.length) return { state: 'provisional', reasons: prov.map((i) => `${i.id} (${i.clause}): ${i.outstanding || 'provisional'}`), items: it.map((i) => i.id) };
  return { state: 'verified', reasons: [], items: it.map((i) => i.id) };
}
export const routeAvailability = (feature: CodeFeature) => availabilityOf(CODE_REGISTER, feature);

/** Integrity rules of the register itself: a 'verified' item must have verified text, an implementation, a validation and evidence. */
export function registerProblems(items: CodeItem[]): string[] {
  const p: string[] = [], seen = new Set<string>();
  for (const i of items) {
    if (seen.has(i.id)) p.push(`${i.id}: duplicate id`);
    seen.add(i.id);
    if (!i.evidence) p.push(`${i.id}: no evidence reference`);
    if (i.status !== 'pending' && !i.textVerified) p.push(`${i.id}: status ${i.status} but the text is not verified`);
    if (i.status === 'verified') {
      if (!i.implementation && i.kind !== 'finding') p.push(`${i.id}: verified without an implementation`);
      if (!i.validation) p.push(`${i.id}: verified without a validation test`);
    }
    if (i.status === 'provisional' && !i.outstanding) p.push(`${i.id}: provisional without saying what is outstanding`);
    if (i.standard === 'EN 1993-1-1' && i.status === 'verified' && i.features.length && i.nationalAnnex && /NDP/.test(i.clause)) p.push(`${i.id}: an NDP clause cannot be verified without the National Annex`);
  }
  return p;
}

// ------------------------------------------------------------------ National Annex
export interface NdpValue { id: string; clause: string; description: string; value: number | string | null; status: 'verified' | 'pending'; source: string }
export interface NationalAnnex {
  id: string; country: string; standardEdition: string; documentTitle: string; revisionDate: string; ndps: NdpValue[]; confirmedBy?: string;
}

/** NDP clauses named in the national-annex list of EN 1993-1-1:2005 (p. 8) that this tool uses, with the value PRINTED IN THE EUROCODE TEXT. */
export const EN_1993_1_1_NDP_IDS: { id: string; clause: string; description: string; recommended: number | string | null }[] = [
  { id: 'alphaCr.elastic', clause: '5.2.1(3)', description: 'Limit of α_cr for first-order analysis, elastic global analysis', recommended: 10 },
  { id: 'alphaCr.plastic', clause: '5.2.1(3)', description: 'Limit of α_cr for first-order analysis, plastic global analysis', recommended: 15 },
  { id: 'phi0', clause: '5.3.2(3)', description: 'Basic value φ0 of the initial sway imperfection', recommended: 1 / 200 },
  { id: 'bow.e0L', clause: '5.3.2(3)b / Table 5.1', description: 'Design value of the initial local bow e0/L by buckling curve', recommended: 'Table 5.1' },
  { id: 'ltbBow.k', clause: '5.3.4(3)', description: 'Factor k on the equivalent bow imperfection for second-order lateral-torsional buckling', recommended: 0.5 },
  { id: 'gammaM0', clause: '6.1(1)', description: 'Partial factor for resistance of cross-sections', recommended: null },
  { id: 'gammaM1', clause: '6.1(1)', description: 'Partial factor for resistance of members to instability', recommended: null },
  { id: 'gammaM2', clause: '6.1(1)', description: 'Partial factor for resistance of cross-sections in tension to fracture', recommended: null },
];

/** A National Annex template with no values: nothing is assumed. */
export function emptyNationalAnnex(id: string, country: string): NationalAnnex {
  return { id, country, standardEdition: '', documentTitle: '', revisionDate: '', ndps: EN_1993_1_1_NDP_IDS.map((n) => ({ id: n.id, clause: n.clause, description: n.description, value: null, status: 'pending' as const, source: '' })) };
}

/** Warnings the UI and the report must show while anything the analysis depends on is unverified. */
export function verificationWarnings(opts: { route: 'IS' | 'EN'; annex?: NationalAnnex | null; features?: CodeFeature[] }): string[] {
  const w: string[] = [];
  const std = opts.route === 'IS' ? 'IS 800' : 'EN 1993-1-1';
  for (const it of CODE_REGISTER) {
    if (it.standard !== std || it.status === 'verified') continue;
    if (opts.features && !it.features.some((f) => opts.features!.includes(f))) continue;
    w.push(`${it.standard} ${it.clause}: ${it.status}${it.outstanding ? ' (' + it.outstanding + ')' : ''}`);
  }
  if (opts.route === 'EN') {
    if (!opts.annex) w.push('EN 1993-1-1: no National Annex selected. The Annex is a project decision; none is assumed.');
    else for (const n of opts.annex.ndps) if (n.value === null || n.status !== 'verified') w.push(`National Annex ${opts.annex.country}: NDP "${n.id}" (${n.clause}) is not set or not verified.`);
  }
  return w;
}
