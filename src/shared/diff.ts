import { SCHEMA } from './schema';

/** Inputs that differ from the defaults (the compact form used for links and the optimisation history). */
export function diffOf(J: Record<string, any>): Record<string, any> {
  const d = SCHEMA.defaults(),
    o: Record<string, any> = {};
  for (const k in J) if (k in d && String(J[k]) !== String(d[k])) o[k] = J[k];
  return o;
}
