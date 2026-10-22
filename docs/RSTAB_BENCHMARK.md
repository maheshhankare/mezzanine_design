# RSTAB benchmark: Mezzanine 3x5 Base

Two states of the same RSTAB model were supplied. **The later one (Detail 2, `benchmarks/rstab-3x5-v2`) is the reference for all current work.** The earlier one (Detail 1, `benchmarks/rstab-3x5`) is kept because it documents what changed.

| | Detail 1 (`rstab-3x5`) | Detail 2 (`rstab-3x5-v2`, current) |
|---|---|---|
| Files | `Mezzanine RSTAB Report.pdf`, `… - Detail 1.pdf`, first `.rs8` | `Mezzanine RSTAB Report - Detail 2.pdf` (2,931 pages), updated `Mezzanine 3x5_Base.rs8` |
| Shear deformation (`bElemShearStiff` in the `.rs8`) | **0, off** | **1, on** |
| CO1 | 1.4 LC1 + 1.5 LC2, geometrically linear (despite the name "+ IMPX") | 1.4 LC1 + 1.5 LC2 + 1.0 LC6, second order (P-Delta) |
| CO2 | … + 1.0 LC7, second order | … + 1.0 LC7, second order |
| Geometry, sections, hinges, supports, area loads | identical in both (nodes, members, supports, load text compared programmatically; hinge and support tables compared on the page images) | |

**Detail 3** (`Mezzanine RSTAB Report - Detail 3.pdf`, `benchmarks/rstab-3x5-v3`) was supplied with the same `.rs8`. Its analysis data (nodes, members, loads, combinations, settings, results) were compared programmatically with Detail 2 and are **identical**; it adds the **STEEL IS design results** (IS 800:2007) of the box columns, which `scripts/rstab/parse-is-design.ts` extracts into `rstab-is-design.json` (cross-section 1, 396 members, equations 101-351). The Detail 2 analysis reference therefore also stands for Detail 3. The `.rs8` that accompanied Detail 3 is the same file (same settings).

Model: two-level mezzanine, 30 m × 40 m (10 × 8 bays), storey height 4.5 m, 99 fixed columns, 1,567 nodes, 2,924 members (2,144 beams, 712 N-only braces, 68 "Null" dummy members that carry no stiffness and are ignored). The RSTAB printouts are the data source; the `.rs8` (OLE compound file) was used to read calculation settings.

Reproduce (all from the repository root):

```
npx tsx scripts/rstab/parse-report.ts <report.txt> benchmarks/rstab-3x5-v2          # report text extracted with pdf.js
BENCH=benchmarks/rstab-3x5-v2 npx tsx scripts/rstab/compare.ts CO1 4 2               # or CO2; 4 / 2 = elements per column / beam
BENCH=benchmarks/rstab-3x5-v2 npx tsx scripts/rstab/imperfection-study.ts 4 2         # loads vs geometry vs both
npx tsx scripts/rstab/mesh-study.ts alphaCr                                           # mesh refinement, sensitivities, alpha_cr
SIGNIF=1 BENCH=benchmarks/rstab-3x5-v2 npx tsx scripts/rstab/compare.ts CO1 4 2       # engineering significance per member, rotations in print units
THEORY=vonKarman DRIFT=12 npx tsx scripts/rstab/compare.ts CO2 1 1                    # nodes with the largest displacement difference (edge drift)
npx tsx scripts/rstab/notional-vs-equivalent.ts                                       # IS 800 notional force vs the equivalent loads of the benchmark
npm run test:rstab                                                                    # regression bounds
```

The baseline before the code-route work (commit aeca419: 61 + 34 checks passing) is kept in `results/baseline_before-code-routes.txt`; after the solver-criterion change of section 5.4 all result files were regenerated with identical maxima.

Raw outputs: `benchmarks/rstab-3x5-v2/results/` (and `benchmarks/rstab-3x5/results/` for Detail 1). Without `BENCH` the Detail 1 model is used (shear off, CO1 first order).

## 1. Model data used (from the printouts)

