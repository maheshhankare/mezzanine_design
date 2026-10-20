import { U } from '@/shared/util';
import { UNITS } from '@/shared/units';

export const F: (x: number, d?: number) => string = U.fmt;

export const BASIS: Record<string, string> = {
  code: 'Code formula',
  approx: 'Documented approximation – verify',
  num: 'Numerical model (validated, see QA log)',
  user: 'User / manufacturer value',
  none: 'Not established – REVIEW',
};

export const etaTxt = (c: any): string =>
  c.status === 'N/A'
    ? '–'
    : c.eta === null || c.eta === undefined
      ? '–'
      : !isFinite(c.eta)
        ? c.unstable
          ? '∞ (unstable)'
          : c.Ed === undefined
            ? 'rule'
            : '∞'
        : F(c.eta, 2);

// Display units: a value written by the engine in unit u is shown in the unit selected for its category.
export const UVx = (x: any, u: string, hint?: string, d?: number): { txt: string } =>
  UNITS.show(x, u, UNITS.catFor(u, hint), d, F);
export const UL = (u?: string, hint?: string): string => (u ? UNITS.label(u, UNITS.catFor(u, hint)) : '');

export const val = (c: any, v: any): string =>
  v === undefined || v === null
    ? '–'
    : typeof v === 'number'
      ? UVx(v, c.unit, (c.sym || '') + ' ' + c.name, 2).txt
      : String(v);

export const stepVal = (v: any, u?: string, h?: string): string =>
  typeof v === 'number' ? UVx(v, u || '', h, Math.abs(v) >= 100 ? 1 : 3).txt : v === undefined || v === null ? '–' : String(v);
