import { routeAvailability, type CodeFeature, type RouteState } from './codeRegister';

/**
 * Analysis and design settings of a frame project, and their validation. Client-safe (no server imports): the settings panel and the server use the same
 * rules. IS 800:2007 is the ONLY design standard: there is no code selector, and stored settings of older versions (which could name another standard)
 * are migrated by `migrateSettings`, which never reinterprets an old value silently: it removes what no longer exists and requires a review.
 */
export const DESIGN_STANDARD = 'IS 800:2007' as const;
export const DESIGN_STANDARD_TITLE = 'IS 800:2007: Indian Standard for steel design (General Construction in Steel, Code of Practice)';
export const SETTINGS_VERSION = 3;

export type SwayMode = 'notional-loads' | 'equivalent-loads' | 'geometry';
export type BowMode = 'geometry' | 'equivalent-loads';
export type ImperfectionSource = 'code' | 'user';
export type Direction = '+X' | '-X' | '+Y' | '-Y';

export interface SwaySettings { mode: SwayMode; source: ImperfectionSource; phi0?: number; direction: Direction }
/** member bow: IS 800 gives no value for the frame analysis, so a bow imperfection is always user-defined */
export interface BowSettings { mode: BowMode; source: 'user'; e0OverL?: number }

export interface DesignSettings {
  /** run the IS 800 member design checks after the analysis */
  enabled: boolean;
  /** effective-length factors of IS 800 7.2: REQUIRED when the design is enabled (no default is assumed) */
  kLy?: number;
  kLz?: number;
  /** Table 18: 'sway' = C_my = C_mz = 0.9 for members with a sway buckling mode, 'table' = row A from the end moments */
  cm: 'sway' | 'table';
  /** Table 10 for hollow sections: hot rolled (class a) or cold formed / welded (class b) */
  manufacture: 'hollow-hot-rolled' | 'hollow-cold-formed' | 'welded-box';
  supportCase?: 'simply-supported' | 'cantilever';
}

export interface AnalysisSettings {
  version: typeof SETTINGS_VERSION;
  order: 'first' | 'second';
  theory: 'II' | 'vonKarman';
  shearDeformation: boolean;
  /** global stiffness modification factors (EA, EI, GJ); 1 = none */
  stiffnessFactors: { EA: number; EI: number; GJ: number };
  sway?: SwaySettings;
  bow?: BowSettings;
  /** other horizontal loads (wind, earthquake) / temperature act in the combinations that contain the sway imperfection */
  otherLateralLoadsInCombination: boolean;
  temperatureInCombination: boolean;
  /** the results are used for an overturning / overall-instability check, or the base shear of the foundation */
  usedForOverturningCheck: boolean;
  /** an equivalent notional / imperfection load case is ALSO present in the load cases entered by the user */
  imperfectionLoadsInLoadCases: boolean;
  maxIterations: number;
  loadSteps: number;
  design: DesignSettings;
  /** set by the migration of an older project: the settings must be reviewed and confirmed before any analysis or design is run */
  review: { required: boolean; reasons: string[]; confirmedAt?: string };
}

export const defaultSettings = (): AnalysisSettings => ({
  version: SETTINGS_VERSION, order: 'second', theory: 'II', shearDeformation: true, stiffnessFactors: { EA: 1, EI: 1, GJ: 1 },
  otherLateralLoadsInCombination: false, temperatureInCombination: false, usedForOverturningCheck: false, imperfectionLoadsInLoadCases: false, maxIterations: 100, loadSteps: 4,
  design: { enabled: false, cm: 'sway', manufacture: 'hollow-hot-rolled' },
  review: { required: false, reasons: [] },
});

// ------------------------------------------------------------------------------------------------------------- migration
/** keys that belonged to removed design routes: never read, never kept */
const REMOVED_KEYS = ['standard', 'nationalAnnex', 'acceptEurocodeTextValues', 'stabilityMethod', 'code', 'route', 'na', 'annex', 'partialFactors', 'gM0', 'gM1', 'gM2'];

