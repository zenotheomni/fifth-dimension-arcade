import { COURT_BG } from './bgLayout'

/** Tunable flick → shot mapping with rim/board-centric outcomes. */
export const FLICK = {
  homeYFrac: 0.78,
  bobAmp: 3.5,
  bobPeriod: 1400,
  hitRadius: 90,
  lowerTouchFrac: 0.82,
  sampleMs: 100,
  minUpPx: 30,
  minSpeed: 0.32,
  /** Map flick angle → lateral at rim (kept tight so misses stay near hoop) */
  lateralScale: 80,
  maxLateral: 58,
  /** Speed → power (1.0 = rim sweet spot) */
  speedRef: 1.05,
  powerMin: 0.55,
  /** Cap for normal play — banks, not over the board */
  powerMax: 1.48,
  /** Only flicks at/above this speed may sail over the backboard */
  extremeSpeed: 2.05,
  /** Soft magnetism toward rim */
  assistRadius: 22,
  assistPull: 0.42,
  perfectSpeedMin: 0.82,
  perfectSpeedMax: 1.22,
  perfectAngleMax: 0.2,
  durationBase: 580,
  durationPower: 140,
  peakBase: 55,
  peakPower: 42,
  bounceDuration: 280,
  /** Make feel: brief hit-pause before sink continues */
  hitPauseMs: 50,
  /** Sink through net duration */
  sinkDuration: 320,
  /** Post-net floor fall */
  floorFallDuration: 280,
  respawnMs: 400,
  ballStartSize: 112,
  ballRimSize: 56,
  /** Board half-width in px at game resolution (approx painted glass) */
  boardHalfW: 146,
  /** How far above rim the glass starts for collision (px) */
  boardClearAboveRim: 8,
  /** Front-rim short offset below hoop (px, screen +Y) */
  frontRimShort: 26,
  /** Bank contact sits on glass this far above rim */
  bankContactAboveRim: 42,
  /** Near-rim finish radius for harness */
  nearRimRadius: 70,
} as const

export type FlickSample = { x: number; y: number; t: number }

export type ShotOutcome =
  | 'swish'
  | 'rim'
  | 'front_clank'
  | 'bank'
  | 'wide'
  | 'over'

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
  outcome: ShotOutcome
  /** First contact point (board/rim) when applicable */
  contactX: number
  contactY: number
  /** Final settle / score-eval point */
  finalX: number
  finalY: number
  allowOver: boolean
}

export function boardBounds(hoopX: number, hoopY: number, H: number) {
  const top = H * COURT_BG.backboardTop
  const bottom = hoopY - FLICK.boardClearAboveRim
  return {
    left: hoopX - FLICK.boardHalfW,
    right: hoopX + FLICK.boardHalfW,
    top,
    bottom,
    /** Y of glass face used for bank contact (between top and bottom) */
    contactY: Math.min(
      bottom - 4,
      Math.max(top + 18, hoopY - FLICK.bankContactAboveRim),
    ),
  }
}

