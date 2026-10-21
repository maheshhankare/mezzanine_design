import { DEFAULT_OPTIONS, ElementResult, IterationRecord, SolveOptions, SolveResult, StepRecord, Vec6 } from './types';
import { PElem, Prepared, LoadTerm, buildLoads } from './model';
import { beamEval, beamG, trussEval } from './element';
import { Skyline } from './skyline';

/**
 * Newton–Raphson solution of the (geometrically nonlinear) equilibrium  R(u) = λ P − f_int(u) = 0.
 *
 * SOLUTION PROCEDURE (per load step, at most `maxIterations` = 100 iterations)
 *   1  assemble f_int(u) and the consistent tangent K_T(u) (K_E + geometric terms, see element.ts)
 *   2  residual R = λP − f_int on the free DOF; convergence test (all must hold, normalised, with absolute floors):
 *        ‖R_force‖/‖λP_force‖ ≤ tolForce,  ‖R_moment‖/‖λP_moment‖ ≤ tolMoment,
 *        ‖Δu‖/‖u‖ ≤ tolDisplacement,       |ΔuᵀR|/|uᵀλP| ≤ tolEnergy,   and no tension-only element changed state
 *   3  factorise K_T (LDLᵀ), count negative pivots, solve K_T Δu = R
 *   4  optional backtracking line search on the residual norm, update u, repeat
 *   Reaching the iteration limit is NEVER treated as convergence. A failed step is retried with the load increment halved
 *   (up to maxSubdivisions times); if it still fails the last CONVERGED state is returned together with the failed trial,
 *   and the status is "not-converged". A converged state whose tangent has a negative pivot is reported as "unstable".
 */

export interface SolveInput {
  prepared: Prepared;
  combo: LoadTerm[];
  options?: Partial<SolveOptions>;
  /** stress-free initial geometry error: global nodal field, 6 values per node index (prepared.nNodes*6) */
  imperfection?: Float64Array | null;
  /**
   * Additional stress-free imperfection per ELEMENT in element-local components (12 for a beam: u1, θ1, u2, θ2; 6 for a truss), added to the
   * local imperfection derived from the nodal field. Needed where an element is tilted or kinked independently of its neighbours at a node
   * (a leaning column framing into horizontal beams): the nodal field alone cannot represent that.
   */
  elementImperfection?: Map<number, Float64Array> | null;
}

interface ElemEval { f: Float64Array; N: number; eps: number; active: boolean; ul: Float64Array }