| Item | Source | Note |
|---|---|---|
| Nodes, members, connectivity, rotation β | 1.1, 1.7 | parsed exactly (1,567 nodes, 2,924 members) |
| Sections | 1.3 | box 150×150×5 (A 28.79 cm², I 1005.04 cm⁴, J 1537.27 cm⁴, A_y = A_z 12.13 cm²); C 200/50/2/25/2 (A 6.74, I_y 380.44, I_z 23.73, J 0.08 cm⁴, A_y 1.05, A_z 3.36 cm²); 2L 50×50×5 (A 9.58 cm², A_y 3.53, A_z 3.01) |
| Material | 1.2 | E = 21,000 kN/cm², G = 8,076.92 kN/cm², γ = 78.5 kN/m³ |
| Member hinges 1 and 2 | 1.4 (page image) | translations and torsion rigid; **rotations about local y and z released** |
| Supports | 1.8 (page image) | all six DOF fixed at the 99 base nodes |
| Load cases and combinations | 2.1, 2.5 | see the table above |
| Area loads | 3.5 | LC1 0.30 kN/m² (+ self-weight, +Z down), LC2 6.00 kN/m², two planes, "Combined" distribution converted to members (text identical in both states) |
| Imperfection | 3.4 | inclination 1/200 on the column sets 2–100: "Dir. y" for LC6, "Dir. z" for LC7 |

## 2. The six verification items

Sources: the two `.rs8` files (OLE compound files; the stream `RSTAB_Data 6.002` holds self-describing record schemas, field name + type byte, followed by records; both files were decoded and compared byte-wise, 30 differing regions), the two reports, and the solver results. Status words: **Verified**, **Partially verified**, **Pending**.

### Item 1: shear deformation: **Verified**
| | |
|---|---|
| Model file | `bElemShearStiff` in the global calculation parameters: 0 (Detail 1) → **1 (Detail 2)** |
| Report | Not printed (the report lists only the method of analysis and "activate stiffness factors"); the cross-section table prints A_y, A_z |
| Application setting | `shearDeformation` with the printed A_y, A_z (Timoshenko term in the bending stiffness); off for Detail 1, on for Detail 2 |
| Comparison | Detail 1: off reproduces beam shears / moments within 0.6 %, on gives up to 9 % · Detail 2: on reproduces everything within the limits of section 4, off gives 3–45 %. Variants (A_y/A_z swapped, shear only in columns, only in beams) are clearly worse |
| Conclusion | Shear deformation was disabled in the first model and is enabled in the current one; the tool follows the setting of the model being compared. The earlier statement "shear off" described Detail 1 only |
| Uncertainty | none |

### Item 2: second-order theory: **Partially verified**
| | |
|---|---|
| Model file | Per-combination `Theory` = 1 (second order) for CO1 and CO2 in Detail 2 (Detail 1: CO1 0, CO2 1); iteration limit 100, Picard iterations 5, load increments 1. No flag distinguishes Theory II from large-deformation theory |
| Report | "Second order analysis (P-Delta)", "consider favorable effects due to tension", "refer internal forces to deformed system for shear forces V_y and V_z" |
| Application setting | Theory II (linear strains, geometric stiffness N·G on the deformed geometry: global P-Δ and member P-δ through one term); shears referred to the deformed system, V′ = V − N·slope |
| Comparison | Theory II reproduces both models within section 4. Von Kármán gives **63 % more sway** and an out-of-plane drift of 12.6 mm of the edge-beam end nodes (section 5.1, explained and tested) |
| Conclusion | Second order is confirmed; Theory II is the formulation consistent with RSTAB's P-Delta and with the second-order elastic analysis of the design codes (IS 800 B-2.1) |
| Uncertainty | The file cannot confirm the kinematic theory; it is inferred from the results (and from the von Kármán test in section 5.1). The remaining 1.7 % sway difference (section 5.2) may be an undocumented detail of RSTAB's Theory II |

