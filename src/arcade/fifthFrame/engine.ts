/**
 * FIFTH FRAME — neon alley finger-flick bowling.
 * World: x ∈ [-0.5, 0.5] lane width, z ∈ [0, 1] foul→pins.
 */
import type { EndStats, FrameMark, Hud, Phase } from './types'

const PB_KEY = 'ffa_fifth_frame_pb_v1'
const LANE_HALF = 0.42
const BALL_R = 0.055
const PIN_R = 0.028
const PIN_MASS = 1
const BALL_MASS = 2.4
const FRICTION = 0.55
const PIN_FRICTION = 1.35
const SETTLE_SPEED = 0.04
const SETTLE_NEED_S = 0.55
const GUTTER_Z = 1.08

/** Classic ten-pin triangle, tip toward bowler (lower z). */
function pinHomes(): { x: number; z: number }[] {
  const rowGap = 0.058
  const colGap = 0.062
  const z0 = 0.82
  const out: { x: number; z: number }[] = []
  for (let row = 0; row < 4; row++) {
    const n = row + 1
    const z = z0 + row * rowGap
    const x0 = -((n - 1) * colGap) / 2
    for (let i = 0; i < n; i++) out.push({ x: x0 + i * colGap, z })
  }
  return out
}

const HOMES = pinHomes()

export type Pin = {
  x: number
  z: number
  vx: number
  vz: number
  up: boolean
  angle: number
  spin: number
  home: number
}

export type Ball = {
  x: number
  z: number
  vx: number
  vz: number
  alive: boolean
  rolling: boolean
}

type FlickSample = { x: number; y: number; t: number }

function loadPb(): number {
  try {
    const n = Number(localStorage.getItem(PB_KEY) || 0)
    return Number.isFinite(n) ? Math.max(0, Math.min(300, Math.floor(n))) : 0
  } catch {
    return 0
  }
}

function savePb(n: number) {
  try {
    localStorage.setItem(PB_KEY, String(n))
  } catch {
    /* */
  }
}

function emptyFrames(): FrameMark[] {
  return Array.from({ length: 10 }, () => ({ rolls: [null, null, null], total: null }))
}

/** Resolve classic bowling score from per-frame pinfalls (0–10 each ball). */
export function scoreGame(pinfalls: number[][]): { frames: FrameMark[]; total: number; strikes: number; spares: number } {
  const rolls: number[] = []
  for (let f = 0; f < 10; f++) {
    const pf = pinfalls[f] ?? []
    for (const n of pf) rolls.push(n)
  }
  let ri = 0
  const frames: FrameMark[] = emptyFrames()
  let strikes = 0
  let spares = 0
  let cumulative = 0
  const ball = (i: number) => (i < rolls.length ? rolls[i] : 0)
  const known = (i: number) => i < rolls.length

  for (let f = 0; f < 10; f++) {
    const mark = frames[f]
    if (f < 9) {
      const a = ball(ri)
      if (!known(ri)) break
      if (a >= 10) {
        mark.rolls = ['X', null, null]
        strikes++
        if (known(ri + 1) && known(ri + 2)) {
          cumulative += 10 + ball(ri + 1) + ball(ri + 2)
          mark.total = cumulative
        }
        ri += 1
      } else {
        mark.rolls[0] = a
        if (!known(ri + 1)) break
        const b = ball(ri + 1)
        if (a + b >= 10) {
          mark.rolls[1] = '/'
          spares++
          if (known(ri + 2)) {
            cumulative += 10 + ball(ri + 2)
            mark.total = cumulative
          }
        } else {
          mark.rolls[1] = b
          cumulative += a + b
          mark.total = cumulative
        }
        ri += 2
      }
    } else {
      // 10th
      if (!known(ri)) break
      const a = ball(ri)
      if (a >= 10) {
        mark.rolls[0] = 'X'
        strikes++
      } else mark.rolls[0] = a
      if (!known(ri + 1)) break
      const b = ball(ri + 1)
      if (a >= 10) {
        if (b >= 10) {
          mark.rolls[1] = 'X'
          strikes++
        } else mark.rolls[1] = b
      } else if (a + b >= 10) {
        mark.rolls[1] = '/'
        spares++
      } else mark.rolls[1] = b
      const needThird = a >= 10 || a + b >= 10
      if (needThird) {
        if (!known(ri + 2)) break
        const c = ball(ri + 2)
        mark.rolls[2] = c >= 10 && (a >= 10 || b >= 10) ? 'X' : c
        if (c >= 10 && (a >= 10 || (mark.rolls[1] === 'X' || mark.rolls[1] === '/'))) strikes++
        cumulative += a + b + c
      } else {
        cumulative += a + b
      }
      mark.total = cumulative
      ri += needThird ? 3 : 2
    }
  }
  return { frames, total: cumulative, strikes, spares }
}

