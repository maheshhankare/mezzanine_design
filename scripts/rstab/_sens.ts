// Sensitivity of the CO1 comparison to modelling assumptions that the RSTAB printout does not state.
import { readFileSync } from 'node:fs';
import { prepare } from '../../src/server/frame/model';
import { solveFrame, sectionForcesAt } from '../../src/server/frame/solve';
import { buildModel, loadCases, SECTIONS } from './build-model';
const F = JSON.parse(readFileSync('benchmarks/rstab-3x5/rstab-forces.json', 'utf8'));
const S = JSON.parse(readFileSync('benchmarks/rstab-3x5/rstab-support.json', 'utf8'));
function run(label: string, mod: (m: ReturnType<typeof buildModel>) => void) {
  const b = buildModel({ divColumn: 1, divBeam: 1 });
  mod(b);
  const { LC1, LC2 } = loadCases(b.members, b.nodeMap);
  const ps = prepare(b.model, 1);
  const res = solveFrame({ prepared: ps, combo: [{ lc: LC1, factor: 1.4 }, { lc: LC2, factor: 1.5 }], options: { secondOrder: false } });
  const byM = new Map<number, any[]>(); for (const e of res.elements) (byM.get(e.member) ?? byM.set(e.member, []).get(e.member)!).push(e);
  const mi = new Map(b.members.map((m) => [m.id, m]));
  const acc: Record<string, number[]> = { N: [], Vz: [], My: [] }; const mx: Record<string, number> = { N: 1e-9, Vz: 1e-9, My: 1e-9 };
  const rows: any[] = [];
  for (const [id, byCo] of Object.entries<any>(F)) { const mm = mi.get(+id)!; if (mm.dir === 'Z') continue; const els = byM.get(+id); if (!els) continue; for (const r of byCo.CO1 || []) { const el = els.find((e) => r.x >= e.x0 - 1e-6 && r.x <= e.x0 + e.L + 1e-6) ?? els[els.length - 1]; const f = sectionForcesAt(el, r.x - el.x0); rows.push([f[0] / 1e3, r.N, 'N'], [f[2] / 1e3, r.Vz, 'Vz'], [f[4] / 1e4, r.My, 'My']); for (const [k, v] of [['N', r.N], ['Vz', r.Vz], ['My', r.My]] as [string, number][]) if (Math.abs(v) > mx[k]) mx[k] = Math.abs(v); } }
  for (const [a, b2, k] of rows) { if (!Number.isFinite(b2)) continue; acc[k].push(Math.abs(a - b2) / Math.max(Math.abs(b2), 0.05 * mx[k])); }
  const med = (x: number[]) => [...x].sort((p, q) => p - q)[Math.floor(x.length / 2)] * 100, mxx = (x: number[]) => Math.max(...x) * 100;
  let sup = 0, supMax = 0; for (const [id, byCo] of Object.entries<any>(S)) { const r = res.reactions.get(+id)!; const e = Math.abs(-r[0] / 1000 - byCo.CO1[0]) / 0.5; sup = Math.max(sup, e); supMax = Math.max(supMax, Math.abs(-r[2] / 1000 / byCo.CO1[2] - 1)); }
  console.log(`${label.padEnd(46)} N: med ${med(acc.N).toFixed(2)} max ${mxx(acc.N).toFixed(2)} | Vz: med ${med(acc.Vz).toFixed(2)} max ${mxx(acc.Vz).toFixed(2)} | My: med ${med(acc.My).toFixed(2)} max ${mxx(acc.My).toFixed(2)} | Pz max ${(supMax * 100).toFixed(2)}`);
}
run('baseline (all as printed)', () => {});
run('no shear deformation (Ay, Az omitted)', (b) => { for (const s of Object.values(b.model.sections)) { delete (s as any).Ay; delete (s as any).Az; } });
run('brace EA x 0.9', (b) => { for (const m of b.model.members) if (m.type === 'truss') m.fEA = 0.9; });
run('brace EA x 1.1', (b) => { for (const m of b.model.members) if (m.type === 'truss') m.fEA = 1.1; });
run('beam EI x 0.9 (all C sections)', (b) => { for (const m of b.model.members) if (m.type === 'beam' && m.section !== '1') m.fEI = 0.9; });
run('column EI x 0.9', (b) => { for (const m of b.model.members) if (m.section === '1') m.fEI = 0.9; });
run('torsion GJ x 100 (C sections)', (b) => { for (const m of b.model.members) if (m.type === 'beam' && m.section !== '1') m.fGJ = 100; });
run('torsion GJ x 0.01 (C sections)', (b) => { for (const m of b.model.members) if (m.type === 'beam' && m.section !== '1') m.fGJ = 0.01; });
void SECTIONS;
