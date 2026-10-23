import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useArcadeAudio } from '../audio/AudioProvider'
import { prepareSceneMusic, unlockMusic } from '../audio/sceneMusic'
import { BRAND_LOGO } from '../brand/BrandLockup'
import { postScore } from '../core/scores'
import { shareOrCopy } from '../core/challenges'
import { track } from '../analytics'
import { StreetShiftEngine, COLS, ROWS, type Hud } from './engine'
import type { Dir } from './types'
import { DX, DY, START_LIVES } from './types'
import './streetShift.css'
import { isTypingTarget } from '../core/typingTarget'

const DPR_CAP = 2
/** Soft swipe floor — commit early so iPhone never feels like a miss. */
const SWIPE_MIN = 8
const SWIPE_COMMIT = 12
const SWIPE_AXIS_RATIO = 1.05

function readSwipe(dx: number, dy: number, min = SWIPE_MIN): Dir | null {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax < min && ay < min) return null
  if (ax >= ay * SWIPE_AXIS_RATIO) return dx > 0 ? 1 : 3
  if (ay >= ax * SWIPE_AXIS_RATIO) return dy > 0 ? 2 : 0
  if (ax > ay) return dx > 0 ? 1 : 3
  return dy > 0 ? 2 : 0
}

export default function StreetShift() {
  const audio = useArcadeAudio()
  const { claimScene, duck } = audio
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const eng = useRef<StreetShiftEngine | null>(null)
  const logoRef = useRef<HTMLImageElement | null>(null)
  const [hud, setHud] = useState<Hud>({
    phase: 'howto',
    score: 0,
    lives: START_LIVES,
    starsLeft: 0,
    powerLeft: 0,
    shiftWarn: 0,
    shiftIn: 20,
    shifts: 0,
    pb: 0,
    callout: null,
    combo: 0,
    queued: null,
    morph: 0,
  })
  const [howto, setHowto] = useState(true)
  const [ended, setEnded] = useState<ReturnType<StreetShiftEngine['getEndStats']>>(null)
  const [runState, setRunState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [shareNote, setShareNote] = useState<string | null>(null)
  const touch0 = useRef<{ x: number; y: number; edge?: Dir; committed?: Dir } | null>(null)
  const hudRef = useRef(hud)
  hudRef.current = hud

  useEffect(() => {
    const img = new Image()
    img.src = BRAND_LOGO
    logoRef.current = img
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => prepareSceneMusic('street-shift'), 900)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const e = new StreetShiftEngine()
    eng.current = e
    const off = e.on((h) => {
      setHud(h)
      if (h.phase === 'ended') {
        setEnded(e.getEndStats())
        duck(true)
      }
    })
    return () => {
      off()
      e.stop()
      claimScene(null)
      duck(false)
    }
  }, [claimScene, duck])

  useEffect(() => {
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const c = canvasRef.current
      const e = eng.current
      if (!c || !e) return
      const ctx = c.getContext('2d')
      if (!ctx) return
      paint(ctx, c, e, logoRef.current, hudRef.current)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const fit = () => {
      const wrap = wrapRef.current
      const c = canvasRef.current
      if (!wrap || !c) return
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
      const tw = Math.floor(w * dpr)
      const th = Math.floor(h * dpr)
      if (c.width !== tw || c.height !== th) {
        c.width = tw
        c.height = th
        c.style.width = `${w}px`
        c.style.height = `${h}px`
      }
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [howto, ended])

  const startFromHowto = useCallback(() => {
    unlockMusic()
    claimScene('street-shift')
    setHowto(false)
    setEnded(null)
    setRunState('idle')
    setShareNote(null)
    track('arcade_street_shift_start', { v: 2 })
    eng.current?.start()
  }, [claimScene])

  const runItBack = useCallback(() => {
    duck(false)
    claimScene('street-shift')
    setEnded(null)
    setRunState('idle')
    setShareNote(null)
    eng.current?.start()
  }, [claimScene, duck])

  useEffect(() => {
    if (!ended || runState !== 'idle') return
    setRunState('saving')
    void (async () => {
      try {
        const r = await postScore({
          game: 'street-shift',
          mode: 'endless',
          score: ended.score,
          meta: { stars: ended.stars, tags: ended.tags, shifts: ended.shifts, livedS: ended.livedS, v: 2 },
        })
        setRunState(r.ok ? 'saved' : 'error')
      } catch {
        setRunState('error')
      }
    })()
  }, [ended, runState])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // Don't steal A/W/S/D while a handle / name field is focused (or end overlay is up).
      if (isTypingTarget(ev.target)) return
      if (ended) return
      const map: Record<string, Dir> = {
        ArrowUp: 0,
        KeyW: 0,
        ArrowRight: 1,
        KeyD: 1,
        ArrowDown: 2,
        KeyS: 2,
        ArrowLeft: 3,
        KeyA: 3,
      }
      const d = map[ev.code]
      if (d == null) return
      ev.preventDefault()
      eng.current?.queueDir(d)
    }
    window.addEventListener('keydown', onKey, { passive: false })
    return () => window.removeEventListener('keydown', onKey)
  }, [ended])

  const queue = (d: Dir) => eng.current?.queueDir(d)

  const onTouchStart = (ev: React.TouchEvent) => {
    const t = ev.changedTouches[0]
    if (!t || !wrapRef.current) return
    const r = wrapRef.current.getBoundingClientRect()
    const lx = t.clientX - r.left
    const ly = t.clientY - r.top
    // Bigger edge bands — easier never-miss taps on phone
    const edgeBand = Math.min(r.width, r.height) * 0.18
    let edge: Dir | undefined
    if (lx < edgeBand) edge = 3
    else if (lx > r.width - edgeBand) edge = 1
    else if (ly < edgeBand) edge = 0
    else if (ly > r.height - edgeBand) edge = 2
    touch0.current = { x: t.clientX, y: t.clientY, edge }
  }
  const onTouchMove = (ev: React.TouchEvent) => {
    const t = ev.changedTouches[0]
    const a = touch0.current
    if (!t || !a) return
    const dx = t.clientX - a.x
    const dy = t.clientY - a.y
    const d = readSwipe(dx, dy, SWIPE_COMMIT)
    if (d != null && a.committed !== d) {
      a.committed = d
      queue(d)
    }
  }
  const onTouchEnd = (ev: React.TouchEvent) => {
    const t = ev.changedTouches[0]
    const a = touch0.current
    touch0.current = null
    if (!t || !a) return
    const dx = t.clientX - a.x
    const dy = t.clientY - a.y
    const d = readSwipe(dx, dy)
    if (d != null) {
      if (a.committed !== d) queue(d)
      return
    }
    // tap / hold on edge zone = that direction (never-miss assist)
    if (a.edge != null && Math.hypot(dx, dy) < SWIPE_COMMIT) queue(a.edge)
  }

  const challengeStub = async () => {
    if (!ended) return
    const url = `${window.location.origin}${import.meta.env.BASE_URL}nova-5`
    const text = `I scored ${ended.score.toLocaleString('en-US')} in NOVA 5. Can you beat it?`
    const how = await shareOrCopy(text, url)
    setShareNote(how === 'shared' ? 'Sent!' : how === 'copied' ? 'Link copied — paste it in a text' : how === 'cancelled' ? null : 'Copy failed')
    track('arcade_street_shift_share', { how, v: 2 })
  }

  const playing = hud.phase === 'playing' || hud.phase === 'dying'
  const shiftPct = hud.shiftWarn > 0 ? hud.shiftWarn : 0

  return (
    <div className="ss-root">
      <div className="ss-top">
        <Link to="/" className="ss-back" aria-label="Back to floor">
          ←
        </Link>
        <div className="ss-hud">
          <span className="ss-score">{hud.score.toLocaleString('en-US')}</span>
          <div className="ss-hud__row">
            <span className="ss-lives" aria-label={`${hud.lives} lives`}>
              {'●'.repeat(Math.max(0, hud.lives))}
              <span className="ss-lives__empty">{'●'.repeat(Math.max(0, START_LIVES - hud.lives))}</span>
            </span>
            {hud.combo > 0 && hud.powerLeft > 0 ? <span className="ss-combo">×{Math.pow(2, hud.combo)}</span> : null}
          </div>
        </div>
        <div className="ss-meta">
          {hud.powerLeft > 0 ? (
            <span className="ss-meta__power">5D {hud.powerLeft.toFixed(1)}s</span>
          ) : (
            <span>{hud.starsLeft} left</span>
          )}
          <span className="ss-meta__shift">
            {hud.shiftWarn > 0 ? `MORPH ${hud.shiftIn.toFixed(1)}s` : `⇧ ${Math.ceil(hud.shiftIn)}s`}
          </span>
        </div>
      </div>

      {playing ? (
        <>
          <div className="ss-brandline" aria-hidden />
          <div className="ss-shiftbar" aria-hidden>
            <div
              className={`ss-shiftbar__fill${hud.shiftWarn > 0 ? ' is-warn' : ''}`}
              style={{ width: `${Math.min(100, (1 - hud.shiftIn / 20) * 100)}%` }}
            />
          </div>
        </>
      ) : null}

      <div
        className={`ss-board${hud.shiftWarn > 0 ? ' is-warn' : ''}${hud.powerLeft > 0 ? ' is-power' : ''}`}
        ref={wrapRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          touch0.current = null
        }}
      >
        <canvas ref={canvasRef} className="ss-canvas" />
        {shiftPct > 0 ? (
          <div className="ss-shiftring" style={{ ['--p' as string]: shiftPct }} aria-hidden>
            <span>MORPH</span>
          </div>
        ) : null}
        {hud.callout ? <p className="ss-callout">{hud.callout}</p> : null}
      </div>

      {playing ? (
        <div className="ss-pad" aria-label="Direction pad">
          <button type="button" className="ss-pad__btn ss-pad__up" onPointerDown={(e) => { e.preventDefault(); queue(0) }} aria-label="Up">
            ▲
          </button>
          <div className="ss-pad__mid">
            <button type="button" className="ss-pad__btn" onPointerDown={(e) => { e.preventDefault(); queue(3) }} aria-label="Left">
              ◀
            </button>
            <button type="button" className="ss-pad__btn" onPointerDown={(e) => { e.preventDefault(); queue(1) }} aria-label="Right">
              ▶
            </button>
          </div>
          <button type="button" className="ss-pad__btn ss-pad__down" onPointerDown={(e) => { e.preventDefault(); queue(2) }} aria-label="Down">
            ▼
          </button>
        </div>
      ) : null}

      {howto && !ended ? (
        <div className="ss-howto" role="dialog" aria-label="How to play NOVA 5">
          <div className="ss-howto__card">
            <img src={BRAND_LOGO} alt="" width={56} height={56} className="ss-howto__logo" />
            <p className="ss-howto__eyebrow">How to play</p>
            <h2 className="ss-howto__title">NOVA 5</h2>
            <p className="ss-howto__tag">Fifth Dimension maze chase. Soft neon corridors. Void drones hunt you.</p>
            <section>
              <h3>Controls</h3>
              <ul>
                <li>
                  <b>Swipe</b> to queue a turn at the next junction — or use the pad. Your commit shows as a teal arrow.
                </li>
                <li>
                  <b>Swipe opposite</b> to reverse. Turns stay buffered so corners land clean on iPhone.
                </li>
              </ul>
            </section>
            <section>
              <h3>Rules</h3>
              <ul>
                <li>
                  <b>·</b> Collect star motes. Clear the board to keep the run going.
                </li>
                <li>
                  <img src={BRAND_LOGO} alt="" width={22} height={22} className="ss-inline-logo" />
                  Power logos scramble the void drones — tag them for a rising combo.
                </li>
                <li>
                  <b>DIMENSION MORPH</b> every ~20s. Walls slide into new shapes — you always keep an exit.
                </li>
                <li>
                  <b>●●●</b> Three lives. Brief invincibility after a hit.
                </li>
              </ul>
            </section>
            <section>
              <h3>Scoring</h3>
              <ul>
                <li>
                  <b>Motes</b> +10 · <b>Tags</b> 200→1600 · <b>Time</b> bonus at the end
                </li>
              </ul>
            </section>
            <button type="button" className="ffa-btn ffa-btn--primary ss-howto__start" onClick={startFromHowto}>
              START
            </button>
          </div>
        </div>
      ) : null}

      {ended ? (
        <div className="ss-end">
          <p className="ss-end__eyebrow">NOVA 5</p>
          <h2>{ended.score >= hud.pb && ended.score > 0 ? 'New personal best.' : 'Signal lost. Morph again.'}</h2>
          <div className="ss-end__score">
            {ended.score.toLocaleString('en-US')}
            <small> pts</small>
          </div>
          <div className="ss-end__stats">
            <span>
              <b>{ended.stars}</b> motes
            </span>
            <span>
              <b>{ended.tags}</b> tags
            </span>
            <span>
              <b>{ended.shifts}</b> morphs
            </span>
            <span>
              <b>{Math.round(ended.livedS)}s</b> (+{ended.timeBonus})
            </span>
          </div>
          <p className="ss-end__pb">
            Personal best <strong>{Math.max(hud.pb, ended.score).toLocaleString('en-US')}</strong>
          </p>
          {runState === 'saving' ? <p className="ss-end__note">Posting to the board…</p> : null}
          {runState === 'error' ? <p className="ss-end__note">Saved on this phone — board sync later.</p> : null}
          {runState === 'saved' ? <p className="ss-end__note">On the board.</p> : null}
          <div className="ss-end__actions">
            <button type="button" className="ffa-btn ffa-btn--primary" onClick={() => void challengeStub()}>
              Challenge a friend
            </button>
            <button type="button" className="ffa-btn ffa-btn--ghost" onClick={runItBack}>
              Run it back
            </button>
            <Link to="/" className="ffa-btn ffa-btn--ghost ffa-btn--sm">
              Back to floor
            </Link>
          </div>
          {shareNote ? <p className="ss-end__note">{shareNote}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

function paint(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  e: StreetShiftEngine,
  logo: HTMLImageElement | null,
  hud: Hud,
) {
  const W = canvas.width
  const H = canvas.height
  const t = performance.now() / 1000
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  // Galaxy void — soft Fifth Glide stage
  ctx.fillStyle = '#0a0618'
  ctx.fillRect(0, 0, W, H)
  const wash = ctx.createRadialGradient(W * 0.5, H * 0.38, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.78)
  wash.addColorStop(0, 'rgba(0, 200, 196, 0.07)')
  wash.addColorStop(0.4, 'rgba(123, 63, 228, 0.08)')
  wash.addColorStop(0.75, 'rgba(18, 8, 40, 0.55)')
  wash.addColorStop(1, 'rgba(4, 2, 12, 0.95)')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, W, H)

  // Soft starfield
  ctx.save()
  for (let i = 0; i < 48; i++) {
    const sx = ((i * 97 + 13) % 1000) / 1000
    const sy = ((i * 53 + 29) % 1000) / 1000
    const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (1.2 + (i % 5) * 0.35) + i))
    ctx.globalAlpha = 0.15 + 0.35 * tw
    ctx.fillStyle = i % 3 === 0 ? '#00c8c4' : i % 3 === 1 ? '#c9b6ff' : '#f6f0d8'
    ctx.beginPath()
    ctx.arc(sx * W, sy * H, 0.6 + (i % 4) * 0.35, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  const pad = Math.min(W, H) * 0.035
  const cell = Math.min((W - pad * 2) / COLS, (H - pad * 2) / ROWS)
  const ox = (W - cell * COLS) / 2
  const oy = (H - cell * ROWS) / 2

  const warn = hud.shiftWarn
  const pulse = warn > 0 ? 0.45 + 0.55 * Math.abs(Math.sin(t * 9)) : 1
  const power = hud.powerLeft > 0
  const morph = hud.morph
  const morphing = morph > 0 && morph < 1
  const ease = morphing ? morph * morph * (3 - 2 * morph) : morph >= 1 ? 1 : 0

  // Soft plate glow under corridors
  const plate = ctx.createRadialGradient(
    ox + (COLS * cell) / 2,
    oy + (ROWS * cell) / 2,
    cell * 2,
    ox + (COLS * cell) / 2,
    oy + (ROWS * cell) / 2,
    Math.max(COLS, ROWS) * cell * 0.62,
  )
  plate.addColorStop(0, 'rgba(20, 12, 48, 0.55)')
  plate.addColorStop(1, 'rgba(6, 4, 16, 0.15)')
  ctx.fillStyle = plate
  roundRect(ctx, ox - 4, oy - 4, cell * COLS + 8, cell * ROWS + 8, 12)
  ctx.fill()

  const wallStrength = (x: number, y: number) => {
    const k = y * COLS + x
    const now = e.grid[k] === 1 ? 1 : 0
    if (!morphing || !e.prevGrid) return now
    const was = e.prevGrid[k] === 1 ? 1 : 0
    return was * (1 - ease) + now * ease
  }

  const strokeCol = warn > 0
    ? `rgba(255, 90, 60, ${0.55 + 0.35 * pulse})`
    : power
      ? 'rgba(255, 200, 60, 0.85)'
      : 'rgba(0, 200, 196, 0.78)'
  const glowCol = warn > 0
    ? `rgba(255, 90, 60, ${0.25 * pulse})`
    : power
      ? 'rgba(255, 200, 60, 0.22)'
      : 'rgba(123, 63, 228, 0.28)'

  // Soft neon corridor edges — not Minecraft boxes
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const s = wallStrength(x, y)
      if (s < 0.04) continue
      const px = ox + x * cell
      const py = oy + y * cell
      const inset = cell * (0.18 + (1 - s) * 0.22)
      const rw = cell - inset * 2
      const rh = cell - inset * 2
      const rr = Math.max(2.5, cell * 0.28)
      ctx.save()
      ctx.globalAlpha = 0.35 + 0.55 * s
      // soft fill — translucent ink, not solid brick
      const g = ctx.createRadialGradient(px + cell / 2, py + cell / 2, 0, px + cell / 2, py + cell / 2, cell * 0.55)
      g.addColorStop(0, glowCol)
      g.addColorStop(1, 'rgba(10, 6, 24, 0.55)')
      ctx.fillStyle = g
      roundRect(ctx, px + inset * 0.55, py + inset * 0.55, cell - inset * 1.1, cell - inset * 1.1, rr)
      ctx.fill()
      ctx.strokeStyle = strokeCol
      ctx.lineWidth = Math.max(1.2, cell * 0.09 * (0.55 + 0.45 * s))
      ctx.shadowColor = strokeCol
      ctx.shadowBlur = cell * 0.22 * s
      roundRect(ctx, px + inset, py + inset, rw, rh, rr * 0.85)
      ctx.stroke()
      ctx.restore()
    }
  }

  // Floor path wash on open cells (depth)
  ctx.save()
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (wallStrength(x, y) > 0.55) continue
      const px = ox + x * cell
      const py = oy + y * cell
      ctx.fillStyle = 'rgba(0, 200, 196, 0.035)'
      ctx.fillRect(px + cell * 0.18, py + cell * 0.18, cell * 0.64, cell * 0.64)
    }
  }
  ctx.restore()

  // Star motes — soft glowing dots (not classic Pac pellets)
  for (const k of e.stars) {
    const x = k % COLS
    const y = (k / COLS) | 0
    const cx = ox + (x + 0.5) * cell
    const cy = oy + (y + 0.5) * cell
    const beat = 0.85 + 0.15 * Math.sin(t * 4 + k * 0.4)
    const r = Math.max(1.6, cell * 0.1) * beat
    ctx.save()
    ctx.shadowColor = 'rgba(246, 240, 216, 0.7)'
    ctx.shadowBlur = cell * 0.25
    ctx.fillStyle = 'rgba(246, 240, 216, 0.92)'
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // Power orbs — brand logo in soft gold halo
  for (const k of e.powers) {
    const x = k % COLS
    const y = (k / COLS) | 0
    const cx = ox + (x + 0.5) * cell
    const cy = oy + (y + 0.5) * cell
    const beat = 0.88 + 0.12 * Math.sin(t * 6.5)
    const s = cell * 0.7 * beat
    ctx.save()
    ctx.shadowColor = 'rgba(255, 200, 60, 0.65)'
    ctx.shadowBlur = cell * 0.45
    if (logo && logo.complete && logo.naturalWidth) {
      ctx.beginPath()
      ctx.arc(cx, cy, s * 0.46, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(logo, cx - s / 2, cy - s / 2, s, s)
    } else {
      ctx.fillStyle = '#ffc83c'
      ctx.beginPath()
      ctx.arc(cx, cy, cell * 0.26 * beat, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    ctx.strokeStyle = `rgba(255, 200, 60, ${0.45 + 0.4 * beat})`
    ctx.lineWidth = Math.max(1.4, cell * 0.055)
    ctx.beginPath()
    ctx.arc(cx, cy, s * 0.48, 0, Math.PI * 2)
    ctx.stroke()
  }

  // VOID DRONES — mini UFOs (Glide family), not cartoon ghosts
  for (const g of e.ghosts) {
    const cx = ox + (g.x + 0.5) * cell
    const cy = oy + (g.y + 0.5) * cell
    const r = cell * 0.34
    if (g.mode === 'eaten') {
      // wreckage lights
      ctx.fillStyle = 'rgba(246, 244, 239, 0.85)'
      ctx.beginPath()
      ctx.arc(cx - r * 0.22, cy, r * 0.12, 0, Math.PI * 2)
      ctx.arc(cx + r * 0.22, cy, r * 0.12, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    const fright = g.mode === 'frightened'
    const blink = fright && e.powerT < 2.2 && Math.floor(e.powerT * 7) % 2 === 0
    const body = fright ? (blink ? '#f6f4ef' : '#7b3fe4') : g.color
    const hover = Math.sin(t * 5 + g.id) * cell * 0.04

    // soft thruster glow
    ctx.save()
    ctx.globalAlpha = 0.35
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.ellipse(cx, cy + r * 0.55 + hover, r * 0.55, r * 0.18, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // saucer disc
    ctx.save()
    ctx.shadowColor = body
    ctx.shadowBlur = cell * 0.35
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.ellipse(cx, cy + hover, r * 1.05, r * 0.42, 0, 0, Math.PI * 2)
    ctx.fill()
    // dome
    const dome = fright ? 'rgba(200, 180, 255, 0.9)' : 'rgba(230, 245, 255, 0.88)'
    ctx.fillStyle = dome
    ctx.beginPath()
    ctx.ellipse(cx, cy - r * 0.12 + hover, r * 0.48, r * 0.38, 0, Math.PI, 0)
    ctx.fill()
    // rim lights
    if (!fright) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath()
        ctx.arc(cx + i * r * 0.32, cy + r * 0.08 + hover, r * 0.07, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }

  // Runner — soft cyan energy orb (NOT Pac yellow pizza)
  {
    const cx = ox + (e.px + 0.5) * cell
    const cy = oy + (e.py + 0.5) * cell
    const r = cell * 0.36
    const flash = e.invulnT > 0 && Math.floor(e.invulnT * 12) % 2 === 0
    if (!flash) {
      const pulseR = 0.92 + 0.08 * Math.sin(t * 10)
      ctx.save()
      // trail wash
      for (let i = e.pTrail.length - 1; i >= 0; i--) {
        const tr = e.pTrail[i]!
        const tx = ox + (tr.x + 0.5) * cell
        const ty = oy + (tr.y + 0.5) * cell
        const a = ((i + 1) / e.pTrail.length) * 0.22
        ctx.globalAlpha = a
        ctx.fillStyle = power ? '#ffc83c' : '#00c8c4'
        ctx.beginPath()
        ctx.arc(tx, ty, r * 0.45 * ((i + 1) / e.pTrail.length), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      const core = power ? '#ffc83c' : '#7ff5f1'
      const rim = power ? '#ff8c28' : '#00c8c4'
      ctx.shadowColor = rim
      ctx.shadowBlur = cell * 0.55
      const grd = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.25, r * 0.1, cx, cy, r * pulseR)
      grd.addColorStop(0, '#ffffff')
      grd.addColorStop(0.35, core)
      grd.addColorStop(1, rim)
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(cx, cy, r * pulseR, 0, Math.PI * 2)
      ctx.fill()
      // facing chevron
      const ang =
        e.pDir === 0 ? -Math.PI / 2 : e.pDir === 1 ? 0 : e.pDir === 2 ? Math.PI / 2 : Math.PI
      ctx.translate(cx, cy)
      ctx.rotate(ang)
      ctx.fillStyle = 'rgba(10, 6, 24, 0.55)'
      ctx.beginPath()
      ctx.moveTo(r * 0.55, 0)
      ctx.lineTo(r * 0.15, -r * 0.22)
      ctx.lineTo(r * 0.15, r * 0.22)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
    if (e.queued != null && hud.phase === 'playing') {
      const q = e.queued
      const ax = cx + DX[q] * cell * 0.82
      const ay = cy + DY[q] * cell * 0.82
      ctx.save()
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 8)
      ctx.fillStyle = '#00c8c4'
      ctx.strokeStyle = '#00c8c4'
      ctx.lineWidth = Math.max(2, cell * 0.07)
      ctx.beginPath()
      ctx.moveTo(cx + DX[q] * r * 1.05, cy + DY[q] * r * 1.05)
      ctx.lineTo(ax, ay)
      ctx.stroke()
      const ox2 = -DY[q]
      const oy2 = DX[q]
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(ax - DX[q] * cell * 0.26 + ox2 * cell * 0.16, ay - DY[q] * cell * 0.26 + oy2 * cell * 0.16)
      ctx.lineTo(ax - DX[q] * cell * 0.26 - ox2 * cell * 0.16, ay - DY[q] * cell * 0.26 - oy2 * cell * 0.16)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
  }

  // Pickup FX
  for (const f of e.fx) {
    const cx = ox + (f.x + 0.5) * cell
    const cy = oy + (f.y + 0.5) * cell - (1 - f.t) * cell * 0.75
    ctx.globalAlpha = Math.max(0, Math.min(1, f.t * 2))
    ctx.fillStyle = f.kind === 'tag' ? '#00c8c4' : f.kind === 'power' ? '#ffc83c' : '#f6f0d8'
    ctx.font = `600 ${Math.max(11, cell * 0.42)}px Inter, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(f.kind === 'tag' ? `+${f.pts}` : f.kind === 'power' ? '5D' : '+10', cx, cy)
  }
  ctx.globalAlpha = 1

  // Morph shimmer overlay
  if (morphing) {
    ctx.save()
    ctx.globalAlpha = 0.12 + 0.18 * Math.sin(ease * Math.PI)
    const mg = ctx.createLinearGradient(ox, oy, ox + COLS * cell, oy + ROWS * cell)
    mg.addColorStop(0, 'rgba(0, 200, 196, 0)')
    mg.addColorStop(0.5, 'rgba(123, 63, 228, 0.8)')
    mg.addColorStop(1, 'rgba(255, 90, 60, 0)')
    ctx.fillStyle = mg
    ctx.fillRect(ox, oy, COLS * cell, ROWS * cell)
    ctx.restore()
  }

  // Soft Fifth Glide vignette
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.72)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(6, 3, 16, 0.55)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, W, H)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
