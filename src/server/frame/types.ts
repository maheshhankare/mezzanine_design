/**
 * Second-order frame analysis: data model.
 * Units are N, mm, N/mm². Moments N·mm. Angles in degrees at the input level, radians internally.
 * DOF order everywhere: [ux, uy, uz, rx, ry, rz].
 */
export type Vec6 = [number, number, number, number, number, number];
export type Flags6 = [boolean, boolean, boolean, boolean, boolean, boolean];

export interface FNode {
  id: number;
  x: number;
  y: number;
  z: number;
}

export interface FMaterial {
  E: number; // N/mm²
  G: number; // N/mm²
  w?: number; // specific weight N/mm³ (steel 7.85e-5), used by self-weight
}

export interface FSection {
  A: number; // mm²
  Iy: number; // mm⁴ about local y (bending in the local x-z plane)
  Iz: number; // mm⁴ about local z (bending in the local x-y plane)
  J: number; // mm⁴ torsion constant
  Ay?: number; // shear area in local y (mm²); with Az enables Timoshenko shear deformation
  Az?: number;
}

/**
 * A release of one end of a member. For every component: undefined / false = rigid (continuous with the node),
 * true = free (hinge), a number = elastic spring (N/mm or N·mm/rad).
 */
export type Release = Partial<Record<'ux' | 'uy' | 'uz' | 'rx' | 'ry' | 'rz', boolean | number>>;

export interface FMember {
  id: number;
  type: 'beam' | 'truss'; // truss = axial force only (pin-ended rod), optionally tension-only
  n1: number;
  n2: number;
  section: string;
  material: string;
  beta?: number; // rotation of the local axes about the member axis [deg]
  rel1?: Release;
  rel2?: Release;
  /** number of finite elements along the member (>= 1); P-δ accuracy improves with more elements */
  divisions?: number;
  tensionOnly?: boolean; // truss only
  /** stiffness modification factors (RSTAB-style): multiply EA, EI, GJ */
  fEA?: number;
  fEI?: number;
  fGJ?: number;
}

export interface FSupport {
  node: number;
  fixed: Flags6; // true = restrained
  spring?: Vec6; // elastic support stiffness (adds to the node)
}

export interface NodalLoad {
  node: number;
  f: Vec6; // Fx Fy Fz Mx My Mz in global axes
}

export interface MemberLoad {
  member: number;
  /** uniform line load [N/mm] */
  q: [number, number, number];
  system: 'local' | 'global';
}

export interface LoadCase {
  id: string;
  name?: string;
  nodal?: NodalLoad[];
  member?: MemberLoad[];
  /** self-weight: acceleration factors in global x, y, z (e.g. [0,0,1] for gravity along +z) */
  selfWeight?: [number, number, number];
}

/** Stress-free initial geometry error: nodal displacement and rotation field (global axes). */
export type InitialImperfection = Map<number, Vec6>;

export interface FrameModel {
  nodes: FNode[];
  materials: Record<string, FMaterial>;
  sections: Record<string, FSection>;
  members: FMember[];
  supports: FSupport[];
}

export interface SolveOptions {
  /** false = first-order linear analysis (K_E only) */
  secondOrder: boolean;
  maxIterations: number; // per load step, default 100
  tolForce: number; // ‖R_trans‖ / max(‖P_trans‖, floor)
  tolMoment: number; // ‖R_rot‖ / max(‖P_rot‖, floor)
  tolDisplacement: number; // ‖Δu‖ / max(‖u‖, floor)
  tolEnergy: number; // |ΔuᵀR| / max(|uᵀP|, floor)
  forceFloor: number; // N
  momentFloor: number; // N·mm
  lengthFloor: number; // mm
  steps: number; // initial number of load increments
  maxSubdivisions: number; // how many times a failed step is halved
  lineSearch: boolean;
  /** include the torsional geometric term (N·ip/A) */
  torsionGeometric: boolean;
  /** truss elements with tensionOnly are switched off when compressed */
  tensionOnly: boolean;
}

export const DEFAULT_OPTIONS: SolveOptions = {
  secondOrder: true,
  maxIterations: 100,
  tolForce: 1e-6,
  tolMoment: 1e-6,
  tolDisplacement: 1e-6,
  tolEnergy: 1e-10,
  forceFloor: 1e-3,
  momentFloor: 1,
  lengthFloor: 1e-6,
  steps: 4,
  maxSubdivisions: 6,
  lineSearch: true,
  torsionGeometric: false,
  tensionOnly: true,
};

export interface IterationRecord {
  step: number;
  lambda: number;
  iter: number;
  resForce: number;
  resMoment: number;
  maxDu: number;
  energy: number;
  converged: boolean;
  note?: string;
}

export interface StepRecord {
  step: number;
  lambdaFrom: number;
  lambdaTo: number;
  subdivisionLevel: number;
  iterations: number;
  converged: boolean;
  reason?: string;
}

export type SolveStatus = 'converged' | 'not-converged' | 'unstable' | 'invalid-model';

export interface ElementResult {
  member: number;
  element: number;
  /** local end forces on the element (12 values, element axes) */
  fLocal: number[];
  /** section forces along the member at element ends (tension / sign conventions in docs): [x, N, Vy, Vz, T, My, Mz] */
  stations: number[][];
  active?: boolean;
}

export interface SolveResult {
  status: SolveStatus;
  /** true only when every load step met all convergence criteria */
  converged: boolean;
  message: string;
  lambdaReached: number;
  /** nodal displacements of the LAST CONVERGED state, by node id (global axes) */
  displacement: Map<number, Vec6>;
  /** support reactions of the last converged state, by node id */
  reactions: Map<number, Vec6>;
  elements: ElementResult[];
  iterations: IterationRecord[];
  steps: StepRecord[];
  totalIterations: number;
  /** a failed trial state is kept apart from the converged state */
  failedTrial?: { lambda: number; displacement: Map<number, Vec6> };
  options: SolveOptions;
}
