export type Dir = 0 | 1 | 2 | 3 // N E S W
export const DIRS: Dir[] = [0, 1, 2, 3]
export const DX = [0, 1, 0, -1] as const
export const DY = [-1, 0, 1, 0] as const
export const OPP: Dir[] = [2, 3, 0, 1]

export type Cell = 0 | 1 // 0 path, 1 wall

export type GhostMode = 'scatter' | 'chase' | 'frightened' | 'eaten'

/** Void drone (mini UFO) — Pac chase AI, Glide-family look. */
export type Ghost = {
  id: number
  x: number
  y: number
  dir: Dir
  mode: GhostMode
  color: string
  homeX: number
  homeY: number
  scatterX: number
  scatterY: number
  /** trail samples for chrome afterimage */
  trail: { x: number; y: number }[]
}

export type GamePhase = 'howto' | 'playing' | 'dying' | 'ended'

export type PickupFx = {
  x: number
  y: number
  t: number
  kind: 'star' | 'tag' | 'power'
  pts?: number
}

export type EndStats = {
  score: number
  stars: number
  tags: number
  livedS: number
  timeBonus: number
  shifts: number
}

export const STAR_PTS = 10
export const TAG_BASE = 200
export const POWER_S = 7.5
export const SHIFT_EVERY_S = 20
export const SHIFT_WARN_S = 2.6
/** Soft morph — walls slide/reform into the next shape. */
export const MORPH_S = 1.45
export const START_LIVES = 3
/** cells / s — player slightly faster than chase drones */
export const PLAYER_SPEED = 6.1
export const GHOST_SPEED = 5.35
export const FRIGHT_SPEED = 3.2
export const EATEN_SPEED = 10
/** Longer commit window so iPhone swipes don't miss the junction. */
export const INPUT_BUFFER_S = 0.45
/** center snap / turn window in cells */
export const TURN_SNAP = 0.22
/** How early before tile center a queued turn may fire. */
export const TURN_EARLY = 0.55
export const PB_KEY = 'fd_street_shift_pb'

/** Classic-ish phase table (seconds): scatter, chase, scatter, chase, scatter, chase forever */
export const MODE_PHASES: { mode: 'scatter' | 'chase'; dur: number }[] = [
  { mode: 'scatter', dur: 7 },
  { mode: 'chase', dur: 20 },
  { mode: 'scatter', dur: 7 },
  { mode: 'chase', dur: 20 },
  { mode: 'scatter', dur: 5 },
  { mode: 'chase', dur: 1e9 },
]