export interface Migration { settings: AnalysisSettings; migrated: boolean; flags: string[] }

/**
 * Brings stored settings of any earlier version to the current schema. Nothing is reinterpreted: a removed field is dropped and named in `flags`; an imperfection
 * that was taken from a code route (its values came from a design standard that no longer exists in the application) is dropped, a user-defined one is kept; the
 * result always requires a review (`review.required`) when anything was changed, and the design stays disabled until the user confirms.
 */
export function migrateSettings(raw: unknown): Migration {
  const out = defaultSettings();
  const flags: string[] = [];
  if (raw === null || raw === undefined) return { settings: out, migrated: false, flags };
  if (typeof raw !== 'object') { out.review = { required: true, reasons: ['stored settings were not an object and were discarded'] }; return { settings: out, migrated: true, flags: ['stored settings discarded'] }; }
  const r = raw as Record<string, any>;
  const version = typeof r.version === 'number' ? r.version : 1;
  for (const k of REMOVED_KEYS) if (k in r) flags.push(`removed setting "${k}": the application supports IS 800:2007 only`);
  const num = (v: any, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  if (r.order === 'first' || r.order === 'second') out.order = r.order;
  if (r.theory === 'II' || r.theory === 'vonKarman') out.theory = r.theory;
  if (typeof r.shearDeformation === 'boolean') out.shearDeformation = r.shearDeformation;
  if (r.stiffnessFactors && typeof r.stiffnessFactors === 'object') out.stiffnessFactors = { EA: num(r.stiffnessFactors.EA, 1), EI: num(r.stiffnessFactors.EI, 1), GJ: num(r.stiffnessFactors.GJ, 1) };
  for (const k of ['otherLateralLoadsInCombination', 'temperatureInCombination', 'usedForOverturningCheck', 'imperfectionLoadsInLoadCases'] as const) if (typeof r[k] === 'boolean') out[k] = r[k];
  out.maxIterations = num(r.maxIterations, out.maxIterations); out.loadSteps = num(r.loadSteps, out.loadSteps);
  const sw = r.sway;
  if (sw && typeof sw === 'object') {
    const wasRemoved = 'standard' in r || 'nationalAnnex' in r;
    if (sw.source === 'user' || (sw.mode === 'notional-loads' && !wasRemoved)) {
      out.sway = { mode: ['notional-loads', 'equivalent-loads', 'geometry'].includes(sw.mode) ? sw.mode : 'equivalent-loads', source: sw.mode === 'notional-loads' ? 'code' : 'user', phi0: typeof sw.phi0 === 'number' ? sw.phi0 : undefined, direction: ['+X', '-X', '+Y', '-Y'].includes(sw.direction) ? sw.direction : '+X' };
      if (sw.mode !== 'notional-loads' && version !== SETTINGS_VERSION) flags.push('sway imperfection kept as USER-DEFINED: confirm the value');
    } else flags.push('sway imperfection taken from a removed code route was dropped: choose the IS 800 notional loads or enter a user-defined value');
  }
  const bw = r.bow;
  if (bw && typeof bw === 'object') { if (bw.source === 'user' && typeof bw.e0OverL === 'number') { out.bow = { mode: bw.mode === 'equivalent-loads' ? 'equivalent-loads' : 'geometry', source: 'user', e0OverL: bw.e0OverL }; if (version !== SETTINGS_VERSION) flags.push('bow imperfection kept as USER-DEFINED: confirm the value'); } else flags.push('bow imperfection taken from a removed code route was dropped'); }
  if (r.design && typeof r.design === 'object') {
    const d = r.design;
    const keep = d.enabled === true && version === SETTINGS_VERSION && !REMOVED_KEYS.some((k) => k in r); // a current, clean project keeps its design switch
    out.design = { enabled: keep, kLy: typeof d.kLy === 'number' ? d.kLy : undefined, kLz: typeof d.kLz === 'number' ? d.kLz : undefined, cm: d.cm === 'table' ? 'table' : 'sway', manufacture: ['hollow-hot-rolled', 'hollow-cold-formed', 'welded-box'].includes(d.manufacture) ? d.manufacture : 'hollow-hot-rolled', supportCase: d.supportCase === 'simply-supported' || d.supportCase === 'cantilever' ? d.supportCase : undefined };
    if (d.enabled && !keep) flags.push('the member design was disabled: enable it again after reviewing the IS 800 settings');
  }
  const migrated = version !== SETTINGS_VERSION || flags.length > 0;
  if (migrated) out.review = { required: true, reasons: version !== SETTINGS_VERSION ? [`stored settings version ${version} migrated to ${SETTINGS_VERSION}`, ...flags] : flags };
  else if (r.review && typeof r.review === 'object' && r.review.required === true) out.review = { required: true, reasons: Array.isArray(r.review.reasons) ? r.review.reasons.map(String) : [] };
  else if (r.review && typeof r.review.confirmedAt === 'string') out.review = { required: false, reasons: [], confirmedAt: r.review.confirmedAt };
  return { settings: out, migrated, flags };
}

// ------------------------------------------------------------------------------------------------------------- validation
export interface Issue { field: string; message: string; clause?: string }
export interface Availability { available: boolean; state: RouteState | 'user'; reason: string; clause?: string }
export interface ValidationResult {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  /** how the results must be labelled: user-defined imperfections are never "code" results; design checks are labelled by the register */
  label: 'provisional' | 'user-defined' | 'blocked';
  usedFeatures: CodeFeature[];
}

const range = (v: number | undefined, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v > lo && v <= hi;

export function validateSettings(s: AnalysisSettings): ValidationResult {
  const errors: Issue[] = [], warnings: Issue[] = [];
  const err = (field: string, message: string, clause?: string) => errors.push({ field, message, clause });
  const warn = (field: string, message: string, clause?: string) => warnings.push({ field, message, clause });
  const used: CodeFeature[] = [];

  if (s.version !== SETTINGS_VERSION) err('version', `The settings have version ${s.version}; run migrateSettings first.`);
  if (s.review.required) err('review', `The settings of this project must be reviewed and confirmed before an analysis or design is run: ${s.review.reasons.join('; ')}`);

  if (!(Number.isInteger(s.maxIterations) && s.maxIterations >= 1 && s.maxIterations <= 100)) err('maxIterations', 'The iteration limit must be an integer from 1 to 100; reaching the limit is never treated as convergence.');
  if (!(Number.isInteger(s.loadSteps) && s.loadSteps >= 1 && s.loadSteps <= 100)) err('loadSteps', 'The number of load steps must be an integer from 1 to 100.');
  for (const k of ['EA', 'EI', 'GJ'] as const) if (!(Number.isFinite(s.stiffnessFactors[k]) && s.stiffnessFactors[k] > 0 && s.stiffnessFactors[k] <= 1.5)) err(`stiffnessFactors.${k}`, `The stiffness factor for ${k} must be a number in (0, 1.5].`);
  if (s.sway && s.sway.source === 'user' && !range(s.sway.phi0, 0, 0.05)) err('sway.phi0', 'The sway imperfection φ0 must be a dimensionless inclination in (0, 0.05], e.g. 0.005 for 1/200 (not a percentage, not an angle in degrees).');
  if (s.bow && !range(s.bow.e0OverL, 0, 0.02)) err('bow.e0OverL', 'The bow imperfection e0/L must be a dimensionless ratio in (0, 0.02], e.g. 0.004 for L/250.');

  if (s.order === 'first' && s.theory === 'vonKarman') warn('theory', 'The theory setting has no effect in a first-order analysis.');
  if (s.theory === 'vonKarman' && s.order === 'second') warn('theory', 'Von Kármán (membrane coupling) is not the second-order elastic analysis of IS 800 Annex B; it increased the sway of the benchmark by 63 % (docs/SECOND_ORDER.md). Use Theory II for design.');
  if (s.order === 'first') warn('order', 'IS 800 4.4.2 / 4.4.3.1: first-order analysis is permitted only with moment amplification and only while the amplification factor does not exceed 1.4; the amplification factor is not implemented (register IS800-4.4.2). The second-order analysis of Annex B is the design route; the member design refuses first-order results.', '4.4.2');
  if (s.order === 'second') used.push('is800.second-order');
  if (s.shearDeformation === false) warn('shearDeformation', 'Shear deformation is off. It must match the model it is compared with: RSTAB Detail 2 and 3 use it, Detail 1 did not.');

  if (s.sway && s.imperfectionLoadsInLoadCases && s.sway.mode !== 'equivalent-loads') err('imperfectionLoadsInLoadCases', 'A sway imperfection and equivalent / notional imperfection loads in the load cases represent the same effect and would be counted twice. Use one of them.');
  if (s.sway) {
    if (s.sway.mode === 'notional-loads') {
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
  if (s.bow) warn('bow', 'User-defined bow imperfection: IS 800 gives no member-bow value for the frame analysis (member bow enters through the buckling curves of Section 7).');

  // member design
  if (s.design.enabled) {
    if (s.order !== 'second') err('design.enabled', 'The member design uses the second-order analysis of Annex B (4.4.3.1 b); first-order results are not designed because the amplification factor of 4.4.2 is not implemented.', '4.4.2');
    for (const k of ['kLy', 'kLz'] as const) if (!range(s.design[k], 0, 10)) err(`design.${k}`, 'The effective-length factor k of IS 800 7.2 must be given for both axes (a number in (0, 10]); no default is assumed. The RSTAB reference used 1.0.', '7.2');
    const a = routeAvailability('is800.design.hollow');
    if (a.state === 'blocked') err('design.enabled', `The hollow-section design is blocked: ${a.reasons.join(' ')}`);
    else used.push('is800.design.hollow');
    if (s.sway && s.sway.mode === 'notional-loads' && s.design.cm !== 'sway') warn('design.cm', 'Table 18 gives C_m = 0.9 for members with a sway buckling mode; row A is used instead: confirm that the members are braced.', 'Table 18');
  }

  let label: ValidationResult['label'] = 'provisional';
  if (errors.length) label = 'blocked';
  else if (s.sway?.source === 'user' || s.bow) label = 'user-defined';
  else warn('result labelling', 'The result is labelled provisional: member design is available only for rectangular hollow sections; cold-formed (IS 801), open and angle members are reported pending, and some assumptions are listed in the register.');
  return { ok: errors.length === 0, errors, warnings, label, usedFeatures: [...new Set(used)] };
}

/** Which options are available, with the reason when they are not (for the settings panel). */
export function optionAvailability(): Record<string, Availability> {
  const A = (a: ReturnType<typeof routeAvailability>, clause?: string): Availability => ({ available: a.state !== 'blocked', state: a.state, reason: a.reasons.join(' '), clause });
  return {
    'notional horizontal loads': A(routeAvailability('is800.notional-loads'), '4.3.6'),
    'explicit geometric sway (code)': { available: false, state: 'blocked', reason: 'IS 800 has no provisions for explicit geometric sway imperfections in the frame analysis (register IS800-imperfection-values). A user-defined value can be entered.', clause: '4.3.6' },
    'member bow (code)': { available: false, state: 'blocked', reason: 'IS 800 gives no member-bow value for the frame analysis. A user-defined value can be entered.', clause: 'Annex B-1.1' },
    'second-order analysis': A(routeAvailability('is800.second-order'), 'B-2'),
    'first order with moment amplification': A(routeAvailability('is800.first-order-amplification'), '4.4.2, 4.4.3.2-3'),
    'critical load factor': A(routeAvailability('is800.critical-load-factor'), '4.6, B-3'),
    'design: hollow sections': A(routeAvailability('is800.design.hollow'), '6.2, 7.1.2, 8.2, 8.4, 9.3'),
    'design: open sections': A(routeAvailability('is800.design.open-sections'), '7-9'),
    'design: angles': A(routeAvailability('is800.design.angles'), '6.3, 7.5'),
    'design: cold-formed sections': A(routeAvailability('is800.design.cold-formed'), 'IS 801'),
  };
}
