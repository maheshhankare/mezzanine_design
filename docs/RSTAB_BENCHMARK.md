# RSTAB benchmark: Mezzanine 3x5 Base

Two states of the same RSTAB model were supplied. **The later one (Detail 2, `benchmarks/rstab-3x5-v2`) is the reference for all current work.** The earlier one (Detail 1, `benchmarks/rstab-3x5`) is kept because it documents what changed.

| | Detail 1 (`rstab-3x5`) | Detail 2 (`rstab-3x5-v2`, current) |
|---|---|---|
| Files | `Mezzanine RSTAB Report.pdf`, `… - Detail 1.pdf`, first `.rs8` | `Mezzanine RSTAB Report - Detail 2.pdf` (2,931 pages), updated `Mezzanine 3x5_Base.rs8` |
| Shear deformation (`bElemShearStiff` in the `.rs8`) | **0, off** | **1, on** |
| CO1 | 1.4 LC1 + 1.5 LC2, geometrically linear (despite the name "+ IMPX") | 1.4 LC1 + 1.5 LC2 + 1.0 LC6, second order (P-Delta) |
| CO2 | … + 1.0 LC7, second order | … + 1.0 LC7, second order |
| Geometry, sections, hinges, supports, area loads | identical in both (nodes, members, supports, load text compared programmatically; hinge and support tables compared on the page images) | |

Model: two-level mezzanine, 30 m × 40 m (10 × 8 bays), storey height 4.5 m, 99 fixed columns, 1,567 nodes, 2,924 members (2,144 beams, 712 N-only braces, 68 "Null" dummy members that carry no stiffness and are ignored). The RSTAB printouts are the data source; the `.rs8` (OLE compound file) was used to read calculation settings.

Reproduce (all from the repository root):

```
npx tsx scripts/rstab/parse-report.ts <report.txt> benchmarks/rstab-3x5-v2          # report text extracted with pdf.js
BENCH=benchmarks/rstab-3x5-v2 npx tsx scripts/rstab/compare.ts CO1 4 2               # or CO2; 4 / 2 = elements per column / beam
BENCH=benchmarks/rstab-3x5-v2 npx tsx scripts/rstab/imperfection-study.ts 4 2         # loads vs geometry vs both
npx tsx scripts/rstab/mesh-study.ts alphaCr                                           # mesh refinement, sensitivities, alpha_cr
```

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

## 2. The calculation settings: what is confirmed, from where

Method: the `.rs8` holds self-describing record schemas (field name + type byte) followed by records. The calculation-parameter records were decoded, cross-checked against the printout, and the old and new files were compared byte-wise (30 differing regions). Offsets refer to the stream `RSTAB_Data 6.002`.