### Item 3: LC6 / LC7 direction: **Partially verified**
| | |
|---|---|
| Model file | LC6 "Dir. y", LC7 "Dir. z" (member-local directions of the column sets); the two imperfection records store different direction codes |
| Report | Names LC6 "towards +X" and LC7 "towards +Y" |
| Application setting | Equivalent loads +φ0·N along **+Y for CO1 (LC6)** and **+X for CO2 (LC7)** |
| Comparison | The support moments show the action: CO1 gives a total moment about X (force along Y, Σ M_X' = 43,012 kNcm), CO2 about Y (force along X, Σ M_Y' = −35,892 kNcm). With the assumed directions the base shears match within 0.1 %; the opposite sense or the swapped axes give errors of 30–900 % (also in Detail 1, where only LC7 was used) |
| Conclusion | The load-case names in the report are the opposite of the actual action; the direction was established from the reaction data, not from the label |
| Uncertainty | The sense (+/−) rests on the reactions and displacements of the results, not on a decoded direction field of the file |

### Item 4: equivalent imperfection loads ±φ0·N: **Partially verified**
| | |
|---|---|
| Model file | Both imperfection records store the inclination 1/200 (float 200.0 at stream offsets 804104 and 809884) on the sets of members 2–100 (99 continuous column sets) |
| Report | "Inclination 1/200", sets of members 2–100, directions y / z |
| Application setting | For every compressed column member: +φ0·N at its upper node, −φ0·N at its lower node, N from the first-order gravity combination 1.4 LC1 + 1.5 LC2 (with the shear setting of the model) |
| Comparison | Base shears within 0.1 %; member forces and displacements within section 4. A geometric lean of the column elements reproduces the same loads within 0.5 % (`docs/SECOND_ORDER.md` section 6) |
| Conclusion | The load pairs, signs, member locations and the factored-gravity basis are consistent with RSTAB's result. The net force per floor equals 0.5 % of the factored vertical load of the floor (`scripts/rstab/notional-vs-equivalent.ts`: 57.9 kN against 57.1 kN) |
| Uncertainty | The field that names the gravity combination used by RSTAB (`$ImperfectionGravityLoadCombinationNo`) sits in an object-valued top-level record that could not be decoded; the factored gravity combination is confirmed by the magnitude of the base shears (factors 1.0 would give about 35 % less) |

### Item 5: CO1 and the imperfection case: **Verified**
| | |
|---|---|
| Model file | Detail 1: CO1 = 1.4 LC1 + 1.5 LC2, `Theory` = 0 (linear). Detail 2: CO1 = 1.4 LC1 + 1.5 LC2 + 1.0 LC6, `Theory` = 1 |
| Report | Detail 1 prints CO1 without LC6 although it is called "… + IMPX"; Detail 2 prints LC6 in CO1 |
| Conclusion | In Detail 1 the omission was a genuine modelling discrepancy of that model version (the combination really lacked the imperfection and was linear), not a naming convention or a printout omission; it was corrected in Detail 2 |
| Uncertainty | none |

### Item 6: stiffness modification factors: **Verified**
| | |
|---|---|
| Model file | **Cross-sections:** all six factors (J, I_y, I_z, A, A_y, A_z) of all five sections = 1.0. **Members:** the member records carry six factors (GJ, EI_y, EI_z, EA, GA_y, GA_z); **all 2,924 member records** (2,143 beams, 712 braces, 68 null members; record spacing 186 / 188 / 187 bytes) have all six = 1.0 and none has a mixed set. **New block `ModifyStiffness`** (Detail 2): material, cross-section, support, member-foundation and hinge groups: factor 1.0 and "use" = 0, individual-factor lists empty |
| Report | "Activate stiffness factors of cross-sections / members" printed; no factor values printed |
| Application setting | No modification (member factors 1.0; `fEA, fEI, fGJ` are supported by the solver) |
| Comparison | With factors 1.0 the first-order combination reproduces all supports and 27,000 member-force rows within 0.51 % |
| Conclusion | The factors are active but all equal to 1.0: the agreement is not an assumption, the values were read from the file |
| Uncertainty | none |

## 3. Comparison method (fixed before judging)

