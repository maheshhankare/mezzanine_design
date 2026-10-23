# Technical validation report: net-section rupture (IS 800:2007 6.3) and block shear (6.4)

Branch: `feature/second-order-fem` (HEAD = origin = `9f3e2dc`; **nothing from this report is committed or pushed**). Standard: IS 800:2007 (Third Revision, December 2007, supplied scan). Companion documents: `docs/TECHNICAL_DECISIONS_6.3_6.4.md` (decisions), `review-pack/SKETCHES_Anc_Ago_BlockShear.html` (dimensioned sketches, git-ignored), `review-pack/REVIEW_6.3_6.4_CONVENTIONS.html` (page images, git-ignored).

**Verification status: nothing in this report is VERIFIED.** Register items IS800-6.3, IS800-6.3.3 and IS800-6.4 are `provisional`; every application check that uses them is REVIEW. Passing tests demonstrate that the code does what is written, not that the written convention is the code's intent.

## 1. The 509.574 kN / 616.8 kN block-shear discrepancy

### Evidence reviewed
The STAAD.Pro verification problem "IS 800 2007 LSD - Angle - Tension with Block Shear" (Bentley documentation, two versions of the page read, 100 kN tension on a 3 m cantilever ISA 150×90×15, f_y 250, f_u 420, γ_m0 1.1, γ_m1 1.25). **Source of the equations:** both expressions are those printed in IS 800:2007 6.4.1 (read on the supplied page image, printed p. 33): T_db,1 = A_vg f_y/(√3 γ_m0) + 0.9 A_tn f_u/γ_m1 and T_db,2 = 0.9 A_vn f_u/(√3 γ_m1) + A_tg f_y/γ_m0, T_db the smaller. The page is software documentation, not the standard.

**Everything the page prints (verbatim, both versions agree):** input and text A_vn 2040, A_vg 3525, A_tn 570, A_tg 675 mm²; text T_db,1 = 616.8 kN, T_db,2 = 509.6 kN, T_db = 509.6 kN; output listing "ATN 675, ATG 570" (labels swapped relative to the input) and "509.574E+06" (units slip) for the capacity. **No bolt count, hole diameter, pitch, end or edge distance, gauge or thickness is printed** (the member section ISA 150×90×15 gives t = 15 mm).

### Calculations (independent hand/script arithmetic)
| Case | T_db,1 | T_db,2 | Remark |
|---|---|---|---|
| Printed input (A_tn 570, A_tg 675) | **634.90 kN** | **509.574 kN** | T_db,2 reproduces the page to four digits; T_db,1 does not give the printed 616.8 |
| Swapped (output labels: A_tn 675, A_tg 570) | 666.66 kN | 485.71 kN | does not reproduce 509.574, and is physically impossible: a net area (675) cannot exceed its gross area (570) |
| A_tn needed for T_db,1 = 616.8 kN | 510.1 mm² = 34.0 × 15 | | = (45 − 22/2) × 15: a 22 mm hole, half-hole deduction |
| Geometry d_0 = 22, n = 5, L_v = 235, e_2 = 45, t = 15 | 616.76 kN | 509.574 kN | gives A_vg 3525 ✓, A_vn = (235 − 4.5·22)·15 = 2040 ✓, A_tg 675 ✓, A_tn = 510 |

### Reason for the discrepancy (finding, with its limits)
* The printed **A_tn = 570 is inconsistent with the other printed areas.** One hole diameter, 22 mm with five bolts (L_v = 235), reproduces A_vn = 2040 exactly and gives A_tn = 510, which reproduces the printed T_db,1 = 616.8 kN. A_tn = 570 would need d_0 = 14, and no bolt count then gives A_vn = 2040 with L_v = 235 (tested for n = 2…10). The only other integer solution of A_vn = 2040 with a common hole diameter (d_0 = 18, n = 6) gives A_tn = 540 and T_db,1 = 625.8 kN, which also does not match.
* The governing result is **unaffected**: T_db = min(T_db,1, T_db,2) = T_db,2 (A_tn does not enter T_db,2).
* The STAAD output listing swaps the ATN and ATG labels, and prints the capacity with a units slip (E+06). These are documentation/output errors.
* **Limits:** the geometry (n = 5, d_0 = 22) is inferred from the areas, not printed; it is the unique simple geometry that explains three printed areas and the printed 616.8. It cannot be confirmed without the model file (`IS 800 2007 LSD - Angle - Tension with Block Shear.STD`, a sample installed with STAAD.Pro, not available on this machine) or the vendor's calculation.
* **Correction of my earlier statement:** the decision record earlier said the printed tension areas were reproduced with a 14 mm hole. That was a coincidence of one area and is withdrawn (`TECHNICAL_DECISIONS_6.3_6.4.md`, D4).
* **No implementation change was made to match the benchmark.** The equations and the geometry reading were unchanged; the investigation changed the interpretation of the benchmark data.

