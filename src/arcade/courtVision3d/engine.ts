import * as THREE from 'three'
import { COURT_VISION_COPY } from '../copyLocks'
import { courtVisionSeedConfig, type CourtVisionSeedConfig } from '../core/seededRandom'
import { loadPersonalBest, savePersonalBest, scoreShot, streakMultiplier } from '../courtVision/scoring'
import type { CvBridge, CvHudState, CvMode } from '../courtVisionPhaser/types'
import { CourtScene, type QualityTier } from './render/scene'
import { BallFire, type FireEmitter } from './render/fire'
import {
  setSfxMuted,
  sfxBounce,
  sfxCrowd,
  sfxFlow,
  sfxGlass,
  sfxRelease,
  sfxRim,
  sfxRimTick,
  sfxSwish,
  sfxTimeBonus,
  unlockSfx,
} from './sfx3d'
import { DIM, SIM_DT } from './sim/constants'

/** Sim runs a touch faster than real time for snappier flights (harness is time-agnostic). */
const SIM_SPEED = 1.12
const RESPAWN_POP_S = 0.18
const GHOST_FADE_S = 0.15
/** 60s modes: reach this score once per run for bonus seconds. */
export const TIME_BONUS_AT = 50
export const TIME_BONUS_S = 15
import { hoopPoseAt } from './sim/hoop'
import { integrateSpin, makeBall, stepBall, type BallState, type SimEvent, type V3 } from './sim/physics'
import {
  analyzeFlickSamples,
  classify,
  FLICK3D,
  planShot,
  shotResolved,
  type FlickInput,
  type FlickSample,
  type ShotOutcome,
  type ShotPlan,
} from './sim/shot'

export type CourtVision3DHandle = {
  destroy: () => void
  requestEnd: () => void
  setMuted: (m: boolean) => void
  /** Hold the clock + shooting (How-to screen up); false = go. */
  setHold: (h: boolean) => void
}

type Shot = {
  b: BallState
  plan: ShotPlan
  prev: V3
  resolved: boolean
  resolvedAt: number
  outcome: ShotOutcome | null
  minRimDist: number
}

type ShotMeta = {
  penetratedBoard: boolean
  contactedBoard: boolean
  contactedRim: boolean
  overBoard: boolean
  finishNearRim: boolean
  outcome: string
  kind: 'swish' | 'make' | 'miss'
}

function detectTier(): QualityTier {
  try {
    const q = new URLSearchParams(window.location.search).get('q')
    if (q === 'low' || q === 'high') return q
    const nav = navigator as Navigator & { deviceMemory?: number }
    if ((nav.deviceMemory ?? 8) <= 3) return 'low'
    if ((nav.hardwareConcurrency ?? 8) <= 3) return 'low'
  } catch {
    /* ignore */
  }
  return 'high'
}

class Engine {
  host: HTMLElement
  bridge: CvBridge
  mode: CvMode
  canvas: HTMLCanvasElement
  view: CourtScene
  seedCfg: CourtVisionSeedConfig | null
  challengeCfg = null as CvBridge['challenge']

  phase: CvHudState['phase'] = 'ready'
  score = 0
  streak = 0
  bestStreak = 0
  timeLeft = 60
  pb = loadPersonalBest()
  ended = false
  callout: string | null = null
  lastPoints: number | null = null
  firstMake = false
  announcedX5 = false
  announcedX10 = false
  timeBonusGiven = false
  /** How-to overlay up: clock frozen, flicks ignored */
  hold = false
  clockBonusId = 0
  lastShotMeta: ShotMeta | null = null
  calloutT = 0

