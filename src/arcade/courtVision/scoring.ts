/**
 * Court Vision scoring — CREATIVE_BRIEF.md
 * Make=2, Swish=3; streak x3/x5/x10 → 1.5x/2x/3x;
 * Perfect release=+1; Bank off backboard logo=+2 “5D bounce”;
 * Miss resets multiplier.
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

export function streakMultiplier(streak: number): number {
  if (streak >= 10) return 3
  if (streak >= 5) return 2
  if (streak >= 3) return 1.5
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
  const base = opts.kind === 'swish' ? 3 : 2
  const perfectBonus = opts.perfectRelease ? 1 : 0
  const bounce5dBonus = opts.banked5d ? 2 : 0
  const multiplier = streakMultiplier(streakAfter)
  const raw = base + perfectBonus + bounce5dBonus
  const points = Math.round(raw * multiplier)

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