export class FifthFrameEngine {
  phase: Phase = 'howto'
  ball: Ball = { x: 0, z: 0.08, vx: 0, vz: 0, alive: true, rolling: false }
  pins: Pin[] = []
  frame = 1
  ballInFrame = 1
  /** pinfalls this game, per frame */
  pinfalls: number[][] = Array.from({ length: 10 }, () => [])
  /** pins standing at start of current ball */
  standingAtBall = 10
  frames: FrameMark[] = emptyFrames()
  score = 0
  strikes = 0
  spares = 0
  pb = loadPb()
  callout: string | null = null
  hint = 'Flick up the lane'
  settleT = 0
  calloutT = 0
  /** soft aim assist ghost */
  aimX = 0
  aimPower = 0
  private samples: FlickSample[] = []
  private pointerId: number | null = null
  private aiming = false
  private ended: EndStats | null = null
  private onEnd: ((e: EndStats) => void) | null = null
  private _w = 390
  private _h = 700

  setSize(w: number, h: number) {
    this._w = Math.max(1, w)
    this._h = Math.max(1, h)
  }

  setOnEnd(fn: (e: EndStats) => void) {
    this.onEnd = fn
  }

  getEndStats() {
    return this.ended
  }

  hud(): Hud {
    return {
      phase: this.phase,
      score: this.score,
      frame: this.frame,
      ballInFrame: this.ballInFrame,
      standing: this.pins.filter((p) => p.up).length,
      callout: this.callout,
      pb: this.pb,
      frames: this.frames,
      hint: this.hint,
    }
  }

  start() {
    this.phase = 'aim'
    this.frame = 1
    this.ballInFrame = 1
    this.pinfalls = Array.from({ length: 10 }, () => [])
    this.frames = emptyFrames()
    this.score = 0
    this.strikes = 0
    this.spares = 0
    this.ended = null
    this.callout = null
    this.hint = 'Flick up the lane'
    this.resetRack(true)
    this.resetBall()
  }

  private resetRack(full: boolean) {
    if (full) {
      this.pins = HOMES.map((h, i) => ({
        x: h.x,
        z: h.z,
        vx: 0,
        vz: 0,
        up: true,
        angle: 0,
        spin: 0,
        home: i,
      }))
    } else {
      // leave downed pins down; standing stay roughly home
      for (const p of this.pins) {
        if (!p.up) continue
        const h = HOMES[p.home]
        p.x = h.x
        p.z = h.z
        p.vx = 0
        p.vz = 0
        p.angle = 0
        p.spin = 0
      }
    }
    this.standingAtBall = this.pins.filter((p) => p.up).length
  }

  private resetBall() {
    this.ball = { x: 0, z: 0.08, vx: 0, vz: 0, alive: true, rolling: false }
    this.aimX = 0
    this.aimPower = 0
    this.samples = []
    this.aiming = false
    this.pointerId = null
  }

  onPointerDown(sx: number, sy: number, id: number) {
    if (this.phase !== 'aim') return
    this.pointerId = id
    this.aiming = true
    this.samples = [{ x: sx, y: sy, t: performance.now() }]
    this.hint = 'Release to throw'
  }

