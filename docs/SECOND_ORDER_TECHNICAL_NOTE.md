# Technical note: what the second-order analysis captures and which IS 800:2007 provisions still apply (Phase 2, item 5)

Status: **for your review; no calculation behaviour changes.** The note does not assume that a second-order analysis replaces any code-required check. Where the text of IS 800:2007 leaves a question open, the question is stated with its options; none is decided. Clause texts are in `review-pack/PHASE1_REVIEW_PACK.md` (git-ignored) with page images.

## 1. What the analysis of this application does (from `docs/SECOND_ORDER.md`, verified by `test:frame` against closed forms)

| Aspect | Implemented |
|---|---|
| Formulation | Second-order elastic "Theory II": equilibrium on the deformed geometry with linear strains; one geometric term N·G carries **global P-Δ** (chord rotation) and **member P-δ** (curvature inside the element), not added twice. Consistent tangent, Newton iterations, load steps; the status is `unstable` when a negative pivot appears; reaching the iteration limit is never convergence. |
| Member discretisation | 4 elements per column and 2 per beam in the benchmark. With 4 elements the cantilever column (P = 0.40 P_cr) reproduces the closed-form second-order tip displacement to 0.001 % and the simply supported beam-column (P = 0.5 P_E) the maximum moment to 0.03 % (8 elements: 0.002 %); with one element P-δ is **not** captured (-16 % in TM3). `docs/RSTAB_TEST_MODELS.md`. |
| Shear deformation | optional (Timoshenko, shear areas), on in the benchmark. |
| Axial force effect on stiffness | the geometric stiffness (tension stiffens, compression softens); EA unchanged. |
| Imperfections | (a) IS 800 4.3.6 notional horizontal forces (0.5 % of the factored vertical load at each level), (b) user-defined equivalent loads or explicit geometry (sway, bow), never both for the same effect (refused). IS 800 gives no explicit geometric imperfection or bow value for the frame analysis. |
| Elastic critical load factor | rational (Sturm count on the tangent stiffness), α_cr = 2.58 for the benchmark gravity case. |
| Supports, hinges, springs | per-DOF, no condensation; tension-only trusses (first-order limitation: findings F-1, F-2 in `docs/RSTAB_TEST_MODELS.md`). |
| **Not captured** | warping and lateral-torsional buckling (no warping DOF; the torsional geometric term is off by default), local / distortional buckling, material non-linearity and plasticity, residual stresses and effective-stiffness reduction beyond the geometric term, joint flexibility (except explicit releases and springs), shear lag, fire, dynamic effects. |

## 2. Provision by provision: captured, partly captured, or still required

"Still required" means the clause asks for a check or an input that the analysis does not provide. It is not a statement about the result.

| Provision (IS 800:2007) | What it asks | Relation to the analysis | Status of the question |
|---|---|---|---|
| **4.3.6** notional horizontal forces | 0.5 % of the factored dead plus vertical imposed load at each level, one direction at a time; not with wind / earthquake loads, temperature, overturning or foundation shear | an **input** of the analysis (implemented, verified); the analysis does not generate imperfections by itself | applies in every analysis of a frame under gravity loads |
| **4.4.1** members remain elastic | individual members assumed elastic under the factored loads | the analysis is elastic by construction; **the section and member strength checks (Sections 6-9) are still required** | applies |
| **4.4.2, 4.4.3.1** | first order + moment amplification (C_y, C_z ≤ 1.4), or second-order analysis per Annex B | route (b) is the application's route; the first-order route is not implemented (the factors are undefined in the text, Phase 1 section 1) | **applies as a choice of route**: results labelled first order are not design-verified |
| **Annex B-2.1** second-order elastic analysis | geometry changes and the change of effective stiffness due to axial force are accounted for; the stiffness change may be neglected when λ_cr > 5 | **captured** (geometric stiffness is always included; the λ_cr > 5 relaxation is never used, which is conservative) | applies; λ_cr = 2.58 in the benchmark, i.e. **below 5**: the stiffness change must not be neglected (it is not) |
| **B-2.2** design moment | the maximum moment in the length of the member, (a) directly from the second-order analysis, (b) approximately from element end moments, or (c) by amplification; and the last paragraph "M = δ_b M_m, δ_b = moment amplification factor for a braced member determined in accordance with Section 9" for a member with axial compression | the application uses (a), with the member divided in elements. The last paragraph is **not applied** | **open**: reading (i) the paragraph belongs to route (c): nothing further is required after (a); reading (ii) it applies to every compressed member and a δ_b must be applied on top, but Section 9 gives no δ_b formula, and applying one to moments that already contain P-δ would double count |
| **9.3.2.2** member strength under axial compression and bending (K_y, K_z, K_LT, C_m, Table 18) | interaction check of members | **still required** (it is a strength check, not part of the analysis). It is implemented and applied to the **second-order** moments | **open double-counting question**: K_y = 1 + (λ_y − 0.2) n_y is itself an allowance for the moment amplification and the buckling interaction. Using it on moments that already include P-δ may be conservative (counting the amplification twice). The standard does not say. B-1.2 states explicitly that for *advanced analysis* "effect of moment magnification given in Section 9, instability given in Section 7 and lateral buckling given in Section 8 need not be considered"; **it says nothing equivalent for the second-order elastic analysis of B-2.** |
| **7.1.2** flexural buckling strength P_d (buckling class by Table 10, α by Table 7) | strength of the member in axial compression about each axis | **still required**. The buckling curves already contain the member imperfection (α), so a **member bow must not be added to the analysis for this check** (double counting); the application's member bow is user-defined, off by default and labelled | applies |
| **7.2** effective length KL (Table 11, Annex D) | KL from the boundary conditions in the plane of buckling; 7.2.2: Table 11 is for assessable boundary conditions, and "where frame analysis does not consider the equilibrium of a framed structure in the deformed shape (second-order analysis or advanced analysis)" D-1 may be used | **the text does not say which KL to use with a second-order analysis** for P_d of a column whose sway is already in the moments. Table 11 / D-1 are for analyses that do not consider the deformed equilibrium | **open (OI-06c)**: the application requires an entered effective-length factor (no default). RSTAB used KL = member length (k = 1.0) in the benchmark. |
| **8.2.2** lateral-torsional buckling | design bending strength M_d considering the laterally unsupported length | **still required** for open sections (the analysis has no warping DOF); not required for hollow sections of these proportions (8.2.2 b, verified) | applies to OI-06d |
| **9.3.1** section strength under combined forces, **3.7** classification, **6.2** tension yielding | section capacity | **still required** (strength checks) | verified and implemented |
| **5.6** serviceability (deflections) | limits on deflection | the analysis supplies deflections; the combination for service loads is a first-order or second-order SLS analysis chosen by the user; the limits come from IS 800 Table 6 / project, not verified here | not implemented |
| **4.6, B-3** frame stability, λ_cr | elastic critical load factor; amplified sway moments for elastic designs by λ_cr | the rational λ_cr is **captured**; "amplified sway moments" of B-3.1 is another amplification route (not used) | the use of λ_cr in design (e.g. B-3.1) is not implemented |

