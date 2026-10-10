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
 * Forward speed (m/s). Temple Run pace on a narrow sky path: brisk 21 m/s start, ramping toward vmax
 * (≈26 m/s at 1 km, ≈31 m/s at 2.5 km, ≈35 m/s at 5 km).
 */
export const SPEED = { v0: 21, vmax: 54, k: 2200 }
export const speedAt = (s: number) => SPEED.v0 + (SPEED.vmax - SPEED.v0) * (s / (s + SPEED.k))
/**
 * Warm-up distance (≈ first 40 s, easing out linearly): sparse single-car rows, slower oncoming
 * traffic, wider spacing.
 * warmAt = 1 at the start line → 0 at WARM_M (linear; exact IEEE ops only).
 */
export const WARM_M = 700
export const warmAt = (s: number) => (s >= WARM_M ? 0 : s <= 0 ? 1 : 1 - s / WARM_M)
/** Difficulty 0..1 (pattern mix + spacing). Held at 0 through the first LEVEL_OFFSET metres. */
export const DIFF_K = 360
export const LEVEL_OFFSET = 360
export const levelAt = (s: number) => (s <= LEVEL_OFFSET ? 0 : (s - LEVEL_OFFSET) / (s - LEVEL_OFFSET + DIFF_K))

/** Jump: fixed airtime / apex (feet height). */
export const JUMP_T = 0.74
export const JUMP_APEX = 1.8
export const GRAVITY = (8 * JUMP_APEX) / (JUMP_T * JUMP_T)
export const JUMP_VY = (4 * JUMP_APEX) / JUMP_T
export const FAST_FALL_VY = 16
export const SLIDE_TICKS = Math.round(0.58 * FR_HZ)
/** Lateral speed: one lane in ~0.11 s — tight Surfers weave. */
export const LANE_SPEED = LANE_W / 0.11
/** Buffered input window. */
export const BUFFER_TICKS = Math.round(0.32 * FR_HZ)
/** Coyote time: grace (s) after stepping onto a gap edge where a jump still saves you. */
export const COYOTE_S = 0.12
/**
 * Hang assist (Temple Run-style forgiving jump): while airborne and falling, if a low hurdle or a gap
 * in your lane starts within HANG.leadS seconds of travel, gravity drops to HANG.g so a slightly early
 * jump still carries you over it. At most HANG.maxS seconds of float per jump.
 */
export const HANG = { leadS: 0.16, g: 0.3, maxS: 0.22 }

/** Runner AABB (feet/ground = y0). Jump clears hurdles; slide ducks overhead. */
export const BODY = { h: 1.75, slideH: 0.85, halfD: 0.28, halfW: 0.32 }

/**
 * Obstacle hit boxes — exactly the visible mesh bounds (render/props.ts builds to these numbers).
 * barrier = low hurdle, jump only: a hit needs feet below `h` while the body overlaps it.
 * pipe = chest-high bar: slide under it OR jump over it (body must miss the [bottom, top] band).
 */
export const OB = {
  barrier: { h: 0.6, len: 0.4, halfW: 0.82 },
  overhead: { bottom: 1.2, len: 0.45, halfW: 0.95 },
  pipe: { bottom: 0.95, top: 1.2, len: 0.3, halfW: 0.95 },
  block: { h: 2.6, len: 1.6, halfW: 0.85 },
  /** 1959 Cadillac wreck lying across a lane (switch lanes); hits cost a life like a boulder */
  car: { h: 1.5, len: 5.4, halfW: 0.9 },
  gap: { halfW: 1.0 },
} as const

export const START_LIVES = 3

