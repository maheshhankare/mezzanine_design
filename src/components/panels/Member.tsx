'use client';

import { SK } from '@/engine/svg';
import { useDesign } from '@/state/DesignProvider';
import { F, UL, UVx } from '@/lib/format';
import { Card, Checks, Html, KvTable, Pill } from '../common';

// ULS torque per metre from the eccentric UDL
const mTof = (d: any) => {
  const c = d.comb || { aG: 1, aQ: 1 },
    w = (d.spec.G.udl[0] ? c.aG * d.spec.G.udl[0].w : 0) + (d.spec.Q.udl[0] ? c.aQ * d.spec.Q.udl[0].w : 0);
  return (w * (d.spec.eUdl || 0)) / 1e3;
};

// how the knee braces enter this beam's analysis (shown with the analysis model)
function kneeTxt(d: any, I: any): string {
  const g = d.uls && d.uls[0] && d.uls[0].ga,
    sp = d.spec.knees;
  if (g)
    return `; analysed in its frame line (global frame analysis: columns, joints${(d.uls[0].kneeX || []).length ? ', knee braces at ' + d.uls[0].kneeX.map((x: number) => F(x, 0)).join(', ') + ' mm' : ', no knee braces in this line'}, bracing)`;
  if (sp)
    return `; knee braces at ${sp.map((k: any) => F(k.x, 0)).join(', ')} mm as elastic supports, k = sin²θ / (1/k_a + cos²θ/k_b) = ${UVx(sp[0].k / 1e3, 'kN/mm', 'k', 2).txt} ${UL('kN/mm', 'k')} (brace k_a = E·A/L_KB = ${UVx(sp[0].ka / 1e3, 'kN/mm', 'k', 2).txt}, beam axial k_b = ${UVx(sp[0].kb / 1e3, 'kN/mm', 'k', 2).txt} ${UL('kN/mm', 'k')})`;
  if (I.k_use === 'yes' && I.k_an === 'no') return '; knee braces not in the beam analysis (Knee tab: “Knee braces in the beam analysis” = No)';
  if (I.k_use === 'yes') return `; no knee braces on this beam (Knee tab: braces connect the column to the ${I.k_to === 'mb' ? 'main beam' : 'SB-End'})`;
  return '';
}

