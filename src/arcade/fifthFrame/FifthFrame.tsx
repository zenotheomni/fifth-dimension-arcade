import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useArcadeAudio } from '../audio/AudioProvider'
import { prepareSceneMusic } from '../audio/sceneMusic'
import { track } from '../analytics'
import { postScore } from '../core/scores'
import { getCachedPlayer, onPlayerChange, type ArcadePlayer } from '../core/session'
import HandlePrompt from '../social/HandlePrompt'
import { FifthFrameEngine, VIEW, project } from './engine'
import type { EndStats, Hud } from './types'
import './fifthFrame.css'
import '../social/social.css'

const BRAND_LOGO = `${import.meta.env.BASE_URL}art/emblem-128.webp`

export default function FifthFrame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const eng = useRef<FifthFrameEngine | null>(null)
  const audio = useArcadeAudio()
  const { claimScene, duck } = audio
  const [howto, setHowto] = useState(true)
  const [hud, setHud] = useState<Hud>(() => ({
    phase: 'howto',
    score: 0,
    frame: 1,
    ballInFrame: 1,
    standing: 10,
    callout: null,
    pb: 0,
    frames: [],
    hint: 'Flick up the lane',
  }))
  const [ended, setEnded] = useState<EndStats | null>(null)
  const [runState, setRunState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [player, setPlayer] = useState<ArcadePlayer | null>(() => getCachedPlayer())
  const [renaming, setRenaming] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)

  useEffect(() => onPlayerChange(setPlayer), [])

  useEffect(() => {
    const t = window.setTimeout(() => prepareSceneMusic('fifth-frame'), 900)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    return () => {
      duck(false)
      claimScene(null)
    }
  }, [claimScene, duck])

  useEffect(() => {
    duck(Boolean(ended))
  }, [ended, duck])

  useEffect(() => {
    const e = new FifthFrameEngine()
    eng.current = e
    e.setOnEnd((stats) => {
      setEnded(stats)
      setHud(e.hud())
      track('arcade_fifth_frame_end', { score: stats.score, strikes: stats.strikes, spares: stats.spares, newPb: stats.newPb })
    })
    setHud(e.hud())

    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      e.update(dt)
      const canvas = canvasRef.current
      const wrap = wrapRef.current
      if (canvas && wrap) {
        const dpr = Math.min(2.5, window.devicePixelRatio || 1)
        const w = wrap.clientWidth
        const h = wrap.clientHeight
        const bw = Math.max(1, Math.floor(w * dpr))
        const bh = Math.max(1, Math.floor(h * dpr))
        if (canvas.width !== bw || canvas.height !== bh) {
          canvas.width = bw
          canvas.height = bh
        }
        e.setSize(w, h)
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          paint(ctx, w, h, e, now / 1000)
        }
      }
      if (e.phase !== 'howto' && e.phase !== 'ended') setHud(e.hud())
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      eng.current = null
    }
  }, [])

  const startFromHowto = useCallback(() => {
    setHowto(false)
    setEnded(null)
    setRunState('idle')
    setShareNote(null)
    claimScene('fifth-frame')
    eng.current?.start()
    setHud(eng.current!.hud())
    track('arcade_fifth_frame_start')
  }, [claimScene])

  const runItBack = useCallback(() => {
    setEnded(null)
    setRunState('idle')
    setShareNote(null)
    claimScene('fifth-frame')
    eng.current?.start()
    setHud(eng.current!.hud())
    track('arcade_fifth_frame_run_it_back')
  }, [claimScene])

  useEffect(() => {
    if (!ended || runState !== 'idle') return
    setRunState('saving')
    void (async () => {
      try {
        const r = await postScore({
          game: 'fifth-frame',
          mode: 'frames10',
          score: ended.score,
          meta: { strikes: ended.strikes, spares: ended.spares, v: 1 },
        })
        setRunState(r.ok ? 'saved' : 'error')
      } catch {
        setRunState('error')
      }
    })()
  }, [ended, runState])

  const toLocal = (ev: React.PointerEvent) => {
    const wrap = wrapRef.current
    if (!wrap) return { x: 0, y: 0 }
    const r = wrap.getBoundingClientRect()
    return { x: ev.clientX - r.left, y: ev.clientY - r.top }
  }

  const onPointerDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (howto || ended) return
    ev.currentTarget.setPointerCapture(ev.pointerId)
    const { x, y } = toLocal(ev)
    eng.current?.onPointerDown(x, y, ev.pointerId)
  }
  const onPointerMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (howto || ended) return
    const { x, y } = toLocal(ev)
    eng.current?.onPointerMove(x, y, ev.pointerId)
  }
  const onPointerUp = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (howto || ended) return
    const { x, y } = toLocal(ev)
    eng.current?.onPointerUp(x, y, ev.pointerId)
  }

  const challengeStub = async () => {
    if (!ended) return
    const url = `${window.location.origin}${import.meta.env.BASE_URL}fifth-frame`
    const text = `I scored ${ended.score} in FIFTH FRAME. Can you beat it?`
    try {
      if (navigator.share) {
        await navigator.share({ text, url })
        setShareNote('Sent!')
        track('arcade_fifth_frame_share', { how: 'shared' })
        return
      }
    } catch {
      /* cancelled */
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`)
      setShareNote('Link copied — paste it in a text')
      track('arcade_fifth_frame_share', { how: 'copied' })
    } catch {
      setShareNote('Copy failed')
    }
  }

  const handle = player?.handle ?? ''
  const playing = !howto && !ended

  return (
    <div className="ff-root">
      <div className="ff-top">
        <Link to="/" className="ff-back" aria-label="Back to floor">
          ←
        </Link>
        <div className="ff-hud">
          <span className="ff-score">{hud.score}</span>
          <div className="ff-meta">
            <span>
              Frame <b>{hud.frame}</b>/10
            </span>
            <span>
              Ball <b>{hud.ballInFrame}</b>
            </span>
            <span>
              Up <b>{hud.standing}</b>
            </span>
          </div>
        </div>
      </div>

      {playing || ended ? (
        <div className="ff-sheet" aria-label="Score sheet">
          {(hud.frames.length ? hud.frames : Array.from({ length: 10 }, () => ({ rolls: [null, null, null], total: null }))).map(
            (f, i) => (
              <div key={i} className={`ff-frame${i === 9 ? ' is-10' : ''}${hud.frame === i + 1 && playing ? ' is-on' : ''}`}>
                <div className="ff-frame__n">{i + 1}</div>
                <div className="ff-frame__rolls">
                  <span>{fmtRoll(f.rolls[0])}</span>
                  <span>{fmtRoll(f.rolls[1])}</span>
                  {i === 9 ? <span>{fmtRoll(f.rolls[2])}</span> : null}
                </div>
                <div className="ff-frame__tot">{f.total != null ? f.total : ''}</div>
              </div>
            ),
          )}
        </div>
      ) : null}

      <div className="ff-board" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="ff-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {playing && hud.hint ? <p className="ff-hint">{hud.hint}</p> : null}
        {playing && hud.callout ? <p className="ff-callout">{hud.callout}</p> : null}
      </div>

      {howto && !ended ? (
        <div className="ff-howto" role="dialog" aria-label="How to play FIFTH FRAME">
          <div className="ff-howto__card">
            <img src={BRAND_LOGO} alt="" width={56} height={56} className="ff-howto__logo" />
            <p className="ff-howto__eyebrow">How to play</p>
            <h2 className="ff-howto__title">FIFTH FRAME</h2>
            <p className="ff-howto__tag">Neon Fifth Floor alley. One flick. Ten frames. Feel the pins.</p>
            <section>
              <h3>Controls</h3>
              <ul>
                <li>
                  <b>Flick up</b> on the ball — same motion as Court Vision. Angle aims left/right; speed is power.
                </li>
                <li>
                  Easy on iPhone. One clean flick per ball. No buttons.
                </li>
              </ul>
            </section>
            <section>
              <h3>Rules</h3>
              <ul>
                <li>
                  <b>10 frames</b> of classic bowling. Strike clears the rack. Spare needs the second ball.
                </li>
                <li>
                  Frame 10 can give you up to three balls after a strike or spare.
                </li>
              </ul>
            </section>
            <section>
              <h3>Scoring</h3>
              <ul>
                <li>
                  <b>Strike</b> = 10 + next two balls · <b>Spare</b> = 10 + next one · Max <b>300</b>
                </li>
              </ul>
            </section>
            <button type="button" className="ffa-btn ffa-btn--primary ff-howto__start" onClick={startFromHowto}>
              START
            </button>
          </div>
        </div>
      ) : null}

      {ended ? (
        <div className="ff-end" role="dialog" aria-label="Game over">
          <div className="ff-end__card">
            <p className="ff-end__eyebrow">FIFTH FRAME</p>
            <h2>{ended.newPb ? 'New personal best.' : 'Lane clear. Flick again.'}</h2>
            <div className="ff-end__score">
              {ended.score}
              <small> / 300</small>
            </div>
            <div className="ff-end__stats">
              <span>
                <b>{ended.strikes}</b> strikes
              </span>
              <span>
                <b>{ended.spares}</b> spares
              </span>
            </div>
            <p className="ff-end__pb">
              Personal best <strong>{ended.pb}</strong>
            </p>
            {runState === 'saving' ? <p className="ff-end__note">Posting to the board…</p> : null}
            {runState === 'error' ? <p className="ff-end__note">Saved on this phone — board sync later.</p> : null}
            {runState === 'saved' ? <p className="ff-end__note">On the board.</p> : null}

            {renaming || !handle ? (
              <HandlePrompt
                title="Who’s bowling?"
                cta="Save"
                compact
                onDone={() => setRenaming(false)}
              />
            ) : (
              <p className="ff-end__note">
                Playing as <strong>{handle}</strong>{' '}
                <button type="button" className="soc-handle__skip" onClick={() => setRenaming(true)}>
                  Change
                </button>
              </p>
            )}

            <div className="ff-end__actions">
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
            {shareNote ? <p className="ff-end__note">{shareNote}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function fmtRoll(v: number | 'X' | '/' | null | undefined) {
  if (v == null) return ''
  return String(v)
}

function paint(ctx: CanvasRenderingContext2D, W: number, H: number, e: FifthFrameEngine, t: number) {
  // Dark club venue void
  ctx.fillStyle = '#04020c'
  ctx.fillRect(0, 0, W, H)
  const wash = ctx.createRadialGradient(W * 0.5, H * 0.18, 0, W * 0.5, H * 0.5, Math.max(W, H))
  wash.addColorStop(0, 'rgba(40, 20, 90, 0.55)')
  wash.addColorStop(0.35, 'rgba(8, 4, 28, 0.85)')
  wash.addColorStop(1, '#020108')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, W, H)

  // Ceiling / ambient bokeh sparkles (sides of venue)
  drawVenueSparkles(ctx, W, H, t)

  // Neon back wall behind pins
  drawBackWall(ctx, W, H, t)

  const nearL = project(-VIEW.LANE_HALF, 0.0, W, H)
  const nearR = project(VIEW.LANE_HALF, 0.0, W, H)
  const farL = project(-VIEW.LANE_HALF, 1.05, W, H)
  const farR = project(VIEW.LANE_HALF, 1.05, W, H)

  // Soft approach apron under the ball (near)
  const apron = ctx.createLinearGradient(0, H, 0, nearL.cy - 20)
  apron.addColorStop(0, '#0a0614')
  apron.addColorStop(1, 'rgba(10, 6, 20, 0)')
  ctx.fillStyle = apron
  ctx.fillRect(0, nearL.cy - 40, W, H - nearL.cy + 40)

  // Glossy dark glass lane
  ctx.beginPath()
  ctx.moveTo(nearL.cx, nearL.cy)
  ctx.lineTo(nearR.cx, nearR.cy)
  ctx.lineTo(farR.cx, farR.cy)
  ctx.lineTo(farL.cx, farL.cy)
  ctx.closePath()
  const lane = ctx.createLinearGradient(0, nearL.cy, 0, farL.cy)
  lane.addColorStop(0, '#14102a')
  lane.addColorStop(0.35, '#0c0a1c')
  lane.addColorStop(0.7, '#080614')
  lane.addColorStop(1, '#060410')
  ctx.fillStyle = lane
  ctx.fill()

  // Mirror sheen + neon reflection wash on lane
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(nearL.cx, nearL.cy)
  ctx.lineTo(nearR.cx, nearR.cy)
  ctx.lineTo(farR.cx, farR.cy)
  ctx.lineTo(farL.cx, farL.cy)
  ctx.closePath()
  ctx.clip()

  // Center oil / glass highlight
  const sheen = ctx.createLinearGradient(W * 0.5, nearL.cy, W * 0.5, farL.cy)
  sheen.addColorStop(0, 'rgba(140, 210, 255, 0.2)')
  sheen.addColorStop(0.2, 'rgba(255, 255, 255, 0.1)')
  sheen.addColorStop(0.45, 'rgba(0, 230, 210, 0.12)')
  sheen.addColorStop(0.75, 'rgba(123, 63, 228, 0.2)')
  sheen.addColorStop(1, 'rgba(255, 90, 60, 0.1)')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, W, H)

  // Mirrored back-wall glow on far lane
  const mir = ctx.createRadialGradient(W * 0.5, farL.cy + 8, 4, W * 0.5, farL.cy + 30, W * 0.28)
  mir.addColorStop(0, 'rgba(0, 230, 210, 0.38)')
  mir.addColorStop(0.35, 'rgba(123, 63, 228, 0.22)')
  mir.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = mir
  ctx.fillRect(0, 0, W, H)

  // Longitudinal glass streaks
  for (let i = 1; i < 9; i++) {
    const x = -VIEW.LANE_HALF + (VIEW.LANE_HALF * 2 * i) / 9
    const a = project(x, 0.01, W, H)
    const b = project(x, 1.04, W, H)
    ctx.strokeStyle = i === 4 || i === 5 ? 'rgba(255,255,255,0.055)' : 'rgba(180,200,255,0.03)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(a.cx, a.cy)
    ctx.lineTo(b.cx, b.cy)
    ctx.stroke()
  }

  // Reflect pins faintly on the glass lane
  for (const pin of e.pins) {
    if (!pin.up) continue
    const p = project(pin.x, pin.z, W, H)
    ctx.save()
    ctx.globalAlpha = 0.28
    ctx.translate(p.cx, p.cy + 10 * p.scale)
    ctx.scale(1, -0.55)
    ctx.fillStyle = 'rgba(220, 230, 255, 0.9)'
    ctx.beginPath()
    ctx.ellipse(0, 0, 4.5 * p.scale, 11 * p.scale, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  ctx.restore()

  // Glowing gutter rails (green + cyan energy — not copying LB green 1:1, ours lean teal→lime)
  drawRail(ctx, W, H, -VIEW.LANE_HALF, t)
  drawRail(ctx, W, H, VIEW.LANE_HALF, t)

  // Foul line
  const foulL = project(-VIEW.LANE_HALF, 0.1, W, H)
  const foulR = project(VIEW.LANE_HALF, 0.1, W, H)
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 200, 60, 0.45)'
  ctx.shadowColor = 'rgba(255, 180, 40, 0.55)'
  ctx.shadowBlur = 8
  ctx.lineWidth = 2.2
  ctx.beginPath()
  ctx.moveTo(foulL.cx, foulL.cy)
  ctx.lineTo(foulR.cx, foulR.cy)
  ctx.stroke()
  ctx.restore()

  // Lane arrows
  for (let i = 0; i < 5; i++) {
    const x = -0.2 + i * 0.1
    const p = project(x, 0.36, W, H)
    ctx.fillStyle = 'rgba(0, 230, 210, 0.4)'
    ctx.beginPath()
    ctx.moveTo(p.cx, p.cy - 5.5 * p.scale)
    ctx.lineTo(p.cx - 4.2 * p.scale, p.cy + 3.2 * p.scale)
    ctx.lineTo(p.cx + 4.2 * p.scale, p.cy + 3.2 * p.scale)
    ctx.closePath()
    ctx.fill()
  }

  // Side aisle sparkles / light trails
  drawSideParticles(ctx, W, H, t)

  // Pins back-to-front
  const pins = [...e.pins].sort((a, b) => b.z - a.z)
  for (const pin of pins) drawPin(ctx, W, H, pin, t)

  // Aim ghost
  if (e.phase === 'aim' && e.aimPower > 0.05) {
    const steps = 16
    for (let i = 1; i <= steps; i++) {
      const z = 0.08 + (0.78 * i) / steps
      const x = e.ball.x + e.aimX * (z - 0.08) * 0.9
      const p = project(x, z, W, H)
      ctx.fillStyle = `rgba(0, 230, 210, ${0.06 + (1 - i / steps) * 0.28})`
      ctx.beginPath()
      ctx.arc(p.cx, p.cy, 3.8 * p.scale, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  drawBall(ctx, W, H, e, t)
}

function drawBackWall(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  const deck = project(0, 1.02, W, H)
  const left = project(-VIEW.LANE_HALF * 1.15, 1.02, W, H)
  const right = project(VIEW.LANE_HALF * 1.15, 1.02, W, H)
  const wallTop = deck.cy - H * 0.22
  const wallBot = deck.cy + H * 0.02

  // Dark wall panel
  const wg = ctx.createLinearGradient(0, wallTop, 0, wallBot)
  wg.addColorStop(0, '#0a0618')
  wg.addColorStop(1, '#120a28')
  ctx.fillStyle = wg
  ctx.beginPath()
  ctx.moveTo(left.cx - 18, wallBot)
  ctx.lineTo(left.cx - 10, wallTop)
  ctx.lineTo(right.cx + 10, wallTop)
  ctx.lineTo(right.cx + 18, wallBot)
  ctx.closePath()
  ctx.fill()

  // Soft neon halo behind signage
  const halo = ctx.createRadialGradient(W * 0.5, deck.cy - H * 0.08, 4, W * 0.5, deck.cy - H * 0.06, W * 0.32)
  halo.addColorStop(0, 'rgba(0, 220, 210, 0.28)')
  halo.addColorStop(0.45, 'rgba(123, 63, 228, 0.18)')
  halo.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, wallTop - 20, W, wallBot - wallTop + 40)

  // Fifth Dimension emblem: neon "5" in a soft ring (own brand — not LB)
  const ex = W * 0.5
  const ey = deck.cy - H * 0.11
  const er = Math.min(W, H) * 0.055
  ctx.save()
  ctx.shadowColor = 'rgba(0, 230, 210, 0.9)'
  ctx.shadowBlur = 18
  ctx.strokeStyle = 'rgba(0, 230, 210, 0.85)'
  ctx.lineWidth = 2.4
  ctx.beginPath()
  ctx.arc(ex, ey, er, 0, Math.PI * 2)
  ctx.stroke()
  ctx.shadowColor = 'rgba(255, 90, 60, 0.7)'
  ctx.strokeStyle = 'rgba(255, 120, 70, 0.55)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(ex, ey, er * 1.18, 0.2, Math.PI * 1.6)
  ctx.stroke()
  ctx.fillStyle = '#f4f0ea'
  ctx.shadowColor = 'rgba(123, 63, 228, 0.85)'
  ctx.shadowBlur = 12
  ctx.font = `800 ${Math.round(er * 1.35)}px Inter, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('5', ex, ey + 1)
  ctx.restore()

  // FIFTH FLOOR wordmark
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const pulse = 0.75 + 0.25 * Math.sin(t * 2.2)
  ctx.font = `800 ${Math.max(11, Math.round(H * 0.018))}px Inter, system-ui, sans-serif`
  ctx.letterSpacing = '0.18em'
  ctx.shadowColor = `rgba(0, 230, 210, ${0.55 * pulse})`
  ctx.shadowBlur = 10
  const grad = ctx.createLinearGradient(ex - 60, 0, ex + 60, 0)
  grad.addColorStop(0, '#00e6d2')
  grad.addColorStop(0.45, '#7b3fe4')
  grad.addColorStop(0.75, '#ff5a3c')
  grad.addColorStop(1, '#ffc83c')
  ctx.fillStyle = grad
  ctx.fillText('FIFTH FLOOR', ex, ey + er + 6)
  ctx.font = `600 ${Math.max(8, Math.round(H * 0.011))}px Inter, system-ui, sans-serif`
  ctx.shadowBlur = 6
  ctx.fillStyle = `rgba(180, 240, 255, ${0.55 + 0.25 * pulse})`
  ctx.fillText('ARCADE ALLEY', ex, ey + er + 6 + Math.max(12, H * 0.018))
  ctx.restore()

  // Pin deck light strip
  ctx.save()
  ctx.strokeStyle = 'rgba(0, 230, 210, 0.55)'
  ctx.shadowColor = 'rgba(0, 230, 210, 0.8)'
  ctx.shadowBlur = 12
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(left.cx + 6, deck.cy + 2)
  ctx.lineTo(right.cx - 6, deck.cy + 2)
  ctx.stroke()
  ctx.restore()
}

function drawRail(ctx: CanvasRenderingContext2D, W: number, H: number, x: number, t: number) {
  const a = project(x, 0.0, W, H)
  const b = project(x, 1.06, W, H)
  const pulse = 0.7 + 0.3 * Math.sin(t * 3 + x * 8)
  ctx.save()
  // Outer lime-teal glow
  ctx.strokeStyle = `rgba(40, 255, 160, ${0.35 * pulse})`
  ctx.shadowColor = 'rgba(40, 255, 160, 0.95)'
  ctx.shadowBlur = 22
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(a.cx, a.cy)
  ctx.lineTo(b.cx, b.cy)
  ctx.stroke()
  // Core cyan
  ctx.strokeStyle = `rgba(0, 240, 220, ${0.85 * pulse})`
  ctx.shadowColor = 'rgba(0, 230, 210, 1)'
  ctx.shadowBlur = 14
  ctx.lineWidth = 2.8
  ctx.beginPath()
  ctx.moveTo(a.cx, a.cy)
  ctx.lineTo(b.cx, b.cy)
  ctx.stroke()
  // Inner hot line
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.shadowBlur = 0
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(a.cx, a.cy)
  ctx.lineTo(b.cx, b.cy)
  ctx.stroke()
  ctx.restore()
}

function drawVenueSparkles(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  ctx.save()
  for (let i = 0; i < 64; i++) {
    const side = i % 2 === 0 ? 0.08 : 0.92
    const sx = (side + (((i * 37) % 100) / 1000) * (i % 2 === 0 ? 1 : -1)) * W
    const sy = (((i * 61) % 1000) / 1000) * H * 0.72
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.4 + i * 0.7))
    const r = 0.8 + (i % 4) * 0.5
    ctx.fillStyle = i % 5 === 0
      ? `rgba(40, 255, 180, ${0.2 + tw * 0.45})`
      : `rgba(140, 200, 255, ${0.15 + tw * 0.4})`
    ctx.beginPath()
    ctx.arc(sx, sy, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawSideParticles(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  const nearL = project(-VIEW.LANE_HALF, 0.05, W, H)
  const farL = project(-VIEW.LANE_HALF, 1.0, W, H)
  const nearR = project(VIEW.LANE_HALF, 0.05, W, H)
  const farR = project(VIEW.LANE_HALF, 1.0, W, H)
  ctx.save()
  for (let i = 0; i < 36; i++) {
    const u = ((i * 0.07 + t * 0.08) % 1)
    const side = i % 2 === 0 ? -1 : 1
    const ax = side < 0 ? nearL.cx : nearR.cx
    const ay = side < 0 ? nearL.cy : nearR.cy
    const bx = side < 0 ? farL.cx : farR.cx
    const by = side < 0 ? farL.cy : farR.cy
    const x = ax + (bx - ax) * u + side * (8 + (i % 5) * 3)
    const y = ay + (by - ay) * u
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2.5 + i))
    ctx.fillStyle = `rgba(60, 255, 200, ${0.15 + tw * 0.35})`
    ctx.shadowColor = 'rgba(0, 255, 200, 0.6)'
    ctx.shadowBlur = 6
    ctx.beginPath()
    ctx.arc(x, y, 1.2 + (i % 3) * 0.4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawPin(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  pin: { x: number; z: number; up: boolean; angle: number; vx: number; vz: number },
  t: number,
) {
  const p = project(pin.x, pin.z, W, H)
  const h = 30 * p.scale
  const w = 10 * p.scale
  ctx.save()
  ctx.translate(p.cx, p.cy)
  if (!pin.up) {
    const ang = pin.angle || Math.atan2(pin.vz, pin.vx) || 0.9
    ctx.rotate(ang)
    ctx.globalAlpha = 0.5
  }
  // Floor contact glow
  ctx.fillStyle = 'rgba(0, 220, 210, 0.12)'
  ctx.beginPath()
  ctx.ellipse(0, h * 0.42, w * 1.1, w * 0.35, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.shadowColor = 'rgba(255, 240, 220, 0.65)'
  ctx.shadowBlur = 12 * p.scale
  const body = ctx.createLinearGradient(0, -h, 0, h * 0.4)
  body.addColorStop(0, '#fff8f0')
  body.addColorStop(0.4, '#efe6da')
  body.addColorStop(1, '#c8bdb0')
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.moveTo(0, -h)
  ctx.bezierCurveTo(w * 0.7, -h * 0.75, w * 0.85, -h * 0.2, w * 0.7, h * 0.05)
  ctx.bezierCurveTo(w * 0.95, h * 0.2, w * 0.85, h * 0.45, 0, h * 0.5)
  ctx.bezierCurveTo(-w * 0.85, h * 0.45, -w * 0.95, h * 0.2, -w * 0.7, h * 0.05)
  ctx.bezierCurveTo(-w * 0.85, -h * 0.2, -w * 0.7, -h * 0.75, 0, -h)
  ctx.fill()

  // Classic red neck stripe (readable under neon)
  ctx.shadowBlur = 0
  ctx.fillStyle = '#c62828'
  ctx.beginPath()
  ctx.ellipse(0, -h * 0.32, w * 0.48, w * 0.22, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = Math.max(0.8, 1.2 * p.scale)
  ctx.stroke()

  // Soft neon rim so pins pop on dark lane
  ctx.strokeStyle = `rgba(0, 230, 210, ${0.25 + 0.12 * Math.sin(t * 3 + pin.x * 10)})`
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, -h)
  ctx.bezierCurveTo(w * 0.7, -h * 0.75, w * 0.85, -h * 0.2, w * 0.7, h * 0.05)
  ctx.stroke()
  ctx.restore()
}

function drawBall(ctx: CanvasRenderingContext2D, W: number, H: number, e: FifthFrameEngine, t: number) {
  const b = e.ball
  if (!b.alive && e.phase !== 'aim') return
  const p = project(b.x, b.z, W, H)
  const r = (VIEW.BALL_R * W * 0.52 * p.scale) / VIEW.LANE_HALF

  ctx.save()
  // Contact shadow on glass
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.beginPath()
  ctx.ellipse(p.cx, p.cy + r * 0.7, r * 1.05, r * 0.34, 0, 0, Math.PI * 2)
  ctx.fill()

  // Glass reflection under ball
  ctx.globalAlpha = 0.35
  ctx.fillStyle = 'rgba(100, 180, 255, 0.25)'
  ctx.beginPath()
  ctx.ellipse(p.cx, p.cy + r * 0.95, r * 0.75, r * 0.22, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  if (b.rolling) {
    ctx.strokeStyle = 'rgba(0, 230, 210, 0.4)'
    ctx.shadowColor = 'rgba(140, 80, 255, 0.7)'
    ctx.shadowBlur = 16
    ctx.lineWidth = Math.max(2, r * 0.28)
    ctx.beginPath()
    const trail = project(b.x - b.vx * 0.06, b.z - b.vz * 0.06, W, H)
    ctx.moveTo(trail.cx, trail.cy)
    ctx.lineTo(p.cx, p.cy)
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  // Solid dark sphere
  const g = ctx.createRadialGradient(p.cx - r * 0.32, p.cy - r * 0.38, r * 0.05, p.cx, p.cy, r)
  g.addColorStop(0, '#4a3a6e')
  g.addColorStop(0.35, '#1a102e')
  g.addColorStop(0.75, '#0a0614')
  g.addColorStop(1, '#030208')
  ctx.fillStyle = g
  ctx.shadowColor = 'rgba(100, 60, 200, 0.55)'
  ctx.shadowBlur = 18
  ctx.beginPath()
  ctx.arc(p.cx, p.cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0

  // Specular highlight
  const hl = ctx.createRadialGradient(p.cx - r * 0.3, p.cy - r * 0.35, 0, p.cx - r * 0.3, p.cy - r * 0.35, r * 0.45)
  hl.addColorStop(0, 'rgba(255,255,255,0.35)')
  hl.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = hl
  ctx.beginPath()
  ctx.arc(p.cx, p.cy, r, 0, Math.PI * 2)
  ctx.fill()

  // Neon accent rings — full closed bands on the sphere
  const spin = t * (b.rolling ? 6.5 : 0.5)
  ctx.save()
  ctx.beginPath()
  ctx.arc(p.cx, p.cy, r, 0, Math.PI * 2)
  ctx.clip()
  for (let ring = 0; ring < 2; ring++) {
    const tilt = 0.55 + ring * 0.12
    const rr = r * (0.72 - ring * 0.18)
    ctx.strokeStyle = ring === 0 ? 'rgba(170, 90, 255, 0.9)' : 'rgba(0, 235, 215, 0.85)'
    ctx.shadowColor = ring === 0 ? 'rgba(170, 90, 255, 1)' : 'rgba(0, 235, 215, 1)'
    ctx.shadowBlur = 8
    ctx.lineWidth = Math.max(1.6, r * 0.09)
    ctx.beginPath()
    ctx.ellipse(p.cx, p.cy + Math.sin(spin + ring) * r * 0.08, rr, rr * tilt, spin * 0.4 + ring * 0.9, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()

  // Finger holes
  ctx.fillStyle = 'rgba(0,0,0,0.65)'
  for (let i = 0; i < 3; i++) {
    const ang = -0.6 + i * 0.55 + (b.rolling ? spin * 0.15 : 0)
    const hx = p.cx + Math.cos(ang) * r * 0.22 - r * 0.05
    const hy = p.cy + Math.sin(ang) * r * 0.22 - r * 0.22
    ctx.beginPath()
    ctx.arc(hx, hy, Math.max(1.5, r * 0.085), 0, Math.PI * 2)
    ctx.fill()
  }

  // Cyan outer rim
  ctx.strokeStyle = 'rgba(0, 240, 220, 0.7)'
  ctx.lineWidth = Math.max(1.5, r * 0.065)
  ctx.shadowColor = 'rgba(0, 240, 220, 0.8)'
  ctx.shadowBlur = 10
  ctx.beginPath()
  ctx.arc(p.cx, p.cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}
