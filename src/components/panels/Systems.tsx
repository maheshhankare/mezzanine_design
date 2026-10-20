'use client';

import { CHK } from '@/shared/check';
import { useDesign } from '@/state/DesignProvider';
import { F } from '@/lib/format';
import { Card, Checks, Html, KvTable, Pill } from '../common';

export function ConnPanel() {
  const { res, connSel } = useDesign();
  if (!res || res.fatal) return null;
  const c = res.mods.conn[connSel];
  if (!c) return <Card><p>This connection does not occur in the current layout.</p></Card>;
  const st = c.stiff || {};
  return (
    <>
      <div className="rgrid">
        <Card>
          <h3>{c.typeName} <Pill st={c.overall.status} /></h3>
          <Html html={res.svg?.conn?.[connSel]?.webHoles ?? ''} />
          <Html html={res.svg?.conn?.[connSel]?.connPlan ?? ''} />
        </Card>
        <Card>
          <h3>Stiffness and classification (calculated)</h3>
          <KvTable
            rows={[
              ['Bolt-group centroid to the support line e', c.e, 'mm', 1],
              ['S_j,ini', (st.Sj || 0) / 1e6, 'kNm/rad', 1],
              ['Pinned limit 0.5 E I_b / L_b', (st.pinLim || 0) / 1e6, 'kNm/rad', 1],
              ['Rigid limit k_b E I_b / L_b', (st.rigidLim || 0) / 1e6, 'kNm/rad', 1],
              ['Classification', st.cls || '–', ''],
              ['Axial stiffness K_c', st.Kc || 0, 'N/mm', 0],
              ['Fork restraint at the member end', c.fork ? 'demonstrated' : 'not demonstrated', ''],
              ['Bolt rows that fit', c.nMax, '', 0],
            ]}
          />
          <p className="hint">EN 1993-1-8 5.2.2.5 stiffness classification. A joint analysed as pinned but classified semi-rigid is checked for the end moment its stiffness attracts.</p>
        </Card>
      </div>
      <Checks list={c.checks} title={c.typeName + ' checks'} />
    </>
  );
}

export function ColPanel() {
  const { res } = useDesign();
  if (!res || res.fatal) return null;
  const c = res.mods.col,
    b = res.mods.base,
    L = c.loads,
    pr = c.props || {};
  return (
    <>
      <div className="rgrid">
        <Card>
          <h3>Column section <Pill st={c.overall ? c.overall.status : CHK.overall(c.checks).status} /></h3>
          <Html html={res.svg?.col ?? ''} />
          <KvTable
            caption="Properties (calculated)"
            rows={[
              ['A', pr.A, 'mm²', 0], ['I_y', (pr.Iy || NaN) / 1e4, 'cm⁴', 1], ['I_z', (pr.Iz || NaN) / 1e4, 'cm⁴', 1], ['I_t', (pr.It || NaN) / 1e4, 'cm⁴', 1],
              ['Mass', (pr.A || 0) * 7850e-6, 'kg/m', 2],
            ]}
          />
        </Card>
        <Card>
          <h3>Design forces (ULS)</h3>
          <KvTable
            rows={[
              ['N_Ed', L.N / 1e3, 'kN', 2], ['M_y,Ed', L.My / 1e6, 'kNm', 3], ['M_z,Ed', L.Mz / 1e6, 'kNm', 3], ['V_Ed', L.V / 1e3, 'kN', 2], ['T_Ed', L.T / 1e6, 'kNm', 3],
              ['Main-beam reactions into the column', L.nbMB, '', 0], ['SB-End reactions into the column', L.nbSE, '', 0], ['Column self-weight', L.colSW / 1e3, 'kN', 2],
              ['Eccentricity main beam (to the face + e)', L.ecm, 'mm', 1], ['Eccentricity SB-End', L.ece, 'mm', 1],
            ]}
          />
          <p className="hint">N from the governing main beams and SB-Ends plus self-weight. Moments from the reactions at face + connection eccentricity, with the imposed load on one side only for interior columns.</p>
        </Card>
      </div>
      <Checks list={c.checks} title="Box column checks" />
      <div className="rgrid">
        <Card>
          <h3>Base plate</h3>
          <Html html={res.svg?.base ?? ''} />
        </Card>
        <Checks list={b.checks} title="Base plate, anchors and slab" />
      </div>
    </>
  );
}

