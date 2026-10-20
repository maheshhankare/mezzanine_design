/**
 * Element formulation for the second-order frame analysis.
 *
 * KINEMATICS (small strains, moderate rotations: "von Kármán" / Theory II, total formulation in the element's initial local frame)
 *   Local axes x (member axis), y, z. DOF per node: u, v, w, θx, θy, θz (θy = −w′).
 *   Axial displacement: linear. Transverse v, w: cubic Hermite (exact for a prismatic member without transverse load).
 *   Axial strain of the fibre on the member axis, averaged over the element length:
 *        ε = δ/L + (1/2L) [ (u+u0)ᵀ G (u+u0) − u0ᵀ G u0 ]
 *   with δ = u2 − u1, G = ∫ (φ′φ′ᵀ) dx the geometric matrix of the transverse DOF (and, optionally, torsion: ip/A·θx′²).
 *   u0 is the STRESS-FREE initial imperfection of the element (nodal displacement field of the imperfect geometry).
 *   The term G(u) in ε is what couples transverse displacement to axial force:
 *      – chord rotation of the element (relative end displacements)  -> global P-Δ,
 *      – curvature of the deformed shape inside the element           -> member P-δ (more elements per member improve it).
 *
 * ENERGY
 *   Π = ½ uᵀ K_b u  (bending, torsion, shear: curvature change only, so an initial imperfection carries no bending stress)
 *       + ½ EA L ε²
 *
 * INTERNAL FORCE AND CONSISTENT TANGENT (exact derivatives of Π, no approximation)
 *   N   = EA ε
 *   f   = K_b u + N ( a + G (u+u0) ),            a = [−1 at u1, +1 at u2]
 *   K_T = K_b + (EA/L) (a + G(u+u0)) (a + G(u+u0))ᵀ + N G
 *   At u = 0, u0 = 0 this is the textbook K_E + N·K_G, so P-Δ and P-δ are NOT counted twice: one geometric term, one source.
 *
 * Not included (documented limits): warping / lateral-torsional coupling (Wagner terms, 7th DOF), large rotations (> ~0.2 rad),
 * shear-deformation effect on G (G uses the Euler–Bernoulli shape functions), member-load-induced N variation inside the element.
 */

export interface BeamProps {
  L: number;
  EA: number;
  EIy: number;
  EIz: number;
  GJ: number;
  GAy?: number; // shear stiffness (G·Ay); with GAz enables Timoshenko shear deformation in K_b
  GAz?: number;
  ipA: number; // (Iy+Iz)/A for the torsional geometric term
}

const SY = [1, -1, 1, -1];

/** 12×12 row-major matrix: bending, torsion and shear stiffness (no axial term). */
export function beamKb(p: BeamProps): Float64Array {
  const { L, EIy, EIz, GJ, GAy, GAz } = p;
  const K = new Float64Array(144);
  const put = (i: number, j: number, v: number) => { K[i * 12 + j] += v; };
  // torsion
  const gj = GJ / L;
  put(3, 3, gj); put(3, 9, -gj); put(9, 3, -gj); put(9, 9, gj);
  // plane x-y: v, θz   (slots 1, 5, 7, 11)
  const phiZ = GAy ? (12 * EIz) / (GAy * L * L) : 0;
  const cz = EIz / ((1 + phiZ) * L * L * L);
  const kz = [
    [12, 6 * L, -12, 6 * L],
    [6 * L, (4 + phiZ) * L * L, -6 * L, (2 - phiZ) * L * L],
    [-12, -6 * L, 12, -6 * L],
    [6 * L, (2 - phiZ) * L * L, -6 * L, (4 + phiZ) * L * L],
  ];
  const sz = [1, 5, 7, 11];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) put(sz[a], sz[b], cz * kz[a][b]);
  // plane x-z: w, θy (θy = −w′: sign flip on the rotations), slots 2, 4, 8, 10
  const phiY = GAz ? (12 * EIy) / (GAz * L * L) : 0;
  const cy = EIy / ((1 + phiY) * L * L * L);
  const ky = [
    [12, 6 * L, -12, 6 * L],
    [6 * L, (4 + phiY) * L * L, -6 * L, (2 - phiY) * L * L],
    [-12, -6 * L, 12, -6 * L],
    [6 * L, (2 - phiY) * L * L, -6 * L, (4 + phiY) * L * L],
  ];
  const sy = [2, 4, 8, 10];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) put(sy[a], sy[b], cy * ky[a][b] * SY[a] * SY[b]);
  return K;
}

/** Geometric matrix G (unit axial force) of the transverse DOF (+ optional torsion), 12×12 row-major. */
export function beamG(L: number, ipA: number, torsion: boolean): Float64Array {
  const G = new Float64Array(144);
  const base = [
    [36, 3 * L, -36, 3 * L],
    [3 * L, 4 * L * L, -3 * L, -L * L],
    [-36, -3 * L, 36, -3 * L],
    [3 * L, -L * L, -3 * L, 4 * L * L],
  ];
  const c = 1 / (30 * L);
  const sz = [1, 5, 7, 11];
  const sy = [2, 4, 8, 10];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
    G[sz[a] * 12 + sz[b]] += c * base[a][b];
    G[sy[a] * 12 + sy[b]] += c * base[a][b] * SY[a] * SY[b];
  }
  if (torsion) {
    const t = ipA / L;
    G[3 * 12 + 3] += t; G[3 * 12 + 9] -= t; G[9 * 12 + 3] -= t; G[9 * 12 + 9] += t;
  }
  return G;
}

export interface EvalOut {
  f: Float64Array; // internal force vector (local)
  K: Float64Array; // tangent (local)
  N: number; // axial force (tension positive)
  eps: number; // mean axial strain
}

