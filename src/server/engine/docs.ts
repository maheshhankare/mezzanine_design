// @ts-nocheck — method description printed in the report (Appendix A). IS 800:2007 is the only design standard.
import "server-only";
export const METHODS_HTML = `<h3>Calculation methods</h3>
<p>This document describes how the C-Section Beam System Designer calculates. <b>IS 800:2007 is the only design standard.</b> Every check shows its clause, basis, inputs and intermediate values. A provision that is not verified against the official text in the code register (<code>docs/CODE_REGISTER.md</code>) is never reported as PASS or FAIL: the check is REVIEW and its value, if any, is indicative.</p>
<h4>1. Structural analysis (independent of any design standard)</h4>
<ul>
<li><b>Section properties</b>: thin-walled C sections (single, back-to-back, four-C), gross properties, shear centre, warping constant, torsion constant by discretised centre-line integration.</li>
<li><b>Internal forces and deflection</b>: Euler–Bernoulli beam finite elements, pattern loading for continuous members; knee-brace springs.</li>
<li><b>Lateral-torsional buckling (elastic)</b>: Vlasov thin-walled finite-element eigenvalue for the elastic critical moment M<sub>cr</sub> with the actual moment diagram, the load height and the restraints that are credited. This is an analysis result, not a resistance.</li>
<li><b>Torsion</b>: static Vlasov finite-element solution (St Venant and warping), amplified by 1/(1 − M<sub>Ed</sub>/M<sub>cr</sub>); a member with M<sub>Ed</sub> ≥ M<sub>cr</sub> is unstable and the torsion-dependent results have no finite value.</li>
</ul>
<h4>2. Loads and combinations</h4>
<p>IS 800:2007 Table 4: 1.5 (DL + IL) at the ultimate limit state and 1.0 (DL + IL) in service. Area loads are converted with g = 9.80665 m/s². (The provisional status of the page image of Table 4 is recorded in the code register.) The notional horizontal force of the column lines is 0.5 % of the factored gravity load (IS 800:2007 4.3.6, verified).</p>
<h4>3. Resistances</h4>
<ul>
<li><b>Rectangular hollow-section column</b>: the verified IS 800 design of the frame module: classification (Table 2), compression (7.1.2, Tables 7 and 10), shear (8.4.1), bending (8.2.1.2) and the section and member interaction (9.3.1, 9.3.2). The effective lengths of 7.2 are an input (Table 11 / Annex D are not verified).</li>
<li><b>Cold-formed C sections</b>: the resistances (cross-section, buckling, web crippling, connectors of built-up members) need IS 801, which was not supplied. The demand is shown and the check is REVIEW (pending).</li>
<li><b>Connections, column base, slab, angle struts, plan and vertical bracing</b>: IS 800 Section 10, 7.4, 7.5 and 6.3 are not yet verified in the code register: values are indicative and the checks stay under review.</li>
<li><b>Restraints</b>: surface (decking) restraint is not credited (no verified IS 800 criterion). <b>Joists</b> are checked with IS 800 8.3.4 (restraint force 2.5 % of the compression-flange force, at least 1 % per point, load path to an anchorage) and 10.2-10.3 (bolts); a joist is credited only when every required check is verified and satisfied, or as a labelled user-defined assumption. The restraint stiffness has no numerical criterion in IS 800 and is modelled with the actual spring stiffness. The SB-Int restraint of the main beam is a labelled user-defined assumption (default: full restraint).</li>
<li><b>Joints</b> are analysed as nominally pinned; the joint stiffness is not calculated.</li>
</ul>
<h4>4. Frame solver</h4>
<p>The separate second-order frame module (P-Δ and P-δ, Theory II) and its verification against the RSTAB benchmark are described in <code>docs/SECOND_ORDER.md</code> and <code>docs/RSTAB_BENCHMARK.md</code>; the IS 800 member design of that module in <code>docs/IS800_DESIGN.md</code>.</p>
<h4>5. Projects of earlier versions</h4>
<p>A project saved with a design route that no longer exists is migrated to IS 800:2007: the removed inputs are dropped, grades that are not IS 2062 become user-defined values, and nothing is calculated until the inputs are reviewed and acknowledged.</p>`;
export const TESTLOG = {
  summary: 'Automated tests: scripts/test-codes.ts (code register, IS 800 analysis provisions), scripts/test-design.ts (IS 800 member design), scripts/test-frame.ts (second-order solver against closed-form solutions), scripts/rstab (RSTAB benchmark), scripts/test-integration.ts (workflow), scripts/engine-smoke.ts (reference cases of this engine). Their results are in the repository documentation.',
  rows: [] as any[],
};