export function analyzeFlick(
  samples: FlickSample[],
  release: { x: number; y: number; t: number },
  hoop: { x: number; y: number },
  windBias: number,
  screenH = 844,
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
  const dy = b.y - a.y
  const up = -dy
  if (up < FLICK.minUpPx) return null
  if (dy > 0) return null

  const dist = Math.hypot(dx, dy)
  const speed = dist / dt
  if (speed < FLICK.minSpeed) return null

  const angle = Math.atan2(dx, up)
  if (Math.abs(angle) > Math.PI * 0.48) return null

  const extreme = speed >= FLICK.extremeSpeed
  const power = clamp(
    speed / FLICK.speedRef,
    FLICK.powerMin,
    extreme ? 1.85 : FLICK.powerMax,
  )

  let lateral = Math.tan(angle) * FLICK.lateralScale
  lateral = clamp(lateral, -FLICK.maxLateral, FLICK.maxLateral)
  lateral += windBias * 10

  const board = boardBounds(hoop.x, hoop.y, screenH)
  const wide = Math.abs(lateral) > 22

  let outcome: ShotOutcome
  if (extreme && Math.abs(lateral) < 40) {
    outcome = 'over'
  } else if (wide) {
    outcome = 'wide'
  } else if (power < 0.84) {
    outcome = 'front_clank'
  } else if (power > 1.16) {
    outcome = 'bank'
  } else if (power >= 0.9 && power <= 1.1 && Math.abs(angle) < 0.12 && Math.abs(lateral) < 16) {
    outcome = 'swish'
  } else if (Math.abs(lateral) > 18) {
    outcome = 'wide'
  } else {
    outcome = 'rim'
  }

  // Aim assist toward hoop center for near-rim intents
  let aimX = hoop.x + lateral
  let aimY = hoop.y
  if (outcome === 'front_clank') {
    aimY = hoop.y + FLICK.frontRimShort
  } else if (outcome === 'bank') {
    aimX = clamp(aimX, board.left + 8, board.right - 8)
    aimY = board.contactY
  } else if (outcome === 'over') {
    aimY = board.top - 28
    aimX = hoop.x + lateral * 0.35
  } else if (outcome === 'wide') {
    const side = lateral >= 0 ? 1 : -1
    aimX = hoop.x + side * (FLICK.boardHalfW + 6)
    aimY = hoop.y - 4
  }

  if (outcome === 'swish' || outcome === 'rim') {
    const err = Math.hypot(aimX - hoop.x, aimY - hoop.y)
    if (err < FLICK.assistRadius) {
      const pull = FLICK.assistPull * (1 - err / FLICK.assistRadius)
      aimX += (hoop.x - aimX) * pull
      aimY += (hoop.y - aimY) * pull
    }
  }

  // Final points after contact
  let finalX = aimX
  let finalY = aimY
  let contactX = aimX
  let contactY = aimY

  if (outcome === 'bank') {
    contactX = aimX
    contactY = board.contactY
    // Bank into rim if reasonably centered; else bounce out
    if (Math.abs(lateral) < 14 && power <= 1.42) {
      finalX = hoop.x + lateral * 0.2
      finalY = hoop.y
    } else {
      finalX = hoop.x + (lateral >= 0 ? 1 : -1) * (28 + Math.abs(lateral) * 0.3)
      finalY = hoop.y + 36
    }
  } else if (outcome === 'front_clank') {
    contactX = hoop.x + lateral * 0.5
    contactY = hoop.y + 6
    finalX = contactX + (lateral >= 0 ? 12 : -12)
    finalY = hoop.y + 48
  } else if (outcome === 'wide') {
    contactX = aimX
    contactY = aimY
    finalX = aimX + (lateral >= 0 ? 20 : -20)
    finalY = hoop.y + 40
  } else if (outcome === 'over') {
    contactX = aimX
    contactY = board.top - 8
    finalX = aimX + lateral * 0.2
    finalY = board.top - 40
  } else {
    // swish / rim — finish at hoop
    contactX = aimX
    contactY = aimY
    finalX = hoop.x + (aimX - hoop.x) * 0.15
    finalY = hoop.y
  }

  const perfect =
    (outcome === 'swish' || outcome === 'rim') &&
    speed >= FLICK.perfectSpeedMin &&
    speed <= FLICK.perfectSpeedMax &&
    Math.abs(angle) <= FLICK.perfectAngleMax

  return {
    targetX: outcome === 'bank' || outcome === 'front_clank' ? contactX : finalX,
    targetY: outcome === 'bank' || outcome === 'front_clank' ? contactY : finalY,
    power,
    peak: FLICK.peakBase + Math.min(power, 1.35) * FLICK.peakPower,
    duration: FLICK.durationBase + Math.min(power, 1.35) * FLICK.durationPower,
    perfect,
    speed,
    angle,
    rawTargetX: hoop.x + lateral,
    rawTargetY: aimY,
    outcome,
    contactX,
    contactY,
    finalX,
    finalY,
    allowOver: outcome === 'over',
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}
