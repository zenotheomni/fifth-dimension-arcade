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
/** Min swipe distance — forgiving but needs a clear axis */
const SWIPE_MIN = 14
const SWIPE_AXIS_RATIO = 1.15

function readSwipe(dx: number, dy: number): Dir | null {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax < SWIPE_MIN && ay < SWIPE_MIN) return null
  if (ax >= ay * SWIPE_AXIS_RATIO) return dx > 0 ? 1 : 3
  if (ay >= ax * SWIPE_AXIS_RATIO) return dy > 0 ? 2 : 0
  // near-diagonal: pick dominant
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
  })
  const [howto, setHowto] = useState(true)
  const [ended, setEnded] = useState<ReturnType<StreetShiftEngine['getEndStats']>>(null)
  const [runState, setRunState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [shareNote, setShareNote] = useState<string | null>(null)
  const touch0 = useRef<{ x: number; y: number; edge?: Dir } | null>(null)
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
    const edgeBand = Math.min(r.width, r.height) * 0.14
    let edge: Dir | undefined
    if (lx < edgeBand) edge = 3
    else if (lx > r.width - edgeBand) edge = 1
    else if (ly < edgeBand) edge = 0
    else if (ly > r.height - edgeBand) edge = 2
    touch0.current = { x: t.clientX, y: t.clientY, edge }
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
      queue(d)
      return
    }
    // tap on edge zone = that direction (never-miss assist)
    if (a.edge != null && Math.hypot(dx, dy) < SWIPE_MIN) queue(a.edge)
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
            {hud.shiftWarn > 0 ? `SHIFT ${hud.shiftIn.toFixed(1)}s` : `⇧ ${Math.ceil(hud.shiftIn)}s`}
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
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          touch0.current = null
        }}
      >
        <canvas ref={canvasRef} className="ss-canvas" />
        {shiftPct > 0 ? (
          <div className="ss-shiftring" style={{ ['--p' as string]: shiftPct }} aria-hidden>
            <span>MAZE SHIFT</span>
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
            <p className="ss-howto__tag">Classic maze chase. Every 20 seconds the grid shifts.</p>
            <section>
              <h3>Controls</h3>
              <ul>
                <li>
                  <b>Swipe</b> to turn — or use the D-pad. Your next move shows as a gold arrow.
                </li>
                <li>
                  <b>Swipe opposite</b> to reverse. Turns stay buffered so corners land clean.
                </li>
              </ul>
            </section>
            <section>
              <h3>Rules</h3>
              <ul>
                <li>
                  <b>·</b> Clear pellets. Clear the board to keep the run going.
                </li>
                <li>
                  <img src={BRAND_LOGO} alt="" width={22} height={22} className="ss-inline-logo" />
                  Power logos scare the ghosts — tag them for a rising combo.
                </li>
                <li>
                  <b>MAZE SHIFT</b> every 20s. Watch the bar — you always keep an exit.
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
                  <b>Pellets</b> +10 · <b>Tags</b> 200→1600 · <b>Time</b> bonus at the end
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
          <h2>{ended.score >= hud.pb && ended.score > 0 ? 'New personal best.' : 'Maze cleared the run. Go again.'}</h2>
          <div className="ss-end__score">
            {ended.score.toLocaleString('en-US')}
            <small> pts</small>
          </div>
          <div className="ss-end__stats">
            <span>
              <b>{ended.stars}</b> pellets
            </span>
            <span>
              <b>{ended.tags}</b> tags
            </span>
            <span>
              <b>{ended.shifts}</b> shifts
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

  // Fifth Glide stage — soft ink, no cyberpunk wireframe
  ctx.fillStyle = '#120c24'
  ctx.fillRect(0, 0, W, H)
  const wash = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.72)
  wash.addColorStop(0, 'rgba(0, 200, 196, 0.06)')
  wash.addColorStop(0.55, 'rgba(123, 63, 228, 0.05)')
  wash.addColorStop(1, 'rgba(8, 5, 18, 0.9)')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, W, H)

  const pad = Math.min(W, H) * 0.04
  const cell = Math.min((W - pad * 2) / COLS, (H - pad * 2) / ROWS)
  const ox = (W - cell * COLS) / 2
  const oy = (H - cell * ROWS) / 2

  const warn = hud.shiftWarn
  const pulse = warn > 0 ? 0.45 + 0.55 * Math.abs(Math.sin(t * 9)) : 1
  const power = hud.powerLeft > 0

  // Maze plate
  ctx.fillStyle = '#0a0c14'
  roundRect(ctx, ox - 3, oy - 3, cell * COLS + 6, cell * ROWS + 6, 8)
  ctx.fill()

  // Classic Pac-Man corridor walls — brand teal / coral on shift warn
  const wallFill = warn > 0 ? `rgba(255, 90, 60, ${0.22 + 0.2 * pulse})` : '#14122a'
  const wallStroke = warn > 0 ? `rgba(255, 90, 60, ${0.85 * pulse})` : power ? 'rgba(255, 200, 60, 0.9)' : '#00c8c4'
  const wallInner = warn > 0 ? `rgba(255, 200, 60, ${0.35 * pulse})` : 'rgba(123, 63, 228, 0.45)'

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const wall = e.grid[y * COLS + x] === 1
      const px = ox + x * cell
      const py = oy + y * cell
      if (wall) {
        ctx.fillStyle = wallFill
        roundRect(ctx, px + 1, py + 1, cell - 1.2, cell - 1.2, Math.max(2, cell * 0.18))
        ctx.fill()
        ctx.strokeStyle = wallStroke
        ctx.lineWidth = Math.max(1.4, cell * 0.12)
        roundRect(ctx, px + cell * 0.14, py + cell * 0.14, cell * 0.72, cell * 0.72, Math.max(2, cell * 0.16))
        ctx.stroke()
        ctx.strokeStyle = wallInner
        ctx.lineWidth = Math.max(0.7, cell * 0.035)
        roundRect(ctx, px + 2, py + 2, cell - 4, cell - 4, Math.max(1.5, cell * 0.12))
        ctx.stroke()
      }
    }
  }

  // Pellets — classic small dots
  for (const k of e.stars) {
    const x = k % COLS
    const y = (k / COLS) | 0
    const cx = ox + (x + 0.5) * cell
    const cy = oy + (y + 0.5) * cell
    const r = Math.max(1.8, cell * 0.11)
    ctx.fillStyle = '#f6f0d8'
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Power pellets — brand logo / gold
  for (const k of e.powers) {
    const x = k % COLS
    const y = (k / COLS) | 0
    const cx = ox + (x + 0.5) * cell
    const cy = oy + (y + 0.5) * cell
    const beat = 0.88 + 0.12 * Math.sin(t * 7)
    const s = cell * 0.72 * beat
    ctx.save()
    ctx.shadowColor = 'rgba(255, 200, 60, 0.55)'
    ctx.shadowBlur = cell * 0.35
    if (logo && logo.complete && logo.naturalWidth) {
      ctx.beginPath()
      ctx.arc(cx, cy, s * 0.48, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(logo, cx - s / 2, cy - s / 2, s, s)
    } else {
      ctx.fillStyle = '#ffc83c'
      ctx.beginPath()
      ctx.arc(cx, cy, cell * 0.28 * beat, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    ctx.strokeStyle = `rgba(255, 200, 60, ${0.5 + 0.35 * beat})`
    ctx.lineWidth = Math.max(1.5, cell * 0.06)
    ctx.beginPath()
    ctx.arc(cx, cy, s * 0.48, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Ghosts — soft classic bodies, brand colors
  for (const g of e.ghosts) {
    const cx = ox + (g.x + 0.5) * cell
    const cy = oy + (g.y + 0.5) * cell
    const r = cell * 0.36
    if (g.mode === 'eaten') {
      ctx.fillStyle = '#f6f4ef'
      ctx.beginPath()
      ctx.arc(cx - r * 0.26, cy, r * 0.18, 0, Math.PI * 2)
      ctx.arc(cx + r * 0.26, cy, r * 0.18, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    const fright = g.mode === 'frightened'
    const blink = fright && e.powerT < 2.2 && Math.floor(e.powerT * 7) % 2 === 0
    ctx.save()
    ctx.fillStyle = fright ? (blink ? '#f6f4ef' : '#7b3fe4') : g.color
    ctx.beginPath()
    ctx.arc(cx, cy - r * 0.06, r, Math.PI, 0)
    ctx.lineTo(cx + r, cy + r * 0.62)
    for (let i = 0; i < 4; i++) {
      const u = (i + 1) / 4
      ctx.lineTo(cx + r - u * 2 * r, cy + (i % 2 === 0 ? r * 0.32 : r * 0.62))
    }
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = '#f6f4ef'
    ctx.beginPath()
    ctx.arc(cx - r * 0.26, cy - r * 0.1, r * 0.16, 0, Math.PI * 2)
    ctx.arc(cx + r * 0.26, cy - r * 0.1, r * 0.16, 0, Math.PI * 2)
    ctx.fill()
    if (!fright) {
      ctx.fillStyle = '#0a0c14'
      const ex = DX[g.dir] * r * 0.06
      const ey = DY[g.dir] * r * 0.06
      ctx.beginPath()
      ctx.arc(cx - r * 0.26 + ex, cy - r * 0.1 + ey, r * 0.07, 0, Math.PI * 2)
      ctx.arc(cx + r * 0.26 + ex, cy - r * 0.1 + ey, r * 0.07, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Player — classic Pac-Man wedge (gold)
  {
    const cx = ox + (e.px + 0.5) * cell
    const cy = oy + (e.py + 0.5) * cell
    const r = cell * 0.38
    const flash = e.invulnT > 0 && Math.floor(e.invulnT * 12) % 2 === 0
    if (!flash) {
      const chomp = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(t * 14))
      const base =
        e.pDir === 0 ? -Math.PI / 2 : e.pDir === 1 ? 0 : e.pDir === 2 ? Math.PI / 2 : Math.PI
      ctx.save()
      ctx.fillStyle = power ? '#ffc83c' : '#ffe14a'
      ctx.shadowColor = 'rgba(255, 200, 60, 0.45)'
      ctx.shadowBlur = cell * 0.35
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, base + chomp, base + Math.PI * 2 - chomp)
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
      ctx.fillStyle = '#ffc83c'
      ctx.strokeStyle = '#ffc83c'
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

  // Soft Fifth Glide vignette
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.72)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(8, 5, 18, 0.45)')
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
