/**
 * Code-verification register for the imperfection / second-order provisions (IS 800 and EN 1993) and the National Annex parameters.
 *
 * RULE: nothing in this file is "verified" unless the official code text was supplied and the clause, equation, variables and limits were
 * checked against it. At present NO provision has been verified: the official texts have not been supplied. Entries describe what must be
 * verified, where the tool already uses a value, and what is blocked. The register is data, so the UI can show the status and warn.
 */
export type CodeStatus = 'verified' | 'pending' | 'not-implemented';

export interface CodeItem {
  id: string;
  standard: 'IS 800' | 'EN 1993-1-1' | 'EN 1990' | 'National Annex';
  edition: string; // exact edition and amendments: to be recorded when the text is supplied
  clause: string;
  requirement: string; // what the provision is expected to cover (NOT a statement of its wording)
  formula: string; // '' until verified
  parameters: string;
  applicability: string;
  status: CodeStatus;
  implementation: string; // where / whether the tool uses it today
  validation: string; // benchmark or test case; '' when none
  blockedBy: string;
}

const PENDING_TEXT = 'Official code text not supplied';

export const CODE_REGISTER: CodeItem[] = [
  {
    id: 'IS800-4.3.6', standard: 'IS 800', edition: 'IS 800:2007 (amendments to be recorded)', clause: '4.3.6',
    requirement: 'Notional horizontal loads: magnitude, definition of the vertical loads they are based on, application directions, combination rules, exclusion when combined with wind / earthquake.',
    formula: '', parameters: '', applicability: '', status: 'pending',
    implementation: 'Existing load-path model uses 0.5 % of the factored gravity load (restraint.ts); this value is UNVERIFIED and not used by the new frame solver.',
    validation: '', blockedBy: PENDING_TEXT,
  },
  { id: 'IS800-4.3.6.1', standard: 'IS 800', edition: 'IS 800:2007', clause: '4.3.6.1', requirement: 'Sub-clause of 4.3.6 (to be read from the text).', formula: '', parameters: '', applicability: '', status: 'pending', implementation: 'not implemented', validation: '', blockedBy: PENDING_TEXT },
  { id: 'IS800-4.3.6.2', standard: 'IS 800', edition: 'IS 800:2007', clause: '4.3.6.2', requirement: 'Sub-clause of 4.3.6 (to be read from the text).', formula: '', parameters: '', applicability: '', status: 'pending', implementation: 'not implemented', validation: '', blockedBy: PENDING_TEXT },
  {
    id: 'IS800-4.4.3', standard: 'IS 800', edition: 'IS 800:2007', clause: '4.4.3 / 4.4.3.1 and Annex B (as named in the project brief)',
    requirement: 'Second-order elastic analysis and the conditions in which first-order analysis with moment amplification is permitted.',
    formula: '', parameters: '', applicability: '', status: 'pending',
    implementation: 'Second-order elastic frame analysis (Theory II and von Kármán) implemented in src/server/frame; code conditions of use NOT implemented.',
    validation: 'Solver mechanics: closed-form tests (test:frame) and RSTAB benchmark (docs/RSTAB_BENCHMARK.md); NOT a code-provision validation.',
    blockedBy: PENDING_TEXT,
  },
  {
    id: 'IS800-members', standard: 'IS 800', edition: 'IS 800:2007', clause: 'to be identified from the text (compression / buckling, bending, combined axial + bending, effective lengths, serviceability)',
    requirement: 'Member resistance and interaction checks for the Indian route.', formula: '', parameters: '', applicability: '', status: 'pending',
    implementation: 'Existing tool reports IS 801 cold-formed member resistances as REVIEW; no IS 800 hot-rolled / cold-formed member checks are driven by the new solver.',
    validation: '', blockedBy: PENDING_TEXT,
  },
  {
    id: 'EN1993-1-1-5.2', standard: 'EN 1993-1-1', edition: 'EN 1993-1-1:2005 + A1:2014 (first generation) with the matching National Annex', clause: '5.2.1, 5.2.2',
    requirement: 'Effects of the deformed geometry of the structure: when second-order effects must be considered (α_cr criterion), second-order elastic analysis, use of the amplification factor.',
    formula: '', parameters: 'NDPs to be read from the selected National Annex', applicability: '', status: 'pending',
    implementation: 'Second-order elastic analysis available; the α_cr criterion is computable (criticalLoadFactor) but the thresholds and conditions are NOT applied.',
    validation: '', blockedBy: PENDING_TEXT + '; National Annex not selected',
  },
  {
    id: 'EN1993-1-1-5.3', standard: 'EN 1993-1-1', edition: 'EN 1993-1-1:2005 + A1:2014', clause: '5.3.2 (global sway), 5.3.3 (member imperfections), 5.3.4',
    requirement: 'Imperfections for global analysis of frames: initial sway, initial bow of members, equivalent horizontal forces, when member imperfections may be omitted.',
    formula: '', parameters: 'φ₀, α_h, α_m, bow amplitudes (Table 5.1): values and NDP status to be read from the text', applicability: '', status: 'pending',
    implementation: 'The solver can apply stress-free initial imperfections and equivalent loads; NO code-based generation is implemented.',
    validation: 'RSTAB benchmark uses inclination 1/200 as equivalent loads (an RSTAB setting, not a code verification).', blockedBy: PENDING_TEXT + '; National Annex not selected',
  },
  { id: 'EN1993-1-1-6', standard: 'EN 1993-1-1', edition: 'EN 1993-1-1:2005 + A1:2014', clause: '6.1 (partial factors), 6.2, 6.3 (member buckling, interaction)', requirement: 'Cross-section and member resistance for the EN route.', formula: '', parameters: 'γ_M0, γ_M1, γ_M2 are NDPs', applicability: '', status: 'pending', implementation: 'The existing load-path engine implements EN 1993-1-1/-1-3 checks; they are NOT fed by the new solver.', validation: '', blockedBy: PENDING_TEXT + '; National Annex not selected' },
];