/** Evaluate a beam element. u, u0 local (12). secondOrder=false returns the linear response. */
export function beamEval(p: BeamProps, Kb: Float64Array, G: Float64Array, u: Float64Array, u0: Float64Array | null, secondOrder: boolean): EvalOut {
  const { L, EA } = p;
  const f = new Float64Array(12);
  const K = new Float64Array(144);
  // bending / torsion part
  for (let i = 0; i < 12; i++) {
    let s = 0;
    for (let j = 0; j < 12; j++) s += Kb[i * 12 + j] * u[j];
    f[i] = s;
  }
  K.set(Kb);
  const delta = u[6] - u[0];
  if (!secondOrder) {
    const N = (EA / L) * delta;
    f[0] -= N; f[6] += N;
    const k = EA / L;
    K[0] += k; K[6] += -k; K[72] += -k; K[78] += k;
    return { f, K, N, eps: delta / L };
  }
  // total transverse geometry (displacement + stress-free imperfection)
  const ut = new Float64Array(12);
  for (let i = 0; i < 12; i++) ut[i] = u[i] + (u0 ? u0[i] : 0);
  const Gu = new Float64Array(12);
  for (let i = 0; i < 12; i++) {
    let s = 0;
    for (let j = 0; j < 12; j++) s += G[i * 12 + j] * ut[j];
    Gu[i] = s;
  }
  let quad = 0;
  let quad0 = 0;
  for (let i = 0; i < 12; i++) quad += ut[i] * Gu[i];
  if (u0) {
    for (let i = 0; i < 12; i++) {
      let s = 0;
      for (let j = 0; j < 12; j++) s += G[i * 12 + j] * u0[j];
      quad0 += u0[i] * s;
    }
  }
  const eps = delta / L + (quad - quad0) / (2 * L);
  const N = EA * eps;
  // v = a + G ut
  const v = Gu; // reuse
  v[0] -= 1;
  v[6] += 1;
  for (let i = 0; i < 12; i++) f[i] += N * v[i];
  const k = EA / L;
  for (let i = 0; i < 12; i++) {
    const vi = k * v[i];
    for (let j = 0; j < 12; j++) K[i * 12 + j] += vi * v[j] + N * G[i * 12 + j];
  }
  return { f, K, N, eps };
}

// ---------------- truss (axial force only) ----------------
export interface TrussProps { L: number; EA: number }

/** G for the truss: transverse relative displacement of the two nodes, 6×6 (u1 v1 w1 u2 v2 w2). */
export function trussG(L: number): Float64Array {
  const G = new Float64Array(36);
  const c = 1 / L;
  for (const k of [1, 2]) { G[k * 6 + k] += c; G[k * 6 + k + 3] -= c; G[(k + 3) * 6 + k] -= c; G[(k + 3) * 6 + k + 3] += c; }
  return G;
}

export function trussEval(p: TrussProps, G: Float64Array, u: Float64Array, u0: Float64Array | null, secondOrder: boolean, tensionOnly: boolean): EvalOut & { active: boolean } {
  const { L, EA } = p;
  const f = new Float64Array(6);
  const K = new Float64Array(36);
  const delta = u[3] - u[0];
  if (!secondOrder) {
    const N = (EA / L) * delta;
    const active = !(tensionOnly && N < 0);
    if (!active) return { f, K, N: 0, eps: delta / L, active };
    f[0] = -N; f[3] = N;
    const k = EA / L;
    K[0] = k; K[3] = -k; K[18] = -k; K[21] = k;
    return { f, K, N, eps: delta / L, active };
  }
  const ut = new Float64Array(6);
  for (let i = 0; i < 6; i++) ut[i] = u[i] + (u0 ? u0[i] : 0);
  const Gu = new Float64Array(6);
  for (let i = 0; i < 6; i++) { let s = 0; for (let j = 0; j < 6; j++) s += G[i * 6 + j] * ut[j]; Gu[i] = s; }
  let quad = 0, quad0 = 0;
  for (let i = 0; i < 6; i++) quad += ut[i] * Gu[i];
  if (u0) for (let i = 0; i < 6; i++) { let s = 0; for (let j = 0; j < 6; j++) s += G[i * 6 + j] * u0[j]; quad0 += u0[i] * s; }
  const eps = delta / L + (quad - quad0) / (2 * L);
  const active = !(tensionOnly && eps < 0);
  if (!active) return { f, K, N: 0, eps, active };
  const N = EA * eps;
  const v = Gu;
  v[0] -= 1; v[3] += 1;
  for (let i = 0; i < 6; i++) f[i] = N * v[i];
  const k = EA / L;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) K[i * 6 + j] = k * v[i] * v[j] + N * G[i * 6 + j];
  return { f, K, N, eps, active };
}

// ---------------- local axes ----------------
/** Rows of R = local x, y, z in global components. ref = reference vector for y (default global Z; X if parallel). */
export function localAxes(dx: number, dy: number, dz: number, betaDeg = 0): [number[], number[], number[]] {
  const L = Math.hypot(dx, dy, dz);
  const x = [dx / L, dy / L, dz / L];
  let ref = [0, 0, 1];
  if (Math.abs(x[2]) > 0.999999) ref = [1, 0, 0];
  // y = ref × x, normalised; z = x × y
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let y = cross(ref, x);
  const ny = Math.hypot(y[0], y[1], y[2]);
  y = y.map((c) => c / ny);
  let z = cross(x, y);
  if (betaDeg) {
    const b = (betaDeg * Math.PI) / 180, c = Math.cos(b), s = Math.sin(b);
    const y2 = y.map((v, i) => c * v + s * z[i]);
    const z2 = z.map((v, i) => c * v - s * y[i]);
    y = y2; z = z2;
  }
  return [x, y, z];
}
