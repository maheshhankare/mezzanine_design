# Second-order frame analysis (new analysis mode)

Status: **solver core implemented and verified against closed-form solutions (68 checks, `npm run test:frame`), validated against the RSTAB benchmark (first and second order, 2,924 members; Detail 1, Detail 2 and Detail 3, whose analysis data are identical to Detail 2) within the 2 % target except one result type with a documented, unexplained small offset (`docs/RSTAB_BENCHMARK.md`).** The solver is standard-independent. The application's only design standard is **IS 800:2007** (see `docs/IS800_ONLY_CONVERSION.md`): the notional forces and the analysis provisions that could be verified in the supplied official text, the verified hollow-section member design (`docs/IS800_DESIGN.md`), the analysis settings, the project workflow (Project, Model, Settings, Validation, Solver, Results, IS 800 design, Calculation Record, Report) and the calculation record are implemented and tested (`npm run test:codes`, `test:design`, `test:integration`). **Not implemented:** the IS 800 amplification factor (4.4.2 / 4.4.3.3), member design of open sections, angles and cold-formed sections (IS 801 was not supplied), connections.

## 1. Why a new solver

The existing engine has no frame-level finite-element model: members are analysed one at a time (a 2-DOF-per-node beam FE for bending and a Vlasov FE for lateral-torsional buckling), and the column, brace and sway effects come from a load-path model with notional forces and buckling-length factors. A full second-order analysis (P-Δ and P-δ) of a 3D frame needs a new beam-column frame solver, so it is a separate module.

## 2. Formulation

**Two second-order theories are implemented** (`SolveOptions.theory`):

* **`'II'` (default)**: linear strains, equilibrium on the deformed geometry; P-Δ and P-δ enter only through the geometric term N·G (the second-order elastic analysis of IS 800 Annex B; RSTAB "second order analysis (P-Delta)"). Symmetric secant tangent K_b + (EA/L)aaᵀ + N·G, solved by Newton iterations.
* **`'vonKarman'`**: adds the quadratic axial strain (membrane coupling), total-Lagrangian with the exact consistent tangent described below. It additionally captures the axial shortening of bent members, which produced a spurious out-of-plane drift of edge beams in the benchmark and is not what code-based second-order elastic analysis assumes.

The kinematic description below is the von Kármán one; for Theory II the axial strain is simply ε = δ/L and the force term N(a + G(u+u₀)) is kept.

Units N, mm, N/mm². Local axes: x along the member, y = (reference vector × x) normalised, z = x × y; the reference vector is global Z (global X for vertical members); an optional β rotates y, z about x.

