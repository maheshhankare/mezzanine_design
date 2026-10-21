// Builds the solver model (src/server/frame) from the parsed RSTAB benchmark (benchmarks/rstab-3x5/*.json).
import { readFileSync } from 'node:fs';
import { FrameModel, FMember, LoadCase, MemberLoad } from '../../src/server/frame/types';

const dir = process.env.BENCH ?? 'benchmarks/rstab-3x5';
const read = <T>(f: string): T => JSON.parse(readFileSync(`${dir}/${f}.json`, 'utf8'));
export interface RNode { id: number; x: number; y: number; z: number }
export interface RMember { id: number; type: 'beam' | 'truss' | 'null'; n1: number; n2: number; beta: number; sec1: number; sec2: number; hinge1: number; hinge2: number; ecc: number; div: number; length: number; dir: string }

// Section properties and material of the benchmark (RSTAB printout, sections 1.3 and materials 1.2), converted to N, mm.
// kN/cm² -> N/mm² x10 ; cm² -> mm² x100 ; cm⁴ -> mm⁴ x1e4 ; kN/m³ -> N/mm³ x1e-6
export const SECTIONS: Record<string, { A: number; Iy: number; Iz: number; J: number; Ay: number; Az: number }> = {
  '1': { A: 28.79e2, Iy: 1005.04e4, Iz: 1005.04e4, J: 1537.27e4, Ay: 12.13e2, Az: 12.13e2 }, // QRO-PAR 150/5/5/0 (column)
  '2': { A: 6.74e2, Iy: 380.44e4, Iz: 23.73e4, J: 0.08e4, Ay: 1.05e2, Az: 3.36e2 }, // C-PAR 200/50/2/25/2 (secondary beam)
  '3': { A: 6.74e2, Iy: 380.44e4, Iz: 23.73e4, J: 0.08e4, Ay: 1.05e2, Az: 3.36e2 },
  '4': { A: 6.74e2, Iy: 380.44e4, Iz: 23.73e4, J: 0.08e4, Ay: 1.05e2, Az: 3.36e2 }, // main beam
  '5': { A: 9.58e2, Iy: 22.0e4, Iz: 41.05e4, J: 0.82e4, Ay: 3.53e2, Az: 3.01e2 }, // 2L 50x50x5 (truss)
};
export const MATERIAL = { E: 210000, G: 80769.2, w: 78.5e-6 }; // N/mm2, N/mm2, N/mm3

export function loadBenchmark() {
  const nodes = read<RNode[]>('nodes');
  const members = read<RMember[]>('members');
  const supports = read<number[]>('supports');
  return { nodes, members, supports };
}

export interface BuildOptions {
  /** elements per member by kind */
  divColumn: number;
  divBeam: number;
  /**
   * Shear deformation with the printed shear areas. Detail 1 model (benchmarks/rstab-3x5): OFF (bElemShearStiff = 0 in the .rs8; with it the
   * differences were up to 9 %). Detail 2 model (benchmarks/rstab-3x5-v2): ON (bElemShearStiff = 1; without it the differences are 3-45 %).
   */
  shearDeformation?: boolean;
}

export function buildModel(opt: BuildOptions) {
  const { nodes, members, supports } = loadBenchmark();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const fm: FMember[] = [];
  const hingeRel = { ry: true, rz: true } as const; // both RSTAB hinges: local y and z rotations released, translations and torsion rigid
  for (const m of members) {
    if (m.type === 'null') continue;
    const a = nodeMap.get(m.n1)!, b = nodeMap.get(m.n2)!;
    const vertical = Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
    fm.push({
      id: m.id, type: m.type === 'truss' ? 'truss' : 'beam', n1: m.n1, n2: m.n2, section: String(m.sec1), material: 'S', beta: m.beta || 0,
      rel1: m.hinge1 ? { ...hingeRel } : undefined, rel2: m.hinge2 ? { ...hingeRel } : undefined,
      divisions: m.type === 'truss' ? 1 : vertical ? opt.divColumn : opt.divBeam,
    });
  }
  const model: FrameModel = {
    nodes: nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, z: n.z })),
    materials: { S: MATERIAL },
    sections: Object.fromEntries(Object.entries(SECTIONS).map(([k, s]) => [k, opt.shearDeformation ? { A: s.A, Iy: s.Iy, Iz: s.Iz, J: s.J, Ay: s.Ay, Az: s.Az } : { A: s.A, Iy: s.Iy, Iz: s.Iz, J: s.J }])),
    members: fm,
    supports: supports.map((id) => ({ node: id, fixed: [true, true, true, true, true, true] as [boolean, boolean, boolean, boolean, boolean, boolean] })),
  };
  return { model, members, nodeMap };
}

