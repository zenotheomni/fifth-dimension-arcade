/**
 * Fifth Glide — deterministic sim constants (on-foot runner).
 *
 * Determinism note: the track generator and the runner step only use + − × ÷ and comparisons
 * (no Math.exp / sin / pow), which are exactly rounded IEEE-754 ops in every JS engine. Same seed
 * ⇒ bit-identical track on iOS Safari, Android Chrome and the Node harness.
 */
export const FR_HZ = 120
export const FR_DT = 1 / FR_HZ

export const LANE_W = 2.0
export const laneX = (lane: number) => (lane - 1) * LANE_W

/**
 * Forward speed (m/s). Gentle on-ramp for first-timers (≈14 → 21.5 m/s over the first 30 s), then it
 * keeps climbing toward vmax (≈27 m/s at 60 s, ≈33 m/s at 2 min).
 */
export const SPEED = { v0: 14, vmax: 44, k: 1600 }
export const speedAt = (s: number) => SPEED.v0 + (SPEED.vmax - SPEED.v0) * (s / (s + SPEED.k))
/**
 * Warm-up distance (≈ first 40 s, easing out linearly): sparse single-car rows, slower oncoming
 * traffic, wider spacing.
 * warmAt = 1 at the start line → 0 at WARM_M (linear; exact IEEE ops only).
 */
export const WARM_M = 750
export const warmAt = (s: number) => (s >= WARM_M ? 0 : s <= 0 ? 1 : 1 - s / WARM_M)
/** Difficulty 0..1 (pattern mix + spacing). Held at 0 through the first LEVEL_OFFSET metres. */
export const DIFF_K = 950
export const LEVEL_OFFSET = 460
export const levelAt = (s: number) => (s <= LEVEL_OFFSET ? 0 : (s - LEVEL_OFFSET) / (s - LEVEL_OFFSET + DIFF_K))

/** Jump: fixed airtime / apex (feet height). */
export const JUMP_T = 0.62
export const JUMP_APEX = 1.5
export const GRAVITY = (8 * JUMP_APEX) / (JUMP_T * JUMP_T)
export const JUMP_VY = (4 * JUMP_APEX) / JUMP_T
export const FAST_FALL_VY = 16
export const SLIDE_TICKS = Math.round(0.58 * FR_HZ)
/** Lateral speed: one lane in ~0.11 s — tight Surfers weave. */
export const LANE_SPEED = LANE_W / 0.11
/** Buffered input window. */
export const BUFFER_TICKS = Math.round(0.22 * FR_HZ)

/** Runner AABB (feet/ground = y0). Jump clears barriers; slide ducks overhead. */
export const BODY = { h: 1.75, slideH: 0.85, halfD: 0.28, halfW: 0.32 }

export const OB = {
  barrier: { h: 0.75, len: 0.4, halfW: 0.8 },
  overhead: { bottom: 1.2, len: 0.45, halfW: 0.95 },
  car: { h: 1.45, len: 5.0, halfW: 0.9 },
  gap: { halfW: 1.0 },
} as const

/** @deprecated Continuous oncoming no longer uses a park-then-lerp window. */
export const ONCOMING_WINDOW = 95

export const START_LIVES = 3

export const POWER_TICKS = {
  /** Fifth Dimension logo — 15s invulnerability */
  hand: 15 * FR_HZ,
  /** brief i-frames after losing a life */
  hitInvuln: Math.round(1.5 * FR_HZ),
}

/** Base points per star before combo. */
export const STAR_BASE = 10
/**
 * Flat distance-equivalent points per star (stars boost the score heavily alongside metres).
 * score = floor(distance) + floor(timeS × TIME_PTS) + stars × STAR_FLAT + starPts(STAR_BASE × combo)
 */
export const STAR_FLAT = 25
/** Points per second lasted (time survived). */
export const TIME_PTS = 5
/** combo thresholds → multiplier index+1 (x1..x5) */
export const COMBO_STEPS = [0, 10, 30, 60, 100]
export const multFor = (combo: number) => {
  let m = 1
  for (let i = 1; i < COMBO_STEPS.length; i++) if (combo >= COMBO_STEPS[i]) m = i + 1
  return m
}

export const START_CLEAR_M = 110
