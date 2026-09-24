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
import { COURT_BG } from './bgLayout'
import type { CvBridge, CvChallengeConfig, CvHudState, CvMode } from './types'

const W = 390
const H = 844

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
}

export function createCourtVisionGame(
  parent: HTMLElement,
  bridge: CvBridge,
  mode: CvMode,
): Phaser.Game {
  class CourtScene extends Phaser.Scene {
    ball!: Phaser.GameObjects.Image
    net!: Phaser.GameObjects.Sprite
    aimGraphics!: Phaser.GameObjects.Graphics
    fireEmitter!: Phaser.GameObjects.Particles.ParticleEmitter
    hoopRoot!: Phaser.GameObjects.Container
    crowdFlash!: Phaser.GameObjects.Rectangle

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
    pulling = false
    pullStart = { x: 0, y: 0 }
    pullCur = { x: 0, y: 0 }
    /** Rim center in screen space — locked to painted hoop */
    hoopX = W * COURT_BG.hoopX
    hoopY = H * COURT_BG.hoopY
    shake = 0
    ended = false
    ballHome = { x: W / 2, y: H - 150 }

    constructor() {
      super('CourtVision')
    }

    preload() {
      const base = import.meta.env.BASE_URL
      this.load.image('court', `${base}art/court-bg.webp`)
      this.load.image('ball', `${base}art/ball.png`)
      this.load.image('fire', `${base}art/fire-particle.png`)
      for (let i = 0; i < 5; i++) {
        this.load.image(`net${i}`, `${base}art/net-${i}.png`)
      }
    }

    create() {
      unlockAudio()
      this.pb = loadPersonalBest()
      this.cameras.main.setBackgroundColor('#1c0c30')

      // Portrait court plate already hoop-centered — fit exactly to game size
      const bg = this.add.image(W / 2, H / 2, 'court')
      bg.setDisplaySize(W, H)
      bg.setDepth(0)
      // crisp pixels when scaled
      bg.texture.setFilter(Phaser.Textures.FilterMode.NEAREST)

      this.crowdFlash = this.add
        .rectangle(W / 2, H * 0.38, W, H * 0.18, 0xffc83c, 0)
        .setDepth(2)

      // Interactive hoop overlays aligned to painted rim (no second backboard frame)
      this.hoopX = W * COURT_BG.hoopX
      this.hoopY = H * COURT_BG.hoopY
      this.hoopRoot = this.add.container(this.hoopX, this.hoopY).setDepth(5)

      // Soft rim highlight so the ball reads through the painted hoop
      const rimGlow = this.add
        .circle(0, 0, 30)
        .setStrokeStyle(3, 0xff8c28, 0.55)
        .setFillStyle(0x000000, 0)
      this.hoopRoot.add(rimGlow)

      if (this.textures.exists('net0')) {
        const frames = [0, 1, 2, 3, 4, 3, 2, 1].map((i) => ({ key: `net${i}` }))
        this.anims.create({
          key: 'net-swish',
          frames,
          frameRate: 14,
          repeat: 1,
        })
        // Sit just under the painted rim
        this.net = this.add.sprite(0, 22, 'net0').setScale(1.05).setAlpha(0)
        this.hoopRoot.add(this.net)
      }

      this.aimGraphics = this.add.graphics().setDepth(8)

      this.ball = this.add
        .image(this.ballHome.x, this.ballHome.y, 'ball')
        .setDisplaySize(56, 56)
        .setDepth(10)
        .setInteractive({ useHandCursor: true })
      this.ball.texture.setFilter(Phaser.Textures.FilterMode.NEAREST)

      this.fireEmitter = this.add.particles(0, 0, 'fire', {
        lifespan: 420,
        speed: { min: 20, max: 60 },
        scale: { start: 0.55, end: 0 },
        alpha: { start: 0.85, end: 0 },
        frequency: 40,
        blendMode: 'ADD',
        emitting: false,
      })
      this.fireEmitter.setDepth(9)

      this.input.on('pointerdown', this.onDown, this)
      this.input.on('pointermove', this.onMove, this)
      this.input.on('pointerup', this.onUp, this)

      this.phase = 'playing'
      this.emitHud()

      if ((this.mode === 'timed' || this.mode === 'challenge')) {
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
    }

    emitHud(callout: string | null = this.callout) {
      const state: CvHudState = {
        score: this.score,
        streak: this.streak,
        multiplier: streakMultiplier(this.streak),
        timeLeft: (this.mode === 'timed' || this.mode === 'challenge') ? this.timeLeft : null,
        phase: this.phase,
        callout,
        lastPoints: this.lastPoints,
        pb: this.pb,
        newPb: false,
        mode: this.mode,
      }
      bridge.onHud(state)
    }

    onDown(p: Phaser.Input.Pointer) {
      if (this.phase !== 'playing' || this.flight || this.ended) return
      const d = Phaser.Math.Distance.Between(p.x, p.y, this.ball.x, this.ball.y)
      if (d > 70) return
      this.pulling = true
      this.pullStart = { x: p.x, y: p.y }
      this.pullCur = { x: p.x, y: p.y }
    }

    onMove(p: Phaser.Input.Pointer) {
      if (!this.pulling) return
      this.pullCur = { x: p.x, y: p.y }
      this.drawAim()
    }

    onUp(p: Phaser.Input.Pointer) {
      if (!this.pulling) return
      this.pulling = false
      this.aimGraphics.clear()
      this.pullCur = { x: p.x, y: p.y }
      const dx = this.pullStart.x - this.pullCur.x
      const dy = this.pullStart.y - this.pullCur.y
      const dist = Math.hypot(dx, dy)
      if (dist < 18) return

      const power = Phaser.Math.Clamp(dist / 140, 0.45, 1.35)
      const targetX = this.hoopX + Phaser.Math.Clamp(dx * 0.28, -55, 55)
      const targetY = this.hoopY
      const perfect = dist > 55 && dist < 130 && Math.abs(dx) < 48

      playRelease()
      this.flight = {
        t: 0,
        duration: 720 + power * 180,
        x0: this.ball.x,
        y0: this.ball.y,
        x1: targetX,
        y1: targetY,
        peak: 90 + power * 70,
        spinning: true,
        perfect,
        power,
      }
      if (this.streak >= 3) this.fireEmitter.startFollow(this.ball)
    }

    drawAim() {
      this.aimGraphics.clear()
      const dx = this.pullStart.x - this.pullCur.x
      const dy = this.pullStart.y - this.pullCur.y
      const dist = Math.hypot(dx, dy)
      if (dist < 8) return
      const power = Phaser.Math.Clamp(dist / 140, 0.45, 1.35)
      const tx = this.hoopX + Phaser.Math.Clamp(dx * 0.28, -55, 55)
      const ty = this.hoopY
      const peak = 90 + power * 70

      this.aimGraphics.lineStyle(2, 0x00c8c4, 0.55)
      this.aimGraphics.beginPath()
      for (let i = 0; i <= 16; i++) {
        const t = i / 16
        const x = Phaser.Math.Linear(this.ball.x, tx, t)
        const y =
          Phaser.Math.Linear(this.ball.y, ty, t) - Math.sin(Math.PI * t) * peak
        if (i === 0) this.aimGraphics.moveTo(x, y)
        else this.aimGraphics.lineTo(x, y)
      }
      this.aimGraphics.strokePath()
      this.aimGraphics.fillStyle(0xffc83c, 0.85)
      this.aimGraphics.fillCircle(tx, ty, 5)
    }

    update(_time: number, delta: number) {
      if (this.shake > 0) {
        this.shake -= delta
        this.cameras.main.setScroll(
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5,
        )
        if (this.shake <= 0) this.cameras.main.setScroll(0, 0)
      }

      if (!this.flight) return

      this.flight.t += delta
      const u = Phaser.Math.Clamp(this.flight.t / this.flight.duration, 0, 1)
      const x = Phaser.Math.Linear(this.flight.x0, this.flight.x1, u)
      const y =
        Phaser.Math.Linear(this.flight.y0, this.flight.y1, u) -
        Math.sin(Math.PI * u) * this.flight.peak
      this.ball.setPosition(x, y)
      this.ball.rotation += delta * 0.012 * this.flight.power

      if (this.streak >= 3) this.fireEmitter.emitting = true

      if (u >= 1) {
        this.resolveShot(this.flight)
        this.flight = null
        this.fireEmitter.emitting = false
        this.fireEmitter.stopFollow()
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
      if (err < 16) kind = 'swish'
      else if (err < 36) kind = 'make'
      else if (err < 50 && flight.x1 > this.hoopX - 8) {
        kind = 'make'
        banked = true
      }
      if (kind === 'miss' && err < 60 && flight.power > 0.7 && flight.power < 1.15) {
        kind = 'make'
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
        this.tweens.add({
          targets: this.ball,
          y: this.ball.y + 80,
          alpha: 0.4,
          duration: 280,
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

        this.tweens.add({
          targets: this.ball,
          y: this.ball.y + 36,
          scale: 0.7,
          alpha: 0.25,
          duration: 220,
          onComplete: () => this.resetBall(),
        })
      }

      this.emitHud(this.callout)
      this.time.delayedCall(1200, () => {
        this.callout = null
        this.lastPoints = null
        this.emitHud(null)
      })
    }

    resetBall() {
      this.ball.setPosition(this.ballHome.x, this.ballHome.y)
      this.ball.setAlpha(1)
      this.ball.setScale(1)
      this.ball.setDisplaySize(56, 56)
      this.ball.rotation = 0
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
  })

  ;(parent as HTMLElement & { __phaserGame?: Phaser.Game }).__phaserGame = game
  ;(globalThis as unknown as { __CV_GAME?: Phaser.Game }).__CV_GAME = game

  return game
}
