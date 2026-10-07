/**
 * Court Vision scoring — CREATIVE_BRIEF.md
 * Dead simple: every make (swish, rim-in or bank) = 3 points.
 * Flow state (5+ makes in a row, ball on fire) = 5 points per make.
 * A miss resets the streak. No bonuses, no multipliers.
 */

export type ShotKind = 'make' | 'swish' | 'miss'

export type ShotResult = {
  kind: ShotKind
  /** Base points before multiplier (make/swish only) */
  base: number
  perfectBonus: number
  bounce5dBonus: number
  multiplier: number
  /** Total added to score this shot */
  points: number
  streakAfter: number
}

export const MAKE_POINTS = 3
export const FLOW_POINTS = 5
export const FLOW_STREAK = 5

export function inFlowState(streak: number): boolean {
  return streak >= FLOW_STREAK
}

/** Points a make is worth at this streak (kept name for callers). */
export function pointsPerMake(streak: number): number {
  return inFlowState(streak) ? FLOW_POINTS : MAKE_POINTS
}

/** @deprecated multipliers removed — always 1. */
export function streakMultiplier(_streak: number): number {
  return 1
}

export function scoreShot(opts: {
  kind: ShotKind
  /** Streak before this shot resolves (makes so far in a row) */
  streakBefore: number
  perfectRelease: boolean
  banked5d: boolean
}): ShotResult {
  if (opts.kind === 'miss') {
    return {
      kind: 'miss',
      base: 0,
      perfectBonus: 0,
      bounce5dBonus: 0,
      multiplier: 1,
      points: 0,
      streakAfter: 0,
    }
  }

  const streakAfter = opts.streakBefore + 1
  const base = pointsPerMake(streakAfter)
  const perfectBonus = 0
  const bounce5dBonus = 0
  const multiplier = 1
  const points = base

  return {
    kind: opts.kind,
    base,
    perfectBonus,
    bounce5dBonus,
    multiplier,
    points,
    streakAfter,
  }
}

export const PB_STORAGE_KEY = 'fd_arcade_court_vision_pb'

export function loadPersonalBest(): number {
  try {
    const raw = localStorage.getItem(PB_STORAGE_KEY)
    if (!raw) return 0
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  } catch {
    return 0
  }
}

export function savePersonalBest(score: number): number {
  const prev = loadPersonalBest()
  const next = Math.max(prev, Math.floor(score))
  try {
    localStorage.setItem(PB_STORAGE_KEY, String(next))
  } catch {
    /* ignore */
  }
  return next
}