## 2. A_nc and A_go: convention, sketches, calculation
* **Code edition and clause:** IS 800:2007, 6.3.3 with Fig. 6 (b_s = w + w₁ − t, w₁ = back of the outstanding leg to the bolt line); 6.3.4 for other sections. **The clause names A_nc ("net area of the connected leg") and A_go ("gross area of the outstanding leg") and gives no rule for where a leg's width is measured.** No clause supports a specific convention.
* **Selected convention (engineering interpretation, REVIEW):** centre lines, A_go = (w − t/2) t and A_nc = (b − t/2) t − holes. Support: (i) closure to the gross area (b + w − t) t, (ii) b_s = (w − t/2) + (w₁ − t/2) is the centre-line path. Not verifiable from the supplied text.
* **Sketches** (`SKETCHES_Anc_Ago_BlockShear.html`): Fig. A section with hatched A_go and A_nc, centre lines, heel line, toes, bolt line, w₁ and the hole deduction; Fig. B elevation of the bolted leg with the member end, hole centres, e₁, p, e₂, the shear path (red), the tension path (blue), the net-section cut (green) and the free edge; Fig. C the validation geometry above.
* **Calculation** (ISA 100×100×10, f_y 250, f_u 410, M20 hole 22, w₁ 50, three bolts at 50): A_go = 95·10 = 950; A_nc = 95·10 − 22·10 = 730 mm²; b_s = 140; β = 1.4 − 0.076·10·(250/410)·1.4 = 0.7512 (limits 0.7 and 1.4432); T_dn = 0.9·730·410/1.25 + 0.7512·950·250/1.1 = 215.5 + 162.2 = **377.7 kN**. Alternative conventions: heel line +6.2 %, outstanding leg without the corner +1.6 %.
* **What would verify it:** the commentary / background document of IS 800:2007, a handbook worked example of a single angle in tension under the 2007 code that states A_nc and A_go, or written confirmation from the code committee. **Retained as REVIEW.**

## 3. Items kept PENDING or REVIEW (as instructed)
| Item | State in the application | Reason / what is required |
|---|---|---|
| Cold-formed C-section web resistance | explicit PENDING check ("C web net section in tension") | IS 801 is a different scope (working stress, IS 801:1975; method not chosen); the verified provisions and method are required |
| Vertical-bracing end block shear | explicit PENDING check **added** | the bolt pattern (pitch, end and edge distances) is not an input; required: those inputs |
| Welded block shear (6.4.2) | no check exists (nothing can be mistaken for a result); register IS800-6.4 states it | the text gives no geometry; required: the weld layout and the section that can shear off |
| Angle compression (7.5) | explicit PENDING check ("Knee brace in compression") | 7.5 not implemented; required: the 7.5.1 equations, Table 12 and the connection data, to be read and verified |
| Net rupture and block shear that exist | REVIEW (knee brace, shear-connection plates, vertical bracing rupture) | provisional clauses; never PASS / FAIL |

