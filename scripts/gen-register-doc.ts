// Generates docs/CODE_REGISTER.md from src/shared/codeRegister.ts, so the document and the data cannot drift apart.   npx tsx scripts/gen-register-doc.ts
import { writeFileSync } from 'node:fs';
import { CODE_REGISTER, registerProblems, type CodeItem } from '../src/shared/codeRegister';

const esc = (s: string) => s.replace(/\|/g, '\|').replace(/\n/g, ' ');
const count = (st: string) => CODE_REGISTER.filter((i) => i.status === st).length;
const row = (i: CodeItem) => `| ${i.id} | ${esc(i.clause)} | ${i.kind} | ${i.scope} | **${i.status}**${i.textVerified ? '' : ' (text not verified)'} | ${esc(i.requirement)}${i.formula ? ` Formula: \`${esc(i.formula)}\`.` : ''}${i.applicability ? ` Applicability: ${esc(i.applicability)}.` : ''} | ${esc(i.implementation) || 'none'} | ${esc(i.validation) || 'none'} | ${esc(i.evidence)} | ${esc(i.outstanding) || ''} |`;
const table = ['| Id | Clause | Kind | Scope | Status | Requirement (summary, formula, applicability) | Implementation | Verification test | Evidence | Outstanding issue or decision |', '|---|---|---|---|---|---|---|---|---|---|', ...CODE_REGISTER.map(row)].join('\n');
const problems = registerProblems(CODE_REGISTER);

const doc = `# Code-verification register (IS 800:2007)

**Generated from \`src/shared/codeRegister.ts\` by \`scripts/gen-register-doc.ts\`: edit the data, then regenerate.** The register is the authoritative source for deciding whether a code-specific feature may run (\`routeAvailability\`, \`validateSettings\`). IS 800:2007 is the only steel design standard of the application.

## Document the register is based on

* **IS 800:2007** *General Construction in Steel: Code of Practice* (Third Revision, Bureau of Indian Standards, December 2007), as supplied by the user: a scanned copy of 150 pages. The text layer is OCR and unreliable for equations and tables, so every clause was read on the page image before it was marked verified. **No amendment is contained in the supplied copy; amendments are not verified.**
* IS 801 (cold-formed light-gauge sections) and the loading standards were **not supplied**: items that need them stay pending.

## Status rules

* **verified**: the requirement was read in the official text and checked on the page image, it is implemented, and a test with a documented basis passes. Nothing else is called verified.
* **provisional**: implemented and tested, but it rests on a modelling assumption or decision the clause does not state. The run is labelled provisional.
* **pending**: not implemented, text not (completely) verified, or an input/decision/standard is missing. Nothing is assumed.

A feature may run only if none of its register items is pending; it is labelled by its weakest item. Only the affected feature is blocked. A result is never a code-compliance verdict beyond the verified scope.

Summary: ${count('verified')} verified, ${count('provisional')} provisional, ${count('pending')} pending. Register integrity problems: ${problems.length ? problems.join('; ') : 'none'}.

## IS 800:2007

${table}
`;
writeFileSync('docs/CODE_REGISTER.md', doc);
console.log(`docs/CODE_REGISTER.md written: ${CODE_REGISTER.length} items`);
