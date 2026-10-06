import { BOARD_CY, BOARD_TOP, DIM, MATERIAL, RIM_MAJOR, SIM_DT } from './constants'

export type V3 = { x: number; y: number; z: number }
export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z })

export type ContactKind = 'rim' | 'board' | 'floor' | 'bracket' | 'pole'

export type SimEvent = {
  kind: ContactKind | 'score' | 'over'
  t: number
  /** Normal impact speed (m/s) for sfx / net jiggle */
  impact: number
  p: V3
}

/** Hoop pose offsets (seeded sway) applied to the whole hoop assembly. */
export type HoopPose = { x: number; y: number }

export type BallState = {
  p: V3
  v: V3
  /** Angular velocity (rad/s) */
  w: V3
  t: number
  rimHits: number
  boardHits: number
  floorHits: number
  /** Board contact happened before the ball went through */
  bankedBeforeScore: boolean
  rimBeforeScore: boolean
  /** Ball centre crossed the rim plane inside the ring, descending */
  through: boolean
  scored: boolean
  scoreT: number
  overBoard: boolean
  penetration: number
  maxY: number
  /** Lateral wind acceleration (m/s²) */
  windAx: number
}

export function makeBall(p: V3, v: V3, w: V3, windAx = 0): BallState {
  return {
    p: { ...p },
    v: { ...v },
    w: { ...w },
    t: 0,
    rimHits: 0,
    boardHits: 0,
    floorHits: 0,
    bankedBeforeScore: false,
    rimBeforeScore: false,
    through: false,
    scored: false,
    scoreT: -1,
    overBoard: false,
    penetration: 0,
    maxY: p.y,
    windAx,
  }
}

const R = DIM.ballR
/** Hollow sphere: I = 2/3 m r² → tangential impulse factor 1 / (1 + r²m/I) */
const TAN_K = 1 / (1 + 1.5)

/**
 * Resolve a contact with outward normal n (unit) at penetration depth `pen`.
 * Returns normal impact speed.
 */
function resolve(
  b: BallState,
  nx: number,
  ny: number,
  nz: number,
  pen: number,
  e: number,
  mu: number,
): number {
  // Positional correction — never leave the ball inside a collider
  b.p.x += nx * pen
  b.p.y += ny * pen
  b.p.z += nz * pen
  const vn = b.v.x * nx + b.v.y * ny + b.v.z * nz
  if (vn >= 0) return 0
  // Contact-point velocity: v + w × (-R n)
  const rx = -R * nx
  const ry = -R * ny
  const rz = -R * nz
  const cvx = b.v.x + (b.w.y * rz - b.w.z * ry)
  const cvy = b.v.y + (b.w.z * rx - b.w.x * rz)
  const cvz = b.v.z + (b.w.x * ry - b.w.y * rx)
  const cvn = cvx * nx + cvy * ny + cvz * nz
  let tx = cvx - cvn * nx
  let ty = cvy - cvn * ny
  let tz = cvz - cvn * nz
  const vt = Math.hypot(tx, ty, tz)
  // Small impacts don't bounce (resting contact)
  const eEff = -vn < 0.35 ? 0 : e
  const jn = -(1 + eEff) * vn
  b.v.x += jn * nx
  b.v.y += jn * ny
  b.v.z += jn * nz
  if (vt > 1e-6) {
    tx /= vt
    ty /= vt
    tz /= vt
    const jt = Math.min(mu * jn, vt * TAN_K)
    b.v.x -= jt * tx
    b.v.y -= jt * ty
    b.v.z -= jt * tz
    // Δw = 1.5 jt (n × t) / R
    const k = (1.5 * jt) / R
    b.w.x += k * (ny * tz - nz * ty)
    b.w.y += k * (nz * tx - nx * tz)
    b.w.z += k * (nx * ty - ny * tx)
  }
  return -vn
}

