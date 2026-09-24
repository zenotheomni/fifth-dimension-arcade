import {
  PERFECT_AIM_DEG,
  PERFECT_POWER_MAX,
  PERFECT_POWER_MIN,
} from '../courtVision/constants'

export const COURT = {
  ballRest: { x: 0, y: 1.05, z: 2.55 },
  rim: { x: 0, y: 3.05, z: -3.0 },
  rimRadius: 0.36,
  ballRadius: 0.16,
  backboard: { x: 0, y: 3.35, z: -3.32, w: 1.2, h: 0.8, d: 0.05 },
  logoZone: { yMin: 3.15, yMax: 3.45, xAbs: 0.25 },
  gravity: -12.5,
  maxPull: 1.55,
  minPower: 0.28,
  powerScale: 12.8,
} as const

export function isPerfectRelease(power01: number, aimDeg: number): boolean {
  return (
    power01 >= PERFECT_POWER_MIN &&
    power01 <= PERFECT_POWER_MAX &&
    Math.abs(aimDeg) <= PERFECT_AIM_DEG
  )
}

export function pullToVelocity(pull: {
  x: number
  y: number
  z: number
}): { vx: number; vy: number; vz: number; power01: number; aimDeg: number } {
  const len = Math.hypot(pull.x, pull.y, pull.z)
  const clamped = Math.min(Math.max(len, 0.18), COURT.maxPull)
  const power01 = Math.max(COURT.minPower, clamped / COURT.maxPull)
  const aimDeg =
    (Math.atan2(-pull.x, Math.max(0.01, pull.z + Math.max(0, -pull.y))) * 180) /
    Math.PI

  // Flight time — sweet band 0.4–0.85 lands near rim
  const t = 0.78 + (power01 - 0.55) * 0.35
  const lateral = (-pull.x / COURT.maxPull) * 0.55
  // Soft pulls short, hard pulls long — but compressed so mid-pulls score
  const depthErr = (power01 - 0.58) * 0.55
  const targetX = COURT.rim.x + lateral
  const targetY = COURT.rim.y + 0.05
  const targetZ = COURT.rim.z + depthErr

  const g = Math.abs(COURT.gravity)
  const vx = (targetX - COURT.ballRest.x) / t
  const vz = (targetZ - COURT.ballRest.z) / t
  const vy = (targetY - COURT.ballRest.y) / t + 0.5 * g * t

  return { vx, vy, vz, power01, aimDeg }
}
