// Scale check: a synthetic multi-storey 3D frame with ~2,900 members.   npx tsx scripts/bench-frame.ts [nx] [ny] [nz] [divisions]
import { FrameModel, FMember } from '../src/server/frame/types';
import { prepare } from '../src/server/frame/model';
import { solveFrame } from '../src/server/frame/solve';

const [nx, ny, nz, div] = [+(process.argv[2] || 15), +(process.argv[3] || 15), +(process.argv[4] || 4), +(process.argv[5] || 4)];
const nodes: FrameModel['nodes'] = [], members: FMember[] = [];
const id = (i: number, j: number, k: number) => 1 + i + (nx + 1) * (j + (ny + 1) * k);
for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) nodes.push({ id: id(i, j, k), x: i * 5000, y: j * 4500, z: k * 3500 });
let mid = 1;
for (let k = 0; k < nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) members.push({ id: mid++, type: 'beam', n1: id(i, j, k), n2: id(i, j, k + 1), section: 'C', material: 'S', divisions: div });
for (let k = 1; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) members.push({ id: mid++, type: 'beam', n1: id(i, j, k), n2: id(i + 1, j, k), section: 'B', material: 'S', divisions: div, rel1: { ry: true, rz: true }, rel2: { ry: true, rz: true } });
for (let k = 1; k <= nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) members.push({ id: mid++, type: 'beam', n1: id(i, j, k), n2: id(i, j + 1, k), section: 'B', material: 'S', divisions: div, rel1: { ry: true, rz: true }, rel2: { ry: true, rz: true } });
const F6 = [true, true, true, true, true, true] as any;
const model: FrameModel = {
  nodes, members,
  materials: { S: { E: 210000, G: 81000, w: 7.85e-5 } },
  sections: { C: { A: 2879, Iy: 10.05e6, Iz: 10.05e6, J: 15.4e6 }, B: { A: 674, Iy: 3.8e6, Iz: 0.237e6, J: 0.8e3 } },
  supports: nodes.filter((n) => n.z === 0).map((n) => ({ node: n.id, fixed: F6 })),
};
let t = Date.now();
const lap = (s: string) => { const n = Date.now(); console.log(s.padEnd(40), ((n - t) / 1000).toFixed(2), 's'); t = n; };
const ps = prepare(model);
lap(`prepare (${members.length} members, ${ps.elements.length} elements, ${ps.nNodes} nodes, ${ps.nDof} dof)`);
const sw = nodes.filter((n) => n.z > 0).map((n) => ({ node: n.id, f: [0, 0, -3000, 0, 0, 0] as any }));
const lcs = { id: 'G', nodal: sw, member: members.filter((m) => m.section === 'B').map((m) => ({ member: m.id, q: [0, 0, -5] as any, system: 'global' as const })) };
const H = { id: 'H', nodal: nodes.filter((n) => n.z > 0).map((n) => ({ node: n.id, f: [4000, 0, 0, 0, 0, 0] as any })) };
const r1 = solveFrame({ prepared: ps, combo: [{ lc: lcs as any, factor: 1.4 }, { lc: H as any, factor: 1 }], options: { secondOrder: false } });
lap(`first-order solve  (${r1.status}, ${r1.totalIterations} it)`);
const r2 = solveFrame({ prepared: ps, combo: [{ lc: lcs as any, factor: 1.4 }, { lc: H as any, factor: 1 }], options: { secondOrder: true, steps: +(process.env.STEPS || 1), maxSubdivisions: +(process.env.SUB || 0) } });
lap(`second-order solve (${r2.status}, ${r2.totalIterations} it)`);
const top = nodes.filter((n) => n.z === nz * 3500)[0].id;
console.log('top node ux first/second order [mm]:', r1.displacement.get(top)![0].toFixed(3), r2.displacement.get(top)![0].toFixed(3), 'amplification', (r2.displacement.get(top)![0] / r1.displacement.get(top)![0]).toFixed(4));
console.log(r2.message);
console.log(r2.iterations.slice(0, 14).map((i) => `${i.iter}:${i.resForce.toExponential(1)}/${i.resMoment.toExponential(1)}`).join('  '));
console.log('memory MB', Math.round(process.memoryUsage().heapUsed / 1e6), 'skyline doubles', ps.skyFirst.length);