/**
 * Area loads of the benchmark: RSTAB generates member loads from the area load on a plane ("Combined" distribution, converted to the
 * Y-direction beams). Reconstruction: each Y-direction beam line receives the load of the strip halfway to the neighbouring Y-direction
 * beam lines (one-way distribution to the beams that span in Y), on the whole member length. Checked against RSTAB's member shears.
 */
export function areaLoadOnYBeams(members: RMember[], nodeMap: Map<number, RNode>, p_kNm2: number): MemberLoad[] {
  const ybeams = members.filter((m) => {
    if (m.type !== 'beam' || m.sec1 === 1 || m.sec1 === 4) return false; // not columns, not the X-direction main beams
    const a = nodeMap.get(m.n1)!, b = nodeMap.get(m.n2)!;
    return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 1e-6 && Math.abs(a.z - b.z) < 1e-6;
  });
  const out: MemberLoad[] = [];
  const levels = new Set(ybeams.map((m) => nodeMap.get(m.n1)!.z));
  for (const z of levels) {
    const at = ybeams.filter((m) => nodeMap.get(m.n1)!.z === z);
    const xs = [...new Set(at.map((m) => nodeMap.get(m.n1)!.x))].sort((u, v) => u - v);
    const width = new Map<number, number>();
    xs.forEach((x, i) => {
      const left = i === 0 ? x : (x + xs[i - 1]) / 2;
      const right = i === xs.length - 1 ? x : (x + xs[i + 1]) / 2;
      width.set(x, right - left);
    });
    for (const m of at) {
      const w = width.get(nodeMap.get(m.n1)!.x)!;
      out.push({ member: m.id, q: [0, 0, (p_kNm2 * w) / 1000], system: 'global' }); // kN/m^2 x m = kN/m = N/mm; +Z = down in the RSTAB axes
    }
  }
  return out;
}

/**
 * Equivalent loads of an inclination imperfection (RSTAB "IO", inclination 1/phi0 on the sets of continuous columns):
 * every column member with compressive force N (from the gravity combination, first order) contributes +phi0·N·d at its upper node
 * and −phi0·N·d at its lower node (d = unit direction of the lean). At an intermediate node this equals phi0 times the vertical
 * load introduced there; the force at the base node goes straight into the support.
 * ASSUMPTION (not stated in the printout): the gravity combination used is CO1 and the loads are N-proportional as above.
 */
export function imperfectionLoads(members: RMember[], nodeMap: Map<number, RNode>, gravity: { elements: { member: number; stations: number[][] }[] }, phi0: number, d: [number, number, number]) {
  const f = new Map<number, [number, number, number]>();
  const add = (id: number, s: number) => { const c = f.get(id) ?? [0, 0, 0]; f.set(id, [c[0] + s * d[0], c[1] + s * d[1], c[2] + s * d[2]]); };
  const N = new Map<number, number>();
  for (const e of gravity.elements) if (!N.has(e.member)) N.set(e.member, e.stations[0][1]); // tension positive
  for (const m of members) {
    if (m.type !== 'beam') continue;
    const a = nodeMap.get(m.n1)!, b = nodeMap.get(m.n2)!;
    if (!(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6)) continue;
    const comp = -(N.get(m.id) ?? 0); // compression positive (N)
    const top = a.z < b.z ? m.n1 : m.n2, bottom = a.z < b.z ? m.n2 : m.n1;
    add(top, phi0 * comp); add(bottom, -phi0 * comp);
  }
  const nodal = [...f.entries()].map(([node, v]) => ({ node, f: [v[0], v[1], v[2], 0, 0, 0] as [number, number, number, number, number, number] }));
  const total = nodal.reduce((s, n) => s + Math.hypot(n.f[0], n.f[1], n.f[2]), 0);
  return { lc: { id: 'LC7', name: 'Imperfection (inclination)', nodal } as LoadCase, nLoads: nodal.length, total };
}

export function loadCases(members: RMember[], nodeMap: Map<number, RNode>): { LC1: LoadCase; LC2: LoadCase } {
  return {
    LC1: { id: 'LC1', name: 'Dead load', selfWeight: [0, 0, 1], member: areaLoadOnYBeams(members, nodeMap, 0.3) },
    LC2: { id: 'LC2', name: 'Live load', member: areaLoadOnYBeams(members, nodeMap, 6.0) },
  };
}