  onPointerMove(sx: number, sy: number, id: number) {
    if (!this.aiming || this.pointerId !== id) return
    const t = performance.now()
    this.samples.push({ x: sx, y: sy, t })
    if (this.samples.length > 24) this.samples.shift()
    // preview aim from recent motion
    const a = this.samples[0]
    const b = this.samples[this.samples.length - 1]
    const dy = a.y - b.y
    const dx = b.x - a.x
    if (dy > 8) {
      const ang = Math.atan2(dx, dy)
      this.aimX = Math.tan(ang) * 0.35
      this.aimPower = Math.min(1.2, Math.hypot(dx, dy) / 180)
    }
  }

  onPointerUp(sx: number, sy: number, id: number) {
    if (!this.aiming || (this.pointerId !== null && this.pointerId !== id)) return
    this.aiming = false
    this.pointerId = null
    const release = { x: sx, y: sy, t: performance.now() }
    const flick = analyzeFlick(this.samples, release)
    this.samples = []
    if (!flick) {
      this.hint = 'Flick up — like a shot'
      this.aimPower = 0
      return
    }
    this.launch(flick.speed, flick.angle)
  }

  private launch(speed: number, angle: number) {
    // Map flick → lane velocity. Court Vision style: px/ms → power.
    const power = Math.min(1.45, Math.max(0.35, speed / 1.05))
    const lateral = Math.tan(angle) * 0.55
    // gentle assist toward center if almost straight
    const assist = Math.abs(lateral) < 0.12 ? lateral * 0.55 : lateral * 0.92
    const vz = 0.55 + power * 1.15 // world units / s
    const vx = assist * vz * 0.85
    this.ball.x = Math.max(-0.18, Math.min(0.18, assist * 0.15))
    this.ball.z = 0.08
    this.ball.vx = vx
    this.ball.vz = vz
    this.ball.rolling = true
    this.ball.alive = true
    this.phase = 'rolling'
    this.hint = ''
    this.aimPower = 0
    this.callout = null
  }

  update(dt: number) {
    void this._w
    void this._h
    if (this.calloutT > 0) {
      this.calloutT -= dt
      if (this.calloutT <= 0) this.callout = null
    }
    if (this.phase === 'rolling' || this.phase === 'settle') {
      this.stepPhysics(Math.min(0.032, dt))
    }
  }

