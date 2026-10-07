import { DIM, SIM_DT } from './constants'
import {
  makeBall,
  stepBall,
  type BallState,
  type HoopPose,
  type SimEvent,
  type V3,
} from './physics'

/** Flick → shot mapping (shared by game + headless harness). */
export const FLICK3D = {
  sampleMs: 100,
  minUpPx: 30,
  minSpeed: 0.32,
  /** px/ms that maps to power 1.0 */
  speedRef: 1.05,
  extremeSpeed: 2.05,
  /** metres of lateral miss at the rim per unit tan(flick angle) */
  lateralScale: 1.0,
  /** Aim-assist strength (0..1) and radius (m) */
  assistLat: 0.2,
  assistLatR: 0.15,
  assistDepth: 0.12,
  /** metres of depth miss per unit power error in the make window */
  depthScale: 1.25,
  /** bank: lateral aim error is amplified off the glass */
  bankLatGain: 1.6,
  /** bank: power that lands the ideal arc; off it, the arc drifts (m apex per unit power) */
  bankSweet: 1.3,
  bankApexGain: 0.4,
  /** Power windows */
  weakBelow: 0.85,
  bankAbove: 1.17,
  backRimAbove: 1.46,
  perfectSpeedMin: 0.82,
  perfectSpeedMax: 1.22,
  perfectAngleMax: 0.2,
  /** Wind (m/s² per unit windBias) */
  windAccel: 0.16,
} as const

export type FlickSample = { x: number; y: number; t: number }

export type FlickInput = { speed: number; angle: number }

export type Zone = 'weak' | 'make' | 'bank' | 'backrim' | 'over'

export type ShotPlan = {
  zone: Zone
  power: number
  speed: number
  angle: number
  lateral: number
  perfect: boolean
  v: V3
  w: V3
  target: V3
}

/** Last ~100ms of the gesture → speed (px/ms) + angle from vertical (rad). */
export function analyzeFlickSamples(
  samples: FlickSample[],
  release: FlickSample,
): FlickInput | null {
  const all = [...samples, release]
  if (all.length < 2) return null
  const tEnd = release.t
  const win = all.filter((s) => tEnd - s.t <= FLICK3D.sampleMs)
  const use = win.length >= 2 ? win : all.slice(-2)
  const a = use[0]
  const b = use[use.length - 1]
  const dt = Math.max(8, b.t - a.t)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const up = -dy
  if (up < FLICK3D.minUpPx || dy > 0) return null
  const speed = Math.hypot(dx, dy) / dt
  if (speed < FLICK3D.minSpeed) return null
  const angle = Math.atan2(dx, up)
  if (Math.abs(angle) > Math.PI * 0.48) return null
  return { speed, angle }
}

/** Ballistic launch from p0 through target T with apex `apexY` (no drag). */
export function ballistic(p0: V3, T: V3, apexY: number): V3 {
  const g = DIM.gravity
  const ay = Math.max(apexY, p0.y + 0.05, T.y + 0.05)
  const vy = Math.sqrt(2 * g * (ay - p0.y))
  const tUp = vy / g
  const tDown = Math.sqrt((2 * (ay - T.y)) / g)
  const tt = tUp + tDown
  return { x: (T.x - p0.x) / tt, y: vy, z: (T.z - p0.z) / tt }
}

function assist(v: number, strength: number, radius: number) {
  return v * (1 - strength * Math.exp(-((v / radius) ** 2)))
}

export type ShotContext = {
  ball: V3
  hoop: HoopPose
  windBias: number
}

/**
 * Flick → launch velocity + spin. Physics decides the outcome; the planner
 * only chooses the intended target (with a gentle assist toward the rim).
 */