error = max(0, |mine − RSTAB| − ½·print resolution) / max(|RSTAB|, 5 % of the largest |RSTAB| of the same kind, print resolution); target ≤ 2 %. Kinds: forces (N, V), moments (T, M), translations, rotations, support forces, support moments. RSTAB prints forces and moments with 2 decimals, translations in mm and rotations in mrad with 1 decimal. Values are compared at RSTAB's own locations (support forces at 99 nodes, displacements at 1,567 nodes, ~22,000 beam and ~4,700 column member-force rows per component). Sign convention: tension positive, sagging positive; support force sign reversed to RSTAB's "force on the support".

The floor per kind makes small values dominate the percentages (a 4 kNcm difference in a column moment is 4.3 % of the 5 % floor of 103 kNcm, but 0.2 % of the largest column moment). Both numbers are reported. No tolerance was adjusted and no stiffness tuned.

## 4. Results, Detail 2 (second order, 4 / 2 elements per column / beam, 20 iterations in 4 load steps, 12 s)

| Quantity | CO1 (+LC6, along +Y) max error | CO2 (+LC7, along +X) max error | > 2 % |
|---|---|---|---|
| Support P_X', P_Y', P_Z' | 0.00 / 0.06 / 0.04 % | 0.09 / 0.00 / 0.05 % | 0 |
| Support M_X', M_Y' | 1.80 / 0.06 % | 0.07 / 0.70 % | 0 |
| Displacements u_X, u_Y, u_Z | 0.03 / 1.58 / 1.64 % | 1.03 / 0.00 / 0.38 % | 0 |
| Beam / brace N, V_z, M_y, M_z | 0.81 / 1.93 / 3.67 / 0.25 % | 0.42 / 1.90 / 1.79 / 0.11 % | CO1 M_y: 6 rows (1.6 vs 7.1 kNcm) |
| Column N, V_y, V_z, M_y | 0.43 / 0.50 / 0.05 / 0.12 % | 0.41 / 0.04 / 0.50 / **2.77 %** | CO2 M_y: 95 rows |
| Column M_z | **4.18 %** (699 rows) | 0.07 % | see section 5 |
| Rotations (print resolution 0.1 mrad) | up to 25 % of a 0.57 mrad floor (differences ≤ 0.2 mrad) | same | print level |
| Beam V_y (RSTAB prints 0.23 kN, mine 0.00) | 3.7 % | 3.6 % | print level |

The 1-element-per-member run (3 s) gives practically identical results (`results/*_div1-1.txt`).

Detail 1 (shear off) is reproduced as before: CO1 first order ≤ 0.51 %; CO2 second order within the 2 % target except 119 column M_y rows at ≤ 2.49 % (`benchmarks/rstab-3x5/results`).

## 5. Remaining differences: investigation and engineering significance

### 5.1 Edge-beam drift of 12 mm (von Kármán formulation): explained
With the von Kármán formulation the end nodes of the top-level secondary beams at the two long edges (y = 0 and y = 40 m, e.g. nodes 1597, 895, 1527) moved **inward by 12.5 mm** while RSTAB reports 0.0 (`THEORY=vonKarman DRIFT=12 … compare.ts`). Cause: the secondary C-sections sag by about 100 mm over 5 m (L/50) under the factored load; a bent member's chord shortens by ½∫w′²dx (about 5 mm per span for this sag), and the von Kármán strain measure includes exactly this axial shortening, which Theory II (linear strains) does not. It is kinematically correct for large deflection but is **not** what RSTAB's P-Delta or the codes' second-order elastic analysis assume (IS 800 B-2.1: geometry changes and axial-force stiffness; IS 800 Annex B-2.1: deformed geometry). Independent test (`scripts/test-frame.ts` section 8): a simply supported beam on a roller shortens by ½∫w′²dx = 17/70 (q/24EI)²L⁷ (checked to 0.007 %) in von Kármán and not at all in Theory II; doubling the load quadruples the shortening; an axially restrained beam develops a membrane tension in von Kármán only. Decision: Theory II stays the default; von Kármán remains selectable and is flagged in the settings.

