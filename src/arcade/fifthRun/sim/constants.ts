/**
 * Fifth Run — deterministic sim constants.
 *
 * Determinism note: the track generator and the runner step only use + − × ÷ and comparisons
 * (no Math.exp / sin / pow), which are exactly rounded IEEE-754 ops in every JS engine. Same seed
 * ⇒ bit-identical track on iOS Safari, Android Chrome and the Node harness.
 */
export const FR_HZ = 120
export const FR_DT = 1 / FR_HZ

export const LANE_W = 2.0
export const laneX = (lane: number) => (lane - 1) * LANE_W

/** Forward speed (m/s) as a function of distance — rational ramp, deterministic. */
export const SPEED = { v0: 12, vmax: 32, k: 1250 }
export const speedAt = (s: number) => SPEED.v0 + (SPEED.vmax - SPEED.v0) * (s / (s + SPEED.k))
/** Difficulty 0..1 (pattern mix + spacing). */
export const DIFF_K = 780
export const levelAt = (s: number) => (s <= 0 ? 0 : s / (s + DIFF_K))

/** Jump: fixed airtime / apex (feet height). */
export const JUMP_T = 0.64
export const JUMP_APEX = 1.5
export const GRAVITY = (8 * JUMP_APEX) / (JUMP_T * JUMP_T)
export const JUMP_VY = (4 * JUMP_APEX) / JUMP_T
export const FAST_FALL_VY = 15
export const SLIDE_TICKS = Math.round(0.62 * FR_HZ)
/** Lateral speed: one lane in ~0.14 s. */
export const LANE_SPEED = LANE_W / 0.14
/** Buffered input window. */
export const BUFFER_TICKS = Math.round(0.22 * FR_HZ)

export const BODY = { h: 1.75, slideH: 0.85, halfD: 0.28, halfW: 0.32 }

export const OB = {
  barrier: { h: 0.75, len: 0.4, halfW: 0.8 },
  overhead: { bottom: 1.2, len: 0.45, halfW: 0.95 },
  car: { h: 1.45, len: 5.4, halfW: 0.92 },
  gap: { halfW: 1.0 },
} as const

export const POWER_TICKS = {
  magnet: 8 * FR_HZ,
  five: 6 * FR_HZ,
  invuln: Math.round(1.0 * FR_HZ),
}

export const KEY_PTS = 5
/** combo thresholds → multiplier index+1 (x1..x5) */
export const COMBO_STEPS = [0, 10, 30, 60, 100]
export const multFor = (combo: number) => {
  let m = 1
  for (let i = 1; i < COMBO_STEPS.length; i++) if (combo >= COMBO_STEPS[i]) m = i + 1
  return m
}

export const START_CLEAR_M = 70
