// Builds the RSTAB benchmark mezzanine as a frame PROJECT (the data a stored project contains), from the parsed report data. Used by the integration tests and
// by `npx tsx scripts/rstab/project.ts <out.json>` to create a project file that can be imported into the application.
import { writeFileSync } from 'node:fs';
import { buildModel, loadCases } from './build-model';
import type { FrameProjectData } from '../../src/shared/frameProject';
import { defaultSettings } from '../../src/shared/analysisSettings';

export function buildBenchmarkProject(opt: { divColumn?: number; divBeam?: number; design?: boolean; sway?: 'equivalent-loads' | 'notional-loads' | 'geometry' } = {}): FrameProjectData {
  process.env.BENCH ??= 'benchmarks/rstab-3x5-v2';
  const { model, members, nodeMap } = buildModel({ divColumn: opt.divColumn ?? 4, divBeam: opt.divBeam ?? 2, shearDeformation: true });
  const { LC1, LC2 } = loadCases(members, nodeMap);
  const settings = defaultSettings();
  settings.shearDeformation = true;
  settings.sway = opt.sway === 'notional-loads' ? { mode: 'notional-loads', source: 'code', direction: '+X' } : { mode: opt.sway ?? 'equivalent-loads', source: 'user', phi0: 1 / 200, direction: '+X' };
  settings.design = { enabled: !!opt.design, kLy: 1, kLz: 1, cm: 'sway', manufacture: 'hollow-hot-rolled' };
  return {
    schema: 'frame-project-1',
    meta: { name: 'Mezzanine 3x5 (RSTAB benchmark)', description: 'RSTAB report Detail 3 model: two-level mezzanine 30 m x 40 m, 2,924 members' },
    frame: model,
    design: {
      materials: { S250: { fy: 250, fu: 330, E: 210000, description: 'S 250 GD' }, S350: { fy: 350, fu: 420, E: 210000, description: 'S 350 GD' } },
      sections: {
        '1': { kind: 'rhs', b: 150, h: 150, t: 5, rOuter: 5, rInner: 0, material: 'S250', manufacture: 'hollow-hot-rolled' },
        '2': { kind: 'cold-formed', material: 'S350', description: 'C-PAR 200/50/2/25/2 (lipped C, t = 2 mm)' },
        '3': { kind: 'cold-formed', material: 'S350', description: 'C-PAR 200/50/2/25/2 (lipped C, t = 2 mm)' },
        '4': { kind: 'cold-formed', material: 'S350', description: 'C-PAR 200/50/2/25/2 (lipped C, t = 2 mm)' },
        '5': { kind: 'angle', material: 'S250', description: '2L 50x50x5 (double angle, IS 808)' },
      },
    },
    loadCases: [LC1, LC2],
    combinations: [
      { id: 'CO1', name: '1.4 DL + 1.5 LL + sway imperfection (+Y)', factors: [{ lc: 'LC1', factor: 1.4 }, { lc: 'LC2', factor: 1.5 }], sway: '+Y' },
      { id: 'CO2', name: '1.4 DL + 1.5 LL + sway imperfection (+X)', factors: [{ lc: 'LC1', factor: 1.4 }, { lc: 'LC2', factor: 1.5 }], sway: '+X' },
    ],
    up: [0, 0, -1],
    settings,
  };
}

if (process.argv[2]) { writeFileSync(process.argv[2], JSON.stringify(buildBenchmarkProject({ design: true }))); console.log('written', process.argv[2]); }
