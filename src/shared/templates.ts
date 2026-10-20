// Starting points offered when a new project is created (formerly the preset design cases).
export const TEMPLATES: { id: string; label: string; inputs: Record<string, string | number> }[] = [
  { id: 'example3', label: 'Example 3 – mapped to C-sections (as entered)', inputs: {} },
  {
    id: 'opt-demo',
    label: 'Optimisation demo – main beam C200×50×10×2',
    inputs: { ref: 'Optimisation demo: main beam C200×50×10×2', mb_H: 200, mb_Bt: 50, mb_Bb: 50, mb_Ct: 10, mb_Cb: 10, mb_t: 2, sbi_arr: 'b2b', sbe_arr: 'b2b', sbi_t: 1.5, sbe_t: 1.5, ci_nv: 3, ci_p1: 80, ce_nv: 3, ce_p1: 80 },
  },
  {
    id: 'example3-revised',
    label: 'Example 3 – revised study (all checks PASS)',
    inputs: { ref: 'Example 3 revised: b2b secondaries, main beam t 2.5', sbi_arr: 'b2b', sbe_arr: 'b2b', sbi_t: 1.5, sbe_t: 2, mb_t: 2.5, ci_nv: 3, ci_p1: 80, ce_nv: 3, ce_p1: 80, k_nL: '2', k_nb: 2, k_tg: 8 },
  },
];