/**
 * Temple Run corners. The path is straight segments joined by 90° corners (L / R) and T-junctions
 * (either way). A corner is a square of side 2·HALF centred on `s`.
 * - A left/right swipe within `armS` seconds of the corner centre is a TURN (not a lane change); it is
 *   taken as soon as the runner is on the corner square (s ≥ s − HALF). Swiping inside the square
 *   turns at once.
 * - No turn by s + HALF (the far edge of the square) = ran off the end → fall (−1 life).
 * - Wrong way at an L / R corner = ran off the side → fall.
 * - Respawn after a corner fall: already turned the right way, just past the corner.
 * - Segments: `segMin..segMax` m early on, shrinking with level to `segMinHard..segMaxHard`; T chance tP.
 * - No obstacles from `preS` s before a corner to `postS` s after it (T: `postT` m, the unchosen arm
 *   is drawn this far).
 */
export const CORNER = {
  half: 3.2,
  armS: 1.0,
  /** extra time past the far edge of the corner square you may still turn (+ more during the warm-up) */
  lateS: 0.1,
  lateWarmS: 0.15,
  segMin: 170,
  segMax: 260,
  segMinHard: 70,
  segMaxHard: 140,
  tP: 0.22,
  preS: 1.7,
  postS: 0.8,
  postT: 70,
}
/** Path half width the runner can drift across (tilt) — lane centres are ±LANE_W. */
export const PATH_HALF = 2.25

/**
 * Narrow sections / edge drop-offs: a lane of the path simply isn't there for `len` metres (void).
 * Narrow = both side lanes missing; drop-off = one side lane missing.
 */
export const VOID = { startM: 260, pMax: 0.32, fullM: 2000, minLen: 18, maxLen: 44 }
export const voidChanceAt = (s: number) =>
  s < VOID.startM ? 0 : s >= VOID.fullM ? VOID.pMax : 0.06 + ((VOID.pMax - 0.06) * (s - VOID.startM)) / (VOID.fullM - VOID.startM)

/**
 * Temple Run continue: a life lost plays the fall / crash for DOWN_S seconds (no forward motion),
 * then you respawn at that spot (just past a gap) and keep running, flashing for POWER_TICKS.respawn.
 */
export const DOWN_S = { fall: 1.05, crash: 0.85, caught: 0.95 }
/** Logo invincibility: the runner blinks for the last BLINK_S seconds (still invincible). */
export const BLINK_S = 3

/**
 * Dark-energy chase. `threat` 0..1 = how close the smoke is (1 = on your heels).
 * Stumbling on an obstacle sets threat to HIT and slows you for SLOW_S; stumbling again while
 * threat ≥ CATCH_AT = caught (−1 life). Threat bleeds off over RECOVER_S of clean running
 * (faster during the warm-up so first-timers get a longer leash).
 */
export const CHASE = { hit: 0.75, catchAt: 0.3, recoverS: 7, warmRecoverCut: 0.45, slowS: 1.1, slowMul: 0.62 }
export const SLOW_TICKS = Math.round(CHASE.slowS * FR_HZ)

/** Logo pickup: 10 s invincible + speed surge. */
export const BOOST = { mul: 1.5, easeInS: 0.4, easeOutS: 1.0 }

export const POWER_TICKS = {
  /** Fifth Dimension logo — 10 s invincible + 1.5× speed surge */
  hand: 10 * FR_HZ,
  /** no grace after the surge: when the blinking stops you are vulnerable again */
  afterBoost: 0,
  /** grace after losing a life (respawn) */
  respawn: Math.round(2.5 * FR_HZ),
  /** brief i-frames after a stumble so one row can't double-hit */
  stumble: Math.round(0.5 * FR_HZ),
}

/** Bonus metres per 💫 star. score (= distance) = floor(metres run) + stars × STAR_M */
export const STAR_M = 3
/** Streak tiers (display callouts only). */
export const COMBO_STEPS = [0, 10, 30, 60, 100]
export const multFor = (combo: number) => {
  let m = 1
  for (let i = 1; i < COMBO_STEPS.length; i++) if (combo >= COMBO_STEPS[i]) m = i + 1
  return m
}

export const START_CLEAR_M = 110