### 5.2 Column moment in the lean direction (CO1 M_z 4.2 %, CO2 M_y 2.8 %, Detail 1 CO2 M_y 2.5 %)
Per member (`SIGNIF=1`, 4/2 elements): among the 366 columns whose governing M_z is at least 100 kNcm the worst difference is **3.9 kNcm of a governing moment of 102 kNcm** (member 2222, a lightly loaded column whose moment passes through zero, hence the large percentage); among the columns that carry at least 500 kNcm (5 kNm) the worst difference is 0.47 % (CO1 M_z, member 1266: 2.5 of 529 kNcm) and 0.60 % (CO2 M_y, member 1659: 3.4 of 557 kNcm). The difference is a near-constant offset of at most 4.8 kNcm along the member (shear identical), i.e. N × 0.3 mm. Sway is 1.7 % lower than RSTAB's, uniformly. Engineering significance: the offset changes the bending utilisation of a column by at most the ratio above (about 4 % of a small moment, 0.6 % at most of a large one) times the share of bending in the interaction check, so it does not change a utilisation or stability conclusion at the 2 % level for the governing columns. **Cause unresolved.** Rejected hypotheses: element mesh (1/1 = 4/2), torsional geometric term, theory (von Kármán is worse), shear-area variants, imperfection magnitude (base shear within 0.1 %), load distribution (Y-beam shear ratio 1.002), gravity combination, stiffness factors (all 1.0). α_cr = 2.58 makes sway and moments about 1.5 times as sensitive as in a stiff frame to small stiffness differences; a difference of about 1 % in the effective or geometric stiffness explains the sway and the offset, which points to an undocumented detail of RSTAB's Theory II rather than an equilibrium error.

### 5.3 Rotations (0.2 mrad at up to 106 nodes) and beam V_y (0.23 kN)
RSTAB prints rotations in mrad with one decimal. Detail 2, 4/2 elements: φ_X exceeds one print unit (0.1 mrad) at 162 nodes of CO1 (0 in CO2), φ_Y at 29 / 18, φ_Z at 48 / 0; **no node exceeds two print units**; the largest difference is 0.20 mrad of rotations up to 11.7 mrad (1.7 %). Rotations of nodes where all member ends are hinged are indeterminate and are not compared. Beam V_y: RSTAB prints 0.23 kN where the model gives 0.00 (the beams are loaded in the plane of bending only). Classification: **print rounding / normalisation floor**; no engineering significance (0.2 mrad over a 5 m beam is 1 mm).

### 5.4 Solver defect found and corrected while testing the code routes
A first-order analysis of a portal frame with a beam 1e4 times stiffer than its columns, under gravity and horizontal load, ended "not converged" after 759 iterations although the displacement correction was 1e-14: the moment residual (rounding noise of 2e-5 N·mm) was normalised by an absolute floor of 1 N·mm, which has no physical scale. The moment residual is now normalised like the force residual, by ‖applied forces‖ × mean element length (`solve.ts`); the criteria (1e-6, 1e-6, 1e-6, 1e-10) are unchanged. Effects: the stiff-beam portal converges (`test-codes.ts`); a column at 0.95 P_cr with imperfection converges to the closed-form moment within 0.06 % (before, it ended "not converged" because of the same unreachable residual); above P_cr the solver reports the unstable equilibrium as `unstable` instead of `not-converged`. The benchmark results were regenerated and stay within the same bounds.

## 6. Tolerances per result type (regression bounds, `npm run test:rstab`)

Fixed after the baseline was known and justified by the print resolution and by the sensitivity of the model (α_cr = 2.58, so sway and column moments react about 1.5 times as strongly to a small stiffness change). They are **regression bounds of this solver on this benchmark**, not universal accuracy limits and not code tolerances. The target of the comparison stays 2 %; the bounds above 2 % are the documented exceptions of section 5.

