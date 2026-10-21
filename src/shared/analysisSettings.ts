import { CODE_REGISTER, routeAvailability, verificationWarnings, type CodeFeature, type NationalAnnex, type RouteState } from './codeRegister';

/**
 * Analysis settings of the frame analysis (second-order solver) and their validation. Client-safe (no server imports): the settings panel and the
 * server use the same rules. Rules come from the register (src/shared/codeRegister.ts); nothing is enabled just to make the form look complete.
 */
export type Standard = 'IS800' | 'EN1993' | 'user';
export type SwayMode = 'notional-loads' | 'equivalent-loads' | 'geometry';
export type BowMode = 'geometry' | 'equivalent-loads';
export type ImperfectionSource = 'code' | 'user';

export interface SwaySettings { mode: SwayMode; source: ImperfectionSource; phi0?: number; direction: '+X' | '-X' | '+Y' | '-Y' }
export interface BowSettings { mode: BowMode; source: ImperfectionSource; e0OverL?: number; curve?: 'a0' | 'a' | 'b' | 'c' | 'd' }

export interface AnalysisSettings {
  standard: Standard;
  /** EN route: National Annex of the project (none is assumed) */
  nationalAnnex?: NationalAnnex | null;
  /** EN route: use the values printed in the Eurocode text when no verified National Annex is available; the run is then PROVISIONAL */
  acceptEurocodeTextValues: boolean;
  order: 'first' | 'second';
  theory: 'II' | 'vonKarman';
  shearDeformation: boolean;
  /** global stiffness modification factors (EA, EI, GJ); 1 = none */
  stiffnessFactors: { EA: number; EI: number; GJ: number };
  /** EN 5.2.2(3): how second-order effects and imperfections are accounted for */
  stabilityMethod?: 'a' | 'b' | 'c';
  sway?: SwaySettings;
  bow?: BowSettings;
  /** other horizontal loads (wind, earthquake) / temperature act in the combinations that contain the sway imperfection */
  otherLateralLoadsInCombination: boolean;
  temperatureInCombination: boolean;
  /** the results are used for an overturning / overall-instability check, or the base shear of the foundation */
  usedForOverturningCheck: boolean;
  /** an equivalent notional / imperfection load case is ALSO present in the load cases entered by the user */
  imperfectionLoadsInLoadCases: boolean;
  memberChecks: boolean;
  maxIterations: number;
  loadSteps: number;
}

export const defaultSettings = (standard: Standard = 'user'): AnalysisSettings => ({
  standard, nationalAnnex: null, acceptEurocodeTextValues: false, order: 'second', theory: 'II', shearDeformation: true, stiffnessFactors: { EA: 1, EI: 1, GJ: 1 },
  otherLateralLoadsInCombination: false, temperatureInCombination: false, usedForOverturningCheck: false, imperfectionLoadsInLoadCases: false, memberChecks: false, maxIterations: 100, loadSteps: 4,
});

export interface Issue { field: string; message: string; clause?: string }
export interface Availability { available: boolean; state: RouteState | 'user'; reason: string; clause?: string }
export interface ValidationResult {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  /** which labelling the results must carry: 'verified' only if every code feature in use is verified; user-defined values are never "code compliant" */
  label: 'verified' | 'provisional' | 'user-defined' | 'blocked';
  usedFeatures: CodeFeature[];
}

