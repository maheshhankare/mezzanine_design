// Verification of the second-order frame solver against closed-form solutions.   npm run test:frame
import { FrameModel, LoadCase, FMember } from '../src/server/frame/types';
import { prepare } from '../src/server/frame/model';
import { solveFrame, criticalLoadFactor } from '../src/server/frame/solve';
import { Skyline } from '../src/server/frame/skyline';
import { swayGeometry, bowGeometry, swayLoads, resolveImperfectionSource } from '../src/server/frame/imperfection';

let failed = 0;
const rows: string[] = [];
const check = (name: string, got: number, ref: number, tol: number, unit = '') => {
  const rel = ref === 0 ? Math.abs(got) : Math.abs(got - ref) / Math.abs(ref);
  const ok = rel <= tol;
  if (!ok) failed++;
  rows.push(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(62)} got ${got.toPrecision(7).padStart(14)}  ref ${ref.toPrecision(7).padStart(14)}  err ${(rel * 100).toExponential(2)} %  (tol ${(tol * 100).toExponential(0)} %) ${unit}`);
};
const assert = (name: string, cond: boolean, extra = '') => { if (!cond) failed++; rows.push(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); };

const E = 210000, G = 81000, A = 1e4, Iz = 1e7, Iy = 2e7, J = 1e6;
const mat = { S: { E, G, w: 7.85e-5 } };
const sec = { S: { A, Iy, Iz, J } };
const F6 = [true, true, true, true, true, true] as [boolean, boolean, boolean, boolean, boolean, boolean];

/** straight member along X from (0,0,0) to (L,0,0) with `div` elements */
function bar(L: number, div: number, supports: FrameModel['supports'], extra: Partial<FMember> = {}): FrameModel {
  return {
    nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
    materials: mat, sections: sec,
    members: [{ id: 1, type: 'beam', n1: 1, n2: 2, section: 'S', material: 'S', divisions: div, ...extra }],
    supports,
  };
}
const lc = (o: Partial<LoadCase>): LoadCase => ({ id: 'LC', ...o });
const midStation = (res: ReturnType<typeof solveFrame>, member = 1) => {
  const st = res.elements.filter((e) => e.member === member).flatMap((e) => e.stations);
  return st;
};

// ---------------- 1 skyline LDLt against a dense reference ----------------
{
  const n = 40;
  const first = new Int32Array(n);
  for (let j = 0; j < n; j++) first[j] = Math.max(0, j - 5);
  const sk = new Skyline(first);
  const dense: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let j = 0; j < n; j++) for (let i = first[j]; i <= j; i++) { const v = i === j ? 10 + rnd() : rnd() - 0.5; sk.add(i, j, v); dense[i][j] = v; dense[j][i] = v; }
  const x = Float64Array.from({ length: n }, () => rnd());
  const b = new Float64Array(n);
  sk.multiply(x, b);
  const bref = Float64Array.from(b);
  sk.factor();
  const xs = sk.solve(Float64Array.from(bref));
  let err = 0;
  for (let i = 0; i < n; i++) err = Math.max(err, Math.abs(xs[i] - x[i]));
  assert('skyline LDLt solves A x = b (max error < 1e-12)', err < 1e-12, `max error ${err.toExponential(2)}`);
  assert('skyline: no negative pivots for an SPD matrix', sk.negativePivots === 0);
  const sk2 = new Skyline(new Int32Array([0, 0]));
  sk2.add(0, 0, 1); sk2.add(1, 1, -1); sk2.factor();
  assert('skyline counts a negative pivot (indefinite matrix)', sk2.negativePivots === 1);
}

// ---------------- 2 linear cantilever ----------------
{
  const L = 3000, P = 1000;
  const m = bar(L, 4, [{ node: 1, fixed: F6 }]);
  const ps = prepare(m);
  const r = solveFrame({ prepared: ps, combo: [{ lc: lc({ nodal: [{ node: 2, f: [0, P, 0, 0, 0, 0] }] }), factor: 1 }], options: { secondOrder: false } });
  check('cantilever tip deflection  P L^3 / 3EI (first order)', r.displacement.get(2)![1], (P * L ** 3) / (3 * E * Iz), 1e-9, 'mm');
  check('cantilever tip rotation  P L^2 / 2EI', r.displacement.get(2)![5], (P * L * L) / (2 * E * Iz), 1e-9, 'rad');
  check('cantilever reaction force  = P', r.reactions.get(1)![1], -P, 1e-9, 'N');
  check('cantilever fixed-end moment = P L', Math.abs(r.reactions.get(1)![5]), P * L, 1e-9, 'Nmm');
  assert('first-order solve converged', r.converged, r.message);
}

// ---------------- 3 simply supported beam, UDL ----------------
{
  const L = 4000, w = 5;
  const pin = [{ node: 1, fixed: [true, true, true, true, false, false] as any }, { node: 2, fixed: [false, true, true, true, false, false] as any }];
  const m = bar(L, 8, pin);
  const ps = prepare(m);
  const r = solveFrame({ prepared: ps, combo: [{ lc: lc({ member: [{ member: 1, q: [0, w, 0], system: 'local' }] }), factor: 1 }], options: { secondOrder: false } });
  const mid = ps.nodeIndex.size; void mid;
  // mid node is the 5th node of the member: id internal -> read from stations
  const st = midStation(r).find((s) => Math.abs(s[0] - L / 2) < 1e-6)!;
  check('beam UDL: mid-span moment  w L^2 / 8', Math.abs(st[6]), (w * L * L) / 8, 1e-9, 'Nmm');
  check('beam UDL: support reaction  w L / 2', r.reactions.get(1)![1], -(w * L) / 2, 1e-9, 'N');
  assert('first-order UDL converged', r.converged);
}

// ---------------- 4 Euler buckling load by the Sturm count ----------------
{
  const L = 3000;
  const pin = [{ node: 1, fixed: [true, true, true, true, false, false] as any }, { node: 2, fixed: [false, true, true, true, false, false] as any }];
  const Pcr = (Math.PI ** 2 * E * Iz) / (L * L);
  for (const div of [2, 4, 8, 16]) {
    const ps = prepare(bar(L, div, pin));
    const { lambda } = criticalLoadFactor(ps, [{ lc: lc({ nodal: [{ node: 2, f: [-1, 0, 0, 0, 0, 0] }] }), factor: 1 }]);
    check(`Euler column, ${String(div).padStart(2)} elements: critical load  pi^2 EI / L^2`, lambda, Pcr, div === 2 ? 2e-2 : div === 4 ? 2e-3 : 1e-4, 'N');
  }
  const ps = prepare(bar(L, 8, [{ node: 1, fixed: F6 }]));
  const { lambda } = criticalLoadFactor(ps, [{ lc: lc({ nodal: [{ node: 2, f: [-1, 0, 0, 0, 0, 0] }] }), factor: 1 }]);
  check('cantilever column: critical load  pi^2 EI / (4 L^2)', lambda, (Math.PI ** 2 * E * Iz) / (4 * L * L), 1e-4, 'N');
}

// ---------------- 5 P-delta (member) with a half-sine bow imperfection ----------------
{
  const L = 3000, div = 8;
  const pin = [{ node: 1, fixed: [true, true, true, true, false, false] as any }, { node: 2, fixed: [false, true, true, true, false, false] as any }];
  const Pcr = (Math.PI ** 2 * E * Iz) / (L * L);
  const e0 = L / 500;
  const ps = prepare(bar(L, div, pin));
  const u0 = new Float64Array(ps.nDof);
  for (let i = 0; i < ps.nNodes; i++) {
    const x = (i === 0 ? 0 : i === 1 ? L : (i - 1) * (L / div));
    u0[i * 6 + 1] = e0 * Math.sin((Math.PI * x) / L);
    u0[i * 6 + 5] = ((e0 * Math.PI) / L) * Math.cos((Math.PI * x) / L);
  }
  for (const ratio of [0.2, 0.5, 0.8]) {
    const P = ratio * Pcr;
    const r = solveFrame({ prepared: ps, combo: [{ lc: lc({ nodal: [{ node: 2, f: [-P, 0, 0, 0, 0, 0] }] }), factor: 1 }], imperfection: u0, options: { steps: 4 } });
    assert(`P-delta bow, P = ${ratio} Pcr: converged`, r.converged, r.message + ` (${r.totalIterations} it)`);
    const mid = ps.nodeId.findIndex((id, i) => id === -1 && Math.abs(ps.coords[3 * i] - L / 2) < 1e-6);
    // total deflection at mid = e0/(1-P/Pcr)  ->  added displacement = e0 * ratio/(1-ratio)
    const uMid = r.converged ? (() => { const st = r.elements.filter((e) => e.member === 1); void st; return null; })() : null; void uMid;
    const dMid = (() => { // displacement of the internal mid node: not in the id map, take from the section moment instead
      const stn = midStation(r).find((s) => Math.abs(s[0] - L / 2) < 1e-6)!;
      return Math.abs(stn[6]);
    })();
    // bending moment at mid = P * (total deflection)  = P e0 / (1 - P/Pcr)
    check(`P-delta bow, P = ${ratio} Pcr: mid moment  P e0/(1-P/Pcr)`, dMid, (P * e0) / (1 - ratio), 3e-3, 'Nmm');
    void mid;
  }
}

// ---------------- 6 cantilever column, P-Delta ----------------
{
  const L = 3000;
  const Pe = (Math.PI ** 2 * E * Iz) / (4 * L * L);
  const ps = prepare(bar(L, 8, [{ node: 1, fixed: F6 }]));
  for (const ratio of [0.2, 0.5, 0.8]) {
    const P = ratio * Pe, H = 500;
    const r = solveFrame({ prepared: ps, combo: [{ lc: lc({ nodal: [{ node: 2, f: [-P, H, 0, 0, 0, 0] }] }), factor: 1 }], options: { steps: 4 } });
    const k = Math.sqrt(P / (E * Iz));
    const ref = (H / (P * k)) * (Math.tan(k * L) - k * L);
    check(`cantilever P-Delta, P = ${ratio} Pe: tip deflection (tan kL - kL) H/(P k)`, r.displacement.get(2)![1], ref, 1e-3, 'mm');
    const lin = (H * L ** 3) / (3 * E * Iz);
    assert(`  second-order tip deflection exceeds first order (${(r.displacement.get(2)![1] / lin).toFixed(3)}x)`, r.displacement.get(2)![1] > lin);
  }
}

// ---------------- 7 beam-column with UDL: maximum moment ----------------
{
  const L = 4000, w = 2;
  const pin = [{ node: 1, fixed: [true, true, true, true, false, false] as any }, { node: 2, fixed: [false, true, true, true, false, false] as any }];
  const Pcr = (Math.PI ** 2 * E * Iz) / (L * L);
  const ps = prepare(bar(L, 8, pin));
  for (const ratio of [0.3, 0.6]) {
    const P = ratio * Pcr;
    const r = solveFrame({ prepared: ps, combo: [{ lc: lc({ nodal: [{ node: 2, f: [-P, 0, 0, 0, 0, 0] }], member: [{ member: 1, q: [0, w, 0], system: 'local' }] }), factor: 1 }], options: { steps: 3 } });
    const k = Math.sqrt(P / (E * Iz));
    const ref = (w / (k * k)) * (1 / Math.cos((k * L) / 2) - 1);
    const stn = midStation(r).find((s) => Math.abs(s[0] - L / 2) < 1e-6)!;
    check(`beam-column UDL, P = ${ratio} Pcr: max moment (w/k^2)(sec(kL/2)-1)`, Math.abs(stn[6]), ref, 2e-3, 'Nmm');
    assert('  converged', r.converged, r.message);
  }
}

// ---------------- 8 hinge: propped cantilever ----------------
{
  const L = 3000, w = 4;
  const sup = [
    { node: 1, fixed: F6 },
    { node: 2, fixed: [false, true, true, true, false, false] as any },
  ];
  const m = bar(L, 6, sup, { rel2: { rz: true, ry: true } });
  const ps = prepare(m);
  const r = solveFrame({ prepared: ps, combo: [{ lc: lc({ member: [{ member: 1, q: [0, w, 0], system: 'local' }] }), factor: 1 }], options: { secondOrder: false } });
  check('propped cantilever (hinge at end): pinned reaction  3 w L / 8', Math.abs(r.reactions.get(2)![1]), (3 * w * L) / 8, 1e-9, 'N');
  check('propped cantilever: fixed-end moment  w L^2 / 8', Math.abs(r.reactions.get(1)![5]), (w * L * L) / 8, 1e-9, 'Nmm');
  const last = midStation(r).slice(-1)[0];
  assert('hinge: moment at the released end is zero', Math.abs(last[6]) < 1e-6 * w * L * L, `M = ${last[6].toExponential(2)}`);
}

// ---------------- 9 tension-only bracing ----------------
{
  const Lb = 3000, H = 3000, F = 20000;
  const m: FrameModel = {
    nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: Lb, y: 0, z: 0 }, { id: 3, x: Lb, y: 0, z: H }, { id: 4, x: 0, y: 0, z: H }],
    materials: mat, sections: sec,
    members: [
      { id: 1, type: 'truss', n1: 1, n2: 3, section: 'S', material: 'S', tensionOnly: true },
      { id: 2, type: 'truss', n1: 2, n2: 4, section: 'S', material: 'S', tensionOnly: true },
      { id: 3, type: 'truss', n1: 4, n2: 3, section: 'S', material: 'S' },
      { id: 4, type: 'truss', n1: 1, n2: 4, section: 'S', material: 'S' },
      { id: 5, type: 'truss', n1: 2, n2: 3, section: 'S', material: 'S' },
    ],
    // out-of-plane (y) restrained at the free nodes: a planar truss would otherwise be a mechanism in y
    supports: [{ node: 1, fixed: F6 }, { node: 2, fixed: F6 }, { node: 3, fixed: [false, true, false, false, false, false] }, { node: 4, fixed: [false, true, false, false, false, false] }],
  };
  const ps = prepare(m);
  const r = solveFrame({ prepared: ps, combo: [{ lc: lc({ nodal: [{ node: 4, f: [F, 0, 0, 0, 0, 0] }] }), factor: 1 }], options: { secondOrder: false } });
  const N1 = r.elements.find((e) => e.member === 1)!.stations[0][1];
  const N2 = r.elements.find((e) => e.member === 2)!.stations[0][1];
  const th = Math.atan2(H, Lb);
  // load to the right at the top left node: the diagonal 2-4 (from bottom right to top left) is in tension, 1-3 in compression (drops out)
  check('tension-only: active diagonal force  F / cos(theta)', Math.max(N1, N2), F / Math.cos(th), 1e-6, 'N');
  assert('tension-only: the compressed diagonal carries no force', Math.abs(Math.min(N1, N2)) < 1e-3, `N = ${Math.min(N1, N2).toExponential(2)}`);
  check('horizontal reactions equilibrate F', r.reactions.get(1)![0] + r.reactions.get(2)![0], -F, 1e-6, 'N');
}

// ---------------- 10 convergence behaviour ----------------
{
  const L = 3000;
  const pin = [{ node: 1, fixed: [true, true, true, true, false, false] as any }, { node: 2, fixed: [false, true, true, true, false, false] as any }];
  const Pcr = (Math.PI ** 2 * E * Iz) / (L * L);
  const ps = prepare(bar(L, 8, pin));
  const e0 = L / 500;
  const u0 = new Float64Array(ps.nDof);
  for (let i = 0; i < ps.nNodes; i++) { const x = i === 0 ? 0 : i === 1 ? L : (i - 1) * (L / 8); u0[i * 6 + 1] = e0 * Math.sin((Math.PI * x) / L); u0[i * 6 + 5] = ((e0 * Math.PI) / L) * Math.cos((Math.PI * x) / L); }
  const beyond = solveFrame({ prepared: ps, combo: [{ lc: lc({ nodal: [{ node: 2, f: [-1.3 * Pcr, 0, 0, 0, 0, 0] }] }), factor: 1 }], imperfection: u0, options: { steps: 4 } });
  assert('load beyond the critical load is NOT reported as converged', beyond.status !== 'converged', `status ${beyond.status}: ${beyond.message.slice(0, 90)}`);
  // Above P_cr the equilibrium reached by Newton is on the unstable branch: it is reported as 'unstable' (negative pivot in the tangent), never as 'converged'.
  // (Before the moment normalisation was made scale-free this case ended as 'not-converged' at 0.95 P_cr, because of a moment residual that rounding could not
  // meet, not because of the physics; a failed step still keeps the last converged state apart, see the 2-iteration test below.)
  assert('  the unstable equilibrium above P_cr is reported as unstable (negative pivot), not as a stable result', beyond.status === 'unstable' && /negative pivot/.test(beyond.message), beyond.message.slice(0, 80));
  {
    const near = solveFrame({ prepared: ps, combo: [{ lc: lc({ nodal: [{ node: 2, f: [-0.95 * Pcr, 0, 0, 0, 0, 0] }] }), factor: 1 }], imperfection: u0, options: { steps: 4 } });
    assert('near instability, P = 0.95 Pcr: converged and stable', near.status === 'converged', near.message.slice(0, 80));
    const mm = midStation(near).find((s) => Math.abs(s[0] - L / 2) < 1e-6)![6];
    check('near instability, P = 0.95 Pcr: mid moment P e0/(1 - P/Pcr) (amplification 20)', Math.abs(mm), (0.95 * Pcr * e0) / 0.05, 1e-2, 'Nmm');
  }
  const cap = solveFrame({ prepared: ps, combo: [{ lc: lc({ nodal: [{ node: 2, f: [-0.9 * Pcr, 0, 0, 0, 0, 0] }] }), factor: 1 }], imperfection: u0, options: { maxIterations: 2, steps: 1, maxSubdivisions: 0, lineSearch: false } });
  assert('iteration limit reached -> not converged, with a clear reason', cap.status === 'not-converged' && /iteration limit/.test(cap.message), cap.message.slice(0, 120));
  assert('  the failed step keeps the last converged state apart from the failed trial', cap.lambdaReached < 1 && !!cap.failedTrial);
  const clamp = solveFrame({ prepared: ps, combo: [{ lc: lc({ nodal: [{ node: 2, f: [-0.3 * Pcr, 0, 0, 0, 0, 0] }] }), factor: 1 }], imperfection: u0, options: { maxIterations: 500 } });
  assert('maximum iterations is clamped to 100', clamp.options.maxIterations === 100);
  const a = solveFrame({ prepared: ps, combo: [{ lc: lc({ nodal: [{ node: 2, f: [-0.6 * Pcr, 0, 0, 0, 0, 0] }] }), factor: 1 }], imperfection: u0, options: { steps: 1 } });
  const b = solveFrame({ prepared: ps, combo: [{ lc: lc({ nodal: [{ node: 2, f: [-0.6 * Pcr, 0, 0, 0, 0, 0] }] }), factor: 1 }], imperfection: u0, options: { steps: 6 } });
  const sa = midStation(a).find((s) => Math.abs(s[0] - L / 2) < 1e-6)![6], sb = midStation(b).find((s) => Math.abs(s[0] - L / 2) < 1e-6)![6];
  check('result independent of the number of load steps (1 vs 6)', sa, sb, 1e-6, 'Nmm');
  assert('iteration log recorded', a.iterations.length > 0, `${a.totalIterations} iterations`);
}

// ---------------- 11 3D: biaxial cantilever, equilibrium of reactions ----------------
{
  const L = 2500;
  const m = bar(L, 4, [{ node: 1, fixed: F6 }]);
  const ps = prepare(m);
  const Fy = 700, Fz = -400, T = 5e5;
  const r = solveFrame({ prepared: ps, combo: [{ lc: lc({ nodal: [{ node: 2, f: [0, Fy, Fz, T, 0, 0] }] }), factor: 1 }], options: { secondOrder: false } });
  check('3D cantilever: uy  Fy L^3/3EIz', r.displacement.get(2)![1], (Fy * L ** 3) / (3 * E * Iz), 1e-9, 'mm');
  check('3D cantilever: uz  Fz L^3/3EIy', r.displacement.get(2)![2], (Fz * L ** 3) / (3 * E * Iy), 1e-9, 'mm');
  check('3D cantilever: twist  T L / GJ', r.displacement.get(2)![3], (T * L) / (G * J), 1e-9, 'rad');
  const R1 = r.reactions.get(1)!;
  check('3D equilibrium: sum Fy', R1[1] + Fy, 0, 1e-12 + 1e-9, 'N');
  check('3D equilibrium: sum Fz', R1[2] + Fz, 0, 1e-12 + 1e-9, 'N');
}

// ---------------- 12 rotated member (inclined, beta) gives the same answer ----------------
{
  const L = 3000, P = 800;
  const a = bar(L, 4, [{ node: 1, fixed: F6 }]);
  // same cantilever along a general direction
  const dir = [0.6, 0.48, 0.64];
  const n = Math.hypot(dir[0], dir[1], dir[2]);
  const d = dir.map((v) => (v / n) * L);
  const b: FrameModel = { ...a, nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: d[0], y: d[1], z: d[2] }], members: [{ ...a.members[0], beta: 0 }] };
  const pa = prepare(a), pb = prepare(b);
  const ra = solveFrame({ prepared: pa, combo: [{ lc: lc({ nodal: [{ node: 2, f: [0, P, 0, 0, 0, 0] }] }), factor: 1 }], options: { secondOrder: false } });
  // load perpendicular to the member in the local y direction of b
  const x = d.map((v) => v / L);
  const ref = [0, 0, 1];
  const y = [ref[1] * x[2] - ref[2] * x[1], ref[2] * x[0] - ref[0] * x[2], ref[0] * x[1] - ref[1] * x[0]];
  const ny = Math.hypot(y[0], y[1], y[2]);
  const f = y.map((v) => (v / ny) * P) as number[];
  const rb = solveFrame({ prepared: pb, combo: [{ lc: lc({ nodal: [{ node: 2, f: [f[0], f[1], f[2], 0, 0, 0] }] }), factor: 1 }], options: { secondOrder: false } });
  const tipB = rb.displacement.get(2)!;
  const mag = Math.hypot(tipB[0], tipB[1], tipB[2]);
  check('inclined member: tip deflection magnitude equals the axis-aligned member', mag, ra.displacement.get(2)![1], 1e-9, 'mm');
}

// ---------------- 7 imperfection module: explicit geometry vs equivalent loads, no double counting, code routes refused ----------------
{
  const L = 3000, div = 8;
  const col: FrameModel = { nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 0, y: 0, z: L }], materials: mat, sections: sec, members: [{ id: 1, type: 'beam', n1: 1, n2: 2, section: 'S', material: 'S', divisions: div }], supports: [{ node: 1, fixed: F6 }] };
  const ps = prepare(col);
  const Pe = (Math.PI ** 2 * E * Iy) / (4 * L * L); // lean along global x = local z of a vertical member: bends about local y
  const P = 0.5 * Pe, phi0 = 1 / 200, k = Math.sqrt(P / (E * Iy));
  const axial = lc({ nodal: [{ node: 2, f: [0, 0, -P, 0, 0, 0] }] });
  const geo = swayGeometry(ps, [[1]], phi0, [1, 0, 0], [0, 0, 1]);
  const rg = solveFrame({ prepared: ps, combo: [{ lc: axial, factor: 1 }], imperfection: geo.nodal, elementImperfection: geo.elements });
  assert('sway geometry: converged', rg.converged, rg.message);
  // a rigid tilt carries a horizontal force phi0*P at the tip: tip deflection (relative to the tilted axis) = phi0 (tan kL - kL)/k
  check('sway geometry, P = 0.5 Pe: tip displacement  phi0 (tan kL - kL)/k', rg.displacement.get(2)![0], (phi0 * (Math.tan(k * L) - k * L)) / k, 1e-3, 'mm');
  // equivalent loads: +phi0 N at the top, -phi0 N at the foot (absorbed by the fixed support), N from the first-order analysis
  const g1 = solveFrame({ prepared: ps, combo: [{ lc: axial, factor: 1 }], options: { secondOrder: false } });
  const loads = swayLoads(ps, g1, [1], phi0, [1, 0, 0], [0, 0, 1]);
  assert('equivalent sway loads: one pair of nodal loads at the member ends', loads.length === 2 && Math.abs(loads.find((l) => l.node === 2)!.f[0] - phi0 * P) < 1e-6 * P);
  const rl = solveFrame({ prepared: ps, combo: [{ lc: axial, factor: 1 }, { lc: lc({ nodal: loads }), factor: 1 }] });
  check('geometry vs equivalent loads: tip displacement', rg.displacement.get(2)![0], rl.displacement.get(2)![0], 1e-3, 'mm');
  // double counting: both representations active = twice the effect
  const rb = solveFrame({ prepared: ps, combo: [{ lc: axial, factor: 1 }, { lc: lc({ nodal: loads }), factor: 1 }], imperfection: geo.nodal, elementImperfection: geo.elements });
  check('geometry AND equivalent loads together: twice the single effect (double counting)', rb.displacement.get(2)![0] / rg.displacement.get(2)![0], 2, 2e-2);
  // bow as geometry: the P-delta mid moment of a pinned column
  const Lb = 3000, pin = [{ node: 1, fixed: [true, true, true, true, false, false] as any }, { node: 2, fixed: [false, true, true, true, false, false] as any }];
  const psb = prepare(bar(Lb, 8, pin)); const Pcr = (Math.PI ** 2 * E * Iz) / (Lb * Lb), e0 = Lb / 500, Pb = 0.5 * Pcr;
  const rbow = solveFrame({ prepared: psb, combo: [{ lc: lc({ nodal: [{ node: 2, f: [-Pb, 0, 0, 0, 0, 0] }] }), factor: 1 }], elementImperfection: bowGeometry(psb, [1], e0 / Lb, [0, 1, 0]).elements });
  const mid = midStation(rbow).find((s) => Math.abs(s[0] - Lb / 2) < 1e-6)!;
  check('bowGeometry: mid moment  P e0/(1-P/Pcr)  (P = 0.5 Pcr)', Math.abs(mid[6]), (Pb * e0) / 0.5, 3e-3, 'Nmm');
  // IS 800: the imperfection source (details in scripts/test-codes.ts)
  assert('user-defined sway is allowed and labelled user-defined', (() => { const r = resolveImperfectionSource({ sway: { mode: 'geometry', source: 'user' } }); return r.allowed && r.label === 'user-defined'; })());
  assert('IS 800: explicit geometric sway as a CODE value is refused (the code has none)', !resolveImperfectionSource({ sway: { mode: 'geometry', source: 'code' } }).allowed);
  assert('IS 800: notional loads as a code value are allowed, provisional (distribution assumption)', (() => { const r = resolveImperfectionSource({ sway: { mode: 'notional', source: 'code' } }); return r.allowed && r.label === 'provisional'; })());
  assert('double-counting warning: geometric sway + notional loads', resolveImperfectionSource({ sway: { mode: 'geometry', source: 'user' }, notionalLoadsInLoadCases: true }).warnings.length > 0);
}

// ---------------- 8 von Karman vs Theory II: axial shortening of a bent member (the benchmark's 12 mm edge drift) ----------------
{
  const L = 5000, q = 5; // N/mm: the sag is deliberately large (about L/50), as in the benchmark secondary beams under factored load
  const roller = [{ node: 1, fixed: [true, true, true, true, false, false] as any }, { node: 2, fixed: [false, true, true, true, false, false] as any }];
  const ps = prepare(bar(L, 8, roller));
  const load = lc({ member: [{ member: 1, q: [0, 0, -q], system: 'global' }] });
  // closed form: w(x) = q/(24 E I)(x^4 - 2 L x^3 + L^3 x);  integral of w'^2 = (q/24EI)^2 L^7 * 17/35;  shortening of the chord = 1/2 integral of w'^2
  const k = q / (24 * E * Iy);
  const shorten = 0.5 * k * k * L ** 7 * (17 / 35);
  const w0 = (5 * q * L ** 4) / (384 * E * Iy);
  const vk = solveFrame({ prepared: ps, combo: [{ lc: load, factor: 1 }], options: { theory: 'vonKarman', steps: 4 } });
  const t2 = solveFrame({ prepared: ps, combo: [{ lc: load, factor: 1 }], options: { theory: 'II', steps: 4 } });
  assert('von Karman roller beam: converged', vk.converged, vk.message);
  check(`von Karman: the free end moves in by (1/2) integral w'^2 dx = 17/70 (q/24EI)^2 L^7 (sag ${w0.toFixed(0)} mm = L/${(L / w0).toFixed(0)})`, -vk.displacement.get(2)![0], shorten, 2e-2, 'mm');
  assert('Theory II: no axial shortening of the bent member (linear strains): the free end stays put', Math.abs(t2.displacement.get(2)![0]) < 1e-6 * shorten, `|u| = ${Math.abs(t2.displacement.get(2)![0]).toExponential(1)} mm`);
  check('the shortening grows with the SQUARE of the sag: doubling q quadruples it (von Karman)', -solveFrame({ prepared: ps, combo: [{ lc: load, factor: 2 }], options: { theory: 'vonKarman', steps: 4 } }).displacement.get(2)![0] / -vk.displacement.get(2)![0], 4, 3e-2);
  // restrained ends: von Karman builds a membrane tension, Theory II does not
  const pinned = [{ node: 1, fixed: [true, true, true, true, false, false] as any }, { node: 2, fixed: [true, true, true, true, false, false] as any }];
  const psr = prepare(bar(L, 8, pinned));
  const vkr = solveFrame({ prepared: psr, combo: [{ lc: load, factor: 1 }], options: { theory: 'vonKarman', steps: 4 } });
  const t2r = solveFrame({ prepared: psr, combo: [{ lc: load, factor: 1 }], options: { theory: 'II', steps: 4 } });
  const Nvk = vkr.elements.filter((e) => e.member === 1).flatMap((e) => e.stations)[0][1], Nt2 = t2r.elements.filter((e) => e.member === 1).flatMap((e) => e.stations)[0][1];
  assert('axially restrained beam: von Karman develops a membrane tension, Theory II none', Nvk > 1e3 && Math.abs(Nt2) < 1, `N = ${Nvk.toFixed(0)} N (von Karman), ${Nt2.toFixed(3)} N (Theory II)`);
}

console.log(rows.join('\n'));
console.log(failed ? `\n${failed} check(s) FAILED` : `\nall ${rows.length} checks passed`);
process.exit(failed ? 1 : 0);
