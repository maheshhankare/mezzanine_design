// @ts-nocheck — ported verbatim from the mockup (index.html, 05_schema.js); logic unchanged so results match the mockup.
// ===== Input schema: every user input, its unit, default (Example 3 mapped to C-sections), limits and help =====
// type: n = number, s = select, b = yes/no, x = text, l = list of numbers (comma separated). opt: blank allowed = "calculated".
export const SCHEMA: any = (() => {
  const T = [];
  let tab = '', grp = '';
  const tb = (id, label) => { tab = id; T.push({ tabDef: true, id, label }); };
  const gp = label => { grp = label; };
  const f = (id, label, type, def, extra = {}) => T.push(Object.assign({ id, label, type, def, tab, grp }, extra));
  const GRADES = [['S235', 'S235 (EN 10025-2) f_y 235 / f_u 360'], ['S275', 'S275 (EN 10025-2) 275 / 430'], ['S355', 'S355 (EN 10025-2) 355 / 490'],
    ['S280GD', 'S280GD (EN 10346) 280 / 360'], ['S320GD', 'S320GD (EN 10346) 320 / 390'], ['S350GD', 'S350GD (EN 10346) 350 / 420'], ['S390GD', 'S390GD (EN 10346) 390 / 460'], ['S420GD', 'S420GD (EN 10346) 420 / 480'], ['S450GD', 'S450GD (EN 10346) 450 / 510'],
    ['E250', 'E250 (IS 2062) 250 / 410'], ['E350', 'E350 (IS 2062) 350 / 490'], ['A653-50', 'ASTM A653 SS 50 (340 / 450)'], ['user', 'User-defined (enter f_y, f_u)']];
  const GV = { S235: [235, 360], S275: [275, 430], S355: [355, 490], S280GD: [280, 360], S320GD: [320, 390], S350GD: [350, 420], S390GD: [390, 460], S420GD: [420, 480], S450GD: [450, 510], E250: [250, 410], E350: [350, 490], 'A653-50': [340, 450] };
  const BOLTS = [['4.6', '4.6'], ['5.6', '5.6'], ['8.8', '8.8'], ['10.9', '10.9']];
  const ARR = [['single', 'Single C'], ['b2b', 'Two C back-to-back (built-up)'], ['quad', 'Four C: two back-to-back pairs (built-up)']];

  // ---------- 1 General ----------
  tb('gen', 'General & code');
  gp('Project');
  f('proj', 'Project', 'x', 'Mezzanine – Example 3 (C-section)'); f('ref', 'Reference / model name', 'x', 'Example 3 mapped to C-sections'); f('eng', 'Designer', 'x', '');
  gp('Design standard');
  f('code', 'Design route', 's', 'EN', { opts: [['EN', 'Eurocode: EN 1990 + EN 1993-1-1 / -1-3 / -1-5 / -1-8 (recommended values)'], ['AISI', 'AISI S100-16 (LRFD, DSM) + AISC 360-16 + ASCE 7 combinations'], ['IS', 'Indian: IS 875 + IS 800:2007 (column, base, connections); cold-formed members need IS 801 (see notes)']], help: 'One consistent route is used for loads, combinations and resistances. Checks the route does not cover are reported as REVIEW, never as PASS.' });
  f('na', 'National annex / project overrides', 'x', 'Recommended values (no national annex)', { help: 'Recorded in the report. Enter NA-specific partial factors below.' });
  f('gM0', 'γM0 (EN) – cross-section resistance', 'n', 1.0, { min: 0.8, max: 1.5 }); f('gM1', 'γM1 (EN) – member buckling', 'n', 1.0, { min: 0.8, max: 1.5 }); f('gM2', 'γM2 (EN) – net section, bolts, welds', 'n', 1.25, { min: 1.0, max: 1.6 });
  f('gG', 'γG – permanent (EN 1990 Table A1.2(B))', 'n', 1.35, { min: 1, max: 1.6 }); f('gQ', 'γQ – variable', 'n', 1.5, { min: 1, max: 1.8 });
  f('combo', 'EN 1990 ULS combination', 's', '610', { opts: [['610', 'Eq. 6.10 (1.35 G + 1.5 Q)'], ['610ab', 'Eq. 6.10a / 6.10b (less favourable, ξ = 0.85)']] });
  f('psi0', 'ψ0 of the imposed load (storage: 1.0)', 'n', 1.0, { min: 0, max: 1, help: 'EN 1990 Table A1.1: category E (storage) ψ0 = 1.0.' });
  gp('Cost data (optional, used only by the "minimum cost" optimisation objective)');
  f('cost_kg', 'Steel material + forming price', 'n', '', { unit: 'per kg', opt: 1, min: 0, help: 'Blank = no reliable cost data: the minimum-cost objective is then unavailable.' });
  f('cost_bu', 'Built-up fabrication premium per C added', 'n', '', { unit: 'per m', opt: 1, min: 0 });
  gp('Material constants');
  f('E', 'Young’s modulus E', 'n', 210000, { unit: 'N/mm²', min: 190000, max: 215000, help: 'EN 1993-1-1 3.2.6: 210 000 N/mm²; AISI uses 203 000 N/mm² (29 500 ksi).' });
  f('nu', 'Poisson’s ratio ν', 'n', 0.3, { min: 0.25, max: 0.32 });
  gp('Layout (bays, modules, levels)');
  f('nb', 'Bays along the main beam (main-beam spans per line)', 'n', 3, { min: 1, max: 20, int: 1 });
  f('Lmb', 'Main-beam span (column centres)', 'n', 3000, { unit: 'mm', min: 500, max: 15000 });
  f('nm', 'Modules along the secondaries (secondary spans side by side)', 'n', 3, { min: 1, max: 20, int: 1 });
  f('Lsb', 'Secondary span (main-beam line centres)', 'n', 5000, { unit: 'mm', min: 500, max: 15000 });
  f('nsbi', 'Number of SB-Int per main-beam span', 'n', 2, { min: 0, max: 12, int: 1 });
  f('sbiVar', 'SB-Int spacing', 's', 'uniform', { opts: [['uniform', 'Uniform: every SB-Int at S, first at S from support A'], ['var', 'Variable: enter the positions']] });
  f('Ssbi', 'Uniform SB-Int spacing S', 'n', 1000, { unit: 'mm', min: 100 });
  f('xsbi', 'SB-Int positions from support A (variable)', 'l', '1000, 2000', { unit: 'mm' });
  f('hc', 'Column height (base to main-beam top)', 'n', 3000, { unit: 'mm', min: 500, max: 12000 });
  f('mbCont', 'Main beam over the bays', 's', 'simple', { opts: [['simple', 'Simple spans (each bay a separate member)'], ['cont', 'Continuous over the bays']] });
  f('sbCont', 'Secondaries over the modules', 's', 'simple', { opts: [['simple', 'Simple spans'], ['cont', 'Continuous over the modules']] });
  gp('Load application convention');
  f('lc_conv', 'Load Application Convention', 's', 'cg', { opts: [['cg', 'Through Centroid (CG) – torque from the CG-to-shear-centre eccentricity is included'], ['flange', 'On the top flange at mid-width (floor bearing point)'], ['sc', 'Idealised: through the shear centre, no additional torsion (acknowledgement required)']], help: 'The centroid (CG) of an open lipped C is NOT the shear centre (SC). A load through the CG is eccentric to the SC and twists the member; that torque, the warping stresses, the lateral bending and the stability interaction are all kept in the analysis. Members can override this on their own tab.' });
  f('lc_h', 'Load height used for lateral-torsional buckling', 's', 'top', { opts: [['top', 'Top flange (where the floor bears – destabilising, recommended)'], ['ref', 'At the convention reference point (CG / flange / SC level)']], help: 'Floor loads physically bear on the top flange. Applying them at CG height is less onerous for LTB, so the top-flange height is kept unless you choose otherwise.' });
  f('lc_ack', 'I acknowledge the shear-centre (no-torsion) assumption', 'b', 'no', { help: 'Required for the idealised shear-centre convention. Without it the calculation stops: the convention would otherwise hide a real torque.' });
  f('lc_just', 'Physical load path / engineering justification for shear-centre loading', 'x', '', { help: 'Describe the detail that forces the load through the shear centre (e.g. bracket to the SC, paired members, torsion-free deck connection). Printed in the report.' });
  gp('Loads (area loads in kg/m², converted with g = 9.80665 m/s²)');
  f('qG', 'Permanent floor load (finishes, services) excl. decking', 'n', 0, { unit: 'kg/m²', min: 0 });
  f('qQ', 'Imposed floor load', 'n', 600, { unit: 'kg/m²', min: 0, help: 'Storage / racking floors: use the project value (IS 875-2, EN 1991-1-1 Table 6.4 / NA).' });
  f('QpLoc', 'Concentrated imposed load on the floor (for the decking check)', 'n', 0, { unit: 'kN', min: 0 });

  // ---------- 2 Main beam ----------
  const member = (m, d) => {
    gp('Arrangement');
    f(m + 'arr', 'Member arrangement', 's', d.arr, { opts: ARR });
    f(m + 'gap', 'Gap between the webs of a back-to-back pair', 'n', 0, { unit: 'mm', min: 0, max: 40, help: '0 = webs in contact, welded directly.' });
    f(m + 'ps', 'Four C: centre-to-centre spacing of the two pairs', 'n', 150, { unit: 'mm', min: 50 });
    gp('Section (outer dimensions; t = core thickness excl. coating)');
    f(m + 'H', 'Overall depth H', 'n', d.H, { unit: 'mm', min: 40, max: 500 });
    f(m + 'Bt', 'Top flange width B_t', 'n', d.B, { unit: 'mm', min: 20, max: 200 }); f(m + 'Bb', 'Bottom flange width B_b', 'n', d.B, { unit: 'mm', min: 20, max: 200 });
    f(m + 'Ct', 'Top lip length C_t (0 = no lip)', 'n', d.C, { unit: 'mm', min: 0, max: 80 }); f(m + 'Cb', 'Bottom lip length C_b', 'n', d.C, { unit: 'mm', min: 0, max: 80 });
    f(m + 't', 'Core thickness t', 'n', d.t, { unit: 'mm', min: 0.6, max: 8 }); f(m + 'r', 'Internal bend radius r', 'n', d.r, { unit: 'mm', min: 0, max: 20 });
    f(m + 'tol', 'Thickness tolerance (EN 1993-1-3 3.2.4)', 's', 'normal', { opts: [['normal', 'Normal tolerances – t_cor used directly'], ['reduced', 'Tolerance > 5 % below nominal – reduce t (enter the reduced t above)']] });
    gp('Material');
    f(m + 'gr', 'Steel grade', 's', d.gr, { opts: GRADES });
    f(m + 'fy', 'Yield strength f_yb', 'n', d.fy, { unit: 'N/mm²', min: 200, max: 700 }); f(m + 'fu', 'Ultimate strength f_u', 'n', d.fu, { unit: 'N/mm²', min: 250, max: 800 });
    gp('Built-up connection (back-to-back / four C)');
    f(m + 'buT', 'Connection between the C-sections', 's', 'weldInt', { opts: [['weldInt', 'Intermittent fillet / flare welds at the top and bottom web junctions'], ['weldCont', 'Continuous welds at the top and bottom junctions'], ['spot', 'Resistance spot welds'], ['bolt', 'Bolts through the webs'], ['none', 'Not connected (members act separately)']] });
    f(m + 'buA', 'Weld throat a (fillet / flare)', 'n', 2, { unit: 'mm', min: 1, max: 6 }); f(m + 'buL', 'Weld length per station', 'n', 40, { unit: 'mm', min: 5 });
    f(m + 'buS', 'Station pitch along the member s', 'n', 300, { unit: 'mm', min: 20 }); f(m + 'buN', 'Weld / connector lines per station (top + bottom = 2)', 'n', 2, { min: 1, max: 4, int: 1 });
    f(m + 'buD', 'Spot weld or bolt diameter', 'n', 8, { unit: 'mm', min: 3, max: 24 }); f(m + 'buBg', 'Bolt grade (bolted)', 's', '8.8', { opts: BOLTS });
    f(m + 'buFu', 'Weld metal / filler f_u (blank = parent f_u)', 'n', '', { unit: 'N/mm²', opt: 1 });
    f(m + 'pcs', 'Four C: pair-to-pair connection', 's', 'tabs', { opts: [['tabs', 'Cover tabs / plates welded across the top and bottom flanges'], ['none', 'None (pairs act separately)']] });
    f(m + 'pcT', 'Pair-to-pair tab thickness', 'n', 4, { unit: 'mm' }); f(m + 'pcW', 'Tab length along the member', 'n', 60, { unit: 'mm' }); f(m + 'pcS', 'Tab pitch', 'n', 500, { unit: 'mm' });
  };
  tb('mb', 'Main beam');
  member('mb_', { arr: 'b2b', H: 400, B: 50, C: 25, t: 2, r: 3, gr: 'S350GD', fy: 350, fu: 420 });
  gp('Supports, restraints and serviceability');
  f('mb_sup', 'End support model', 's', 'pin', { opts: [['pin', 'Pinned (rotational stiffness ignored – conservative for the span)'], ['semi', 'Semi-rigid: S_j,ini of the end connection (Connections tab)']] });
  f('mb_lat', 'SB-Int as lateral restraints', 's', 'auto', { opts: [['auto', 'Credit only where demonstrated (stiffness in the LTB model, strength checked)'], ['none', 'Do not credit (fork supports only)']] });
  f('mb_anch', 'SB-Int lines anchored laterally (braced bay, wall or demonstrated diaphragm)', 'b', 'yes');
  f('mb_tor', 'Torsional restraint from SB-Int connections', 's', 'auto', { opts: [['auto', 'Credit S_j only if the connection is not classified pinned'], ['none', 'Do not credit']] });
  f('mb_lcu', 'Distributed loads on the main beam (self-weight, UDL)', 's', 'glob', { opts: [['glob', 'Global Load Application Convention (General tab)'], ['cg', 'Through the centroid (CG)'], ['flange', 'On the top flange (mid-width)'], ['sc', 'Through the shear centre (acknowledgement on the General tab)']], help: 'The SB-Int reactions always enter through their physical connection (cleat bolt line), which is a real load path represented separately from this convention.' });
  f('mb_ecc', 'Eccentricity moment of the SB-Int connections taken by', 's', 'sb', { opts: [['sb', 'SB-Int bolt group (main beam gets R × small web offset)'], ['mb', 'Main beam as torque R × e (conservative)']] });
  f('mb_ss', 'Bearing length at the supports (web crippling, if the beam bears)', 'n', 0, { unit: 'mm', min: 0, help: '0 = the beam is connected through its web only (no bearing: web crippling not applicable).' });
  f('mb_dl', 'Vertical deflection limit L/…', 'n', 200, { min: 50 }); f('mb_tw', 'Twist limit', 'n', 2, { unit: '°', min: 0.1 });
  f('mb_gU', 'Additional permanent UDL on the main beam', 'n', 0, { unit: 'kN/m', min: 0 }); f('mb_qU', 'Additional imposed UDL on the main beam', 'n', 0, { unit: 'kN/m', min: 0 });
  f('mb_N', 'Additional axial force (compression +)', 'n', 0, { unit: 'kN' });

  // ---------- 3 SB-Int ----------
  const secondary = (m, d) => {
    member(m, d);
    gp('Loading and restraints');
    f(m + 'ecc', 'Floor load position', 's', 'glob', { opts: [['glob', 'Global Load Application Convention (General tab)'], ['cg', 'Through the centroid (CG) – eccentric to the shear centre'], ['flange', 'On the top flange (mid-width) – eccentric to the shear centre'], ['sc', 'Through the shear centre (detail enforces it; acknowledgement on the General tab)'], ['user', 'User eccentricity to the shear centre']] });
    f(m + 'e', 'User load eccentricity to the shear centre', 'n', 0, { unit: 'mm' });
    f(m + 'rst', 'Restraint to the secondary', 's', 'deck', { opts: [['deck', 'Surface / decking (Surface tab) – credited only if demonstrated'], ['joist', 'Joist beams (Joist tab) – credited only if demonstrated'], ['both', 'Decking and joists'], ['none', 'None (fork supports only)']] });
    f(m + 'dl', 'Vertical deflection limit L/…', 'n', 200, { min: 50 }); f(m + 'tw', 'Twist limit', 'n', 2, { unit: '°', min: 0.1 });
    f(m + 'N', 'Additional axial force (compression +)', 'n', 0, { unit: 'kN' });
  };
  tb('sbi', 'SB-Int');
  secondary('sbi_', { arr: 'single', H: 350, B: 50, C: 25, t: 2, r: 3, gr: 'S350GD', fy: 350, fu: 420 });
  // ---------- 4 SB-End ----------
  tb('sbe', 'SB-End');
  secondary('sbe_', { arr: 'single', H: 350, B: 50, C: 25, t: 2, r: 3, gr: 'S350GD', fy: 350, fu: 420 });
  f('sbe_pos', 'SB-End designed for', 's', 'interior', { opts: [['interior', 'Interior column line (floor on both sides)'], ['edge', 'Edge column line (floor on one side)']] });

  // ---------- 5 Connections ----------
  tb('conn', 'Connections');
  const CT = [['fin', 'C-type: fin plate welded to the support, C web bolted (single shear)'], ['ucleat', 'U-type: U-cleat welded to the support, C web bolted between the legs (double shear)'],
    ['angle', 'Angle cleat bolted to the support and to the C web'], ['endplate', 'End plate welded to the C, bolted to the support'], ['welded', 'Welded: C web fillet-welded to a plate welded to the support'], ['boltweld', 'Bolted-and-welded: cleat welded to the C web, bolted to the support']];
  const conn = (c, d) => {
    gp(d.title);
    f(c + 'type', 'Connection arrangement', 's', d.type, { opts: CT });
    f(c + 'cls', 'Joint model in the analysis', 's', 'pin', { opts: [['pin', 'Nominally pinned (checked against the classification)'], ['semi', 'Semi-rigid (S_j,ini used)']] });
    f(c + 'gap', 'End gap: C end to the support face (main beam: to the flange tips)', 'n', 5, { unit: 'mm', min: 0 });
    f(c + 'tp', 'Plate / cleat thickness t_p', 'n', d.tp, { unit: 'mm', min: 2, max: 30 }); f(c + 'hp', 'Plate / cleat depth h_p', 'n', d.hp, { unit: 'mm', min: 30 });
    f(c + 'zp', 'Plate top below the top of the C', 'n', d.zp, { unit: 'mm', min: 0 }); f(c + 'bp', 'Plate projection from the support face (angle: C-side leg)', 'n', d.bp, { unit: 'mm', min: 20 });
    f(c + 'pgr', 'Plate grade', 's', 'S275', { opts: GRADES }); f(c + 'pfy', 'Plate f_y', 'n', 275, { unit: 'N/mm²' }); f(c + 'pfu', 'Plate f_u', 'n', 430, { unit: 'N/mm²' });
    f(c + 'nv', 'Bolt rows (vertical)', 'n', d.nv, { min: 1, max: 12, int: 1 }); f(c + 'nh', 'Bolt columns (horizontal)', 'n', d.nh, { min: 1, max: 4, int: 1 });
    f(c + 'p1', 'Vertical pitch p_1', 'n', d.p1, { unit: 'mm', min: 10 }); f(c + 'p2', 'Horizontal gauge p_2', 'n', d.p2, { unit: 'mm', min: 10 });
    f(c + 'z1', 'First bolt below the top of the C', 'n', d.z1, { unit: 'mm', min: 5 }); f(c + 'es', 'First bolt column from the C end e_s', 'n', d.es, { unit: 'mm', min: 5 });
    f(c + 'd', 'Bolt diameter d', 'n', d.d, { unit: 'mm', min: 5, max: 30 }); f(c + 'bg', 'Bolt grade', 's', '8.8', { opts: BOLTS });
    f(c + 'thr', 'Shear plane through the thread', 'b', 'yes');
    f(c + 'd0', 'Hole diameter d_0 (blank = d + 1 up to M14, d + 2 above)', 'n', '', { unit: 'mm', opt: 1 });
    f(c + 'hole', 'Hole type', 's', 'normal', { opts: [['normal', 'Normal round'], ['oversize', 'Oversize round'], ['slotV', 'Short slot, vertical (adjustment)']] });
    f(c + 'wsh', 'Washers under head and nut', 's', 'std', { opts: [['std', 'Standard (EN ISO 7089)'], ['none', 'None']] });
    f(c + 'a', 'Weld throat a (plate / cleat to support or to the C)', 'n', d.a, { unit: 'mm', min: 0 }); f(c + 'Lw', 'Weld length per line (blank = plate depth)', 'n', '', { unit: 'mm', opt: 1 });
    f(c + 'nw', 'Weld lines', 'n', 2, { min: 1, max: 4, int: 1 });
    f(c + 'nvs', 'Support-side bolt rows (angle / end plate / bolted-welded)', 'n', d.nv, { min: 1, max: 12, int: 1 }); f(c + 'gs', 'Support-side bolt gauge (end plate: 2 columns)', 'n', 60, { unit: 'mm' });
    gp(d.title + ' – additional vertical holes in the C web (adjustment)');
    f(c + 'nAdj', 'Number of additional holes (one vertical line)', 'n', 0, { min: 0, max: 30, int: 1 });
    f(c + 'dAdj', 'Hole diameter', 'n', 14, { unit: 'mm' }); f(c + 'sAdj', 'Shape', 's', 'round', { opts: [['round', 'Round'], ['slot', 'Vertical slot']] }); f(c + 'lAdj', 'Slot length (slot only)', 'n', 20, { unit: 'mm' });
    f(c + 'pAdj', 'Vertical pitch', 'n', 50, { unit: 'mm' }); f(c + 'zAdj', 'First hole below the top of the C', 'n', 60, { unit: 'mm' }); f(c + 'eAdj', 'Hole line from the C end', 'n', 60, { unit: 'mm' });
    f(c + 'tolAdj', 'Positional tolerance', 'n', 2, { unit: 'mm', min: 0 });
  };
  conn('ci_', { title: 'SB-Int → main beam', type: 'angle', tp: 5, hp: 220, zp: 40, bp: 110, nv: 2, nh: 1, p1: 170, p2: 50, z1: 60, es: 30, d: 12, a: 0 });
  conn('ce_', { title: 'SB-End → box column', type: 'fin', tp: 5, hp: 220, zp: 25, bp: 90, nv: 2, nh: 2, p1: 170, p2: 40, z1: 50, es: 25, d: 12, a: 4 });
  conn('cm_', { title: 'Main beam → box column', type: 'ucleat', tp: 5, hp: 270, zp: 40, bp: 90, nv: 3, nh: 1, p1: 110, p2: 50, z1: 70, es: 35, d: 12, a: 4 });

  // ---------- 6 Box column ----------
  tb('col', 'Box column');
  gp('Section');
  f('col_type', 'Column type', 's', 'weld', { opts: [['weld', 'Welded box from four plates'], ['rhsH', 'Hot-finished RHS / SHS (EN 10210)'], ['rhsC', 'Cold-formed RHS / SHS (EN 10219)']] });
  f('col_b', 'Width b (face receiving the main beam)', 'n', 150, { unit: 'mm', min: 40 }); f('col_h', 'Depth h (face receiving the SB-End)', 'n', 150, { unit: 'mm', min: 40 });
  f('col_tb', 'Wall thickness of the b-faces', 'n', 5, { unit: 'mm', min: 1.5 }); f('col_th', 'Wall thickness of the h-faces', 'n', 5, { unit: 'mm', min: 1.5 });
  f('col_ro', 'RHS outer corner radius (blank = 2t)', 'n', '', { unit: 'mm', opt: 1 });
  f('col_cw', 'Welded box: corner welds', 's', 'fillet', { opts: [['fillet', 'Fillet / partial-penetration corner welds'], ['cjp', 'Full-penetration corner welds']] });
  f('col_aw', 'Corner weld throat a', 'n', 4, { unit: 'mm', min: 0 });
  f('col_gr', 'Grade', 's', 'S355', { opts: GRADES }); f('col_fy', 'f_y', 'n', 355, { unit: 'N/mm²' }); f('col_fu', 'f_u', 'n', 490, { unit: 'N/mm²' });
  gp('Stability and loads');
  f('col_base', 'Base', 's', 'pin', { opts: [['pin', 'Pinned base'], ['fix', 'Fixed base']] });
  f('col_frame', 'Frame stability', 's', 'braced', { opts: [['braced', 'Braced (vertical bracing, Bracing tab)'], ['knee', 'Sway frame stabilised by knee braces'], ['user', 'User effective-length factors']] });
  f('col_ky', 'User k_y (buckling about the axis parallel to b)', 'n', 1.0, { min: 0.5, max: 4 }); f('col_kz', 'User k_z', 'n', 1.0, { min: 0.5, max: 4 });
  f('col_zr', 'Intermediate restraint height (minor axis), 0 = none', 'n', 0, { unit: 'mm', min: 0 });
  f('col_N', 'Additional axial force', 'n', 0, { unit: 'kN' }); f('col_My', 'Additional moment M_y', 'n', 0, { unit: 'kN·m' }); f('col_Mz', 'Additional moment M_z', 'n', 0, { unit: 'kN·m' });
  f('col_V', 'Additional shear', 'n', 0, { unit: 'kN' }); f('col_T', 'Torsion', 'n', 0, { unit: 'kN·m' });
  f('col_spl', 'Column splice', 's', 'none', { opts: [['none', 'None'], ['yes', 'Yes (design by the engineer – flagged)']] });
  gp('Base plate, anchors and slab');
  f('bp_a', 'Base plate length', 'n', 200, { unit: 'mm' }); f('bp_b', 'Base plate width', 'n', 200, { unit: 'mm' }); f('bp_t', 'Base plate thickness', 'n', 12, { unit: 'mm' });
  f('bp_fy', 'Base plate f_y', 'n', 275, { unit: 'N/mm²' });
  f('bp_nA', 'Number of anchors', 'n', 4, { min: 0, int: 1 }); f('bp_dA', 'Anchor diameter', 'n', 12, { unit: 'mm' }); f('bp_gA', 'Anchor grade', 's', '8.8', { opts: BOLTS });
  f('fck', 'Concrete f_ck', 'n', 25, { unit: 'N/mm²' }); f('slab_h', 'Slab thickness', 'n', 200, { unit: 'mm' }); f('slab_d', 'Slab effective depth d', 'n', 160, { unit: 'mm' });
  f('slab_rho', 'Slab tension reinforcement ratio ρ_l', 'n', 0.0, { min: 0, max: 0.02, help: '0 if unreinforced or unknown: punching then uses v_min only.' });
  f('ac1', 'Concrete bearing area ratio A_c1 / A_c0 (1 = plate size)', 'n', 1, { min: 1, max: 9 });

  // ---------- 7 Joist beams ----------
  tb('joist', 'Joist beams');
  f('j_n', 'Number of joists per secondary span N_J (0 = none)', 'n', 5, { min: 0, max: 8, int: 1 });
  f('j_aL', 'First / last joist distance from the secondary ends a', 'n', 500, { unit: 'mm', min: 0 });
  f('j_sec', 'Joist section', 's', 'L', { opts: [['L', 'Equal / unequal angle'], ['box', 'Box / SHS'], ['C', 'Lipped C (same rules as SB)']] });
  f('j_b', 'Leg 1 / width b', 'n', 40, { unit: 'mm' }); f('j_h', 'Leg 2 / depth h', 'n', 40, { unit: 'mm' }); f('j_t', 'Thickness t', 'n', 4, { unit: 'mm' });
  f('j_fy', 'f_y', 'n', 250, { unit: 'N/mm²' }); f('j_fu', 'f_u', 'n', 320, { unit: 'N/mm²' });
  f('j_at', 'Joist connected to the secondary', 's', 'top', { opts: [['top', 'Top flange (lateral restraint at the top flange)'], ['bot', 'Bottom flange'], ['web', 'Web, mid-depth']] });
  f('j_q', 'Additional load on the joist (ULS)', 'n', 0, { unit: 'kN/m' });
  f('j_nb', 'Bolts per joist end', 'n', 1, { min: 1, max: 4, int: 1 }); f('j_d', 'Bolt diameter', 'n', 12, { unit: 'mm' }); f('j_bg', 'Bolt grade', 's', '8.8', { opts: BOLTS }); f('j_e1', 'End distance e_1', 'n', 25, { unit: 'mm' });
  f('j_anch', 'Joist lines anchored to', 's', 'kneeSBE', { opts: [['kneeSBE', 'SB-End knee-braced to the columns'], ['bay', 'Braced bay'], ['none', 'Not anchored']] });

  // ---------- 8 Knee bracing ----------
  tb('knee', 'Knee bracing');
  f('k_use', 'Knee braces present', 'b', 'yes');
  f('k_to', 'Knee brace connects the column to', 's', 'both', { opts: [['both', 'Main beam and SB-End'], ['sbe', 'SB-End'], ['mb', 'Main beam']] });
  f('k_an', 'Knee braces in the beam analysis', 's', 'yes', { opts: [['yes', 'Yes: elastic supports at the knee points (M, V, δ and reactions include them)'], ['no', 'No: checked for the sway force only (before v1.6)']] });
  f('k_th', 'Angle to the beam axis θ', 'n', 45, { unit: '°', min: 20, max: 70 }); f('k_a', 'Distance along the beam from the column face a', 'n', 500, { unit: 'mm', min: 100 });
  f('k_nL', 'Build-up', 's', '1', { opts: [['1', 'Single angle'], ['2', 'Two angles back-to-back']] });
  f('k_b', 'Angle leg b (connected)', 'n', 50, { unit: 'mm' }); f('k_h', 'Angle leg h', 'n', 50, { unit: 'mm' }); f('k_t', 'Angle thickness', 'n', 5, { unit: 'mm' });
  f('k_fy', 'f_y', 'n', 250, { unit: 'N/mm²' }); f('k_fu', 'f_u', 'n', 320, { unit: 'N/mm²' });
  f('k_nb', 'Bolts per end (one line)', 'n', 1, { min: 1, max: 4, int: 1 }); f('k_d', 'Bolt diameter', 'n', 12, { unit: 'mm' }); f('k_bg', 'Bolt grade', 's', '8.8', { opts: BOLTS });
  f('k_p1', 'Pitch p_1', 'n', 60, { unit: 'mm' }); f('k_e1', 'End distance e_1', 'n', 25, { unit: 'mm' }); f('k_e2', 'Edge distance e_2 (blank = b/2)', 'n', '', { unit: 'mm', opt: 1 });
  f('k_tg', 'Gusset / packing between the two angles', 'n', 6, { unit: 'mm' }); f('k_sp', 'Packing spacing (two angles)', 'n', 300, { unit: 'mm' });
  f('k_H', 'Additional horizontal load per column at beam level (ULS)', 'n', 0, { unit: 'kN', help: 'The notional sway force φ·N (EN 1993-1-1 5.3.2) is added automatically.' });

  // ---------- 9 Surface / decking ----------
  tb('deck', 'Surface / decking');
  gp('Surface');
  f('d_type', 'Floor element', 's', 'steel', { opts: [['mdf', 'MDF / particle board panels'], ['steel', 'Steel panel / profiled decking'], ['grating', 'Open grating'], ['user', 'User-defined surface']] });
  f('d_ref', 'Product / manufacturer reference', 'x', 'Deck 40/0.75');
  f('d_sw', 'Self-weight of the surface', 'n', 30, { unit: 'kg/m²', min: 0 });
  f('d_t', 'Thickness (steel: sheet; MDF: board)', 'n', 0.75, { unit: 'mm' });
  f('d_I', 'Second moment of area per metre width I_s (steel deck / user)', 'n', 250000, { unit: 'mm⁴/m' }); f('d_W', 'Section modulus per metre W_s (steel deck / user)', 'n', 9000, { unit: 'mm³/m' });
  f('d_fy', 'Steel f_y (deck)', 'n', 320, { unit: 'N/mm²' }); f('d_fu', 'Steel f_u (deck)', 'n', 390, { unit: 'N/mm²' });
  f('d_fmk', 'MDF characteristic bending strength f_m,k', 'n', 17, { unit: 'N/mm²' }); f('d_Em', 'MDF / board E_mean', 'n', 3000, { unit: 'N/mm²' });
  f('d_kmod', 'k_mod (MDF, EN 1995)', 'n', 0.4, { min: 0.1, max: 1.1 }); f('d_gm', 'γ_M (MDF)', 'n', 1.3, { min: 1, max: 2 });
  f('d_qall', 'Grating / user: design capacity for the span (manufacturer)', 'n', '', { unit: 'kN/m²', opt: 1 });
  f('d_dl', 'Surface deflection limit span/…', 'n', 200, { min: 50 });
  gp('Restraint data (credited only when demonstrated)');
  f('d_basis', 'Basis of the restraint values', 's', 'manuf', { opts: [['none', 'None (not demonstrated)'], ['manuf', 'Manufacturer data'], ['test', 'Test report'], ['calc', 'Separate calculation'], ['fe', 'FE analysis']] });
  f('d_S', 'In-plane shear stiffness provided S (per secondary span)', 'n', 20000, { unit: 'kN', opt: 1 });
  f('d_CDA', 'Rotational stiffness of the surface-to-SB connection C_D,A', 'n', 3, { unit: 'kN·m/m/rad', opt: 1, help: 'From test or manufacturer only (EN 1993-1-3 10.1.5.2). Blank = torsional restraint not credited.' });
  f('d_fx', 'Fastener', 's', 'screw', { opts: [['screw', 'Self-drilling screw (EN 1993-1-3 8.3)'], ['bolt', 'Bolt'], ['clip', 'Clip / other (enter resistance)']] });
  f('d_fd', 'Fastener diameter', 'n', 5.5, { unit: 'mm' }); f('d_fdw', 'Head / washer diameter d_w', 'n', 14, { unit: 'mm' });
  f('d_fs', 'Fastener spacing along the secondary', 'n', 300, { unit: 'mm' }); f('d_fn', 'Fasteners per position', 'n', 2, { min: 1, int: 1 });
  f('d_fv', 'Fastener shear resistance F_v,Rd (manufacturer; blank = not known)', 'n', '', { unit: 'kN', opt: 1 });
  f('d_fK', 'Fastener lateral stiffness (blank = not known)', 'n', '', { unit: 'kN/mm', opt: 1 });
  f('d_anch', 'Diaphragm anchored to a braced bay / rigid support', 'b', 'yes'); f('d_anR', 'Anchorage capacity', 'n', 60, { unit: 'kN' });
  f('d_mb', 'Surface also fixed to the main-beam top flange', 'b', 'no');

  // ---------- 10 Bracing ----------
  tb('brac', 'Bracing & restraints');
  f('br_use', 'Plan bracing in the braced bay', 'b', 'yes');
  f('br_type', 'Bracing member', 's', 'flat', { opts: [['rod', 'Round rod (tension only)'], ['flat', 'Flat bar (tension only)'], ['angle', 'Angle']] });
  f('br_b', 'Flat width / rod Ø / angle leg', 'n', 50, { unit: 'mm' }); f('br_t', 'Flat / angle thickness', 'n', 5, { unit: 'mm' });
  f('br_fy', 'f_y', 'n', 275, { unit: 'N/mm²' }); f('br_fu', 'f_u', 'n', 430, { unit: 'N/mm²' });
  f('br_d', 'End bolt diameter', 'n', 12, { unit: 'mm' }); f('br_bg', 'Bolt grade', 's', '8.8', { opts: BOLTS }); f('br_nb', 'Bolts per end', 'n', 1, { min: 1, int: 1 });
  f('br_nbay', 'Number of braced bays per line', 'n', 1, { min: 1, int: 1 });
  f('vb_use', 'Vertical bracing between columns', 'b', 'yes'); f('vb_b', 'Vertical brace size (flat width)', 'n', 50, { unit: 'mm' }); f('vb_t', 'Vertical brace thickness', 'n', 5, { unit: 'mm' });
  f('br_H', 'Additional horizontal load on the floor (ULS, total per direction)', 'n', 0, { unit: 'kN' });

  const defaults = () => { const d = {}; for (const x of T) if (!x.tabDef) d[x.id] = x.def; return d; };
  const byId = {}; for (const x of T) if (!x.tabDef) byId[x.id] = x;
  const tabs = T.filter(x => x.tabDef);
  return { T, tabs, byId, defaults, GV, GRADES };
})();