## 4. Test adequacy review
**Reviewed:** the 32 tests I had written, the engine reference cases, and the knee-brace path.
**Gaps found and addressed (no design assumption changed):**
1. Invalid inputs were tested only for a few cases → added NaN, Infinity and negative values for every function and bolt-pattern invalid cases.
2. No boundary tests → added: holes removing the whole section, one-hole end distance at exactly d_0/2, β inside the limits, thread table limits.
3. No unit/dimension consistency tests → added: linearity in areas and strengths, quadratic scaling of geometrically similar angles and plates (all lengths × 2 → areas × 4, β unchanged, T × 4).
4. No monotonicity/closure tests → added: block shear does not decrease with e₁, p, e₂, t and decreases with d_0; centre-line areas close to the gross area for five angles.
5. The validation case was a single number → now reproduces T_db,2, documents that T_db,1 does not follow from the printed A_tn, reproduces it with A_tn = 510, and records that the swapped assignment is impossible.
6. The knee-brace application had no regression test → added hand values (377 691 N, 258 505 N), REVIEW-never-PASS, two-angle doubling, monotonic behaviour, and invalid geometry (e₂ outside the leg, one bolt with e₁ < hole radius) giving pending checks.
7. **A defect found by the new tests and fixed:** when block shear could not be computed the knee-brace code still emitted the rupture check and then a combined pending check; e₂ larger than the leg was rejected only by the rupture path. Now the geometry is validated once and each check is independently PENDING.
**Remaining gaps:** no independent source for the convention (cannot be tested into existence); the welded case and the vertical-bracing end have no check to test; hole clearances use the application's rule d_0 = d + 1 (d ≤ 14) / d + 2 (larger), which differs from Table 19 for d ≥ 27 mm (pre-existing, not changed, recorded here).

## 5. Test results (local, non-destructive, current branch)
test:tension 60, frame 79, rstab (all bounds met), integration 32, codes 99, design 115, legacy 51, restraint 55, engine (6 reference cases identical after a key-by-key diff showed only the intended added checks: 1 pending knee-brace check replaced by 2 REVIEW checks, 1 pending vertical-bracing check, nothing else changed), no-EN clean, bundle, pdf, `tsc --noEmit` clean.

## 6. Production resources and user data
* **No production resource and no user data were modified.** The tests used: pure functions, the in-process engine, an in-memory store (`MemoryFrameStore`) for the integration test, and a static scan of client files for leaked secrets (`test-bundle`). No script touched a database (`test:api`, migration and cleanup scripts were **not** run); no environment variable, Vercel setting, deployment-protection token, region, access permission or existing project or account was touched. The only external activity was reading public web pages (web search and the Bentley documentation page). `test:pdf` wrote `report-test.pdf` locally (git-ignored).
* `.claude/launch.json` shows as modified: this is the earlier user change (unrelated entry), not touched by me and not to be committed with this work.

## 7. Working tree (all changes local on `feature/second-order-fem`, uncommitted)
Modified: `docs/CODE_REGISTER.md`, `docs/OUTSTANDING_ITEMS_REGISTER.md`, `package.json` (test:tension script), `scripts/test-restraint.ts`, `src/server/engine/conn.ts`, `src/server/engine/resist.ts`, `src/server/engine/restraint.ts`, `src/server/engine/xbref.ts` (re-recorded baseline), `src/server/engine/xcheck.ts` (ENGINE_VERSION 2.1.0), `src/shared/codeRegister.ts`, `.claude/launch.json` (not mine). New: `docs/TECHNICAL_DECISIONS_6.3_6.4.md`, `docs/TECHNICAL_VALIDATION_REPORT_6.3_6.4.md`, `scripts/test-tension.ts`, `src/server/frame/design/tension.ts`. Git-ignored review material: `review-pack/*`.

## 8. Unresolved items
1. The A_nc / A_go convention has no supporting clause (REVIEW).
2. The Fig. 7 reading (including the half-hole rule) is supported by the figure and by the validation case but the case's geometry is inferred.
3. The 6.3.4 treatment of channels and I-sections (lower bound only) and of double angles (2 × one angle) has no printed rule.
4. C web, vertical-bracing end, welded ends, angle compression: PENDING.

## 9. Recommended next actions
1. Obtain the IS 800:2007 commentary or a handbook example that states A_nc and A_go (or the code committee's confirmation); until then keep REVIEW.
2. Obtain the STAAD.Pro sample model file (or the vendor calculation) to confirm the validation geometry (n = 5, d_0 = 22); if it differs, re-evaluate item 2.
3. Decide the IS 801 method for the C-section web (the standard and edition), or leave it PENDING.
4. Add the bolt pattern of the vertical-bracing end as inputs, or leave its block shear PENDING.
5. Read IS 800 7.5 (angle struts) on the page images and report before implementing.
6. Separately review the hole-clearance rule for d ≥ 27 mm against Table 19 (pre-existing).
7. On your explicit written approval: commit and push to `feature/second-order-fem` (the file list in section 7 without `.claude/launch.json`). Merging and production deployment need separate approval.
