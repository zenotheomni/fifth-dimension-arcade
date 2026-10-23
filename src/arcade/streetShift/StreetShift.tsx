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
import { START_LIVES } from './types'
import './streetShift.css'

const DPR_CAP = 2

function readSwipe(dx: number, dy: number): Dir | null {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax < 18 && ay < 18) return null
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
    shifts: 0,
    pb: 0,
    callout: null,
  })
  const [howto, setHowto] = useState(true)
  const [ended, setEnded] = useState<ReturnType<StreetShiftEngine['getEndStats']>>(null)
  const [runState, setRunState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [shareNote, setShareNote] = useState<string | null>(null)
  const touch0 = useRef<{ x: number; y: number } | null>(null)

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

  // draw loop
  useEffect(() => {
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const c = canvasRef.current
      const e = eng.current
      if (!c || !e) return
      const ctx = c.getContext('2d')
      if (!ctx) return
      paint(ctx, c, e, logoRef.current, hud.shiftWarn)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [hud.shiftWarn])

  // resize
  useEffect(() => {
    const fit = () => {
      const wrap = wrapRef.current
      const c = canvasRef.current
      if (!wrap || !c) return
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
      c.width = Math.floor(w * dpr)
      c.height = Math.floor(h * dpr)
      c.style.width = `${w}px`
      c.style.height = `${h}px`
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
    track('arcade_street_shift_start')
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

  // persist score when ended
  useEffect(() => {
    if (!ended || runState !== 'idle') return
    setRunState('saving')
    void (async () => {
      try {
        const r = await postScore({
          game: 'street-shift',
          mode: 'endless',
          score: ended.score,
          meta: { stars: ended.stars, tags: ended.tags, shifts: ended.shifts, livedS: ended.livedS },
        })
        setRunState(r.ok ? 'saved' : 'error')
      } catch {
        setRunState('error')
      }
    })()
  }, [ended, runState])

  // input
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
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
  }, [])

  const onTouchStart = (ev: React.TouchEvent) => {
    const t = ev.changedTouches[0]
    if (!t) return
    touch0.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (ev: React.TouchEvent) => {
    const t = ev.changedTouches[0]
    const a = touch0.current
    touch0.current = null
    if (!t || !a) return
    const d = readSwipe(t.clientX - a.x, t.clientY - a.y)
    if (d != null) eng.current?.queueDir(d)
  }

  const challengeStub = async () => {
    if (!ended) return
    const url = `${window.location.origin}${import.meta.env.BASE_URL}street-shift`
    const text = `I scored ${ended.score.toLocaleString('en-US')} in STREET SHIFT. Can you beat it?`
    const how = await shareOrCopy(text, url)
    setShareNote(how === 'shared' ? 'Sent!' : how === 'copied' ? 'Link copied — paste it in a text' : how === 'cancelled' ? null : 'Copy failed')
    track('arcade_street_shift_share', { how })
  }

  const playing = hud.phase === 'playing' || hud.phase === 'dying'

  return (
    <div className="ss-root">
      <div className="ss-top">
        <Link to="/" className="ss-back" aria-label="Back to floor">
          ←
        </Link>
        <div className="ss-hud">
          <span className="ss-score">{hud.score.toLocaleString('en-US')}</span>
          <span className="ss-lives" aria-label={`${hud.lives} lives`}>
            {'♥'.repeat(Math.max(0, hud.lives))}
            <span className="ss-lives__empty">{'♥'.repeat(Math.max(0, START_LIVES - hud.lives))}</span>
          </span>
        </div>
        <span className="ss-meta">{hud.powerLeft > 0 ? `5D ${hud.powerLeft.toFixed(1)}s` : `${hud.starsLeft}★`}</span>
      </div>

      <div
        className={`ss-board${hud.shiftWarn > 0 ? ' is-warn' : ''}`}
        ref={wrapRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          touch0.current = null
        }}
      >
        <canvas ref={canvasRef} className="ss-canvas" />
        {hud.callout ? <p className="ss-callout">{hud.callout}</p> : null}
        {playing ? (
          <p className="ss-hint" aria-hidden>
            Swipe to turn
          </p>
        ) : null}
      </div>

      {howto && !ended ? (
        <div className="ss-howto" role="dialog" aria-label="How to play STREET SHIFT">
          <div className="ss-howto__card">
            <img src={BRAND_LOGO} alt="" width={56} height={56} className="ss-howto__logo" />
            <p className="ss-howto__eyebrow">How to play</p>
            <h2 className="ss-howto__title">STREET SHIFT</h2>
            <section>
              <h3>Controls</h3>
              <ul>
                <li>
                  <b>Swipe</b> to queue your next turn — you keep auto-rolling like Pac-Man. Forgiving corners.
                </li>
                <li>
                  <b>←↑↓→</b> / WASD work too.
                </li>
              </ul>
            </section>
            <section>
              <h3>Rules</h3>
              <ul>
                <li>
                  <b>★</b> Grab stars on the Miami street grid.
                </li>
                <li>
                  <img src={BRAND_LOGO} alt="" width={22} height={22} className="ss-inline-logo" />
                  5D logo = power pellet. Shadows freeze — tag them for big points.
                </li>
                <li>
                  <b>MAZE SHIFT</b> every ~10s. Walls rearrange after a 1s pulse. You always keep an exit.
                </li>
                <li>
                  <b>{'♥'.repeat(START_LIVES)}</b> {START_LIVES} lives. Touch a live shadow and you glitch.
                </li>
              </ul>
            </section>
            <section>
              <h3>Scoring</h3>
              <ul>
                <li>
                  <b>Stars</b> +10 · <b>Tags</b> 200 / 400 / 800 / 1600 · <b>Time</b> bonus at the end
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
          <p className="ss-end__eyebrow">STREET SHIFT</p>
          <h2>{ended.score >= hud.pb && ended.score > 0 ? 'Fifth State unlocked.' : 'Glitch. Rearrange. Run it back.'}</h2>
          <div className="ss-end__score">
            {ended.score.toLocaleString('en-US')}
            <small> pts</small>
          </div>
          <div className="ss-end__stats">
            <span>
              <b>{ended.stars}</b> stars
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
          <p className="ss-end__stub">Same-seed challenges land in a later drop — share still sends your score.</p>
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
  warn: number,
) {
  const W = canvas.width
  const H = canvas.height
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#0A0620'
  ctx.fillRect(0, 0, W, H)

  const pad = Math.min(W, H) * 0.04
  const cell = Math.min((W - pad * 2) / COLS, (H - pad * 2) / ROWS)
  const ox = (W - cell * COLS) / 2
  const oy = (H - cell * ROWS) / 2

  // street grid fill
  ctx.fillStyle = '#12081f'
  ctx.fillRect(ox, oy, cell * COLS, cell * ROWS)

  const pulse = warn > 0 ? 0.35 + 0.65 * Math.abs(Math.sin(performance.now() / 90)) : 1

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const wall = e.grid[y * COLS + x] === 1
      const px = ox + x * cell
      const py = oy + y * cell
      if (wall) {
        ctx.fillStyle = warn > 0 ? `rgba(255,90,60,${0.35 + 0.45 * pulse})` : '#1C0C30'
        ctx.fillRect(px, py, cell + 0.5, cell + 0.5)
        ctx.strokeStyle = warn > 0 ? `rgba(0,200,196,${0.5 * pulse})` : 'rgba(0,200,196,0.35)'
        ctx.lineWidth = Math.max(1, cell * 0.08)
        ctx.strokeRect(px + 1, py + 1, cell - 2, cell - 2)
      } else {
        // asphalt
        ctx.fillStyle = '#16102a'
        ctx.fillRect(px, py, cell + 0.5, cell + 0.5)
      }
    }
  }

  // stars
  for (const k of e.stars) {
    const x = k % COLS
    const y = (k / COLS) | 0
    const cx = ox + (x + 0.5) * cell
    const cy = oy + (y + 0.5) * cell
    ctx.beginPath()
    ctx.fillStyle = '#FFC83C'
    ctx.arc(cx, cy, Math.max(2, cell * 0.12), 0, Math.PI * 2)
    ctx.fill()
  }

  // power pellets (5D)
  for (const k of e.powers) {
    const x = k % COLS
    const y = (k / COLS) | 0
    const cx = ox + (x + 0.5) * cell
    const cy = oy + (y + 0.5) * cell
    const s = cell * 0.7
    if (logo && logo.complete && logo.naturalWidth) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, s * 0.55, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(logo, cx - s / 2, cy - s / 2, s, s)
      ctx.restore()
      ctx.strokeStyle = 'rgba(255,200,60,0.85)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(cx, cy, s * 0.55, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      ctx.fillStyle = '#FFC83C'
      ctx.beginPath()
      ctx.arc(cx, cy, cell * 0.28, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // ghosts
  for (const g of e.ghosts) {
    const cx = ox + (g.x + 0.5) * cell
    const cy = oy + (g.y + 0.5) * cell
    const r = cell * 0.38
    if (g.mode === 'eaten') {
      ctx.fillStyle = '#F2F0EA'
      ctx.beginPath()
      ctx.arc(cx - r * 0.25, cy, r * 0.22, 0, Math.PI * 2)
      ctx.arc(cx + r * 0.25, cy, r * 0.22, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    const fright = g.mode === 'frightened'
    const blink = fright && e.powerT < 2 && Math.floor(e.powerT * 6) % 2 === 0
    ctx.fillStyle = fright ? (blink ? '#F2F0EA' : '#482078') : g.color
    ctx.beginPath()
    ctx.arc(cx, cy - r * 0.1, r, Math.PI, 0)
    ctx.lineTo(cx + r, cy + r * 0.7)
    for (let i = 0; i < 4; i++) {
      const t0 = i / 4
      const t1 = (i + 0.5) / 4
      ctx.lineTo(cx + r - t1 * 2 * r, cy + r * 0.35)
      ctx.lineTo(cx + r - (t0 + 0.25) * 2 * r * 0 + r - ((i + 1) / 4) * 2 * r, cy + r * 0.7)
    }
    ctx.closePath()
    ctx.fill()
    // eyes
    ctx.fillStyle = '#F2F0EA'
    ctx.beginPath()
    ctx.arc(cx - r * 0.28, cy - r * 0.15, r * 0.18, 0, Math.PI * 2)
    ctx.arc(cx + r * 0.28, cy - r * 0.15, r * 0.18, 0, Math.PI * 2)
    ctx.fill()
    if (!fright) {
      ctx.fillStyle = '#0A0A0C'
      ctx.beginPath()
      ctx.arc(cx - r * 0.28, cy - r * 0.15, r * 0.08, 0, Math.PI * 2)
      ctx.arc(cx + r * 0.28, cy - r * 0.15, r * 0.08, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // player — neon runner disc
  {
    const cx = ox + (e.px + 0.5) * cell
    const cy = oy + (e.py + 0.5) * cell
    const r = cell * 0.36
    const flash = e.invulnT > 0 && Math.floor(e.invulnT * 10) % 2 === 0
    if (!flash) {
      ctx.shadowColor = '#00C8C4'
      ctx.shadowBlur = cell * 0.4
      ctx.fillStyle = '#00E5FF'
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.fillStyle = '#0A0A0C'
      ctx.beginPath()
      ctx.arc(cx + r * 0.15, cy - r * 0.1, r * 0.18, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