## 3. Consequences that follow from the text (not decisions)
1. A converged second-order analysis does **not** make a member design compliant: Sections 3.7, 6, 7, 8 and 9 still apply. The record already states this.
2. **λ_cr = 2.58 < 5** in the benchmark: B-2.1 does not allow neglecting the axial-force stiffness change; the application never does, so the analysis is consistent with it.
3. The three open questions that can change a utilisation are all about **double counting versus omission**: (i) δ_b after a direct second-order analysis (B-2.2), (ii) the K factors of 9.3.2.2 on second-order moments, (iii) the effective length for P_d. Each has a conservative reading that the application currently follows: no extra δ_b (not defined), K factors applied as printed, an entered KL.
4. The results of the comparison with RSTAB on 9.3.2.2 (Phase 1 section 3) are affected by (ii): the equation, the moments used and C_m are the points where RSTAB and the printed text may differ.

## 4. Options for each open question (decision needed; none applied)
| Question | Options | Consequence |
|---|---|---|
| (i) δ_b after route (a) | **A.** none (reading i) — current. **B.** apply a δ_b from a document you name | B is impossible without a definition; A is conservative only if the P-δ is captured, which the elements do (verified against closed forms) |
| (ii) 9.3.2.2 on second-order moments | **A.** apply as printed to second-order moments (current; may double count). **B.** apply the equation with first-order moments (then the amplification is only in K and C_m, but the first-order route is not design-verified, see OI-03). **C.** your reference | decides the utilisation of every compression member; the quantified size of the double count can be measured on TM3: P-δ doubles the moment at 0.5 P_E; K_y with n_y = 0.5 adds a further factor of about 1 + (λ − 0.2) × 0.5 |
| (iii) KL for P_d with second-order | **A.** entered factor (current, no default). **B.** KL = member length for braced and sway frames when the analysis includes sway (k = 1.0 as RSTAB did), with the choice shown in the record. **C.** Annex D-1 | the choice changes P_d and therefore n_y, K_y and the interaction |

## 5. Validation plan (to run after your decisions, no calculation change before)
1. TM1 and TM3 (`docs/RSTAB_TEST_MODELS.md`): the analysis against the closed forms: done (0.001 % and 0.03 % at 4 elements).
2. A pin-ended beam-column (TM3) designed to 9.3.2.2 with (a) second-order moment, (b) first-order moment, reporting both utilisations beside a hand calculation: quantifies (ii).
3. A cantilever column (TM1): P_d with KL = 2L (Table 11 cantilever) against KL = L with the second-order moment: quantifies (iii).
4. Regression tests for every adopted reading; the register states the reading and the document it rests on.

## 6. What I need from you
Your decision on (i), (ii) and (iii), or the documents that define them; the effective-length convention you want shown in records.