/** Sphere vs axis-aligned box. Returns impact speed or -1 if no contact. */
function collideBox(
  b: BallState,
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
  e: number,
  mu: number,
): number {
  const qx = Math.max(cx - hx, Math.min(b.p.x, cx + hx))
  const qy = Math.max(cy - hy, Math.min(b.p.y, cy + hy))
  const qz = Math.max(cz - hz, Math.min(b.p.z, cz + hz))
  let dx = b.p.x - qx
  let dy = b.p.y - qy
  let dz = b.p.z - qz
  let d = Math.hypot(dx, dy, dz)
  if (d >= R) return -1
  if (d < 1e-7) {
    // Centre inside the box: push out through the nearest face
    const fx = hx - Math.abs(b.p.x - cx)
    const fy = hy - Math.abs(b.p.y - cy)
    const fz = hz - Math.abs(b.p.z - cz)
    if (fz <= fx && fz <= fy) {
      dx = 0
      dy = 0
      dz = Math.sign(b.p.z - cz) || 1
      d = -fz
    } else if (fx <= fy) {
      dx = Math.sign(b.p.x - cx) || 1
      dy = 0
      dz = 0
      d = -fx
    } else {
      dx = 0
      dy = Math.sign(b.p.y - cy) || 1
      dz = 0
      d = -fy
    }
    return resolve(b, dx, dy, dz, R - d, e, mu)
  }
  return resolve(b, dx / d, dy / d, dz / d, R - d, e, mu)
}

export type StepOut = { events: SimEvent[] }

/**
 * Advance one fixed step. Pure function of state + hoop pose → deterministic.
 */
