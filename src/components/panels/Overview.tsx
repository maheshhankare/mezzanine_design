'use client';

import { UNITS } from '@/shared/units';
import { useDesign } from '@/state/DesignProvider';
import { F, etaTxt } from '@/lib/format';
import { TAB_OF, tabLabel } from '@/lib/project';
import { Bar, Card, Checks, Html, KvTable, Pill } from '../common';

export function Messages() {
  const { res, goto } = useDesign();
  const ms: any[] = (res && res.msgs) || [];
  if (!ms.length) return null;
  return (
    <Card bad={ms.some((m) => m.level === 'error')}>
      <h3>Input messages</h3>
      <ul className="msgs">
        {ms.map((m, i) => (
          <li key={i} className={m.level}>
            <a href="#" onClick={(e) => { e.preventDefault(); goto(m.tab, { fid: m.id || undefined }); }}>{tabLabel(m.tab)}</a>: {m.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function UnitsPanel() {
  const { setUnits } = useDesign();
  const u = UNITS.get(),
    custom = u.mode === 'custom';
  const groups: { n: string; l: any[] }[] = [];
  for (const c of UNITS.CATS) {
    let g = groups.find((x) => x.n === c.group);
    if (!g) groups.push((g = { n: c.group, l: [] }));
    g.l.push(c);
  }
  return (
    <Card id="unitsC">
      <h3>Display units</h3>
      <p className="hint">Changes only how values are shown and typed: the calculation keeps N, mm and N/mm² internally, so the results do not change. Saved with the project.</p>
      <div className="ugrid">
        <label>
          Mode{' '}
          <select value={custom ? 'custom' : 'native'} onChange={(e) => setUnits('mode', e.target.value)}>
            <option value="native">As each value is calculated (kN, kNm, mm, cm⁴ … as before)</option>
            <option value="custom">Convert every value to the units below</option>
          </select>
        </label>
        <label>
          Preset{' '}
          <select value="" onChange={(e) => setUnits('preset', e.target.value)}>
            <option value="">Choose a set…</option>
            {Object.entries(UNITS.PRESETS).map(([k, p]: [string, any]) => <option key={k} value={k}>{p.label}</option>)}
          </select>
        </label>
      </div>
      {groups.map((g) => (
        <div key={g.n}>
          <h4>{g.n}</h4>
          <div className="ugrid">
            {g.l.map((c) => (
              <label key={c.key}>
                {c.label}{' '}
                <select aria-label={c.label} disabled={!custom} value={u[c.key]} onChange={(e) => setUnits(c.key, e.target.value)}>
                  {Object.keys(UNITS.QTY[c.qty]).map((x) => <option key={x}>{x}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
      ))}
    </Card>
  );
}

export function GenPanel() {
  const { res, I } = useDesign();
  if (!res || res.fatal) return null;
  const R = res.R,
    A = res.area,
    L = res.load || {};
  const lp: any[] = [
    ['Surface self-weight + permanent', `${F(+I.d_sw + +I.qG, 0)} kg/m² → ${F(A.Gk, 3)} kN/m²`, ''],
    ['Imposed', `${F(+I.qQ, 0)} kg/m² → ${F(A.Qk, 3)} kN/m²`, ''],
    ['ULS area load', A.qEd, 'kN/m²', 3],
    ['SB-Int tributary width', L.tribI, 'mm', 0],
    ['SB-End tributary width', L.tribE, 'mm', 0],
    ['SB-Int reaction (characteristic) G / Q', `${F(L.RsbiG.G / 1e3, 2)} / ${F(L.RsbiG.Q / 1e3, 2)} kN`, ''],
    ['SB-End reaction G / Q', `${F(L.RsbeGQ.G / 1e3, 2)} / ${F(L.RsbeGQ.Q / 1e3, 2)} kN`, ''],
    ['Main-beam reaction G / Q', `${F(L.RmbGQ.G / 1e3, 2)} / ${F(L.RmbGQ.Q / 1e3, 2)} kN`, ''],
    ['Column N_Ed (ULS)', L.Ncol / 1e3, 'kN', 2],
  ];
  return (
    <>
      <UnitsPanel />
      <Card>
        <h3>Design basis</h3>
        <KvTable
          rows={[
            ['Route', R.name, ''],
            ['ULS combination', R.ulsText, ''],
            ['SLS', R.slsText, ''],
            ['E / G', `${F(R.E, 0)} / ${F(R.E / (2 * (1 + +I.nu)), 0)} N/mm²`, ''],
            ['Partial factors', 'γm0 1.10, γm1 1.25, γmb 1.25, γmw 1.25 (IS 800 Table 5)', ''],
          ]}
        />
        <p className="note">
          IS 800:2007 is the only design standard. Provisions that are not verified in the code register (IS 801 for cold-formed members, connections, column bases, angle struts, …) give
          REVIEW, never PASS: the demand is shown and the resistance is pending. No value of another standard is presented under an IS label.
        </p>
      </Card>
      <Card>
        <h3>Load path (kg/m² → kN)</h3>
        <KvTable rows={lp} />
        <p className="hint">Floor → surface → SB-Int / SB-End → connections → main beam → connection → box column → base plate → slab. Area loads converted with g = 9.80665 m/s².</p>
      </Card>
      <Card>
        <h3>Arrangement</h3>
        <Html html={res.svg?.plan ?? ''} />
      </Card>
      <Card>
        <h3>Analysis model</h3>
        <ul className="model">
          <li>Secondaries: {I.sbCont === 'cont' ? 'continuous' : 'simply supported'} beams of span {F(+I.Lsb, 0)} mm under the tributary floor load (pattern loading on continuous members). Load at the top flange, eccentric to the shear centre as set on the member tab.</li>
          <li>Main beam: {I.mbCont === 'cont' ? 'continuous' : 'simple'} span {F(+I.Lmb, 0)} mm with the SB-Int reactions as point loads at their positions (interior line: both sides, imposed load also on one side only for torsion; edge line: one side).</li>
          <li>In-plane analysis: Euler–Bernoulli beam FE. Lateral-torsional buckling: Vlasov thin-walled FE eigenvalue (v, v′, φ, φ′) with the actual moment diagram, load height and only the restraints that are credited. Torsion: static Vlasov FE (St Venant + warping) amplified by 1/(1 − M_Ed/M_cr).</li>
          <li>Joints: pinned for the span unless set semi-rigid; every joint is classified by its stiffness and checked for the moment it attracts.</li>
          <li>Column: N, M_y, M_z from the reactions × (face + eccentricity), imposed load on one side; buckling lengths from the frame stability choice.</li>
        </ul>
      </Card>
      <Messages />
    </>
  );
}

export function SumPanel() {
  const { res, takeoff: tk, goto } = useDesign();
  if (!res || res.fatal)
    return (
      <>
        <Card bad>
          <h3>No results</h3>
          <p>Correct the invalid inputs listed below; no check is shown as PASS while an input is missing or out of range.</p>
        </Card>
        <Messages />
      </>
    );
  const S = res.summary,
    rows: any[] = S.rows,
    all: any[] = rows.flatMap((r) => r.list.map((c: any) => Object.assign({ mod: r.label, key: r.key }, c)));
  const fails = all.filter((c) => c.status === 'FAIL').sort((a, b) => ((b.eta === Infinity) as any) - ((a.eta === Infinity) as any) || (b.eta || 0) - (a.eta || 0));
  const revs = all.filter((c) => c.status === 'REVIEW');
  const gov = S.overall.gov;
  const diag = (c: any, i: number) => (
    <li key={i}>
      <b>{c.mod}</b> – {c.name} (η {etaTxt(c)}).
      {c.why && (<><br /><span className="why">Mechanism: {c.why}</span></>)}
      {c.fix && (<><br /><span className="fix">Remedies: {c.fix}</span></>)}
      {c.note && (<><br /><span className="note">{c.note}</span></>)}
    </li>
  );
  return (
    <>
      <Card>
        <h3>Overall <Pill st={S.overall.status} /></h3>
        <p className="big">
          {S.overall.status === 'PASS'
            ? 'All checks pass with the credited restraints listed in the Bracing & Restraints tab.'
            : S.overall.status === 'REVIEW'
              ? 'No check fails, but some checks need engineering review before the design can be accepted.'
              : `${S.nFail} check${S.nFail > 1 ? 's' : ''} fail. The design is not adequate as entered.`}
        </p>
        {gov && <p><b>Governing:</b> {rows.find((r) => r.list.includes(gov)).label} – {gov.name} (η {etaTxt(gov)}). {gov.why || ''}</p>}
        <p className="hint">{S.nPass} PASS · {S.nFail} FAIL · {S.nReview} REVIEW · {S.nNA} N/A (each N/A carries its reason).</p>
        <table className="rt">
          <tbody>
            <tr><th>Module</th><th>Status</th><th>max η</th><th>Governing check</th><th>REVIEW</th></tr>
            {rows.map((r) => (
              <tr key={r.key} className={`s-${r.status.replace('/', '')}`}>
                <td><a href="#" onClick={(e) => { e.preventDefault(); goto(TAB_OF[r.key], /^c[iem]$/.test(r.key) ? { conn: r.key } : undefined); }}>{r.label}</a></td>
                <td><Pill st={r.status} /></td>
                <td className="num">{r.gov ? etaTxt(r.gov) : '–'} <Bar eta={r.eta} /></td>
                <td>{r.gov ? r.gov.name : '–'}</td>
                <td className="num">{r.nReview || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {tk && (
        <Card>
          <h3>Steel take-off (calculated)</h3>
          <KvTable
            rows={[
              ['Main beams', tk.mb, 'kg', 0], ['SB-Int', tk.sbi, 'kg', 0], ['SB-End', tk.sbe, 'kg', 0], ['Columns', tk.col, 'kg', 0],
              ['Joists (credited restraint system)', tk.joist, 'kg', 0], ['Total (members only, no connections)', tk.tot, 'kg', 0],
              ['Floor area', tk.area, 'm²', 1], ['Steel per floor area', tk.perArea, 'kg/m²', 1],
            ]}
          />
        </Card>
      )}
      {fails.length > 0 && (<Card><h3>Diagnosis: failing checks, mechanism and remedies</h3><ol className="diag">{fails.map(diag)}</ol></Card>)}
      {revs.length > 0 && (<Card><h3>REVIEW list (resistance not established or method outside the implemented scope)</h3><ol className="diag">{revs.map(diag)}</ol></Card>)}
      <Card>
        <h3>Optimisation</h3>
        <p>
          Section, joist, column and knee-brace optimisation (individual or whole system, with fixed dimensions, ranges, increments and approved lists) is on the{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); goto('opt'); }}>Optimisation tab</a>. It never changes the inputs until you apply a proposal.
        </p>
      </Card>
      <Messages />
    </>
  );
}