/** National Annex configuration. Every NDP is unset until the Annex of the project is selected and its values are verified from its text. */
export interface NdpValue { id: string; clause: string; description: string; value: number | string | null; status: CodeStatus; source: string }
export interface NationalAnnex {
  id: string; country: string; standardEdition: string; documentTitle: string; revisionDate: string; ndps: NdpValue[]; confirmedBy?: string;
}

export const EN_1993_1_1_NDP_IDS: { id: string; clause: string; description: string }[] = [
  { id: 'gammaM0', clause: '6.1(1)', description: 'Partial factor for resistance of cross-sections' },
  { id: 'gammaM1', clause: '6.1(1)', description: 'Partial factor for resistance of members to instability' },
  { id: 'gammaM2', clause: '6.1(1)', description: 'Partial factor for resistance of cross-sections in tension to fracture' },
  { id: 'sway.phi0', clause: '5.3.2(3)', description: 'Basic value of the global initial sway imperfection' },
  { id: 'bow.table', clause: '5.3.2(3) / Table 5.1', description: 'Design values of initial local bow imperfection e₀/L' },
  { id: 'alphaCr.limit', clause: '5.2.1(3)', description: 'Limits of α_cr for first-order analysis / second-order analysis' },
];

/** A National Annex template with no values: nothing is assumed. */
export function emptyNationalAnnex(id: string, country: string): NationalAnnex {
  return {
    id, country, standardEdition: '', documentTitle: '', revisionDate: '',
    ndps: EN_1993_1_1_NDP_IDS.map((n) => ({ ...n, value: null, status: 'pending' as CodeStatus, source: '' })),
  };
}

/** Warnings the UI must show while anything the analysis depends on is unverified or unconfirmed. */
export function verificationWarnings(opts: { route: 'IS' | 'EN'; annex?: NationalAnnex | null }): string[] {
  const w: string[] = [];
  for (const it of CODE_REGISTER) {
    if (it.status !== 'verified' && (opts.route === 'IS' ? it.standard === 'IS 800' : it.standard === 'EN 1993-1-1'))
      w.push(`${it.standard} ${it.clause}: not verified against the official text (${it.blockedBy}).`);
  }
  if (opts.route === 'EN') {
    if (!opts.annex) w.push('EN 1993: no National Annex selected. The Annex is a project decision; none is assumed.');
    else for (const n of opts.annex.ndps) if (n.status !== 'verified' || n.value === null) w.push(`National Annex ${opts.annex.country}: NDP "${n.id}" (${n.clause}) is not set or not verified.`);
  }
  return w;
}
