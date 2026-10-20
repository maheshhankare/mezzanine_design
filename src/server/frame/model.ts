import { FrameModel, FMember, LoadCase, Release, SolveOptions, Vec6 } from './types';
import { BeamProps, beamG, beamKb, localAxes, trussG } from './element';
import { Skyline, rcm } from './skyline';

/**
 * Preparation of a frame model for the solver:
 *  – every member is divided into finite elements (internal nodes on the member axis);
 *  – DOF numbering: 6 per node, plus one extra DOF for every RELEASED component at a member end (hinge / spring);
 *    the element then relates local end components to the node through the matrix M (u_local = M q), so the same formulation
 *    holds for any hinge orientation and stays valid in the nonlinear analysis (no static condensation needed);
 *  – supports / unused DOF are constrained, remaining DOF are re-ordered (reverse Cuthill–McKee) for the skyline solver.
 */

const COMP = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] as const;

export interface PElem {
  index: number;
  member: number;
  kind: 'beam' | 'truss';
  n1: number; // node indices
  n2: number;
  L: number;
  R: number[][]; // rows = local x, y, z in global components
  props: BeamProps | { L: number; EA: number };
  Kb?: Float64Array;
  G: Float64Array;
  /** DOF ids of the independent variables q of this element */
  dofs: Int32Array;
  /** u_local = M q, row-major (nLocal × nq) */
  M: Float64Array;
  nLocal: number;
  nq: number;
  /** elastic hinge springs: displacement s = r·q, energy ½ k s² */
  springs: { k: number; r: Float64Array }[];
  tensionOnly: boolean;
  x0: number; // station of the element start along the member [mm]
}

export interface Prepared {
  model: FrameModel;
  nodeId: number[]; // index -> original id (internal nodes: -1)
  nodeIndex: Map<number, number>;
  coords: Float64Array;
  nNodes: number;
  elements: PElem[];
  memberElements: Map<number, number[]>;
  nDof: number;
  dofKind: Uint8Array; // 0 translation, 1 rotation
  fixed: Uint8Array;
  nodeSprings: { dof: number; k: number }[];
  /** free index of every DOF (-1 constrained) and its skyline position */
  pos: Int32Array;
  nFree: number;
  freeDof: Int32Array; // position -> DOF id
  skyFirst: Int32Array;
  unusedDofs: number;
  messages: string[];
}

