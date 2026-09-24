/** Tunable flick → shot mapping (Messenger / Pop-A-Shot style). */
export const FLICK = {
  /** Ball rest Y as fraction of screen height */
  homeYFrac: 0.58,
  /** Idle bob amplitude px */
  bobAmp: 3.5,
  /** Idle bob period ms */
  bobPeriod: 1400,
  /** Accept pointer if within this of ball, or anywhere in lower fraction */
  hitRadius: 90,
  lowerTouchFrac: 0.72,
  /** Use last N ms of gesture for velocity */
  sampleMs: 100,
  /** Ignore flicks that aren't clearly upward */
  minUpPx: 30,
  minSpeed: 0.32, // px/ms
  maxDownRatio: 0.35, // |dx| can dominate but net must be up
  /** Map flick angle → lateral miss at rim */
  lateralScale: 110,
  maxLateral: 100,
  /** Speed → power (1.0 = rim height sweet spot) */
  speedRef: 1.05, // px/ms ≈ medium flick
  powerMin: 0.42,
  powerMax: 1.55,
  /** Vertical miss from power error (px at rim plane) */
  powerYScale: 105,
  /** Soft magnetism toward rim when within this px of predicted landing */
  assistRadius: 14,
  assistPull: 0.38,
  /** Perfect-release window */
  perfectSpeedMin: 0.78,
  perfectSpeedMax: 1.28,
  perfectAngleMax: 0.22, // radians from vertical (~12.5°)
  /** Flight */
  durationBase: 620,
  durationPower: 160,
  peakBase: 70,
  peakPower: 55,
  /** Respawn */
  respawnMs: 400,
  ballStartSize: 56,
  ballRimSize: 26,
} as const

export type FlickSample = { x: number; y: number; t: number }

export type FlickShot = {
  targetX: number
  targetY: number
  power: number
  peak: number
  duration: number
  perfect: boolean
  speed: number
  angle: number
  rawTargetX: number
  rawTargetY: number
}

export function analyzeFlick(
  samples: FlickSample[],
  release: { x: number; y: number; t: number },
  hoop: { x: number; y: number },
  windBias: number,
): FlickShot | null {
  const all = [...samples, release]
  if (all.length < 2) return null

  const tEnd = release.t
  const window = all.filter((s) => tEnd - s.t <= FLICK.sampleMs)
  const use = window.length >= 2 ? window : all.slice(-2)
  const a = use[0]
  const b = use[use.length - 1]
  const dt = Math.max(8, b.t - a.t)
  const dx = b.x - a.x
  const dy = b.y - a.y // screen: up is negative
  const up = -dy
  if (up < FLICK.minUpPx) return null
  if (dy > 0) return null // net downward

  const dist = Math.hypot(dx, dy)
  const speed = dist / dt
  if (speed < FLICK.minSpeed) return null

  // Angle from vertical (0 = straight up); positive = aim right
  const angle = Math.atan2(dx, up)
  if (Math.abs(angle) > Math.PI * 0.48) return null

  const power = PhaserClamp(
    speed / FLICK.speedRef,
    FLICK.powerMin,
    FLICK.powerMax,
  )

  // Lateral from angle; wind from challenge seed
  let lateral = Math.tan(angle) * FLICK.lateralScale
  lateral = PhaserClamp(lateral, -FLICK.maxLateral, FLICK.maxLateral)
  lateral += windBias * 12

  // Power 1 → rim Y; <1 short (below); >1 long (above / backboard)
  const powerErr = power - 1
  let rawTargetX = hoop.x + lateral
  let rawTargetY = hoop.y - powerErr * FLICK.powerYScale

  // Aim assist
  let targetX = rawTargetX
  let targetY = rawTargetY
  const err = Math.hypot(rawTargetX - hoop.x, rawTargetY - hoop.y)
  if (err < FLICK.assistRadius) {
    const pull = FLICK.assistPull * (1 - err / FLICK.assistRadius)
    targetX = rawTargetX + (hoop.x - rawTargetX) * pull
    targetY = rawTargetY + (hoop.y - rawTargetY) * pull
  }

  const perfect =
    speed >= FLICK.perfectSpeedMin &&
    speed <= FLICK.perfectSpeedMax &&
    Math.abs(angle) <= FLICK.perfectAngleMax

  return {
    targetX,
    targetY,
    power,
    peak: FLICK.peakBase + power * FLICK.peakPower,
    duration: FLICK.durationBase + power * FLICK.durationPower,
    perfect,
    speed,
    angle,
    rawTargetX,
    rawTargetY,
  }
}

function PhaserClamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}
