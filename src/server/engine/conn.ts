// @ts-nocheck — ported from the mockup (index.html, 60_conn.js). IS 800:2007 only: Section 10 (connections) is NOT verified in the code register, so every connection check that
// cites it is reported as REVIEW by CHK.mk (indicative values); provisions of the removed design route were deleted and the joint stiffness / classification, end-plate prying,
// column-wall and thin-sheet components are pending.
import "server-only";
import { U } from '@/shared/util';
import { CHK } from '@/shared/check';
import { MEM } from './member';
// ===== Connection engine: C-type (fin), U-type (U-cleat), angle cleat, end plate, welded, bolted-and-welded =====
// Coordinates on the supported C web: z from the top of the C (down +), y from the C end (away from the support +).
export const CONN: any = (() => {
  const s = CHK.s, kN = x => x / 1e3;
  const TYPES = {
    fin: { name: 'C-type fin plate (welded to the support, C web bolted, single shear)', cBolts: true, sBolts: false, plate: true, weldSup: true, weldC: false, planes: 1 },
    ucleat: { name: 'U-type cleat (welded to the support, C web between the legs, double shear)', cBolts: true, sBolts: false, plate: true, weldSup: true, weldC: false, planes: 2 },
    angle: { name: 'Angle cleat (bolted to the support and to the C web)', cBolts: true, sBolts: true, plate: true, weldSup: false, weldC: false, planes: 1 },
    endplate: { name: 'End plate (welded to the C end, bolted to the support)', cBolts: false, sBolts: true, plate: false, weldSup: false, weldC: true, planes: 1 },
    welded: { name: 'Welded (C web fillet-welded to a plate welded to the support)', cBolts: false, sBolts: false, plate: true, weldSup: true, weldC: true, planes: 1 },
    boltweld: { name: 'Bolted-and-welded (cleat welded to the C web, bolted to the support)', cBolts: false, sBolts: true, plate: true, weldSup: false, weldC: true, planes: 1 }
  };
  const d0auto = (d, hole) => (hole === 'oversize' ? (d <= 14 ? d + 3 : d + 4) : d <= 14 ? d + 1 : d + 2);

  function design(x) {
    const { R, P, c, mem, sup } = x; // c = connection inputs (prefix removed)
    const T = TYPES[c.type] || TYPES.fin, checks = [], msgs = [], add = k => { checks.push(k); return k; };
    const grp = x.title;
    const p = mem.p, t = p.t, H = p.H, nWebs = mem.arr === 'single' ? 1 : 2, tWeb = nWebs * t; // bearing thickness of the supported web(s)
    const d = +c.d, d0 = c.d0 > 0 ? +c.d0 : d0auto(d, c.hole), dw = c.wsh === 'std' ? 2 * d + 0 : 1.6 * d; // washer OD ≈ 2d, else head ≈ 1.6 d
    const nv = Math.round(c.nv), nh = T.cBolts ? Math.round(c.nh) : 0, nb = nv * nh;
    const zs = U.range(nv, i => +c.z1 + i * c.p1), ys = U.range(Math.max(nh, 1), j => +c.es + j * c.p2);
    const zg = (zs[0] + zs[zs.length - 1]) / 2, yg = (ys[0] + ys[ys.length - 1]) / 2;
    const flat0 = t + p.r, flat1 = H - t - p.r; // flat web from the top
    const offMB = sup.kind === 'mb' ? sup.mb.p.Bt : 0; // a C framing into the main-beam web stops at the main flange tips
    const gapTot = offMB + (+c.gap);
    const e = gapTot + (T.cBolts ? yg : (T.weldC ? (+c.bp - gapTot) / 2 + gapTot : 0)); // support face / bolt line to the C-side group centroid
    const V = x.V, N = Math.max(0, x.N || 0), Mj = x.Mj || 0;
    const eccToSupport = x.eccTo === 'mb';
    const Mc = (eccToSupport ? 0 : V * e) + Mj; // moment on the C-side group
    const thin = t < 3;
    const fy = mem.fy, fu = mem.fu, pfy = +c.pfy, pfu = +c.pfu, tp = +c.tp, hp = +c.hp, zp = +c.zp, bp = +c.bp;
    const geo = { type: c.type, H, t, r: p.r, B: p.Bt, C: p.Ct, zs, ys, d, d0, dw, tp, hp, zp, bp, gapTot, offMB, e, zg, yg, nWebs, sup: sup.kind, adj: [] };
    // ---------- geometry feasibility ----------
    const pmin = 2.5 * d, emin = 1.5 * d0, e2min = 1.5 * d0; // IS 800:2007 10.2.2 (pitch ≥ 2.5 d), 10.2.4.2 (edge distance ≥ 1.5 d_0): not verified in the register
    const feas = [], warn = [];
    if (T.cBolts) {
      if (zs[0] - dw / 2 < flat0 - 1e-6) feas.push(`First bolt too close to the top flange: washer edge at ${U.fmt(zs[0] - dw / 2, 1)} mm, flat web starts at ${U.fmt(flat0, 1)} mm`);
      if (zs[zs.length - 1] + dw / 2 > flat1 + 1e-6) feas.push(`Last bolt too close to the bottom flange: washer edge at ${U.fmt(zs[zs.length - 1] + dw / 2, 1)} mm, flat web ends at ${U.fmt(flat1, 1)} mm`);
      if (nv > 1 && c.p1 < pmin - 1e-6) feas.push(`p_1 = ${c.p1} < ${U.fmt(pmin, 1)} mm (IS 800:2007 10.2.2: 2.5 d)`);
      if (nh > 1 && c.p2 < pmin - 1e-6) feas.push(`p_2 = ${c.p2} < ${U.fmt(pmin, 1)} mm`);
      if (c.es < Math.max(emin, e2min) - 1e-6) feas.push(`End distance e_s = ${c.es} < ${U.fmt(Math.max(emin, e2min), 1)} mm (C end)`);
    }
    // maximum number of rows that fit
    const zLastMax = flat1 - dw / 2, nMax = T.cBolts ? Math.max(0, Math.floor((zLastMax - Math.max(+c.z1, flat0 + dw / 2)) / Math.max(pmin, 1)) + 1) : 0;
    // plate edges
    let eP1t = NaN, eP1b = NaN, eP2 = NaN;
    if (T.plate && T.cBolts) {
      eP1t = zs[0] - zp; eP1b = zp + hp - zs[zs.length - 1]; eP2 = bp - (gapTot + ys[ys.length - 1]);
      const pe = 1.5 * d0;
      if (eP1t < pe - 1e-6) feas.push(`Plate top edge to the first bolt ${U.fmt(eP1t, 1)} < 1.5 d_0 = ${U.fmt(pe, 1)} mm`);
      if (eP1b < pe - 1e-6) feas.push(`Plate bottom edge to the last bolt ${U.fmt(eP1b, 1)} < 1.5 d_0 = ${U.fmt(pe, 1)} mm`);
      if (eP2 < pe - 1e-6) feas.push(`Plate free edge to the bolt column ${U.fmt(eP2, 1)} < 1.5 d_0 = ${U.fmt(pe, 1)} mm (increase the projection b_p)`);
    }
    if (zp < 0 || zp + hp > H + 1e-6) feas.push(`The plate (${zp} … ${zp + hp} mm) extends beyond the C depth ${H} mm`);
    if (c.type === 'ucleat' && (zp < flat0 || zp + hp > flat1)) feas.push(`U-cleat: the inner leg must fit the flat web between the C flanges (${U.fmt(flat0, 1)} … ${U.fmt(flat1, 1)} mm)`);
    if (sup.kind === 'mb' && (c.type === 'angle' || c.type === 'boltweld' || c.type === 'fin' || c.type === 'ucleat')) {
      const mp = sup.mb.p, lo = mp.Ct + 3, hi = mp.H - mp.Cb - 3;
      if (zp < lo || zp + hp > hi) feas.push(`The cleat passes the main-beam flange tips: it must lie between the main-beam lips (${U.fmt(lo, 0)} … ${U.fmt(hi, 0)} mm from the top)`);
      if (H > mp.H) feas.push('The secondary is deeper than the main beam (top flush): check the soffit clash.');
    }
    if (c.hole === 'slotV') msgs.push('Vertical slots are parallel to the vertical reaction: with non-preloaded bolts the joint can slip along the slot.');
    // ---------- additional (adjustment) holes ----------
    const adj = adjHoles(c, p, d0, zs, ys, thin, T.cBolts);
    geo.adj = adj.holes;
    // ---------- resistances ----------
    const planes = T.planes;
    const bs = P.boltShear(d, c.bg, planes, c.thr === 'yes', nv > 1 ? (nv - 1) * +c.p1 : 0, tWeb + tp * planes);
    // bolt forces on the C-side group (elastic, polar)
    let Fb = 0, Fv1 = 0, Fh1 = 0, Ip = 0;
    if (T.cBolts) {
      for (const z of zs) for (const y of ys) Ip += (z - zg) ** 2 + (y - yg) ** 2;
      for (const z of zs) for (const y of ys) {
        const fv = V / nb + (Ip > 0 ? Math.abs(Mc) * Math.abs(y - yg) / Ip : 0), fh = N / nb + (Ip > 0 ? Math.abs(Mc) * Math.abs(z - zg) / Ip : 0);
        const f = Math.hypot(fv, fh); if (f > Fb) { Fb = f; Fv1 = fv; Fh1 = fh; }
      }
    }
    const forceSteps = [s('V_Ed', 'reaction', kN(V), 'kN'), s('N_Ed', 'axial / restraint force', kN(N), 'kN'), s('e', 'support line to the bolt-group centroid', e, 'mm'), s('M_Ed', (eccToSupport ? '' : 'V e') + (Mj ? ' + M_j' : ''), Mc / 1e6, 'kNm'), s('ΣR²', '', Ip, 'mm²'), s('F_b,Ed', 'max √((V/n + M Δy/ΣR²)² + (N/n + M Δz/ΣR²)²)', kN(Fb), 'kN')];
    const why = {
      shear: 'The bolt shank shears.', bearC: 'The thin C web ovalises / tears in front of the bolt.', bearP: 'The plate yields in bearing at the hole.', net: 'The C web tears along the line of holes.',
      block: 'A block of plate tears out (shear along the bolts + tension across).', bend: 'The plate yields in bending from the eccentricity V·e.', weld: 'The weld throat fails.', thinW: 'The thin sheet tears beside the weld.'
    };
    const fix = { shear: 'Larger or higher-grade bolts, or more bolts.', bearC: 'Thicker C, larger edge distance e_s, more bolt rows, or a U-cleat (double shear spreads to both faces) – bearing on a thin web does not improve with the bolt grade.', bearP: 'Thicker plate.', net: 'Fewer holes in one line or a thicker web.', block: 'Larger edge distances or plate depth.', bend: 'Thicker / deeper plate, or reduce the projection.', weld: 'Larger throat or longer welds.', thinW: 'Bolt instead of weld to the thin sheet, or a thicker section.' };
    if (T.cBolts) {
      add(CHK.mk({ grp, name: `Bolt shear (C web bolts, ${planes} shear plane${planes > 1 ? 's' : ''})`, clause: bs.clause, Ed: Fb, Rd: bs.Rd, unit: 'kN', fmt: kN, steps: [...forceSteps, ...bs.steps], basis: bs.basis || 'code', eq: 'F_b,Ed ≤ F_v,Rd', why: why.shear, fix: fix.shear }));
      // bearing on the C web
      const eC1 = +c.es, eC2 = Math.min(zs[0], H - zs[zs.length - 1]) - flat0;
      const b1 = thin ? P.bearingThin(d, d0, tWeb > t && nWebs > 1 ? t : t, fu, eC1, eC2, nv > 1 ? +c.p1 : 0, nh > 1 ? +c.p2 : 0) : P.bearingPlate(d, d0, t, fu, c.bg, eC1, eC2, nv > 1 ? +c.p1 : 0, nh > 1 ? +c.p2 : 0, c.hole);
      const bRdC = b1.Rd * nWebs;
      add(CHK.mk({ grp, name: `Bearing on the C web${nWebs > 1 ? 's (' + nWebs + ' webs)' : ''}`, clause: b1.clause, Ed: Fb, Rd: bRdC, unit: 'kN', fmt: kN, steps: [s('e_1 (to the C end)', '', eC1, 'mm'), s('e_2 (to the flange corner)', '', eC2, 'mm'), ...b1.steps], basis: b1.basis || 'code', note: b1.note || '', eq: 'F_b,Ed ≤ F_b,Rd', why: why.bearC, fix: fix.bearC }));
      // bearing on plate / legs
      const legs = c.type === 'ucleat' ? 2 : 1, eP1 = Math.min(eP1t, eP1b, eP2), eP2b = Math.min(eP1t, eP2);
      const bp1 = P.bearingPlate(d, d0, tp, pfu, c.bg, eP1, eP2b, nv > 1 ? +c.p1 : 0, nh > 1 ? +c.p2 : 0, c.hole);
      add(CHK.mk({ grp, name: `Bearing on the ${c.type === 'ucleat' ? 'U-cleat legs (V/2 each)' : c.type === 'angle' ? 'angle leg' : 'plate'}`, clause: bp1.clause, Ed: Fb / legs, Rd: bp1.Rd, unit: 'kN', fmt: kN, steps: [s('e (min edge)', '', eP1, 'mm'), ...bp1.steps], eq: 'F_b,Ed ≤ F_b,Rd', why: why.bearP, fix: fix.bearP }));
      // net shear of the C web along the bolt column (with adjustment holes in the same line)
      const hNet = (H - 2 * t) - nv * d0 - adj.inBoltLine * adj.dv;
      const sr = P.shearRupture(hNet * t * nWebs, fu);
      add(CHK.mk({ grp, name: 'C web net shear along the bolt column (incl. adjustment holes in that line)', clause: sr.clause, Ed: V, Rd: sr.Rd, unit: 'kN', fmt: kN, basis: sr.basis || 'code', steps: [s('h_net', `(H − 2t) − ${nv} d_0${adj.inBoltLine ? ` − ${adj.inBoltLine} adjustment holes` : ''}`, hNet, 'mm'), ...sr.steps], why: why.net, fix: fix.net }));
      if (adj.n > 0 && !adj.inBoltLine) {
        const h2 = (H - 2 * t) - adj.n * adj.dv, sr2 = P.shearRupture(h2 * t * nWebs, fu);
        add(CHK.mk({ grp, name: 'C web net shear along the adjustment-hole line', clause: sr2.clause, Ed: V, Rd: sr2.Rd, unit: 'kN', fmt: kN, basis: sr2.basis || 'code', steps: [s('h_net', `(H − 2t) − ${adj.n} × ${U.fmt(adj.dv, 1)}`, h2, 'mm'), ...sr2.steps] }));
      }
      if (N > 0) add(CHK.pending({ grp, name: 'C web net section in tension (restraint force)', clause: 'IS 800:2007 6.3', Ed: N, unit: 'kN', fmt: kN }, 'Rupture of the net section (6.3) is pending in the code register and the thin-web rule needs IS 801.'));
      else add(CHK.na({ grp, name: 'C web net section in tension', clause: '' }, 'No axial tension in this connection.'));
      add(CHK.na({ grp, name: 'Block tearing of the C web', clause: 'IS 800:2007 6.4' }, 'Uncoped C: the flanges are continuous above and below the bolt group, so no tear-out block can form; tear-out towards the C end is covered by the bearing check with e_1 = e_s.'));
      if (c.hole === 'slotV') add(CHK.mk({ grp, name: 'Slotted holes parallel to the reaction', clause: 'IS 800:2007 10.4 (slip-resistant connection)', review: true, note: 'Use preloaded bolts designed for slip, or turn the slot horizontal.', why: 'The joint can slip along the slot.', fix: 'Preloaded bolts or horizontal slots.' }));
    } else {
      add(CHK.na({ grp, name: 'C web bolts (shear, bearing, net section)', clause: '' }, 'No bolts in the C web for this arrangement.'));
    }
    // ---------- plate checks ----------
    if (T.plate) {
      const legs = c.type === 'ucleat' ? 2 : 1, Vp = V / legs, Mp = (eccToSupport ? 0 : Vp * e) + Mj / legs;
      const Av = hp * tp, sy = P.shearYield(Av, pfy);
      add(CHK.mk({ grp, name: `Plate gross shear${legs > 1 ? ' (per leg)' : ''}`, clause: sy.clause, Ed: Vp, Rd: sy.Rd, unit: 'kN', fmt: kN, steps: [s('A_v', 'h_p t_p', Av, 'mm²'), ...sy.steps] }));
      if (T.cBolts) {
        const sn = P.shearRupture((hp - nv * d0) * tp, pfu);
        add(CHK.mk({ grp, name: 'Plate net shear', clause: sn.clause, Ed: Vp, Rd: sn.Rd, unit: 'kN', fmt: kN, basis: sn.basis || 'code', steps: sn.steps }));
        const Anv = tp * (hp - eP1t - (nv - 0.5) * d0), Ant = tp * (eP2 + (nh - 1) * c.p2 - (nh - 0.5) * d0);
        const bk = P.blockShear(Math.max(0, Anv), Math.max(0, Ant), pfy, pfu, true);
        add(CHK.mk({ grp, name: 'Plate block tearing', clause: bk.clause, Ed: Vp, Rd: bk.Rd, unit: 'kN', fmt: kN, steps: bk.steps, why: why.block, fix: fix.block }));
      }
      const W = tp * hp * hp / 6, Vpl = sy.Rd, rho = Vp > 0.5 * Vpl ? (2 * Vp / Vpl - 1) ** 2 : 0, pb = P.plateBending(W, pfy, rho);
      add(CHK.mk({ grp, name: `Plate bending at the support face (V e)${legs > 1 ? ' per leg' : ''}`, clause: pb.clause, Ed: Mp, Rd: pb.Rd, unit: 'kNm', fmt: x => x / 1e6, steps: [s('e', '', e, 'mm'), s('W_el', 't_p h_p²/6', W, 'mm³'), ...pb.steps], why: why.bend, fix: fix.bend }));
      if (e > tp / 0.15) {
        add(CHK.pending({ grp, name: `Long plate: lateral-torsional buckling${legs > 1 ? ' per leg' : ''}`, clause: 'IS 800:2007 8.2.2', Ed: Mp, unit: 'kNm', fmt: x => x / 1e6, steps: [s('L', 'e (support face to the bolt-group centroid)', e, 'mm')], why: 'A long slender plate can buckle laterally under the eccentric shear.', fix: 'Thicker plate or a shorter projection.' }, 'The lateral-torsional buckling of a plate (IS 800 8.2.2 for rectangular sections) is not verified in the code register.'));
      } else add(CHK.na({ grp, name: 'Long plate stability', clause: '' }, `Short plate: e ≤ t_p/0.15 = ${U.fmt(tp / 0.15, 0)} mm.`));
    } else add(CHK.na({ grp, name: 'Plate / cleat checks', clause: '' }, 'No separate plate in this arrangement.'));
    // ---------- welds ----------
    const Lw = c.Lw > 0 ? +c.Lw : hp, nw = Math.round(c.nw), a = +c.a;
    if (T.weldSup) {
      if (!(a > 0)) add(CHK.mk({ grp, name: 'Weld of the plate to the support', clause: 'IS 800:2007 10.5', eta: Infinity, note: 'Weld throat a = 0.', fix: 'Enter the weld throat.' }));
      else {
        const Mw = eccToSupport ? V * e + Mj : Mj + (c.type === 'fin' || c.type === 'ucleat' || c.type === 'welded' ? V * e : 0);
        const vL = V / (nw * Lw), mL = Mw / (nw * Lw * Lw / 6), nL = N / (nw * Lw), f = Math.hypot(vL, mL + nL);
        const supFu = sup.kind === 'col' ? Math.min(pfu, sup.col.fu) : Math.min(pfu, sup.mb.fu);
        const wr = P.weldPerLength(a, supFu);
        add(CHK.mk({ grp, name: 'Weld of the plate to the support (elastic weld group)', clause: wr.clause, Ed: f, Rd: wr.Rd, unit: 'N/mm', fmt: x => x, basis: wr.basis || 'code',
          steps: [s('L_w × n_w', '', `${U.fmt(Lw, 0)} × ${nw}`, 'mm'), s('v (shear)', 'V/(n L)', vL, 'N/mm'), s('m (bending)', 'M/(n L²/6)', mL, 'N/mm'), s('n (axial)', 'N/(n L)', nL, 'N/mm'), s('f_w,Ed', '√(v² + (m + n)²)', f, 'N/mm'), ...wr.steps], eq: 'f_w,Ed ≤ F_w,Rd', why: why.weld, fix: fix.weld }));
        if (sup.kind === 'mb') {
          const th = P.weldThin(sup.mb.p.t, Lw, sup.mb.p.H, sup.mb.fu);
          add(CHK.mk({ grp, name: 'Thin main-beam web beside the weld', clause: th.clause, Ed: V / nw, Rd: th.Rd, unit: 'kN', fmt: kN, basis: th.basis || 'code', steps: th.steps, why: why.thinW, fix: fix.thinW }));
        }
      }
    }
    if (T.weldC) {
      const lap = Math.max(10, bp - gapTot); // weld group on the C web: vertical line at the C end (h_p) + two horizontal lines (lap)
      const L1 = c.type === 'endplate' ? H - 2 * (t + p.r) : hp, L2 = c.type === 'endplate' ? 0 : lap;
      const Ltot = nw > 1 && c.type === 'endplate' ? 2 * L1 : L1 + 2 * L2;
      const ex = c.type === 'endplate' ? 0 : (L2 * L2) / (L1 + 2 * L2); // centroid of the group from the vertical line
      const Iw_ = c.type === 'endplate' ? (nw > 1 ? 2 : 1) * L1 ** 3 / 12 : L1 ** 3 / 12 + L1 * ex * ex + 2 * (L2 ** 3 / 12 + L2 * (L2 / 2 - ex) ** 2) + 2 * L2 * (L1 / 2) ** 2;
      const ecc = c.type === 'endplate' ? 0 : (eccToSupport ? 0 : gapTot + (L2 - ex));
      const Mw = V * ecc + Mj, rmax = Math.hypot(Math.max(ex, L2 - ex), L1 / 2);
      const fv = V / Ltot + Mw * Math.max(ex, L2 - ex) / Iw_, fh = N / Ltot + Mw * (L1 / 2) / Iw_, f = Math.hypot(fv, fh);
      const wr = P.weldPerLength(a, Math.min(fu, pfu));
      if (!(a > 0)) add(CHK.mk({ grp, name: 'Weld to the C', clause: 'IS 800:2007 10.5', eta: Infinity, note: 'Weld throat a = 0.' }));
      else {
        add(CHK.mk({ grp, name: 'Weld group on the C (throat)', clause: wr.clause, Ed: f, Rd: wr.Rd, unit: 'N/mm', fmt: x => x, steps: [s('weld group', c.type === 'endplate' ? 'web welds both sides' : 'end line + 2 lap lines', Ltot, 'mm'), s('M_w', 'V e_w + M_j', Mw / 1e6, 'kNm'), s('f_w,Ed', '', f, 'N/mm'), ...wr.steps] }));
        if (thin || t <= 4) {
          const th = P.weldThin(t, L1, H, fu), thE = c.type === 'endplate' ? (nw > 1 ? 2 : 1) * th.Rd : th.Rd + 2 * P.weldThin(t, L2, H, fu).Rd;
          add(CHK.mk({ grp, name: 'Thin C web tearing beside the welds', clause: th.clause, Ed: f * Ltot, Rd: thE, unit: 'kN', fmt: kN, basis: 'approx', steps: th.steps, note: 'Demand = peak weld force per length (elastic group incl. moment) × total weld length (conservative).', why: why.thinW, fix: fix.thinW }));
        }
      }
    }
    // ---------- support-side bolts (angle / end plate / bolted-and-welded) ----------
    let Ks = Infinity;
    if (T.sBolts) {
      const nvs = Math.round(c.nvs), cols = c.type === 'endplate' ? 2 : 1, ns = nvs * cols;
      const Vb = V / ns, Mt = eccToSupport ? V * e : 0;
      const zsS = U.range(nvs, i => +c.z1 + i * c.p1), zgS = (zsS[0] + zsS[nvs - 1]) / 2; let IpS = 0; for (const z of zsS) IpS += cols * (z - zgS) ** 2;
      const Ft = N / ns + (IpS > 0 ? Mt * (Math.max(...zsS) - zgS) / IpS : 0); // tension from N and (if eccentricity sent to the support) the out-of-plane moment
      const bS = P.boltShear(d, c.bg, 1, c.thr === 'yes'), bT = P.boltTension(d, c.bg);
      add(CHK.mk({ grp, name: 'Support-side bolts: shear', clause: bS.clause, Ed: Vb, Rd: bS.Rd, unit: 'kN', fmt: kN, steps: [s('n', 'support-side bolts', ns), s('V/n', '', kN(Vb), 'kN'), ...bS.steps] }));
      if (Ft > 0) {
        const combIS = (Vb / bS.Rd) ** 2 + (Ft / bT.Rd) ** 2;
        add(CHK.mk({ grp, name: 'Support-side bolts: shear + tension', clause: 'IS 800:2007 10.3.6 (combined shear and tension)', eta: Math.max(combIS, Ft / bT.Rd), steps: [s('F_t,Ed', 'N/n (+ M/ΣR²)', kN(Ft), 'kN'), s('(V/V_db)² + (T/T_db)²', '', combIS), ...bT.steps] }));
      }
      // bearing on the cleat / end plate
      const bpl = P.bearingPlate(d, d0, tp, pfu, c.bg, Math.min(+c.z1 - zp, 1.5 * d0 + 10), (+c.gs) / 2, nvs > 1 ? +c.p1 : 0, 0);
      add(CHK.mk({ grp, name: 'Support-side bolts: bearing on the cleat / end plate', clause: bpl.clause, Ed: Vb, Rd: bpl.Rd, unit: 'kN', fmt: kN, steps: bpl.steps }));
      if (sup.kind === 'mb') {
        const mp = sup.mb.p, nwM = sup.mb.arr === 'single' ? 1 : 2, tM = mp.t;
        const bm = mp.t < 3 ? P.bearingThin(d, d0, tM, sup.mb.fu, 3 * d0, 1.5 * d0, nvs > 1 ? +c.p1 : 0, 0) : P.bearingPlate(d, d0, tM, sup.mb.fu, c.bg, 3 * d0, 1.5 * d0, nvs > 1 ? +c.p1 : 0, 0);
        add(CHK.mk({ grp, name: `Bearing on the main-beam web${nwM > 1 ? 's (bolts through both webs)' : ''}`, clause: bm.clause, Ed: Vb * (x.bothSides ? 2 : 1), Rd: bm.Rd * nwM, unit: 'kN', fmt: kN, basis: bm.basis || 'code', steps: bm.steps, note: x.bothSides ? 'Through-bolts shared by the SB-Int on both sides: bolt force doubled.' : '', why: 'The thin main-beam web bears at the bolt.', fix: 'Thicker main beam, more bolts, or larger washers / reinforcing plate.' }));
        if (Ft > 0) {
          const pt = P.pullThrough(dw, tM * nwM, sup.mb.fu);
          const inter = Ft / pt.Rd + Vb / (bm.Rd * nwM);
          add(CHK.mk({ grp, name: 'Main-beam web: pull-through + bearing at the bolts', clause: pt.clause + '; interaction F_t/F_p,Rd + F_v/F_b,Rd ≤ 1', eta: inter, basis: pt.basis || 'none', steps: [s('d_w', 'washer / head diameter', dw, 'mm'), ...pt.steps], why: 'The thin main-beam web is pulled over the washer by the restraint force while bearing the reaction.', fix: 'Larger washers (up to the flat web), thicker main beam, or a backing plate.' }));
        }
        const hcl = Math.min(hp, mp.H - mp.Ct - mp.Cb);
        const ls = P.shearRupture(hcl * tM * nwM, sup.mb.fu);
        add(CHK.mk({ grp, name: 'Main-beam web: local shear at the cleat', clause: ls.clause, Ed: V * (x.bothSides ? 2 : 1), Rd: ls.Rd, unit: 'kN', fmt: kN, basis: 'approx', steps: [s('h', 'cleat depth within the lips', hcl, 'mm'), ...ls.steps] }));
      } else {
        const t0 = sup.col.t0, bw = P.bearingPlate(d, d0, t0, sup.col.fu, c.bg, 3 * d0, 3 * d0, nvs > 1 ? +c.p1 : 0, 0);
        add(CHK.mk({ grp, name: 'Bearing on the column wall', clause: bw.clause, Ed: Vb, Rd: bw.Rd, unit: 'kN', fmt: kN, steps: bw.steps, note: 'Bolting to a closed box needs through-bolts or blind (flow-drill / expansion) fasteners: resistance of blind fasteners from the manufacturer.' }));
        if (Ft > 0) add(CHK.mk({ grp, name: 'Column wall bending under bolt tension', clause: 'Yield-line model of the box wall (not implemented)', review: true, note: 'Tension on bolts into a box wall: verify the wall by a yield-line analysis or use through-bolts with a backing plate.' }));
      }
      if (c.type === 'endplate' && N > 0) add(CHK.pending({ grp, name: 'End plate in bending with prying (equivalent T-stub)', clause: 'IS 800:2007 10.4', Ed: N, unit: 'kN', fmt: kN }, 'Prying and the plate in bending are not verified in the code register (IS 800 Section 10).'));
    }
    // ---------- support local checks ----------
    if (sup.kind === 'col' && T.weldSup) {
      const MEd = V * e + Mj;
      add(CHK.pending({ grp, name: 'Box-column wall: plate moment V·e (local face bending) and punching along the welds', clause: 'IS 800:2007 10', Ed: MEd, unit: 'kNm', fmt: x => x / 1e6, why: 'The thin column wall bends under the plate moment.', fix: 'Thicker column wall, a wider plate on the face, or an internal stiffener.' }, 'The local resistance of a hollow-section wall is not covered by the verified provisions of IS 800.'));
    }
    // ---------- joint stiffness: not available ----------
    // The rotational and lateral stiffness of the joint came from a component method of the removed design route. IS 800 gives no verified equivalent: the joint is
    // analysed as nominally pinned (the input "Joint model" offers only that), no joint restraint is credited to the lateral-torsional buckling of the supported member.
    const stiff = { Kc: 0, Sj: 0, kbC: null, cls: 'nominally pinned', rigidLim: NaN, pinLim: NaN, Ks: Infinity };
    add(CHK.mk({ grp, name: 'Joint stiffness and classification', clause: '', review: true, note: 'Nominally pinned by input. Joint stiffness is not calculated (no verified IS 800 provision): no rotational or lateral restraint of the joint is credited in the analysis of the supported member.' }));
    // fork restraint at the member end
    const fork = (T.cBolts ? nv >= 2 : true) && (T.plate ? hp >= 0.6 * (H - 2 * t) : true);
    add(fork ? CHK.mk({ grp, name: 'Torsional (fork) restraint at the member end', clause: 'detailing rule: plate depth ≥ 0.6 × web depth and ≥ 2 bolt rows (documented approximation)', eta: 0, basis: 'approx', note: 'Fork support assumed in the LTB model.' })
      : CHK.mk({ grp, name: 'Torsional (fork) restraint at the member end', clause: 'detailing rule', review: true, note: 'The end connection is too shallow to demonstrate a fork support; the LTB model assumes a fork – review.', fix: 'Deeper cleat with at least 2 bolt rows.' }));
    // geometry feasibility record
    add(feas.length ? CHK.mk({ grp, name: 'Geometry, edge distances and spacing', clause: 'IS 800:2007 10.2', eta: Infinity, note: feas.concat(warn).join('. ') + '.', why: 'The bolt / plate layout does not fit the section or violates the minimum spacing.', fix: `Adjust z_1, p_1, plate depth or projection. Up to ${nMax} bolt rows fit at the minimum pitch.` })
      : CHK.mk({ grp, name: 'Geometry, edge distances and spacing', clause: 'IS 800:2007 10.2', eta: 0, note: `Layout fits.${warn.length ? ' ' + warn.join('. ') + '.' : ''} Up to ${nMax} bolt rows fit at the minimum pitch ${U.fmt(pmin, 1)} mm.` }));
    if (adj.n > 0) add(adj.msgs.length ? CHK.mk({ grp, name: 'Additional (adjustment) holes', clause: 'IS 800:2007 10.2 spacing; geometric fit', eta: Infinity, note: adj.msgs.join('. ') + '.', fix: `At most ${adj.nMax} holes fit at this pitch.` })
      : CHK.mk({ grp, name: 'Additional (adjustment) holes', clause: 'IS 800:2007 10.2 spacing; geometric fit', eta: 0, note: `${adj.n} holes fit (maximum ${adj.nMax}); included in the net-shear check.` }));
    for (const m of msgs) add(CHK.mk({ grp, name: 'Detail note', clause: '', review: true, note: m }));
    return { checks, geo, stiff, e, Fb, nMax, feas, adj, typeName: T.name, T, fork, torqueToSupport: eccToSupport ? V * e : V * (x.supWebOffset || 0), overall: CHK.overall(checks) };
  }

  // additional vertical holes in the C web: validation and maximum number
  function adjHoles(c, p, d0b, zs, ys, thin, hasBolts) {
    const n = Math.round(c.nAdj || 0), out = { n, holes: [], msgs: [], nMax: 0, inBoltLine: 0, dv: 0 };
    if (n <= 0) return out;
    const d = +c.dAdj, slot = c.sAdj === 'slot', lv = slot ? Math.max(d, +c.lAdj) : d, tol = +c.tolAdj || 0;
    out.dv = lv;
    const t = p.t, flat0 = t + p.r, flat1 = p.H - t - p.r, pmin = 2.5 * d, emin = 1.5 * d;
    const y = +c.eAdj, z1 = +c.zAdj, pv = +c.pAdj;
    if (y - d / 2 < emin - d / 2 + 0 && y < emin) out.msgs.push(`Hole line ${y} mm from the C end < ${U.fmt(emin, 1)} mm`);
    if (pv < Math.max(pmin, lv + d) - 1e-6) out.msgs.push(`Pitch ${pv} mm < minimum ${U.fmt(Math.max(pmin, lv + d), 1)} mm (spacing and slot length)`);
    const zTop = z1 - lv / 2 - tol;
    if (zTop < flat0) out.msgs.push(`First hole edge at ${U.fmt(zTop, 1)} mm is inside the top bend / flange (flat web starts at ${U.fmt(flat0, 1)} mm)`);
    out.nMax = Math.max(0, Math.floor((flat1 - tol - lv / 2 - z1) / Math.max(pv, 1)) + 1);
    if (n > out.nMax) out.msgs.push(`${n} holes do not fit: the last hole would extend beyond the flat web (bottom bend at ${U.fmt(flat1, 1)} mm)`);
    for (let i = 0; i < n; i++) {
      const z = z1 + i * pv; out.holes.push({ y, z, d, lv });
      if (hasBolts) for (const zb of zs) for (const yb of ys) {
        const dz = Math.max(0, Math.abs(z - zb) - lv / 2 + d / 2), dist = Math.hypot(y - yb, dz);
        if (dist < Math.max(pmin, (d + d0b) / 2 + Math.min(d, d0b)) - 1e-6) out.msgs.push(`Adjustment hole at z = ${z} mm is ${U.fmt(dist, 1)} mm from the bolt at z = ${zb}, y = ${yb} (minimum ${U.fmt(pmin, 1)} mm)`);
      }
    }
    if (hasBolts && ys.some(yb => Math.abs(yb - y) < Math.max(d, d0b))) out.inBoltLine = n;
    out.msgs = Array.from(new Set(out.msgs));
    return out;
  }
  return { design, TYPES, adjHoles, d0auto };
})();

