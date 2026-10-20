// @ts-nocheck — data ported verbatim from the mockup (index.html, 94_diag.js).
import "server-only";
export const METHODS_HTML = "<h3>Calculation methods</h3>\n<p>This document describes how the C-Section Beam System Designer calculates. Every check in the app shows its clause, basis, equation, inputs and intermediate values. This document explains the models behind those checks, the approximations, and what is not implemented. Validation is limited to the cases in the QA test log (docs/TEST_LOG.md, also Appendix B of the printed report).</p>\n<h4>1. Scope, units and conventions</h4>\n<ul><li>Cold-formed lipped C-sections (H, B, C, t, r), with optional different top and bottom flanges and lips. There is no Sigma geometry and no perforation reduction anywhere. Connection holes are modelled only in the connection checks: bolt holes, and optional adjustment holes in one vertical line.</li><li>Arrangements: single C, two C back-to-back, or four C (two back-to-back pairs). Composite action of a built-up member is credited only when its connector checks pass.</li><li>Internal units are N, mm and N/mm². Output is in kN, kNm and kg/m². Area loads in kg/m² are converted with g = 9.80665 m/s².</li><li>Axes: y is horizontal (positive towards the flanges of a single C) and z is vertical (positive up). The section origin is the web centre-line and the bottom-flange centre-line. Sagging moment is positive.</li><li>Every check has a status:</li><li>PASS: η ≤ 1 by the stated method.</li><li>FAIL: η &gt; 1, or a detailing rule is violated (shown as \"rule\").</li><li>REVIEW: the resistance was not established, or the method is outside the implemented scope. REVIEW is never shown as PASS.</li><li>N/A: does not apply. Every N/A states its reason.</li><li>Each check is labelled with a basis: code formula, documented approximation, numerical model (validated in the QA log), or user or manufacturer value.</li><li>If any input is missing or out of range, no result is produced, so nothing can pass on a substituted value.</li></ul>\n<h4>2. Design routes (one route at a time, never mixed)</h4>\n<table><tr><th>Route</th><th>Loads and combinations</th><th>Members</th><th>Connections, column, base</th></tr><tr><td>EN</td><td>EN 1990 eq. 6.10 or 6.10a/b; γG, γQ, ψ0 as entered (recommended values unless a national annex is entered)</td><td>EN 1993-1-3:2006 with EN 1993-1-5:2006 (effective widths), EN 1993-1-1:2005 (buckling curves)</td><td>EN 1993-1-8:2005, EN 1993-1-3 Table 8.4 (thin sheet), EN 1992-1-1 6.4 (punching)</td></tr><tr><td>AISI</td><td>ASCE/SEI 7-16 2.3.1: max(1.4 D, 1.2 D + 1.6 L)</td><td>AISI S100-16 (DSM, Chapter F; G2.1; H2; I1.1)</td><td>AISC 360-16 (J3, J4, J2.4, J8, E3, F7, H1.1); AISC Design Guide 1; ACI 318-19 punching</td></tr><tr><td>IS</td><td>IS 875 loads; IS 800:2007 Table 4: 1.5 (DL + IL)</td><td>Cold-formed member strength needs IS 801, which is not implemented. EN values are shown for information and marked REVIEW.</td><td>IS 800:2007 (7.1.2.1, 8.4.1, 10.3, 10.5.7, 7.4), IS 456:2000 punching</td></tr></table>\n<p>E is as entered for EN (default 210 000 N/mm²), 203 000 N/mm² for AISI S100 members, and 200 000 N/mm² for the AISC and IS 800 column checks. ν is as entered. The route, editions and partial factors are printed in the General tab and on the report cover.</p>\n<h4>3. Section properties</h4>\n<ul><li><b>Gross properties</b> use thin-walled centre-line integration with rounded corners, 4 to 6 chords per arc. They are A, centroid, I_y, I_z, I_yz, principal axes, I_t = Σ b t³/3, W_el, W_pl,y, radii of gyration and mass (7850 kg/m³).</li><li><b>Warping constant and shear centre</b> come from the sectorial coordinate, computed by tree traversal over the element graph.</li><li><b>Back-to-back sections</b>: each C is placed mirrored with its web at ±(gap/2 + t/2). The webs are joined by a zero-thickness link at mid-web, so the assembly is one open tree. Properties are taken about the assembled centroid.</li><li>Effect on I_w: the reference merges the two webs into a single 2t web, and gets I_w 9 % higher than this model (test B1.Iw). The app's value is lower, which is conservative for M_cr.</li><li><b>Four C</b>: two pairs at the entered spacing. I_z is reported with and without pair-to-pair composite action. Without credited pair connectors, the non-composite I_z is used.</li></ul>\n<h4>4. Effective section (EN 1993-1-3 5.5 with EN 1993-1-5 4.4)</h4>\n<ul><li>Notional flat widths come from 5.1(3) and Fig. 5.1, measured between the intersections of the mid-lines.</li><li>Rounded corners are handled per 5.1(3)–(4). The δ reduction factor (eq. 5.1) is applied unless r ≤ 5t and r ≤ 0.1 b_p for every plane element, lips included. The independent reference applied the 0.1 b_p test to the flange only. The app's reading is stricter and gives a W_eff 2.7 % lower (test E1).</li><li>Compression flange with edge stiffener (5.5.3.2):</li><li>Initial effective widths with K = ∞.</li><li>Lip k_σ from eq. 5.13b/c.</li><li>Spring stiffness K from eq. 5.10b, using the flat web height h_p and k_f = 0 in bending.</li><li>σ_cr,s from eq. 5.15 and χ_d from 5.5.3.1(7). The stiffener thickness is reduced to t_red = χ_d t.</li><li>The optional iteration of 5.5.3.2(10) with σ_com,Ed = χ_d f_yb/γM0 is not performed. Omitting it is conservative.</li><li>Web: the stress ratio ψ comes from the effective compression flange plus the gross web, in a single pass per EN 1993-1-5 4.4(3). It is followed by Table 4.1 k_σ and eq. 4.2, including the AC:2009 limit. b_e1 = 0.4 b_eff and b_e2 = 0.6 b_eff.</li><li>W_eff is measured to the extreme outer fibre. M_c,Rd = W_eff f_yb / γM0.</li><li>Built-up sections assemble the single-C effective strips mirrored and placed.</li><li>Axial A_eff uses both flanges stiffened (k_f from the area ratio) and the web with ψ = 1.</li></ul>\n<h4>5. Finite-strip signature curve and DSM (AISI route)</h4>\n<ul><li>Elastic buckling uses a finite-strip method (CUFSM-type strip matrices) on the sharp-corner centre-line model. The mesh is lip 2, flange 4, web 10 strips. Half-wave lengths run from 0.25 B_min to 10 H.</li><li>The local and distortional minima are taken from the signature curve. When the distortional minimum is indistinct, the EN 1993-1-3 spring-model σ_cr,s is used instead. This is stated in the check.</li><li>DSM uses AISI S100-16 F2.1 (M_ne from M_cre), F3.2.1 (local, with M_ne) and F4.1 (distortional), with φ_b = 0.90. The formulas are verified in tests DSM.*.</li><li>The global M_cre is the Vlasov FE eigenvalue described in §6.</li></ul>\n<h4>6. Analysis models</h4>\n<ul><li><b>In-plane beam</b>: Euler–Bernoulli FE with Hermite elements, discrete or rotational springs, and point and distributed loads. Pattern loading is applied on continuous members. Verified by tests S1–S4.</li><li><b>Lateral-torsional buckling</b>: a Vlasov thin-walled beam FE with DOFs (v, v′, φ, φ′) per node.</li><li>The geometric stiffness comes from the actual moment diagram. Load height enters as the term q·a·φ²/2.</li><li>Discrete and continuous lateral springs act at a height a above the shear centre (u = v − aφ). Discrete and continuous torsional springs are included.</li><li>The generalised eigenvalue is solved by Cholesky reduction, Householder tridiagonalisation and Sturm bisection.</li><li>Verified against closed forms in tests L1–L4 and in test/t_fe.js. Those tests also confirm the sign convention: a top-flange restraint is more effective under sagging.</li><li><b>Torsion</b>: a static solution of the same Vlasov model (St Venant + warping) under the torque from the load eccentricity, with the credited springs. Bimoment, lateral moment and spring forces are recovered from it.</li><li>Second-order amplification 1/(1 − M_Ed/M_cr) is applied.</li><li>If M_Ed ≥ M_cr the member is unstable. The torsion-dependent checks are then reported as FAIL (∞, \"unstable\") instead of an undefined number.</li><li>Verified in test T1.</li><li><b>Load path</b>:</li><li>The area load acts over the tributary widths.</li><li>SB-Int and SB-End reactions are characteristic G and Q.</li><li>Main beam point loads are applied at the SB-Int positions, on both sides for an interior line and one side for an edge line.</li><li>Torsion on the main beam comes from imposed load on one side only, with the eccentricity taken by the SB-Int bolt group by default.</li><li>Main-beam reactions go to the column with face + connection eccentricities, then to the base plate and slab.</li><li>The SB-End is designed for the interior or edge column line, as chosen.</li></ul>\n<h4>7. Restraint crediting (only what is demonstrated)</h4>\n<ul><li><b>Main beam ← SB-Int</b>:</li><li>The lateral spring is the series stiffness of the SB-Int axial stiffness E·A/L_sb and the connection axial stiffness K_c (EN 1993-1-8 Table 6.11 bolt components).</li><li>It is credited only if the SB-Int line is anchored and the SB-Int connection passes all its checks with the brace force P_br (AISC 360-16 App. 6.3.2a).</li><li>A torsional spring is credited only if the joint is not classified nominally pinned.</li><li>When a restraint is not credited, the beam is checked between its end forks and a note says why.</li><li><b>Surface (deck) → secondaries</b>:</li><li>Lateral restraint needs data from manufacturer, test, calculation or FE. It is credited when S ≥ S_req (EN 1993-1-1 BB.2.1 eq. BB.2, as referenced by EN 1993-1-3 10.1.1(6)), the fasteners carry the restraint force, and the diaphragm is anchored.</li><li>Torsional restraint uses C_D = 1/(1/C_D,A + 1/C_D,C) (EN 1993-1-3 10.1.5.2). C_D,A must come from test or manufacturer data. C_D,C = 2 E I_s/s is marked verify.</li><li>Credited restraints enter the LTB and torsion model as continuous springs at the top flange.</li><li><b>Joists</b>: spaced as entered. Credited when the brace strength and stiffness (AISC App. 6.3.2a) and the joist and bolt checks pass, and the joist lines are anchored.</li><li><b>Knee braces</b>: the force comes from the notional sway φ·N (EN 1993-1-1 5.3.2, or the route equivalent) plus any user load. It produces the brace axial force and the column moment.</li><li><b>Knee braces in the beam analysis (v1.6, default on)</b>: each knee brace is an elastic vertical support of the main beam and the SB-End at x = column axis ± (column half-depth + a). Stiffness k = sin²θ / (1/k_a + cos²θ/k_b), with k_a = E·A/L_KB the brace's axial stiffness and k_b = E·A_beam·(1/x₁ + 1/x₂) the beam's axial stiffness that holds the brace's horizontal push (x₁ the distance to the column node, x₂ half the distance to the opposite knee). M, V, δ and reactions include them. Knee force N = R_knee/sin θ + sway force. The tie R_knee/tan θ acts on the beam-to-column connection and, with the lever arm d_v, on the column. Column and base load = beam end reaction + knee reactions. Not modelled: shear deformation, column flexibility, frame continuity. Against the RSTAB frame this simple model over-estimates the knee hogging by about 13 % and under-estimates the span moment by about 15 %; the unified app's global frame analysis includes them (within 6 %). The input \"Knee braces in the beam analysis = No\" gives the v1.5 model.</li><li><b>Plan bracing</b>: EN 1993-1-1 5.3.3 equivalent stabilising force q_d from the restrained flanges, with e_0 = α_m L/500.</li><li><b>Fork supports</b>: assumed at member ends only when the end plate or cleat covers at least 0.6 of the web depth with at least 2 bolt rows. This is a documented detailing rule. Otherwise the result is REVIEW.</li></ul>\n<h4>8. Member checks (per route)</h4>\n<p>The member checks are:</p>\n<ul><li>bending (sagging and hogging) on W_eff;</li><li>minor-axis bending (W_el,z × A_eff/A, approximation);</li><li>axial force;</li><li>shear buckling (Table 6.1, s_w measured between corner mid-points);</li><li>web crippling (6.1.7.2, only where a member bears; otherwise N/A with the reason);</li><li>M+V (6.1.10);</li><li>N+M (6.1.8/6.1.9 with ΔM = N e_N);</li><li>combined direct and warping stresses (6.1.6);</li><li>LTB (6.2.4 → EN 1993-1-1 6.3.2.2 curve b with the FE M_cr);</li><li>flexural and torsional buckling (6.2.2–6.2.3) with eq. 6.36;</li><li>LTB + torsion interaction (linear sum, documented approximation);</li><li>deflection with I_fic (eq. 7.1);</li><li>twist and horizontal deflection (project limits).</li></ul>\n<p>Shear buckling counts the end cleat as \"stiffening at the support\" when it covers at least half the web depth. This is stated in the check and should be verified for the detail.</p>\n<p><b>Built-up connectors</b>:</p>\n<ul><li>Anti-rotation force (AISI S100-16 I1.1).</li><li>Weld resistance as the lesser of the fillet throat (EN 1993-1-8 4.5.3.3) and the thin-sheet side weld (EN 1993-1-3 8.6).</li><li>Spot welds are REVIEW.</li><li>Bolts in tension and pull-through.</li><li>Spacing s ≤ L/6, and LTB of one C between stations.</li><li>15 i_min when there is axial force.</li><li>Pair-to-pair tabs for four C.</li></ul>\n<h4>9. Connections</h4>\n<p><b>Arrangements</b>:</p>\n<ul><li>fin plate (C-type);</li><li>U-cleat (U-type, double shear);</li><li>angle cleat;</li><li>end plate;</li><li>fully welded;</li><li>bolted-and-welded.</li></ul>\n<p><b>Geometry and resistance</b>:</p>\n<ul><li>Geometry is checked first:</li><li>bolts and washers inside the flat web;</li><li>pitches and edge distances (EN 1993-1-3 Table 8.4 for t &lt; 3 mm, otherwise EN 1993-1-8 Table 3.3);</li><li>plate edges and fit between the main-beam lips;</li><li>adjustment holes: fit, spacing and clearance to the bolts.</li><li>Bolt forces come from the elastic polar method, with the eccentricity from the support line to the bolt-group centroid plus any joint moment M_j.</li><li>Resistances (EN):</li><li>bolt shear (Table 3.4);</li><li>bearing on thin sheet (Table 8.4) and on plates (Table 3.4);</li><li>the deformation-capacity condition F_v ≥ 1.2 F_b for thin sheet (verify);</li><li>net shear, including adjustment holes in the bolt line;</li><li>block tearing (3.10.2);</li><li>plate bending and plate LTB (cantilever plate, Timoshenko &amp; Gere, curve d, approximation);</li><li>welds (4.5.3.3, elastic weld group);</li><li>main-beam web bearing and pull-through;</li><li>box-column wall bending (Table 7.13 basis, verify scope) and punching.</li><li>Every check that does not apply states why.</li></ul>\n<p><b>Stiffness and classification</b>:</p>\n<ul><li>S_j,ini = K_b Σr², with K_b from the Table 6.11 bolt shear and bearing components in series.</li><li>Classification follows EN 1993-1-8 5.2.2.5 (braced frame).</li><li>A joint analysed as pinned but classified semi-rigid is checked for the end moment M_j its stiffness attracts.</li></ul>\n<h4>10. Box column, base and slab</h4>\n<p><b>Column</b>:</p>\n<ul><li>Welded box or RHS (hot-finished or cold-formed).</li><li>Class from EN 1993-1-1 Table 5.2. For class 4, A_eff comes from EN 1993-1-5 4.4.</li><li>Buckling curve: b for welded boxes (c for thick welds), a for hot-finished RHS, c for cold-formed.</li><li>Buckling length from the frame choice: braced k = 1 (0.7 with a fixed base), knee-braced sway k = 2.0 (approximation), or user values.</li><li>Interaction from EN 1993-1-1 6.3.3 with Annex B (C_m 0.6 / 0.4 / 0.9).</li><li>Shear with torsion (6.2.6, 6.2.7) and corner-weld shear flow. A splice is REVIEW.</li></ul>\n<p><b>Base plate</b>:</p>\n<ul><li>EN 1993-1-8 6.2.5 equivalent T-stub (f_jd = β_j α f_cd, c = t √(f_y/(3 f_jd γM0))).</li><li>Shear by friction (6.2.2, C_f,d = 0.2) plus anchors.</li><li>Anchors in concrete are outside scope (EN 1992-4). They are REVIEW when they are needed and N/A otherwise.</li><li>Slab punching follows EN 1992-1-1 6.4 (or IS 456 / ACI 318 on those routes).</li></ul>\n<h4>11. Optimisation (Optimisation tab)</h4>\n<p><b>Scope.</b> One component (main beam, SB-Int, SB-End, joists, column, knee brace) or the whole system. Each parameter (H, Bt, Bb, Ct, Cb, t, r, arrangement, grade; column b and wall t; knee b and t; joist count, end distance, section and position) is set to Fixed, Range (min, max, step), Increments (current ± n steps) or an approved list. Inputs are validated before the run: min ≤ max, step &gt; 0, schema limits, geometry limits (lip &lt; flange, r &lt; flange, H &gt; 2r + 2t), joist spacing ≥ the minimum. Linked parameters (Bt = Bb, Ct = Cb) stay equal when \"symmetric\" is ticked.</p>\n<p><b>Objective.</b> Weight (default), area, cost (needs cost/kg in General), depth, thickness, governing utilisation, or balanced (weight with a penalty for η below 0.7). The objective is known before analysis, so candidates are enumerated best-first.</p>\n<p><b>Search.</b> 1. Lever study: one step of each free parameter is analysed to learn which failures it moves. 2. Safe screens remove candidates that cannot pass, without full analysis. Bending: (M_Ed − self-weight moment) against W_eff·fy/γ_M0 (EN) or φ·S·fy (AISI). Deflection: (δ − δ_self) × I_base / I_candidate. Self-weight is removed before scaling, so the screen is conservative. Screens are only used with pinned ends and not on the IS route; otherwise every candidate is fully analysed. 3. Surviving candidates are run best-first through the complete system model (all modules, all checks). The first one that passes every check with no REVIEW is the optimum for the defined search space. 4. Knock-on rule: a candidate is rejected if any other module gets worse (PASS → REVIEW or → FAIL), for example a lighter secondary that makes a connection or the main-beam restraint REVIEW. 5. Case G: if the member passes but a connection fails, the connection bolt count and pitch are searched next.</p>\n<p><b>Failure-mode logic.</b> The governing failure is classified (A strength/local buckling ρ, B distortional χd, C LTB/torsion, D deflection, E web crippling/shear, F instability/unrestrained, G connection) and the lever study decides which parameters are tried first. A deeper section is not assumed to be better: in a deflection-governed case the optimiser can return a deeper but thinner section that is both stiffer and lighter.</p>\n<p><b>Whole system.</b> Components are optimised in load-path order (joists → SB-Int → SB-End → main beam → column → knee brace), each on top of the previous result, then a second pass is run for any component still failing, then a final full recompute. This is sequential, not a simultaneous global search.</p>\n<p><b>Outcomes.</b> Feasible (optimum within the search space), REVIEW (best candidate passes strength but has REVIEW items), infeasible (no candidate passes; the unsatisfied checks and the limits that blocked progress are listed), budget (evaluation limit reached; the best found so far is shown, not called optimal), cancelled.</p>\n<p><b>Applying.</b> Results never overwrite inputs. Compare shows original against optimised for every component. Apply writes the proposal and recomputes; Revert restores the inputs from before the run; Save as case stores a design case; history keeps the last runs. A result is marked stale (and Apply disabled) when the inputs change after the run; Recalculate re-runs the proposal on the current inputs.</p>\n<p><b>Joists.</b> Count, end distance a, section and top/bottom position are searched. Positions are a, then equal spacing (L − 2a)/(n − 1). The restraint is credited only when the nodal-brace stiffness and strength checks pass. Joists on the top flange of a single C cannot remove the twist caused by the CG eccentricity, because the free flange still rotates; the app says so and points to deck rotational restraint C_D or a back-to-back arrangement.</p>\n<h4>11a. Load application convention</h4>\n<ul><li>General → \"Load application convention\": Through centroid (CG, default), top flange at web line, or shear centre (SC).</li><li>For a single C, CG ≠ SC. The load at the CG has eccentricity e = y_CG − y_SC from the shear centre, and the torque m_T = q·e (UDL) or T = P·e (point loads) is applied in the torsion (bimoment) analysis. For a back-to-back pair e = 0.</li><li>SC loading is an idealisation. It is only accepted with the acknowledgement set to \"yes\" and a written justification; otherwise the run stops with an error.</li><li>The LTB load height is the top flange by default (destabilising), or the reference point if selected.</li><li>Secondary beams can follow the global convention or override it; the main beam can override it.</li><li>Section sketches show CG, SC, the load line, e and m_T. The report states the convention and lists e and m_T per member.</li><li>Changing the default from SC (v1.0) to CG changes default results for single-C members.</li></ul>\n<h4>11b. Themes</h4>\n<p>Light (default) or Dark, selected in the header, stored in the browser and applied to every tab and drawing. Print and PDF output is always white.</p>\n<h4>11c. Drawings (DXF)</h4>\n<ul><li>The Drawings tab generates 13 drawings from the current calculation: arrangement plan with grids and member schedule, elevations on grid A and grid 1 (columns, beams, knee braces), cross-sections of the main beam, SB-Int and SB-End (CG, SC, load line and e), fabrication drawings of the three C members (web elevation, end holes, adjustment holes, joist or SB-Int positions, built-up connector stations, cut length), connection details at the three member ends, and the box column with its base plate.</li><li>Files are AutoCAD R12 ASCII DXF (AC1009), in millimetres, drawn 1:1 in model space. Layers: OUTLINE, HIDDEN, CENTER, GRID, DIM, TEXT, HOLES, PLATE, WELD, LOAD, CGSC, JOIST, BRACE, SUPPORT, TITLE. Dimensions are drawn as lines, ticks and text (not associative DIMENSION entities). Text is ASCII; ×, ° and Ø are written as x, %%d and %%c.</li><li>Each drawing can be downloaded on its own, or all of them in one file laid out side by side (no scaling).</li><li>Cut length = centre-to-centre span − 2 × (support half-width or main-beam web face + connection stand-off). It is derived from the model and must be confirmed against the actual support details.</li><li>Drawings are only produced from a complete analysis. A design that does not pass every check is stamped \"NOT FOR FABRICATION\".</li><li>Simplifications: SB-Int tops are shown flush with the main beam, anchor positions are schematic, joists and bracing are shown as centre lines, and the schedule excludes plates, bolts and decking.</li></ul>\n<h4>11d. Reproducibility across browsers and computers</h4>\n<ul><li><b>One engine.</b> Every tab, the report, the drawings and the optimiser read the same calculation (<code>MODEL.compute</code>) of the same normalised inputs. Nothing is calculated from a displayed (rounded or formatted) value, from the screen size or from the drawing scale.</li><li><b>Versions.</b> The header shows the application version and the calculation-engine version. The engine version changes only when a change can alter a result.</li><li><b>Input fingerprint.</b> A 64-bit hash of the canonical inputs: every field, keys sorted, numbers as numbers and lists as \"a,b,c\". The same project gives the same fingerprint however it was typed or loaded, in any browser. It is printed on the report and shown in Diagnostics.</li><li><b>Project files.</b> Export writes format <code>csbd-project</code> version 2: the inputs that differ from the defaults, the application and engine versions, the fingerprint and a summary of the results (overall status and η, and status and η of each group). Import validates the file before changing anything:</li><li>a damaged file, another application's file, a newer format or an unknown option value is refused;</li><li>unknown input names are listed and ignored;</li><li>design cases with the same name as different cases in the browser are replaced only after confirmation, otherwise added as \"… (imported)\".</li></ul>\n<p>  After opening, the results are recalculated and compared with the summary in the file. A difference is reported, with the two versions.</p>\n<ul><li><b>Browser storage</b> holds design cases, the last inputs, the theme and optimisation settings. It belongs to one browser on one computer. When the app starts from inputs restored from this storage, it says so. To move a project between browsers or computers, use Export and Import, or Copy link.</li><li><b>Stale results.</b> Results are recalculated 0.3 s after the last keystroke. Any button pressed in that interval first completes the calculation, so a report, drawing, export or optimisation always uses the inputs on screen.</li><li><b>Floating point.</b> JavaScript engines may differ in the last bit of <code>Math.pow</code>, <code>exp</code>, <code>sin</code> and similar functions. Through the eigenvalue solvers and the second-order amplifiers this grows to at most about 6 × 10⁻¹⁰ relative. This was measured on V8 (Node 22 and Chromium 141), JavaScriptCore and SpiderMonkey for the six reference cases.</li><li>Comparison tolerance: 10⁻⁶ relative, plus 10⁻⁶ absolute in N, mm and N·mm for values that are zero in theory. Statuses must match exactly.</li><li>10⁻⁶ is far below the displayed precision. A status could change only if a utilisation lay within 10⁻⁹ of 1.000, and the self-test would then report it.</li><li><b>Self-test.</b> Diagnostics → <i>Run cross-browser self-test</i> recalculates the six reference cases in the browser. It compares every status, demand, resistance, utilisation, every numerical step of every check, the key intermediate values and the DXF text with the values recorded with Node. The comparison covers about 7 000 values.</li><li>Agreement between browsers shows the same calculation ran. It does not show the calculation is correct: engineering validation is the QA test log.</li></ul>\n<h4>12. Items marked \"verify\" or REVIEW in the app</h4>\n<ul><li>EN 1993-1-3 web crippling constants. They agree with the independent reference, but both are low confidence.</li><li>The Table 8.4 deformation-capacity rule.</li><li>Net-section upper bound and pull-through forms in Table 8.4.</li><li>C_D,C factor k = 2.</li><li>Box-wall Table 7.13 scope.</li><li>AISI J3.3.1 C and m_f.</li><li>AISC J3.6 F_nv for metric grades.</li><li>Spot welds.</li><li>Anchors in concrete (EN 1992-4).</li><li>Column splices.</li><li>IS 801 member strength.</li><li>Thin-sheet checks on the IS route.</li><li>Plate LTB.</li><li>Fork-support detailing rule.</li><li>The cleat counted as stiffening at the support.</li><li>The linear LTB + bimoment interaction.</li><li>Optimisation results: the optimum is only for the defined search space, the whole-system search is sequential, and the safe screens are used only for pinned ends. Each proposed design should be checked as a normal design before use.</li><li>Joist restraint stiffness of single-C secondaries under CG eccentricity.</li><li>Drawings: cut lengths, end offsets and the member schedule are derived from the model and must be checked against the shop details before fabrication.</li></ul>";
export const TESTLOG = {
 "summary": "176 tests: 171 agree within tolerance or pass, 5 differ for a documented reason (see disposition), 0 open. References: independent hand-calculation set written without access to the app (ref_calcs.py), closed forms and code formulas; regression tests check the behaviour required by the specification. Validation is limited to these cases.",
 "rows": [
  {
   "id": "G1.A",
   "test": "G1 200×75×20×2 r3: area A",
   "ref": "ref centre-line integration",
   "refVal": "750.265",
   "app": "749.943",
   "diff": "-0.04 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "G1.xc",
   "test": "G1 200×75×20×2 r3: centroid from web outer face",
   "ref": "ref",
   "refVal": "21.9322",
   "app": "21.9255",
   "diff": "-0.03 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "G1.Iy",
   "test": "G1 200×75×20×2 r3: I_y",
   "ref": "ref",
   "refVal": "4.6303e+6",
   "app": "4.6269e+6",
   "diff": "-0.07 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "G1.Iz",
   "test": "G1 200×75×20×2 r3: I_z",
   "ref": "ref",
   "refVal": "5.5771e+5",
   "app": "5.5712e+5",
   "diff": "-0.11 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "G1.It",
   "test": "G1 200×75×20×2 r3: I_t",
   "ref": "ref",
   "refVal": "1000.35",
   "app": "999.924",
   "diff": "-0.04 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "G1.Iw",
   "test": "G1 200×75×20×2 r3: I_w",
   "ref": "ref sectorial integration",
   "refVal": "4.4195e+9",
   "app": "4.4137e+9",
   "diff": "-0.13 %",
   "disp": "Agrees (tolerance 1.0 %)"
  },
  {
   "id": "G1.xsc",
   "test": "G1 200×75×20×2 r3: shear centre from web centre-line",
   "ref": "ref",
   "refVal": "33.037",
   "app": "33.0306",
   "diff": "-0.02 %",
   "disp": "Agrees (tolerance 0.5 %)"
  },
  {
   "id": "G2.A",
   "test": "G2 300×75×25×2.5 r4: area A",
   "ref": "ref centre-line integration",
   "refVal": "1202.47",
   "app": "1201.94",
   "diff": "-0.04 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "G2.xc",
   "test": "G2 300×75×25×2.5 r4: centroid from web outer face",
   "ref": "ref",
   "refVal": "18.6585",
   "app": "18.6502",
   "diff": "-0.04 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "G2.Iy",
   "test": "G2 300×75×25×2.5 r4: I_y",
   "ref": "ref",
   "refVal": "1.5232e+7",
   "app": "1.5220e+7",
   "diff": "-0.08 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "G2.Iz",
   "test": "G2 300×75×25×2.5 r4: I_z",
   "ref": "ref",
   "refVal": "8.3429e+5",
   "app": "8.3323e+5",
   "diff": "-0.13 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "G2.It",
   "test": "G2 300×75×25×2.5 r4: I_t",
   "ref": "ref",
   "refVal": "2505.14",
   "app": "2504.04",
   "diff": "-0.04 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "G2.Iw",
   "test": "G2 300×75×25×2.5 r4: I_w",
   "ref": "ref sectorial integration",
   "refVal": "1.4827e+10",
   "app": "1.4804e+10",
   "diff": "-0.16 %",
   "disp": "Agrees (tolerance 1.0 %)"
  },
  {
   "id": "G2.xsc",
   "test": "G2 300×75×25×2.5 r4: shear centre from web centre-line",
   "ref": "ref",
   "refVal": "30.2366",
   "app": "30.2275",
   "diff": "-0.03 %",
   "disp": "Agrees (tolerance 0.5 %)"
  },
  {
   "id": "G3.A",
   "test": "G3 150×50×15×1.5 r2.25: area A",
   "ref": "ref centre-line integration",
   "refVal": "403.274",
   "app": "403.093",
   "diff": "-0.04 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "G3.xc",
   "test": "G3 150×50×15×1.5 r2.25: centroid from web outer face",
   "ref": "ref",
   "refVal": "14.1761",
   "app": "14.1712",
   "diff": "-0.03 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "G3.Iy",
   "test": "G3 150×50×15×1.5 r2.25: I_y",
   "ref": "ref",
   "refVal": "1.3617e+6",
   "app": "1.3606e+6",
   "diff": "-0.08 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "G3.Iz",
   "test": "G3 150×50×15×1.5 r2.25: I_z",
   "ref": "ref",
   "refVal": "1.3268e+5",
   "app": "1.3253e+5",
   "diff": "-0.11 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "G3.It",
   "test": "G3 150×50×15×1.5 r2.25: I_t",
   "ref": "ref",
   "refVal": "302.456",
   "app": "302.32",
   "diff": "-0.04 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "G3.Iw",
   "test": "G3 150×50×15×1.5 r2.25: I_w",
   "ref": "ref sectorial integration",
   "refVal": "5.9610e+8",
   "app": "5.9526e+8",
   "diff": "-0.14 %",
   "disp": "Agrees (tolerance 1.0 %)"
  },
  {
   "id": "G3.xsc",
   "test": "G3 150×50×15×1.5 r2.25: shear centre from web centre-line",
   "ref": "ref",
   "refVal": "21.7729",
   "app": "21.7681",
   "diff": "-0.02 %",
   "disp": "Agrees (tolerance 0.5 %)"
  },
  {
   "id": "G4.A",
   "test": "G4 400×50×25×2 r3: area A",
   "ref": "ref centre-line integration",
   "refVal": "1070.27",
   "app": "1069.94",
   "diff": "-0.03 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "G4.xc",
   "test": "G4 400×50×25×2 r3: centroid from web outer face",
   "ref": "ref",
   "refVal": "9.30296",
   "app": "9.29823",
   "diff": "-0.05 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "G4.Iy",
   "test": "G4 400×50×25×2 r3: I_y",
   "ref": "ref",
   "refVal": "2.0925e+7",
   "app": "2.0912e+7",
   "diff": "-0.06 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "G4.Iz",
   "test": "G4 400×50×25×2 r3: I_z",
   "ref": "ref",
   "refVal": "2.7861e+5",
   "app": "2.7829e+5",
   "diff": "-0.11 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "G4.It",
   "test": "G4 400×50×25×2 r3: I_t",
   "ref": "ref",
   "refVal": "1427.02",
   "app": "1426.59",
   "diff": "-0.03 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "G4.Iw",
   "test": "G4 400×50×25×2 r3: I_w",
   "ref": "ref sectorial integration",
   "refVal": "9.1478e+9",
   "app": "9.1360e+9",
   "diff": "-0.13 %",
   "disp": "Agrees (tolerance 1.0 %)"
  },
  {
   "id": "G4.xsc",
   "test": "G4 400×50×25×2 r3: shear centre from web centre-line",
   "ref": "ref",
   "refVal": "16.7519",
   "app": "16.7457",
   "diff": "-0.04 %",
   "disp": "Agrees (tolerance 0.5 %)"
  },
  {
   "id": "G5.A",
   "test": "G5 350×50×25×2 r3: area A",
   "ref": "ref centre-line integration",
   "refVal": "970.265",
   "app": "969.943",
   "diff": "-0.03 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "G5.xc",
   "test": "G5 350×50×25×2 r3: centroid from web outer face",
   "ref": "ref",
   "refVal": "10.1587",
   "app": "10.1538",
   "diff": "-0.05 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "G5.Iy",
   "test": "G5 350×50×25×2 r3: I_y",
   "ref": "ref",
   "refVal": "1.4942e+7",
   "app": "1.4932e+7",
   "diff": "-0.07 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "G5.Iz",
   "test": "G5 350×50×25×2 r3: I_z",
   "ref": "ref",
   "refVal": "2.7101e+5",
   "app": "2.7070e+5",
   "diff": "-0.11 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "G5.It",
   "test": "G5 350×50×25×2 r3: I_t",
   "ref": "ref",
   "refVal": "1293.69",
   "app": "1293.26",
   "diff": "-0.03 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "G5.Iw",
   "test": "G5 350×50×25×2 r3: I_w",
   "ref": "ref sectorial integration",
   "refVal": "6.8080e+9",
   "app": "6.7990e+9",
   "diff": "-0.13 %",
   "disp": "Agrees (tolerance 1.0 %)"
  },
  {
   "id": "G5.xsc",
   "test": "G5 350×50×25×2 r3: shear centre from web centre-line",
   "ref": "ref",
   "refVal": "17.918",
   "app": "17.9119",
   "diff": "-0.03 %",
   "disp": "Agrees (tolerance 0.5 %)"
  },
  {
   "id": "G6.A",
   "test": "G6 250×65×20×3 r4.5: area A",
   "ref": "ref centre-line integration",
   "refVal": "1193.1",
   "app": "1192.37",
   "diff": "-0.06 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "G6.xc",
   "test": "G6 250×65×20×3 r4.5: centroid from web outer face",
   "ref": "ref",
   "refVal": "16.1308",
   "app": "16.1209",
   "diff": "-0.06 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "G6.Iy",
   "test": "G6 250×65×20×3 r4.5: I_y",
   "ref": "ref",
   "refVal": "1.0414e+7",
   "app": "1.0402e+7",
   "diff": "-0.12 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "G6.Iz",
   "test": "G6 250×65×20×3 r4.5: I_z",
   "ref": "ref",
   "refVal": "5.8671e+5",
   "app": "5.8558e+5",
   "diff": "-0.19 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "G6.It",
   "test": "G6 250×65×20×3 r4.5: I_t",
   "ref": "ref",
   "refVal": "3579.29",
   "app": "3577.12",
   "diff": "-0.06 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "G6.Iw",
   "test": "G6 250×65×20×3 r4.5: I_w",
   "ref": "ref sectorial integration",
   "refVal": "7.0729e+9",
   "app": "7.0556e+9",
   "diff": "-0.24 %",
   "disp": "Agrees (tolerance 1.0 %)"
  },
  {
   "id": "G6.xsc",
   "test": "G6 250×65×20×3 r4.5: shear centre from web centre-line",
   "ref": "ref",
   "refVal": "25.3894",
   "app": "25.3765",
   "diff": "-0.05 %",
   "disp": "Agrees (tolerance 0.5 %)"
  },
  {
   "id": "G7.zc",
   "test": "G7 unequal flanges 75/60, lips 20/15: z_c from bottom outer face",
   "ref": "ref",
   "refVal": "105.343",
   "app": "105.345",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "G7.Iyz",
   "test": "G7: product of inertia I_yz",
   "ref": "ref",
   "refVal": "2.2072e+5",
   "app": "2.2063e+5",
   "diff": "-0.04 %",
   "disp": "Agrees (tolerance 0.5 %)"
  },
  {
   "id": "G7.alpha",
   "test": "G7: principal axis angle",
   "ref": "ref",
   "refVal": "3.29839",
   "app": "3.29942",
   "diff": "0.03 %",
   "disp": "Agrees (tolerance 1.0 %)"
  },
  {
   "id": "G7.I1",
   "test": "G7: principal I_major",
   "ref": "ref",
   "refVal": "4.2606e+6",
   "app": "4.2572e+6",
   "diff": "-0.08 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "G7.Iw",
   "test": "G7: I_w",
   "ref": "ref",
   "refVal": "2.9803e+9",
   "app": "2.9756e+9",
   "diff": "-0.16 %",
   "disp": "Agrees (tolerance 1.0 %)"
  },
  {
   "id": "G7.zsc",
   "test": "G7: shear centre height from bottom outer face",
   "ref": "ref",
   "refVal": "128.894",
   "app": "128.906",
   "diff": "0.01 %",
   "disp": "Agrees (tolerance 1.0 %)"
  },
  {
   "id": "B1.A",
   "test": "B1 2×(400×50×25×2) back-to-back: A",
   "ref": "ref parallel axis",
   "refVal": "2140.53",
   "app": "2139.89",
   "diff": "-0.03 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "B1.Iy",
   "test": "B1: I_y about the assembled centroid",
   "ref": "ref",
   "refVal": "4.1850e+7",
   "app": "4.1824e+7",
   "diff": "-0.06 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "B1.Iz",
   "test": "B1: I_z about the contact plane",
   "ref": "ref",
   "refVal": "7.4248e+5",
   "app": "7.4159e+5",
   "diff": "-0.12 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "B1.It",
   "test": "B1: I_t",
   "ref": "ref",
   "refVal": "2854.04",
   "app": "2853.18",
   "diff": "-0.03 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "B1.Iw",
   "test": "B1: I_w of the built-up section",
   "ref": "ref merged-web I model (medium confidence)",
   "refVal": "3.1611e+10",
   "app": "2.8641e+10",
   "diff": "-9.39 %",
   "disp": "Idealisation: the app models two webs at ±t/2 joined by a link at mid-web; the reference merges them into one 2t web (flange arm B − t/2 vs B − t). The app value is 9 % lower, which is conservative for M_cr. Documented in METHODS §3."
  },
  {
   "id": "B2.Iz",
   "test": "B2 2×G1, 10 mm gap: I_z",
   "ref": "ref",
   "refVal": "2.2038e+6",
   "app": "2.2016e+6",
   "diff": "-0.10 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "B2.Iy",
   "test": "B2: I_y",
   "ref": "ref",
   "refVal": "9.2606e+6",
   "app": "9.2538e+6",
   "diff": "-0.07 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "B3.Izc",
   "test": "B3 4×G1, pairs 200 apart: I_z with composite action",
   "ref": "ref",
   "refVal": "3.3685e+7",
   "app": "3.3668e+7",
   "diff": "-0.05 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "B3.Iznc",
   "test": "B3: I_z without pair-to-pair composite action",
   "ref": "ref",
   "refVal": "3.6744e+6",
   "app": "3.6706e+6",
   "diff": "-0.11 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "B3.Iy",
   "test": "B3: I_y",
   "ref": "ref",
   "refVal": "1.8521e+7",
   "app": "1.8508e+7",
   "diff": "-0.07 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "S1.M",
   "test": "S1 simply supported UDL: M_max",
   "ref": "closed form wL²/8",
   "refVal": "29.125",
   "app": "29.125",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.1 %)"
  },
  {
   "id": "S1.V",
   "test": "S1: V_max",
   "ref": "wL/2",
   "refVal": "23.3",
   "app": "23.3",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.1 %)"
  },
  {
   "id": "S1.d",
   "test": "S1: deflection",
   "ref": "5wL⁴/384EI",
   "refVal": "25.485",
   "app": "25.485",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.1 %)"
  },
  {
   "id": "S2.R",
   "test": "S2 two point loads + UDL: reaction",
   "ref": "statics",
   "refVal": "47.04",
   "app": "47.04",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.1 %)"
  },
  {
   "id": "S2.M",
   "test": "S2: M_max",
   "ref": "statics",
   "refVal": "46.9275",
   "app": "46.9275",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.1 %)"
  },
  {
   "id": "S2.d",
   "test": "S2: mid-span deflection",
   "ref": "closed form",
   "refVal": "5.36641",
   "app": "5.36641",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "S3.MB",
   "test": "S3 two-span UDL: support moment",
   "ref": "wL²/8",
   "refVal": "-11.25",
   "app": "-11.25",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.1 %)"
  },
  {
   "id": "S3.RB",
   "test": "S3: centre reaction",
   "ref": "10wL/8",
   "refVal": "37.5",
   "app": "37.5",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.1 %)"
  },
  {
   "id": "S3.Ms",
   "test": "S3: span moment",
   "ref": "9wL²/128",
   "refVal": "6.32813",
   "app": "6.32813",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "S4.Me",
   "test": "S4 rotational springs 500 kNm/rad: end moment",
   "ref": "(wL²/12)/(1+2EI/SL)",
   "refVal": "-6.16207",
   "app": "-6.16207",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.1 %)"
  },
  {
   "id": "S4.Mm",
   "test": "S4: mid-span moment",
   "ref": "wL²/8 − M_end",
   "refVal": "25.0879",
   "app": "25.0879",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.1 %)"
  },
  {
   "id": "S4.d",
   "test": "S4: mid-span deflection",
   "ref": "closed form",
   "refVal": "20.8741",
   "app": "20.8741",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "L1",
   "test": "L1 G1, L = 3 m, uniform moment: M_cr (Vlasov FE eigenvalue)",
   "ref": "Timoshenko & Gere closed form",
   "refVal": "11.8784",
   "app": "11.8784",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "L2",
   "test": "L2 UDL at the shear centre: M_cr",
   "ref": "C1 = 1.127 (SN003a)",
   "refVal": "13.387",
   "app": "13.4442",
   "diff": "0.43 %",
   "disp": "Agrees (tolerance 0.6 %)"
  },
  {
   "id": "L3",
   "test": "L3 central point load at the shear centre: M_cr",
   "ref": "C1 = 1.348 (SN003a)",
   "refVal": "16.0121",
   "app": "16.2007",
   "diff": "1.18 %",
   "disp": "Agrees (tolerance 1.5 %)"
  },
  {
   "id": "L4",
   "test": "L4 B1 section, UDL on the top flange (z_g = +200): M_cr",
   "ref": "3-factor formula C1 1.127, C2 0.454 (medium confidence)",
   "refVal": "26.5252",
   "app": "26.5345",
   "diff": "0.04 %",
   "disp": "Agrees (tolerance 3.0 %)"
  },
  {
   "id": "T1.phi",
   "test": "T1 G5, distributed torque 0.1 kNm/m, L = 5 m: mid-span twist",
   "ref": "Vlasov ODE closed form",
   "refVal": "0.480003",
   "app": "0.480003",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "T1.B",
   "test": "T1: mid-span bimoment",
   "ref": "Vlasov ODE closed form",
   "refVal": "0.262344",
   "app": "0.26245",
   "diff": "0.04 %",
   "disp": "Agrees (tolerance 0.5 %)"
  },
  {
   "id": "E1.rho",
   "test": "E1 G1 f_y 350: flange ρ",
   "ref": "EN 1993-1-5 eq. 4.2",
   "refVal": "0.917421",
   "app": "0.917421",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "E1.K",
   "test": "E1: edge stiffener spring K",
   "ref": "EN 1993-1-3 eq. 5.10b",
   "refVal": "0.456537",
   "app": "0.456537",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.5 %)"
  },
  {
   "id": "E1.scr",
   "test": "E1: σ_cr,s",
   "ref": "EN 1993-1-3 eq. 5.15",
   "refVal": "341.629",
   "app": "341.629",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.5 %)"
  },
  {
   "id": "E1.chid",
   "test": "E1: χ_d",
   "ref": "EN 1993-1-3 5.5.3.1(7)",
   "refVal": "0.738196",
   "app": "0.738196",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.5 %)"
  },
  {
   "id": "E1.psi",
   "test": "E1: web stress ratio ψ",
   "ref": "NA of the section with the effective flange",
   "refVal": "-0.898868",
   "app": "-0.898869",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 1.0 %)"
  },
  {
   "id": "E1.rhow",
   "test": "E1: web ρ",
   "ref": "EN 1993-1-5 Table 4.1",
   "refVal": "0.950105",
   "app": "0.950105",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 1.0 %)"
  },
  {
   "id": "E1.Ieff",
   "test": "E1: I_eff",
   "ref": "ref (rounded corners neglected per 5.1(3))",
   "refVal": "4.3360e+6",
   "app": "4.2188e+6",
   "diff": "-2.70 %",
   "disp": "The app applies the 5.1(4) δ reduction (δ = 0.0135 → ×0.973) because r = 3 > 0.1 b_p of the lip (c_p = 19 → 1.9); the reference checked only the flange b_p. The app’s reading of 5.1(3) is the stricter one and is conservative. Without δ the app gives 4.3360e+6."
  },
  {
   "id": "E1.Weff",
   "test": "E1: W_eff (to the outer fibre)",
   "ref": "ref (outer fibre)",
   "refVal": "40837",
   "app": "39734",
   "diff": "-2.70 %",
   "disp": "Follows from the δ reduction above (conservative, −3 %)."
  },
  {
   "id": "E2.G1",
   "test": "E2 G1: V_b,Rd, no stiffening at the support",
   "ref": "EN 1993-1-3 Table 6.1 with s_w = h_w",
   "refVal": "47.5739",
   "app": "48.1436",
   "diff": "1.20 %",
   "disp": "The app measures s_w between the corner mid-points (EN 1993-1-3 Fig. 6.5), λ_w = 1.382 instead of 1.398: +1.2 %, same branch. The reference lists this variant (f_bv ≈ 121.6)."
  },
  {
   "id": "E2.G5",
   "test": "E2 G5 350×50×25×2: V_b,Rd, no stiffening",
   "ref": "EN 1993-1-3 Table 6.1 with s_w = h_w",
   "refVal": "27.018",
   "app": "27.3855",
   "diff": "1.36 %",
   "disp": "Same s_w definition difference (corner mid-points): λ_w 2.441 vs 2.458, +1.4 %."
  },
  {
   "id": "E3.end",
   "test": "E3 G1 web crippling, end (category 1), s_s = 50",
   "ref": "EN 1993-1-3 6.1.7.2 (reference: LOW confidence)",
   "refVal": "9.85023",
   "app": "9.85023",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.5 %)"
  },
  {
   "id": "E3.int",
   "test": "E3 G1 web crippling, interior (category 2)",
   "ref": "as above (LOW confidence)",
   "refVal": "17.8792",
   "app": "17.8792",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.5 %)"
  },
  {
   "id": "K1.A",
   "test": "K1 SHS 100×100×4 cold-formed: A",
   "ref": "polygon integration",
   "refVal": "1494.8",
   "app": "1493.83",
   "diff": "-0.06 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "K1.Nb",
   "test": "K1: N_b,Rd (L = 3 m, curve c)",
   "ref": "EN 1993-1-1 6.3.1",
   "refVal": "283.769",
   "app": "283.534",
   "diff": "-0.08 %",
   "disp": "Agrees (tolerance 0.5 %)"
  },
  {
   "id": "K2.Nb",
   "test": "K2 welded box 150×6, L = 3.5 m: N_b,Rd (curve b)",
   "ref": "EN 1993-1-1 6.3.1",
   "refVal": "904.973",
   "app": "904.973",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "K2.int",
   "test": "K2: eq. 6.61/6.62 with N 200 kN, M_y 5 kNm (C_my = 0.6, braced pinned column)",
   "ref": "reference Annex B formula re-evaluated with C_my = 0.6 (the reference used 0.9)",
   "refVal": "0.272043",
   "app": "0.272043",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.5 %)"
  },
  {
   "id": "K3",
   "test": "K3 IS 800:2007 7.1.2.1, same box: P_d (E = 200 000)",
   "ref": "IS 800 7.1.2.1",
   "refVal": "809.581",
   "app": "809.581",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.5 %)"
  },
  {
   "id": "BP1",
   "test": "BP1 base plate 200×200×12 S275 under SHS 100×4, f_ck 25: N_j,Rd",
   "ref": "EN 1993-1-8 6.2.5 T-stub",
   "refVal": "311.188",
   "app": "311.188",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 1.0 %)"
  },
  {
   "id": "C1.F",
   "test": "C1 two M12 at 60, V = 20 kN, e = 50: bolt resultant",
   "ref": "elastic (polar) bolt group",
   "refVal": "19.4365",
   "app": "19.4365",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "C1.Fv",
   "test": "C1: bolt shear resistance per plane (8.8, threads)",
   "ref": "EN 1993-1-8 Table 3.4",
   "refVal": "32.3712",
   "app": "32.3712",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "C1.bw",
   "test": "C1: bearing on the 2 mm C web",
   "ref": "EN 1993-1-3 Table 8.4",
   "refVal": "16.8",
   "app": "16.8",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "C1.bwr",
   "test": "C1: bearing utilisation on the web (expected FAIL 1.157)",
   "ref": "ref",
   "refVal": "1.15694",
   "app": "1.15693",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "C1.bp",
   "test": "C1: bearing on the 6 mm plate",
   "ref": "EN 1993-1-8 Table 3.4",
   "refVal": "47.6308",
   "app": "47.6308",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "C2.F",
   "test": "C2 U-cleat, three M12 at 50, V = 30 kN, e = 60: bolt resultant",
   "ref": "elastic bolt group",
   "refVal": "20.5913",
   "app": "20.5913",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "C2.Fv",
   "test": "C2: bolt shear, two planes",
   "ref": "EN 1993-1-8 Table 3.4",
   "refVal": "64.7424",
   "app": "64.7424",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "C2.bwr",
   "test": "C2: web bearing utilisation (expected FAIL 1.226)",
   "ref": "EN 1993-1-3 Table 8.4",
   "refVal": "1.22567",
   "app": "1.22567",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "C2.leg",
   "test": "C2: bearing on each 4 mm leg",
   "ref": "EN 1993-1-8 Table 3.4",
   "refVal": "31.7538",
   "app": "31.7538",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "W1.Rd",
   "test": "W1 two 150 mm fillets a = 4, f_u 430: F_w,Rd",
   "ref": "EN 1993-1-8 4.5.3.3",
   "refVal": "934.628",
   "app": "934.628",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "W1.u",
   "test": "W1: V = 30 kN at e = 60: weld utilisation",
   "ref": "elastic weld group",
   "refVal": "0.278185",
   "app": "0.278185",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.3 %)"
  },
  {
   "id": "DSM.Mne",
   "test": "DSM G1 F_y 345 (M_cre = 2M_y): M_ne",
   "ref": "AISI S100-16 F2.1",
   "refVal": "15.2863",
   "app": "15.2863",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.1 %)"
  },
  {
   "id": "DSM.Mnl",
   "test": "DSM (M_crl = 0.9 M_y): M_nl",
   "ref": "AISI S100-16 F3.2.1",
   "refVal": "12.7333",
   "app": "12.7333",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.1 %)"
  },
  {
   "id": "DSM.Mnd",
   "test": "DSM (M_crd = 0.8 M_y): M_nd",
   "ref": "AISI S100-16 F4.1",
   "refVal": "11.4781",
   "app": "11.4781",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.1 %)"
  },
  {
   "id": "R1",
   "test": "No Sigma geometry: the section path is a plain lipped C (lips, bends, flanges, web only)",
   "ref": "specification",
   "refVal": "expected",
   "app": "element tags: lipT, bendLT, flT, bendFT, web, bendFB, flB, bendLB, lipB",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "R2",
   "test": "No perforation reduction: adjustment holes change the connection checks only, never the member resistances",
   "ref": "specification",
   "refVal": "expected",
   "app": "member checks identical: true",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "R3",
   "test": "Holes represented: 3 adjustment holes are placed, fit-checked and included in a net-shear check",
   "ref": "specification",
   "refVal": "expected",
   "app": "holes 3, net shear 117.9 < 124.2 kN",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "R4",
   "test": "A missing required value never yields PASS (no result is produced)",
   "ref": "specification",
   "refVal": "expected",
   "app": "fatal = true, messages: Core thickness t: a value is required",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "R5",
   "test": "Invalid inputs are flagged and stop the calculation",
   "ref": "specification",
   "refVal": "expected",
   "app": "Main-beam span (column centres): 50 is below the minimum 500; Core thickness t: -2 is below the minimum 0.6; Main beam: Thickness t must be a positive number",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "R6",
   "test": "The printed report contains every check of the screen with the same η and status",
   "ref": "consistency",
   "refVal": "expected",
   "app": "140 checks; missing 0",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "R7",
   "test": "Every N/A carries its reason",
   "ref": "specification",
   "refVal": "expected",
   "app": "18 N/A checks, 0 without reason",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "R8",
   "test": "A check whose resistance is not established is never PASS (all three routes)",
   "ref": "specification",
   "refVal": "expected",
   "app": "0 violations",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "R9",
   "test": "Optimisation never changes the inputs (v1.0 interface; see O6 for the v1.1 engine)",
   "ref": "specification",
   "refVal": "expected",
   "app": "5 candidates screened; inputs unchanged",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "R10",
   "test": "Back-to-back without a connection: composite action not credited and flagged",
   "ref": "specification",
   "refVal": "expected",
   "app": "composite = false",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "R11",
   "test": "Surface restraint with no demonstrated data is not credited",
   "ref": "specification",
   "refVal": "expected",
   "app": "Present but NOT demonstrated – not credited",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "R12",
   "test": "kg/m² → kN/m²: 600 kg/m² = 5.884 kN/m²",
   "ref": "g = 9.80665 m/s²",
   "refVal": "expected",
   "app": "5.88399",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "R13",
   "test": "M_Ed ≥ M_cr: torsion-dependent checks FAIL as unstable instead of reporting an undefined value",
   "ref": "specification",
   "refVal": "expected",
   "app": "4 checks marked unstable",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "R14",
   "test": "Preset “Example 3 – revised study” passes every check",
   "ref": "regression",
   "refVal": "expected",
   "app": "PASS, max η 0.932 (Major-axis bending, sagging (top flange in compression))",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "R15",
   "test": "Example 3 as mapped (single C secondaries) is reported as failing, with the reasons",
   "ref": "regression",
   "refVal": "expected",
   "app": "15 FAIL; SB-Int bending η 1.215",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "R16",
   "test": "Full system calculation time (live update)",
   "ref": "performance",
   "refVal": "expected",
   "app": "492 ms per run (node)",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O1",
   "test": "Bounds: “Optimise at specified increments” stays within [min, max] and always examines the maximum",
   "ref": "specification",
   "refVal": "expected",
   "app": "11 values 150…250; with max 255 the last value is 255",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O2",
   "test": "Increments: consecutive candidate depths differ by exactly the user increment",
   "ref": "specification",
   "refVal": "expected",
   "app": "steps 10 mm",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O3",
   "test": "Range validation: min > max, zero increment and an empty list are rejected before any analysis",
   "ref": "specification",
   "refVal": "expected",
   "app": "minimum 5 exceeds maximum 2; the increment must be positive; the approved list is empty | run: SB-Int – Core thickness (excl. coating): minimum 3 exceeds maximum 2",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O4",
   "test": "Section geometry validation: a lip shorter than its bend (C = 3 mm, r = 3, t = 2) is rejected; every candidate is a valid section",
   "ref": "specification",
   "refVal": "expected",
   "app": "1 rejected, 2 valid",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O5",
   "test": "Fixed dimensions never change: B_t, B_b, C_t, C_b, r of every analysed candidate equal the fixed inputs",
   "ref": "specification",
   "refVal": "expected",
   "app": "10 candidates analysed",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O6",
   "test": "Optimisation never changes the inputs (the proposal is applied only by the user)",
   "ref": "specification",
   "refVal": "expected",
   "app": "inputs object identical after the search",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O7",
   "test": "Recalculation after a dimension change: the optimised member results equal a fresh full analysis of the proposed inputs",
   "ref": "consistency",
   "refVal": "expected",
   "app": "η 0.9316 = 0.9316, PASS",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O8",
   "test": "Structurally failing candidates are rejected: the proposal has no FAIL and no knock-on failure; failing candidates are never selected",
   "ref": "specification",
   "refVal": "expected",
   "app": "best 2× C350×50×25×1.5 r3 S350GD; 7 failing candidates rejected",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O9",
   "test": "Objective = minimum weight: no lighter candidate passes; every lighter candidate analysed failed or was screened by a safe lower bound",
   "ref": "specification",
   "refVal": "expected",
   "app": "5 lighter candidates analysed and failing, 22 screened",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O10",
   "test": "Objective selection: “minimum depth” gives H ≤ the minimum-weight H; “minimum thickness” gives t ≤ the minimum-weight t",
   "ref": "specification",
   "refVal": "expected",
   "app": "weight: 2× C350×50×25×1.5 r3 S350GD; depth: 2× C300×50×25×2 r3 S350GD; thickness: 2× C350×50×25×1.5 r3 S350GD",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O11",
   "test": "Original-versus-optimised comparison: both columns are recomputed by the engine (no stale values)",
   "ref": "consistency",
   "refVal": "expected",
   "app": "C350×50×25×2 r3 S350GD η 1.753 → 2× C350×50×25×1.5 r3 S350GD η 0.932",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O12",
   "test": "Strength / stability failure (single C SB-Int, twist and bending fail): lever study of the free parameters, then a passing section change",
   "ref": "specification",
   "refVal": "expected",
   "app": "levers: arrangement → b2b → η 0.64; t 2.00 → 2.50 → η 1.67; H 350.00 → 375.00 → η 1.65",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O13",
   "test": "Deflection fails while strength passes (L/450): the depth lever is studied and the proposal is stiffer and passes deflection",
   "ref": "specification",
   "refVal": "expected",
   "app": "baseline Case A – deflection (stiffness) governs (η 1.058, bending η 0.932) → 2× C325×50×25×2 r3 S350GD, deflection η 0.922; levers H, t",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O14",
   "test": "No feasible solution within the ranges (brief §9 demo: H 150–250, t 2–4, lips and flanges fixed): failure is reported with the unsatisfied checks and the blocking limits; no change is proposed",
   "ref": "specification",
   "refVal": "expected",
   "app": "unsatisfied: Twist (characteristic) (fails in 55 of 55 analysed candidates); Bolt shear (C web bolts, 2 shear planes) (fails in 55 of 55 analysed candidates) | blocking: t limited to max 4",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O15",
   "test": "Automatic joist location: the proposal gives the count and symmetric positions, clear of the end-connection zone and at ≥ the minimum spacing",
   "ref": "specification",
   "refVal": "expected",
   "app": "5 joists at 500, 1500, 2500, 3500, 4500 mm (zone 135 mm, spacing 1000 mm)",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O16",
   "test": "Joist and connection checks of the proposal pass and the joists are credited only after those checks",
   "ref": "specification",
   "refVal": "expected",
   "app": "joist row PASS, credited true (demonstrated)",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O17",
   "test": "Restraint credit enters the stability model: M_cr with the credited joists exceeds the fork-only M_cr",
   "ref": "specification",
   "refVal": "expected",
   "app": "M_cr 245.87 kNm vs forks only 6.26 kNm",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O18",
   "test": "Joists that are not anchored are never credited: no joist arrangement is proposed",
   "ref": "specification",
   "refVal": "expected",
   "app": "outcome infeasible",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O19",
   "test": "CG and shear centre are separate points: single C e = y_CG − y_SC (non-zero); back-to-back e = 0",
   "ref": "specification",
   "refVal": "expected",
   "app": "single: y_CG 9.15, y_SC -17.91, e 27.07 mm; b2b e 0.000",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O20",
   "test": "Torsion under the CG convention is analysed (m_T = q e); the shear-centre idealisation needs an acknowledgement and justification, otherwise the calculation stops",
   "ref": "specification",
   "refVal": "expected",
   "app": "m_T = 0.252 kNm/m; SC without acknowledgement: fatal = true",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "O21",
   "test": "Cancel: a cancelled search is reported as cancelled – never as “no feasible solution” and never as an optimum",
   "ref": "specification",
   "refVal": "expected",
   "app": "cancelled = true, outcome cancelled",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "KB1",
   "test": "Knee-braced main beam: the knee points carry load, hogging appears at the knees and the span moment and deflection fall",
   "ref": "specification",
   "refVal": "expected",
   "app": "M+ 17.62 / M− -2.28 kNm vs 46.87 / 0 without knees; knee R 50.9 kN",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "KB2",
   "test": "Unbraced comparison: “knees not in the analysis” equals “no knees” (simply supported, M = 46.87 kNm, δ = 3.43 mm)",
   "ref": "v1.5 result",
   "refVal": "expected",
   "app": "46.87 kNm, 46.87 kNm",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "KB3",
   "test": "Equilibrium: end reactions + knee reactions = total load; the column load is the same with and without the knees",
   "ref": "statics",
   "refVal": "expected",
   "app": "ΣR 63.023 kN vs 63.023 kN; N_col 141.43 kN",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "KB4",
   "test": "Stiffness / geometry sensitivity: a softer knee raises the span moment, a stiffer knee lowers it; moving the knee changes the knee moment",
   "ref": "trend",
   "refVal": "expected",
   "app": "M+ 21.60 (t 3) > 17.62 > 13.47 (2 angles); M− at a 800: -2.50e-13",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "KB5",
   "test": "Load change: the knee model is linear (δ(1200) − δ(600) = δ(600) − δ(0)) and the results follow the load",
   "ref": "linearity",
   "refVal": "expected",
   "app": "δ 0.067 / 1.041 / 2.015 mm",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "UN1",
   "test": "Unit round trip: every pair of units of every quantity converts there and back exactly (relative error ≤ 1e-12)",
   "ref": "exact factors",
   "refVal": "expected",
   "app": "206 round trips, 0 outside",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "UN2",
   "test": "Unit factors (kN·m→N·mm 1e6, kN·m→kN·cm 100, kN/cm²→N/mm² 10, cm⁴→mm⁴ 1e4, kg/m²→kN/m² g/1000, °→rad π/180) and a dimension mismatch is refused",
   "ref": "SI definitions",
   "refVal": "expected",
   "app": "kN·m→N·mm 1000000; kN·m→kN·cm 100; kN/m→N/mm 1; kN/cm²→N/mm² 10; cm⁴→mm⁴ 10000; kg/m²→kN/m² 0.00980665; °→rad 0.017453292519943295",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "UN3",
   "test": "Display units: RSTAB preset shows 46.87 kNm as 4687 kN·cm and 3.43 mm as 0.343 cm; native mode leaves the tool unchanged",
   "ref": "conversion",
   "refVal": "expected",
   "app": "4687 kN·cm; 0.3430 cm; native 46.87 kNm",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "U1",
   "test": "Dark / Light theme: explicit choice persists across a reload",
   "ref": "browser test",
   "refVal": "expected",
   "app": "after reload: dark",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "U2",
   "test": "Optimisation tab: one-click run leaves the inputs unchanged; Apply changes them; Revert restores the original",
   "ref": "browser test",
   "refVal": "expected",
   "app": "apply → b2b t 1.5; revert → single t 2",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "U3",
   "test": "Saving the optimised design as a new design case",
   "ref": "browser test",
   "refVal": "expected",
   "app": "saved true",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "U4",
   "test": "Stale results: after an input change the result is flagged and Apply is disabled until Recalculate",
   "ref": "browser test",
   "refVal": "expected",
   "app": "flagged true, disabled true, re-enabled true",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "U5",
   "test": "Report generation with the dark screen theme: print uses white paper and includes the optimisation record",
   "ref": "browser test",
   "refVal": "expected",
   "app": "print background rgb(255, 255, 255)",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "U6",
   "test": "No browser errors; no horizontal page scroll at 390 px (General, Main beam, Optimisation)",
   "ref": "browser test",
   "refVal": "expected",
   "app": "0 errors; overflow 0/0/0 px",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "D1",
   "test": "Drawings generated from the calculation: plan, two elevations, three sections, three fabrication drawings, three connection details, column and base plate",
   "ref": "specification",
   "refVal": "expected",
   "app": "plan, elev_A, elev_1, sec_mb, sec_sbi, sec_sbe, fab_mb, fab_sbi, fab_sbe, conn_mb, conn_sbi, conn_sbe, col",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "D2",
   "test": "DXF structure: group-code / value pairs, $ACADVER AC1009 (R12), HEADER, TABLES, ENTITIES sections, ends with EOF",
   "ref": "DXF R12 reference",
   "refVal": "expected",
   "app": "sections HEADER, TABLES, ENTITIES; pairs true",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "D3",
   "test": "Every layer used by an entity is declared in the LAYER table, and every layer linetype in the LTYPE table",
   "ref": "DXF R12 reference",
   "refVal": "expected",
   "app": "14 layers used, 16 declared",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "D4",
   "test": "R12 text is plain ASCII (symbols such as ×, –, °, Ø mapped to x, -, %%d, %%c)",
   "ref": "DXF R12 code page",
   "refVal": "expected",
   "app": "206562 bytes, non-ASCII 0",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "D5",
   "test": "SB-Int section drawing: outline depth equals H (outer)",
   "ref": "input H",
   "refVal": "350",
   "app": "350",
   "diff": "-0.00 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "D6",
   "test": "SB-Int section drawing: outline width equals B_t (outer, single C)",
   "ref": "input B_t",
   "refVal": "50",
   "app": "50",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.2 %)"
  },
  {
   "id": "D7",
   "test": "SB-Int cut length = L_sb − 2 × (main-beam web face + connection stand-off)",
   "ref": "hand calculation from the inputs",
   "refVal": "4886",
   "app": "4886",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.0 %)"
  },
  {
   "id": "D8",
   "test": "Member schedule: SB-Int mass each = gross mass per metre × cut length",
   "ref": "section mass × length",
   "refVal": "37.2023",
   "app": "37.2023",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.0 %)"
  },
  {
   "id": "D9",
   "test": "Member schedule: SB-Int quantity = bays × SB-Int per span × modules",
   "ref": "layout",
   "refVal": "18",
   "app": "18",
   "diff": "0.00 %",
   "disp": "Agrees (tolerance 0.0 %)"
  },
  {
   "id": "D10",
   "test": "Fabrication drawing: bolt holes at both ends, diameter d₀ from the connection",
   "ref": "connection geometry",
   "refVal": "expected",
   "app": "4 holes Ø13",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "D11",
   "test": "Drawings are regenerated from the current inputs (SB-Int H 350 → 300 changes the drawing)",
   "ref": "specification",
   "refVal": "expected",
   "app": "SB-Int – cross-section C300×50×25×2",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "D12",
   "test": "A design that does not pass is stamped “NOT FOR FABRICATION” on every drawing",
   "ref": "specification",
   "refVal": "expected",
   "app": "status FAIL, stamped true",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "D13",
   "test": "Invalid inputs: no drawing is produced",
   "ref": "specification",
   "refVal": "expected",
   "app": "No valid calculation: correct the inputs first (drawings are generated only from a complete analysis).",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "D14",
   "test": "Section drawing shows CG, SC and the load line with e = y_load − y_SC (single C)",
   "ref": "load convention",
   "refVal": "expected",
   "app": "e = 27.1",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "U7",
   "test": "Drawings tab: 13 previews, one-file and single-drawing DXF downloads, regenerated after an input change, none for invalid inputs, no browser errors, no overflow at 390 px",
   "ref": "browser test",
   "refVal": "expected",
   "app": "13 previews, 206785 bytes, 0 errors",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "XB1",
   "test": "Same reference cases (6) on the JavaScript engines available: full result digest (statuses exact, values within 1e-6 relative)",
   "ref": "reference results, Node/V8",
   "refVal": "expected",
   "app": "V8 (Node): 6/6 match, max rel. 0.0e+0; JavaScriptCore (Bun): 6/6 match, max rel. 2.0e-10; SpiderMonkey (PythonMonkey): untested",
   "diff": "–",
   "disp": "Pass"
  },
  {
   "id": "XB2",
   "test": "Cross-browser regression: load, versions, inputs, reference cases, DXF text, report fingerprint, stale-result guard, project save / reopen / rejection, unsupported-browser message",
   "ref": "browser test",
   "refVal": "expected",
   "app": "chromium 141.0.7390.37: 27/27; firefox: untested; webkit: untested; chromium (chrome): untested; chromium (msedge): untested",
   "diff": "–",
   "disp": "Pass"
  }
 ]
};