  private stepPhysics(dt: number) {
    const b = this.ball
    if (b.alive && b.rolling) {
      b.x += b.vx * dt
      b.z += b.vz * dt
      const drag = Math.exp(-FRICTION * dt)
      b.vx *= drag
      b.vz *= drag
      // gutters
      if (Math.abs(b.x) > LANE_HALF) {
        b.vx *= 0.2
        b.x = Math.sign(b.x) * (LANE_HALF + 0.02)
        b.vz *= 0.85
      }
      if (b.z > GUTTER_Z || (b.z > 0.95 && Math.hypot(b.vx, b.vz) < 0.08)) {
        b.alive = false
        b.rolling = false
      }
    }

    // pin motion
    for (const p of this.pins) {
      if (!p.up) continue
      p.x += p.vx * dt
      p.z += p.vz * dt
      const pd = Math.exp(-PIN_FRICTION * dt)
      p.vx *= pd
      p.vz *= pd
      p.spin *= Math.exp(-2.2 * dt)
      p.angle += p.spin * dt
      // knock down
      const speed = Math.hypot(p.vx, p.vz)
      const home = HOMES[p.home]
      const dist = Math.hypot(p.x - home.x, p.z - home.z)
      if (speed > 0.55 || dist > 0.09 || Math.abs(p.angle) > 0.85) {
        p.up = false
        p.vx *= 1.1
        p.vz *= 1.1
      }
      // soft walls
      if (Math.abs(p.x) > LANE_HALF + 0.06) {
        p.up = false
      }
      if (p.z < 0.55 || p.z > 1.12) {
        if (speed > 0.25) p.up = false
      }
    }

    // ball–pin
    if (b.alive) {
      for (const p of this.pins) {
        if (!p.up) continue
        const dx = p.x - b.x
        const dz = p.z - b.z
        const d = Math.hypot(dx, dz) || 0.0001
        const minD = BALL_R + PIN_R
        if (d < minD) {
          const nx = dx / d
          const nz = dz / d
          const overlap = minD - d
          p.x += nx * overlap
          p.z += nz * overlap
          // relative velocity along normal
          const rv = (b.vx - p.vx) * nx + (b.vz - p.vz) * nz
          if (rv > 0) continue
          const e = 0.55
          const j = (-(1 + e) * rv) / (1 / BALL_MASS + 1 / PIN_MASS)
          const ix = j * nx
          const iz = j * nz
          b.vx -= ix / BALL_MASS
          b.vz -= iz / BALL_MASS
          p.vx += ix / PIN_MASS
          p.vz += iz / PIN_MASS
          p.spin += (Math.random() - 0.5) * 6
          // slight ball deflection feel
          b.vx *= 0.92
          b.vz *= 0.96
        }
      }
    }

    // pin–pin
    for (let i = 0; i < this.pins.length; i++) {
      const a = this.pins[i]
      if (!a.up) continue
      for (let j = i + 1; j < this.pins.length; j++) {
        const c = this.pins[j]
        if (!c.up) continue
        const dx = c.x - a.x
        const dz = c.z - a.z
        const d = Math.hypot(dx, dz) || 0.0001
        const minD = PIN_R * 2
        if (d >= minD) continue
        const nx = dx / d
        const nz = dz / d
        const overlap = minD - d
        a.x -= nx * overlap * 0.5
        a.z -= nz * overlap * 0.5
        c.x += nx * overlap * 0.5
        c.z += nz * overlap * 0.5
        const rv = (a.vx - c.vx) * nx + (a.vz - c.vz) * nz
        if (rv > 0) continue
        const jImp = (-(1 + 0.4) * rv) / 2
        a.vx -= jImp * nx
        a.vz -= jImp * nz
        c.vx += jImp * nx
        c.vz += jImp * nz
      }
    }

    // settle detection
    const moving =
      (b.alive && b.rolling && Math.hypot(b.vx, b.vz) > SETTLE_SPEED) ||
      this.pins.some((p) => p.up && Math.hypot(p.vx, p.vz) > SETTLE_SPEED)
    if (!moving && (!b.alive || b.z > 0.7 || Math.hypot(b.vx, b.vz) < SETTLE_SPEED)) {
      if (this.phase === 'rolling') {
        this.phase = 'settle'
        this.settleT = 0
      }
      this.settleT += dt
      if (this.settleT >= SETTLE_NEED_S) this.finishBall()
    } else if (this.phase === 'settle') {
      this.settleT = 0
      this.phase = 'rolling'
    }
  }