export function prepare(model: FrameModel, divisionsDefault = 4): Prepared {
  const messages: string[] = [];
  const nodeId: number[] = [];
  const nodeIndex = new Map<number, number>();
  const xs: number[] = [];
  for (const n of model.nodes) {
    if (nodeIndex.has(n.id)) messages.push(`duplicate node id ${n.id}`);
    nodeIndex.set(n.id, nodeId.length);
    nodeId.push(n.id);
    xs.push(n.x, n.y, n.z);
  }
  const elements: PElem[] = [];
  const memberElements = new Map<number, number[]>();
  let nDof = 0; // assigned after nodes are known
  // pass 1: create nodes of divided members
  type Plan = { m: FMember; idx: number[]; L: number };
  const plans: Plan[] = [];
  for (const m of model.members) {
    const a = nodeIndex.get(m.n1), b = nodeIndex.get(m.n2);
    if (a === undefined || b === undefined) { messages.push(`member ${m.id}: unknown node`); continue; }
    const dx = xs[3 * b] - xs[3 * a], dy = xs[3 * b + 1] - xs[3 * a + 1], dz = xs[3 * b + 2] - xs[3 * a + 2];
    const L = Math.hypot(dx, dy, dz);
    if (!(L > 1e-9)) { messages.push(`member ${m.id}: zero length`); continue; }
    const d = m.type === 'truss' ? 1 : Math.max(1, Math.round(m.divisions ?? divisionsDefault));
    const idx = [a];
    for (let i = 1; i < d; i++) {
      idx.push(nodeId.length);
      nodeId.push(-1);
      const t = i / d;
      xs.push(xs[3 * a] + t * dx, xs[3 * a + 1] + t * dy, xs[3 * a + 2] + t * dz);
    }
    idx.push(b);
    plans.push({ m, idx, L });
  }
  const nNodes = nodeId.length;
  nDof = nNodes * 6;
  const kindExtra: number[] = [];
  const nodeSprings: { dof: number; k: number }[] = [];

  // pass 2: elements
  const relSpec = (r: Release | undefined, c: typeof COMP[number]) => (r ? r[c] : undefined);
  for (const { m, idx, L } of plans) {
    const mat = model.materials[m.material];
    const sec = model.sections[m.section];
    if (!mat || !sec) { messages.push(`member ${m.id}: unknown material or section`); continue; }
    const list: number[] = [];
    memberElements.set(m.id, list);
    const d = idx.length - 1;
    for (let e = 0; e < d; e++) {
      const n1 = idx[e], n2 = idx[e + 1];
      const le = L / d;
      const dx = xs[3 * n2] - xs[3 * n1], dy = xs[3 * n2 + 1] - xs[3 * n1 + 1], dz = xs[3 * n2 + 2] - xs[3 * n1 + 2];
      const R = localAxes(dx, dy, dz, m.beta ?? 0);
      const fEA = m.fEA ?? 1, fEI = m.fEI ?? 1, fGJ = m.fGJ ?? 1;
      const EA = mat.E * sec.A * fEA;
      if (m.type === 'truss') {
        const nq = 6;
        const dofs = new Int32Array(nq);
        for (let k = 0; k < 3; k++) { dofs[k] = n1 * 6 + k; dofs[3 + k] = n2 * 6 + k; }
        const M = new Float64Array(6 * 6);
        for (let n = 0; n < 2; n++) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) M[(n * 3 + r) * 6 + n * 3 + c] = R[r][c];
        const pe: PElem = { index: elements.length, member: m.id, kind: 'truss', n1, n2, L: le, R, props: { L: le, EA }, G: trussG(le), dofs, M, nLocal: 6, nq, springs: [], tensionOnly: !!m.tensionOnly, x0: (e * L) / d };
        list.push(elements.length);
        elements.push(pe);
        continue;
      }
      const props: BeamProps = {
        L: le, EA, EIy: mat.E * sec.Iy * fEI, EIz: mat.E * sec.Iz * fEI, GJ: mat.G * sec.J * fGJ,
        GAy: sec.Ay ? mat.G * sec.Ay : undefined, GAz: sec.Az ? mat.G * sec.Az : undefined, ipA: (sec.Iy + sec.Iz) / sec.A,
      };
      const dofsArr: number[] = [];
      for (let k = 0; k < 6; k++) dofsArr.push(n1 * 6 + k);
      for (let k = 0; k < 6; k++) dofsArr.push(n2 * 6 + k);
      // M rows: 12 local comps; columns: 12 node dofs + aux
      const aux: number[] = [];
      const mRows: Array<{ end: 0 | 1; comp: number; aux: number }> = [];
      const springs: { k: number; r: Float64Array; end: 0 | 1; comp: number; auxCol: number }[] = [];
      for (let end = 0 as 0 | 1; end <= 1; end = (end + 1) as 0 | 1) {
        const rel = end === 0 ? (e === 0 ? m.rel1 : undefined) : e === d - 1 ? m.rel2 : undefined;
        for (let c = 0; c < 6; c++) {
          const spec = relSpec(rel, COMP[c]);
          if (spec === undefined || spec === false) { mRows.push({ end, comp: c, aux: -1 }); continue; }
          const id = nDof + kindExtra.length;
          kindExtra.push(c < 3 ? 0 : 1);
          aux.push(id);
          mRows.push({ end, comp: c, aux: dofsArr.length + aux.length - 1 });
          if (typeof spec === 'number' && spec > 0) springs.push({ k: spec, r: new Float64Array(0), end, comp: c, auxCol: dofsArr.length + aux.length - 1 });
        }
      }
      const dofs = Int32Array.from([...dofsArr, ...aux]);
      const nq = dofs.length;
      const M = new Float64Array(12 * nq);
      mRows.forEach((row, i) => {
        if (row.aux >= 0) { M[i * nq + row.aux] = 1; return; }
        const off = row.end * 6 + (row.comp < 3 ? 0 : 3);
        const rr = row.comp % 3;
        for (let c = 0; c < 3; c++) M[i * nq + off + c] = R[rr][c];
      });
      const sp = springs.map((s) => {
        // s = aux − (R q)_c  (local component c of the node, projected from the global node DOF)
        const r = new Float64Array(nq);
        r[s.auxCol] = 1;
        const off = s.end * 6 + (s.comp < 3 ? 0 : 3);
        for (let c = 0; c < 3; c++) r[off + c] -= R[s.comp % 3][c];
        return { k: s.k, r };
      });
      const pe: PElem = { index: elements.length, member: m.id, kind: 'beam', n1, n2, L: le, R, props, Kb: beamKb(props), G: new Float64Array(0), dofs, M, nLocal: 12, nq, springs: sp, tensionOnly: false, x0: (e * L) / d };
      list.push(elements.length);
      elements.push(pe);
    }
  }
  nDof += kindExtra.length;
  const dofKind = new Uint8Array(nDof);
  for (let i = 0; i < nNodes * 6; i++) dofKind[i] = i % 6 < 3 ? 0 : 1;
  for (let i = 0; i < kindExtra.length; i++) dofKind[nNodes * 6 + i] = kindExtra[i];

  // supports
  const fixed = new Uint8Array(nDof);
  for (const s of model.supports) {
    const i = nodeIndex.get(s.node);
    if (i === undefined) { messages.push(`support: unknown node ${s.node}`); continue; }
    for (let k = 0; k < 6; k++) {
      if (s.fixed[k]) fixed[i * 6 + k] = 1;
      if (s.spring && s.spring[k] > 0) nodeSprings.push({ dof: i * 6 + k, k: s.spring[k] });
    }
  }
  // unused DOF (no element, no spring) are constrained so that the matrix stays regular
  const used = new Uint8Array(nDof);
  for (const el of elements) {
    // a DOF is "used" when a column of M refers to it: node rotations that a hinge fully disconnects from the member are not
    for (let c = 0; c < el.nq; c++) {
      let hit = false;
      for (let r = 0; r < el.nLocal && !hit; r++) if (Math.abs(el.M[r * el.nq + c]) > 1e-12) hit = true;
      if (hit) used[el.dofs[c]] = 1;
    }
    for (const sp of el.springs) for (let c = 0; c < el.nq; c++) if (Math.abs(sp.r[c]) > 1e-12) used[el.dofs[c]] = 1;
  }
  for (const s of nodeSprings) used[s.dof] = 1;
  let unusedDofs = 0;
  for (let i = 0; i < nDof; i++) if (!used[i] && !fixed[i]) { fixed[i] = 1; unusedDofs++; }

  // free dof numbering + RCM
  const freeIdx = new Int32Array(nDof).fill(-1);
  let nFree = 0;
  for (let i = 0; i < nDof; i++) if (!fixed[i]) freeIdx[i] = nFree++;
  const adj: Set<number>[] = Array.from({ length: nFree }, () => new Set<number>());
  for (const el of elements) {
    const f: number[] = [];
    for (let c = 0; c < el.nq; c++) { const k = freeIdx[el.dofs[c]]; if (k >= 0) f.push(k); }
    for (const a of f) for (const b of f) if (a !== b) adj[a].add(b);
  }
  const perm = rcm(adj.map((s) => [...s])); // perm[new] = old free index
  const newPos = new Int32Array(nFree);
  for (let p = 0; p < nFree; p++) newPos[perm[p]] = p;
  const pos = new Int32Array(nDof).fill(-1);
  const freeDof = new Int32Array(nFree);
  for (let i = 0; i < nDof; i++) if (freeIdx[i] >= 0) { pos[i] = newPos[freeIdx[i]]; freeDof[pos[i]] = i; }
  const skyFirst = new Int32Array(nFree);
  for (let j = 0; j < nFree; j++) skyFirst[j] = j;
  for (const el of elements) {
    let lo = Infinity;
    const ps: number[] = [];
    for (let c = 0; c < el.nq; c++) { const p = pos[el.dofs[c]]; if (p >= 0) { ps.push(p); if (p < lo) lo = p; } }
    for (const p of ps) if (lo < skyFirst[p]) skyFirst[p] = lo;
  }
  for (const s of nodeSprings) void s;
  return {
    model, nodeId, nodeIndex, coords: Float64Array.from(xs), nNodes, elements, memberElements, nDof, dofKind, fixed, nodeSprings, pos, nFree, freeDof, skyFirst, unusedDofs, messages,
  };
}

