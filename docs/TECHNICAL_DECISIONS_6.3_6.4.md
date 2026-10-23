# Technical decisions: net-section rupture (IS 800:2007 6.3) and block shear (6.4)

Status: **decisions taken by the engineer of record's delegate under the instruction "make the technical decisions independently"; implemented, unit-tested and cross-checked; NOT formally validated and NOT marked VERIFIED in the code register** (items IS800-6.3, IS800-6.3.3 and IS800-6.4 are `provisional`). Every check that uses them is reported as REVIEW by the application, never PASS or FAIL. Nothing is committed, pushed, merged or deployed.

Scope of standards: **IS 800:2007 only** (the application was converted to IS 800 only and a test enforces that no other design route returns). Literature and software outside the Indian standards were used **only as an independent cross-check of equations**, never to supply a provision. Source figures: `review-pack/REVIEW_6.3_6.4_CONVENTIONS.html` (git-ignored; page images of the supplied scan).

## D1 Convention for A_nc and A_go (6.3.3)
* **Decision:** areas on the centre lines of the legs: A_go = (w − t/2) t; A_nc = (b − t/2) t less the holes (net-area rule of 6.3.1 on the leg); fillets neglected.
* **Rationale:** (i) the two gross leg areas then add up exactly to the gross area of the angle (b + w − t) t, while the heel-line convention counts the corner t² twice; (ii) the clause's own shear-lag width b_s = w + w_1 − t equals the centre-line path (w − t/2) + (w_1 − t/2). Among the conventions that close, it gives the lowest strength.
* **Reference:** IS 800:2007 6.3.3, Fig. 6 (read on the page image). The text does **not** define the convention: this is an engineering interpretation. The superseded IS 800:1984 and the handbook SP 38 (p. 57 worked example, based on the older code) use the same leg width − t/2 practice, which is historical, not a provision of the 2007 code.
* **Assumptions / limitations:** fillet radius neglected (slightly conservative); the connected leg is an input (the application's leg b); one hole per critical section for a single bolt line, otherwise the 6.3.1 stagger rule is available.
* **Verification:** hand calculation (ISA 100×100×10, f_y 250, f_u 410, M20 hole, w_1 = 50, three bolts at 50 mm): A_nc = 730, A_go = 950 mm², b_s = 140, β = 0.7512, T_dn = 215.5 + 162.2 = 377.7 kN (`scripts/test-tension.ts`). No published worked example of the IS 800:2007 6.3.3 equation was found that states its areas, so there is **no independent confirmation of the convention itself**.
* **Impact:** versus heel-line areas the strength is 6.2 % lower, versus "outstanding leg without the corner" 1.6 % lower (example above).
* **Unresolved:** a professional should confirm the convention against the code committee's intent or a handbook that states it.

## D2 Two angles back to back (6.3.4)
* **Decision:** T_dn = 2 × T_dn of one angle (each angle is a single-leg connection to one side of the gusset).
* **Rationale:** the pair is symmetric about the gusset, each angle is connected through one leg and has the same w, t, b_s, L_c; 6.3.4 states that the 6.3.3 equation "may" be used for double angles.
* **Limits:** only the back-to-back arrangement on both sides of a gusset (the application's "two angles back-to-back"); star and cross angles, angles connected by both legs: not covered, not computed.
* **Verification:** hand calculation (2 × 377.7 kN). **Impact:** the knee brace with two angles gets twice the single-angle strength; the demand is shared equally by symmetry.

## D3 Channels, I-sections and other rolled sections (6.3.4)
* **Decision:** no shear-lag equation is applied; the strength is bounded from below by the net rupture of the connected elements alone (6.3.1, `connectedElementRupture`), labelled "lower bound".
* **Rationale:** 6.3.4 defines only the shear-lag distance b_s; w, t, A_nc and A_go are not defined for these sections and several readings are possible, so a defensible lower bound is used instead of an invented reading. The outstanding elements can only add strength, so the bound is conservative for rupture.
* **Impact:** conservative; no member of the application currently uses it. **Unresolved:** a reference is needed before the 6.3.4 equation is used for these sections.

## D4 Block shear geometry (6.4.1, Fig. 7)
* **Decision:** shear length from the end edge to the centre of the last hole, L_v = e_1 + (n − 1) p, with (n − ½) d_0 deducted per plane; tension plate: between outer hole centres with (n_across − 1) d_0 deducted; angle: from the hole centre to the toe, L_t = (n_across − 1) g + e_2, with (n_across − ½) d_0 deducted; plate 2 shear planes, angle 1.
* **Rationale:** read on the enlarged Fig. 7: the dashed shear lines start at the end edge and stop at the centre of the last hole; the tension line runs through hole centres (7A) or from hole 2 through hole 3 to the toe (7B). The half-hole deduction follows from a cut that ends at a hole centre.
* **Verification:** (a) hand calculations; (b) the **published STAAD.Pro verification problem** (IS 800:2007 LSD, angle in tension with block shear, ISA 150×90×15, f_y 250, f_u 420). Its page prints A_vn 2040, A_vg 3525, A_tn 570, A_tg 675 mm² and **no geometry**. Full analysis in `docs/TECHNICAL_VALIDATION_REPORT_6.3_6.4.md`: the second expression reproduces its 509.574 kN with the printed areas; the printed first expression 616.8 kN does **not** follow from the printed A_tn = 570 (634.9 kN) but does from A_tn = 510 mm², which is (45 − 22/2) × 15, the one-sided reading with a 22 mm hole; the same 22 mm hole with five bolts and L_v = 235 mm gives A_vn = 2040 exactly. The printed A_tn = 570 (which would need a 14 mm hole) is therefore the inconsistent figure of the page; it does not affect the governing 509.6 kN. **(An earlier version of this record said the printed tension areas were reproduced with a 14 mm hole: that was a coincidence of one area and is withdrawn.)** The geometry is inferred, not printed, and the page is software documentation, not the standard: it supports the reading, it does not prove it.
* **Impact:** plate block tearing of the shear connections: +9 to +15 % resistance (the former approximation took net areas for both terms); the check stays REVIEW.

## D5 Single bolt (L_c = 0)
* **Decision:** β takes its lower limit 0.7. **Rationale:** b_s/L_c is unbounded, the printed equation tends to −∞ and the clause bounds β ≥ 0.7. **Impact:** knee braces with one bolt per end.

## D6 Applications made
* **Knee brace in tension (restraint.ts):** the pending check is replaced by (i) net-section rupture, 6.3.3 / 6.3.4 with D1-D2, and (ii) block shear of the end, 6.4.1 with D4. Leg b (input label "connected") is the connected leg; one bolt line (the input "Bolts per end (one line)"); w_1 = b − e_2. Verified by hand: default-like case T_dn = 377.7 kN, T_db = min(298.8, 258.5) = 258.5 kN.
* **Vertical bracing diagonal (flat):** net-section rupture 6.3.1 with one hole in the critical section (assumption: a single bolt line across the flat). Block shear is **not** checked there (no bolt-pattern input).
* **Plate block tearing of the shear connections (conn.ts):** gross areas as in 6.4.1 (D4).
* **Status of all of them:** REVIEW (the clauses are provisional); no PASS or FAIL changes; engine reference baseline re-recorded after a key-by-key comparison showed exactly these changes and nothing else.

## D7 Thread root area (6.3.2)
* **Decision:** `threadRootArea(d)` = π/4 (d − 1.22687 P)² for M8-M36 coarse threads (ISO 724 / ISO 261 geometry), M20 = 225.2 mm², M16 = 144.1 mm². **Limits:** IS 1367 tables were not supplied; no member of the application uses a threaded rod in tension, so it is not applied.

## Items that remain pending, and why
| Item | Why it cannot be decided from the available evidence |
|---|---|
| Cold-formed C-section web in tension | outside IS 800:2007 (thin cold-formed material): the applicable IS 801 provisions are not verified, and a substitute would be a provision from another scope |
| Block shear of the vertical bracing end | the bolt pattern (pitch, end distance) is not an input; any value would be invented |
| Welded block shear (6.4.2) | no geometry in the text; the section that "can shear off" depends on the weld layout of the project |
| Angle compression (7.5) | separate item |

## Verification record (local, non-destructive, current branch)
test:tension 43 (hand values, 100×100×10 angle, STAAD cross-check), frame 79, rstab (all bounds met), integration 32, codes 99, design 115, legacy 51, restraint 48, engine (6 reference cases identical after re-recording), no-EN, bundle, tsc clean.
