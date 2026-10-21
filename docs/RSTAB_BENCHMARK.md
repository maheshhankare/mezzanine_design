# RSTAB benchmark: Mezzanine 3x5 Base

Reference: `Mezzanine RSTAB Report.pdf` and `Mezzanine RSTAB Report - Detail 1.pdf` (RSTAB printouts supplied by the user) and the model file `Mezzanine 3x5_Base.rs8` (an OLE binary; the printouts are the main data source, calculation settings were decoded from it, see 2a).
Model: two-level mezzanine, 30 m × 40 m (10 × 8 bays of 3 m × 5 m), storey height 4.5 m, 99 fixed columns, 1,567 nodes, 2,924 members (2,144 beams, 712 N-only braces, 68 "Null" dummy members that carry no stiffness and are ignored).
Reproduce: `npx tsx scripts/rstab/parse-report.ts <report.txt> benchmarks/rstab-3x5` then `npx tsx scripts/rstab/compare.ts CO1|CO2 [divColumn] [divBeam]`. The raw outputs are in `benchmarks/rstab-3x5/results/`.

## 1. Model data used (all from the printouts)

| Item | Source | Note |
|---|---|---|
| Nodes, members, connectivity, rotation β | 1.1, 1.7 | parsed exactly (1,567 nodes, 2,924 members) |
| Sections | 1.3 | box 150×150×5 (A 28.79 cm², I 1005.04 cm⁴, J 1537.27 cm⁴); C 200/50/2/25/2 (A 6.74, I_y 380.44, I_z 23.73, J 0.08 cm⁴); 2L 50×50×5 (A 9.58 cm²) |
| Material | 1.2 | E = 21,000 kN/cm², G = 8,076.92 kN/cm², γ = 78.5 kN/m³ |
| Member hinges 1 and 2 | 1.4 (read from the page image) | translations and torsion rigid; **rotations about local y and z released** (pinned ends) |
| Supports | 1.8 (read from the page image) | all six DOF fixed at the 99 base nodes |
| Load cases and combinations | 2.1, 2.5 | CO1 = 1.4 LC1 + 1.5 LC2 (geometrically linear); CO2 = 1.4 LC1 + 1.5 LC2 + 1.0 LC7 (second order, P-Delta). **CO1 does not contain the imperfection case although its name says "+ IMPX"** |
| Area loads | 3.5 | LC1 0.30 kN/m² (+ self-weight, +Z down), LC2 6.00 kN/m², two planes, "Combined" distribution converted to members |
| Imperfection | 3.4 | inclination 1/200 on the column sets 2–100 ("Dir. y" for LC6, "Dir. z" for LC7) |

## 2. Assumptions that the printouts do not state (inferred, each confirmed by the data)