  private finishBall() {
    const standing = this.pins.filter((p) => p.up).length
    const knocked = Math.max(0, this.standingAtBall - standing)
    const frameIdx = this.frame - 1
    this.pinfalls[frameIdx].push(knocked)

    const resolved = scoreGame(this.pinfalls)
    this.frames = resolved.frames
    this.score = resolved.total
    this.strikes = resolved.strikes
    this.spares = resolved.spares

    // callouts
    if (this.frame < 10) {
      if (knocked === 10 && this.ballInFrame === 1) this.flash('STRIKE', 1.4)
      else if (standing === 0 && this.ballInFrame === 2) this.flash('SPARE', 1.2)
      else if (knocked === 0) this.flash('GUTTER', 0.9)
      else this.flash(`${knocked}`, 0.7)
    } else {
      if (knocked === 10) this.flash('STRIKE', 1.2)
      else if (standing === 0 && this.ballInFrame >= 2) this.flash('SPARE', 1.0)
      else this.flash(`${knocked}`, 0.7)
    }

    const advance = this.decideAdvance(standing, knocked)
    if (advance === 'end') {
      this.endGame()
      return
    }
    if (advance === 'nextFrame') {
      this.frame++
      this.ballInFrame = 1
      this.resetRack(true)
    } else if (advance === 'second') {
      this.ballInFrame = 2
      if (this.frame === 10 && knocked >= 10) this.resetRack(true)
      else this.resetRack(false)
    } else if (advance === 'third') {
      this.ballInFrame = 3
      const pf = this.pinfalls[9]
      const a = pf[0] ?? 0
      const b = pf[1] ?? 0
      // re-rack after strike or spare for the bonus ball
      if (a >= 10 || a + b >= 10) this.resetRack(true)
      else this.resetRack(false)
    }
    this.resetBall()
    this.phase = 'aim'
    this.hint = 'Flick up the lane'
  }

  private decideAdvance(standing: number, knocked: number): 'second' | 'third' | 'nextFrame' | 'end' {
    if (this.frame < 10) {
      if (this.ballInFrame === 1 && knocked >= 10) return this.frame === 9 ? 'nextFrame' : 'nextFrame'
      if (this.ballInFrame === 1 && standing > 0) return 'second'
      // after ball 2
      if (this.frame === 9) return 'nextFrame'
      return 'nextFrame'
    }
    // 10th frame
    const pf = this.pinfalls[9]
    if (this.ballInFrame === 1) {
      if (knocked >= 10) return 'second' // strike → bonus balls (re-rack)
      return 'second'
    }
    if (this.ballInFrame === 2) {
      const first = pf[0] ?? 0
      const second = pf[1] ?? 0
      if (first >= 10) return 'third' // was strike
      if (first + second >= 10) return 'third' // spare
      return 'end'
    }
    return 'end'
  }

  private flash(msg: string, s: number) {
    this.callout = msg
    this.calloutT = s
  }

  private endGame() {
    const resolved = scoreGame(this.pinfalls)
    this.frames = resolved.frames
    this.score = resolved.total
    this.strikes = resolved.strikes
    this.spares = resolved.spares
    const newPb = this.score > this.pb
    if (newPb) {
      this.pb = this.score
      savePb(this.pb)
    }
    this.phase = 'ended'
    this.ended = {
      score: this.score,
      strikes: this.strikes,
      spares: this.spares,
      pb: this.pb,
      newPb,
    }
    this.onEnd?.(this.ended)
  }
}

function analyzeFlick(samples: FlickSample[], release: FlickSample): { speed: number; angle: number } | null {
  const all = [...samples, release]
  if (all.length < 2) return null
  const tEnd = release.t
  const win = all.filter((s) => tEnd - s.t <= 120)
  const use = win.length >= 2 ? win : all.slice(-2)
  const a = use[0]
  const b = use[use.length - 1]
  const dt = Math.max(10, b.t - a.t)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const up = -dy
  if (up < 28 || dy > 4) return null
  const speed = Math.hypot(dx, dy) / dt
  if (speed < 0.28) return null
  const angle = Math.atan2(dx, up)
  if (Math.abs(angle) > Math.PI * 0.5) return null
  return { speed, angle }
}

/** Perspective project world (x,z) → canvas */
export function project(x: number, z: number, W: number, H: number) {
  const t = Math.max(0, Math.min(1.15, z))
  // near (z=0) large at bottom; far (z=1) small near top
  const yN = 0.88
  const yF = 0.16
  const sN = 0.92
  const sF = 0.28
  const y = H * (yN + (yF - yN) * t)
  const scale = sN + (sF - sN) * t
  const cx = W * 0.5 + x * W * 0.5 * scale / LANE_HALF
  return { cx, cy: y, scale, rScale: scale }
}

export const VIEW = { BALL_R, PIN_R, LANE_HALF, HOMES }