export function MemberPanel({ k }: { k: 'mb' | 'sbi' | 'sbe' }) {
  const { res, I } = useDesign();
  if (!res || res.fatal) return null;
  const d = k === 'mb' ? res.mods.mb.gov : res.mods[k];
  if (!d) return <Card><p>{k === 'sbi' ? 'No SB-Int in this layout (number per span = 0).' : 'Not analysed.'}</p></Card>;
  if (d.error) return <Card bad><p>{d.error}</p></Card>;
  const p = d.spec.p,
    g = d.gross,
    arr = d.spec.arr,
    opt = d.spec.opt;
  const cn = res.mods.conn[k === 'mb' ? 'cm' : k === 'sbi' ? 'ci' : 'ce'];
  const props: any[] = [
    ['A', g.A, 'mm²', 1], ['Mass', g.mass, 'kg/m', 2], ['I_y (major)', g.Iyy / 1e4, 'cm⁴', 1], ['I_z (minor)', g.Izz / 1e4, 'cm⁴', 2], ['I_t', g.It / 1e4, 'cm⁴', 4], ['I_w', g.Iw / 1e6, 'cm⁶', 0],
    ['W_el,y', g.Wy / 1e3, 'cm³', 2], ['W_pl,y', (g.Wpl_y || NaN) / 1e3, 'cm³', 2], ['W_el,z', g.Wz / 1e3, 'cm³', 2], ['i_y', g.iy, 'mm', 1], ['i_z', g.iz, 'mm', 1],
    ['Centroid y_c (from the web centre-line / pair centre)', g.yc, 'mm', 2], ['Centroid z_c (from the bottom flange centre-line)', g.zc, 'mm', 1], ['Shear centre y_sc', g.ysc, 'mm', 2], ['Shear centre z_sc', g.zsc, 'mm', 1],
    ['Principal axis angle α', (g.alpha * 180) / Math.PI, '°', 2], ['I_1 / I_2', `${F(g.I1 / 1e4, 1)} / ${F(g.I2 / 1e4, 2)}`, 'cm⁴'],
  ];
  if (arr === 'quad' && g.IzzNonComposite) props.push(['I_z without pair-to-pair action', g.IzzNonComposite / 1e4, 'cm⁴', 1]);
  const e = d.eff || {};
  const effRows: any[] = [
    ['W_eff,y sagging', e.WeffP / 1e3, 'cm³', 2], ['W_eff,y hogging', e.WeffN / 1e3, 'cm³', 2], ['M_c,Rd sagging', e.McRdP / 1e6, 'kNm', 2], ['M_c,Rd hogging', e.McRdN / 1e6, 'kNm', 2],
    ['A_eff (uniform compression)', e.Aeff, 'mm²', 1], ['N_c,Rd', e.NcRd / 1e3, 'kN', 1], ['V_b,Rd', e.VbRd / 1e3, 'kN', 1],
    ['M_cr (credited restraints)', d.Mcr / 1e6, 'kNm', 2], ['M_cr (forks only)', d.Mcr0 / 1e6, 'kNm', 2], ['Torsion amplification 1/(1 − M/M_cr)', isFinite(d.amp) ? d.amp : 'unstable', '', 3],
  ];
  const rows = [...(d.spec.restr.lat || []), ...(d.spec.restr.latC || []), ...(d.spec.restr.tor || []), ...(d.spec.restr.torC || [])];
  const lp = d.spec.lp || {};
  props.push(
    ['Centroid CG (y, z)', `${F(lp.yc, 1)}, ${F(lp.zc, 1)}`, 'mm'], ['Shear centre SC (y, z)', `${F(lp.ysc, 1)}, ${F(lp.zsc, 1)}`, 'mm'],
    ['CG − SC (Δy, Δz)', `${F(lp.dyc, 1)}, ${F(lp.dzc, 1)}`, 'mm'], ['Load convention', lp.label || '–', ''], ['Load line to SC e', lp.e, 'mm', 1],
  );
  const eccTxt =
    k !== 'mb'
      ? `Load ${lp.label}: eccentricity to the shear centre e = ${F(d.spec.eUdl, 1)} mm (ULS torque ${F(Math.abs(mTof(d)), 3)} kNm/m); LTB load height ${F(d.spec.loadA, 1)} mm above the shear centre.`
      : `SB-Int reactions applied ${F(d.spec.pointA, 1)} mm above the shear centre; torque per SB-Int ${F((d.spec.torques[0] || { TQ: 0 }).TQ / 1e6, 3)} kNm (imposed, one side).`;
  const loads =
    k === 'mb'
      ? `Line: ${d.spec.line} (${d.spec.sides} side${d.spec.sides > 1 ? 's' : ''}). SB-Int reaction per side G ${F(res.load.RsbiG.G / 1e3, 2)} kN, Q ${F(res.load.RsbiG.Q / 1e3, 2)} kN.`
      : `Tributary width ${F(d.spec.trib, 0)} mm: g_k ${F(d.spec.wG, 3)} kN/m (incl. self-weight), q_k ${F(d.spec.wQ, 3)} kN/m.`;

  return (
    <>
      <div className="rgrid">
        <Card>
          <h3>Section <Pill st={d.overall.status} /></h3>
          <Html html={SK.section(p, arr, opt, g, { lp: d.spec.lp, mT: mTof(d) })} />
          <KvTable rows={props} caption="Gross properties (calculated)" />
        </Card>
        <Card>
          <h3>End connection holes</h3>
          {cn && (
            <>
              <Html html={SK.webHoles(cn.geo, cn.adj)} />
              <p className="hint">Holes from the {cn.typeName} (Connections tab). They are not perforations: no Sigma geometry or perforation reduction is used anywhere.</p>
            </>
          )}
          <KvTable rows={effRows} caption="Effective section and stability (calculated)" />
          {(d.notes || []).map((n: string, i: number) => <p className="note" key={i}>{n}</p>)}
        </Card>
      </div>
      <Card>
        <h3>Analysis model</h3>
        <p>
          {d.spec.title}: span {F(d.spec.L, 0)} mm, supports at {d.spec.supports.map((x: number) => F(x, 0)).join(', ')} mm (
          {d.spec.endKr ? 'semi-rigid ends, S_j = ' + UVx(d.spec.endKr / 1e6, 'kN·m/rad', 'S_j', 1).txt + ' ' + UL('kN·m/rad') : 'pinned ends'}){kneeTxt(d, I)}. {loads} {eccTxt} ULS: {d.comb ? d.comb.text : ''}.
        </p>
        <Html html={SK.beam(d)} />
        <h4>Restraints in the LTB / torsion model</h4>
        {rows.length ? (
          <table className="rt">
            <tbody>
              <tr><th>Restraint</th><th>Stiffness</th><th>Height a above SC</th><th>Credited</th><th>Reason</th></tr>
              {rows.map((r: any, i: number) => (
                <tr key={i}>
                  <td>{r.label}</td>
                  <td className="num">{F(r.k, 0)}</td>
                  <td className="num">{r.a !== undefined ? F(r.a, 1) : '–'}</td>
                  <td>{r.credited ? <b className="ok">yes</b> : <b className="no">no</b>}</td>
                  <td>{r.why || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No intermediate restraints: fork supports only.</p>
        )}
      </Card>
      <Checks list={d.checks} title={d.spec.title + ' checks'} />
    </>
  );
}

