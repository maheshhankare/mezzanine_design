# Conversion to IS 800:2007 only

**Scope change.** The application previously offered Eurocode (EN 1990 / EN 1993 with a National Annex), AISI / AISC and IS routes. The Eurocode and AISI / AISC design routes were **removed completely**. IS 800:2007 is the only steel design standard: there is no standard selector, no alternative route and no hidden fallback. Nothing that belonged to a removed route is read, shown or calculated, and no value of another standard is presented under an IS label.

This document lists what was removed, what replaced it, what stayed, how stored projects are migrated, and what is verified or pending. It is the only place (besides the tests that check the removal and the migration code) where the removed standards are named.

## What was removed

* **Frame module** (second-order solver, imperfections, settings, register, record): the EN 1993-1-1 imperfection and stability provisions (`codes/en1993.ts`), the National Annex parameters and every setting that selected them, the stability-method option, the EN text of the register and of the record. The solver itself is standard-independent and was kept.
* **C-section designer** (`src/server/engine`): the effective-section calculation of cold-formed sections (`en_section.ts`), the finite-strip method (`fsm.ts`, used only for it and for the AISI direct strength method), all EN and AISI resistance formulas of members, connections (T-stub prying, joint stiffness and classification components, hollow-section wall rules), column, base plate and slab, restraints (surface, joist, stability-bracing and brace-force rules), the EN and AISI load combinations and partial factors, and their inputs (`na`, `gM0`, `gM1`, `gM2`, `gG`, `gQ`, `combo`, `psi0`), grades and product standards.
* **UI and documents**: the old analysis-settings panel and page (`/analysis`), the mockup-parity expectations and the EN / AISI reference studies, the EN sections of `docs/`.

## What replaced it

* **Frame analysis and design** (`/frame`, `/frame/[id]`): the project workflow Project, Model, Analysis settings, Validation, Solver, Results, IS 800 design, Calculation record, Report, with saved and restored settings, run history and model-revision identification (`docs/SECOND_ORDER.md` section 9). Settings live with the project.
* **IS 800 member design** of rectangular hollow sections, verified clause by clause (`docs/IS800_DESIGN.md`), used by the frame run and by the box column of the C-section designer.
* **C-section designer**: the structural analysis (internal forces, elastic lateral-torsional buckling, torsion, deflection) is unchanged and code-neutral. The **resistances of cold-formed sections need IS 801, which was not supplied**: each such check shows its demand and is **pending (REVIEW)**: it has no resistance and can never be PASS. A central rule (`src/shared/check.ts`, `clauseVerified`) makes **every** check that cites an IS 800 provision not verified in the register, or a standard that was not supplied (IS 801, IS 456, IS 875), REVIEW whatever its value.
* Consequences that follow from the rules and are visible in the results: no surface restraint is credited, the joist restraint is checked with IS 800 8.3.4 and 10.3 (`docs/IS800_JOIST_RESTRAINT.md`), and the SB-Int restraint of the main beam is a labelled user-defined assumption (default: full restraint), joints are analysed as nominally pinned (no verified joint-stiffness provision), the box column is designed by the verified hollow-section design when its effective lengths are known (user input, or a pinned braced column at k = 1.0), a welded box column and a fixed-base or knee-braced column without user effective lengths are pending. The default project therefore reports REVIEW for most checks and may report unstable members (an analysis result).

## Migration of stored projects

Nothing is reinterpreted silently.

* **Frame projects** (`migrateSettings`): removed keys are dropped and named; an imperfection taken from a removed route is dropped, a user-defined one is kept and flagged; the member design is switched off; the settings of an older version are brought to the current version; the result carries `review.required`: **no run is possible until the user has reviewed and confirmed the settings** (a confirmation that is refused while the settings contain errors). Migration happens at every read, so an old project cannot silently carry a removed route.
* **C-section projects** (`SCHEMA.migrate`, applied on the server for every request and in the browser when a project is opened or imported): removed inputs are dropped and named; a design route that no longer exists becomes IS 800:2007; a grade that is no longer offered becomes a **user-defined** grade (the user's f_y and f_u are kept); the input "Migrated project: inputs reviewed" is set to **No**, and the calculation **refuses to run** until it is set to Yes. The flags are shown in the message.
* The stored data are not rewritten until the user saves.

## Verified and pending provisions

See `docs/CODE_REGISTER.md` (generated; 32 items) and `docs/IS800_ROUTE.md`. In short: verified: 4.3.6 (+ .1, .2, .3), Annex B-2 and B-3.2, 5.4.1 / Table 5, 3.7 / Table 2, 6.1-6.2, 7.1.2 with Tables 7-10, 8.2.1.2, 8.2.2 (hollow), 8.4.1, 9.3.1 / Table 17, 9.3.2 / Table 18. Provisional: notional-force distribution, the 1.4 amplification decision, 9.2.2, and 2.2.4.1 / Table 4 (page images to be checked). Pending: Annex B-1, 6.3 / 6.4, 7.2 (effective length), 7.5, 8.2.2 open sections, open-section members, **Section 10 connections and column bases, IS 801**, the IS 800 amplification factor.

## Tests

| Command | What it checks |
|---|---|
| `npm run test:no-en` | no file of the repository refers to a removed standard, except an explicit allow-list (each with its reason) |
| `npm run test:legacy` | the schema offers one standard; migration and the review gate; a removed route cannot be selected or reached; no check, clause, note or step of a removed standard; unverified provisions never give PASS or FAIL; cold-formed resistances are pending; the box column design; the clause gate |
| `npm run test:codes` | the register, IS 800 analysis provisions, the settings (including migration and that obsolete settings cannot select a route), the calculation record |
| `npm run test:design` | IS 800 member design equations |
| `npm run test:frame` | the second-order solver (closed-form solutions) |
| `npm run test:rstab` | the RSTAB benchmark regression bounds (CO1, CO2) |
| `npm run test:integration` | the project workflow with the in-memory store: creation, restored settings, migration and review gate, run, stale runs after a model change, report PDF, authorisation |
| `npm run test:engine` | the six reference cases of the C-section designer (recorded again for the IS-only engine with `scripts/record-xbref.ts`) |

## Limitations

* Cold-formed member resistances, connections, column bases, angle struts and open-section members are **pending**: the application cannot give a design verdict for them under IS 800 until the missing provisions are verified or IS 801 is supplied.
* The IS 800 amplification factor is not implemented, so first-order results are not designed.
* RSTAB's overall-member utilisation (9.3.2.2) is not reproduced (`docs/RSTAB_BENCHMARK.md` section 8).
* The C-section reference results (`xbref.ts`) describe the converted engine; they are not comparable with the former mockup.