const range = (v: number | undefined, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v > lo && v <= hi;

export function validateSettings(s: AnalysisSettings): ValidationResult {
  const errors: Issue[] = [], warnings: Issue[] = [];
  const err = (field: string, message: string, clause?: string) => errors.push({ field, message, clause });
  const warn = (field: string, message: string, clause?: string) => warnings.push({ field, message, clause });
  const used: CodeFeature[] = [];

  // numeric ranges and units
  if (!(Number.isInteger(s.maxIterations) && s.maxIterations >= 1 && s.maxIterations <= 100)) err('maxIterations', 'The iteration limit must be an integer from 1 to 100; reaching the limit is never treated as convergence.');
  if (!(Number.isInteger(s.loadSteps) && s.loadSteps >= 1 && s.loadSteps <= 100)) err('loadSteps', 'The number of load steps must be an integer from 1 to 100.');
  for (const k of ['EA', 'EI', 'GJ'] as const) if (!(Number.isFinite(s.stiffnessFactors[k]) && s.stiffnessFactors[k] > 0 && s.stiffnessFactors[k] <= 1.5)) err(`stiffnessFactors.${k}`, `The stiffness factor for ${k} must be a number in (0, 1.5].`);
  if (s.sway) {
    if (s.sway.source === 'user' || s.standard === 'user') { if (!range(s.sway.phi0, 0, 0.05)) err('sway.phi0', 'The sway imperfection φ0 must be a dimensionless inclination in (0, 0.05], e.g. 0.005 for 1/200 (not a percentage, not an angle in degrees).'); }
  }
  if (s.bow && (s.bow.source === 'user' || s.standard === 'user') && !range(s.bow.e0OverL, 0, 0.02)) err('bow.e0OverL', 'The bow imperfection e0/L must be a dimensionless ratio in (0, 0.02], e.g. 0.004 for L/250.');

  if (s.order === 'first' && s.theory === 'vonKarman') warn('theory', 'The theory setting has no effect in a first-order analysis.');
  if (s.theory === 'vonKarman' && s.order === 'second') warn('theory', 'Von Kármán (membrane coupling) is not the second-order elastic analysis of the design codes; it increased the sway of the benchmark by 63 % (docs/SECOND_ORDER.md). Use Theory II for code-based work.');
  if (s.order === 'first' && (s.sway || s.bow)) warn('order', 'Imperfections in a first-order analysis act as equivalent loads only; the second-order amplification is not included.');
  if (s.shearDeformation === false) warn('shearDeformation', 'Shear deformation is off. It must match the model it is compared with: RSTAB Detail 2 uses it, Detail 1 did not.');

  const bothSwayAndNotional = !!s.sway && s.imperfectionLoadsInLoadCases && s.sway.mode === 'geometry';
  if (bothSwayAndNotional) err('imperfectionLoadsInLoadCases', 'A geometric sway imperfection and equivalent / notional imperfection loads in the load cases represent the same effect and would be counted twice. Use one of them.');

  // ------------------------------------------------------------------ IS 800
  if (s.standard === 'IS800') {
    if (s.sway) {
      if (s.sway.mode === 'notional-loads') {
        if (s.sway.source !== 'code') warn('sway.source', 'Notional forces per IS 800 4.3.6 are generated from the code; the source is set to "code".', '4.3.6');
        used.push('is800.notional-loads');
        if (s.otherLateralLoadsInCombination) err('otherLateralLoadsInCombination', 'IS 800 4.3.6 / 4.3.6.2(b): the notional force shall not be applied along with other lateral loads such as wind and earthquake.', '4.3.6.2(b)');
        if (s.temperatureInCombination) err('temperatureInCombination', 'IS 800 4.3.6.2(c): the notional force shall not be combined with temperature effects.', '4.3.6.2(c)');
        if (s.usedForOverturningCheck) err('usedForOverturningCheck', 'IS 800 4.3.6.2(a), (d): the notional force shall not be applied when considering overturning or overall instability, nor taken to contribute to the net shear on the foundation.', '4.3.6.2(a)(d)');
      } else if (s.sway.source === 'code') {
        err('sway.mode', 'IS 800 gives no provisions for explicit sway imperfections or imperfection loads other than the notional forces of 4.3.6 (checked: 4.3.6, 4.4.3, Annex B-2). Choose "notional loads" or mark the imperfection as user-defined.', '4.3.6');
      } else {
        warn('sway.source', 'User-defined sway imperfection: not an IS 800 provision, the result is not labelled code-compliant. If it is used together with the notional forces the practical imperfections are counted twice.', '4.3.6');
      }
    }
    if (s.bow) {
      if (s.bow.source === 'code') err('bow.source', 'IS 800 gives no member-bow imperfection value for the frame analysis (member bow enters through the buckling curves of Section 7). Mark the bow imperfection as user-defined.', 'Annex B-1.1 / Section 7');
      else warn('bow.source', 'User-defined bow imperfection: not an IS 800 provision.');
    }
    if (s.order === 'first') warn('order', 'IS 800 4.4.2 / 4.4.3.1: first-order analysis is permitted only with moment amplification and only while the amplification factor does not exceed 1.4; the amplification factor is not yet implemented (register IS800-4.4.2).', '4.4.2');
    if (s.order === 'second') used.push('is800.second-order');
    if (s.stabilityMethod) warn('stabilityMethod', 'The stability method a / b / c is an EN 1993-1-1 5.2.2(3) concept and is ignored for IS 800.');
  }

  // ------------------------------------------------------------------ EN 1993-1-1
  if (s.standard === 'EN1993') {
    const codeValues = (s.sway?.source === 'code') || (s.bow?.source === 'code');
    if (codeValues) {
      const annexOk = !!s.nationalAnnex && s.nationalAnnex.ndps.filter((n) => ['phi0'].includes(n.id)).every((n) => n.value !== null && n.status === 'verified');
      if (!annexOk && !s.acceptEurocodeTextValues) err('nationalAnnex', 'No verified National Annex is selected. The EN 1993-1-1 imperfection values (φ0, e0/L) are National choices: select the Annex of the project, enter user-defined values, or accept the values printed in the Eurocode text (the run is then labelled provisional).', '5.3.2(3)');
      else if (!annexOk) warn('nationalAnnex', 'Values of the Eurocode text are used (φ0 = 1/200, Table 5.1): PROVISIONAL until the National Annex of the project is selected and verified.', '5.3.2(3)');
    }
    if (s.sway) {
      if (s.sway.mode === 'notional-loads') err('sway.mode', 'The notional forces of 4.3.6 are an IS 800 concept. EN 1993-1-1 uses an initial sway imperfection or its equivalent horizontal forces (5.3.2(7)).', '5.3.2(7)');
      else if (s.sway.source === 'code') { used.push('en.sway-imperfection'); if (s.sway.mode === 'equivalent-loads') used.push('en.equivalent-forces'); }
    }
    if (s.bow && s.bow.source === 'code') { used.push('en.bow-imperfection'); if (s.bow.mode === 'equivalent-loads') used.push('en.equivalent-forces'); }
    if (s.sway && s.bow && s.sway.mode !== s.bow.mode) warn('bow.mode', 'Sway and bow are introduced in different ways (loads vs geometry). Both are permitted separately; the code requires them to be treated as the imperfections of 5.3.2(3) a) and b), each once.', '5.3.2(3)');
    if (s.sway && s.bow) warn('bow', 'Sway and bow together: 5.3.2(6) requires the bow in addition to the sway only for frames sensitive to second-order effects and for compressed members with a moment-resistant joint at an end and λ̄ > 0.5 √(A fy/N_Ed). Check that condition per member (en1993BowRequired); otherwise the bow may be neglected in the global analysis.', '5.3.2(6)');
    if (!s.stabilityMethod) warn('stabilityMethod', 'Select how second-order effects and imperfections are accounted for (5.2.2(3) a / b / c); the report records it.', '5.2.2(3)');
    if (s.stabilityMethod === 'a' && s.order === 'first') err('order', '5.2.2(3) a) accounts for second-order effects and imperfections totally by the global analysis, which needs second order.', '5.2.2(3)');
    if (s.stabilityMethod === 'a' && s.sway && s.bow === undefined) warn('stabilityMethod', '5.2.2(7) a): no member stability check per 6.3 is necessary only if second-order effects in members AND the relevant member imperfections are totally accounted for; no bow imperfection is defined here.', '5.2.2(7)');
    if (s.stabilityMethod === 'c') warn('stabilityMethod', 'Method c) (equivalent members, buckling lengths from a global mode) uses first-order internal forces without imperfections (5.2.2(8)); the imperfection settings are not used in that method.', '5.2.2(8)');
  }

  // member checks are pending for both routes
  if (s.memberChecks) {
    const f: CodeFeature = s.standard === 'IS800' ? 'is800.member-design' : s.standard === 'EN1993' ? 'en.member-design' : 'is800.member-design';
    if (s.standard === 'user') err('memberChecks', 'Member design checks need a design standard.');
    else { const a = routeAvailability(f); if (a.state === 'blocked') err('memberChecks', `Member design checks are not available yet: ${a.reasons.join(' ')}`); }
  }

  // labelling
  let label: ValidationResult['label'] = 'verified';
  if (errors.length) label = 'blocked';
  else if (s.standard === 'user') label = 'user-defined';
  else {
    const hasUser = s.sway?.source === 'user' || s.bow?.source === 'user';
    for (const f of new Set(used)) { const a = routeAvailability(f); if (a.state === 'blocked') { label = 'blocked'; errors.push({ field: f, message: `The code feature ${f} is blocked: ${a.reasons.join(' ')}` }); } else if (a.state === 'provisional' && label === 'verified') label = 'provisional'; }
    if (label === 'verified' && s.standard === 'EN1993' && s.acceptEurocodeTextValues) label = 'provisional';
    if (label === 'verified' && hasUser) label = 'user-defined';
    // A second-order analysis alone does not make a design code compliant: member checks are pending for both standards
    if (label === 'verified') label = 'provisional';
    if (!errors.length && label === 'provisional') warn('result labelling', 'The analysis settings follow the verified analysis provisions; the member design checks of the standard are not implemented, so the result is not a code-compliance verdict.');
  }
  return { ok: errors.length === 0, errors, warnings, label, usedFeatures: [...new Set(used)] };
}

/** Which options are available for a standard, with the reason when they are not (for the settings panel). */
export function optionAvailability(standard: Standard): Record<string, Availability> {
  const A = (a: ReturnType<typeof routeAvailability>, clause?: string): Availability => ({ available: a.state !== 'blocked', state: a.state, reason: a.reasons.join(' '), clause });
  if (standard === 'IS800') {
    return {
      'sway.notional-loads': A(routeAvailability('is800.notional-loads'), '4.3.6'),
      'sway.geometry (code)': { available: false, state: 'blocked', reason: 'IS 800 has no provisions for explicit geometric sway imperfections in the frame analysis (register IS800-imperfection-values). A user-defined value can be entered.', clause: '4.3.6' },
      'bow (code)': { available: false, state: 'blocked', reason: 'IS 800 gives no member-bow value for the frame analysis. A user-defined value can be entered.', clause: 'Annex B-1.1' },
      'second-order': A(routeAvailability('is800.second-order'), 'B-2'),
      'first-order + amplification': A(routeAvailability('is800.first-order-amplification'), '4.4.2, 4.4.3.2-3'),
      'critical-load-factor': A(routeAvailability('is800.critical-load-factor'), '4.6, B-3'),
      'member-design': A(routeAvailability('is800.member-design'), 'Sections 7-9'),
    };
  }
  if (standard === 'EN1993') {
    return {
      'sway-imperfection': A(routeAvailability('en.sway-imperfection'), '5.3.2(3)a'),
      'bow-imperfection': A(routeAvailability('en.bow-imperfection'), '5.3.2(3)b'),
      'equivalent-forces': A(routeAvailability('en.equivalent-forces'), '5.3.2(7)'),
      'alpha-cr': A(routeAvailability('en.alpha-cr'), '5.2.1'),
      'sway-amplification': A(routeAvailability('en.sway-amplification'), '5.2.2(5)B'),
      'critical-mode-imperfection': A(routeAvailability('en.critical-mode-imperfection'), '5.3.2(11)'),
      'bracing-imperfection': A(routeAvailability('en.bracing-imperfection'), '5.3.3'),
      'diaphragm / torsional imperfection': A(routeAvailability('en.diaphragm-torsional-imperfection'), '5.3.2(5)B, (10)'),
      'member-design': A(routeAvailability('en.member-design'), '6'),
    };
  }
  return { 'user-defined imperfections': { available: true, state: 'user', reason: 'All values are entered by the user; the result is never labelled code-compliant.' } };
}

export { CODE_REGISTER, verificationWarnings };