| # | Setting | Evidence | Status |
|---|---|---|---|
| 1 | **Shear deformation** | `bElemShearStiff`: 0 (Detail 1) → **1 (Detail 2)**. Independent check: Detail 1 is reproduced with shear off (differences < 0.6 %, 9 % with it on), Detail 2 with shear on (≤ 2 % on every result type except the items in section 5; 3–45 % with it off). Variants (A_y/A_z swapped, shear only in columns, only in beams) are all clearly worse. | **Confirmed (file and results).** It is a model setting that changed between the two files, not a constant of the tool. |
| 2 | Second-order theory | Per-case `Theory` = 1 for CO1, CO2 (Detail 2). The file has no flag that separates Theory II from large-deformation theory; iterations ≤ 100, Picard 5, load increments 1. The results are consistent with Theory II (linear strains, geometric stiffness); von Kármán gives 63 % larger sway. | **Second order confirmed; Theory II inferred from the results.** |
| 3 | Direction of LC6 / LC7 | The report names LC6 "towards +X" and LC7 "towards +Y", but their member settings are "Dir. y" and "Dir. z", and the support moments show the real action: CO1 (LC6) produces a total support moment about X (force along **Y**), CO2 (LC7) about Y (force along **X**). With the equivalent loads along +Y for CO1 and +X for CO2 the base shears match within 0.1 %; the opposite signs or swapped axes give errors of 30–900 %. | **The labels in the report are the opposite of the action; the direction is data-confirmed, not file-confirmed.** |
| 4 | Imperfection representation | The records store inclination 1/200 for both cases (float 200.0). Equivalent horizontal loads ±φ₀·N at the ends of compressed column members, N from the first-order gravity combination 1.4 LC1 + 1.5 LC2 (with shear deformation), reproduce the base shears within 0.1 %. | **1/200 confirmed in the file; the load representation and the gravity combination are data-confirmed.** The field `$ImperfectionGravityLoadCombinationNo` could not be decoded (it sits in an object-valued top-level record). |
| 5 | CO1 and the imperfection | Detail 1: CO1 does **not** contain the imperfection although its name says "+ IMPX". Detail 2: CO1 contains LC6. | **Confirmed (printouts).** The earlier remark applies to Detail 1 only. |
| 6 | Stiffness modification factors | Cross-section records: all six factors (J, I_y, I_z, A, A_y, A_z) = 1.0 for all five sections. New block `ModifyStiffness` (Detail 2): material, cross-section, support, foundation and hinge groups: factor 1.0 and "use" = 0; the individual-factor lists are empty. The flags "activate stiffness factors of cross-sections / members" are on, with factors equal to 1. | **Confirmed: all factors are 1.0.** |

Other decoded values: member sub-division for results 10 increments (`RefinementIncr`), "consider favourable effect of tension" on, shear forces referred to the deformed system on (CO1, CO2).

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

## 5. Remaining differences: classification

| Difference | Classification |
|---|---|
| Rotations ≤ 0.2 mrad, beam V_y 0.23 kN | **Print rounding.** Differences of one or two print units. |
| Column moment in the direction of the imperfection (CO1 M_z 4.18 %, CO2 M_y 2.77 %; Detail 1 CO2 M_y 2.49 %) | **Modelling difference, cause unresolved.** In absolute terms ≤ 4.8 kNcm, 0.2–0.4 % of the governing end moments of the same members; the large percentages arise where the column moment crosses zero. It is a near-constant offset along the member (shear identical), i.e. it comes from the frame moment distribution, about N × 0.3 mm. Sway is 1.7 % smaller than RSTAB's uniformly. **Not** caused by: mesh (1/1 = 4/2), torsional geometric term (no change), theory (von Kármán is worse), shear-area variants (worse), imperfection magnitude (base shear matches within 0.1 %), load distribution (Y-beam shears 1.002 of RSTAB), gravity combination. The same signature exists in Detail 1, so it is not caused by the shear change. |
| Sensitivity of the model | α_cr of the factored gravity combination is **2.58** (`mesh-sensitivity-study.txt`), so the second-order amplification is large and a 1 % difference in global stiffness or geometric stiffness shows as roughly 1.5 % in sway. A 1.7 % sway difference therefore corresponds to a difference of the order of 1 % in the effective stiffness or the geometric stiffness: small enough to be an implementation detail of RSTAB's Theory II (for instance how shear deformation enters the geometric stiffness) that the printout does not document. |

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

* Agreement with RSTAB (Detail 2): support forces ≤ 0.1 %, displacements ≤ 1.7 %, member forces ≤ 2 % except the column lean-direction moment (≤ 4.8 kNcm absolute) and print-level items.
* The comparison validates the **solver and the model reproduction under the settings of section 2**; the imperfection is reproduced as equivalent loads. Geometric (explicit) imperfections are validated against closed forms and against the equivalent loads (`docs/SECOND_ORDER.md`), **not** against RSTAB (RSTAB's cases are equivalent loads). Code-based generation and member design checks are not covered (`docs/CODE_REGISTER.md`).
* Open: the gravity combination field in the `.rs8`, a documented RSTAB Theory II formulation for the 1.7 % sway difference.
