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
export const SPEED = { v0: 21.6, vmax: 48.6, k: 2200 } // v22: −10%
/**
 * v17 speed ramp: clear steps, one every RAMP.stepS seconds of running (+inc m/s each), up to a hard
 * cap RAMP.vMax (≈ the old ×1.5 invincibility surge: fast, not crazy). Step k lasts stepS·v_k metres
 * and blends in over RAMP.blendM. After the cap, difficulty keeps rising through obstacle density
 * only (pressureAt). Pure function of distance (deterministic).
 */
export const RAMP = { v0: 28.8, inc: 4.5, stepS: 18, blendM: 45, vMax: 50.4 } // v22: all speeds −10% (boost stays ×BOOST.mul)
/** last step index (the one that reaches vMax) */
export const RAMP_KMAX = Math.ceil((RAMP.vMax - RAMP.v0) / RAMP.inc)
const vStep = (k: number) => Math.min(RAMP.vMax, RAMP.v0 + RAMP.inc * k)
const STEP_AT: number[] = [0]
for (let k = 0; k < RAMP_KMAX; k++) STEP_AT.push(STEP_AT[k] + RAMP.stepS * vStep(k))
/** distance where top speed is reached */
export const CAP_S = STEP_AT[RAMP_KMAX]
/** index of the speed step at path distance s (0 = start, RAMP_KMAX = top speed) */
export function stepAt(s: number): number {
  let lo = 0
  let hi = STEP_AT.length - 1
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1
    if (STEP_AT[m] <= s) lo = m
    else hi = m - 1
  }
  return lo
}
export const speedAt = (s: number) => {
  const k = stepAt(Math.max(0, s))
  const into = Math.max(0, s) - STEP_AT[k]
  const b = k === 0 ? 1 : Math.min(1, into / RAMP.blendM)
  const e = b * b * (3 - 2 * b)
  return k === 0 ? RAMP.v0 : vStep(k - 1) + (vStep(k) - vStep(k - 1)) * e
}
/** post-cap pressure 0..PRESSURE.max: shrinks the gap between obstacle waves after top speed */
export const PRESSURE = { max: 0.9, overM: 2000 } // v28: late tightening back to the v26 curve; min spacing still holds early
export const pressureAt = (s: number) => (s <= CAP_S ? 0 : Math.min(PRESSURE.max, (PRESSURE.max * (s - CAP_S)) / PRESSURE.overM))
/**
 * Warm-up distance (≈ first 40 s, easing out linearly): sparse single-car rows, slower oncoming
 * traffic, wider spacing.
 * warmAt = 1 at the start line → 0 at WARM_M (linear; exact IEEE ops only).
 */
export const WARM_M = 700
export const warmAt = (s: number) => (s >= WARM_M ? 0 : s <= 0 ? 1 : 1 - s / WARM_M)
/** Difficulty 0..1 (pattern mix + spacing). Held at 0 through the first LEVEL_OFFSET metres. */
export const DIFF_K = 330
export const LEVEL_OFFSET = 150
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
  /** crashed satellite lying across a lane (switch lanes); hits cost a life like a boulder */
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
  /** v25: a sideways swipe is a TURN only this close before the corner square: ≈0.32 s of running,
   *  clamped to 8–14 m (+ the square's half). Outside it — or toward a way the corner doesn't go —
   *  a swipe is always a lane change. */
  turnWinS: 0.32,
  turnWinMin: 8,
  turnWinMax: 14,
  /** v22: after running off a corner, respawn this far before the corner square (no auto-turn) */
  backM: 40,
  /** v22: coyote time at the lip of a corner square before he goes over (s) */
  coyoteS: 0.05,
  armS: 1.3,
  /** extra time past the far edge of the corner square you may still turn (+ more during the warm-up) */
  lateS: 0.28,
  lateWarmS: 0.15,
  segMin: 170,
  segMax: 260,
  segMinHard: 70,
  segMaxHard: 140,
  tP: 0.22,
  preS: 1.4,
  postS: 1.5,
  postT: 70,
}
/** Path half width the runner can occupy — lane centres are ±LANE_W. */
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
/** v19: a real boost — ×1.75 speed (may pass RAMP.vMax, up to vMax × mul, during the power-up only),
 *  2× distance metres and 2× stars; eases in, and back down to normal speed over its last easeOutS */
export const BOOST = { mul: 1.75, easeInS: 0.6, easeOutS: 1.8, distX: 2, starX: 2 }

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
export const STAR_M = 5
/** Streak bonus: every STREAK_EVERY stars in a row pays STREAK_M × (streak / STREAK_EVERY) bonus metres. */
export const STREAK_EVERY = 10
export const STREAK_M = 10
/** Streak tiers (display callouts only). */
export const COMBO_STEPS = [0, 10, 30, 60, 100]
export const multFor = (combo: number) => {
  let m = 1
  for (let i = 1; i < COMBO_STEPS.length; i++) if (combo >= COMBO_STEPS[i]) m = i + 1
  return m
}

export const START_CLEAR_M = 110

/** v25: distance (m, to the corner centre) inside which a matching sideways swipe is a turn */
export const turnWindowM = (v: number) => CORNER.half + Math.min(CORNER.turnWinMax, Math.max(CORNER.turnWinMin, v * CORNER.turnWinS))
