import 'server-only';
import { SCHEMA } from '@/shared/schema';
import { HttpError } from './http';

type Raw = Record<string, unknown>;

/** Shape check only (used by the calculation endpoints): known keys, primitive values, bounded length. Range problems are reported by the model itself. */
export function sanitiseInputs(raw: unknown): Record<string, string | number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'inputs must be an object');
  const out: Record<string, string | number> = Object.assign(SCHEMA.defaults(), {});
  // inputs stored by an earlier version: removed fields dropped, a removed design route replaced by IS 800 with the 'reviewed' flag cleared (never silent)
  const migrated = SCHEMA.migrate(raw as Raw).inputs as Raw;
  for (const [k, v] of Object.entries(migrated)) {
    if (!Object.prototype.hasOwnProperty.call(SCHEMA.byId, k)) throw new HttpError(400, `Unknown input "${k.slice(0, 40)}"`);
    if (v === null || v === undefined) { out[k] = ''; continue; }
    if (typeof v === 'boolean') { out[k] = v ? 'yes' : 'no'; continue; }
    if (typeof v !== 'string' && typeof v !== 'number') throw new HttpError(400, `Input "${k}" must be a single value`);
    if (typeof v === 'string' && v.length > 2000) throw new HttpError(400, `Input "${k}" is too long`);
    if (typeof v === 'number' && !Number.isFinite(v)) throw new HttpError(400, `Input "${k}" is not a finite number`);
    out[k] = v;
  }
  return out;
}

/** Full validation (used before anything is stored): type, option membership, limits and whole-number rules of every input. */
export function validateInputsForSave(raw: unknown): { inputs: Record<string, string | number>; errors: { id: string; label: string; message: string }[] } {
  const inputs = sanitiseInputs(raw);
  const errors: { id: string; label: string; message: string }[] = [];
  for (const f of SCHEMA.T as any[]) {
    if (f.tabDef) continue;
    const v = inputs[f.id];
    const bad = (message: string) => errors.push({ id: f.id, label: f.label, message });
    const s = String(v ?? '').trim();
    if (f.type === 'n') {
      if (s === '') { if (!f.opt) bad('Required'); continue; }
      const x = Number(s);
      if (!Number.isFinite(x)) bad('Not a number');
      else if (f.min !== undefined && x < f.min) bad(`Minimum ${f.min}`);
      else if (f.max !== undefined && x > f.max) bad(`Maximum ${f.max}`);
      else if (f.int && Math.round(x) !== x) bad('Whole number required');
    } else if (f.type === 's' || f.type === 'b') {
      const allowed: string[] = f.type === 'b' ? ['yes', 'no'] : f.opts.map((o: any) => String(o[0]));
      if (!allowed.includes(String(v))) bad('Not an available option');
    } else if (f.type === 'l') {
      if (s.split(/[,;\s]+/).filter(Boolean).some((t) => !Number.isFinite(Number(t)))) bad('Comma-separated numbers required');
    } else if (s.length > 500) bad('Too long');
  }
  return { inputs, errors };
}

export function validateMeta(b: any) {
  const str = (k: string, max: number, req = false) => {
    const v = b?.[k] === undefined || b?.[k] === null ? '' : String(b[k]).trim();
    if (req && !v) throw new HttpError(400, `${k} is required`);
    if (v.length > max) throw new HttpError(400, `${k} is too long (max ${max})`);
    return v;
  };
  return { name: str('name', 200, true), reference: str('reference', 200), customer: str('customer', 200), customer_contact: str('customer_contact', 300), site: str('site', 300), notes: str('notes', 4000) };
}
