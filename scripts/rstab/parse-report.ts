// Parses the text of an RSTAB printout (extracted with pdf.js) into JSON for the benchmark.
//   npx tsx scripts/rstab/parse-report.ts <report.txt> <outDir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const [, , src, outDir = 'benchmarks/rstab-3x5'] = process.argv;
const lines = readFileSync(src, 'utf8').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim());
const idx = (re: RegExp, from = 0) => { for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i; return -1; };
const num = (s: string) => Number(s.replace(/,/g, ''));
mkdirSync(outDir, { recursive: true });

const iNodes = idx(/^1\.1 NODES/), iMat = idx(/^1\.2 MATERIALS/), iMembers = idx(/^1\.7 MEMBERS/), iSup = idx(/^1\.8 NODAL SUPPORTS/), iSets = idx(/^1\.11 SETS OF MEMBERS/);
const iLoadCases = idx(/^2\.1 LOAD CASES/), iGen = idx(/^3\.5 GENERATED LOADS/), iIO = idx(/^3\.4 IO/), iForces = idx(/^4\.1 MEMBERS - INTERNAL FORCES/);
const iSecF = idx(/^4\.3 CROSS-SECTIONS - INTERNAL FORCES/), iSupF = idx(/^4\.4 NODES - SUPPORT FORCES/), iDef = idx(/^4\.6 NODES - DEFORMATIONS/);
const iRC = idx(/^4\.3 CROSS-SECTIONS - INTERNAL FORCES.*Result Combinations/);

// ---- nodes
const nodes: { id: number; x: number; y: number; z: number }[] = [];
for (let i = iNodes; i < iMat; i++) {
  const m = lines[i].match(/^(\d+) (?:-|\d+) Cartesian (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)/);
  if (m) nodes.push({ id: +m[1], x: +m[2], y: +m[3], z: +m[4] });
}

// ---- members
const members: any[] = [];
for (let i = iMembers; i < iSup; i++) {
  const m = lines[i].match(/^(\d+) (Beam|Null|Truss \( N only \)) (\d+) (\d+) Angle (-?[\d.]+) (\d+) (\d+) (\S+) (\S+) (\S+) (\S+) ([\d.]+) (\S+)/);
  if (m) members.push({ id: +m[1], type: m[2] === 'Beam' ? 'beam' : m[2] === 'Null' ? 'null' : 'truss', n1: +m[3], n2: +m[4], beta: +m[5], sec1: +m[6], sec2: +m[7], hinge1: m[8] === '-' ? 0 : +m[8], hinge2: m[9] === '-' ? 0 : +m[9], ecc: m[10] === '-' ? 0 : +m[10], div: m[11] === '-' ? 0 : +m[11], length: +m[12], dir: m[13] });
}

// ---- supports (node list after the "on next row" line)
const supNodes: number[] = [];
{
  let on = false;
  for (let i = iSup; i < iSets; i++) {
    if (/on next row/.test(lines[i])) { on = true; continue; }
    if (on && /^[\d, ]+,?$/.test(lines[i])) for (const t of lines[i].split(',')) { if (t.trim()) supNodes.push(+t.trim()); }
  }
}

// ---- sets of members
const sets: { id: number; members: number[]; length: number }[] = [];
{
  const text = lines.slice(iSets + 1, iLoadCases).filter((l) => !/^(=== PAGE|1\.11 SETS OF MEMBERS|Set Set of Members|No\. Description Type)/.test(l)).join(' ').replace(/\s+/g, ' ').replace(/ member (?=\d+ Continuous)/g, ' '); // drop the page headers that interrupt an entry; a split 'member' word of the previous entry
  const re = /(\d+) Continuous Members \d+ Contin\.? ?(?:m(?:ember)?)? ?([\d,\- ]+?) (\d+\.\d)(?= \d+ Continuous|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const list: number[] = [];
    for (const part of m[2].split(',')) { const p = part.trim(); if (!p) continue; const r = p.match(/^(\d+)-(\d+)$/); if (r) for (let k = +r[1]; k <= +r[2]; k++) list.push(k); else if (/^\d+$/.test(p)) list.push(+p); }
    sets.push({ id: +m[1], members: list, length: +m[3] });
  }
}