export interface LoadTerm { lc: LoadCase; factor: number }

/** Load vector of a combination (global DOF vector) and the equivalent LOCAL element loads (for section-force recovery). */
export function buildLoads(ps: Prepared, combo: LoadTerm[]): { P: Float64Array; feq: Float64Array[]; qLocal: [number, number, number][] } {
  const memberById = new Map(ps.model.members.map((m) => [m.id, m] as const));
  const P = new Float64Array(ps.nDof);
  const feq = ps.elements.map((e) => new Float64Array(e.nLocal));
  const qLocal: [number, number, number][] = ps.elements.map(() => [0, 0, 0]);
  const addLocalToP = (e: PElem, f: Float64Array) => {
    // P_q = Mᵀ f
    for (let c = 0; c < e.nq; c++) {
      let s = 0;
      for (let r = 0; r < e.nLocal; r++) s += e.M[r * e.nq + c] * f[r];
      P[e.dofs[c]] += s;
    }
  };
  const eqLoad = (e: PElem, q: [number, number, number]): Float64Array => {
    const L = e.L, f = new Float64Array(e.nLocal);
    if (e.kind === 'truss') { for (let k = 0; k < 3; k++) { f[k] = (q[k] * L) / 2; f[3 + k] = (q[k] * L) / 2; } return f; }
    f[0] = f[6] = (q[0] * L) / 2;
    f[1] = f[7] = (q[1] * L) / 2; f[5] = (q[1] * L * L) / 12; f[11] = -(q[1] * L * L) / 12;
    f[2] = f[8] = (q[2] * L) / 2; f[4] = -(q[2] * L * L) / 12; f[10] = (q[2] * L * L) / 12;
    return f;
  };
  for (const { lc, factor } of combo) {
    for (const n of lc.nodal ?? []) {
      const i = ps.nodeIndex.get(n.node);
      if (i === undefined) continue;
      for (let k = 0; k < 6; k++) P[i * 6 + k] += factor * n.f[k];
    }
    // member loads (and self-weight) per element
    const perMember = new Map<number, { q: [number, number, number]; system: 'local' | 'global' }[]>();
    for (const ml of lc.member ?? []) { const a = perMember.get(ml.member) ?? []; a.push({ q: ml.q, system: ml.system }); perMember.set(ml.member, a); }
    for (const [mid, list] of ps.memberElements) {
      const m = memberById.get(mid)!;
      let extra: [number, number, number] | null = null;
      if (lc.selfWeight) {
        const mat = ps.model.materials[m.material], sec = ps.model.sections[m.section];
        const wA = (mat.w ?? 0) * sec.A;
        extra = [lc.selfWeight[0] * wA, lc.selfWeight[1] * wA, lc.selfWeight[2] * wA];
      }
      const loads = perMember.get(mid) ?? [];
      if (!loads.length && !extra) continue;
      for (const ei of list) {
        const e = ps.elements[ei];
        const ql: [number, number, number] = [0, 0, 0];
        const add = (q: [number, number, number], system: 'local' | 'global') => {
          if (system === 'local') for (let k = 0; k < 3; k++) ql[k] += q[k];
          else for (let r = 0; r < 3; r++) ql[r] += e.R[r][0] * q[0] + e.R[r][1] * q[1] + e.R[r][2] * q[2];
        };
        for (const l of loads) add(l.q, l.system);
        if (extra) add(extra, 'global');
        for (let k = 0; k < 3; k++) { ql[k] *= factor; qLocal[ei][k] += ql[k]; }
        const f = eqLoad(e, ql);
        for (let r = 0; r < f.length; r++) feq[ei][r] += f[r];
        addLocalToP(e, f);
      }
    }
  }
  return { P, feq, qLocal };
}

export const zero6 = (): Vec6 => [0, 0, 0, 0, 0, 0];
export type { SolveOptions };
