// Generates docs/CODE_REGISTER.md from src/shared/codeRegister.ts, so the document and the data cannot drift apart.   npx tsx scripts/gen-register-doc.ts
import { writeFileSync } from 'node:fs';
import { CODE_REGISTER, EN_1993_1_1_NDP_IDS, registerProblems, type CodeItem } from '../src/shared/codeRegister';

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const count = (st: string) => CODE_REGISTER.filter((i) => i.status === st).length;
const block = (std: 'IS 800' | 'EN 1993-1-1') => {
  const it = CODE_REGISTER.filter((i) => i.standard === std);
  const row = (i: CodeItem) => `| ${i.id} | ${esc(i.clause)} | ${i.kind} | ${i.scope} | **${i.status}**${i.textVerified ? '' : ' (text not verified)'} | ${esc(i.requirement)}${i.formula ? ` Formula: \`${esc(i.formula)}\`.` : ''}${i.applicability ? ` Applicability: ${esc(i.applicability)}.` : ''} | ${esc(i.implementation) || 'none'} | ${esc(i.validation) || 'none'} | ${esc(i.evidence)} | ${esc(i.outstanding) || ''} |`;
  return ['| Id | Clause | Kind | Scope | Status | Requirement (summary, formula, applicability) | Implementation | Verification test | Evidence | Outstanding issue or decision |', '|---|---|---|---|---|---|---|---|---|---|', ...it.map(row)].join('\n');
};

const doc = `# Code-verification register (IS 800:2007, EN 1993-1-1:2005, National Annex)

**Generated from \`src/shared/codeRegister.ts\` by \`scripts/gen-register-doc.ts\`: edit the data, then regenerate.** The register is the authoritative source for deciding whether a code-specific feature may run (\`routeAvailability\`, \`validateSettings\`).

## Documents the register is based on

* **IS 800:2007** *General Construction in Steel: Code of Practice* (Third Revision, Bureau of Indian Standards, December 2007), as supplied by the user: a scanned copy of 150 pages. The text layer is OCR and unreliable for equations and tables, so every clause was read on the page image before it was marked verified. **No amendment is contained in the supplied copy; amendments are not verified.**
* **EN 1993-1-1:2005** *Eurocode 3: Design of steel structures, Part 1-1* (BS EN copy, 93 pages, incorporating corrigenda of February 2006 and March 2009), as supplied. **EN 1993-1-1:2005/A1:2014 was not supplied. No National Annex was supplied and none is selected**; the NDP clauses of the text (5.2.1(3), 5.2.2(8), 5.3.2(3), 5.3.2(11), 5.3.4(3), 6.1(1), 6.3.2.2(2), 6.3.2.3, 6.3.2.4, 6.3.3(5), 6.3.4(1), …) therefore stay provisional or pending.

## Status rules

* **verified**: the requirement was read in the official text and checked on the page image, it is implemented, and a test with a documented basis passes. Nothing else is called verified.
* **provisional**: implemented and tested, but it rests on a value or decision that is not confirmed (EN: only the values printed in the Eurocode text are available; IS 800: a modelling assumption the clause does not state). The run is labelled provisional.
* **pending**: not implemented, text not (completely) verified, or a project decision is open. Nothing is assumed.

A feature (e.g. \`en.sway-imperfection\`) may run only if none of its register items is pending; it is labelled by its weakest item. Only the affected route is blocked. A second-order analysis that follows only verified provisions is still **not** labelled "verified": member design (IS 800 Sections 7-9, EN 1993-1-1 Section 6) is pending for both standards, so no result is a code-compliance verdict.

Summary: ${count('verified')} verified, ${count('provisional')} provisional, ${count('pending')} pending. Register integrity problems: ${registerProblems(CODE_REGISTER).length ? registerProblems(CODE_REGISTER).join('; ') : 'none'}.

## IS 800:2007

${block('IS 800')}

## EN 1993-1-1:2005

${block('EN 1993-1-1')}

## EN 1993-1-1 National Annex parameters (none selected)

Every NDP stays **unset** until a National Annex is selected and its values are verified from its text. The "text value" column is what the Eurocode text itself prints; it may be used only if the user accepts it explicitly, and the run is then provisional.

| NDP | Clause | Description | Value printed in the Eurocode text |
|---|---|---|---|
${EN_1993_1_1_NDP_IDS.map((n) => `| ${n.id} | ${n.clause} | ${n.description} | ${n.recommended === null ? 'not read yet' : typeof n.recommended === 'number' ? n.recommended : n.recommended} |`).join('\n')}

## What is needed to move items to "verified"

1. **EN 1993-1-1:** the National Annex document of the project's country (and the decision which country), plus A1:2014 if the project works to it. Without it the NDP-dependent EN items cannot leave "provisional".
2. **IS 800:** the amplification-factor definition for 4.4.2 / 4.4.3.3 (9.3.2.2, Table 18), read on the page images, and the member-design clauses (7.1.2 with Tables 7 and 10, 8.2 lateral-torsional buckling, 9.3); an engineering decision on the distribution of the notional force within a level (IS800-4.3.6-dist) and on whether both senses of each direction are to be examined (IS800-4.3.6.1).
3. **EN 1993-1-1:** Section 6 (6.1, 6.2, 6.3, Table 6.2 buckling-curve selection) read on the page images; 5.3.2(5), (10), (11) and 5.3.3 implemented.
4. **Project decisions:** whether notional / equivalent forces and explicit geometric imperfections may both be applied (see \`docs/IS800_EN1993_ROUTES.md\`: the codes themselves do not allow counting the same imperfection twice), the stability method (EN 5.2.2(3) a / b / c), and the member-imperfection convention (explicit bow or equivalent forces).
`;
writeFileSync('docs/CODE_REGISTER.md', doc);
console.log(`docs/CODE_REGISTER.md written: ${CODE_REGISTER.length} items`);
