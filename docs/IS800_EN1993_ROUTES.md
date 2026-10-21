# IS 800:2007 and EN 1993-1-1 routes: what the supplied texts say, what is implemented, what is open

Evidence: **IS 800:2007** (Third Revision, Dec 2007, scanned copy, 150 pages, no amendments included) and **EN 1993-1-1:2005** incl. corrigenda 2006/2009 (93 pages), both supplied by the user. The text layer of the IS 800 scan is OCR; every clause below was read on the page image. **No National Annex and no EN 1993-1-1:2005/A1:2014 was supplied.** The per-clause records (formula, parameters, applicability, implementation, test, evidence page, status, outstanding issue) are in `docs/CODE_REGISTER.md`, generated from `src/shared/codeRegister.ts`; this document explains the routes and answers the combination question.

Code in `src/server/frame/codes/is800.ts` and `en1993.ts` is independent: nothing in the IS 800 route uses a Eurocode equation or factor, and vice versa. Tests: `npm run test:codes` (113 checks).

## 1. IS 800:2007: provisions read and implemented

| Clause | Requirement (summary) | Status |
|---|---|---|
| 4.3.6 | Notional horizontal forces, 0.5 % of the factored dead + vertical imposed load applied at each level, to analyse a frame under gravity loads considering its sway stability; they account for practical imperfections; not applied along with wind / earthquake | verified (the distribution of a level's force over its nodes is not in the clause: assumption IS800-4.3.6-dist, provisional) |
| 4.3.6.1 | Applied on the whole structure, in both orthogonal directions, one at a time, at roof and all floor levels, simultaneously with the factored gravity loads | verified (the sense +/− is not stated; both are generated) |
| 4.3.6.2 | Not to be (a) applied when considering overturning or overall instability, (b) combined with other horizontal loads, (c) combined with temperature effects, (d) taken to contribute to the net shear on the foundation | verified |
| 4.3.6.3 | Gantry load case: sway effect of notional load need not be considered if height / lateral width < 1 | verified |
| 4.4.2, 4.4.3.1 | Amplification factor > 1.4 ⇒ second-order elastic analysis per Annex B; otherwise first order with amplification is permitted | decision rule implemented; the amplification factor itself is **pending** (4.4.3.3 refers to C_my, C_mz of 9.3.2.2 / Table 18, which are equivalent-uniform-moment factors) |
| 4.6, B-3 | Elastic buckling load factor λcr: rational whole-frame analysis, or approximate methods; deflection method λcr = 1/(200 φ_s,max), φ_s = (δ_u − δ_L)/h | rational analysis and deflection method verified; 4.6.2.1 / 4.6.2.2 approximate methods pending (need f_cc of 7.1.2.1) |
| B-2.1 | Second-order elastic analysis: geometry changes and the change of effective stiffness due to axial force; λcr > 5 permits neglecting the latter | verified (the solver always includes the geometric stiffness; the optional neglect is not used) |
| B-2.2 | Design moment = maximum moment along the member, directly from the second-order analysis | verified route (a) |
| B-1 | Advanced analysis | pending (not implemented) |
| Sections 7, 8, 9 (7.1.2, Tables 7 and 10, 8.2, 9.3.2.2, Table 18) | Member resistance, buckling, LTB, interaction | **pending**: not yet read on the page images, not implemented |

**Finding that matters for imperfections:** in 4.3, 4.4 and Annex B-2, IS 800 gives **no values for an explicit geometric sway imperfection or member bow** in the frame analysis. The practical imperfections of the frame are represented by the notional forces of 4.3.6. (B-1.1 names geometrical imperfections for advanced analysis, without values; the member bow enters through the buckling curves of Section 7.) Consequently the IS 800 route offers notional forces as the code imperfection; an explicit geometric imperfection is available only as a user-defined value.

On the benchmark mezzanine (`scripts/rstab/notional-vs-equivalent.ts`): the net force per floor of the RSTAB-type equivalent loads ±φ0·N with φ0 = 1/200 is 57.9 kN; the IS 800 4.3.6 notional force of the same floor (0.5 % of the 11,416 kN factored vertical load there) is 57.1 kN (ratio 1.015, the difference being column self-weight). The two have the same magnitude because 1/200 = 0.5 %; they are not the same provision: the IS notional force must not contribute to the foundation shear (4.3.6.2(d)), the equivalent loads of the benchmark do.

## 2. EN 1993-1-1:2005: provisions read and implemented

| Clause | Requirement (summary) | Status |
|---|---|---|
| 5.2.1(3), (5.1) | First order permitted if α_cr ≥ 10 (elastic) / 15 (plastic); the National Annex may lower the limit | provisional (NDP; limits as printed) |
| 5.2.1(4)B, (5.2), (5.3) | α_cr = (H_Ed/V_Ed)(h/δ_H,Ed) per storey; beam axial compression significant if λ̄ ≥ 0.3 √(A f_y / N_Ed) | verified |
| 5.2.2(3), (7) | Stability: methods a / b / c; if second order and member imperfections are totally in the global analysis, no 6.3 member check is necessary | verified as a setting; the 6.3 checks are pending |
| 5.2.2(5)B, (5.4) | Single-storey: factor 1/(1 − 1/α_cr), only for α_cr ≥ 3.0 | verified |
| 5.3.2(3)a, (5.5) | φ = φ0 α_h α_m; φ0 = 1/200; α_h = 2/√h (2/3 ≤ α_h ≤ 1); α_m = √(0.5(1 + 1/m)) | provisional (NDP) |
| 5.3.2(3)b, Table 5.1 | Bow e0/L by buckling curve (elastic 1/350 … 1/150; plastic 1/300 … 1/100) | provisional (NDP, recommended values) |
| 5.3.2(4)B, (5.7) | Sway imperfections may be disregarded where H_Ed ≥ 0.15 V_Ed | verified |
| 5.3.2(6), (5.8) | Bow in addition to sway for frames sensitive to second order: compressed member, at least one moment-resistant end joint, λ̄ > 0.5 √(A f_y/N_Ed) | verified |
| 5.3.2(7), Figure 5.4 | Equivalent forces: sway ±φN_Ed; bow q = 8 N_Ed e0/L² with end forces 4 N_Ed e0/L | verified |
| 5.3.2(8), (9)B | One direction at a time; equivalent forces at each floor and roof | verified |
| 5.3.2(5)B, (10), 5.3.2(11), 5.3.3, 5.3.4(3) k·e0 | Diaphragm configuration, torsional sway, critical-mode imperfection, bracing imperfections, LTB bow | pending (not implemented) |
| Section 6 | Resistance, 6.3 buckling and interaction; γM NDPs | **pending**: not yet read on the page images |

Values from the Eurocode text (φ0, Table 5.1, k = 0.5, α_cr limits) are available only if the user accepts them explicitly; the run is then labelled **provisional**. A verified National Annex is required to remove the label (and is needed for γM).

## 3. May notional loads (or equivalent forces) and explicit geometric imperfections be combined?

This is the tool's reading of the supplied texts, to be confirmed by the engineer; it is not a general rule.

**IS 800:2007**
* 4.3.6 says the notional forces "account for practical imperfections". The code gives no explicit geometric sway or bow imperfection for the frame analysis. An explicit geometric sway imperfection together with the notional forces would therefore represent the same practical imperfections twice. The tool allows an explicit geometry only as user-defined and warns; it never labels it as code.
* The notional force is **not** to be combined with wind / earthquake (4.3.6, 4.3.6.2(b)), temperature effects (c), nor used for overturning / overall instability (a) or the foundation shear (d). The settings validation refuses these combinations.
* Directions: both orthogonal directions, one at a time (4.3.6.1).

**EN 1993-1-1:2005**
* The imperfections are "an equivalent imperfection in the form of an initial sway imperfection **and** individual bow imperfections of members" (5.3.2(3)). Sway and bow are **both** considered, but (6) allows neglecting the bow in the global analysis for member end forces unless the frame is sensitive to second-order effects **and** the member meets (5.8): then the bow is **required in addition to** the sway. So sway + bow is neither always required nor always alternative: it is conditional (`en1993BowRequired`).
* Equivalent horizontal forces (Figure 5.4) **replace** the geometric imperfections (5.3.2(7)): they are alternatives for the same imperfection. Using both for the same effect double-counts it (verified numerically: `docs/SECOND_ORDER.md`, loads + geometry gives twice the effect). EN has no separate "notional load": the "fictitious horizontal loads" of (5.2) serve only the α_cr estimate.
* The critical-mode imperfection of (11) is an **alternative** to (3) and (6) ("as an alternative to (3) and (6) ... a unique global and local imperfection"): not to be added to them (not implemented).
* Sway imperfections apply in the relevant directions, one at a time (5.3.2(8)); they may be disregarded where H_Ed ≥ 0.15 V_Ed (5.3.2(4)B).
* The National Annex may change φ0, e0/L, the scope of (11), and k: not supplied, so these decisions stay provisional.

Settings that would double-count (geometric sway together with imperfection loads in the load cases; equivalent loads together with geometry; the IS notional-load mode in the EN route; both sway representations) are refused or warned by `validateSettings` and `resolveImperfectionSource`.

## 4. Blockers and the exact input needed

| Blocker | Input needed |
|---|---|
| EN NDP values (φ0, e0/L, α_cr limits, k, γM) | The National Annex of the project's country (and the country); A1:2014 if applicable |
| IS 800 amplification factor for 4.4.2 / 4.4.3.3 | An engineering decision on the factor to apply, after reading 9.3.2.2 and Table 18 on the page images |
| IS 800 member design | Read Sections 7-9 (many scanned tables) on the page images; then implement and test |
| EN 1993-1-1 member design | Read Section 6 on the page images; Annex values for γM and the 6.3.2 NDPs |
| Notional-force distribution within a level (IS800-4.3.6-dist), senses ± (IS800-4.3.6.1) | Project decision |
| 5.3.2(5), (10), (11), 5.3.3 | Implementation (code exists nowhere yet); (11) also needs the Annex |
| Imperfection method per project (equivalent forces or explicit geometry; stability method a / b / c) | Project decision |
