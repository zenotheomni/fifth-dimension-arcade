import Phaser from 'phaser'
import {
  loadPersonalBest,
  savePersonalBest,
  scoreShot,
  streakMultiplier,
} from '../courtVision/scoring'
import { COURT_VISION_COPY } from '../copyLocks'
import {
  playBounce5d,
  playMake,
  playMiss,
  playRelease,
  playSwish,
  unlockAudio,
} from '../courtVision/sfx'
import {
  courtVisionSeedConfig,
  type CourtVisionSeedConfig,
} from '../core/seededRandom'
import { COURT_BG, HOOP_OVERLAY } from './bgLayout'
import {
  analyzeFlick,
  boardBounds,
  FLICK,
  type FlickSample,
  type FlickShot,
  type ShotOutcome,
} from './flickPhysics'
import type { CvBridge, CvChallengeConfig, CvHudState, CvMode } from './types'

const W = 390
const H = 844
const TUTORIAL_KEY = 'fd_cv_flick_tutorial_done'
const NET_FRAMES = 14
const BALL_NATIVE = 28

type FlightSeg = {
  x0: number
  y0: number
  x1: number
  y1: number
  peak: number
  duration: number
  /** 'arc' rising to contact, 'bounce' off board/rim, 'sink' through net, 'fall' to floor */
  kind: 'arc' | 'bounce' | 'sink' | 'fall'
  ease?: 'linear' | 'sineOut' | 'quadIn'
}

type ShotFlight = {
  segs: FlightSeg[]
  segIndex: number
  t: number
  spinning: boolean
  perfect: boolean
  power: number
  outcome: ShotOutcome
  allowOver: boolean
  contactedBoard: boolean
  contactedRim: boolean
  penetratedBoard: boolean
  overBoard: boolean
  finishNearRim: boolean
  lastX: number
  lastY: number
  netTriggered: boolean
  hitPaused: boolean
  hitPauseLeft: number
  scored: boolean
}

