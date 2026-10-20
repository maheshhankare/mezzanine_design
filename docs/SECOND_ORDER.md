# Second-order frame analysis (new analysis mode)

Status: **solver core implemented and verified against closed-form solutions (50 checks), and validated against the RSTAB benchmark (first and second order, 2,924 members) within the 2 % target except 119 column M_y values at ≤ 2.5 %; see `docs/RSTAB_BENCHMARK.md`.** Not yet connected to the user interface. EN 1993 / IS 800 imperfection rules, National Annex selection and design checks are **not implemented**: the official code texts have not been supplied (`docs/CODE_REGISTER.md`). Nothing in the existing load-path model was changed; the new code lives in `src/server/frame/` and is not imported by the application yet.

## 1. Why a new solver

The existing engine has no frame-level finite-element model: members are analysed one at a time (a 2-DOF-per-node beam FE for bending and a Vlasov FE for lateral-torsional buckling), and the column, brace and sway effects come from a load-path model with notional forces and buckling-length factors. A full second-order analysis (P-Δ and P-δ) of a 3D frame needs a new beam-column frame solver, so it is a separate module.

## 2. Formulation

**Two second-order theories are implemented** (`SolveOptions.theory`):

* **`'II'` (default)**: linear strains, equilibrium on the deformed geometry; P-Δ and P-δ enter only through the geometric term N·G (EN 1993-1-1 5.2.2 "second-order elastic analysis"; RSTAB "second order analysis (P-Delta)"). Symmetric secant tangent K_b + (EA/L)aaᵀ + N·G, solved by Newton iterations.
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

## 4. Verification performed (`npm run test:frame`, 50 checks, all passed)

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

## 6. Not done yet

1. **Confirmations in RSTAB** of the inferred settings (shear deformation off, imperfection loads from CO1, stiffness factors = 1): `docs/RSTAB_BENCHMARK.md`, section 2.
2. **Code provisions.** Implementation of IS 800 (4.3.6, 4.3.6.1, 4.3.6.2, 4.4.3, 4.4.3.1, Annex B) and EN 1993-1-1 (5.2, 5.3) imperfections, conditions of use and design checks needs the **official texts**; the National Annex of the project must be chosen by you. Everything is tracked in `src/shared/codeRegister.ts` / `docs/CODE_REGISTER.md` with status *pending*.
3. Geometric (explicit) imperfections validated against RSTAB (the benchmark covers equivalent loads only), code-based generation, user interface for the analysis settings, iteration-log display, PDF sections.
4. Performance for web use: the benchmark model (11,500 DOF) solves in ~3 s with one element per member; 29,000 DOF (4/2 elements per column/beam) in ~12 s.
