# Code-verification register (IS 800, EN 1993-1-1, National Annex)

The authoritative data is `src/shared/codeRegister.ts` (so the application can show it and warn). **Current state: no provision is verified.** The official code texts have not been supplied, and the rule for this project is not to implement or mark anything as verified from memory.

| Standard | Clause | Requirement (what must be verified) | Status | In the tool today | Blocked by |
|---|---|---|---|---|---|
| IS 800:2007 | 4.3.6 | Notional horizontal loads: magnitude, load basis, directions, combinations, exclusions | pending | Old load-path model uses 0.5 % of the factored gravity load (unverified); new solver: none | official text |
| IS 800:2007 | 4.3.6.1, 4.3.6.2 | sub-clauses | pending | not implemented | official text |
| IS 800:2007 | 4.4.3, 4.4.3.1, Annex B | Second-order elastic analysis; conditions for first-order + amplification | pending | solver mechanics only (Theory II / von Kármán); conditions not applied | official text |
| IS 800:2007 | member checks | compression/buckling, bending, interaction, effective length, serviceability | pending | not driven by the new solver | official text |
| EN 1993-1-1 | 5.2.1, 5.2.2 | when second-order effects count (α_cr), second-order elastic analysis | pending | α_cr computable (`criticalLoadFactor`), thresholds not applied | official text, National Annex |
| EN 1993-1-1 | 5.3.2 – 5.3.4 | global sway, member bow, equivalent forces | pending | user-defined sway / bow only (`imperfection.ts`); no code generation; route refused while pending | official text, National Annex |
| EN 1993-1-1 | 6.1, 6.2, 6.3 | partial factors (NDPs), resistance, buckling, interaction | pending | old engine only | official text, National Annex |
| National Annex | NDPs | γ_M0, γ_M1, γ_M2, φ₀, bow amplitudes, α_cr limits … | pending | `emptyNationalAnnex()`: all NDPs unset | project decision + text |

## How the register is enforced today

`resolveImperfectionSource` (`src/server/frame/imperfection.ts`) returns `allowed: false` with the blocking items for `source: 'IS800'` or `'EN1993'` while any register item of that standard is not `verified`, and for EN also while no National Annex is selected or an NDP is unset. `source: 'user'` runs with the user's own values and still warns about double counting. This is tested in `npm run test:frame`.

## National Annex rules applied by the application (when the UI is built)

* the Annex is selected per project; **none is assumed** and no Annex is applied silently;
* every NDP is *unset* until verified; unset or unverified NDPs produce warnings (`verificationWarnings`);
* the edition (first-generation Eurocode + its Annex) and all values used are recorded in the report;
* projects outside the countries with an Annex, and US projects, need explicit confirmation of the governing requirements.

## What is needed to move items to "verified"

1. The official **IS 800:2007** text (clauses above, Annex B, and the member-design clauses) and its amendments.
2. **EN 1993-1-1** (and EN 1990 if combinations are used) in the edition you work to, and the **National Annex** document for the project's country.
3. The decisions: analysis method per project (first order + amplification where permitted, or full second-order FE), whether notional loads and explicit imperfections may both be applied, and the member-imperfection convention (explicit bow, or equivalent loads).

Each verified item will record: document, edition and amendment, clause, page, equation, variables, limits, and the test case that validates it.