export function createCourtVisionGame(
  parent: HTMLElement,
  bridge: CvBridge,
  mode: CvMode,
): Phaser.Game {
  class CourtScene extends Phaser.Scene {
    ball!: Phaser.GameObjects.Sprite
    ballShadow!: Phaser.GameObjects.Image
    net!: Phaser.GameObjects.Sprite
    trailGraphics!: Phaser.GameObjects.Graphics
    fireEmitter!: Phaser.GameObjects.Particles.ParticleEmitter
    hoopRoot!: Phaser.GameObjects.Container
    crowdFlash!: Phaser.GameObjects.Rectangle
    tutorial!: Phaser.GameObjects.Container
    rimFront!: Phaser.GameObjects.Image
    rimGlow!: Phaser.GameObjects.Graphics
    wordmarkSpr!: Phaser.GameObjects.Image

    mode: CvMode = mode
    challengeCfg: CvChallengeConfig | null = bridge.challenge ?? null
    score = 0
    streak = 0
    timeLeft = 60
    phase: CvHudState['phase'] = 'ready'
    pb = 0
    callout: string | null = null
    lastPoints: number | null = null
    announcedX5 = false
    announcedX10 = false
    firstMake = false
    flight: ShotFlight | null = null
    flicking = false
    samples: FlickSample[] = []
    hoopX = W * COURT_BG.hoopX
    hoopY = H * COURT_BG.hoopY
    baseHoopX = W * COURT_BG.hoopX
    baseHoopY = H * COURT_BG.hoopY
    seedCfg: CourtVisionSeedConfig | null = null
    elapsed = 0
    shake = 0
    camNudge = 0
    ended = false
    ballHome = { x: W / 2, y: H * FLICK.homeYFrac }
    trail: { x: number; y: number; a: number }[] = []
    respawning = false
    showTutorial = false
    lastShotMeta: {
      penetratedBoard: boolean
      contactedBoard: boolean
      contactedRim: boolean
      overBoard: boolean
      finishNearRim: boolean
      outcome: ShotOutcome | null
      kind: 'swish' | 'make' | 'miss' | null
    } = {
      penetratedBoard: false,
      contactedBoard: false,
      contactedRim: false,
      overBoard: false,
      finishNearRim: false,
      outcome: null,
      kind: null,
    }

    constructor() {
      super('CourtVision')
    }

    preload() {
      const base = import.meta.env.BASE_URL
      this.load.image('court', `${base}art/court-bg.webp`)
      this.load.spritesheet('ball', `${base}art/ball-sheet.png`, {
        frameWidth: BALL_NATIVE,
        frameHeight: BALL_NATIVE,
      })
      this.load.image('ballShadow', `${base}art/ball-shadow.png`)
      this.load.image('fire', `${base}art/fire-particle.png`)
      this.load.image('firePurple', `${base}art/fire-particle-purple.png`)
      this.load.image('rimFront', `${base}art/rim-front.png`)
      this.load.image('wordmarkBb', `${base}art/wordmark-backboard.webp`)
      for (let i = 0; i < NET_FRAMES; i++) {
        this.load.image(`net${i}`, `${base}art/net-${i}.png`)
      }
    }

    create() {
      unlockAudio()
      this.pb = loadPersonalBest()
      this.cameras.main.setBackgroundColor('#1c0c30')
      this.cameras.main.roundPixels = true

      const seed = this.challengeCfg?.seed?.trim()
      this.seedCfg = seed ? courtVisionSeedConfig(seed) : null
      this.ballHome = {
        x: W / 2 + (this.seedCfg ? this.seedCfg.ballHomeOffsetX * 0.45 : 0),
        y: H * FLICK.homeYFrac,
      }

      const bg = this.add.image(W / 2, H / 2, 'court')
      bg.setDisplaySize(W, H)
      bg.setDepth(0)
      bg.texture.setFilter(Phaser.Textures.FilterMode.NEAREST)

      this.crowdFlash = this.add
        .rectangle(W / 2, H * 0.38, W, H * 0.18, 0xffc83c, 0)
        .setDepth(2)

      this.baseHoopX = W * COURT_BG.hoopX
      this.baseHoopY = H * COURT_BG.hoopY
      this.hoopX = this.baseHoopX
      this.hoopY = this.baseHoopY
      this.hoopRoot = this.add.container(this.hoopX, this.hoopY).setDepth(5)

      // Net overlay hanging from baked rim (always visible)
      if (this.textures.exists('net0')) {
        this.anims.create({
          key: 'net-swish',
          frames: Array.from({ length: NET_FRAMES }, (_, i) => ({
            key: `net${i}`,
          })),
          frameRate: 22,
          repeat: 0,
        })
        this.anims.create({
          key: 'net-rim',
          frames: Array.from({ length: NET_FRAMES }, (_, i) => ({
            key: `net${i}`,
          })),
          frameRate: 14,
          repeat: 0,
        })
        this.anims.create({
          key: 'net-jiggle',
          frames: [
            { key: 'net0' },
            { key: 'net1' },
            { key: 'net2' },
            { key: 'net1' },
            { key: 'net0' },
            { key: 'net13' },
            { key: 'net0' },
          ],
          frameRate: 16,
          repeat: 0,
        })
        this.net = this.add
          .sprite(0, HOOP_OVERLAY.netOffsetY, 'net0')
          .setDisplaySize(HOOP_OVERLAY.netW, HOOP_OVERLAY.netH)
          .setOrigin(0.5, 0)
          .setAlpha(0.95)
        this.net.texture.setFilter(Phaser.Textures.FilterMode.NEAREST)
        this.hoopRoot.add(this.net)
      }

      // Front rim lip — ball passes behind this on sink
      this.rimFront = this.add
        .image(this.hoopX, this.hoopY + 3, 'rimFront')
        .setDisplaySize(HOOP_OVERLAY.rimFrontW, HOOP_OVERLAY.rimFrontH)
        .setOrigin(0.5, 0.45)
        .setDepth(7)
      this.rimFront.texture.setFilter(Phaser.Textures.FilterMode.NEAREST)

      this.rimGlow = this.add.graphics().setDepth(6.5).setAlpha(0)

      // Real stacked logo — pre-sized texture, LINEAR for clean edges under pixelArt
      this.wordmarkSpr = this.add
        .image(W * COURT_BG.wordmarkX, H * COURT_BG.wordmarkY, 'wordmarkBb')
        .setDisplaySize(COURT_BG.wordmarkW, COURT_BG.wordmarkH)
        .setDepth(4)
      this.wordmarkSpr.texture.setFilter(Phaser.Textures.FilterMode.LINEAR)

      this.trailGraphics = this.add.graphics().setDepth(8)

      if (!this.anims.exists('ball-spin')) {
        this.anims.create({
          key: 'ball-spin',
          frames: this.anims.generateFrameNumbers('ball', { start: 0, end: 7 }),
          frameRate: 14,
          repeat: -1,
        })
      }

      this.ballShadow = this.add
        .image(this.ballHome.x, this.ballHome.y + 28, 'ballShadow')
        .setDisplaySize(40, 14)
        .setAlpha(0.45)
        .setDepth(9)
      if (this.textures.exists('ballShadow')) {
        this.ballShadow.texture.setFilter(Phaser.Textures.FilterMode.NEAREST)
      }

      this.ball = this.add
        .sprite(this.ballHome.x, this.ballHome.y, 'ball', 0)
        .setDisplaySize(FLICK.ballStartSize, FLICK.ballStartSize)
        .setDepth(10)
        .setInteractive({
          useHandCursor: true,
          hitArea: new Phaser.Geom.Circle(0, 0, FLICK.hitRadius),
          hitAreaCallback: Phaser.Geom.Circle.Contains,
        })
      this.ball.texture.setFilter(Phaser.Textures.FilterMode.NEAREST)

      this.fireEmitter = this.add.particles(0, 0, 'fire', {
        lifespan: { min: 280, max: 520 },
        speed: { min: 30, max: 90 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 0.95, end: 0 },
        frequency: 28,
        gravityY: -40,
        blendMode: 'ADD',
        emitting: false,
        tint: [0xff8c28, 0xff5a3c, 0xffc83c, 0x482078],
      })
      this.fireEmitter.setDepth(9)

      this.buildTutorial()

      this.input.on('pointerdown', this.onDown, this)
      this.input.on('pointermove', this.onMove, this)
      this.input.on('pointerup', this.onUp, this)
      this.input.on('pointerupoutside', this.onUp, this)

      this.phase = 'playing'
      this.emitHud()

      if (this.mode === 'timed' || this.mode === 'challenge') {
        this.time.addEvent({
          delay: 1000,
          loop: true,
          callback: () => {
            if (this.phase !== 'playing' || this.ended) return
            this.timeLeft -= 1
            if (this.timeLeft <= 0) {
              this.timeLeft = 0
              this.endRun()
            }
            this.emitHud()
          },
        })
      }

      ;(globalThis as unknown as { __CV_SCENE?: CourtScene }).__CV_SCENE = this
    }

    syncRimFront() {
      this.rimFront.setPosition(this.hoopX, this.hoopY + 2)
    }

    buildTutorial() {
      try {
        this.showTutorial = !localStorage.getItem(TUTORIAL_KEY)
      } catch {
        this.showTutorial = true
      }
      this.tutorial = this.add.container(this.ballHome.x, this.ballHome.y - 70).setDepth(12)
      const arrow = this.add.graphics()
      arrow.fillStyle(0xffc83c, 0.55)
      arrow.fillTriangle(-10, 18, 10, 18, 0, -6)
      arrow.fillRect(-3, 14, 6, 28)
      const label = this.add
        .text(0, 52, 'FLICK', {
          fontFamily: 'Bungee, sans-serif',
          fontSize: '11px',
          color: '#ffc83c',
        })
        .setOrigin(0.5)
        .setAlpha(0.7)
      this.tutorial.add([arrow, label])
      this.tutorial.setVisible(this.showTutorial)
      if (this.showTutorial) {
        this.tweens.add({
          targets: this.tutorial,
          y: this.ballHome.y - 110,
          alpha: { from: 0.35, to: 1 },
          duration: 700,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        })
      }
    }

    dismissTutorial() {
      if (!this.showTutorial) return
      this.showTutorial = false
      this.tutorial.setVisible(false)
      try {
        localStorage.setItem(TUTORIAL_KEY, '1')
      } catch {
        /* ignore */
      }
    }

    emitHud(callout: string | null = this.callout) {
      const state: CvHudState = {
        score: this.score,
        streak: this.streak,
        multiplier: streakMultiplier(this.streak),
        timeLeft:
          this.mode === 'timed' || this.mode === 'challenge'
            ? this.timeLeft
            : null,
        phase: this.phase,
        callout,
        lastPoints: this.lastPoints,
        pb: this.pb,
        newPb: false,
        mode: this.mode,
      }
      bridge.onHud(state)
    }

    canAcceptTouch(p: Phaser.Input.Pointer) {
      if (this.phase !== 'playing' || this.flight || this.ended || this.respawning)
        return false
      if (p.y > H * FLICK.lowerTouchFrac) return true
      const d = Phaser.Math.Distance.Between(p.x, p.y, this.ball.x, this.ball.y)
      return d <= FLICK.hitRadius
    }

    onDown(p: Phaser.Input.Pointer) {
      if (!this.canAcceptTouch(p)) return
      this.flicking = true
      this.samples = [{ x: p.x, y: p.y, t: p.time }]
    }

    onMove(p: Phaser.Input.Pointer) {
      if (!this.flicking) return
      this.samples.push({ x: p.x, y: p.y, t: p.time })
      const cutoff = p.time - 240
      while (this.samples.length > 2 && this.samples[0].t < cutoff) {
        this.samples.shift()
      }
    }

    onUp(p: Phaser.Input.Pointer) {
      if (!this.flicking) return
      this.flicking = false
      const shot = analyzeFlick(
        this.samples,
        { x: p.x, y: p.y, t: p.time },
        { x: this.hoopX, y: this.hoopY },
        this.seedCfg?.windBias ?? 0,
        H,
      )
      this.samples = []
      if (!shot) return
      this.launchShot(shot)
    }

    debugFlick(opts: {
      dx?: number
      dy?: number
      speed?: number
      sampleMs?: number
    }) {
      if (this.phase !== 'playing' || this.flight || this.ended || this.respawning)
        return null
      const ms = opts.sampleMs ?? FLICK.sampleMs
      const speed = opts.speed ?? FLICK.speedRef
      let dx = opts.dx ?? 0
      let dy = opts.dy ?? -(speed * ms)
      if (opts.speed != null && opts.dy == null) {
        const dist = speed * ms
        if (opts.dx != null && Math.abs(opts.dx) > 1) {
          const ang = Math.atan2(opts.dx, dist)
          dx = Math.sin(ang) * dist
          dy = -Math.cos(ang) * dist
        } else {
          dx = 0
          dy = -dist
        }
      }
      const t0 = this.time.now
      const shot = analyzeFlick(
        [{ x: this.ball.x, y: this.ball.y, t: t0 }],
        { x: this.ball.x + dx, y: this.ball.y + dy, t: t0 + ms },
        { x: this.hoopX, y: this.hoopY },
        this.seedCfg?.windBias ?? 0,
        H,
      )
      if (!shot) return null
      this.launchShot(shot)
      return shot
    }

    /** Continuous sink + floor fall for makes. */
    makeSinkSegs(fromX: number, fromY: number): FlightSeg[] {
      const cx = this.hoopX
      // Enter rim center cleanly
      const enterY = this.hoopY + 2
      const midNetY = this.hoopY + 48
      const exitY = this.hoopY + 108
      const floorY = H * 0.88
      return [
        {
          x0: fromX,
          y0: fromY,
          x1: cx,
          y1: enterY,
          peak: 0,
          duration: 90,
          kind: 'sink',
          ease: 'sineOut',
        },
        {
          x0: cx,
          y0: enterY,
          x1: cx,
          y1: midNetY,
          peak: 0,
          duration: FLICK.sinkDuration * 0.45,
          kind: 'sink',
          ease: 'linear',
        },
        {
          x0: cx,
          y0: midNetY,
          x1: cx,
          y1: exitY,
          peak: 0,
          duration: FLICK.sinkDuration * 0.4,
          kind: 'sink',
          ease: 'quadIn',
        },
        {
          x0: cx,
          y0: exitY,
          x1: cx + (Math.random() - 0.5) * 8,
          y1: floorY,
          peak: 10,
          duration: FLICK.floorFallDuration,
          kind: 'fall',
          ease: 'quadIn',
        },
      ]
    }

    launchShot(shot: FlickShot) {
      this.dismissTutorial()
      playRelease()
      this.trail = []
      const segs: FlightSeg[] = []
      const x0 = this.ball.x
      const y0 = this.ball.y

      if (shot.outcome === 'bank') {
        const bankPeak = Math.min(shot.peak, Math.max(12, (y0 - shot.contactY) * 0.35))
        segs.push({
          x0,
          y0,
          x1: shot.contactX,
          y1: shot.contactY,
          peak: bankPeak,
          duration: shot.duration,
          kind: 'arc',
        })
        const bankMake =
          Math.hypot(shot.finalX - this.hoopX, shot.finalY - this.hoopY) < 16
        segs.push({
          x0: shot.contactX,
          y0: shot.contactY,
          x1: bankMake ? this.hoopX : shot.finalX,
          y1: bankMake ? this.hoopY : shot.finalY,
          peak: bankMake ? 14 : 10,
          duration: FLICK.bounceDuration,
          kind: 'bounce',
          ease: 'sineOut',
        })
        if (bankMake) {
          segs.push(...this.makeSinkSegs(this.hoopX, this.hoopY))
        }
      } else if (shot.outcome === 'front_clank') {
        segs.push({
          x0,
          y0,
          x1: shot.contactX,
          y1: shot.contactY,
          peak: shot.peak * 0.75,
          duration: shot.duration * 0.9,
          kind: 'arc',
        })
        segs.push({
          x0: shot.contactX,
          y0: shot.contactY,
          x1: shot.finalX,
          y1: shot.finalY,
          peak: 8,
          duration: 240,
          kind: 'bounce',
        })
      } else if (shot.outcome === 'over') {
        segs.push({
          x0,
          y0,
          x1: shot.finalX,
          y1: shot.finalY,
          peak: shot.peak * 1.15,
          duration: shot.duration * 1.05,
          kind: 'arc',
        })
      } else if (shot.outcome === 'wide') {
        segs.push({
          x0,
          y0,
          x1: shot.contactX,
          y1: shot.contactY,
          peak: shot.peak * 0.85,
          duration: shot.duration,
          kind: 'arc',
        })
        segs.push({
          x0: shot.contactX,
          y0: shot.contactY,
          x1: shot.finalX,
          y1: shot.finalY,
          peak: 6,
          duration: 220,
          kind: 'bounce',
        })
      } else {
        // swish / rim — arc to rim center, then continuous sink
        const rimApproach =
          shot.outcome === 'rim'
            ? { x: shot.finalX, y: this.hoopY - 2 }
            : { x: this.hoopX + (shot.finalX - this.hoopX) * 0.1, y: this.hoopY - 1 }
        segs.push({
          x0,
          y0,
          x1: rimApproach.x,
          y1: rimApproach.y,
          peak: shot.peak,
          duration: shot.duration,
          kind: 'arc',
        })
        if (shot.outcome === 'rim') {
          // Small rattle on rim before drop
          segs.push({
            x0: rimApproach.x,
            y0: rimApproach.y,
            x1: this.hoopX + (rimApproach.x - this.hoopX) * 0.3,
            y1: this.hoopY + 1,
            peak: 5,
            duration: 120,
            kind: 'bounce',
            ease: 'sineOut',
          })
        }
        segs.push(...this.makeSinkSegs(this.hoopX, this.hoopY))
      }

      this.flight = {
        segs,
        segIndex: 0,
        t: 0,
        spinning: true,
        perfect: shot.perfect,
        power: shot.power,
        outcome: shot.outcome,
        allowOver: shot.allowOver,
        contactedBoard: false,
        contactedRim: false,
        penetratedBoard: false,
        overBoard: shot.outcome === 'over',
        finishNearRim: false,
        lastX: x0,
        lastY: y0,
        netTriggered: false,
        hitPaused: false,
        hitPauseLeft: 0,
        scored: false,
      }
      this.ball.play('ball-spin')
      if (this.streak >= 3) this.fireEmitter.startFollow(this.ball)
    }

    segEase(u: number, ease?: FlightSeg['ease']) {
      if (ease === 'sineOut') return Math.sin((u * Math.PI) / 2)
      if (ease === 'quadIn') return u * u
      return u
    }

    segPos(seg: FlightSeg, uRaw: number) {
      const u = this.segEase(uRaw, seg.ease)
      const x = Phaser.Math.Linear(seg.x0, seg.x1, u)
      const y =
        Phaser.Math.Linear(seg.y0, seg.y1, u) -
        Math.sin(Math.PI * uRaw) * seg.peak
      return { x, y }
    }

    /** Stepped integer multiples of native 28px so NEAREST stays crisp. */
    setBallSize(ideal: number) {
      const native = BALL_NATIVE
      // Allowed: 28, 56, 84, 112
      const steps = [native, native * 2, native * 3, native * 4]
      let size = steps[0]
      let best = Math.abs(ideal - size)
      for (const s of steps) {
        const d = Math.abs(ideal - s)
        if (d < best) {
          best = d
          size = s
        }
      }
      this.ball.setDisplaySize(size, size)
    }

    enforceBoardCollision(flight: ShotFlight, x: number, y: number) {
      if (flight.allowOver || flight.contactedBoard) return { x, y }
      if (flight.segs[flight.segIndex]?.kind === 'sink' || flight.segs[flight.segIndex]?.kind === 'fall') {
        return { x, y }
      }
      const b = boardBounds(this.hoopX, this.hoopY, H)
      const insideX = x >= b.left && x <= b.right
      const throughGlass = insideX && y < b.contactY - 1 && y >= b.top
      if (throughGlass) {
        flight.contactedBoard = true
        const cx = Phaser.Math.Clamp(x, b.left + 6, b.right - 6)
        const cy = b.contactY
        const lateral = cx - this.hoopX
        const bankIn = Math.abs(lateral) < 14 && flight.power <= 1.42
        const finalX = bankIn
          ? this.hoopX + lateral * 0.2
          : cx + (lateral >= 0 ? 30 : -30)
        const finalY = bankIn ? this.hoopY : this.hoopY + 42
        const bounce: FlightSeg = {
          x0: cx,
          y0: cy,
          x1: finalX,
          y1: finalY,
          peak: bankIn ? 16 : 8,
          duration: FLICK.bounceDuration,
          kind: 'bounce',
        }
        flight.segs = [bounce]
        if (bankIn) {
          flight.segs.push(...this.makeSinkSegs(finalX, finalY))
          flight.outcome = 'bank'
        }
        flight.segIndex = 0
        flight.t = 0
        this.shake = Math.max(this.shake, 70)
        return { x: cx, y: cy }
      }
      return { x, y }
    }

    triggerNet(outcome: ShotOutcome) {
      if (!this.net) return
      this.net.setAlpha(0.95)
      const key =
        outcome === 'swish'
          ? 'net-swish'
          : outcome === 'front_clank'
            ? 'net-jiggle'
            : 'net-rim'
      this.net.play(key)
      this.net.once('animationcomplete', () => {
        if (this.net) {
          this.net.setTexture('net0')
          this.net.setAlpha(0.92)
        }
      })
    }

    flashRimGlow(strong: boolean) {
      this.rimGlow.clear()
      this.rimGlow.setPosition(0, 0)
      const alpha = strong ? 0.55 : 0.28
      this.rimGlow.fillStyle(0xffe08a, alpha)
      this.rimGlow.fillCircle(this.hoopX, this.hoopY, strong ? 34 : 26)
      this.rimGlow.fillStyle(0xff8c28, alpha * 0.6)
      this.rimGlow.fillCircle(this.hoopX, this.hoopY, strong ? 22 : 16)
      this.rimGlow.setAlpha(1)
      this.tweens.add({
        targets: this.rimGlow,
        alpha: 0,
        duration: strong ? 320 : 220,
        ease: 'Quad.easeOut',
        onComplete: () => this.rimGlow.clear(),
      })
    }

    beginMakeFeel(flight: ShotFlight) {
      if (flight.scored) return
      flight.scored = true
      flight.hitPaused = true
      flight.hitPauseLeft = FLICK.hitPauseMs

      const isSwish = flight.outcome === 'swish'
      const isMake =
        flight.outcome === 'swish' ||
        flight.outcome === 'rim' ||
        (flight.outcome === 'bank' &&
          flight.segs.some((s) => s.kind === 'sink'))

      if (!isMake) return

      // Score immediately on sink entry so callout syncs with net
      let kind: 'swish' | 'make' | 'miss' = isSwish ? 'swish' : 'make'
      const banked = flight.outcome === 'bank'
      const result = scoreShot({
        kind,
        streakBefore: this.streak,
        perfectRelease: flight.perfect,
        banked5d: banked,
      })
      this.streak = result.streakAfter
      this.lastPoints = result.points || null
      this.score += result.points
      this.cheer()

      if (isSwish) {
        playSwish()
        this.camNudge = 140
        this.flashRimGlow(true)
        this.callout = 'SWISH!'
      } else {
        playMake()
        this.flashRimGlow(false)
        this.callout = banked ? '5D BOUNCE' : 'MAKE'
      }
      if (banked) playBounce5d()
      this.triggerNet(flight.outcome)

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

      this.lastShotMeta = {
        penetratedBoard: flight.penetratedBoard,
        contactedBoard: flight.contactedBoard,
        contactedRim: flight.contactedRim || flight.outcome === 'rim',
        overBoard: flight.overBoard,
        finishNearRim: true,
        outcome: flight.outcome,
        kind,
      }
      this.emitHud(this.callout)
      this.time.delayedCall(900, () => {
        this.callout = null
        this.lastPoints = null
        this.emitHud(null)
      })
    }

    update(_time: number, delta: number) {
      this.elapsed += delta

      if (this.seedCfg && this.phase === 'playing' && !this.ended) {
        const s = this.seedCfg
        const ang = this.elapsed * s.swaySpeed + s.swayPhase
        this.hoopX = this.baseHoopX + Math.sin(ang) * s.swayAmpX
        this.hoopY = this.baseHoopY + Math.sin(ang * 1.37 + 0.6) * s.swayAmpY
        this.hoopRoot.setPosition(this.hoopX, this.hoopY)
        this.syncRimFront()
      }

      let scrollX = 0
      let scrollY = 0
      if (this.shake > 0) {
        this.shake -= delta
        scrollX += (Math.random() - 0.5) * 5
        scrollY += (Math.random() - 0.5) * 5
      }
      if (this.camNudge > 0) {
        this.camNudge -= delta
        const t = this.camNudge / 140
        scrollY += -3.5 * Math.sin((1 - t) * Math.PI) * t
      }
      this.cameras.main.setScroll(scrollX, scrollY)

      if (!this.flight && !this.respawning && this.phase === 'playing') {
        const bob =
          Math.sin((this.elapsed / FLICK.bobPeriod) * Math.PI * 2) * FLICK.bobAmp
        this.ball.setPosition(this.ballHome.x, this.ballHome.y + bob)
        this.ballShadow.setPosition(
          this.ballHome.x + 2,
          this.ballHome.y + 28 + bob * 0.3,
        )
        this.ballShadow.setAlpha(0.4)
        this.ballShadow.setDisplaySize(40, 14)
        if (this.tutorial?.visible) {
          this.tutorial.x = this.ballHome.x
        }
      }

      if (!this.flight) {
        this.trailGraphics.clear()
        return
      }

      const flight = this.flight

      // Hit-pause: freeze briefly on make entry
      if (flight.hitPaused && flight.hitPauseLeft > 0) {
        flight.hitPauseLeft -= delta
        if (flight.hitPauseLeft <= 0) flight.hitPaused = false
        return
      }

      const seg = flight.segs[flight.segIndex]
      if (!seg) {
        this.finishFlight(flight)
        return
      }

      flight.t += delta
      const u = Phaser.Math.Clamp(flight.t / seg.duration, 0, 1)
      let { x, y } = this.segPos(seg, u)
      ;({ x, y } = this.enforceBoardCollision(flight, x, y))

      const rimDist = Math.hypot(x - this.hoopX, y - this.hoopY)
      if (rimDist < 28 && (seg.kind === 'arc' || seg.kind === 'bounce')) {
        flight.contactedRim = true
      }
      if (flight.outcome === 'bank' && seg.kind === 'bounce') {
        flight.contactedBoard = true
      }

      // Trigger make feel + net when first entering sink
      if (seg.kind === 'sink' && !flight.netTriggered) {
        flight.netTriggered = true
        this.beginMakeFeel(flight)
      }

      this.ball.setPosition(x, y)
      flight.lastX = x
      flight.lastY = y

      const totalDur = flight.segs.reduce((s, g) => s + g.duration, 0)
      const doneDur =
        flight.segs
          .slice(0, flight.segIndex)
          .reduce((s, g) => s + g.duration, 0) + flight.t
      const pathU = Phaser.Math.Clamp(doneDur / totalDur, 0, 1)

      // Scale down toward rim; hold near native through sink/fall
      let ideal: number
      if (seg.kind === 'sink' || seg.kind === 'fall') {
        ideal = FLICK.ballRimSize
      } else {
        ideal = Phaser.Math.Linear(
          FLICK.ballStartSize,
          FLICK.ballRimSize,
          Math.pow(Math.min(pathU * 1.15, 1), 0.85),
        )
      }
      this.setBallSize(ideal)

      // Layering: behind front lip while in net; in front of net mesh
      if (seg.kind === 'sink') {
        this.ball.setDepth(6) // above net (in hoopRoot ~5), below rimFront (7)
      } else if (seg.kind === 'fall') {
        this.ball.setDepth(8)
      } else if (seg.kind === 'bounce' && u > 0.35) {
        this.ball.setDepth(6)
      } else if (pathU < 0.5) {
        this.ball.setDepth(10)
      } else {
        this.ball.setDepth(6)
      }
      if (flight.contactedBoard && seg.kind !== 'sink' && seg.kind !== 'fall') {
        this.ball.setDepth(Math.max(this.ball.depth, 6))
      }

      const shadowScale = Phaser.Math.Linear(1, 0.35, Math.min(pathU, 1))
      this.ballShadow.setPosition(x + 2, y + 18 * shadowScale + 8)
      this.ballShadow.setDisplaySize(40 * shadowScale, 14 * shadowScale)
      this.ballShadow.setAlpha(
        seg.kind === 'fall' ? 0.35 : 0.4 * (1 - pathU * 0.7),
      )
      this.ballShadow.setDepth(Math.min(this.ball.depth - 1, 9))

      this.trail.push({ x, y, a: 0.55 })
      if (this.trail.length > 12) this.trail.shift()
      this.trailGraphics.clear()
      for (let i = 0; i < this.trail.length; i++) {
        const p = this.trail[i]
        p.a *= 0.88
        const r = 4 + (i / this.trail.length) * 6
        this.trailGraphics.fillStyle(0xff8c28, p.a * 0.5)
        this.trailGraphics.fillCircle(p.x, p.y, r)
      }

      if (!this.ball.anims.isPlaying) this.ball.play('ball-spin')
      if (this.streak >= 3) this.fireEmitter.emitting = true

      if (u >= 1) {
        if (seg.kind === 'arc' && flight.outcome === 'bank') {
          flight.contactedBoard = true
          this.shake = Math.max(this.shake, 60)
        }
        if (seg.kind === 'arc' && flight.outcome === 'front_clank') {
          flight.contactedRim = true
          this.shake = Math.max(this.shake, 50)
          this.triggerNet('front_clank')
        }
        flight.segIndex += 1
        flight.t = 0
        if (flight.segIndex >= flight.segs.length) {
          flight.finishNearRim =
            Math.hypot(x - this.hoopX, y - this.hoopY) < FLICK.nearRimRadius ||
            flight.contactedBoard ||
            flight.contactedRim ||
            flight.outcome === 'wide' ||
            flight.outcome === 'front_clank' ||
            flight.outcome === 'bank' ||
            flight.outcome === 'swish' ||
            flight.outcome === 'rim'
          this.finishFlight(flight)
        }
      }
    }

    cheer() {
      this.tweens.add({
        targets: this.crowdFlash,
        fillAlpha: 0.18,
        duration: 80,
        yoyo: true,
        onComplete: () => {
          this.crowdFlash.setFillStyle(0xffc83c, 0)
        },
      })
    }

    finishFlight(flight: ShotFlight) {
      this.flight = null
      this.fireEmitter.emitting = false
      this.fireEmitter.stopFollow()
      this.trailGraphics.clear()
      this.trail = []

      if (flight.scored) {
        // Already scored during sink — soft fade then reset
        this.tweens.add({
          targets: this.ball,
          alpha: 0,
          duration: 180,
          onComplete: () => this.resetBall(),
        })
        return
      }

      this.resolveMiss(flight)
    }

    resolveMiss(flight: ShotFlight) {
      const dx = flight.lastX - this.hoopX
      const result = scoreShot({
        kind: 'miss',
        streakBefore: this.streak,
        perfectRelease: false,
        banked5d: false,
      })
      this.streak = result.streakAfter
      this.lastPoints = null
      playMiss()
      this.callout = COURT_VISION_COPY.LOST_CHALLENGE

      this.lastShotMeta = {
        penetratedBoard: flight.penetratedBoard,
        contactedBoard: flight.contactedBoard,
        contactedRim: flight.contactedRim,
        overBoard: flight.overBoard,
        finishNearRim: flight.finishNearRim,
        outcome: flight.outcome,
        kind: 'miss',
      }

      const missDir = dx >= 0 ? 1 : -1
      this.tweens.add({
        targets: this.ball,
        x: this.ball.x + missDir * 28,
        y: this.ball.y + 70,
        alpha: 0.35,
        duration: 260,
        onComplete: () => this.resetBall(),
      })

      this.emitHud(this.callout)
      this.time.delayedCall(900, () => {
        this.callout = null
        this.lastPoints = null
        this.emitHud(null)
      })
    }

    resetBall() {
      this.respawning = true
      this.ball.anims.stop()
      this.ball.setFrame(0)
      this.ball.setAlpha(0)
      this.ball.setDepth(10)
      this.setBallSize(FLICK.ballStartSize)
      this.ball.setPosition(this.ballHome.x, this.ballHome.y + 20)
      this.ballShadow.setAlpha(0)

      this.tweens.add({
        targets: this.ball,
        alpha: 1,
        y: this.ballHome.y,
        duration: FLICK.respawnMs,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.respawning = false
          this.ball.setAlpha(1)
          this.ballShadow.setAlpha(0.4)
        },
      })
      this.tweens.add({
        targets: this.ballShadow,
        alpha: 0.4,
        duration: FLICK.respawnMs,
      })
      this.ballShadow.setPosition(this.ballHome.x + 2, this.ballHome.y + 28)
      this.ballShadow.setDisplaySize(40, 14)
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
      if (this.challengeCfg) {
        beatChallenge = this.score >= this.challengeCfg.targetScore
        this.callout = beatChallenge
          ? COURT_VISION_COPY.WON_CHALLENGE
          : COURT_VISION_COPY.LOST_CHALLENGE
      } else if (newPb) {
        this.callout = COURT_VISION_COPY.NEW_PB
      }
      this.emitHud(this.callout)
      bridge.onEnded({
        score: this.score,
        pb: next,
        newPb,
        mode: this.mode,
        beatChallenge,
      })
    }

    requestEnd() {
      this.endRun()
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: W,
    height: H,
    backgroundColor: '#1c0c30',
    scene: CourtScene,
    scale: {
      mode: Phaser.Scale.ENVELOP,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      pixelArt: true,
      antialias: false,
      roundPixels: true,
    },
    audio: { noAudio: true },
    banner: false,
    input: {
      activePointers: 2,
    },
  })

  ;(parent as HTMLElement & { __phaserGame?: Phaser.Game }).__phaserGame = game
  ;(globalThis as unknown as { __CV_GAME?: Phaser.Game }).__CV_GAME = game

  return game
}
