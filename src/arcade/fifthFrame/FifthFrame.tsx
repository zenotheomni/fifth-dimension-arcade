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
  // Galaxy void
  ctx.fillStyle = '#070412'
  ctx.fillRect(0, 0, W, H)
  const wash = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.85)
  wash.addColorStop(0, 'rgba(0, 200, 196, 0.08)')
  wash.addColorStop(0.35, 'rgba(123, 63, 228, 0.12)')
  wash.addColorStop(0.7, 'rgba(18, 8, 40, 0.55)')
  wash.addColorStop(1, 'rgba(4, 2, 12, 0.95)')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, W, H)

  // stars
  ctx.save()
  for (let i = 0; i < 48; i++) {
    const sx = ((i * 97) % 1000) / 1000
    const sy = ((i * 53) % 1000) / 1000
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.7 + i))
    ctx.fillStyle = `rgba(220, 230, 255, ${0.15 + tw * 0.35})`
    ctx.fillRect(sx * W, sy * H * 0.55, 1.4, 1.4)
  }
  ctx.restore()

  // lane trapezoid
  const nearL = project(-VIEW.LANE_HALF, 0.02, W, H)
  const nearR = project(VIEW.LANE_HALF, 0.02, W, H)
  const farL = project(-VIEW.LANE_HALF, 1.02, W, H)
  const farR = project(VIEW.LANE_HALF, 1.02, W, H)

  const lane = ctx.createLinearGradient(0, nearL.cy, 0, farL.cy)
  lane.addColorStop(0, '#1a1430')
  lane.addColorStop(0.55, '#12102a')
  lane.addColorStop(1, '#0c0a1c')
  ctx.beginPath()
  ctx.moveTo(nearL.cx, nearL.cy)
  ctx.lineTo(nearR.cx, nearR.cy)
  ctx.lineTo(farR.cx, farR.cy)
  ctx.lineTo(farL.cx, farL.cy)
  ctx.closePath()
  ctx.fillStyle = lane
  ctx.fill()

  // center oil sheen
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(nearL.cx, nearL.cy)
  ctx.lineTo(nearR.cx, nearR.cy)
  ctx.lineTo(farR.cx, farR.cy)
  ctx.lineTo(farL.cx, farL.cy)
  ctx.clip()
  const sheen = ctx.createLinearGradient(W * 0.5, nearL.cy, W * 0.5, farL.cy)
  sheen.addColorStop(0, 'rgba(0, 200, 196, 0.07)')
  sheen.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)')
  sheen.addColorStop(1, 'rgba(123, 63, 228, 0.08)')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, W, H)

  // lane boards (subtle)
  for (let i = 1; i < 8; i++) {
    const x = -VIEW.LANE_HALF + (VIEW.LANE_HALF * 2 * i) / 8
    const a = project(x, 0.02, W, H)
    const b = project(x, 1.02, W, H)
    ctx.strokeStyle = 'rgba(255,255,255,0.035)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(a.cx, a.cy)
    ctx.lineTo(b.cx, b.cy)
    ctx.stroke()
  }
  ctx.restore()

  // neon gutters / rails
  const drawRail = (x: number) => {
    const a = project(x, 0.0, W, H)
    const b = project(x, 1.05, W, H)
    ctx.save()
    ctx.strokeStyle = 'rgba(0, 200, 196, 0.55)'
    ctx.shadowColor = 'rgba(0, 200, 196, 0.85)'
    ctx.shadowBlur = 14
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(a.cx, a.cy)
    ctx.lineTo(b.cx, b.cy)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(123, 63, 228, 0.45)'
    ctx.shadowColor = 'rgba(123, 63, 228, 0.7)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(a.cx + (x < 0 ? -4 : 4), a.cy)
    ctx.lineTo(b.cx + (x < 0 ? -2 : 2), b.cy)
    ctx.stroke()
    ctx.restore()
  }
  drawRail(-VIEW.LANE_HALF)
  drawRail(VIEW.LANE_HALF)

  // approach dots / foul line
  const foulL = project(-VIEW.LANE_HALF, 0.12, W, H)
  const foulR = project(VIEW.LANE_HALF, 0.12, W, H)
  ctx.strokeStyle = 'rgba(255, 200, 60, 0.35)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(foulL.cx, foulL.cy)
  ctx.lineTo(foulR.cx, foulR.cy)
  ctx.stroke()

  // arrows on lane
  for (let i = 0; i < 5; i++) {
    const x = -0.22 + i * 0.11
    const p = project(x, 0.38, W, H)
    ctx.fillStyle = 'rgba(0, 200, 196, 0.35)'
    ctx.beginPath()
    ctx.moveTo(p.cx, p.cy - 5 * p.scale)
    ctx.lineTo(p.cx - 4 * p.scale, p.cy + 3 * p.scale)
    ctx.lineTo(p.cx + 4 * p.scale, p.cy + 3 * p.scale)
    ctx.closePath()
    ctx.fill()
  }

  // pins (far first already by z — draw back-to-front by sorting z desc then... front = higher z wait z increases away)
  // near z small = bottom of screen; draw high z first (far), then low z
  const pins = [...e.pins].sort((a, b) => b.z - a.z)
  for (const pin of pins) {
    drawPin(ctx, W, H, pin, t)
  }

  // aim ghost
  if (e.phase === 'aim' && e.aimPower > 0.05) {
    const steps = 14
    for (let i = 1; i <= steps; i++) {
      const z = 0.08 + (0.75 * i) / steps
      const x = e.ball.x + e.aimX * (z - 0.08) * 0.9
      const p = project(x, z, W, H)
      ctx.fillStyle = `rgba(0, 200, 196, ${0.08 + (1 - i / steps) * 0.25})`
      ctx.beginPath()
      ctx.arc(p.cx, p.cy, 3.5 * p.scale, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // ball
  drawBall(ctx, W, H, e, t)
}

function drawPin(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  pin: { x: number; z: number; up: boolean; angle: number; vx: number; vz: number },
  t: number,
) {
  const p = project(pin.x, pin.z, W, H)
  const h = 26 * p.scale
  const w = 9 * p.scale
  ctx.save()
  ctx.translate(p.cx, p.cy)
  if (!pin.up) {
    const ang = pin.angle || Math.atan2(pin.vz, pin.vx) || 0.9
    ctx.rotate(ang)
    ctx.globalAlpha = 0.55
  }
  // glow
  ctx.shadowColor = 'rgba(200, 180, 255, 0.55)'
  ctx.shadowBlur = 10 * p.scale
  // body
  const body = ctx.createLinearGradient(0, -h, 0, h * 0.35)
  body.addColorStop(0, '#f4f0ea')
  body.addColorStop(0.45, '#ddd6cc')
  body.addColorStop(1, '#b8b0a4')
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.moveTo(0, -h)
  ctx.bezierCurveTo(w * 0.7, -h * 0.75, w * 0.85, -h * 0.2, w * 0.7, h * 0.05)
  ctx.bezierCurveTo(w * 0.95, h * 0.2, w * 0.85, h * 0.45, 0, h * 0.5)
  ctx.bezierCurveTo(-w * 0.85, h * 0.45, -w * 0.95, h * 0.2, -w * 0.7, h * 0.05)
  ctx.bezierCurveTo(-w * 0.85, -h * 0.2, -w * 0.7, -h * 0.75, 0, -h)
  ctx.fill()
  // neck band
  ctx.strokeStyle = 'rgba(72, 32, 120, 0.75)'
  ctx.lineWidth = Math.max(1, 2 * p.scale)
  ctx.beginPath()
  ctx.ellipse(0, -h * 0.35, w * 0.45, w * 0.18, 0, 0, Math.PI * 2)
  ctx.stroke()
  // neon rim
  ctx.strokeStyle = `rgba(0, 200, 196, ${0.35 + 0.15 * Math.sin(t * 3 + pin.x * 10)})`
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()
}

function drawBall(ctx: CanvasRenderingContext2D, W: number, H: number, e: FifthFrameEngine, t: number) {
  const b = e.ball
  if (!b.alive && e.phase !== 'aim') return
  const p = project(b.x, b.z, W, H)
  const r = VIEW.BALL_R * W * 0.55 * p.scale / VIEW.LANE_HALF
  // shadow
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(p.cx, p.cy + r * 0.55, r * 0.9, r * 0.28, 0, 0, Math.PI * 2)
  ctx.fill()
  // glow trail when rolling
  if (b.rolling) {
    ctx.strokeStyle = 'rgba(0, 200, 196, 0.35)'
    ctx.shadowColor = 'rgba(0, 200, 196, 0.7)'
    ctx.shadowBlur = 16
    ctx.lineWidth = r * 0.45
    ctx.beginPath()
    const trail = project(b.x - b.vx * 0.08, b.z - b.vz * 0.08, W, H)
    ctx.moveTo(trail.cx, trail.cy)
    ctx.lineTo(p.cx, p.cy)
    ctx.stroke()
  }
  // sphere
  const g = ctx.createRadialGradient(p.cx - r * 0.35, p.cy - r * 0.4, r * 0.1, p.cx, p.cy, r)
  g.addColorStop(0, '#5a4a8a')
  g.addColorStop(0.45, '#2a1a48')
  g.addColorStop(1, '#0e0818')
  ctx.fillStyle = g
  ctx.shadowColor = 'rgba(123, 63, 228, 0.65)'
  ctx.shadowBlur = 18
  ctx.beginPath()
  ctx.arc(p.cx, p.cy, r, 0, Math.PI * 2)
  ctx.fill()
  // finger holes
  ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  const spin = t * (b.rolling ? 8 : 0.4)
  for (let i = 0; i < 3; i++) {
    const ang = spin + (i * Math.PI * 2) / 3
    const hx = p.cx + Math.cos(ang) * r * 0.28
    const hy = p.cy + Math.sin(ang) * r * 0.28 - r * 0.08
    ctx.beginPath()
    ctx.arc(hx, hy, r * 0.1, 0, Math.PI * 2)
    ctx.fill()
  }
  // cyan rim
  ctx.strokeStyle = 'rgba(0, 200, 196, 0.55)'
  ctx.lineWidth = Math.max(1.2, r * 0.08)
  ctx.beginPath()
  ctx.arc(p.cx, p.cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}
