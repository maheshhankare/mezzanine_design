import 'server-only';
import { parse, stringify } from 'devalue';
import { OPTUI } from './engine/optui';
import { checksHTML, kvTable, pill } from './htmlParts';
import { diffOf } from '@/shared/diff';
import { applyUnits, compute, takeoff, toWire } from './calc';
import { sanitiseInputs } from './validate';

/**
 * Server side of the optimisation tab. The browser keeps the tab's settings (S), history and the light form of the last result and sends
 * them with every request; this module renders the panel from them and runs the search. Nothing is kept between requests.
 */
export type Effect = { type: string; [k: string]: unknown };

function host(I: any, res: any, effects: Effect[]) {
  return {
    I: () => I,
    res: () => res,
    diffOf,
    takeoff: (r: any, J: any) => takeoff(r, J),
    pill,
    kvTable,
    checksHTML,
    render: () => {},
    toast: (text: string) => effects.push({ type: 'toast', text }),
    assign: (ov: any) => effects.push({ type: 'assign', ov }),
    setInputs: (inputs: any) => effects.push({ type: 'setInputs', inputs }),
    saveCase: (name: string, inputs: any) => effects.push({ type: 'newProject', name, inputs }),
    effect: (e: Effect) => effects.push(e),
  };
}

// the full model results inside a result are rebuilt on the server (OPTUI.hydrate) instead of travelling back and forth
const lightR = (R: any) => {
  if (!R) return null;
  const { base, final, comp, ...rest } = R;
  void base; void final; void comp;
  return stringify(toWire(rest)); // functions (unit scalers) are baked into plain values; shared references are kept
};
const readR = (txt: unknown) => {
  if (typeof txt !== 'string' || !txt) return null;
  try { return parse(txt); } catch { return null; }
};

interface Req {
  inputs: unknown; units?: unknown; S?: any; hist?: any[]; Rtxt?: string | null; head?: any;
  running?: boolean; msg?: string; pct?: number; ev?: any; answers?: unknown[];
}

function fakeEl(ev: any) {
  const cls = String(ev.className || '').split(/\s+/).filter(Boolean);
  return {
    id: String(ev.id || ''), name: String(ev.name || ''), value: ev.value ?? '', checked: !!ev.checked,
    dataset: ev.dataset && typeof ev.dataset === 'object' ? ev.dataset : {},
    matches: (sel: string) => sel.startsWith('.') && cls.includes(sel.slice(1)),
    closest: () => true,
  };
}

function view(body: Req, extra: { event?: boolean } = {}) {
  const I = sanitiseInputs(body.inputs);
  applyUnits(body.units);
  const res = compute(I);
  const effects: Effect[] = [];
  const R0 = readR(body.Rtxt);
  OPTUI.load({ host: host(I, res, effects), S: body.S, hist: Array.isArray(body.hist) ? body.hist.slice(-20) : [], R: R0, head: body.head, answers: body.answers, running: body.running, msg: body.msg, pct: body.pct });
  let ask: any = null;
  if (extra.event) {
    const ev = body.ev || {};
    try {
      OPTUI.hydrate();
      if (ev.type === 'change') OPTUI.onChange({ target: fakeEl(ev) });
      else if (ev.type === 'click') OPTUI.onClick(fakeEl(ev));
    } catch (e: any) {
      if (e instanceof OPTUI.Ask) ask = e.ask;
      else throw e;
    }
  }
  if (!res.fatal) OPTUI.hydrate();
  const html = OPTUI.panel();
  const st = OPTUI.state();
  return { html, S: st.S, hist: st.hist, Rtxt: lightR(st.R), effects, ask };
}

export const renderOpt = (body: Req) => view(body);
export const eventOpt = (body: Req) => view(body, { event: true });

/** Prepares a search: returns what the generator needs. The module state is loaded again before each use (requests interleave). */
export function prepareRun(body: Req) {
  const I = sanitiseInputs(body.inputs);
  applyUnits(body.units);
  const effects: Effect[] = [];
  const h = host(I, null, effects);
  OPTUI.load({ host: h, S: body.S, hist: body.hist || [], R: null, head: body.head });
  return { I, h, setup: OPTUI.runSetup() };
}

export function finishRun(body: Req, I: any, h: any, R: any, baseHash: string) {
  OPTUI.load({ host: h, S: body.S, hist: body.hist || [], R: null, head: body.head });
  void I;
  const out = OPTUI.runDone(R, baseHash);
  return { S: out.S, hist: out.hist, Rtxt: lightR(out.R) };
}
