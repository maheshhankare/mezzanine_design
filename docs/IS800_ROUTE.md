# IS 800:2007: what the supplied text says, what is implemented, what is open

Evidence: **IS 800:2007** (Third Revision, Dec 2007, scanned copy, 150 pages, no amendments included), supplied by the user. The text layer of the scan is OCR and unreliable for equations and tables; a clause is marked verified only after it was read on the page image. **IS 801 (cold-formed light-gauge sections) and the loading standards (IS 875) were not supplied.** The per-clause records (formula, parameters, applicability, implementation, test, evidence page, status, outstanding issue) are in `docs/CODE_REGISTER.md`, generated from `src/shared/codeRegister.ts`; this document explains the route and answers the question of combining notional loads with explicit imperfections.

**IS 800:2007 is the only design standard of the application.** There is no standard selector, no alternative route and no fallback. See `docs/IS800_ONLY_CONVERSION.md` for the removal of the previous routes.

Code: `src/server/frame/codes/is800.ts` (analysis provisions), `src/server/frame/design/` (member design, `docs/IS800_DESIGN.md`). Tests: `npm run test:codes` (99 checks), `npm run test:design` (115 checks).

## 1. Provisions read and implemented

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
| 3.7, Table 2; 5.4.1, Table 5; 6.1, 6.2; 7.1.2, Tables 7-10; 8.2.1.2; 8.2.2 (a)-(c); 8.4.1; 9.3.1, Table 17; 9.3.2, Table 18 | Rectangular hollow-section member design | verified and implemented; `docs/IS800_DESIGN.md` |
| 6.3, 6.4, 7.2 (Table 11, Annex D), 7.5, 8.2.2 (open sections), 9.2.2, Section 10, IS 801 | Net-section rupture, angles, effective length, angle struts, lateral-torsional buckling of open sections, connections, cold-formed sections | **pending** (see the register for the reason and the input needed) |

**Finding that matters for imperfections:** in 4.3, 4.4 and Annex B-2, IS 800 gives **no values for an explicit geometric sway imperfection or member bow** in the frame analysis. The practical imperfections of the frame are represented by the notional forces of 4.3.6. (B-1.1 names geometrical imperfections for advanced analysis, without values; the member bow enters through the buckling curves of Section 7.) Consequently the IS 800 route offers notional forces as the code imperfection; an explicit geometric imperfection is available only as a user-defined value.

On the benchmark mezzanine (`scripts/rstab/notional-vs-equivalent.ts`): the net force per floor of the RSTAB-type equivalent loads ±φ0·N with φ0 = 1/200 is 57.9 kN; the IS 800 4.3.6 notional force of the same floor (0.5 % of the 11,416 kN factored vertical load there) is 57.1 kN (ratio 1.015, the difference being column self-weight). The two have the same magnitude because 1/200 = 0.5 %; they are not the same provision: the IS notional force must not contribute to the foundation shear (4.3.6.2(d)), the equivalent loads of the benchmark do.

## 2. May notional loads and explicit geometric imperfections be combined?

This is the tool's reading of the supplied text, to be confirmed by the engineer; it is not a general rule.

* 4.3.6 says the notional forces "account for practical imperfections". The code gives no explicit geometric sway or bow imperfection for the frame analysis. An explicit geometric sway imperfection together with the notional forces would therefore represent the same practical imperfections twice. The tool allows an explicit geometry only as user-defined and warns; it never labels it as code.
* The notional force is **not** to be combined with wind / earthquake (4.3.6, 4.3.6.2(b)), temperature effects (c), nor used for overturning / overall instability (a) or the foundation shear (d). The settings validation refuses these combinations.
* Directions: both orthogonal directions, one at a time (4.3.6.1).
* Equivalent loads and explicit geometry of the same imperfection are alternatives, never both (verified numerically: loads + geometry gives twice the effect, `docs/SECOND_ORDER.md`): `validateSettings` and `resolveImperfectionSource` refuse or warn.

## 3. Blockers and the exact input needed

| Blocker | Input needed |
|---|---|
| IS 800 amplification factor for 4.4.2 / 4.4.3.3 | An engineering decision on the factor to apply, after reading 9.3.2.2 and Table 18 |
| Effective length of members (7.2, Table 11, Annex D) | Read the clauses on the page images; until then the effective lengths are a required user input |
| Members of open sections, angles (7.5, 8.2.2 open, Tables 13 and 14, 6.3) | Read the clauses on the page images; then implement and test |
| Cold-formed members | IS 801 (not supplied) |
| Connections, column bases (Section 10, 7.4) | Read the clauses on the page images; then implement and test |
| Load combinations Table 4 and E (2.2.4.1) as used by the C-section designer | Page image of Table 4 and 2.2.4.1 to be checked (provisional in the register) |
| Notional-force distribution within a level (IS800-4.3.6-dist), senses ± (IS800-4.3.6.1) | Project decision |
| Imperfection method per project (notional loads, or a user-defined equivalent load / geometry) | Project decision |
