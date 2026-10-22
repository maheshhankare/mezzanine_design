# IS 800:2007 member design (rectangular hollow sections)

Code: `src/server/frame/design/is800.ts` (equations), `src/server/frame/design/member.ts` (a member, station by station), `src/server/frame/run.ts` (project run). Tests: `npm run test:design` (115 checks: every equation against hand values and against the values printed in the RSTAB report; invalid inputs). Per-clause status, evidence pages and outstanding items: `docs/CODE_REGISTER.md`. Comparison with RSTAB's STEEL IS results: `docs/RSTAB_BENCHMARK.md` section 8.

Only provisions that were read in the supplied official text **and checked on the page image** are implemented as verified. Everything the standard leaves to the engineer is an **input**, never a default.

## Scope

| Section type | State |
|---|---|
| Rectangular / square hollow sections (rolled, cold-formed or welded box, one wall thickness), class 1-3 | implemented; verified provisions below |
| Class 4 (slender) sections | pending: outside IS 800 (refer to IS 801, 3.7.2) |
| Open sections (I, channel), angles, built-up | pending (register: IS800-members-open, 7.5, 8.2.2 open sections, Tables 13 and 14) |
| Cold-formed light-gauge sections | pending: IS 801 was not supplied |

Pending sections are reported per member as **pending** with the reason and the input needed; they are never designed with another standard's rules.

## Provisions

| Check | Clause | Notes |
|---|---|---|
| Classification | 3.7, Table 2 | ε = √(250/f_y); flat width b − 2t and depth h − 2t (the clear width between the walls of the hollow section, Table 2); the compression flange and the web under the stress state at each station (axial, bending, combined with r₁, r₂); the governing class over the stations |
| Partial factors | 5.4.1, Table 5 | γ_m0 = 1.10, γ_m1 = 1.25 |
| Tension | 6.1, 6.2 | A_g f_y/γ_m0 (net-section rupture 6.3 is pending) |
| Compression | 7.1.1, 7.1.2, 7.1.2.1, Tables 7, 8, 9 | f_cd from the imperfection factor α (Table 7), Euler stress, Φ, χ ≤ 1; P_d = A_e f_cd; both axes |
| Buckling class | 7.1.2.2, Table 10 | hot-rolled hollow: a; cold-formed hollow and welded box: b (input `manufacture`) |
| Shear | 8.4, 8.4.1 | V_d = A_v f_yw/(√3 γ_m0); A_v of the walls parallel to the force |
| Bending | 8.2.1, 8.2.1.2 | M_d = β_b Z_p f_y/γ_m0 (β_b = Z_e/Z_p for semi-compact), limited to 1.2 (simple support) / 1.5 (cantilever) Z_e f_y/γ_m0 **only for a stated support case** |
| Lateral-torsional buckling | 8.2.2 (a)-(c) | a hollow section with these proportions is not susceptible: λ_LT = 0 |
| Section interaction | 9.3.1.1-9.3.1.3, Table 17 | reduced moment capacities, the exponent n of Table 17; the linear form is reported alongside |
| Overall member strength | 9.3.2.1, 9.3.2.2, Table 18 | K_y, K_z, K_LT, C_my, C_mz (0.9 for a sway buckling mode, row A from the end moments otherwise); IS 800 names the minor axis y and the major axis z: the mapping uses the second moments of area |

## Inputs the standard leaves to the engineer (no defaults)

* **Effective lengths** (7.2): the factors `kLy`, `kLz` (Table 11 and Annex D are not verified in the register). The project settings require them when the design is on; a design without them is refused.
* **Manufacturing route** of the section (Table 10).
* **C_m choice**: sway buckling mode (0.9) or the end moments of the member (Table 18 row A). Row C is not implemented (the printed coefficients are inconsistent).
* The **support case** for the 1.2 / 1.5 limit of 8.2.1.2.

## Use of the analysis results

The design uses the **second-order** analysis (Annex B-2: the moments along the member come directly from the analysis, B-2.2(a)): a first-order analysis is refused for design because the amplification factor of 4.4.2 / 4.4.3.3 is not implemented. Stations are the two ends and the middle of every finite element of the member; the governing station and combination are reported per check. The effective lengths are the factors `kLy`, `kLz` times the member length.

## Result labels

Each design result carries the register state of the provisions it used (`verified` / `provisional` / `pending`) and appears in the calculation record next to the analysis results, which are kept apart from the design checks: a converged analysis is not proof of IS 800 compliance, and the agreement with RSTAB of the internal forces is not proof either.

## Open items

* RSTAB's overall-member utilisation (equations 341 / 351) is not reproduced; the implementation follows the printed text (`docs/RSTAB_BENCHMARK.md` section 8).
* Table 18 row C; 7.2 effective-length rules; 6.3 / 6.4 (rupture, block shear); 7.5 (angle struts); 8.2.2 for open sections; 9.2.2 (provisional: the two webs are taken as the shear area); connections (Section 10); IS 801.