| Result type | Baseline max error (CO1 / CO2) | Bound | Reason |
|---|---|---|---|
| Support forces | ≤ 0.07 % | 0.5 % | print resolution 0.01 kN on ≥ 1.5 kN |
| Support moments | 1.28 / 0.73 % | 3 % | print resolution 0.01 kNcm on a floor of 48–60 kNcm; second-order sensitivity |
| Displacements | 1.66 / 1.04 % | 2.5 % | 0.1 mm print resolution on ≤ 25 mm; sway offset of section 5 |
| Beam / brace N | 0.76 / 0.41 % | 1.2 % | |
| Beam V_z, M_y | 1.55 / 1.87 %, 3.99 / 1.76 % | 2.5 %, 4.5 % | M_y: 6 rows of 1.6 vs 7 kNcm (floor-dominated) |
| Beam M_z | 0.25 / 0.14 % | 0.8 % | |
| Column N, V_y, V_z | ≤ 0.62 % | 0.8 %, 1 %, 1 % | |
| Column M in the lean direction | 4.15 % (M_z, CO1) / 2.95 % (M_y, CO2) | 5 % / 3.5 % | unexplained offset of ≤ 4.8 kNcm (section 5) |
| Rotations, beam V_y | print level | not bounded | differences of one or two print units |

## 7. Status

* Agreement with RSTAB (Detail 2 and Detail 3, same analysis): support forces ≤ 0.1 %, displacements ≤ 1.7 %, member forces ≤ 2 % except the column lean-direction moment (≤ 4.8 kNcm absolute) and print-level items.
* The comparison validates the **solver and the model reproduction under the settings of section 2**; the imperfection is reproduced as equivalent loads. Geometric (explicit) imperfections are validated against closed forms and against the equivalent loads (`docs/SECOND_ORDER.md`), **not** against RSTAB (RSTAB's cases are equivalent loads).
* Open: the gravity combination field in the `.rs8`, a documented RSTAB Theory II formulation for the 1.7 % sway difference, and the RSTAB 9.3.2.2 result of section 8.

## 8. IS 800:2007 member design against RSTAB's STEEL IS results (Detail 3)

`npx tsx scripts/rstab/compare-is-design.ts` (raw output: `benchmarks/rstab-3x5-v3/results/compare-is-design.txt`) designs the 396 box columns (150 × 150 × 5, S 250) of the benchmark with the IS 800 implementation (`docs/IS800_DESIGN.md`) from the second-order forces of CO1 and CO2 (E = 210,000 N/mm² as in the RSTAB model), station by station, and compares the utilisation with RSTAB's table. Absolute difference of the utilisation:

| RSTAB equation | IS 800 provision | n | mean | max |
|---|---|---|---|---|
| 101 tension | 6.2 | 99 | 0.0025 | 0.0049 |
| 102 compression, section | 7.1.2 | 297 | 0.0020 | 0.0051 |
| 121 / 123 shear z / y | 8.4.1 | 392 / 388 | 0.0026 | 0.0053 |
| 181 / 182 bending y + shear + N | 9.3.1 | 251 / 147 | 0.0024 | 0.0058 |
| 201 / 202 bending z + shear + N | 9.3.1 | 209 / 141 | 0.0028 | 0.0055 |
| 221 biaxial | 9.3.1.1/2 | 390 | 0.0025 | 0.0056 |
| **341 overall member, y** | **9.3.2.2, Table 18** | 291 | **0.133** | **0.354** |
| **351 overall member, z (LTB)** | **9.3.2.2, Table 18** | 291 | **0.086** | **0.367** |

RSTAB prints utilisations to two decimals, so differences below 0.005 are rounding: tension, compression of the section, shear and the section interactions **agree**. The overall-member check (9.3.2.2) **does not agree and the difference is not explained**: it was investigated with both assignments of the minor and major axes, with C_m = 0.9 (sway) and from the end moments (row A of Table 18), and with the classification variants; none reproduces RSTAB's 341 / 351 values. The implementation follows the formulas as read on the page image (verified in the register); the difference between RSTAB's interpretation (class assignment rule, the treatment of K_y / K_z and λ_LT for hollow sections) and this reading is **unresolved**. Agreement with RSTAB would not prove IS 800 compliance and disagreement does not prove that either is wrong: the member design is reported for the checks that agree and the 9.3.2.2 result is labelled with this open item in the calculation record.