export function solveFrame(input: SolveInput): SolveResult {
  const ps = input.prepared;
  const opt: SolveOptions = { ...DEFAULT_OPTIONS, ...(input.options || {}) };
  opt.maxIterations = Math.min(Math.max(1, Math.floor(opt.maxIterations)), 100);
  const iterations: IterationRecord[] = [];
  const stepsLog: StepRecord[] = [];
  const empty = (status: SolveResult['status'], msg: string): SolveResult => ({
    status, converged: false, message: msg, lambdaReached: 0, displacement: new Map(), reactions: new Map(), elements: [], iterations, steps: stepsLog, totalIterations: 0, options: opt,
  });
  if (ps.messages.length) return empty('invalid-model', ps.messages.join('; '));
  if (ps.nFree === 0) return empty('invalid-model', 'no free degrees of freedom');

  const { P, feq, qLocal } = buildLoads(ps, input.combo);
  const nDof = ps.nDof, nFree = ps.nFree;
  const so = opt.secondOrder;

  // element geometric matrices
  for (const e of ps.elements) if (e.kind === 'beam' && e.G.length === 0) e.G = beamG(e.L, (e.props as any).ipA, opt.torsionGeometric);
  // local imperfection of each element
  const u0l: (Float64Array | null)[] = ps.elements.map((e) => {
    const extra = input.elementImperfection?.get(e.index);
    if (!input.imperfection) return extra ? Float64Array.from(extra) : null;
    const q = new Float64Array(e.nq);
    for (let c = 0; c < e.nq; c++) { const d = e.dofs[c]; q[c] = d < input.imperfection.length ? input.imperfection[d] : 0; }
    const out = new Float64Array(e.nLocal);
    for (let r = 0; r < e.nLocal; r++) { let s = 0; for (let c = 0; c < e.nq; c++) s += e.M[r * e.nq + c] * q[c]; out[r] = s + (extra ? extra[r] : 0); }
    return out;
  });

  const sky = new Skyline(ps.skyFirst);
  const prevActive = new Uint8Array(ps.elements.length).fill(1);
  let activeChanges = 0;
  const trussEps = 1e-9;

  function evaluate(u: Float64Array, wantK: boolean, trackActive: boolean): { fint: Float64Array; evals: ElemEval[] } {
    const fint = new Float64Array(nDof);
    if (wantK) sky.zero();
    const evals: ElemEval[] = new Array(ps.elements.length);
    if (trackActive) activeChanges = 0;
    for (const e of ps.elements) {
      const q = new Float64Array(e.nq);
      for (let c = 0; c < e.nq; c++) q[c] = u[e.dofs[c]];
      const ul = new Float64Array(e.nLocal);
      for (let r = 0; r < e.nLocal; r++) { let s = 0; for (let c = 0; c < e.nq; c++) s += e.M[r * e.nq + c] * q[c]; ul[r] = s; }
      let fl: Float64Array, Kl: Float64Array, N: number, eps: number, active = true;
      if (e.kind === 'beam') {
        const o = beamEval(e.props as any, e.Kb!, e.G, ul, u0l[e.index], so, opt.theory === 'vonKarman');
        fl = o.f; Kl = o.K; N = o.N; eps = o.eps;
      } else {
        const o = trussEval(e.props as any, e.G, ul, u0l[e.index], so, opt.tensionOnly && e.tensionOnly, opt.theory === 'vonKarman');
        fl = o.f; Kl = o.K; N = o.N; eps = o.eps; active = o.active;
        if (!active) {
          // tiny residual stiffness keeps the matrix regular
          const k = (trussEps * (e.props as any).EA) / e.L;
          fl = new Float64Array(6); Kl = new Float64Array(36);
          const d = ul[3] - ul[0];
          fl[0] = -k * d; fl[3] = k * d; Kl[0] = k; Kl[3] = -k; Kl[18] = -k; Kl[21] = k;
        }
        if (trackActive) { if ((prevActive[e.index] === 1) !== active) activeChanges++; prevActive[e.index] = active ? 1 : 0; }
      }
      // q-space: f_q = Mᵀ f_l ; K_q = Mᵀ K_l M
      const fq = new Float64Array(e.nq);
      const nl = e.nLocal, nq = e.nq;
      for (let c = 0; c < nq; c++) { let s = 0; for (let r = 0; r < nl; r++) s += e.M[r * nq + c] * fl[r]; fq[c] = s; }
      let Kq: Float64Array | null = null;
      if (wantK) {
        const T = new Float64Array(nl * nq);
        for (let r = 0; r < nl; r++) for (let c = 0; c < nq; c++) { let s = 0; for (let k = 0; k < nl; k++) s += Kl[r * nl + k] * e.M[k * nq + c]; T[r * nq + c] = s; }
        Kq = new Float64Array(nq * nq);
        for (let a = 0; a < nq; a++) for (let b = 0; b < nq; b++) { let s = 0; for (let r = 0; r < nl; r++) s += e.M[r * nq + a] * T[r * nq + b]; Kq[a * nq + b] = s; }
      }
      for (const sp of e.springs) {
        let s = 0;
        for (let c = 0; c < nq; c++) s += sp.r[c] * q[c];
        for (let c = 0; c < nq; c++) fq[c] += sp.k * s * sp.r[c];
        if (wantK) for (let a = 0; a < nq; a++) for (let b = 0; b < nq; b++) Kq![a * nq + b] += sp.k * sp.r[a] * sp.r[b];
      }
      for (let c = 0; c < nq; c++) fint[e.dofs[c]] += fq[c];
      if (wantK) {
        for (let a = 0; a < nq; a++) {
          const pa = ps.pos[e.dofs[a]];
          if (pa < 0) continue;
          for (let b = a; b < nq; b++) {
            const pb = ps.pos[e.dofs[b]];
            if (pb < 0) continue;
            sky.add(pa, pb, Kq![a * nq + b]);
          }
        }
      }
      evals[e.index] = { f: fl, N, eps, active, ul };
    }
    for (const s of ps.nodeSprings) {
      fint[s.dof] += s.k * u[s.dof];
      if (wantK && ps.pos[s.dof] >= 0) sky.add(ps.pos[s.dof], ps.pos[s.dof], s.k);
    }
    return { fint, evals };
  }

  const nrm = (v: Float64Array, kind: number, mask?: Uint8Array) => {
    let s = 0;
    for (let p = 0; p < nFree; p++) { const d = ps.freeDof[p]; if (ps.dofKind[d] === kind) s += v[p] * v[p]; }
    void mask;
    return Math.sqrt(s);
  };
  const residual = (fint: Float64Array, lam: number): Float64Array => {
    const R = new Float64Array(nFree);
    for (let p = 0; p < nFree; p++) { const d = ps.freeDof[p]; R[p] = lam * P[d] - fint[d]; }
    return R;
  };
  const extNorm = (lam: number, kind: number) => {
    let s = 0;
    for (let p = 0; p < nFree; p++) { const d = ps.freeDof[p]; if (ps.dofKind[d] === kind) s += (lam * P[d]) ** 2; }
    return Math.sqrt(s);
  };
  /**
   * Normalisation of the moment residual. With no applied moments the old normalisation was the absolute floor of 1 N·mm, a number that depends on the
   * unit system and that rounding error exceeds in a stiff model (a beam 1e4 times stiffer than the columns left 2e-5 N·mm and never converged). The moment
   * residual is now measured like the force residual: against ‖applied forces‖ × mean element length, i.e. the moment of the force-residual tolerance
   * acting at one element length. Moments and forces are thereby judged by the same relative criterion; the criteria (1e-6 ...) are unchanged.
   */
  const meanLength = ps.elements.reduce((s, e) => s + e.L, 0) / Math.max(1, ps.elements.length);
  const dot = (a: Float64Array, b: Float64Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

  let totalIters = 0;
  let stepNo = 0;
  let lastNeg = 0;
  const failed: { lam: number; u: Float64Array | null } = { lam: 0, u: null };

  /** Newton iteration from state u (modified in a copy) to load level lam. */
  function newton(uStart: Float64Array, lam: number, stepIndex: number): { ok: boolean; u: Float64Array; iters: number; reason?: string; neg: number } {
    const u = Float64Array.from(uStart);
    let { fint } = evaluate(u, true, false);
    let R = residual(fint, lam);
    let r0 = Math.hypot(nrm(R, 0), nrm(R, 1));
    let neg = 0;
    let lastRes = r0;
    for (let it = 0; it <= opt.maxIterations; it++) {
      totalIters++;
      const resF = nrm(R, 0) / Math.max(extNorm(lam, 0), opt.forceFloor);
      const resM = nrm(R, 1) / Math.max(extNorm(lam, 1), opt.momentFloor, meanLength * extNorm(lam, 0));
      const rec: IterationRecord = { step: stepIndex, lambda: lam, iter: it, resForce: resF, resMoment: resM, maxDu: 0, energy: 0, converged: false };
      if (!Number.isFinite(resF) || !Number.isFinite(resM)) { iterations.push({ ...rec, note: 'non-finite residual' }); return { ok: false, u, iters: it, reason: 'non-finite residual (diverged)', neg }; }
      const resOK = resF <= opt.tolForce && resM <= opt.tolMoment;
      if (it === 0 && resOK && (lam === 0 || !so) && !activeChanges) { rec.converged = true; iterations.push(rec); return { ok: true, u, iters: it, neg }; }
      if (it > 0 && resOK && lastDu !== null) {
        let maxDu = 0, nu = 0;
        for (let p = 0; p < nFree; p++) { const d = ps.freeDof[p]; nu += u[d] * u[d]; }
        void maxDu;
        const dispRatio = Math.sqrt(dot(lastDu, lastDu)) / Math.max(Math.sqrt(nu), opt.lengthFloor);
        const ext = Math.abs(lastUP);
        const energy = Math.abs(lastDuR) / Math.max(ext, opt.forceFloor * opt.lengthFloor);
        rec.maxDu = lastMaxDu; rec.energy = energy;
        if (dispRatio <= opt.tolDisplacement && energy <= opt.tolEnergy && activeChanges === 0) { rec.converged = true; iterations.push(rec); return { ok: true, u, iters: it, neg }; }
      }
      rec.maxDu = lastMaxDu;
      iterations.push(rec);
      if (it === opt.maxIterations) return { ok: false, u, iters: it, reason: `iteration limit of ${opt.maxIterations} reached without convergence`, neg };
      // tangent
      if (so || !sky.factored) {
        if (!sky.factor()) { return { ok: false, u, iters: it, reason: 'singular tangent stiffness (mechanism or loss of stability)', neg: sky.negativePivots }; }
      }
      neg = sky.negativePivots;
      const du = sky.solve(Float64Array.from(R));
      let alpha = 1;
      let trial = u;
      let evalT = { fint, evals: null as any };
      if (opt.lineSearch && so && it > 0) {
        for (let k = 0; k < 6; k++) {
          const ut = Float64Array.from(u);
          for (let p = 0; p < nFree; p++) ut[ps.freeDof[p]] += alpha * du[p];
          const ev = evaluate(ut, false, false);
          const Rt = residual(ev.fint, lam);
          const rt = Math.hypot(nrm(Rt, 0), nrm(Rt, 1));
          if (rt <= lastRes * (1 + 1e-12) || k === 5) break;
          alpha *= 0.5;
        }
      }
      void trial; void evalT;
      lastDuR = 0; lastUP = 0; lastMaxDu = 0;
      for (let p = 0; p < nFree; p++) {
        const d = ps.freeDof[p];
        const dd = alpha * du[p];
        lastDuR += dd * R[p];
        u[d] += dd;
        lastUP += u[d] * lam * P[d];
        if (Math.abs(dd) > lastMaxDu) lastMaxDu = Math.abs(dd);
      }
      lastDu = new Float64Array(nFree);
      for (let p = 0; p < nFree; p++) lastDu[p] = alpha * du[p];
      ({ fint } = evaluate(u, so, true)); // first order: the stiffness is constant and stays factorised
      R = residual(fint, lam);
      lastRes = Math.hypot(nrm(R, 0), nrm(R, 1));
      if (lastRes > 1e8 * Math.max(r0, 1) && it > 3) return { ok: false, u, iters: it, reason: 'residual is growing without bound (diverging)', neg };
    }
    return { ok: false, u, iters: opt.maxIterations, reason: 'iteration limit reached', neg };
  }
  let lastDu: Float64Array | null = null;
  let lastDuR = 0, lastUP = 0, lastMaxDu = 0;

  let uc: Float64Array = new Float64Array(nDof);
  let lamC = 0;
  let status: SolveResult['status'] = 'converged';
  let message = '';
  const nSteps = so ? Math.max(1, Math.floor(opt.steps)) : 1;

  const attempt = (lamFrom: number, lamTo: number, level: number): boolean => {
    stepNo++;
    const my = stepNo;
    lastDu = null;
    const r = newton(uc, lamTo, my);
    stepsLog.push({ step: my, lambdaFrom: lamFrom, lambdaTo: lamTo, subdivisionLevel: level, iterations: r.iters, converged: r.ok, reason: r.reason });
    if (r.ok) { uc = r.u; lamC = lamTo; lastNeg = r.neg; return true; }
    failed.lam = lamTo; failed.u = r.u;
    if (level >= opt.maxSubdivisions) { message = `Load step λ=${lamFrom.toFixed(6)}→${lamTo.toFixed(6)} did not converge: ${r.reason}.`; return false; }
    const mid = (lamFrom + lamTo) / 2;
    return attempt(lamFrom, mid, level + 1) && attempt(mid, lamTo, level + 1);
  };
  let allOK = true;
  for (let s = 1; s <= nSteps && allOK; s++) allOK = attempt((s - 1) / nSteps, s / nSteps, 0);

  if (!allOK) status = 'not-converged';
  else if (so) {
    // stability of the converged state: factor the tangent once more
    evaluate(uc, true, false);
    if (!sky.factor()) { status = 'unstable'; message = 'The converged state has a singular tangent stiffness: the structure is at or beyond its critical load.'; }
    else if (sky.negativePivots > 0) { status = 'unstable'; message = `The converged equilibrium is UNSTABLE (${sky.negativePivots} negative pivot(s) in the tangent stiffness): the load is beyond a critical load.`; }
    lastNeg = sky.negativePivots;
  }
  if (status === 'converged') message = `Converged: ${totalIters} iterations in ${stepsLog.filter((x) => x.converged).length} load step(s); maximum ${opt.maxIterations} per step.`;

  // ---- results of the last converged state ----
  const { fint, evals } = evaluate(uc, false, false);
  const displacement = new Map<number, Vec6>();
  for (let i = 0; i < ps.nNodes; i++) {
    const id = ps.nodeId[i];
    if (id < 0) continue;
    displacement.set(id, [0, 1, 2, 3, 4, 5].map((k) => uc[i * 6 + k]) as Vec6);
  }
  const reactions = new Map<number, Vec6>();
  for (const s of ps.model.supports) {
    const i = ps.nodeIndex.get(s.node);
    if (i === undefined) continue;
    const r = [0, 1, 2, 3, 4, 5].map((k) => (ps.fixed[i * 6 + k] ? fint[i * 6 + k] - lamC * P[i * 6 + k] : 0)) as Vec6;
    reactions.set(s.node, r);
  }
  const elements = recoverElements(ps, evals, uc, u0l, feq, qLocal, lamC);
  const res: SolveResult = {
    status, converged: status === 'converged', message, lambdaReached: lamC, displacement, reactions, elements, iterations, steps: stepsLog, totalIterations: totalIters, options: opt,
  };
  if (failed.u && status === 'not-converged') {
    const dm = new Map<number, Vec6>();
    for (let i = 0; i < ps.nNodes; i++) if (ps.nodeId[i] >= 0) dm.set(ps.nodeId[i], [0, 1, 2, 3, 4, 5].map((k) => failed.u![i * 6 + k]) as Vec6);
    res.failedTrial = { lambda: failed.lam, displacement: dm };
  }
  void lastNeg;
  return res;
}

// ---------------- recovery of section forces ----------------
const herm = (L: number, x: number) => {
  const s = x / L;
  return [1 - 3 * s * s + 2 * s ** 3, x * (1 - s) ** 2, 3 * s * s - 2 * s ** 3, x * (s * s - s)];
};

function recoverElements(ps: Prepared, evals: ElemEval[], u: Float64Array, u0l: (Float64Array | null)[], feq: Float64Array[], qLocal: [number, number, number][], lam: number): ElementResult[] {
  void u;
  const out: ElementResult[] = [];
  for (const e of ps.elements) {
    const ev = evals[e.index];
    const fl = Float64Array.from(ev.f);
    for (let r = 0; r < fl.length; r++) fl[r] -= lam * feq[e.index][r]; // true end forces on the element
    const stations: number[][] = [];
    const x0 = e.x0;
    if (e.kind === 'truss') {
      const N = ev.active ? ev.N : 0;
      stations.push([x0, N, 0, 0, 0, 0, 0], [x0 + e.L, N, 0, 0, 0, 0, 0]);
    } else {
      const ut = Float64Array.from(ev.ul);
      const u0 = u0l[e.index];
      if (u0) for (let i = 0; i < 12; i++) ut[i] += u0[i];
      const q = qLocal[e.index].map((v) => v * lam);
      const nS = 4;
      for (let s = 0; s <= nS; s++) {
        const x = (e.L * s) / nS;
        if (s === 0) { stations.push([x0, -fl[0], -fl[1], -fl[2], -fl[3], -fl[4], -fl[5]]); continue; }
        if (s === nS) { stations.push([x0 + e.L, fl[6], fl[7], fl[8], fl[9], fl[10], fl[11]]); continue; }
        // equilibrium of the left part, on the deformed geometry (P-δ via the Hermite deflection)
        const H = herm(e.L, x);
        const vx = H[0] * ut[1] + H[1] * ut[5] + H[2] * ut[7] + H[3] * ut[11];
        const wx = H[0] * ut[2] - H[1] * ut[4] + H[2] * ut[8] - H[3] * ut[10];
        const N = -fl[0] - q[0] * x;
        const Vy = -fl[1] - q[1] * x;
        const Vz = -fl[2] - q[2] * x;
        const Mz = -fl[5] + x * fl[1] + (ut[1] - vx) * fl[0] + (q[1] * x * x) / 2;
        const My = -fl[4] - x * fl[2] - (ut[2] - wx) * fl[0] - (q[2] * x * x) / 2;
        stations.push([x0 + x, N, Vy, Vz, -fl[3], My, Mz]);
      }
    }
    const utAll = Float64Array.from(ev.ul);
    if (u0l[e.index]) for (let i = 0; i < utAll.length; i++) utAll[i] += u0l[e.index]![i];
    out.push({ member: e.member, element: e.index, fLocal: Array.from(fl), stations, active: ev.active, kind: e.kind, L: e.L, x0: e.x0, ut: Array.from(utAll), q: qLocal[e.index].map((v) => v * lam) });
  }
  return out;
}

// ---------------- critical load factor (linear buckling) ----------------
/**
 * Smallest load factor λ_cr at which K_E + λ K_G(N₁) becomes singular, where N₁ are the first-order axial forces of the combination.
 * Found by counting negative pivots of the LDLᵀ factorisation (Sturm sequence) and bisection. Returns Infinity when no compression is present.
 */
export function criticalLoadFactor(ps: Prepared, combo: LoadTerm[], options?: Partial<SolveOptions>, lamMax = 1e15, tol = 1e-9): { lambda: number; evaluations: number } {
  const opt: SolveOptions = { ...DEFAULT_OPTIONS, ...(options || {}), secondOrder: false };
  const lin = solveFrame({ prepared: ps, combo, options: opt });
  if (!lin.converged) return { lambda: NaN, evaluations: 0 };
  for (const e of ps.elements) if (e.kind === 'beam' && e.G.length === 0) e.G = beamG(e.L, (e.props as any).ipA, opt.torsionGeometric);
  const KE = new Skyline(ps.skyFirst);
  const KG = new Skyline(ps.skyFirst);
  const uFull = new Float64Array(ps.nDof);
  for (const [id, d] of lin.displacement) { const i = ps.nodeIndex.get(id)!; for (let k = 0; k < 6; k++) uFull[i * 6 + k] = d[k]; }
  // linear stiffness and unit-N geometric matrices (scaled by the first-order axial force)
  const Nax: number[] = ps.elements.map((e) => {
    const r = lin.elements[e.index];
    return e.kind === 'truss' ? r.stations[0][1] : r.stations[0][1];
  });
  ps.elements.forEach((e, idx) => {
    const nl = e.nLocal, nq = e.nq;
    let Kl: Float64Array, Gl: Float64Array;
    if (e.kind === 'beam') {
      const p: any = e.props;
      Kl = Float64Array.from(e.Kb!);
      Kl[0] += p.EA / e.L; Kl[6] -= p.EA / e.L; Kl[72] -= p.EA / e.L; Kl[78] += p.EA / e.L;
      Gl = Float64Array.from(e.G);
    } else {
      const p: any = e.props;
      Kl = new Float64Array(36);
      const k = p.EA / e.L;
      Kl[0] = k; Kl[3] = -k; Kl[18] = -k; Kl[21] = k;
      Gl = Float64Array.from(e.G);
    }
    const N = Nax[idx];
    const addQ = (sky: Skyline, A: Float64Array, scale: number) => {
      const T = new Float64Array(nl * nq);
      for (let r = 0; r < nl; r++) for (let c = 0; c < nq; c++) { let s = 0; for (let k = 0; k < nl; k++) s += A[r * nl + k] * e.M[k * nq + c]; T[r * nq + c] = s; }
      for (let a = 0; a < nq; a++) {
        const pa = ps.pos[e.dofs[a]];
        if (pa < 0) continue;
        for (let b = a; b < nq; b++) {
          const pb = ps.pos[e.dofs[b]];
          if (pb < 0) continue;
          let s = 0;
          for (let r = 0; r < nl; r++) s += e.M[r * nq + a] * T[r * nq + b];
          sky.add(pa, pb, scale * s);
        }
      }
    };
    addQ(KE, Kl, 1);
    addQ(KG, Gl, N);
  });
  for (const s of ps.nodeSprings) if (ps.pos[s.dof] >= 0) KE.add(ps.pos[s.dof], ps.pos[s.dof], s.k);
  let evals = 0;
  const work = new Skyline(ps.skyFirst);
  const negAt = (lam: number): number => {
    work.data.set(KE.data);
    for (let i = 0; i < work.data.length; i++) work.data[i] += lam * KG.data[i];
    work.factored = false;
    evals++;
    work.factor();
    return work.negativePivots;
  };
  let hi = 1;
  while (negAt(hi) === 0) { hi *= 2; if (hi > lamMax) return { lambda: Infinity, evaluations: evals }; }
  let lo = hi / 2 < 1 ? 0 : hi / 2;
  if (hi === 1) lo = 0;
  while ((hi - lo) / hi > tol) {
    const mid = (lo + hi) / 2;
    if (negAt(mid) > 0) hi = mid; else lo = mid;
  }
  return { lambda: (lo + hi) / 2, evaluations: evals };
}

/**
 * Section forces of an element at distance x from its start (equilibrium of the left part on the deformed geometry, P-δ included).
 * Returns [N, Vy, Vz, T, My, Mz] with tension positive; shear and moment on the positive face of the section.
 */
export function sectionForcesAt(el: ElementResult, x: number, deformedShear = false): number[] {
  const f = sectionForcesLocal(el, x);
  if (!deformedShear || el.kind === 'truss') return f;
  // shear forces referred to the DEFORMED member axis (RSTAB option "refer internal forces to deformed system"): V' = V − N·slope
  const L = el.L!, ut = el.ut!;
  const t = x / L;
  const d1 = (-6 * x) / (L * L) + (6 * x * x) / (L * L * L), d2 = 1 - (4 * x) / L + (3 * x * x) / (L * L), d3 = (6 * x) / (L * L) - (6 * x * x) / (L * L * L), d4 = (-2 * x) / L + (3 * x * x) / (L * L);
  void t;
  const sy = d1 * ut[1] + d2 * ut[5] + d3 * ut[7] + d4 * ut[11];
  const sz = d1 * ut[2] - d2 * ut[4] + d3 * ut[8] - d4 * ut[10];
  return [f[0], f[1] - f[0] * sy, f[2] - f[0] * sz, f[3], f[4], f[5]];
}

function sectionForcesLocal(el: ElementResult, x: number): number[] {
  const fl = el.fLocal;
  if (el.kind === 'truss') return [x <= 1e-9 ? -fl[0] : fl[3], 0, 0, 0, 0, 0];
  const L = el.L!, ut = el.ut!, q = el.q!;
  if (x <= 1e-9) return [-fl[0], -fl[1], -fl[2], -fl[3], -fl[4], -fl[5]];
  if (x >= L - 1e-9) return [fl[6], fl[7], fl[8], fl[9], fl[10], fl[11]];
  const H = herm(L, x);
  const vx = H[0] * ut[1] + H[1] * ut[5] + H[2] * ut[7] + H[3] * ut[11];
  const wx = H[0] * ut[2] - H[1] * ut[4] + H[2] * ut[8] - H[3] * ut[10];
  return [
    -fl[0] - q[0] * x,
    -fl[1] - q[1] * x,
    -fl[2] - q[2] * x,
    -fl[3],
    -fl[4] - x * fl[2] - (ut[2] - wx) * fl[0] - (q[2] * x * x) / 2,
    -fl[5] + x * fl[1] + (ut[1] - vx) * fl[0] + (q[1] * x * x) / 2,
  ];
}