  simTime = 0
  accum = 0
  timerAcc = 0
  netToggle = false
  home: V3
  shot: Shot | null = null
  respawnT = 1
  /** Previous shot ball fading out (visual only) */
  ghost: { b: BallState; prev: V3; fade: number; quat: [number, number, number, number] } | null = null
  /** QA: last ready-latency measurement */
  lastReady: { cause: 'make' | 'miss'; decidedAtSimS: number; flickableAfterMs: number; poppedAfterMs: number | null; decidedClock: number } | null = null
  /** real-time clock (s), advances with update(dt) — QA timing */
  clock = 0
  /** clock at which the make was registered / the miss decided */
  decideClock = 0
  quat: [number, number, number, number] = [0.12, 0.3, 0.05, 0.94]
  drag: { id: number; samples: FlickSample[]; startY: number } | null = null
  grip = 0
  timeScale = 1
  slowMo = 0
  nudge = 0
  shake = 0
  rimGlow = 0
  crowdPulse = 0
  lastRimSfx = -1
  lastBoardSfx = -1
  manual = false
  raf = 0
  lastNow = 0
  destroyed = false
  ready = false
  timeouts: number[] = []
  fpsFrames = 0
  fpsTime = 0
  fpsGood = 0
  backdropBase = new THREE.Color()
  private ro: ResizeObserver | null = null
  private tmpV = new THREE.Vector3()
  /** Flow-state fire (visual only) */
  fire!: BallFire
  fireLevel = 0
  private fireEm: FireEmitter[] = [
    { pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), radius: DIM.ballR, strength: 1 },
    { pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), radius: DIM.ballR, strength: 1 },
  ]

  constructor(host: HTMLElement, bridge: CvBridge, mode: CvMode) {
    this.host = host
    this.bridge = bridge
    this.mode = bridge.challenge ? 'challenge' : mode
    this.challengeCfg = bridge.challenge ?? null
    // 'still:*' seeds = the normal static court (challenge sent from a plain 60s run, so both
    // players get identical conditions). Any other seed drives deterministic sway + wind.
    this.seedCfg =
      bridge.challenge && !(bridge.challenge.seed ?? '').startsWith('still:')
        ? courtVisionSeedConfig(bridge.challenge.seed)
        : null
    this.home = {
      x: this.seedCfg ? this.seedCfg.ballHomeOffsetX * 0.45 * 0.004 : 0,
      y: DIM.ballR,
      z: DIM.ballRestZ,
    }
    setSfxMuted(bridge.muted)
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'cv3-canvas'
    this.canvas.style.touchAction = 'none'
    host.appendChild(this.canvas)
    this.view = new CourtScene(this.canvas, detectTier())
    this.fire = new BallFire(DIM.ballR, this.view.tier === 'low')
    this.view.scene.add(this.fire.group)
  }

  async init() {
    await this.view.build()
    if (this.destroyed) return
    this.backdropBase.copy(this.view.backdropMat.color)
    this.onResize()
    this.ro = new ResizeObserver(() => this.onResize())
    this.ro.observe(this.host)
    this.canvas.addEventListener('pointerdown', this.onDown)
    window.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerup', this.onUp)
    window.addEventListener('pointercancel', this.onUp)
    this.placeBallAtHome()
    // settle the net before first frame
    for (let i = 0; i < 240; i++) this.view.net.step(SIM_DT * 2, null, 0)
    this.view.net.updateMesh()
    this.ready = true
    this.phase = 'playing'
    this.emitHud()
    ;(globalThis as unknown as { __CV_SCENE?: Engine }).__CV_SCENE = this
    ;(globalThis as unknown as { __CV3D?: Engine }).__CV3D = this
    this.lastNow = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  // ── HUD bridge ──
  emitHud(callout: string | null = this.callout) {
    this.bridge.onHud({
      score: this.score,
      streak: this.streak,
      multiplier: streakMultiplier(this.streak),
      timeLeft: this.mode === 'timed' || this.mode === 'challenge' ? this.timeLeft : null,
      phase: this.phase,
      callout,
      lastPoints: this.lastPoints,
      pb: this.pb,
      newPb: false,
      mode: this.mode,
      clockBonusId: this.clockBonusId,
    })
  }

  later(ms: number, fn: () => void) {
    this.timeouts.push(window.setTimeout(fn, ms))
  }

  // ── Input ──
  private toLocal(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }
  }

  canShoot() {
    return this.ready && this.phase === 'playing' && !this.ended && !this.shot
  }

  onDown = (e: PointerEvent) => {
    unlockSfx()
    if (this.hold || !this.canShoot()) return
    const p = this.toLocal(e)
    // Start on/near the ball or anywhere in the lower part of the court
    this.tmpV.set(this.home.x, this.home.y, this.home.z).project(this.view.camera)
    const bx = (this.tmpV.x * 0.5 + 0.5) * p.w
    const by = (-this.tmpV.y * 0.5 + 0.5) * p.h
    const near = Math.hypot(p.x - bx, p.y - by) < Math.max(90, p.w * 0.25)
    if (!near && p.y < p.h * 0.55) return
    this.drag = { id: e.pointerId, samples: [{ x: p.x, y: p.y, t: e.timeStamp }], startY: p.y }
    try {
      this.canvas.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  onMove = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id) return
    const p = this.toLocal(e)
    this.drag.samples.push({ x: p.x, y: p.y, t: e.timeStamp })
    if (this.drag.samples.length > 40) this.drag.samples.shift()
  }

  onUp = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id) return
    const p = this.toLocal(e)
    const input = analyzeFlickSamples(this.drag.samples, { x: p.x, y: p.y, t: e.timeStamp })
    this.drag = null
    if (input && this.canShoot()) this.shoot(input)
  }

  /** Harness / QA: same mapping as the old debugFlick. */
  debugFlick(opts: { speed: number; dx?: number }) {
    if (!this.canShoot()) return false
    const dist = opts.speed * FLICK3D.sampleMs
    const dx = opts.dx ?? 0
    const angle = Math.abs(dx) > 1 ? Math.atan2(dx, dist) : 0
    this.shoot({ speed: opts.speed, angle })
    return true
  }

  get flight() {
    return Boolean(this.shot && !this.shot.resolved)
  }
  get respawning() {
    return this.respawnT < 1
  }

  shoot(input: FlickInput) {
    const pose = hoopPoseAt(this.seedCfg, this.simTime)
    const wind = this.seedCfg?.windBias ?? 0
    const plan = planShot(input, { ball: this.home, hoop: pose, windBias: wind })
    const b = makeBall(this.home, plan.v, plan.w, wind * FLICK3D.windAccel)
    this.shot = { b, plan, prev: { ...b.p }, resolved: false, resolvedAt: 0, outcome: null, minRimDist: Infinity }
    // a new shot never inherits the previous swish's slow-mo or pop-in
    this.slowMo = 0
    this.timeScale = 1
    this.respawnT = 1
    this.lastRimSfx = -1
    this.lastBoardSfx = -1
    sfxRelease(plan.power)
  }

  // ── Simulation ──
  fixedStep() {
    this.simTime += SIM_DT
    const pose = hoopPoseAt(this.seedCfg, this.simTime)
    this.view.hoop.position.set(pose.x, pose.y, 0)
    this.view.net.setOffset(pose.x, pose.y)

    const s = this.shot
    if (s) {
      s.prev.x = s.b.p.x
      s.prev.y = s.b.p.y
      s.prev.z = s.b.p.z
      const ev: SimEvent[] = []
      stepBall(s.b, pose, ev)
      integrateSpin(this.quat, s.b.w, SIM_DT)
      if (Math.abs(s.b.p.y - (DIM.rimY + pose.y)) < 0.25) {
        const d = Math.hypot(s.b.p.x - pose.x, s.b.p.z - DIM.rimZ)
        if (d < s.minRimDist) s.minRimDist = d
      }
      for (const e of ev) this.onEvent(e, s)
      if (!s.resolved && shotResolved(s.b, pose)) {
        s.resolved = true
        s.resolvedAt = s.b.t
        s.outcome = classify(s.b, s.minRimDist)
        if (!s.outcome.made) this.resolveMiss(s)
        // Outcome is final → hand the old ball to a fade-out ghost and
        // put a fresh, flickable ball on the spot right away.
        this.startRespawn(s)
      }
    }
    // Ghost keeps falling (net still reacts) but never bounces or rolls
    const gh = this.ghost
    if (gh) {
      gh.prev.x = gh.b.p.x
      gh.prev.y = gh.b.p.y
      gh.prev.z = gh.b.p.z
      gh.b.v.y -= 9.81 * SIM_DT
      if (gh.b.p.y < DIM.rimY + pose.y && gh.b.p.y > DIM.rimY + pose.y - 0.5 && Math.hypot(gh.b.p.x - pose.x, gh.b.p.z - DIM.rimZ) < DIM.rimInnerR) {
        gh.b.v.y *= 1 - 2.6 * SIM_DT
      }
      gh.b.p.x += gh.b.v.x * SIM_DT
      gh.b.p.y += gh.b.v.y * SIM_DT
      gh.b.p.z += gh.b.v.z * SIM_DT
      integrateSpin(gh.quat, gh.b.w, SIM_DT)
    }

    this.netToggle = !this.netToggle
    if (this.netToggle) {
      const near = (bb: BallState | undefined) =>
        bb && Math.abs(bb.p.y - DIM.rimY) < 0.8 && Math.abs(bb.p.z - DIM.rimZ) < 0.7 ? bb : undefined
      const b = near(this.shot?.b) ?? near(this.ghost?.b)
      const ball =
        b && Math.abs(b.p.y - DIM.rimY) < 0.8 && Math.abs(b.p.z - DIM.rimZ) < 0.7
          ? { x: b.p.x, y: b.p.y, z: b.p.z, vx: b.v.x, vy: b.v.y, vz: b.v.z }
          : null
      this.view.net.step(SIM_DT * 2, ball, (this.seedCfg?.windBias ?? 0) * 0.25 + Math.sin(this.simTime * 0.9) * 0.05)
    }
  }

  onEvent(e: SimEvent, s: Shot) {
    switch (e.kind) {
      case 'rim':
        if (e.impact > 0.35 && s.b.t - this.lastRimSfx > 0.06) {
          sfxRim(e.impact)
          this.lastRimSfx = s.b.t
        }
        this.view.net.kick(Math.min(1.2, e.impact / 2.5), 'jiggle')
        this.rimGlow = Math.max(this.rimGlow, Math.min(0.5, e.impact / 8))
        this.shake = Math.max(this.shake, Math.min(0.5, e.impact / 10))
        break
      case 'board':
        if (s.b.t - this.lastBoardSfx > 0.08) {
          sfxGlass(e.impact)
          this.lastBoardSfx = s.b.t
        }
        this.shake = Math.max(this.shake, Math.min(0.6, e.impact / 9))
        break
      case 'floor':
        sfxBounce(e.impact)
        break
      case 'pole':
        sfxGlass(e.impact * 0.5)
        break
      case 'score':
        this.resolveMake(s)
        break
      default:
        break
    }
  }

  startRespawn(s: Shot) {
    const made = Boolean(s.outcome?.made)
    this.ghost = { b: s.b, prev: { ...s.prev }, fade: 0, quat: [...this.quat] as [number, number, number, number] }
    this.shot = null
    this.respawnT = 0
    this.quat = [0.12, 0.3, 0.05, 0.94]
    this.placeBallAtHome()
    this.lastReady = {
      cause: made ? 'make' : 'miss',
      decidedAtSimS: made ? s.b.scoreT : s.resolvedAt,
      flickableAfterMs: Math.round((this.clock - this.decideClock) * 1000),
      poppedAfterMs: null,
      decidedClock: this.decideClock,
    }
  }

  resolveMake(s: Shot) {
    this.decideClock = this.clock
    const b = s.b
    const swish = !b.rimBeforeScore && !b.bankedBeforeScore
    const banked = b.bankedBeforeScore
    const kind: 'swish' | 'make' = swish ? 'swish' : 'make'
    const result = scoreShot({
      kind,
      streakBefore: this.streak,
      perfectRelease: s.plan.perfect,
      banked5d: banked,
    })
    this.streak = result.streakAfter
    this.bestStreak = Math.max(this.bestStreak, this.streak)
    this.lastPoints = result.points || null
    this.score += result.points
    // rim-in make: light tick first unless a clank just played for that contact
    if (!swish && b.rimBeforeScore && s.b.t - this.lastRimSfx > 0.25) sfxRimTick()
    sfxSwish(swish)
    if (this.streak >= 5) sfxFlow()
    this.view.net.kick(swish ? 1.25 : 0.8, 'snap')
    this.rimGlow = swish ? 1 : 0.7
    if (swish) {
      this.slowMo = 0.36
      this.nudge = 1
    } else {
      this.nudge = 0.45
    }
    this.callout = swish ? 'SWISH!' : banked ? '5D BOUNCE' : 'MAKE'
    if (!this.firstMake) {
      this.firstMake = true
      this.callout = COURT_VISION_COPY.FIRST_MAKE
    }
    if (this.streak >= 5 && !this.announcedX5) {
      this.announcedX5 = true
      this.callout = COURT_VISION_COPY.STREAK_X5
    }
    if (this.streak >= 10 && !this.announcedX10) {
      this.announcedX10 = true
      this.callout = COURT_VISION_COPY.STREAK_X10
    }
    if (
      (this.mode === 'timed' || this.mode === 'challenge') &&
      !this.timeBonusGiven &&
      this.score >= TIME_BONUS_AT &&
      this.timeLeft > 0
    ) {
      this.timeBonusGiven = true
      this.timeLeft += TIME_BONUS_S
      this.clockBonusId++
      this.callout = `+${TIME_BONUS_S}s`
      sfxTimeBonus()
    }
    if (this.streak >= 3) {
      sfxCrowd(Math.min(4, this.streak / 3))
      this.crowdPulse = Math.min(1.4, 0.6 + this.streak * 0.08)
    }
    this.lastShotMeta = {
      penetratedBoard: b.penetration > 0,
      contactedBoard: b.boardHits > 0,
      contactedRim: b.rimHits > 0,
      overBoard: b.overBoard,
      finishNearRim: true,
      outcome: swish ? 'swish' : banked ? 'bank' : 'rim',
      kind,
    }
    this.emitHud(this.callout)
    this.calloutT = 1.1
  }

  resolveMiss(s: Shot) {
    this.decideClock = this.clock
    const b = s.b
    const out = s.outcome!
    const result = scoreShot({ kind: 'miss', streakBefore: this.streak, perfectRelease: false, banked5d: false })
    this.streak = result.streakAfter
    this.lastPoints = null
    this.callout = COURT_VISION_COPY.LOST_CHALLENGE
    this.lastShotMeta = {
      penetratedBoard: b.penetration > 0,
      contactedBoard: b.boardHits > 0,
      contactedRim: b.rimHits > 0,
      overBoard: b.overBoard,
      finishNearRim: s.minRimDist < 0.6,
      outcome: out.missKind ?? 'miss',
      kind: 'miss',
    }
    this.emitHud(this.callout)
    this.calloutT = 0.9
  }

  endRun() {
    if (this.ended) return
    this.ended = true
    this.phase = 'ended'
    const prev = this.pb
    const next = savePersonalBest(this.score)
    const newPb = next > prev
    this.pb = next
    let beatChallenge: boolean | null = null
    if (this.challengeCfg && !this.challengeCfg.setTheBar) {
      beatChallenge = this.score >= this.challengeCfg.targetScore
      this.callout = beatChallenge ? COURT_VISION_COPY.WON_CHALLENGE : COURT_VISION_COPY.LOST_CHALLENGE
    } else if (newPb) {
      this.callout = COURT_VISION_COPY.NEW_PB
    }
    this.emitHud(this.callout)
    this.bridge.onEnded({ score: this.score, pb: next, newPb, mode: this.mode, beatChallenge, bestStreak: this.bestStreak })
  }

  requestEnd() {
    this.endRun()
  }

  placeBallAtHome() {
    const ball = this.view.ball
    ball.position.set(this.home.x, this.home.y, this.home.z)
  }

  // ── Frame ──
  loop = (now: number) => {
    if (this.destroyed) return
    this.raf = requestAnimationFrame(this.loop)
    if (this.manual) return
    const dt = Math.min(0.1, Math.max(0, (now - this.lastNow) / 1000))
    this.lastNow = now
    this.update(dt)
    this.adapt(dt)
  }

  /** QA capture: freeze the RAF loop and step deterministically. */
  setManual(on: boolean) {
    this.manual = on
    this.lastNow = performance.now()
  }

  advance(ms: number, frameMs = 1000 / 60) {
    let left = ms
    while (left > 0) {
      const d = Math.min(frameMs, left)
      this.update(d / 1000, left - d > 0)
      left -= d
    }
  }

  update(dt: number, skipRender = false) {
    // Clock (real time)
    if (this.phase === 'playing' && !this.hold && !this.ended && (this.mode === 'timed' || this.mode === 'challenge')) {
      this.timerAcc += dt
      while (this.timerAcc >= 1 && !this.ended) {
        this.timerAcc -= 1
        this.timeLeft -= 1
        if (this.timeLeft <= 0) {
          this.timeLeft = 0
          this.endRun()
        } else this.emitHud()
      }
    }
    // Callout lifetime (engine time, so stepped captures match real play)
    if (this.calloutT > 0) {
      this.calloutT -= dt
      if (this.calloutT <= 0 && !this.ended) {
        this.callout = null
        this.lastPoints = null
        this.emitHud(null)
      }
    }
    // Fresh-ball pop-in and old-ball fade run on real time (never slowed)
    this.clock += dt
    if (this.respawnT < 1) {
      this.respawnT = Math.min(1, this.respawnT + dt / RESPAWN_POP_S)
      if (this.respawnT >= 1 && this.lastReady && this.lastReady.poppedAfterMs == null) {
        this.lastReady.poppedAfterMs = Math.round((this.clock - this.lastReady.decidedClock) * 1000)
      }
    }
    if (this.ghost) {
      this.ghost.fade += dt / GHOST_FADE_S
      if (this.ghost.fade >= 1) this.ghost = null
    }
    // Slow-mo on a swish
    if (this.slowMo > 0) {
      this.slowMo -= dt
      this.timeScale = 0.32
    } else {
      this.timeScale = Math.min(1, this.timeScale + dt * 4)
    }
    this.accum += dt * this.timeScale * SIM_SPEED
    let steps = 0
    while (this.accum >= SIM_DT && steps < 80) {
      this.fixedStep()
      this.accum -= SIM_DT
      steps++
    }
    if (steps >= 80) this.accum = 0
    this.renderFrame(dt, skipRender)
  }

  renderFrame(dt: number, skipDraw = false) {
    const v = this.view
    const alpha = this.accum / SIM_DT
    const s = this.shot
    const ball = v.ball
    if (s) {
      ball.position.set(
        s.prev.x + (s.b.p.x - s.prev.x) * alpha,
        s.prev.y + (s.b.p.y - s.prev.y) * alpha,
        s.prev.z + (s.b.p.z - s.prev.z) * alpha,
      )
      ball.scale.setScalar(1)
    } else {
      // quick pop-in (scale + small rise) + grip lift while the finger is down
      const t = this.respawnT
      const c = 1.70158
      const back = 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
      this.grip += ((this.drag ? 1 : 0) - this.grip) * Math.min(1, dt * 14)
      ball.position.set(this.home.x, this.home.y - (1 - Math.min(1, t)) * 0.06 + this.grip * 0.025, this.home.z)
      ball.scale.setScalar(Math.max(0.01, 0.35 + 0.65 * back))
    }
    ball.quaternion.set(this.quat[0], this.quat[1], this.quat[2], this.quat[3])

    const gm = v.ballGhost
    const gh = this.ghost
    if (gh) {
      gm.visible = true
      gm.position.set(
        gh.prev.x + (gh.b.p.x - gh.prev.x) * alpha,
        gh.prev.y + (gh.b.p.y - gh.prev.y) * alpha,
        gh.prev.z + (gh.b.p.z - gh.prev.z) * alpha,
      )
      gm.quaternion.set(gh.quat[0], gh.quat[1], gh.quat[2], gh.quat[3])
      const f = Math.min(1, gh.fade)
      gm.scale.setScalar(1 - 0.25 * f)
      ;(gm.material as THREE.MeshPhysicalMaterial).opacity = 1 - f * f
    } else gm.visible = false

    // Contact shadow
    const h = Math.max(0, ball.position.y - DIM.ballR)
    const sh = v.ballShadow
    sh.position.set(ball.position.x + h * 0.08, 0.003, ball.position.z + h * 0.05)
    sh.scale.setScalar(0.36 * (1 + h * 0.45))
    ;(sh.material as THREE.MeshBasicMaterial).opacity = 0.62 / (1 + h * 1.6)

    if (skipDraw) {
      this.updateFire(dt)
      return
    }
    v.net.updateMesh()

    // Rim glow
    this.rimGlow = Math.max(0, this.rimGlow - dt * 2.2)
    v.rimMat.emissiveIntensity = this.rimGlow * 1.1

    // Crowd brightness pulse on streaks
    this.crowdPulse = Math.max(0, this.crowdPulse - dt * 0.9)
    const pulse = 1 + 0.16 * Math.sin(Math.min(1, this.crowdPulse) * Math.PI * 0.5)
    v.backdropMat.color.copy(this.backdropBase).multiplyScalar(pulse)

    // Camera nudge (push-in) + tiny impact shake
    this.nudge = Math.max(0, this.nudge - dt * 2.4)
    this.shake = Math.max(0, this.shake - dt * 3)
    const n = Math.sin(this.nudge * Math.PI) * 0.5 * this.nudge
    const sk = this.shake * this.shake
    const tt = this.simTime * 60
    v.camera.position.set(
      v.camBase.x + Math.sin(tt * 1.7) * 0.006 * sk,
      v.camBase.y + n * 0.05 + Math.cos(tt * 2.3) * 0.006 * sk,
      v.camBase.z - n * 0.22,
    )
    v.camera.rotation.set(v.pitch + n * 0.006, 0, 0)
    this.updateFire(dt)
    v.render()
  }

  /** previous emitter pos, unless the ball teleported (respawn) */
  private fireJump(prev: THREE.Vector3, cur: THREE.Vector3) {
    return prev.distanceTo(cur) > 0.6 ? cur : prev
  }

  /** Ball on fire while in flow state (streak ≥5), bigger at 10+. */
  updateFire(dt: number) {
    const v = this.view
    const level = this.ended ? 0 : this.streak >= 10 ? 2 : this.streak >= 5 ? 1 : 0
    const ems: FireEmitter[] = []
    const e0 = this.fireEm[0]
    e0.prev!.copy(this.fireJump(e0.pos, v.ball.position))
    e0.pos.copy(v.ball.position)
    if (this.shot) e0.vel.set(this.shot.b.v.x, this.shot.b.v.y, this.shot.b.v.z)
    else e0.vel.set(0, 0, 0)
    e0.strength = this.shot ? 1 : Math.max(0.05, this.respawnT) * 0.8
    e0.radius = DIM.ballR * v.ball.scale.x
    ems.push(e0)
    if (this.ghost && v.ballGhost.visible) {
      const e1 = this.fireEm[1]
      e1.prev!.copy(this.fireJump(e1.pos, v.ballGhost.position))
      e1.pos.copy(v.ballGhost.position)
      e1.vel.set(this.ghost.b.v.x, this.ghost.b.v.y, this.ghost.b.v.z)
      e1.strength = 1 - Math.min(1, this.ghost.fade)
      e1.radius = DIM.ballR * v.ballGhost.scale.x
      ems.push(e1)
    }
    if (this.fireLevel > 0 && level === 0) {
      for (const e of ems) this.fire.puff(e.pos, DIM.ballR)
    }
    this.fireLevel = level
    this.fire.setViewHeight(v.renderer.domElement.height)
    this.fire.update(dt, level, ems, v.ball, v.ballGhost)
    const m = v.ball.material as THREE.MeshPhysicalMaterial
    const glow = (level >= 2 ? 0.32 : 0.2) * (level > 0 ? 1 : 0)
    m.emissive.setRGB(1, 0.32, 0.06)
    m.emissiveIntensity += (glow - m.emissiveIntensity) * Math.min(1, dt * 8)
  }

  adapt(dt: number) {
    this.fpsFrames++
    this.fpsTime += dt
    if (this.fpsTime < 1) return
    const fps = this.fpsFrames / this.fpsTime
    this.fpsFrames = 0
    this.fpsTime = 0
    const v = this.view
    if (fps < 48) {
      this.fpsGood = 0
      if (v.dprScale > 0.6) {
        v.dprScale = Math.max(0.55, v.dprScale - 0.15)
        this.onResize()
      } else if (v.composer && fps < 40) {
        v.disableComposer()
      }
    } else if (fps > 58) {
      this.fpsGood++
      if (this.fpsGood >= 3 && v.dprScale < 1) {
        v.dprScale = Math.min(1, v.dprScale + 0.1)
        this.fpsGood = 0
        this.onResize()
      }
    }
  }

  onResize() {
    const r = this.host.getBoundingClientRect()
    const w = Math.max(1, Math.round(r.width))
    const h = Math.max(1, Math.round(r.height))
    this.view.resize(w, h)
    if (this.manual || !this.ready) return
    this.view.render()
  }

  setMuted(m: boolean) {
    setSfxMuted(m)
  }

  destroy() {
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    for (const t of this.timeouts) clearTimeout(t)
    this.ro?.disconnect()
    this.canvas.removeEventListener('pointerdown', this.onDown)
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)
    window.removeEventListener('pointercancel', this.onUp)
    this.fire?.dispose()
    this.view.dispose()
    this.canvas.remove()
    const g = globalThis as unknown as { __CV_SCENE?: Engine; __CV3D?: Engine }
    if (g.__CV_SCENE === this) delete g.__CV_SCENE
    if (g.__CV3D === this) delete g.__CV3D
  }
}

export function createCourtVision3D(host: HTMLElement, bridge: CvBridge, mode: CvMode): CourtVision3DHandle {
  const engine = new Engine(host, bridge, mode)
  void engine.init().catch((err) => {
    console.error('[court-vision-3d] init failed', err)
  })
  return {
    destroy: () => engine.destroy(),
    requestEnd: () => engine.requestEnd(),
    setMuted: (m) => engine.setMuted(m),
    setHold: (h) => {
      engine.hold = h
    },
  }
}
