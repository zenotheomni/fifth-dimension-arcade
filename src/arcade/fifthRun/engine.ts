/**
 * Fifth Glide — game engine: fixed 120 Hz sim, interpolated render, swipe/keyboard input,
 * callouts (copy locks), PB, adaptive quality. Exposes `__FR` for QA captures.
 */
import { FIFTH_RUN_COPY } from '../copyLocks'
import { RuleBot, SKILLS } from './sim/bot'
import { FR_DT, FR_HZ, POWER_TICKS } from './sim/constants'
import { newRun, queueAction, resetCursors, scoreOf, step, type Action, type RunEvent, type RunState } from './sim/runner'
import { Track } from './sim/track'
import { FrScene, type QualityTier, type ViewState } from './render/scene'
import { loadTexture } from './render/textures'
import {
  setSfxMuted,
  sfxBump,
  sfxCrash,
  sfxJump,
  sfxKey,
  sfxLane,
  sfxMult,
  sfxPower,
  sfxSlide,
  sfxStart,
  unlockSfx,
} from './sfx'
import type { FrBridge, FrHudState, FrMode, FrPhase } from './types'

export type FifthRunHandle = { destroy: () => void; setMuted: (m: boolean) => void; pause: () => void }

const PB_KEY = 'fd_fifth_run_pb'
const loadPb = () => {
  try {
    return Number(localStorage.getItem(PB_KEY) || 0) || 0
  } catch {
    return 0
  }
}
const savePb = (v: number) => {
  try {
    localStorage.setItem(PB_KEY, String(v))
  } catch {
    /* ignore */
  }
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

const MULT_COPY: Record<number, string> = { 2: FIFTH_RUN_COPY.MULTIPLIER_X2, 3: 'x3 · Keep moving.', 4: 'x4 · Locked in.', 5: 'x5 · Nothing in the way.' }

class Engine {
  host: HTMLElement
  bridge: FrBridge
  canvas: HTMLCanvasElement
  view: FrScene | null = null
  track: Track
  run: RunState
  prev: RunState
  mode: FrMode
  phase: FrPhase = 'loading'
  ready = false
  accum = 0
  clock = 0
  deadT = 0
  pb = loadPb()
  newPb = false
  pbCalled = false
  targetCalled = false
  shake = 0
  callout: FrHudState['callout'] = null
  calloutT = 0
  calloutId = 0
  hudAcc = 0
  lastHud = ''
  manual = false
  destroyed = false
  raf = 0
  lastNow = 0
  autopilot: RuleBot | null = null
  events: RunEvent[] = []
  fpsFrames = 0
  fpsTime = 0
  fpsGood = 0
  fpsBad = 0
  startedAt = 0
  biomeCalled = 0
  private touch: { id: number; x: number; y: number; t: number; fired: boolean } | null = null
  private ro: ResizeObserver | null = null

  constructor(host: HTMLElement, bridge: FrBridge) {
    this.host = host
    this.bridge = bridge
    this.mode = bridge.challenge ? 'challenge' : 'endless'
    this.track = new Track(bridge.seed)
    this.track.ensure(400)
    this.run = newRun()
    this.prev = { ...this.run }
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'fr-canvas'
    host.appendChild(this.canvas)
    setSfxMuted(bridge.muted)
    const g = globalThis as unknown as { __FR?: Engine }
    g.__FR = this
  }

  async init() {
    const emblem = await loadTexture(`${import.meta.env.BASE_URL}art/emblem-160.webp`)
    if (this.destroyed) return
    this.view = new FrScene(this.canvas, detectTier(), emblem)
    // Upgrade to the rigged human runner + realistic sports-car GLTF (each falls back to procedural on failure)
    await Promise.all([this.view.loadGltfRunner(), this.view.loadGltfCars()])
    this.view?.applyAnisotropy()
    if (this.destroyed) return
    this.onResize()
    this.ro = new ResizeObserver(() => this.onResize())
    this.ro.observe(this.host)
    this.canvas.addEventListener('pointerdown', this.onDown)
    window.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerup', this.onUp)
    window.addEventListener('pointercancel', this.onUp)
    window.addEventListener('keydown', this.onKey)
    document.addEventListener('visibilitychange', this.onVis)
    // warm the GPU (compile shaders) before revealing
    this.view.update(this.viewState(0), 0.016)
    this.view.render()
    this.phase = 'intro'
    this.ready = true
    this.emitHud(true)
    this.lastNow = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  // ── input ──
  private onDown = (e: PointerEvent) => {
    unlockSfx()
    if (this.phase === 'paused') {
      this.resume()
      return
    }
    this.touch = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), fired: false }
  }

  private onMove = (e: PointerEvent) => {
    const tc = this.touch
    if (!tc || tc.id !== e.pointerId || tc.fired) return
    const dx = e.clientX - tc.x
    const dy = e.clientY - tc.y
    const d = Math.hypot(dx, dy)
    const minPx = Math.max(22, Math.min(window.innerWidth, 480) * 0.06)
    if (d < minPx) return
    tc.fired = true
    this.swipe(dx, dy)
  }

  private onUp = (e: PointerEvent) => {
    const tc = this.touch
    if (!tc || tc.id !== e.pointerId) return
    this.touch = null
    if (tc.fired) return
    const dx = e.clientX - tc.x
    const dy = e.clientY - tc.y
    const d = Math.hypot(dx, dy)
    const dt = performance.now() - tc.t
    if (d >= 12 && d / Math.max(dt, 1) > 0.25) this.swipe(dx, dy)
    else if (this.phase === 'intro') this.start(null)
  }

  private swipe(dx: number, dy: number) {
    const a: Action = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'jump' : 'slide'
    this.input(a)
  }

  private onKey = (e: KeyboardEvent) => {
    const map: Record<string, Action> = {
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      ArrowUp: 'jump',
      KeyW: 'jump',
      Space: 'jump',
      ArrowDown: 'slide',
      KeyS: 'slide',
    }
    const a = map[e.code]
    if (!a) return
    e.preventDefault()
    unlockSfx()
    if (this.phase === 'paused') this.resume()
    this.input(a)
  }

  private onVis = () => {
    if (document.hidden && this.phase === 'playing') this.pause()
  }

  input(a: Action) {
    if (this.phase === 'intro') {
      this.start(a)
      return
    }
    if (this.phase !== 'playing') return
    queueAction(this.run, a)
  }

  start(first: Action | null) {
    if (this.phase !== 'intro') return
    this.phase = 'playing'
    this.startedAt = this.clock
    sfxStart()
    this.biomeCalled = 0
    this.say(FIFTH_RUN_COPY.START, 'teal', 1.6)
    if (first) queueAction(this.run, first)
    this.emitHud(true)
  }

  pause() {
    if (this.phase !== 'playing') return
    this.phase = 'paused'
    this.emitHud(true)
  }

  resume() {
    if (this.phase !== 'paused') return
    this.phase = 'playing'
    this.lastNow = performance.now()
    this.emitHud(true)
  }

  say(text: string, tone: 'gold' | 'teal' | 'coral' = 'gold', dur = 1.2) {
    this.callout = { text, id: ++this.calloutId, tone }
    this.calloutT = dur
    this.emitHud(true)
  }

  // ── loop ──
  loop = (now: number) => {
    if (this.destroyed) return
    this.raf = requestAnimationFrame(this.loop)
    if (this.manual) return
    const dt = Math.min(0.1, Math.max(0, (now - this.lastNow) / 1000))
    this.lastNow = now
    this.update(dt)
    this.adapt(dt)
  }

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

  setAutopilot(on: boolean | string) {
    this.autopilot = on ? new RuleBot(SKILLS[typeof on === 'string' ? on : 'perfect'], 77) : null
  }

  update(dt: number, skipRender = false) {
    this.clock += dt
    if (this.calloutT > 0) {
      this.calloutT -= dt
      if (this.calloutT <= 0) {
        this.callout = null
        this.emitHud(true)
      }
    }
    this.shake = Math.max(0, this.shake - dt * 2.5)

    if (this.phase === 'playing') {
      this.accum += dt
      let n = 0
      while (this.accum >= FR_DT && n < 24) {
        this.accum -= FR_DT
        n++
        this.prev = { ...this.run }
        this.track.ensure(this.run.s + 260)
        if (this.autopilot) this.autopilot.update(this.run, this.track)
        this.events.length = 0
        step(this.run, this.track, { full: true, events: this.events })
        for (const e of this.events) this.onEvent(e)
        if (this.run.dead) {
          this.crash()
          break
        }
      }
      if (this.run.tick % 600 === 0) {
        const before = this.track.obstacles.length
        this.track.prune(this.run.s)
        if (this.track.obstacles.length !== before) resetCursors(this.run)
      }
    } else if (this.phase === 'crashed') {
      this.deadT += dt
      if (this.deadT > 1.45) this.finish()
    }

    if (this.phase === 'playing') {
      if (this.run.s >= 600 && this.biomeCalled < 1) {
        this.biomeCalled = 1
        this.say('Leaving Miami…', 'teal', 1.4)
      } else if (this.run.s >= 1600 && this.biomeCalled < 2) {
        this.biomeCalled = 2
        this.say('Deep space.', 'gold', 1.5)
      }
    }

    this.hudAcc += dt
    if (this.hudAcc > 0.066) {
      this.hudAcc = 0
      this.emitHud(false)
    }
    if (!this.view) return
    const alpha = this.phase === 'playing' ? this.accum / FR_DT : 1
    this.view.update(this.viewState(alpha), dt)
    if (!skipRender) this.view.render()
  }

  private viewState(alpha: number): ViewState {
    const a = this.prev
    const b = this.run
    const l = (p: number, q: number) => p + (q - p) * alpha
    return {
      time: this.clock,
      s: l(a.s, b.s),
      x: l(a.x, b.x),
      y: l(a.y, b.y),
      vy: b.vy,
      air: b.air,
      sliding: b.slide > 0 && !b.air,
      speed: this.phase === 'playing' ? b.v : this.phase === 'intro' ? 0 : 0,
      dead: b.dead,
      deadT: this.deadT,
      deathKind: b.deathKind,
      idle: this.phase === 'intro' || this.phase === 'loading',
      lives: b.lives,
      hand: b.hand / FR_HZ,
      invuln: b.invuln > 0 || b.hand > 0,
      invisible: b.hand > 0,
      stumble: b.stumble,
      obstacles: this.track.obstacles,
      keys: this.track.keys,
      pickups: this.track.pickups,
      tick: b.tick,
      hz: FR_HZ,
      shake: this.shake,
    }
  }

  private onEvent(e: RunEvent) {
    const st = this.run
    switch (e.type) {
      case 'key': {
        sfxKey(e.combo, false)
        const k = this.track.keys.find((x) => x.id === e.id)
        if (k) this.view?.burst(k.lane, k.s, k.y, 6)
        if (e.first) this.say(FIFTH_RUN_COPY.FIRST_KEY, 'gold', 1.1)
        break
      }
      case 'mult':
        sfxMult()
        if (MULT_COPY[e.mult]) this.say(MULT_COPY[e.mult], e.mult >= 5 ? 'coral' : 'gold', 1.3)
        break
      case 'miss':
        if (e.lostCombo >= 10) this.say(`Combo lost · ${e.lostCombo}`, 'coral', 0.9)
        break
      case 'power':
        sfxPower('hand')
        this.say(FIFTH_RUN_COPY.HAND, 'teal', 1.2)
        break
      case 'hit':
        sfxBump()
        this.shake = 1.0
        this.say(e.lives === 1 ? 'Last life' : `${e.lives} lives left`, 'coral', 1.1)
        if (navigator.vibrate) {
          try {
            navigator.vibrate(40)
          } catch {
            /* ignore */
          }
        }
        break
      case 'jump':
        sfxJump()
        break
      case 'slide':
        sfxSlide()
        break
      case 'lane':
        sfxLane()
        break
      case 'bump':
        sfxBump()
        this.shake = Math.max(this.shake, 0.45)
        break
      default:
        break
    }
    const score = scoreOf(st)
    if (!this.pbCalled && this.pb > 0 && score > this.pb) {
      this.pbCalled = true
      this.say(FIFTH_RUN_COPY.NEW_PB, 'gold', 1.5)
    }
    const ch = this.bridge.challenge
    if (ch && !ch.setTheBar && !this.targetCalled && ch.targetScore > 0 && score > ch.targetScore) {
      this.targetCalled = true
      this.say(FIFTH_RUN_COPY.BEAT_FRIEND, 'teal', 1.6)
    }
  }

  private crash() {
    this.phase = 'crashed'
    this.deadT = 0
    this.shake = 1.4
    sfxCrash()
    this.say(FIFTH_RUN_COPY.CRASH, 'coral', 1.6)
    if (navigator.vibrate) {
      try {
        navigator.vibrate(60)
      } catch {
        /* ignore */
      }
    }
  }

  private finish() {
    if (this.phase === 'ended') return
    this.phase = 'ended'
    const st = this.run
    const score = scoreOf(st)
    const newPb = score > this.pb
    if (newPb) {
      this.pb = score
      savePb(score)
    }
    this.newPb = newPb
    this.emitHud(true)
    const ch = this.bridge.challenge
    this.bridge.onEnded({
      score,
      distance: Math.floor(st.s),
      keys: st.keys,
      maxCombo: st.maxCombo,
      livesLeft: st.lives,
      durationS: Math.round((st.tick / FR_HZ) * 10) / 10,
      deathKind: st.deathKind,
      pb: this.pb,
      newPb,
      mode: this.mode,
      beatChallenge: ch && !ch.setTheBar ? score > ch.targetScore : null,
      seed: this.bridge.seed,
    })
  }

  emitHud(force: boolean) {
    const st = this.run
    const s: FrHudState = {
      phase: this.phase,
      score: scoreOf(st),
      distance: Math.floor(st.s),
      keys: st.keys,
      combo: st.combo,
      mult: st.mult,
      lives: st.lives,
      callout: this.callout,
      pb: this.pb,
      newPb: this.newPb,
      hand: st.hand / POWER_TICKS.hand,
      speed: Math.round(st.v * 3.6),
      target: this.bridge.challenge && !this.bridge.challenge.setTheBar ? this.bridge.challenge.targetScore : null,
    }
    const key = `${s.phase}|${s.score}|${s.keys}|${s.combo}|${s.lives}|${s.callout?.id}|${Math.round(s.hand * 20)}|${s.distance}`
    if (!force && key === this.lastHud) return
    this.lastHud = key
    this.bridge.onHud(s)
  }

  adapt(dt: number) {
    const v = this.view
    if (!v) return
    this.fpsFrames++
    this.fpsTime += dt
    if (this.fpsTime < 1) return
    const fps = this.fpsFrames / this.fpsTime
    this.fpsFrames = 0
    this.fpsTime = 0
    // Sharpness first: shed reflection updates before resolution, and only drop below full DPR
    // after two consecutive slow seconds (load hitches don't count). Composer (AA + bloom) goes last.
    if (fps < 50) {
      this.fpsGood = 0
      if (++this.fpsBad < 2) return
      this.fpsBad = 0
      if (v.reflEvery < 3) v.reflEvery++
      else if (v.dprScale > 0.7) {
        v.dprScale = Math.max(0.7, v.dprScale - 0.1)
        this.onResize()
      } else if (v.composer && fps < 40) v.disableComposer()
    } else if (fps > 58) {
      this.fpsBad = 0
      this.fpsGood++
      if (this.fpsGood >= 3) {
        this.fpsGood = 0
        if (v.dprScale < 1) {
          v.dprScale = Math.min(1, v.dprScale + 0.1)
          this.onResize()
        } else if (v.reflEvery > 1) v.reflEvery--
      }
    } else this.fpsBad = 0
  }

  onResize() {
    if (!this.view) return
    const r = this.host.getBoundingClientRect()
    this.view.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)))
  }

  setMuted(m: boolean) {
    setSfxMuted(m)
  }

  destroy() {
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    this.ro?.disconnect()
    this.canvas.removeEventListener('pointerdown', this.onDown)
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)
    window.removeEventListener('pointercancel', this.onUp)
    window.removeEventListener('keydown', this.onKey)
    document.removeEventListener('visibilitychange', this.onVis)
    this.view?.dispose()
    this.canvas.remove()
    const g = globalThis as unknown as { __FR?: Engine }
    if (g.__FR === this) delete g.__FR
  }
}

export function createFifthRun(host: HTMLElement, bridge: FrBridge): FifthRunHandle {
  const engine = new Engine(host, bridge)
  void engine.init().catch((err) => console.error('[fifth-glide] init failed', err))
  return { destroy: () => engine.destroy(), setMuted: (m) => engine.setMuted(m), pause: () => engine.pause() }
}