export function planShot(input: FlickInput, ctx: ShotContext): ShotPlan {
  const { speed, angle } = input
  const power = speed / FLICK3D.speedRef
  const rimC: V3 = { x: ctx.hoop.x, y: DIM.rimY + ctx.hoop.y, z: DIM.rimZ }
  let lateral = Math.tan(angle) * FLICK3D.lateralScale
  lateral = assist(lateral, FLICK3D.assistLat, FLICK3D.assistLatR)

  let zone: Zone
  if (speed >= FLICK3D.extremeSpeed) zone = 'over'
  else if (power < FLICK3D.weakBelow) zone = 'weak'
  else if (power <= FLICK3D.bankAbove) zone = 'make'
  else if (power <= FLICK3D.backRimAbove) zone = 'bank'
  else zone = 'backrim'

  const p0 = ctx.ball
  let target: V3
  let v: V3

  if (zone === 'over') {
    target = { x: rimC.x + lateral * 0.5, y: 4.55 + ctx.hoop.y, z: -0.55 }
    v = ballistic(p0, target, 6.1 + (power - 1.95) * 0.8)
  } else if (zone === 'weak') {
    // Falls short or catches the front of the rim
    const dz = 0.15 + (FLICK3D.weakBelow - power) * 1.55
    target = { x: rimC.x + lateral, y: rimC.y, z: rimC.z + dz }
    v = ballistic(p0, target, rimC.y + 0.55 + (power - 0.6) * 0.6)
  } else if (zone === 'make') {
    let dz = (1 - power) * FLICK3D.depthScale
    dz = assist(dz, FLICK3D.assistDepth, 0.1)
    target = { x: rimC.x + lateral, y: rimC.y, z: rimC.z + dz }
    v = ballistic(p0, target, rimC.y + 0.95 + (power - 1) * 1.4)
  } else if (zone === 'bank') {
    const hc = 0.24 + (power - FLICK3D.bankAbove) * 1.05
    const plan = planBank(p0, ctx.hoop, rimC.x + lateral * FLICK3D.bankLatGain, hc, (power - FLICK3D.bankSweet) * FLICK3D.bankApexGain)
    target = plan.target
    v = plan.v
  } else {
    const dz = -(0.2 + (power - FLICK3D.backRimAbove) * 0.4)
    target = { x: rimC.x + lateral, y: rimC.y, z: rimC.z + dz }
    v = ballistic(p0, target, rimC.y + 1.25)
  }

  // Backspin (~2.5–3.5 rev/s) + a touch of sidespin from the flick angle
  const spinRev = 2.4 + Math.min(power, 1.6) * 0.8
  const w: V3 = { x: spinRev * Math.PI * 2, y: -Math.sin(angle) * 6, z: 0 }

  const perfect =
    zone === 'make' &&
    speed >= FLICK3D.perfectSpeedMin &&
    speed <= FLICK3D.perfectSpeedMax &&
    Math.abs(angle) <= FLICK3D.perfectAngleMax

  return { zone, power, speed, angle, lateral, perfect, v, w, target }
}

/**
 * Bank planner: search flight apex so the ball kisses the glass `hc` metres
 * above the rim and the rebound drops through. Uses the real stepper.
 */
function planBank(p0: V3, hoop: HoopPose, x: number, hc: number, apexErr = 0) {
  const contact: V3 = {
    x,
    y: DIM.rimY + hoop.y + hc,
    z: DIM.ballR + 0.002,
  }
  let best = { score: Infinity, v: ballistic(p0, contact, contact.y + 0.6), apex: 0 }
  for (let i = 0; i < 28; i++) {
    const apex = contact.y + 0.05 + i * 0.05
    const v = ballistic(p0, contact, apex)
    const b = makeBall(p0, v, { x: 15, y: 0, z: 0 })
    const ev: SimEvent[] = []
    let bestD = Infinity
    let hitBoard = false
    for (let s = 0; s < 900; s++) {
      stepBall(b, hoop, ev)
      if (b.boardHits > 0) hitBoard = true
      if (hitBoard && b.v.y < 0 && Math.abs(b.p.y - (DIM.rimY + hoop.y)) < 0.03) {
        const d = Math.hypot(b.p.x - hoop.x, b.p.z - DIM.rimZ)
        if (d < bestD) bestD = d
      }
      if (b.scored || b.p.y < 1) break
    }
    const sc = b.scored && b.rimHits === 0 ? -1 : b.scored ? bestD * 0.5 : bestD + (hitBoard ? 0 : 5)
    if (sc < best.score) best = { score: sc, v, apex }
  }
  const v = apexErr ? ballistic(p0, contact, best.apex + apexErr) : best.v
  return { v, target: contact }
}