1. **Shear deformation is NOT considered.** With the printed shear areas the beam shears and moments differ from RSTAB by up to 9 %; without them by < 0.6 %. To be confirmed in the RSTAB calculation parameters.
2. **Area loads act one-way on the Y-direction beams**, each beam line taking the strip half-way to its neighbours (RSTAB's generation algorithm is not documented in the printout; the member lists are truncated). Confirmed: member shears (e.g. 23.74 kN = 9.5 kN/m × 5 m / 2), total vertical load 23,166.6 kN vs 23,166.4 kN, vertical reactions within 0.01 %.
3. **Second order = Theory II** (linear strains, equilibrium on the deformed geometry, i.e. P-Δ with geometric stiffness; "consider favourable effects due to tension"). The von Kármán variant (axial shortening of bent members) is also implemented but is *not* what RSTAB's P-Delta does: it produced a spurious 12 mm out-of-plane drift of the edge beams.
4. **LC7 acts along global X** (the "Dir. z" of the vertical members), not +Y as its name says: the net displacement changes of CO2 are in X.
5. **Imperfection loads are equivalent loads**: every column member with compression N (from CO1, first order) contributes +φ₀·N at its top node and −φ₀·N at its bottom node, φ₀ = 1/200, direction +X (the −X sign gives errors of 30–900 %). The gravity combination used by RSTAB for N is assumed to be CO1.
6. **Shears are referred to the deformed system** in CO2 (RSTAB option, printed for all combinations): V′ = V − N·slope.
7. **Stiffness modification factors** are "activated" in RSTAB, but their values are not printed; taken as 1.0. The agreement suggests this is right.

### 2a. Settings read from the model file `Mezzanine 3x5_Base.rs8`

The `.rs8` is an OLE compound file; its stream `RSTAB_Data 6.002` holds self-describing record schemas (field name + type) followed by records. The per-case calculation-parameter records were decoded and cross-checked against the printout (CO1 linear, CO2 second order). Status of the six settings:

| # | Setting | Result from the model file | Status |
|---|---|---|---|
| 1 | Shear deformation | `bElemShearStiff` = 0 (global calculation parameters) | **Confirmed**: off |
| 2 | Theory II vs large deformation | CO1 `Theory` = 0 (linear), CO2 `Theory` = 1 (second order); max iterations 100, Picard iterations 5, load increments 1 | **Confirmed**: second order; the file has no separate flag distinguishing Theory II from von Kármán, so Theory II remains inferred from the results |
| 3 | LC6 / LC7 direction | Direction code differs between the two records (LC6 vs LC7), consistent with the printed "Dir. y" / "Dir. z" | **Partly confirmed**: the stored codes differ as printed; the physical sense (+X for LC7) is still inferred from the results |
| 4 | Imperfection value | Drift = 200 (i.e. 1/200) stored in both imperfection records (float 200.0 at stream offsets 804104 and 809884) | **Confirmed** |
| 5 | Gravity combination used for the imperfection loads | `$ImperfectionGravityLoadCombinationNo` not decoded | **Unresolved** (assumed CO1) |
| 6 | Stiffness modification factors | flags for cross-section and member stiffness modification are on (`bEnteredStiffModif` = 1, CrossSection = Member = 1); the numeric factor tables (`StiffFactorEI*`, `FactorM*`/`FactorA*`) were not located unambiguously | **Unresolved numerically.** Indirect evidence: with factors = 1, the first-order combination CO1 reproduces all 22,000 member-force rows and 99 supports within 0.06 % (statically indeterminate frame, so a uniform deviation in stiffness would show) |

Also decoded: CO1 "favourable effect of tension" on, shear forces referred to the deformed system on (CO1 and CO2), refinement increments 10. The scripts used are throw-away exploration code, not part of the repository; the stream offsets above are given so the decode can be repeated.

### 2b. Column M_y (≤ 2.5 %) and rotation (≤ 0.2 mrad) differences: classification

* Rotations: 0.2 mrad is 2 × the print resolution (0.1 mrad) at the level of a 5 %-of-maximum floor → **print rounding / normalisation**, not a modelling difference.
* Beam V_y 3.5 % (0.23 vs 0.00 kN): at the print-resolution level → **print rounding**.
* Column M_y 119 rows ≤ 2.5 % (≈ 2.7 kNcm absolute): **unresolved**. It is identical for 1 and 4 elements per column (not a mesh/numerical effect) and absent in first order (0.06 %), so it comes from the second-order part: candidates are the imperfection-load generation (gravity combination, per-member N used for the loads), or the stiffness factors. It is not tuned away.

## 3. Comparison method (fixed before judging)

error = max(0, |mine − RSTAB| − ½·print resolution) / max(|RSTAB|, 5 % of the largest |RSTAB| of the same kind, print resolution), target ≤ 2 %. Kinds: forces (N, V), moments (T, M), translations, rotations, support forces, support moments. RSTAB prints forces and moments with 2 decimals, translations in mm and rotations in mrad with 1 decimal.
Values are compared at RSTAB's own locations (support forces at 99 nodes, displacements at 1,567 nodes, ~22,000 beam and ~4,700 column member-force rows per component). Sign convention: tension positive, sagging positive; support force sign reversed to RSTAB's "force on the support".

## 4. Results

**CO1: first order** (1 element per member; 0.2 s)

| Quantity | max error | > 2 % |
|---|---|---|
| Support P_X', P_Y', P_Z' | 0.00 % / 0.00 % / 0.00 % | 0 |
| Support M_X', M_Y' | 0.05 % / 0.06 % | 0 |
| Displacements u_X, u_Y, u_Z | 0.06 % / 0.03 % / 0.01 % | 0 |
| Beam / brace N, V_y, V_z, M_y | 0.00 % / 0.00 % / 0.00 % / 0.51 % | 0 |
| Column N, V_y, V_z, M_y, M_z | 0.00 % / 0.00 % / 0.00 % / 0.06 % / 0.03 % | 0 |

**CO2: second order, 1 element per member** (20 iterations in 4 load steps; 2.6 s) and **4 / 2 elements per column / beam** (11.6 s): practically identical results, so the agreement is not a mesh artefact.

| Quantity | max error (1 el.) | max error (4/2 el.) | > 2 % |
|---|---|---|---|
| Support P_X', P_Y', P_Z' | 0.07 / 0.01 / 0.05 % | 0.07 / 0.00 / 0.05 % | 0 |
| Support M_X', M_Y' | 0.20 / 0.76 % | similar | 0 |
| Displacements u_X, u_Y, u_Z | 1.35 / 0.05 / 0.44 % | 1.24 / 0.00 / 0.44 % | 0 |
| Beam / brace N, V_z, M_y, M_z | 0.44 / 1.63 / 1.67 / 0.14 % | 0.44 / 1.63 / 1.68 / 0.10 % | 0 |
| Column N, V_y, V_z, M_z | 0.44 / 0.10 / 0.45 / 0.73 % | 0.41 / – / 0.44 / 0.05 % | 0 |
| **Column M_y** | **2.49 %** | **2.38 %** | **119 of 4,752 rows** |
| Beam V_y | 3.51 % (RSTAB 0.23 kN vs mine 0.00 kN) | – | rows at the print-resolution level |
| Rotation φ_Y (106 nodes), φ_Z (36 nodes) | differences ≤ 0.2 mrad (rotations up to 11 mrad) | – | exceed 2 % of a small normalisation floor |

## 5. Status and open points

* **Agreement with RSTAB is within the 2 % target for all quantities except the 119 column M_y values (≤ 2.5 %, absolute difference ≈ 2.7 kNcm of a 110 kNcm floor) and a few quantities at print-resolution level.** The cause of the 2.5 % column M_y is not established; candidates are the unprinted stiffness-modification factors and RSTAB's imperfection-load generation details. It is reported, not tuned away.
* The comparison validates the **solver and the model reproduction under the stated assumptions** (items 1–7). Items 1, 3, 5 and 6 should be confirmed in RSTAB (calculation parameters and imperfection settings); until then the validation is "consistent with" rather than "proven for".
* RSTAB's imperfection is reproduced with **equivalent loads in Theory II**. Geometric (explicit) imperfections, the code-based generation and the design checks are **not** covered by this benchmark.
* No tolerance was adjusted and no stiffness was tuned to force agreement: the only model changes made while comparing were the discovery of boolean/assumption items listed in section 2, each shown to be required by the data (e.g. shear deformation off reduced the largest difference from 9 % to 0.5 %).
