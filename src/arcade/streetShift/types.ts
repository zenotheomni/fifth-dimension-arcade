export type Dir = 0 | 1 | 2 | 3 // N E S W
export const DIRS: Dir[] = [0, 1, 2, 3]
export const DX = [0, 1, 0, -1] as const
export const DY = [-1, 0, 1, 0] as const
export const OPP: Dir[] = [2, 3, 0, 1]

export type Cell = 0 | 1 // 0 path, 1 wall

export type GhostMode = 'scatter' | 'chase' | 'frightened' | 'eaten'

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
}

export type GamePhase = 'howto' | 'playing' | 'dying' | 'ended'

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
export const POWER_S = 6
export const SHIFT_EVERY_S = 10
export const SHIFT_WARN_S = 1
export const START_LIVES = 3
export const PLAYER_SPEED = 5.2 // cells / s
export const GHOST_SPEED = 4.4
export const FRIGHT_SPEED = 2.8
export const EATEN_SPEED = 9
export const PB_KEY = 'fd_street_shift_pb'