export type ShotOutcome = {
  made: boolean
  kind: 'swish' | 'rim_in' | 'bank' | 'miss'
  missKind: 'short' | 'front_rim' | 'rim_out' | 'board_out' | 'wide' | 'over' | null
  penetration: number
  boardHits: number
  rimHits: number
  overBoard: boolean
  steps: number
}

export function classify(b: BallState, maxDistFromRim: number): ShotOutcome {
  const made = b.scored
  let kind: ShotOutcome['kind'] = 'miss'
  if (made) kind = b.bankedBeforeScore ? 'bank' : b.rimBeforeScore ? 'rim_in' : 'swish'
  let missKind: ShotOutcome['missKind'] = null
  if (!made) {
    if (b.overBoard) missKind = 'over'
    else if (b.boardHits > 0) missKind = 'board_out'
    else if (b.rimHits > 0) missKind = b.p.z > DIM.rimZ + 0.15 ? 'front_rim' : 'rim_out'
    else if (maxDistFromRim > 0.36) missKind = 'wide'
    else missKind = 'short'
  }
  return {
    made,
    kind,
    missKind,
    penetration: b.penetration,
    boardHits: b.boardHits,
    rimHits: b.rimHits,
    overBoard: b.overBoard,
    steps: Math.round(b.t / SIM_DT),
  }
}

/** Airborne cap (sim seconds); a ball still working the rim gets a hard cap. */
export const SHOT_CAP_S = 2.0
export const SHOT_CAP_RIM_S = 3.0

/**
 * True once the shot's fate is certain (make confirmed, or it can no longer
 * drop). Misses are decided as early as possible; rattles/roll-arounds that
 * could still fall play out.
 */
export function shotResolved(b: BallState, hoop: HoopPose = { x: 0, y: 0 }): boolean {
  if (b.scored) return true
  if (b.overBoard) return true
  if (b.floorHits > 0) return true
  const rimY = DIM.rimY + hoop.y
  const dx = b.p.x - hoop.x
  const dz = b.p.z - DIM.rimZ
  const radial = Math.hypot(dx, dz)
  // Left the rim area entirely (wide, long, behind the board)
  if (!b.through && (Math.abs(dx) > 1.4 || b.p.z < DIM.baselineZ - 0.4 || (b.v.y < 0 && dz > 2.2))) return true
  // Falling below the rim plane outside the cylinder: can never drop in.
  // (Also covers short balls whose apex never reaches the rim.)
  if (!b.through && b.v.y < 0 && b.p.y < rimY - DIM.ballR - DIM.rimTubeR - 0.01 && radial > DIM.rimInnerR - 0.01) {
    return true
  }
  const onRim = Math.abs(b.p.y - rimY) < 0.25 && radial < DIM.rimInnerR + DIM.ballR + 0.08
  if (b.t > (onRim ? SHOT_CAP_RIM_S : SHOT_CAP_S)) return true
  return false
}

/** Headless: run a flick to resolution. */
export function simulateShot(
  input: FlickInput,
  ctx: ShotContext,
  hoopAt?: (t: number) => HoopPose,
  opts: { legacyResolve?: boolean } = {},
): { plan: ShotPlan; outcome: ShotOutcome } {
  const plan = planShot(input, ctx)
  const b = makeBall(ctx.ball, plan.v, plan.w, ctx.windBias * FLICK3D.windAccel)
  const ev: SimEvent[] = []
  let minRimDist = Infinity
  for (let i = 0; i < 2400; i++) {
    const pose = hoopAt ? hoopAt(b.t) : ctx.hoop
    stepBall(b, pose, ev)
    if (Math.abs(b.p.y - (DIM.rimY + pose.y)) < 0.25) {
      const d = Math.hypot(b.p.x - pose.x, b.p.z - DIM.rimZ)
      if (d < minRimDist) minRimDist = d
    }
    if (opts.legacyResolve ? b.scored || b.floorHits > 0 || b.t > 5 || b.p.z < DIM.baselineZ - 1.5 : shotResolved(b, pose)) break
  }
  return { plan, outcome: classify(b, minRimDist) }
}