export function stepBall(b: BallState, hoop: HoopPose, events: SimEvent[]): void {
  const dt = SIM_DT
  const prevY = b.p.y
  const prevZ = b.p.z

  b.v.y -= DIM.gravity * dt
  b.v.x += b.windAx * dt
  b.p.x += b.v.x * dt
  b.p.y += b.v.y * dt
  b.p.z += b.v.z * dt
  b.t += dt
  if (b.p.y > b.maxY) b.maxY = b.p.y

  const hx = hoop.x
  const hy = hoop.y
  const rimY = DIM.rimY + hy
  const rimZ = DIM.rimZ

  // ── Net drag: the net catches and funnels a ball dropping through ──
  {
    const rx = b.p.x - hx
    const rz = b.p.z - rimZ
    const rad = Math.hypot(rx, rz)
    if (b.p.y < rimY - 0.02 && b.p.y > rimY - 0.46 && rad < DIM.rimInnerR && b.v.y < 0) {
      const k = 1 - 2.6 * dt
      b.v.y *= k
      b.v.x = b.v.x * (1 - 5 * dt) - rx * 9 * dt
      b.v.z = b.v.z * (1 - 5 * dt) - rz * 9 * dt
    }
  }

  // Contacts: a few relaxation passes; the glass is always resolved last so
  // a ball wedged between ring and board can never be pushed into it.
  for (let pass = 0; pass < 3; pass++) {
    // ── Floor ──
    if (b.p.y < R) {
      const imp = resolve(b, 0, 1, 0, R - b.p.y, MATERIAL.floor.e, MATERIAL.floor.mu)
      if (imp > 0.35) {
        b.floorHits++
        events.push({ kind: 'floor', t: b.t, impact: imp, p: { ...b.p } })
      }
      // rolling resistance
      b.v.x *= 1 - 0.6 * dt
      b.v.z *= 1 - 0.6 * dt
    }

    // ── Rim torus ──
    {
      const rx = b.p.x - hx
      const ry = b.p.y - rimY
      const rz = b.p.z - rimZ
      const rh = Math.hypot(rx, rz)
      let qx: number
      let qz: number
      if (rh > 1e-6) {
        qx = (rx / rh) * RIM_MAJOR
        qz = (rz / rh) * RIM_MAJOR
      } else {
        qx = RIM_MAJOR
        qz = 0
      }
      const dx = rx - qx
      const dy = ry
      const dz = rz - qz
      const d = Math.hypot(dx, dy, dz)
      const minD = R + DIM.rimTubeR
      if (d < minD && d > 1e-7) {
        const imp = resolve(b, dx / d, dy / d, dz / d, minD - d, MATERIAL.rim.e, MATERIAL.rim.mu)
        if (imp > 0.05) {
          b.rimHits++
          if (!b.through) b.rimBeforeScore = true
          events.push({ kind: 'rim', t: b.t, impact: imp, p: { ...b.p } })
        }
      }
    }

    // ── Rim bracket (between board and ring) ──
    {
      const imp = collideBox(
        b,
        hx,
        rimY - 0.035,
        0.075,
        0.07,
        0.03,
        0.075,
        MATERIAL.bracket.e,
        MATERIAL.bracket.mu,
      )
      if (imp > 0) {
        b.rimHits++
        if (!b.through) b.rimBeforeScore = true
        events.push({ kind: 'rim', t: b.t, impact: imp, p: { ...b.p } })
      }
    }

    // ── Pole (padded cylinder behind the board) ──
    {
      const px = b.p.x - hx
      const pz = b.p.z - DIM.poleZ
      const d = Math.hypot(px, pz)
      const minD = R + DIM.poleR
      if (d < minD && b.p.y < DIM.boardBottom + hy && d > 1e-7) {
        const imp = resolve(b, px / d, 0, pz / d, minD - d, MATERIAL.pole.e, MATERIAL.pole.mu)
        if (imp > 0.3) events.push({ kind: 'pole', t: b.t, impact: imp, p: { ...b.p } })
      }
    }

    // ── Backboard (solid) ──
    {
      const imp = collideBox(
        b,
        hx,
        BOARD_CY + hy,
        -DIM.boardThick / 2,
        DIM.boardW / 2,
        DIM.boardH / 2,
        DIM.boardThick / 2,
        MATERIAL.board.e,
        MATERIAL.board.mu,
      )
      if (imp > 0) {
        b.boardHits++
        if (!b.through) b.bankedBeforeScore = true
        events.push({ kind: 'board', t: b.t, impact: imp, p: { ...b.p } })
      }
    }

  }

  // ── Score detection: centre crosses rim plane, inside the ring, descending ──
  if (!b.through && prevY >= rimY && b.p.y < rimY && b.v.y < 0) {
    const rad = Math.hypot(b.p.x - hx, b.p.z - rimZ)
    if (rad < DIM.rimInnerR - 0.01) b.through = true
  }
  if (b.through && !b.scored && b.p.y < rimY - 0.22) {
    const rad = Math.hypot(b.p.x - hx, b.p.z - rimZ)
    if (rad < DIM.rimInnerR + 0.02) {
      b.scored = true
      b.scoreT = b.t
      events.push({ kind: 'score', t: b.t, impact: 0, p: { ...b.p } })
    } else {
      b.through = false
    }
  }
  // Ball bounced back up out of the ring before confirming
  if (b.through && !b.scored && b.p.y > rimY + 0.02) b.through = false

  // ── Over the board ──
  if (!b.overBoard && prevZ >= -DIM.boardThick && b.p.z < -DIM.boardThick && b.p.y > BOARD_TOP + hy) {
    b.overBoard = true
    events.push({ kind: 'over', t: b.t, impact: 0, p: { ...b.p } })
  }

  // ── Penetration audit: centre must never be within R of the glass box ──
  {
    const cx = hx
    const cy = BOARD_CY + hy
    const cz = -DIM.boardThick / 2
    const qx = Math.max(cx - DIM.boardW / 2, Math.min(b.p.x, cx + DIM.boardW / 2))
    const qy = Math.max(cy - DIM.boardH / 2, Math.min(b.p.y, cy + DIM.boardH / 2))
    const qz = Math.max(cz - DIM.boardThick / 2, Math.min(b.p.z, cz + DIM.boardThick / 2))
    const d = Math.hypot(b.p.x - qx, b.p.y - qy, b.p.z - qz)
    const pen = R - d
    if (pen > 0.002 && pen > b.penetration) b.penetration = pen
    // Tunnel check: crossed the glass plane inside its extents
    if (
      prevZ > 0 &&
      b.p.z < -DIM.boardThick &&
      Math.abs(b.p.x - cx) < DIM.boardW / 2 &&
      Math.abs(b.p.y - cy) < DIM.boardH / 2
    ) {
      b.penetration = Math.max(b.penetration, 1)
    }
  }
}

/** Angular integration helper for renderers (quaternion), kept here for reuse. */
export function integrateSpin(
  q: [number, number, number, number],
  w: V3,
  dt: number,
): void {
  const [x, y, z, s] = q
  const hx = 0.5 * dt * w.x
  const hy = 0.5 * dt * w.y
  const hz = 0.5 * dt * w.z
  q[0] = x + hx * s + hy * z - hz * y
  q[1] = y + hy * s + hz * x - hx * z
  q[2] = z + hz * s + hx * y - hy * x
  q[3] = s - hx * x - hy * y - hz * z
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1
  q[0] /= n
  q[1] /= n
  q[2] /= n
  q[3] /= n
}
