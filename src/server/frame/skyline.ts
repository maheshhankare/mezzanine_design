/**
 * Symmetric skyline (envelope) matrix with an LDLᵀ factorisation, plus a reverse Cuthill–McKee ordering.
 * Memory and work scale with the profile, so a 3D frame with tens of thousands of DOF stays practical.
 * The factorisation counts negative pivots: for a tangent stiffness this is the number of eigenvalues below zero,
 * i.e. a direct indicator that the structure has passed a buckling / limit point.
 */

/** Reverse Cuthill–McKee ordering of a graph given as adjacency lists. Returns perm[newIndex] = oldIndex. */
export function rcm(adj: number[][]): Int32Array {
  const n = adj.length;
  const visited = new Uint8Array(n);
  const order: number[] = [];
  const deg = adj.map((a) => a.length);
  const start = Array.from({ length: n }, (_, i) => i).sort((a, b) => deg[a] - deg[b]);
  for (const s of start) {
    if (visited[s]) continue;
    // pseudo-peripheral start: BFS twice
    let root = s;
    for (let pass = 0; pass < 2; pass++) {
      const seen = new Uint8Array(n);
      const q = [root];
      seen[root] = 1;
      let last = root;
      for (let h = 0; h < q.length; h++) {
        last = q[h];
        for (const w of adj[q[h]]) if (!seen[w] && !visited[w]) { seen[w] = 1; q.push(w); }
      }
      // choose the lowest-degree vertex of the last level
      let best = last;
      for (let h = q.length - 1; h >= 0 && h >= q.length - 8; h--) if (deg[q[h]] < deg[best]) best = q[h];
      root = best;
    }
    const q = [root];
    visited[root] = 1;
    for (let h = 0; h < q.length; h++) {
      const v = q[h];
      order.push(v);
      const nb = adj[v].filter((w) => !visited[w]).sort((a, b) => deg[a] - deg[b]);
      for (const w of nb) { visited[w] = 1; q.push(w); }
    }
  }
  order.reverse();
  return Int32Array.from(order);
}

export class Skyline {
  readonly n: number;
  /** first (topmost) row with a stored entry in column j */
  readonly first: Int32Array;
  /** index of the diagonal entry of column j in `data`; column j occupies [ptr[j]-(j-first[j]) .. ptr[j]] */
  readonly ptr: Int32Array;
  data: Float64Array;
  factored = false;
  negativePivots = 0;
  minPivotRatio = Infinity;

  /** @param firstRow for each column the smallest row index that will receive an entry (<= j) */
  constructor(firstRow: Int32Array) {
    this.n = firstRow.length;
    this.first = firstRow;
    this.ptr = new Int32Array(this.n);
    let p = 0;
    for (let j = 0; j < this.n; j++) { p += j - firstRow[j]; this.ptr[j] = p; p++; }
    this.data = new Float64Array(p);
  }

  get size(): number { return this.data.length; }

  zero() { this.data.fill(0); this.factored = false; }

  add(i: number, j: number, v: number) {
    if (i > j) { const t = i; i = j; j = t; }
    this.data[this.ptr[j] - (j - i)] += v;
  }

  get(i: number, j: number): number {
    if (i > j) { const t = i; i = j; j = t; }
    if (i < this.first[j]) return 0;
    return this.data[this.ptr[j] - (j - i)];
  }

  /** In-place LDLᵀ. Returns false when a pivot is zero (singular); negative pivots are counted, not rejected. */
  factor(): boolean {
    const { n, first, ptr, data } = this;
    let neg = 0;
    let minRatio = Infinity;
    const diag0 = new Float64Array(n);
    for (let j = 0; j < n; j++) diag0[j] = Math.abs(data[ptr[j]]);
    for (let j = 0; j < n; j++) {
      const fj = first[j];
      const cj = ptr[j];
      for (let k = fj + 1; k < j; k++) {
        const fk = first[k];
        const ck = ptr[k];
        const lo = Math.max(fk, fj);
        let s = 0;
        for (let i = lo; i < k; i++) s += data[ck - (k - i)] * data[cj - (j - i)];
        data[cj - (j - k)] -= s;
      }
      let b = 0;
      for (let k = fj; k < j; k++) {
        const dk = data[ptr[k]];
        const g = data[cj - (j - k)];
        const l = g / dk;
        b += l * g;
        data[cj - (j - k)] = l;
      }
      data[cj] -= b;
      const d = data[cj];
      if (d < 0) neg++;
      const ratio = Math.abs(d) / (diag0[j] || 1);
      if (ratio < minRatio) minRatio = ratio;
      if (d === 0 || !Number.isFinite(d)) { this.negativePivots = neg; this.minPivotRatio = 0; this.factored = false; return false; }
    }
    this.negativePivots = neg;
    this.minPivotRatio = minRatio;
    this.factored = true;
    return true;
  }

  /** Solve A x = b with the factors (b is overwritten with x). */
  solve(b: Float64Array): Float64Array {
    const { n, first, ptr, data } = this;
    for (let j = 1; j < n; j++) {
      const fj = first[j], cj = ptr[j];
      let s = 0;
      for (let k = fj; k < j; k++) s += data[cj - (j - k)] * b[k];
      b[j] -= s;
    }
    for (let j = 0; j < n; j++) b[j] /= data[ptr[j]];
    for (let j = n - 1; j > 0; j--) {
      const fj = first[j], cj = ptr[j], bj = b[j];
      for (let k = fj; k < j; k++) b[k] -= data[cj - (j - k)] * bj;
    }
    return b;
  }

  /** y = A x for the UNFACTORED matrix. */
  multiply(x: Float64Array, y: Float64Array) {
    const { n, first, ptr, data } = this;
    y.fill(0);
    for (let j = 0; j < n; j++) {
      const fj = first[j], cj = ptr[j];
      for (let i = fj; i < j; i++) {
        const a = data[cj - (j - i)];
        y[i] += a * x[j];
        y[j] += a * x[i];
      }
      y[j] += data[cj] * x[j];
    }
  }
}
