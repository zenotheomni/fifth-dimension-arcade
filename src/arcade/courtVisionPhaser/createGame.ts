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
import { COURT_BG } from './bgLayout'
import {
  analyzeFlick,
  FLICK,
  type FlickSample,
  type FlickShot,
} from './flickPhysics'
import type { CvBridge, CvChallengeConfig, CvHudState, CvMode } from './types'

const W = 390
const H = 844
const TUTORIAL_KEY = 'fd_cv_flick_tutorial_done'

type ShotFlight = {
  t: number
  duration: number
  x0: number
  y0: number
  x1: number
  y1: number
  peak: number
  spinning: boolean
  perfect: boolean
  power: number
  madePath: boolean
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
    rimFront!: Phaser.GameObjects.Graphics

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
    /** Rim center in screen space — painted hoop + seeded sway */
    hoopX = W * COURT_BG.hoopX
    hoopY = H * COURT_BG.hoopY
    baseHoopX = W * COURT_BG.hoopX
    baseHoopY = H * COURT_BG.hoopY
    seedCfg: CourtVisionSeedConfig | null = null
    elapsed = 0
    shake = 0
    ended = false
    ballHome = { x: W / 2, y: H * FLICK.homeYFrac }
    trail: { x: number; y: number; a: number }[] = []
    respawning = false
    showTutorial = false

    constructor() {
      super('CourtVision')
    }

    preload() {
      const base = import.meta.env.BASE_URL
      this.load.image('court', `${base}art/court-bg.webp`)
      this.load.spritesheet('ball', `${base}art/ball-sheet.png`, {
        frameWidth: 48,
        frameHeight: 48,
      })
      this.load.image('ballShadow', `${base}art/ball-shadow.png`)
      this.load.image('fire', `${base}art/fire-particle.png`)
      this.load.image('firePurple', `${base}art/fire-particle-purple.png`)
      for (let i = 0; i < 7; i++) {
        this.load.image(`net${i}`, `${base}art/net-${i}.png`)
      }
    }

    create() {
      unlockAudio()
      this.pb = loadPersonalBest()
      this.cameras.main.setBackgroundColor('#1c0c30')

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

      if (this.textures.exists('net0')) {
        const frames = [0, 1, 2, 3, 4, 5, 6, 4, 2, 1].map((i) => ({
          key: `net${i}`,
        }))
        this.anims.create({
          key: 'net-swish',
          frames,
          frameRate: 16,
          repeat: 0,
        })
        this.net = this.add.sprite(0, 22, 'net0').setScale(1.1).setAlpha(0)
        this.net.texture.setFilter(Phaser.Textures.FilterMode.NEAREST)
        this.hoopRoot.add(this.net)
      }

      // Subtle front-rim arc for layering cue (ball goes behind on descent)
      this.rimFront = this.add.graphics().setDepth(7)
      this.drawRimFront()

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

      // Debug / harness hook
      ;(globalThis as unknown as { __CV_SCENE?: CourtScene }).__CV_SCENE = this
    }

    drawRimFront() {
      this.rimFront.clear()
      // Thin orange arc at rim — visual only for depth; low alpha
      this.rimFront.lineStyle(3, 0xff8c28, 0.35)
      this.rimFront.beginPath()
      this.rimFront.arc(this.hoopX, this.hoopY + 2, 22, Math.PI * 0.15, Math.PI * 0.85, false)
      this.rimFront.strokePath()
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
      // Keep buffer lean
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
      )
      this.samples = []
      if (!shot) return
      this.launchShot(shot)
    }

    /** Harness / debug: fire a synthetic flick (dx,dy over sampleMs). */
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
      // dy negative = up
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
      )
      if (!shot) return null
      this.launchShot(shot)
      return shot
    }

    launchShot(shot: FlickShot) {
      this.dismissTutorial()
      playRelease()
      this.trail = []
      this.flight = {
        t: 0,
        duration: shot.duration,
        x0: this.ball.x,
        y0: this.ball.y,
        x1: shot.targetX,
        y1: shot.targetY,
        peak: shot.peak,
        spinning: true,
        perfect: shot.perfect,
        power: shot.power,
        madePath: false,
      }
      this.ball.play('ball-spin')
      if (this.streak >= 3) this.fireEmitter.startFollow(this.ball)
    }

    update(_time: number, delta: number) {
      this.elapsed += delta

      if (this.seedCfg && this.phase === 'playing' && !this.ended) {
        const s = this.seedCfg
        const ang = this.elapsed * s.swaySpeed + s.swayPhase
        this.hoopX = this.baseHoopX + Math.sin(ang) * s.swayAmpX
        this.hoopY = this.baseHoopY + Math.sin(ang * 1.37 + 0.6) * s.swayAmpY
        this.hoopRoot.setPosition(this.hoopX, this.hoopY)
        this.drawRimFront()
      }

      if (this.shake > 0) {
        this.shake -= delta
        this.cameras.main.setScroll(
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5,
        )
        if (this.shake <= 0) this.cameras.main.setScroll(0, 0)
      }

      // Idle bob + shadow
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

      this.flight.t += delta
      const u = Phaser.Math.Clamp(this.flight.t / this.flight.duration, 0, 1)
      const x = Phaser.Math.Linear(this.flight.x0, this.flight.x1, u)
      const y =
        Phaser.Math.Linear(this.flight.y0, this.flight.y1, u) -
        Math.sin(Math.PI * u) * this.flight.peak
      this.ball.setPosition(x, y)

      // Perspective shrink toward hoop
      const size = Phaser.Math.Linear(
        FLICK.ballStartSize,
        FLICK.ballRimSize,
        Math.pow(u, 0.85),
      )
      this.ball.setDisplaySize(size, size)

      // Layering: in front going up, behind front-rim on the way down
      if (u < 0.52) this.ball.setDepth(10)
      else if (u < 0.68) this.ball.setDepth(6)
      else this.ball.setDepth(4)

      // Shadow tracks under ball, fades near rim
      const shadowScale = Phaser.Math.Linear(1, 0.35, u)
      this.ballShadow.setPosition(x + 2, y + 18 * shadowScale + 8)
      this.ballShadow.setDisplaySize(40 * shadowScale, 14 * shadowScale)
      this.ballShadow.setAlpha(0.4 * (1 - u * 0.7))
      this.ballShadow.setDepth(Math.min(this.ball.depth - 1, 9))

      // Trail
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
        this.resolveShot(this.flight)
        this.flight = null
        this.fireEmitter.emitting = false
        this.fireEmitter.stopFollow()
        this.trailGraphics.clear()
        this.trail = []
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

    resolveShot(flight: ShotFlight) {
      const dx = flight.x1 - this.hoopX
      const dy = flight.y1 - this.hoopY
      const err = Math.hypot(dx, dy)

      let kind: 'swish' | 'make' | 'miss' = 'miss'
      let banked = false
      if (err < 10) kind = 'swish'
      else if (err < 18) kind = 'make'
      else if (
        // Bank off backboard: a bit long + near center
        dy < -6 &&
        dy > -30 &&
        Math.abs(dx) < 20 &&
        err < 34
      ) {
        kind = 'make'
        banked = true
      }

      const result = scoreShot({
        kind,
        streakBefore: this.streak,
        perfectRelease: flight.perfect && kind !== 'miss',
        banked5d: banked && kind !== 'miss',
      })

      this.streak = result.streakAfter
      this.lastPoints = result.points || null

      if (kind === 'miss') {
        playMiss()
        this.callout = COURT_VISION_COPY.LOST_CHALLENGE
        const missDir = dx >= 0 ? 1 : -1
        this.tweens.add({
          targets: this.ball,
          x: this.ball.x + missDir * 28,
          y: this.ball.y + 70,
          alpha: 0.35,
          duration: 260,
          onComplete: () => this.resetBall(),
        })
      } else {
        this.score += result.points
        this.cheer()
        if (kind === 'swish') {
          playSwish()
          if (this.net) {
            this.net.setAlpha(0.95)
            this.net.play('net-swish')
            this.net.once('animationcomplete', () => this.net?.setAlpha(0))
          }
          this.shake = 180
          this.callout = 'SWISH!'
        } else {
          playMake()
          if (this.net) {
            this.net.setAlpha(0.85)
            this.net.play('net-swish')
            this.net.once('animationcomplete', () => this.net?.setAlpha(0))
          }
          this.shake = 100
          this.callout = banked ? '5D BOUNCE' : 'MAKE'
        }
        if (banked) playBounce5d()
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

        // Drop through net (behind rim)
        this.ball.setDepth(4)
        this.tweens.add({
          targets: this.ball,
          y: this.ball.y + 42,
          displayWidth: FLICK.ballRimSize * 0.75,
          displayHeight: FLICK.ballRimSize * 0.75,
          alpha: 0.2,
          duration: 220,
          onComplete: () => this.resetBall(),
        })
      }

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
      this.ball.setDisplaySize(FLICK.ballStartSize, FLICK.ballStartSize)
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
      mode: Phaser.Scale.FIT,
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