export function JoistPanel() {
  const { res } = useDesign();
  if (!res || res.fatal) return null;
  const js = ['sbi', 'sbe'].map((k) => (res.mods[k] && res.mods[k].restrInfo && res.mods[k].restrInfo.joist ? [k, res.mods[k].restrInfo.joist] : null)).filter(Boolean) as [string, any][];
  if (!js.length)
    return <Card><p>Joists are not selected as a restraint for SB-Int or SB-End (their tabs: “Restraint to the secondary”). Joists that are present but not selected are not credited.</p></Card>;
  return (
    <>
      {js.map(([k, j]) => (
        <Card key={k}>
          <h3>Joists on {k === 'sbi' ? 'SB-Int' : 'SB-End'} <Pill st={CHK.overall(j.checks).status} /></h3>
          <p>Positions: {(j.positions || []).map((x: number) => F(x, 0)).join(', ')} mm. Credited as lateral restraints: <b>{j.credited ? 'yes' : 'no'}</b> – {j.reason || ''}</p>
          <Checks list={j.checks} title="Joist checks" />
        </Card>
      ))}
    </>
  );
}

export function KneePanel() {
  const { res } = useDesign();
  if (!res || res.fatal) return null;
  const k = res.mods.knee;
  if (!k.use) return <Card><p>No knee braces.</p></Card>;
  return (
    <>
      <div className="rgrid">
        <Card>
          <h3>Knee brace <Pill st={CHK.overall(k.checks).status} /></h3>
          <Html html={res.svg?.knee ?? ''} />
        </Card>
        <Card>
          <h3>Forces (ULS)</h3>
          <KvTable
            rows={[
              ['Horizontal force at beam level H', k.H / 1e3, 'kN', 2], ['Brace axial force N', (k.N || 0) / 1e3, 'kN', 2],
              ['Column moment from the brace', (k.Mcol || 0) / 1e6, 'kNm', 3], ['Notional sway φ', k.phi, '', 5],
            ]}
          />
          <p className="hint">{k.note || ''}</p>
        </Card>
      </div>
      <Checks list={k.checks} title="Knee brace checks" />
    </>
  );
}

export function DeckPanel() {
  const { res } = useDesign();
  if (!res || res.fatal) return null;
  const dv = res.mods.deck.vert;
  const mbGov = res.mods.mb.gov;
  return (
    <>
      <Checks list={dv.checks} title="Surface: bending, deflection and concentrated load" />
      {['sbi', 'sbe'].map((k) => {
        const d = res.mods[k];
        if (!(d && d.restrInfo && d.restrInfo.deck)) return null;
        return (
          <Card key={k}>
            <h3>Surface as restraint to {k === 'sbi' ? 'SB-Int' : 'SB-End'}</h3>
            <p>{d.restrInfo.deck.status}.</p>
            <Checks list={d.restrInfo.deck.checks} title="Restraint checks" />
          </Card>
        );
      })}
      {mbGov && mbGov.spec.deckR && (
        <Card>
          <h3>Surface on the main beam</h3>
          <Checks list={mbGov.spec.deckR.checks} title="Restraint checks" />
        </Card>
      )}
    </>
  );
}

export function BracPanel() {
  const { res } = useDesign();
  if (!res || res.fatal) return null;
  const rows: React.ReactNode[] = [];
  for (const [k, l] of [['mb', 'Main beam'], ['sbi', 'SB-Int'], ['sbe', 'SB-End']] as const) {
    const d = k === 'mb' ? res.mods.mb.gov : res.mods[k];
    if (!d || d.error) continue;
    const all = [...(d.spec.restr.lat || []), ...(d.spec.restr.latC || []), ...(d.spec.restr.tor || []), ...(d.spec.restr.torC || [])];
    if (!all.length) rows.push(<tr key={k + 'f'}><td>{l}</td><td>Fork supports only</td><td>–</td><td>no intermediate restraint offered</td></tr>);
    const seen = new Set<string>();
    for (const r of all) {
      const key = r.label.replace(/ at \d+ mm/, '');
      if (seen.has(key + r.credited)) continue;
      seen.add(key + r.credited);
      rows.push(
        <tr key={k + key + r.credited}>
          <td>{l}</td><td>{key}</td>
          <td>{r.credited ? <b className="ok">credited</b> : <b className="no">not credited</b>}</td>
          <td>{r.why || ''}</td>
        </tr>,
      );
    }
  }
  return (
    <>
      <Card>
        <h3>Restraint register</h3>
        <p className="hint">A restraint is credited only when its stiffness enters the LTB / torsion model and its strength is checked; everything else is listed as not credited.</p>
        <table className="rt">
          <tbody>
            <tr><th>Member</th><th>Restraint</th><th>Status</th><th>Reason</th></tr>
            {rows}
          </tbody>
        </table>
      </Card>
      <Checks list={res.mods.brac.checks} title="Bracing checks" />
    </>
  );
}
