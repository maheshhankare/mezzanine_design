import 'server-only';
import { CHK } from '@/shared/check';
import { U } from '@/shared/util';
import { BASIS, UL, UVx, etaTxt, stepVal, val } from '@/lib/format';

// String versions of the small result components (pill, key-value table, check rows), used by the server-rendered optimisation panel.
// They produce the same markup as the React components in components/common.tsx.
const esc: (s: unknown) => string = U.esc;

export const pill = (st?: string) => `<span class="pill p-${(st || 'NA').replace('/', '')}">${esc(st || '–')}</span>`;

const bar = (eta: any) => {
  if (eta === null || eta === undefined || !isFinite(eta)) return '';
  const w = Math.min(100, Math.max(0, eta * 100));
  return `<span class="bar"><span class="${eta > 1 ? 'b-fail' : eta > 0.9 ? 'b-warn' : 'b-ok'}" style="width:${w.toFixed(0)}%"></span></span>`;
};

export const kvTable = (rows: any[][], cap?: string) =>
  `<table class="kvt">${cap ? `<caption>${esc(cap)}</caption>` : ''}<tbody>${rows
    .map((r) => {
      const num = typeof r[1] === 'number';
      return `<tr><th>${esc(r[0])}</th><td class="${num ? 'num' : 'tx'}">${num ? esc(UVx(r[1], r[2] || '', r[0], r[3] !== undefined ? r[3] : 2).txt) : esc(r[1])}</td><td>${esc(num ? UL(r[2], r[0]) : r[2] || '')}</td></tr>`;
    })
    .join('')}</tbody></table>`;

function checkRow(c: any): string {
  const na = c.status === 'N/A';
  const Ed = c.EdF ?? c.Ed, Rd = c.RdF ?? c.Rd;
  const body = na
    ? `<p class="na">Not applicable: ${esc(c.naReason || '')}</p>`
    : `<dl class="kv">
        ${c.clause ? `<dt>Clause / method</dt><dd>${esc(c.clause)}</dd>` : ''}
        ${c.eq ? `<dt>Equation</dt><dd class="eq">${esc(c.eq)}</dd>` : ''}
        ${c.factor ? `<dt>Factors</dt><dd>${esc(c.factor)}</dd>` : ''}
        <dt>Basis</dt><dd>${esc(BASIS[c.basis] || c.basis)}</dd>
        ${c.Ed !== undefined ? `<dt>Demand</dt><dd>${esc(val(c, Ed))} ${esc(UL(c.unit, c.name))}</dd>` : ''}
        ${c.Rd !== undefined ? `<dt>Resistance / limit</dt><dd>${esc(val(c, Rd))} ${esc(UL(c.unit, c.name))}</dd>` : ''}
        <dt>Utilisation η</dt><dd>${esc(etaTxt(c))} ${pill(c.status)}</dd>
      </dl>
      ${c.inputs && c.inputs.length ? `<table class="steps"><caption>Inputs</caption><tbody>${c.inputs.map((r: any[]) => `<tr><td>${esc(r[0])}</td><td class="num">${esc(stepVal(r[1], r[2], r[0]))}</td><td>${esc(UL(r[2], r[0]))}</td></tr>`).join('')}</tbody></table>` : ''}
      ${c.steps && c.steps.length ? `<table class="steps"><caption>Intermediate values</caption><tbody>${c.steps.map((r: any[]) => `<tr><td>${esc(r[0])}</td><td class="ex">${esc(r[1] || '')}</td><td class="num">${esc(stepVal(r[2], r[3], r[0]))}</td><td>${esc(UL(r[3], r[0]))}</td></tr>`).join('')}</tbody></table>` : ''}
      ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
      ${c.why && c.status !== 'PASS' ? `<p class="why"><b>Mechanism:</b> ${esc(c.why)}</p>` : c.why ? `<p class="why"><b>What it guards against:</b> ${esc(c.why)}</p>` : ''}
      ${c.fix && c.status !== 'PASS' ? `<p class="fix"><b>Remedies:</b> ${esc(c.fix)}</p>` : ''}`;
  return `<details class="chk s-${(c.status || '').replace('/', '')}"><summary><span class="cn">${pill(c.status)} <span class="nm">${esc(c.name)}</span><span class="cl">${esc(c.clause || '')}</span></span><span class="ce">${c.Ed !== undefined && !na ? `${esc(val(c, Ed))} / ${esc(val(c, Rd))} ${esc(UL(c.unit, c.name))}` : ''}</span><span class="eta">${esc(etaTxt(c))} ${bar(c.eta)}</span></summary><div class="cbody">${body}</div></details>`;
}

export function checksHTML(list: any[], title?: string): string {
  if (!list || !list.length) return '';
  const ov = CHK.overall(list), groups: { n: string; l: any[] }[] = [];
  for (const c of list) {
    let g = groups.find((x) => x.n === c.grp);
    if (!g) groups.push((g = { n: c.grp, l: [] }));
    g.l.push(c);
  }
  return `<section class="card"><h3>${esc(title || 'Checks')} ${pill(ov.status)} <span class="sub">max η ${ov.gov ? esc(etaTxt(ov.gov)) : '–'}${ov.gov ? ' · ' + esc(ov.gov.name) : ''}</span></h3>
    <p class="hint">Open a row for the clause, equation, inputs, intermediate values, basis, mechanism and remedies.</p>
    ${groups.map((g) => `<h4>${esc(g.n || '')}</h4>${g.l.map(checkRow).join('')}`).join('')}</section>`;
}
