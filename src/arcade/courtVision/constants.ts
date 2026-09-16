/** Court Vision Endless — shared palette + physics knobs */
export const PALETTE = {
  void: '#0A0A0C',
  ink: '#1A1028',
  signal: '#FF5A1F',
  soft: '#F2F0EA',
  mint: '#7DFFC3',
  muted: '#6B6B73',
} as const

export type Vec = { x: number; y: number }

export type BallState = {
  pos: Vec
  vel: Vec
  radius: number
  spinning: number
  nudged: boolean
  hitRim: boolean
  hitBackboard: boolean
  hitLogoZone: boolean
  scored: boolean
  throughNet: boolean
}

export type HudFlash = { mint: number; shake: number }

export const GRAVITY = 0.22
export const MAX_PULL = 120
export const MIN_POWER = 0.28
export const PERFECT_POWER_MIN = 0.52
export const PERFECT_POWER_MAX = 0.78
export const PERFECT_AIM_DEG = 10
export const NUDGE_IMPULSE = 2.4

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

export function dist(a: Vec, b: Vec) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function layout(w: number, h: number) {
  const hoopY = h * 0.22
  const rimCx = w * 0.5
  const rimCy = hoopY + h * 0.06
  const rimR = Math.min(w, h) * 0.09
  const backboard = {
    x: rimCx - rimR * 1.35,
    y: hoopY - h * 0.02,
    w: rimR * 2.7,
    h: rimR * 1.55,
  }
  const logoZone = {
    x: rimCx - rimR * 0.45,
    y: backboard.y + backboard.h * 0.28,
    w: rimR * 0.9,
    h: rimR * 0.7,
  }
  const rest: Vec = { x: w * 0.5, y: h * 0.82 }
  const ballR = Math.min(w, h) * 0.045
  return { hoopY, rimCx, rimCy, rimR, backboard, logoZone, rest, ballR }
}

export type Layout = ReturnType<typeof layout>
