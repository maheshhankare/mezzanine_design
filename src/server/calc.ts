import 'server-only';
import { stringify } from 'devalue';
import { MODEL } from './engine/model';
import { SK } from './engine/svg';
import { XCHK } from './engine/xcheck';
import { OPT } from './engine/opt';
import { CHK } from '@/shared/check';
import { UNITS } from '@/shared/units';
import { APP_VERSION } from '@/shared/version';
import { sanitiseInputs } from './validate';

type Inputs = Record<string, any>;

/** The display units chosen in the browser: applied to the sketches, which print dimensions in the selected units. */
export function applyUnits(u: unknown) {
  try { UNITS.set(u && typeof u === 'object' ? u : {}, true); } catch { UNITS.set({}, true); }
}

export function compute(inputs: Inputs): any {
  try {
    return MODEL.compute(inputs);
  } catch (e: any) {
    console.error('[calc]', e);
    return { fatal: true, crash: true, msgs: [{ level: 'error', tab: 'gen', text: 'Calculation error: ' + (e && e.message ? e.message : e) }] };
  }
}

// ---------------- steel take-off ----------------
export function takeoff(r: any, J: Inputs) {
  if (!r || r.fatal) return null;
  const g = r.gross, nb = +J.nb, nm = +J.nm;
  const mb = (g.mb.mass * (nm + 1) * nb * J.Lmb) / 1e3, sbi = (g.sbi.mass * +J.nsbi * nb * nm * J.Lsb) / 1e3, sbe = (g.sbe.mass * (nb + 1) * nm * J.Lsb) / 1e3;
  const col = ((r.mods.col.props ? r.mods.col.props.A : 0) * 7850e-6 * +J.hc / 1e3) * (nb + 1) * (nm + 1);
  const jr = ['sbi', 'sbe'].some((k) => /joist|both/.test(J[k + '_rst'])) && +J.j_n > 0 ? OPT.quantities(J, 'joist', {}).mass : 0;
  const area = (nb * J.Lmb * nm * J.Lsb) / 1e6, tot = mb + sbi + sbe + col + jr;
  return { mb, sbi, sbe, col, joist: jr, tot, area, perArea: tot / area };
}

// ---------------- sketches (SVG strings built on the server from the calculated model) ----------------
const mTof = (d: any) => {
  const c = d.comb || { aG: 1, aQ: 1 };
  const w = (d.spec.G.udl[0] ? c.aG * d.spec.G.udl[0].w : 0) + (d.spec.Q.udl[0] ? c.aQ * d.spec.Q.udl[0].w : 0);
  return (w * (d.spec.eUdl || 0)) / 1e3;
};

function sketches(res: any, I: Inputs) {
  const s: any = { member: {}, conn: {} };
  s.plan = SK.plan(I, res.layout, res.mods);
  for (const k of ['mb', 'sbi', 'sbe']) {
    const d = k === 'mb' ? res.mods.mb.gov : res.mods[k];
    if (!d || d.error) continue;
    const cn = res.mods.conn[k === 'mb' ? 'cm' : k === 'sbi' ? 'ci' : 'ce'];
    s.member[k] = {
      section: SK.section(d.spec.p, d.spec.arr, d.spec.opt, d.gross, { lp: d.spec.lp, mT: mTof(d) }),
      webHoles: cn ? SK.webHoles(cn.geo, cn.adj) : '',
      beam: SK.beam(d),
    };
  }
  for (const k of ['ci', 'ce', 'cm']) {
    const c = res.mods.conn[k];
    if (c) s.conn[k] = { webHoles: SK.webHoles(c.geo, c.adj), connPlan: SK.connPlan(c.geo, { e: c.e }) };
  }
  s.col = SK.column(I, res.mods.col.props || {});
  s.base = SK.basePlate(I);
  if (res.mods.knee && res.mods.knee.use) s.knee = SK.knee(I, res.mods.knee);
  return s;
}

// ---------------- wire format ----------------
// The browser needs the results, never the calculation code: functions are baked into plain values, typed arrays become arrays.
// With DISCLOSE_CHECK_DETAIL=false the equations, factors and intermediate steps of every check are removed as well.
const DETAIL = () => process.env.DISCLOSE_CHECK_DETAIL !== 'false';

export function toWire(root: any) {
  const seen = new Set<any>();
  const walk = (o: any) => {
    if (!o || typeof o !== 'object' || seen.has(o)) return;
    seen.add(o);
    if (typeof o.fmt === 'function') {
      try { if (typeof o.Ed === 'number') o.EdF = o.fmt(o.Ed); if (typeof o.Rd === 'number') o.RdF = o.fmt(o.Rd); } catch { /* keep raw */ }
      delete o.fmt;
    }
    if (!DETAIL() && o.status && o.clause !== undefined && o.grp !== undefined) { delete o.eq; delete o.factor; delete o.steps; delete o.inputs; }
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'function') delete o[k];
      else if (ArrayBuffer.isView(v)) o[k] = Array.from(v as any);
      else walk(v);
    }
  };
  walk(root);
  return root;
}

export function calcPayload(rawInputs: unknown, units?: unknown) {
  const I = sanitiseInputs(rawInputs);
  applyUnits(units);
  const res = compute(I);
  if (!res.fatal) res.svg = sketches(res, I);
  const tk = takeoff(res, I);
  const fingerprint = XCHK.fingerprint(I);
  toWire(res);
  return { text: stringify({ res, takeoff: tk, fingerprint, engine: XCHK.ENGINE_VERSION, appVersion: APP_VERSION, at: new Date().toISOString() }), res, I, fingerprint };
}

// ---------------- compact results kept in the database (statuses, utilisation ratios, warnings) ----------------
const num = (x: any) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export function compactResults(res: any) {
  if (!res || res.fatal) return { status: 'INVALID' as const, maxEta: null, nFail: null, nReview: null, summary: { invalid: true, messages: (res?.msgs || []).map((m: any) => ({ level: m.level, tab: m.tab, text: m.text })) } };
  const S = res.summary;
  const summary = {
    overall: { status: S.overall.status, maxEta: num(S.overall.eta), governing: S.overall.gov ? S.overall.gov.name : null },
    counts: { pass: S.nPass, fail: S.nFail, review: S.nReview, na: S.nNA },
    modules: S.rows.map((r: any) => ({
      key: r.key, label: r.label, status: r.status, maxEta: num(r.eta), governing: r.gov ? r.gov.name : null,
      checks: r.list.map((c: any) => ({
        group: c.grp || '', name: c.name, clause: c.clause || '', basis: c.basis, unit: c.unit || '', status: c.status,
        demand: num(c.EdF ?? c.Ed), resistance: num(c.RdF ?? c.Rd), eta: num(c.eta), etaInfinite: c.eta === Infinity || undefined,
        note: c.status === 'PASS' ? undefined : c.why || c.note || undefined, remedy: c.status === 'FAIL' ? c.fix || undefined : undefined,
      })),
    })),
    messages: (res.msgs || []).map((m: any) => ({ level: m.level, tab: m.tab, text: m.text })),
  };
  return { status: S.overall.status as string, maxEta: num(S.overall.eta), nFail: S.nFail as number, nReview: S.nReview as number, summary };
}

export const overall = CHK.overall;
