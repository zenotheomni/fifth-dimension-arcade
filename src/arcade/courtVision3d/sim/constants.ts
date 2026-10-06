/**
 * Court Vision 3D — real-world dimensions (metres).
 * Axes: +x right, +y up, +z toward the shooter. Backboard front face at z = 0.
 */
export const DIM = {
  rimY: 3.05,
  /** Inner radius of the ring (0.457 m diameter) */
  rimInnerR: 0.2286,
  /** Steel tube radius */
  rimTubeR: 0.0095,
  /** Ring centre distance from the board face (6 in gap + inner radius) */
  rimZ: 0.151 + 0.2286,
  boardW: 1.83,
  boardH: 1.07,
  boardBottom: 2.9,
  boardThick: 0.03,
  /** Shooter's square (inner rectangle) */
  squareW: 0.59,
  squareH: 0.45,
  ballR: 0.12,
  poleZ: -1.15,
  poleR: 0.11,
  baselineZ: -1.22,
  /** Ball resting spot (free-throw line, centre) */
  ballRestZ: 4.6,
  gravity: 9.81,
} as const

/** Ring major radius (centre of tube). */
export const RIM_MAJOR = DIM.rimInnerR + DIM.rimTubeR
export const BOARD_TOP = DIM.boardBottom + DIM.boardH
export const BOARD_CY = DIM.boardBottom + DIM.boardH / 2

/** Fixed simulation step (deterministic). */
export const SIM_DT = 1 / 240

export const CAMERA = {
  z: 7.8,
  y: 0.9,
  /** Vertical FOV (deg) tuned for a 390x844 portrait viewport */
  fovPortrait: 50.5,
  /** Look direction pitch (deg, positive = up) */
  pitchDeg: 4.435,
} as const

export const MATERIAL = {
  floor: { e: 0.78, mu: 0.55 },
  board: { e: 0.6, mu: 0.3 },
  rim: { e: 0.52, mu: 0.28 },
  bracket: { e: 0.35, mu: 0.3 },
  pole: { e: 0.4, mu: 0.3 },
} as const
