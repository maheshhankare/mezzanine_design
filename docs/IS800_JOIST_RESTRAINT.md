# Joists as lateral restraints of a secondary beam (IS 800:2007)

Code: `src/server/frame/design/restraint.ts` (equations), `src/server/engine/restraint.ts` (`joists`), tests `npm run test:restraint` (48 checks). Register items `IS800-8.3.4` and `IS800-10.3` (both verified on the page images, `docs/CODE_REGISTER.md`).

## What IS 800 says (8.3.4, 8.3.4.1) and what is implemented

| Requirement | Check | Result |
|---|---|---|
| The restraint must resist 2.5 % of the maximum force in the compression flange, divided equally between the restraint points; each point at least 1 % | demand `F_R = max(0.025 F_cf / n; 0.010 F_cf)`, `F_cf = M_Ed / (H − t)` of the secondary | demand (shown with the steps) |
| In a series of solid-web beams on the same restraint system the sum is 2.5 % of one beam's flange force | the force to be delivered to the lateral supports = n F_R | demand on the anchorage |
| Connected to a bracing system or an independent robust part of the structure; parallel members shall not depend on each other | anchorage must exist (`Not anchored` = FAIL) and its capacity (input, from its own design) must be ≥ the demand | PASS / FAIL; REVIEW if the capacity is not entered |
| Connected as close to the compression flange as practicable | joist connected at the top flange | PASS; REVIEW otherwise (no torsional restraint is available to justify it) |
| Sufficient strength of the joist | rectangular hollow-section joist: the verified IS 800 design (7.1.2, 8.2.1.2, 8.4.1, 9.3) under the restraint force and its own load, with the effective-length factor you enter (7.2 is not verified) | PASS / FAIL; angle (7.5) and cold-formed joists (IS 801) are pending |
| Sufficient strength of the connection | bearing-type bolts 10.3.2-10.3.4 (shear with long-joint and grip reductions, bearing on the joist wall), geometry 10.2.1 (Table 19), 10.2.2, 10.2.4.2 | PASS / FAIL |
| Bearing and tear-out on the cold-formed secondary | outside IS 800 (IS 801 not supplied) | **pending** |
| Sufficient stiffness | **IS 800 gives no numerical criterion.** The actual stiffness `K_J = 1/(L/EA + 2/K_c + 1/K_a)` (joist, two connections, anchorage: all entered) is a spring of the elastic buckling analysis; unknown stiffness cannot be modelled and is never assumed rigid | modelled / REVIEW |

## Credit

* **Verified mode (default):** the joist is credited as a lateral restraint only if every required check above is verified and satisfied. Because the secondaries of this application are cold-formed C sections, the bearing on them needs IS 801, so **in practice a joist is not credited in this mode**; the panel states exactly which items are missing or failing.
* **User-defined mode:** with a written justification the joist is credited with the real `K_J` (rigid when unknown), the result is labelled USER-DEFINED, a REVIEW line is added, and failing checks stay FAIL.
* A joist whose anchorage is "not anchored" is never credited.
* The elastic buckling analysis of the secondary uses exactly the restraints that are credited: a softer spring gives a lower M_cr, no credit gives the end-fork value.