* **Degrees of freedom per node:** 6, [ux, uy, uz, θx, θy, θz]. No warping DOF (limit below).
* **Hinges and releases:** every released component of a member end gets its own extra DOF; the element relates local end components to the node through a matrix **M** (u_local = M·q). Elastic hinge springs are extra energy terms ½·k·s². No static condensation, so hinges remain valid in the nonlinear analysis.
* **Element kinematics:** axial displacement linear; transverse v, w cubic Hermite (θz = v′, θy = −w′); torsion linear. Optional Timoshenko shear term in the bending stiffness when shear areas are given.
* **Strain measure** (small strains, moderate rotations, total formulation in the element's initial local frame): mean axial strain

  ε = δ/L + (1/2L)·[ (u+u₀)ᵀ G (u+u₀) − u₀ᵀ G u₀ ],  δ = u₂ − u₁

  with G = ∫ φ′φ′ᵀ dx the geometric matrix of the transverse DOF (optionally + torsion ip/A·θx′²), u₀ the **stress-free initial imperfection**.
  The G-term is the single source of second-order effects: the chord rotation of the element gives **global P-Δ**, the curvature of the deformed shape inside the element gives **member P-δ**. They are not added separately, so nothing is counted twice.
* **Energy:** Π = ½ uᵀK_b u (bending, torsion, shear: curvature change only, so an imperfection carries no initial bending stress) + ½·EA·L·ε².
* **Internal force:** N = EA·ε;  f_int = K_b u + N (a + G(u+u₀)),  a = [−1 at u₁, +1 at u₂].
* **Consistent tangent** (exact derivative, verified against finite differences): K_T = K_b + (EA/L)(a+G(u+u₀))(a+G(u+u₀))ᵀ + N·G. At u = 0 it reduces to the textbook K_E + N·K_G.
* **External loads:** nodal loads, member line loads (local or global), self-weight; conservative (non-follower). Member loads become consistent equivalent nodal loads; the true end forces of an element are f_int − λ·f_eq.
* **Supports:** per-DOF restraints and elastic springs; DOF with no stiffness (e.g. rotations at nodes joined only by trusses) are constrained automatically and counted in the model messages.
* **Truss elements:** axial force only, optionally tension-only (switched off when compressed, with a residual stiffness of 1e-9·EA/L); convergence additionally requires that no element changed state in the last iteration.
* **Residual:** R(u) = λP − f_int(u) on the free DOF.
* **Linear algebra:** symmetric skyline (envelope) LDLᵀ with reverse Cuthill–McKee ordering. The factorisation counts negative pivots: a negative pivot in the tangent at a converged state means the equilibrium is unstable (beyond a critical load) and the status becomes `unstable`.

## 3. Iterative solution (maximum 100 iterations)

Newton–Raphson with the full tangent, per load step (default 4 increments; a failed step is halved up to 6 times):

1. assemble f_int and K_T; 2. R = λP − f_int; 3. convergence test, **all** of: ‖R_force‖/‖λP_force‖ ≤ 1e-6, ‖R_moment‖/‖λP_moment‖ ≤ 1e-6, ‖Δu‖/‖u‖ ≤ 1e-6, |ΔuᵀR|/|uᵀλP| ≤ 1e-10, no truss state change (all configurable, with absolute floors); 4. factorise, solve, optional backtracking line search; 5. update, repeat.

* `maxIterations` is clamped to 100. **Reaching the limit is never treated as convergence.**
* A failed step keeps the last converged state separate from the failed trial (`failedTrial`); the status is `not-converged` with the reason; every attempt and iteration (residuals, maximum correction, energy) is logged.
* Convergence and code compliance are separate: a converged analysis says nothing about safety.

## 4. Verification performed (`npm run test:frame`, 71 checks, all passed; the later ones are the imperfection checks of section 6 and the convergence / von Kármán checks of section 8)

Closed-form references only (these do **not** involve RSTAB):

| Check | Result |
|---|---|
| Skyline LDLᵀ against a known solution; negative pivots counted | error 3e-16 |
| Cantilever tip load: deflection, rotation, reaction, fixed-end moment | error ≈ 1e-12 |
| Simply supported beam, UDL: mid moment, reaction | ≈ 1e-12 |
| Euler buckling load by Sturm count, 2 / 4 / 8 / 16 elements | 0.75 % / 0.05 % / 0.003 % / 0.0002 % (mesh convergence) |
| Cantilever column critical load π²EI/4L² | 0.0002 % |
| **P-δ**: pinned column with half-sine bow, P = 0.2 / 0.5 / 0.8 P_cr, mid moment P·e₀/(1−P/P_cr) | 0.001 % / 0.003 % / 0.013 % |
| **P-Δ**: cantilever column + tip load, deflection (tan kL − kL)H/(Pk), P = 0.2 / 0.5 / 0.8 P_e | 1e-5 % / 1e-4 % / 7e-4 % |
| Beam-column with UDL, maximum moment (w/k²)(sec(kL/2) − 1) | 0.0004 % / 0.003 % |
| Propped cantilever with a hinge: reaction 3wL/8, fixed-end moment wL²/8, hinge moment 0 | ≈ 1e-13 |
| Tension-only bracing: active diagonal F/cosθ, compressed diagonal carries 0, reactions | 2e-7 % |
| Load above the critical load is not reported as converged; last converged state kept | pass |
| Iteration limit 2 → `not-converged` with reason; `maxIterations` 500 clamped to 100 | pass |
| Result independent of the number of load steps (1 vs 6) | 2e-12 % |
| 3D cantilever (biaxial bending + torsion), equilibrium; inclined member | ≈ 1e-13 |
| Element tangent vs finite differences; symmetry | pass (checked in development) |

Performance (synthetic 2,944-member frame, 4 elements per member, 68,000 DOF): about 7 s per factorisation and 310 MB; with 2 elements per member about 1.5 s and 100 MB. Newton converges quadratically once the load is applied in increments.

## 5. Limits of the formulation (documented, not hidden)

* No warping DOF: lateral-torsional buckling and flexural-torsional effects through Wagner terms are **not** captured (the existing Vlasov FE remains the tool for LTB). The torsional geometric term is off by default.
* Moderate rotations only (order of 0.1–0.2 rad); the element frame is fixed at the initial geometry.
* The geometric matrix uses Euler–Bernoulli shape functions even when a shear area is given; the effect is small for slender members.
* P-δ accuracy depends on the elements per member (Euler load error 0.75 % with 2, 0.05 % with 4). The default for columns should be 4.
* Member loads are applied as equivalent nodal loads; internal moments between nodes follow from equilibrium on the deformed shape.

## 6. Imperfections (module `imperfection.ts`)

Two mechanically equivalent representations. They enter only through the geometric term N·G(u+u₀), so they are **never added together for the same effect**.

| Representation | Function | What it is |
|---|---|---|
| Equivalent loads | `swayLoads` | ±φ₀·N at the ends of each compressed column member, N from a first-order gravity solution (frozen). This is what RSTAB's "inclination on a set of members" does (benchmark). |
| Explicit geometry, sway | `swayGeometry(…, 'columns')` | stress-free straight tilt of each column element, in element-local components (`SolveInput.elementImperfection`): upper end displaced φ₀·Δh, both ends rotated φ₀. Nothing else in the structure moves. Current N is used. |
| Explicit geometry, whole structure | `swayGeometry(…, 'structure')` | "shear building" lean: all nodes at height h displaced φ₀·h, floors rigid, columns tilted. Braces and beams see the lean as well: a different imperfection model. |
| Explicit geometry, bow | `bowGeometry` | e₀·sin(πx/L) per element (element-local), ≥ 3 elements per member; slopes exact. |

Why element-local: a joint shares its rotation with the beams, so a nodal field cannot make one column element lean without distorting the beams that frame into it; a first attempt with a nodal field gave results 30–100 % off the equivalent loads, the element-local form agrees within 0.5 %.

**Checks (all in `npm run test:frame`):** a tilted cantilever column at P = 0.5 P_e against the closed form φ₀(tan kL − kL)/k (1e-4 %); geometry = equivalent loads on the same column (1e-12 %); geometry **and** loads together = exactly twice the single effect (double counting, 1e-14 %); bow against P e₀/(1 − P/P_cr) (3e-3 %).

**On the 2,924-member benchmark** (Detail 2, CO1, 4/2 elements; `results/imperfection-study_div4-2.txt`), differences to the equivalent-load run, normalised by the largest value of each quantity:

| Imperfection | displacements | N, V | M | support |
|---|---|---|---|---|
| geometry, columns only | 0.33 % | 0.50 % | 0.05 % | 0.16 % |
| geometry, whole structure leaning | 28.9 % | 0.52 % | 1.49 % | 3.3 % |
| loads + geometry (counted twice) | 88.7 % | 3.6 % | 17.6 % | 54.3 % |

Max sway 24.71 mm (loads) / 24.66 mm (geometry, columns) / 28.64 mm (whole structure) / 45.68 mm (both; gravity alone gives 3.69 mm). The 0.3–0.5 % between loads and geometry is the difference between the frozen N and the current N. Combining both representations nearly doubles the imperfection effect: the module warns about it (`resolveImperfectionSource`: sway as geometry together with notional/equivalent loads, sway together with bow, sway as loads together with bow as geometry).

**Code source of an imperfection.** `resolveImperfectionSource({ source: 'IS800' | 'user', … })` refuses (`allowed: false`, with the blocking register items) while any item it needs is not 'verified'. IS 800:2007 gives the notional horizontal forces of 4.3.6 (0.5 % of the factored gravity load per level, verified) and **no explicit geometric sway imperfection and no member-bow value** for the frame analysis (checked: 4.3.6, 4.4.3, Annex B-2), so a geometric imperfection or a member bow is always a **user-defined** value and the result is labelled user-defined, never code-compliant. Whether a user-defined imperfection may be combined with the notional forces is not stated by the code and is not assumed: the settings refuse the combination that would count the same imperfection twice.

## 7. Mesh refinement and sensitivity (`results/mesh-sensitivity-study.txt`, Detail 2, CO1)

* Mesh (elements per column / beam): 1/1, 2/1, 4/2, 8/2 give max u_Y 24.695 / 24.706 / 24.714 / 24.714 mm, column M_z 1588.4 / 1588.4 / 1589.9 / 1589.9 kNcm: 4/2 equals 8/2 to < 0.002 %; the coarsest is within 0.1 %. P-δ convergence of a single column (Euler load 0.75 % / 0.05 % / 0.003 % for 2 / 4 / 8 elements) is in section 4.
* Load steps 1 / 4 / 8 and tighter tolerances (1e-9): identical results (< 1e-4 %); 1 step needs 6 iterations, 4 steps 20, 8 steps 40.
* Imperfection magnitude φ₀ × 0.9 / 1.1: max u_Y −8.5 % / +8.5 %, column M_z ∓1.0 %, base moment ∓4.9 %, brace N unchanged: sway is nearly proportional to φ₀, so the 1/200 setting must be confirmed per project.
* Torsional geometric term: no effect on this model. Von Kármán theory: +63 % sway (membrane coupling, not what code-based second-order elastic analysis assumes).
* α_cr of the factored gravity combination: **2.58** (1 element per member, Sturm count): a strongly second-order structure, which is why the sway is sensitive to small stiffness differences.

## 8. Convergence criterion, near instability, von Kármán vs Theory II

* **Moment residual normalisation (corrected).** The moment residual was normalised by max(‖applied moments‖, 1 N·mm). With no applied moments the floor of 1 N·mm has no physical scale and rounding exceeded it in a stiff model (portal with a beam 1e4 times stiffer than the columns: 759 iterations, never converged although the correction was 1e-14). It is now normalised by max(‖applied moments‖, 1 N·mm, ‖applied forces‖ × mean element length): moments and forces are judged by the same relative criterion; the criteria themselves (1e-6, 1e-6, 1e-6, 1e-10) are unchanged. See `docs/RSTAB_BENCHMARK.md` section 5.4.
* **Near instability.** A pinned column with a half-sine bow at P = 0.95 P_cr converges (16 iterations, 4 load steps) and its mid moment equals P e0/(1 − P/P_cr) to 0.06 % (amplification 20). Above P_cr (1.3 P_cr) Newton ends on the unstable branch and the status is `unstable` (negative pivot in the tangent), never `converged`. A failed step (iteration limit) keeps the last converged state apart from the failed trial. These are in `npm run test:frame`.
* **Von Kármán vs Theory II.** Von Kármán adds the axial shortening ½∫w′²dx of a bent member (membrane coupling); Theory II does not. Test: a roller-supported beam shortens by 17/70 (q/24EI)²L⁷ in von Kármán (0.007 %) and not at all in Theory II; the shortening is proportional to the square of the load; a restrained beam develops a membrane tension in von Kármán only. This explains the 12 mm edge drift of the benchmark (`docs/RSTAB_BENCHMARK.md` section 5.1). Theory II is the default and the code-type second-order elastic analysis.

## 9. IS 800 provisions, analysis settings, project workflow, calculation record

* **IS 800 analysis provisions** (`src/server/frame/codes/is800.ts`): notional forces (4.3.6, .1, .2, .3), the 1.4 amplification-factor decision (4.4.2), the deflection-method elastic critical load factor (B-3.2), the foundation shear without the notional force. Clause-level status: `docs/CODE_REGISTER.md`; explanation: `docs/IS800_ROUTE.md`.
* **IS 800 member design** (`src/server/frame/design/`): rectangular hollow sections, verified clause by clause (`docs/IS800_DESIGN.md`).
* **What the tests show** (`npm run test:codes`, 99 checks): every equation against hand values; the IS 800 deflection method gives 12EI/(PL²) on a rigid-beam portal while the rational analysis gives π²EI/(PL²) (ratio 12/π² = 1.216: the deflection method is an estimate and is labelled as such); the equivalent bow loads give the closed-form beam-column moment (q/k²)(sec(kL/2) − 1) to 1e-4 and differ from the half-sine geometry by the shape (parabola vs sine, 1.5 %); the foundation shear excludes the notional force; settings of the removed design routes are migrated, flagged and cannot select a design route.
* **Settings** (`src/shared/analysisSettings.ts`, project page `/frame/[id]`): order, theory, shear deformation, stiffness factors, sway and bow with source (IS 800 notional loads / user-defined) and representation (loads / geometry), what else acts in the combination, member design with the effective-length factors of 7.2 (required, no default). `validateSettings` refuses: out-of-range values, the notional force with wind / earthquake / temperature / overturning (IS 800 4.3.6.2), a "code" geometric imperfection (the code has none), geometry together with imperfection loads in the load cases (double counting), a member design without effective lengths or on a first-order analysis. There is **no design-standard selector**: IS 800:2007 is the only standard. Settings saved by an older version are migrated by `migrateSettings`: removed keys are dropped and named, an imperfection taken from a removed route is dropped, a user-defined one is kept and flagged, the member design is switched off, and the project must be reviewed and confirmed before anything is run.
* **Workflow and persistence** (`src/server/frameService.ts`, `frameStore*.ts`, `/api/frame/**`, `db/migrations/002_frame.sql`): a project stores its model, loads, combinations, design sections and settings; a run is made on the saved project, stores the settings actually used, the results, the design checks and the calculation record, and is identified by the model revision and a fingerprint of the analysis-relevant data: after the model changes, earlier runs are marked as belonging to an earlier model revision.
* **Calculation record** (`src/server/frame/record.ts`) and report (`src/server/frameReport.ts`): the 15 sections required for traceability (project and run identification, standard and edition, assumptions, formulation, load cases, sections and materials, supports and stiffness factors, imperfections with source and representation, results, IS 800 member checks, stability, RSTAB benchmark status, convergence evidence, register status, warnings), a result label, and the statement that a converged analysis is not proof of code compliance. The PDF is generated from the stored record only.

## 10. Not done yet

1. **IS 800 amplification factor** (4.4.2 / 4.4.3.3 with 9.3.2.2 and Table 18): interpretation open; first-order results are therefore not designed.
2. **Member design of open sections, angles and cold-formed sections** (IS 800 7.5, 8.2.2 open sections, 6.3; IS 801 was not supplied), and **connections** (Section 10): pending in the register.
3. Equivalent bow loads are implemented for a parabola; a comparison with RSTAB for bow imperfections is not possible with the supplied model (sway only).
4. The 1.7 % sway difference and the column lean-direction offset against RSTAB (`docs/RSTAB_BENCHMARK.md` section 5.2); the RSTAB result for IS 800 9.3.2.2 (341/351) is not reproduced exactly (`docs/RSTAB_BENCHMARK.md`).
5. Performance for web use: 11,500 DOF in ~3 s, 29,000 DOF in ~12 s, 38,600 DOF in ~30 s (the benchmark project runs in ~26 s).
