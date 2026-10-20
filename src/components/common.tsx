import type { ReactNode } from 'react';
import { CHK } from '@/shared/check';
import { BASIS, UL, UVx, etaTxt, stepVal, val } from '@/lib/format';

/** Renders trusted, engine-generated markup (SVG sketches, drawings, report). Never user-supplied text. */
export function Html({ html, as: Tag = 'div', className }: { html: string; as?: 'div' | 'span'; className?: string }) {
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Pill({ st }: { st?: string }) {
  return <span className={`pill p-${(st || 'NA').replace('/', '')}`}>{st || '–'}</span>;
}

export function Bar({ eta }: { eta: any }) {
  if (eta === null || eta === undefined || !isFinite(eta)) return null;
  const w = Math.min(100, Math.max(0, eta * 100));
  return (
    <span className="bar">
      <span className={eta > 1 ? 'b-fail' : eta > 0.9 ? 'b-warn' : 'b-ok'} style={{ width: `${w.toFixed(0)}%` }} />
    </span>
  );
}

type Row = [string, any, string?, number?];

export function KvTable({ rows, caption }: { rows: Row[]; caption?: string }) {
  return (
    <table className="kvt">
      {caption && <caption>{caption}</caption>}
      <tbody>
        {rows.map((r, i) => {
          const num = typeof r[1] === 'number';
          return (
            <tr key={i}>
              <th>{r[0]}</th>
              <td className={num ? 'num' : 'tx'}>{num ? UVx(r[1], r[2] || '', r[0], r[3] !== undefined ? r[3] : 2).txt : r[1]}</td>
              <td>{num ? UL(r[2], r[0]) : r[2] || ''}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CheckRow({ c }: { c: any }) {
  const na = c.status === 'N/A';
  return (
    <details className={`chk s-${(c.status || '').replace('/', '')}`}>
      <summary>
        <span className="cn">
          <Pill st={c.status} /> <span className="nm">{c.name}</span>
          <span className="cl">{c.clause || ''}</span>
        </span>
        <span className="ce">{c.Ed !== undefined && !na ? `${val(c, c.EdF ?? c.Ed)} / ${val(c, c.RdF ?? c.Rd)} ${UL(c.unit, c.name)}` : ''}</span>
        <span className="eta">
          {etaTxt(c)} <Bar eta={c.eta} />
        </span>
      </summary>
      <div className="cbody">
        {na ? (
          <p className="na">Not applicable: {c.naReason || ''}</p>
        ) : (
          <>
            <dl className="kv">
              {c.clause && (<><dt>Clause / method</dt><dd>{c.clause}</dd></>)}
              {c.eq && (<><dt>Equation</dt><dd className="eq">{c.eq}</dd></>)}
              {c.factor && (<><dt>Factors</dt><dd>{c.factor}</dd></>)}
              <dt>Basis</dt>
              <dd>{BASIS[c.basis] || c.basis}</dd>
              {c.Ed !== undefined && (<><dt>Demand</dt><dd>{val(c, c.EdF ?? c.Ed)} {UL(c.unit, c.name)}</dd></>)}
              {c.Rd !== undefined && (<><dt>Resistance / limit</dt><dd>{val(c, c.RdF ?? c.Rd)} {UL(c.unit, c.name)}</dd></>)}
              <dt>Utilisation η</dt>
              <dd>{etaTxt(c)} <Pill st={c.status} /></dd>
            </dl>
            {c.inputs && c.inputs.length > 0 && (
              <table className="steps">
                <caption>Inputs</caption>
                <tbody>
                  {c.inputs.map((r: any[], i: number) => (
                    <tr key={i}><td>{r[0]}</td><td className="num">{stepVal(r[1], r[2], r[0])}</td><td>{UL(r[2], r[0])}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {c.steps && c.steps.length > 0 && (
              <table className="steps">
                <caption>Intermediate values</caption>
                <tbody>
                  {c.steps.map((r: any[], i: number) => (
                    <tr key={i}><td>{r[0]}</td><td className="ex">{r[1] || ''}</td><td className="num">{stepVal(r[2], r[3], r[0])}</td><td>{UL(r[3], r[0])}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {c.note && <p className="note">{c.note}</p>}
            {c.why && (c.status !== 'PASS' ? <p className="why"><b>Mechanism:</b> {c.why}</p> : <p className="why"><b>What it guards against:</b> {c.why}</p>)}
            {c.fix && c.status !== 'PASS' && <p className="fix"><b>Remedies:</b> {c.fix}</p>}
          </>
        )}
      </div>
    </details>
  );
}

export function Checks({ list, title }: { list: any[]; title?: string }) {
  if (!list || !list.length) return null;
  const ov = CHK.overall(list),
    groups: { n: string; l: any[] }[] = [];
  for (const c of list) {
    let g = groups.find((x) => x.n === c.grp);
    if (!g) groups.push((g = { n: c.grp, l: [] }));
    g.l.push(c);
  }
  return (
    <section className="card">
      <h3>
        {title || 'Checks'} <Pill st={ov.status} />{' '}
        <span className="sub">max η {ov.gov ? etaTxt(ov.gov) : '–'}{ov.gov ? ' · ' + ov.gov.name : ''}</span>
      </h3>
      <p className="hint">Open a row for the clause, equation, inputs, intermediate values, basis, mechanism and remedies.</p>
      {groups.map((g, gi) => (
        <div key={gi}>
          <h4>{g.n || ''}</h4>
          {g.l.map((c, i) => <CheckRow key={c.name + i} c={c} />)}
        </div>
      ))}
    </section>
  );
}

export const Card = ({ children, bad, id }: { children: ReactNode; bad?: boolean; id?: string }) => (
  <section className={`card${bad ? ' bad' : ''}`} id={id}>{children}</section>
);
