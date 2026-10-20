// First-order comparison with RSTAB combination CO1 (1.4 DL + 1.5 LL, geometrically linear).
//   npx tsx scripts/rstab/compare-co1.ts [divColumn] [divBeam]
import { readFileSync } from 'node:fs';
import { prepare } from '../../src/server/frame/model';
import { solveFrame } from '../../src/server/frame/solve';
import { buildModel, loadCases } from './build-model';

const divColumn = +(process.argv[2] || 1), divBeam = +(process.argv[3] || 1);
const { model, members, nodeMap } = buildModel({ divColumn, divBeam });
const { LC1, LC2 } = loadCases(members, nodeMap);
let t = Date.now();
const ps = prepare(model, 1);
console.log(`model: ${model.members.length} members, ${ps.elements.length} elements, ${ps.nNodes} nodes, ${ps.nFree} free dof, messages: ${ps.messages.length ? ps.messages.slice(0, 3).join('; ') : 'none'}  [${((Date.now() - t) / 1000).toFixed(1)} s]`);
t = Date.now();
const co1 = [{ lc: LC1, factor: 1.4 }, { lc: LC2, factor: 1.5 }];
const r = solveFrame({ prepared: ps, combo: co1, options: { secondOrder: false } });
console.log(`CO1 first order: ${r.status}  ${r.message}  [${((Date.now() - t) / 1000).toFixed(1)} s]`);

const sup: Record<string, Record<string, number[]>> = JSON.parse(readFileSync('benchmarks/rstab-3x5/rstab-support.json', 'utf8'));
// RSTAB support forces: kN and kNcm.  Mine: N, Nmm.   P Z' (vertical) of RSTAB: +Z is down, support force positive when it acts up.
let sumMine = 0, sumRef = 0, worst = 0, worstNode = 0;
const rows: string[] = [];
for (const [nodeId, byCo] of Object.entries(sup)) {
  const ref = byCo.CO1; if (!ref) continue;
  const mine = r.reactions.get(+nodeId); if (!mine) continue;
  const rz = mine[2] / 1000; // kN
  sumMine += rz; sumRef += ref[2];
  const rel = Math.abs(rz - ref[2]) / Math.abs(ref[2]);
  if (rel > worst) { worst = rel; worstNode = +nodeId; }
  if (rows.length < 8) rows.push(`node ${nodeId}: Pz  mine ${rz.toFixed(2)}  RSTAB ${ref[2].toFixed(2)}  (${(rel * 100).toFixed(2)} %)   Px mine ${(mine[0] / 1000).toFixed(2)} RSTAB ${ref[0].toFixed(2)}  Py mine ${(mine[1] / 1000).toFixed(2)} RSTAB ${ref[1].toFixed(2)}`);
}
console.log(rows.join('\n'));
console.log(`sum of vertical support forces: mine ${sumMine.toFixed(2)} kN, RSTAB ${sumRef.toFixed(2)} kN  (${((sumMine / sumRef - 1) * 100).toFixed(3)} %)`);
console.log(`worst vertical support force difference: node ${worstNode}  ${(worst * 100).toFixed(2)} %`);