// ---- generated loads / imperfections (parameters only; the printout truncates the member lists)
const gen = lines.slice(iGen, iIO).filter((l) => /Area load magnitude|Corner nodes|Generating total loads|Z :|number of cells|cell area|Load distribution|Member load direction/.test(l));
const io = lines.slice(iIO, iIO + 20).filter((l) => /Set of members|Imperfection towards/.test(l));

// ---- RSTAB results
type Row = { x: number; N: number; Vy: number; Vz: number; T: number; My: number; Mz: number; kind: string };
const forces: Record<string, Record<string, Row[]>> = {}; // member -> combo -> rows
{
  let mem = 0, combo = '';
  for (let i = iForces; i < iSecF; i++) {
    const l = lines[i];
    let m = l.match(/^(\d+) (CO\d) (Max|Min|MAX|MIN) (N|V y|V z|M T|M y|M z|MT) (-?[\d.]+) (-?[\d.]+)(?: (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+))?/);
    let rest: RegExpMatchArray | null = null;
    if (m) { mem = +m[1]; combo = m[2]; rest = m; }
    else {
      m = l.match(/^(CO\d) (Max|Min|MAX|MIN) (N|V y|V z|M T|M y|M z|MT) (-?[\d.]+) (-?[\d.]+)(?: (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+))?/);
      if (m) { combo = m[1]; rest = [m[0], String(mem), ...m.slice(1)] as any; }
      else {
        m = l.match(/^(Max|Min|MAX|MIN) (N|V y|V z|M T|M y|M z|MT) (-?[\d.]+) (-?[\d.]+)(?: (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+))?/);
        if (m) rest = [m[0], String(mem), combo, ...m.slice(1)] as any;
      }
    }
    if (!rest) continue;
    const g = rest as unknown as string[];
    // g: [0]=full, 1=member, 2=combo, 3=Max/Min, 4=kind, 5=x, 6=N, 7..11=Vy,Vz,T,My,Mz
    const vals = g.slice(5).map((v) => (v === undefined ? NaN : num(v)));
    if (vals.length < 2) continue;
    const row: Row = { x: vals[0], N: vals[1], Vy: vals[2] ?? NaN, Vz: vals[3] ?? NaN, T: vals[4] ?? NaN, My: vals[5] ?? NaN, Mz: vals[6] ?? NaN, kind: g[3] + ' ' + g[4] };
    ((forces[mem] ??= {})[combo] ??= []).push(row);
  }
}
const support: Record<string, Record<string, number[]>> = {};
{
  let node = 0;
  for (let i = iSupF; i < iDef; i++) {
    const l = lines[i];
    const m = l.match(/^(?:(\d+) )?(CO\d) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)/);
    if (!m) continue;
    if (m[1]) node = +m[1];
    ((support[node] ??= {})[m[2]] = [3, 4, 5, 6, 7, 8].map((k) => +m[k]));
  }
}
const defo: Record<string, Record<string, number[]>> = {};
{
  let node = 0;
  const iNext = idx(/^4.7 MEMBERS/, iDef); // later sections (local / global deformations) have the same row layout
  const end = iNext > iDef ? iNext : iRC > iDef ? iRC : lines.length;
  for (let i = iDef; i < end; i++) {
    const m = lines[i].match(/^(?:(\d+) )?(CO\d) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)/);
    if (!m) continue;
    if (m[1]) node = +m[1];
    ((defo[node] ??= {})[m[2]] = [4, 5, 6, 7, 8, 9].map((k) => +m[k]).concat(+m[3]));
  }
}

const write = (name: string, v: unknown) => writeFileSync(`${outDir}/${name}.json`, JSON.stringify(v));
write('nodes', nodes); write('members', members); write('supports', supNodes); write('sets', sets);
write('loads', { generated: gen, imperfection: io });
write('rstab-forces', forces); write('rstab-support', support); write('rstab-deformation', defo);
console.log({ nodes: nodes.length, members: members.length, supports: supNodes.length, sets: sets.length, forcesMembers: Object.keys(forces).length, supportNodes: Object.keys(support).length, defNodes: Object.keys(defo).length });
console.log('io', io); console.log('gen sample', gen.slice(0, 6));
