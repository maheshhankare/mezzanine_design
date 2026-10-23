// @ts-nocheck — ported from the mockup (index.html, 80_restraint.js). IS 800:2007 only. The restraint, bracing-force and stability-bracing rules of the removed design route were
// deleted: IS 800 has no verified equivalent (see the code register), so those checks are pending and no surface / joist restraint is credited. Notional horizontal forces:
// IS 800:2007 4.3.6 (0.5 %, verified).
import "server-only";
import { LOADS } from './loads';
import { SEC } from './section';
import { U } from '@/shared/util';
import { CHK } from '@/shared/check';
import { MEM } from './member';
import { CONN } from './conn';
import { RES } from './resist';
import * as RD from '../frame/design/restraint';
import * as RD_IS from '../frame/design/is800';
import * as TN from '../frame/design/tension';
const RD_OUT = RD.OUTSIDE_TABLE_19;
import { designHollowMember } from '../frame/design/member';
// ===== Surface / decking, joist beams, knee braces and bracing (IS 800:2007) =====
const NEEDSURF = 'No verified IS 800 provision exists in the code register for this check (timber, cold-formed deck and stability-bracing rules are outside the verified scope): the check is pending.';
export const RST: any = (() => {
  const s = CHK.s, kN = x => x / 1e3, kNm = x => x / 1e6;
  const KRIGID = 1000; // N/mm per mm: continuous lateral spring used when a restraint is demonstrated as "full" (S ≥ S_req)

  // ---------- surface / decking: vertical capacity ----------
  function deckVertical(x) {
    const { R, I, span, comb } = x, checks = [], add = c => { checks.push(c); return c; }, grp = 'Surface – floor capacity';
    const gk = LOADS.kg2kN(+I.d_sw + +I.qG) / 1e3, qk = LOADS.kg2kN(+I.qQ) / 1e3; // N/mm²
    const wU = comb.aG * gk + comb.aQ * qk, wS = gk + qk; // N/mm² → per mm width N/mm
    const M = wU * span * span / 8, typ = I.d_type; // per mm width (single span, conservative)
    const dlim = span / (+I.d_dl || 200);
    if (typ === 'mdf') {
      const t = +I.d_t, W = t * t / 6, sig = M / W;
      add(CHK.pending({ grp, name: 'Board bending between the secondaries (1 mm strip, single span)', clause: '', Ed: sig, unit: 'N/mm²', fmt: v => v,
        steps: [s('w_Ed', 'ULS area load', wU * 1e3, 'kN/m²'), s('L', 'secondary spacing', span, 'mm'), s('M', 'w L²/8', M, 'N·mm/mm'), s('σ', 'M/(t²/6)', sig, 'N/mm²')] }, 'Timber / board design is outside IS 800:2007: the board resistance is pending.'));
      const EI = +I.d_Em * t ** 3 / 12, def = 5 * wS * span ** 4 / (384 * EI);
      add(CHK.mk({ grp, name: 'Board deflection (instantaneous, no creep)', clause: 'project limit', Ed: def, Rd: dlim, unit: 'mm', fmt: v => v, basis: 'user', note: 'Board stiffness is a user input; creep is not included – review for long-term storage loads.' }));
      if (+I.QpLoc > 0) add(CHK.pending({ grp, name: 'Board under the concentrated load', clause: '', unit: 'N/mm²' }, 'Timber / board design is outside IS 800:2007.'));
    } else if (typ === 'steel') {
      const Wm = +I.d_W / 1000, Im = +I.d_I / 1000, fy = +I.d_fy; // per mm width
      add(CHK.pending({ grp, name: 'Steel deck bending between the secondaries', clause: 'IS 801 (not supplied)', Ed: M, unit: 'N·mm/mm', fmt: v => v, steps: [s('W_s', 'user (manufacturer)', +I.d_W, 'mm³/m')] }, 'The resistance of a cold-formed deck needs IS 801, which is not implemented.'));
      const def = 5 * wS * span ** 4 / (384 * (R.E || 200000) * Im);
      add(CHK.mk({ grp, name: 'Steel deck deflection', clause: 'project limit', Ed: def, Rd: dlim, unit: 'mm', fmt: v => v, basis: 'user' }));
    } else {
      const qall = +I.d_qall;
      add(CHK.mk({ grp, name: typ === 'grating' ? 'Grating capacity for the span (manufacturer load table)' : 'Surface capacity (user)', clause: 'Manufacturer load table / user value', Ed: wU * 1e3, Rd: qall > 0 ? qall : NaN, unit: 'kN/m²', fmt: v => v, basis: qall > 0 ? 'user' : 'none', note: qall > 0 ? '' : 'Enter the design capacity of the surface for this span.' }));
    }
    return { checks, wU, wS };
  }

  // ---------- surface / decking: restraint to a secondary (or main beam) ----------
  // The criterion for a surface to be credited as a lateral / torsional restraint of a cold-formed member came from the removed design route. IS 800 has no verified
  // equivalent: the demand is reported, nothing is credited, so the member is checked without surface restraint.
  function deckRestraint(x) {
    const { R, I, mem, L, label, MEd, sbSpacing, nLines } = x, checks = [], add = c => { checks.push(c); return c; }, grp = `Surface restraint – ${label}`;
    const present = I.d_type !== 'none';
    add(CHK.pending({ grp, name: 'Lateral and torsional restraint of the member by the surface', clause: '', note: 'The restraint is NOT credited: the member is analysed with the supports and the other demonstrated restraints only.' }, NEEDSURF));
    return { checks, lateral: false, tors: false, k: KRIGID, CD: NaN, Sreq: NaN, Sp: NaN, present, status: present ? 'Present but NOT demonstrated – not credited (no verified IS 800 criterion)' : 'None' };
  }

  // ---------- section properties of small members (angles, boxes) ----------
  function angle(b, h, t) {
    const A = (b + h - t) * t;
    const yc = (h * t * t / 2 + (b - t) * t * (t + (b - t) / 2)) / A; // from the back of leg h (x) — leg b horizontal
    const zc = (b * t * t / 2 + (h - t) * t * (t + (h - t) / 2)) / A;
    const Iy = b * t ** 3 / 12 + b * t * (zc - t / 2) ** 2 + t * (h - t) ** 3 / 12 + t * (h - t) * (t + (h - t) / 2 - zc) ** 2;
    const Iz = h * t ** 3 / 12 + h * t * (yc - t / 2) ** 2 + t * (b - t) ** 3 / 12 + t * (b - t) * (t + (b - t) / 2 - yc) ** 2;
    const Iyz = b * t * (t / 2 - zc) * (b / 2 - yc) + (h - t) * t * (t + (h - t) / 2 - zc) * (t / 2 - yc);
    const Im = (Iy + Iz) / 2, Ir = Math.hypot((Iy - Iz) / 2, Iyz);
    return { A, yc, zc, Iy, Iz, Iu: Im + Ir, Iv: Im - Ir, iv: Math.sqrt((Im - Ir) / A), iy: Math.sqrt(Iy / A), Wel: Math.min(Iy / (h - zc), Iz / (b - yc)) };
  }
  function box(b, h, t) { const A = b * h - (b - 2 * t) * (h - 2 * t), I = (b * h ** 3 - (b - 2 * t) * (h - 2 * t) ** 3) / 12, Iz = (h * b ** 3 - (h - 2 * t) * (b - 2 * t) ** 3) / 12; return { A, Iy: I, Iz, iv: Math.sqrt(Math.min(I, Iz) / A), Wel: I / (h / 2) }; }

  // ---------- joist beams as lateral restraints of a secondary (IS 800:2007 8.3.4, 10.3) ----------
  // The joist is credited as a lateral restraint ONLY when every required check is verified and satisfied (mode "verified"), or as a USER-DEFINED assumption
  // with a written justification (mode "user", labelled; never an IS 800 result). Required checks:
  //   1 restraint force (8.3.4, 8.3.4.1)       2 load path to the lateral supports: anchorage present and its capacity (8.3.4)
  //   3 position of the restraint on the compression flange (8.3.4)
  //   4 joist member under the restraint force and its load: verified for rectangular hollow sections (7.1.2, 8.2.1.2, 8.4.1, 9.3), pending otherwise
  //   5 joist connection: bolt shear, bearing on the joist, tension-free (10.3.2-10.3.4) and the geometry (10.2.2, 10.2.4.2); the bearing on the cold-formed
  //     secondary needs IS 801 and is pending
  //   6 stiffness: IS 800 8.3.4 gives no numerical criterion: the actual spring stiffness (joist axial stiffness in series with the two connections and the
  //     anchorage, all entered) is used in the elastic buckling analysis; with an unknown stiffness the restraint cannot be modelled and is not credited.
  function joists(x) {
    const { R, I, sec, Lsb, Lj, MEdSB, hSB } = x, checks = [], add = c => { checks.push(c); return c; }, grp = 'Joist beams';
    const n = Math.round(+I.j_n);
    if (n <= 0) return { checks, n: 0, positions: [], credited: false, k: 0 };
    const E = R.E, a = Math.min(+I.j_aL, Lsb / 2), SJ = n > 1 ? (Lsb - 2 * a) / (n - 1) : Lsb / 2, positions = n === 1 ? [Lsb / 2] : U.range(n, i => a + i * SJ);
    const Lbr = n === 1 ? Lsb / 2 : Math.max(a, SJ);
    const b = +I.j_b, h = +I.j_h, t = +I.j_t, fy = +I.j_fy, fu = +I.j_fu;
    const items = []; // [verdict, ...] of the verified-mode checks
    const note = []; const miss = [];
    const rec = (c, req = true) => { add(c); if (req) items.push(c.status); return c; };

    // 1 restraint force (8.3.4)
    const Fcf = Math.max(0, MEdSB) / hSB, dem = RD.restraintDemand({ Fcf, n });
    rec(CHK.mk({ grp, name: 'Restraint force per joist (2.5 % of the compression-flange force, at least 1 % per point)', clause: 'IS 800:2007 8.3.4', basis: 'code', Ed: dem.perPoint, unit: 'kN', fmt: kN, eta: 0,
      steps: [s('M_Ed', 'secondary, factored', kNm(MEdSB), 'kNm'), s('F_cf', 'M_Ed / (H − t)', kN(Fcf), 'kN'), s('2.5 % F_cf', '', kN(dem.total), 'kN'), s('per point', `max(2.5 % F_cf / ${n}; 1 % F_cf)`, kN(dem.perPoint), 'kN'), s('to the lateral supports', 'n × per point (8.3.4.1: one beam of the series)', kN(dem.anchorage), 'kN')],
      eq: 'F_R = max(0.025 F_cf / n; 0.010 F_cf)', note: 'Demand only (the value is the restraint force the joist, its connection and the anchorage must carry).' }));

    // 2 load path
    const anch = I.j_anch;
    if (anch === 'none') rec(CHK.mk({ grp, name: 'Load path: joist lines anchored to a bracing system or robust structure', clause: 'IS 800:2007 8.3.4', basis: 'code', eta: Infinity, note: 'Not anchored: parallel members connected only to each other would depend on each other for the restraint, which 8.3.4 does not allow.', why: 'Without an anchorage there is no lateral support for the restraint force.', fix: 'Anchor the joist lines to a braced bay or to the knee-braced end beams and enter its capacity.' }));
    else {
      const cap = +I.j_anR > 0 ? +I.j_anR * 1e3 : NaN;
      if (!(cap > 0)) { miss.push('anchorage capacity'); rec(CHK.pending({ grp, name: 'Load path: capacity of the anchorage (braced bay / knee-braced end beams)', clause: 'IS 800:2007 8.3.4', Ed: dem.anchorage, unit: 'kN', fmt: kN }, 'Enter the capacity of the anchorage (kN, from its own verified design): it is not assumed.')); }
      else rec(CHK.mk({ grp, name: 'Load path: capacity of the anchorage (braced bay / knee-braced end beams)', clause: 'IS 800:2007 8.3.4', basis: 'code', Ed: dem.anchorage, Rd: cap, unit: 'kN', fmt: kN, steps: [s('anchorage', 'input, from a separate design', kN(cap), 'kN')], eq: 'n F_R ≤ R_anchorage', why: 'The restraint force cannot reach the lateral supports.', fix: 'Stronger anchorage or fewer restraint points.' }));
    }

    // 3 position
    if (I.j_at === 'top') rec(CHK.mk({ grp, name: 'Position of the restraint: at the compression flange', clause: 'IS 800:2007 8.3.4', basis: 'code', eta: 0, note: 'Connected to the top flange (the compression flange in sagging). Hogging regions are not covered.' }));
    else rec(CHK.pending({ grp, name: 'Position of the restraint: at the compression flange', clause: 'IS 800:2007 8.3.4' }, 'The restraint must be as close to the compression flange as practicable unless a torsional restraint of the section is demonstrated, which is not available here.'));

    // 4 joist member
    const boxJ = I.j_sec === 'box';
    let gp; let A;
    if (boxJ) {
      const geom = { b, h, t, rOuter: 2 * t, rInner: t }, pr = RD_IS.rhsProps(geom); A = pr.A;
      const kLj = +I.j_k > 0 ? +I.j_k * Lj : NaN;
      const q = +I.j_q, sw = A * 7850e-9 * 9.80665, wU = q + 1.5 * sw, Mq = wU * Lj * Lj / 8, Vq = wU * Lj / 2;
      const st = (xx, M, V) => ({ x: xx, N: -dem.perPoint, Vy: 0, Vz: V, T: 0, My: M, Mz: 0 });
      const res = designHollowMember({ memberId: 0, combination: 'joist', geom, material: { fy, fu, E }, manufacture: 'hollow-cold-formed', length: Lj, KLy: kLj, KLz: kLj, stations: [st(0, 0, Vq), st(Lj / 2, Mq, 0), st(Lj, 0, Vq)], cm: 'table' });
      for (const ch of res.checks) {
        const u = ch.unit === 'N' ? ['kN', kN] : ch.unit === 'N·mm' ? ['kNm', kNm] : [ch.unit, v => v];
        const o = { grp, name: 'Joist member: ' + ch.name, clause: ch.clause, steps: Object.entries(ch.detail || {}).map(([k, v]) => s(k, '', v)), note: (ch.notes || []).join(' ') };
        if (ch.status === 'pending') rec(CHK.pending(o, (ch.notes || []).join(' ')));
        else rec(CHK.mk(Object.assign(o, ch.Ed !== null && ch.Rd !== null ? { Ed: ch.Ed, Rd: ch.Rd, unit: u[0], fmt: u[1] } : { eta: ch.ratio })));
      }
      if (!res.checks.length) rec(CHK.pending({ grp, name: 'Joist member', clause: 'IS 800:2007 7.1.2' }, res.notes.join(' ')));
      if (!(kLj > 0)) miss.push('joist effective length factor');
      rec(CHK.mk({ grp, name: 'Joist member: assumptions', clause: '', review: true, note: 'Simply supported joist; effective length = k × span with k entered by you (IS 800 7.2 / Table 11 is not verified); cold-formed hollow section (buckling class b, outer radius 2 t assumed); self-weight factor 1.5; no connection eccentricity.' }));
      gp = { A, iv: Math.sqrt(Math.min(pr.Iy, pr.Iz) / A), Wel: Math.min(pr.Zey, pr.Zez) };
    } else {
      gp = I.j_sec === 'C' ? { A: SEC.gross({ H: h, Bt: b, Bb: b, Ct: Math.min(15, b / 3), Cb: Math.min(15, b / 3), t, r: t }, 'single').A } : angle(b, h, t);
      A = gp.A;
      miss.push('joist member');
      rec(CHK.pending({ grp, name: 'Joist member: strength under the restraint force and its load', clause: I.j_sec === 'C' ? 'IS 801 (not supplied)' : 'IS 800:2007 7.5', Ed: dem.perPoint, unit: 'kN', fmt: kN }, I.j_sec === 'C' ? 'A cold-formed joist needs IS 801, which is not implemented.' : 'Angle struts (IS 800 7.5) are pending in the code register; only rectangular hollow-section joists are verified.'));
    }

    // 5 connection
    const d = +I.j_d, nb = Math.round(+I.j_nb), P1 = +I.j_p > 0 ? +I.j_p : 0, bolt = { d, fub: MEM.boltFu(I.j_bg), fyb: MEM.boltFy(I.j_bg), An: MEM.boltAs(d), Asb: Math.PI * d * d / 4 };
    const geo = RD.boltGeometry({ d, pitch: nb > 1 ? P1 : undefined, e1: +I.j_e1, edge: 'rolled' });
    if (!geo.ok && geo.d0 === null) rec(CHK.pending({ grp, name: 'Joist end bolts: hole clearance and geometry', clause: 'IS 800:2007 10.2.1' }, geo.messages.join('; ')));
    else rec(CHK.mk({ grp, name: 'Joist end bolts: spacing and end distance', clause: 'IS 800:2007 10.2.2, 10.2.4.2', basis: 'code', eta: geo.ok ? 0 : Infinity, note: geo.ok ? `d_0 = ${geo.d0} mm (Table 19); pitch ≥ 2.5 d, end distance ≥ 1.5 d_0 (rolled / machine-cut edges assumed).` : geo.messages.join('; ') + '.', fix: 'Increase the end distance / pitch.' }));
    if (geo.d0 !== null) {
      const lj = nb > 1 ? (nb - 1) * P1 : 0, sh = RD.boltShearCapacity(bolt, { nn: 1, ns: 0, lj, lg: t });
      const Fb = dem.perPoint / nb;
      rec(CHK.mk({ grp, name: 'Joist end bolts: shear (single shear plane through the threads)', clause: 'IS 800:2007 10.3.2, 10.3.3', basis: 'code', Ed: Fb, Rd: sh.Vdsb, unit: 'kN', fmt: kN,
        steps: [s('f_ub', '', bolt.fub, 'N/mm²'), s('A_nb', 'net tensile stress area', bolt.An, 'mm²'), s('V_nsb', 'f_ub A_nb / √3', kN(sh.Vnsb), 'kN'), s('β_lj, β_lg', '10.3.3.1, 10.3.3.2', `${U.fmt(sh.betaLj, 3)}, ${U.fmt(sh.betaLg, 3)}`), s('V_dsb', 'V_nsb β_lj β_lg / γ_mb', kN(sh.Vdsb), 'kN'), s('F per bolt', 'F_R / n_b', kN(Fb), 'kN')], eq: 'V_sb ≤ V_dsb = f_ub A_nb / (√3 γ_mb)', note: sh.notes.join(' '), why: 'The bolt shears.', fix: 'Larger or more bolts.' }));
      const bj = RD.boltBearingCapacity(bolt, { e: +I.j_e1, pitch: nb > 1 ? P1 : undefined, d0: geo.d0, t, fu });
      rec(CHK.mk({ grp, name: 'Joist end bolts: bearing on the joist wall', clause: 'IS 800:2007 10.3.4', basis: 'code', Ed: Fb, Rd: bj.Vdpb, unit: 'kN', fmt: kN,
        steps: [s('k_b', 'min(e/3d_0; p/3d_0 − 0.25; f_ub/f_u; 1)', bj.kb), s('V_dpb', '2.5 k_b d t f_u / γ_mb (one wall, t = joist thickness)', kN(bj.Vdpb), 'kN')], eq: 'V_sb ≤ V_dpb', why: 'The joist wall bears at the hole.', fix: 'Thicker joist wall, larger end distance.' }));
      const ts = sec.p.t;
      rec(CHK.pending({ grp, name: 'Joist end bolts: bearing and tear-out on the secondary (cold-formed)', clause: 'IS 801 (not supplied)', Ed: Fb, unit: 'kN', fmt: kN, steps: [s('t of the secondary', '', ts, 'mm')] }, 'The bearing of a bolt on cold-formed thin material needs IS 801, which is not implemented.'));
      miss.push('secondary-side bearing (IS 801)');
    }

    // 6 stiffness (modelled)
    const Kc = +I.j_Kc > 0 ? +I.j_Kc * 1e3 : NaN, Ka = +I.j_Ka > 0 ? +I.j_Ka * 1e3 : NaN;
    const kJ = isFinite(Kc) && isFinite(Ka) ? 1 / (Lj / (E * A) + 2 / Kc + 1 / Ka) : NaN;
    if (isFinite(kJ)) add(CHK.mk({ grp, name: 'Restraint stiffness K_J (modelled in the elastic buckling analysis; no numerical criterion in IS 800 8.3.4)', clause: 'IS 800:2007 8.3.4', basis: 'num', eta: 0,
      steps: [s('E A / L_J', 'joist axial stiffness', E * A / Lj / 1e3, 'kN/mm'), s('K_c', 'connection, each end (input)', Kc / 1e3, 'kN/mm'), s('K_a', 'anchorage (input)', Ka / 1e3, 'kN/mm'), s('K_J', '1/(L/EA + 2/K_c + 1/K_a)', kJ / 1e3, 'kN/mm')], note: 'IS 800 8.3.4 requires "sufficient stiffness" without a number: the actual K_J is used as a spring in the buckling analysis; a stiffness that is too low simply gives a lower M_cr.' }));
    else { miss.push('restraint stiffness data'); rec(CHK.pending({ grp, name: 'Restraint stiffness K_J (joist, its two connections and the anchorage)', clause: 'IS 800:2007 8.3.4' }, 'Enter the axial stiffness of one joist connection K_c and of the anchorage K_a (kN/mm): a restraint of unknown stiffness cannot be modelled and is not assumed rigid.')); }

    const userMode = I.j_cred === 'user';
    const allOK = items.every(v => v === 'PASS');
    const anyFail = items.some(v => v === 'FAIL');
    let credited = false, reason;
    if (anch === 'none') reason = 'joist lines not anchored (IS 800 8.3.4)';
    else if (userMode) {
      credited = String(I.j_credJ || '').trim().length > 0 && anch !== 'none' && !anyFail; // a verified check that fails (e.g. an anchorage below the demand) contradicts the assumption: not credited
      reason = anyFail ? 'a verified check is not satisfied (the user-defined assumption cannot override it)' : credited ? 'USER-DEFINED assumption (not an IS 800 result): ' + String(I.j_credJ).trim() + (isFinite(kJ) ? ` (K_J = ${U.fmt(kJ / 1e3, 2)} kN/mm)` : ' (stiffness unknown: rigid)') : 'user-defined restraint without a justification: not credited';
      add(CHK.mk({ grp, name: 'User-defined joist restraint', clause: '', review: true, note: 'The restraint is credited by the designer\'s assumption: ' + reason + '. Failing or pending checks above are NOT resolved by it.' }));
    } else if (allOK && isFinite(kJ)) { credited = true; reason = 'every required IS 800 check is verified and satisfied'; }
    else reason = anyFail ? 'a verified check is not satisfied' : 'not verified: ' + [...new Set(miss)].join(', ');
    return { checks, n, positions, SJ, Lbr, a, credited, k: isFinite(kJ) ? kJ : (userMode && credited ? KRIGID : 0), at: I.j_at, reason, gp, mode: userMode ? 'user' : 'verified', demand: dem, kJ };
  }

  // ---------- knee braces ----------
  function knee(x) {
    const { R, I, Ncol, nCols, hc } = x, checks = [], add = c => { checks.push(c); return c; }, grp = 'Knee bracing';
    if (I.k_use !== 'yes') return { checks, use: false, H: 0, N: 0, Mcol: 0 };
    const th = +I.k_th * Math.PI / 180, a = +I.k_a, dv = a * Math.tan(th), Lkb = a / Math.cos(th);
    // notional horizontal force per column at beam level
    const phi = 0.005, phiTxt = '0.5 % of the factored gravity load (IS 800:2007 4.3.6)';
    const H = phi * Ncol + +I.k_H * 1e3;
    const ga = x.ga || null; // global analysis (unified app): brace forces from the frame model, compression and tension separately
    // gravity compression from the beam model with the knee supports (engine v1.6; not with the global analysis, which gives N itself)
    const Ng = !ga && x.grav && x.grav.R > 0 ? x.grav.R / Math.sin(th) : 0;
    const Fh = H * hc / dv, N = ga ? ga.Nc : Fh / Math.cos(th) + Ng, Nt = ga ? ga.Nt : Fh / Math.cos(th), Mcol = H * (hc - dv);
    const nL = +I.k_nL, b = +I.k_b, h = +I.k_h, t = +I.k_t, fy = +I.k_fy, fu = +I.k_fu, E = +I.E;
    const A1 = angle(b, h, t), A = nL * A1.A;
    const d = +I.k_d, hdK = RD.holeDiameter(d), d0 = hdK.d0, nb = Math.round(+I.k_nb), e2 = +I.k_e2 > 0 ? +I.k_e2 : b / 2, p1 = +I.k_p1, e1 = +I.k_e1;
    // angle struts (IS 800 7.5) are not verified in the code register: the compression check is pending, the demand is reported; the tension checks (6.3.3, 6.4.1) are provisional (REVIEW)
    const demandSteps = ga ? [s('N_Ed', 'global frame analysis: ' + ga.case, kN(N), 'kN')] : [s('H', phiTxt + ' × N + H_add', kN(H), 'kN'), ...(Ng ? [s('R_knee', `largest knee reaction of the ${x.grav.where} model (ULS)`, kN(x.grav.R), 'kN'), s('N_grav', 'R_knee / sin θ', kN(Ng), 'kN'), s('N_Ed', 'H h_c / (d_v cos θ) + N_grav', kN(N), 'kN')] : [s('N_Ed', 'H h_c / (d_v cos θ)', kN(N), 'kN')])];
    add(CHK.pending({ grp, name: 'Knee brace in compression', clause: 'IS 800:2007 7.5', Ed: N, unit: 'kN', fmt: kN, steps: [...demandSteps, s('L_KB', 'a / cos θ', Lkb, 'mm')] }, 'Angle struts (7.5) are pending in the code register.'));
    // tension: 6.3.3 / 6.3.4 (shear lag, centre-line areas, back-to-back angles = 2 × one angle) and 6.4.1 block shear of the end (one-sided, Fig. 7B); decisions in docs/TECHNICAL_DECISIONS_6.3_6.4.md.
    // Leg b is the connected leg (input label), one bolt line per end, e_2 = bolt line to the toe, so w_1 = b − e_2.
    const kneeGeometry = () => { if (!(e2 > 0 && e2 < b)) throw new Error(`the edge distance e_2 = ${U.fmt(e2, 1)} mm must lie inside the connected leg b = ${U.fmt(b, 1)} mm`); };
    try {
      kneeGeometry();
      const Lc = Math.max(0, (nb - 1) * p1), rup = TN.singleAngleRupture({ connected: b, outstanding: h, t, fy, fu, connection: 'bolted', w1: b - e2, nHoles: 1, dh: d0, Lc, nAngles: nL === 2 ? 2 : 1 });
      add(CHK.mk({ grp, name: 'Knee brace in tension: net-section rupture (angle connected by one leg)', clause: rup.clause, Ed: Nt, Rd: rup.Tdn, unit: 'kN', fmt: kN,
        steps: [s('A_nc', '(b − t/2) t − d_0 t (net area of the connected leg)', rup.areas.Anc, 'mm²'), s('A_go', '(h − t/2) t (gross area of the outstanding leg)', rup.areas.Ago, 'mm²'), s('b_s', 'h + w_1 − t, w_1 = b − e_2', rup.bs, 'mm'), s('L_c', '(n_b − 1) p_1', Lc, 'mm'), s('β', rup.betaLimited === 'none' ? '1.4 − 0.076 (w/t)(f_y/f_u)(b_s/L_c)' : 'at its limit: ' + rup.betaLimited, rup.beta), s('T_dn', `0.9 A_nc f_u/γ_m1 + β A_go f_y/γ_m0${nL === 2 ? ', × 2 angles' : ''}`, kN(rup.Tdn), 'kN')],
        note: 'Centre-line areas, fillets neglected; leg b is the connected leg; one bolt line (one hole in the critical section). IS 800 does not define A_nc and A_go: see the decision record.' + (hdK.outsideTable ? ' ' + RD_OUT : '') }));
    } catch (err) {
      add(CHK.pending({ grp, name: 'Knee brace in tension: net-section rupture (angle connected by one leg)', clause: 'IS 800:2007 6.3.3', Ed: Nt, unit: 'kN', fmt: kN }, 'The connection geometry does not allow the check: ' + err.message));
    }
    try {
      kneeGeometry();
      const ga2 = TN.blockShearAreas({ kind: 'one-sided', t, nAlong: nb, e1, p1: nb > 1 ? p1 : 0, nAcross: 1, g: 0, e2, d0 }), bk = TN.blockShear({ ...ga2, fy, fu });
      add(CHK.mk({ grp, name: 'Knee brace end: block shear (angle leg tearing out)', clause: bk.clause, Ed: Nt, Rd: bk.Tdb * nL, unit: 'kN', fmt: kN,
        steps: [s('L_v', 'e_1 + (n_b − 1) p_1', ga2.Lv, 'mm'), s('L_t', 'e_2 (hole centre to the toe)', ga2.Lt, 'mm'), s('T_1', 'A_vg f_y/(√3 γ_m0) + 0.9 A_tn f_u/γ_m1', kN(bk.T1), 'kN'), s('T_2', '0.9 A_vn f_u/(√3 γ_m1) + A_tg f_y/γ_m0', kN(bk.T2), 'kN'), s('T_db', `min(T_1, T_2)${nL === 2 ? ' per angle, × 2' : ''}`, kN(bk.Tdb * nL), 'kN')],
        note: 'One shear plane and one tension plane (Fig. 7B); shear length to the centre of the last hole, half-hole deduction at the end of each line.' + (hdK.outsideTable ? ' ' + RD_OUT : '') }));
    } catch (err) {
      add(CHK.pending({ grp, name: 'Knee brace end: block shear (angle leg tearing out)', clause: 'IS 800:2007 6.4.1', Ed: Nt, unit: 'kN', fmt: kN }, 'The connection geometry does not allow the check: ' + err.message));
    }
    const P = RES.provider(R), planes = nL === 2 ? 2 : 1, bs = P.boltShear(d, I.k_bg, planes, true), bb = P.bearingPlate(d, d0, t, fu, I.k_bg, e1, e2, nb > 1 ? p1 : 0, 0);
    const Nb_ = Math.max(N, Nt);
    add(CHK.mk({ grp, name: 'Knee brace bolts: shear', clause: bs.clause, Ed: Nb_ / nb, Rd: bs.Rd, unit: 'kN', fmt: kN, steps: bs.steps }));
    add(CHK.mk({ grp, name: 'Knee brace bolts: bearing on the angle(s)', clause: bb.clause, Ed: Nb_ / nb / nL, Rd: bb.Rd, unit: 'kN', fmt: kN, steps: bb.steps }));
    if (nL === 2) { const bg = P.bearingPlate(d, d0, +I.k_tg, 410, I.k_bg, e1, e2, nb > 1 ? p1 : 0, 0); add(CHK.mk({ grp, name: 'Knee brace bolts: bearing on the gusset', clause: bg.clause, Ed: Nb_ / nb, Rd: bg.Rd, unit: 'kN', fmt: kN, steps: bg.steps, note: 'Gusset f_u = 410 N/mm² assumed (E250).' })); }
    return { checks, use: true, H, N, Nt, Ng, Fh, Fv: Fh * Math.tan(th), Mcol, dv, Lkb, phi, a, ga: !!ga };
  }

  // ---------- plan and vertical bracing ----------
  function bracing(x) {
    const { R, I, sumNf, nRestr, Lline, Htot, Lmb, Lsb, hc } = x, checks = [], add = c => { checks.push(c); return c; }, grp = 'Bracing', ga = x.ga || null;
    const P = RES.provider(R), g0 = 1.1;
    const memRes = (b, t, typ) => {
      const fy = +I.br_fy, fu = +I.br_fu, d = +I.br_d, d0 = RD.holeDiameter(d).d0;
      let A, Anet;
      if (typ === 'rod') { A = MEM.boltAs(b) || Math.PI * b * b / 4 * 0.78; Anet = A; }
      else if (typ === 'angle') { A = angle(b, b, t).A; Anet = A - d0 * t; }
      else { A = b * t; Anet = (b - d0) * t; }
      const Npl = A * fy / g0; // IS 800 6.2: yielding of the gross section (verified); rupture of the net section (6.3.1) is a separate check (vertical bracing) with Anet
      return { A, Anet, Rd: Npl, steps: [s('A', '', A, 'mm²'), s('T_dg', 'A f_y/γ_m0', kN(Npl), 'kN')] };
    };
    let qd = 0, Fpl = 0;
    if (I.br_use === 'yes') {
      const m = Math.max(1, nRestr), am = Math.sqrt(0.5 * (1 + 1 / m)), e0 = am * Lline / 500;
      qd = sumNf * 8 * e0 / (Lline * Lline);
      const Vb = qd * Lline / 2 / Math.max(1, +I.br_nbay) + (+I.br_H * 1e3) / 2;
      const Ld = Math.hypot(Lmb, Lsb); Fpl = Vb * Ld / Lsb + (ga ? ga.Fplan : 0); // + sway load transferred between the frame lines (global analysis)
      const r = memRes(+I.br_b, +I.br_t, I.br_type);
      add(CHK.pending({ grp, name: 'Plan bracing diagonal (tension)', clause: 'IS 800:2007 6.2', Ed: Fpl, unit: 'kN', fmt: kN,
        steps: [s('Σ N_Ed', 'compression-flange forces restrained by one bracing', kN(sumNf), 'kN'), s('m', 'restrained members', m), s('e_0', 'α_m L/500', e0, 'mm'), s('q_d', '', qd, 'N/mm'), s('F_diag', ga ? `V L_d / L_sb + ${U.fmt(ga.Fplan / 1e3, 2)} kN transferred between the frame lines (global analysis)` : 'V L_d / L_sb', kN(Fpl), 'kN'), ...r.steps],
        note: 'The stabilising force of the compression flanges (an assumed initial bow L/500 and the number of restrained members) came from the removed design route and is shown for information only; IS 800 has no verified rule for it, so the bracing member is not checked.' }, 'No verified IS 800 rule for the force in a stability bracing of compression flanges.'));
            const bs = P.boltShear(+I.br_d, I.br_bg, 1, true), d0pb = RD.holeDiameter(+I.br_d).d0, bb = P.bearingPlate(+I.br_d, d0pb, +I.br_t, +I.br_fu, I.br_bg, 2 * d0pb, (+I.br_b) / 2, 0, 0);
      add(CHK.mk({ grp, name: 'Plan bracing end bolts', clause: bs.clause, Ed: Fpl / Math.round(+I.br_nb), Rd: Math.min(bs.Rd, bb.Rd), unit: 'kN', fmt: kN, steps: [...bs.steps, ...bb.steps], note: RD.holeDiameter(+I.br_d).outsideTable ? RD_OUT : '' }));
    } else add(CHK.na({ grp, name: 'Plan bracing', clause: '' }, 'No plan bracing: main-beam restraints through SB-Int lines must be anchored otherwise (wall / diaphragm).'));
    let Fv = 0;
    if (I.vb_use === 'yes') {
      const Ld = Math.hypot(Lmb, hc); Fv = ga && ga.Fv !== null ? ga.Fv : Htot * Ld / Lmb;
      const r = memRes(+I.vb_b, +I.vb_t, 'flat');
      add(CHK.mk({ grp, name: 'Vertical bracing diagonal (tension only)', clause: 'IS 800:2007 4.3.6, 6.2', Ed: Fv, Rd: r.Rd, unit: 'kN', fmt: kN, steps: [...(ga && ga.Fv !== null ? [s('F', 'tension diagonal, global frame analysis: ' + ga.FvCase, kN(Fv), 'kN')] : [s('H', 'notional + additional, per braced line', kN(Htot), 'kN'), s('F', 'H L_d / L', kN(Fv), 'kN')]), ...r.steps], note: 'Yielding of the gross section only: the rupture of the net section is the separate check below.' }));
      const nr = P.netRupture(r.Anet, +I.br_fu);
      add(CHK.mk({ grp, name: 'Vertical bracing diagonal: net-section rupture (6.3.1)', clause: nr.clause, Ed: Fv, Rd: nr.Rd, unit: 'kN', fmt: kN, steps: [s('A_n', '(b − d_0) t: one hole in the critical section', r.Anet, 'mm²'), ...nr.steps],
        note: 'Assumes ONE bolt hole in the critical section (a single bolt line across the flat) with the bolt of the bracing connection; a staggered or multi-line pattern needs the net area of 6.3.1 for each path. Block shear (6.4) of the end connection is not checked: the bolt pattern (pitch, end distances) is not an input of the vertical bracing.' + (RD.holeDiameter(+I.br_d).outsideTable ? ' ' + RD_OUT : '') }));
      add(CHK.pending({ grp, name: 'Vertical bracing diagonal end: block shear', clause: 'IS 800:2007 6.4.1', Ed: Fv, unit: 'kN', fmt: kN }, 'Block shear needs the bolt pattern (pitch, end and edge distances) of the bracing end, which is not an input of the vertical bracing; no value is assumed.'));
    } else add(CHK.na({ grp, name: 'Vertical bracing', clause: '' }, 'No vertical bracing: frame stability from knee braces / column bending.'));
    return { checks, qd, Fpl, Fv };
  }
  return { deckVertical, deckRestraint, joists, knee, bracing, angle, box, KRIGID };
})();

