// IS 800:2007 4.3.6 notional forces (0.5 % of the factored dead + vertical imposed load of each level) on the benchmark mezzanine, against the net horizontal force per
// level of the RSTAB-type equivalent imperfection loads (±φ0·N, φ0 = 1/200).   npx tsx scripts/rstab/notional-vs-equivalent.ts
// Purpose: show how the two representations relate on a real model. The benchmark is an RSTAB reproduction (flat φ0 = 1/200), not an IS 800 run.
import { prepare } from '../../src/server/frame/model';
import { solveFrame } from '../../src/server/frame/solve';
import { buildModel, loadCases, imperfectionLoads, SECTIONS, MATERIAL } from './build-model';
import { is800NotionalLoads } from '../../src/server/frame/codes/is800';

process.env.BENCH ??= 'benchmarks/rstab-3x5-v2';
const { model, members, nodeMap } = buildModel({ divColumn: 1, divBeam: 1, shearDeformation: true });
const { LC1, LC2 } = loadCases(members, nodeMap);
const ps = prepare(model, 1);
const g = solveFrame({ prepared: ps, combo: [{ lc: LC1, factor: 1.4 }, { lc: LC2, factor: 1.5 }], options: { secondOrder: false } });
const imp = imperfectionLoads(members, nodeMap, g, 1 / 200, [0, 1, 0]);

// factored vertical load applied at each level: area loads (member loads) + self-weight of the members whose axis lies in the level; factors 1.4 (dead) and 1.5 (imposed)
// floors every 4500 mm; the column joints of a floor sit at z = -4500 k and 500 mm below (the stub), so a floor groups the nodes with round(z / 4500) = -k
const floorOf = (z: number) => Math.round(z / 4500);
const levels = [...new Set([...nodeMap.values()].filter((n) => n.z !== 0).map((n) => n.z))].filter((z) => Math.abs(z / 4500 - Math.round(z / 4500)) < 1e-9).sort((a, b) => b - a);
const lenOf = (id: number) => { const m = members.find((x) => x.id === id)!; const a = nodeMap.get(m.n1)!, b = nodeMap.get(m.n2)!; return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); };
const rows: { z: number; V: number; notional: number; equivalent: number; nodes: number }[] = [];
for (const z of levels) {
  const atLevel = (id: number) => { const m = members.find((x) => x.id === id)!; return nodeMap.get(m.n1)!.z === z && nodeMap.get(m.n2)!.z === z; };
  let V = 0;
  for (const l of LC1.member ?? []) if (atLevel(l.member)) V += 1.4 * l.q[2] * lenOf(l.member);
  for (const l of LC2.member ?? []) if (atLevel(l.member)) V += 1.5 * l.q[2] * lenOf(l.member);
  for (const m of members) if (m.type !== 'null' && atLevel(m.id) && m.dir !== 'Z') { const sec = SECTIONS[String(m.sec1)]; V += 1.4 * sec.A * MATERIAL.w * lenOf(m.id); }
  if (!(V > 0)) continue; // not a floor level (e.g. the intermediate column nodes)
  const nodesAt = [...nodeMap.values()].filter((n) => floorOf(n.z) === floorOf(z));
  const eq = imp.lc.nodal!.filter((l) => floorOf(nodeMap.get(l.node)!.z) === floorOf(z)).reduce((s, l) => s + l.f[1], 0);
  const nl = is800NotionalLoads({ id: `z=${z}`, nodes: [{ node: nodesAt[0].id, vertical: V }] }, [0, 1, 0]);
  rows.push({ z, V, notional: nl.total, equivalent: eq, nodes: nodesAt.length });
}
console.log('level z [mm]  factored vertical load at the level [kN]  IS 800 4.3.6 notional force 0.5 % [kN]  net equivalent force ±φ0·N at the level [kN]  ratio equivalent / notional');
for (const r of rows) console.log(`${String(r.z).padStart(9)} ${(r.V / 1e3).toFixed(1).padStart(24)} ${(r.notional / 1e3).toFixed(2).padStart(36)} ${(r.equivalent / 1e3).toFixed(2).padStart(42)} ${(r.equivalent / r.notional).toFixed(3).padStart(30)}`);
console.log('\nThe net force per level of the equivalent loads is φ0 times the vertical load introduced at that level (column axial force change), 1/200 = 0.5 %: the same magnitude as the IS 800 notional force.');
console.log('Differences come from what is counted as "applied at the level" (column self-weight, braces, load carried by the columns of the level) and from the foundation level, where the pair force goes into the supports.');
console.log('IS 800 4.3.6.2(d): the notional force must not be taken to contribute to the net shear on the foundation; the equivalent imperfection loads of the benchmark do (RSTAB reports base shears including them).');
