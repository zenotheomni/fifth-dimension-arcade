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

const BRAND_LOGO = `${import.meta.env.BASE_URL}art/emblem-neon-sign.webp`

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

const WALL_EMBLEM_SRC = `${import.meta.env.BASE_URL}art/emblem-neon-sign.webp`
let wallEmblem: HTMLImageElement | null = null
let wallEmblemFailed = false

function ensureWallEmblem() {
  if (wallEmblem || wallEmblemFailed) return
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => {
    wallEmblem = img
  }
  img.onerror = () => {
    wallEmblemFailed = true
  }
  img.src = WALL_EMBLEM_SRC
}

function paint(ctx: CanvasRenderingContext2D, W: number, H: number, e: FifthFrameEngine, t: number) {
  ensureWallEmblem()

  // Dark cyberpunk alley void
  ctx.fillStyle = '#05030e'
  ctx.fillRect(0, 0, W, H)
  const wash = ctx.createRadialGradient(W * 0.5, H * 0.12, 0, W * 0.5, H * 0.55, Math.max(W, H) * 1.05)
  wash.addColorStop(0, 'rgba(55, 30, 110, 0.45)')
  wash.addColorStop(0.4, 'rgba(12, 8, 32, 0.9)')
  wash.addColorStop(1, '#020108')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, W, H)

  drawVenueSparkles(ctx, W, H, t)
  drawSideWalls(ctx, W, H, t)

  // Back wall + neon emblem sign (before lane so reflections can sample its glow)
  drawBackWall(ctx, W, H, t)

  // Gutters (recessed channels) then lane boards
  drawGutters(ctx, W, H)
  drawLane(ctx, W, H, e, t)
  drawApproach(ctx, W, H)
  drawRails(ctx, W, H, t)

  // Foul line + arrows
  const foulL = project(-VIEW.LANE_HALF, 0.1, W, H)
  const foulR = project(VIEW.LANE_HALF, 0.1, W, H)
  ctx.save()
  ctx.strokeStyle = 'rgba(220, 180, 90, 0.7)'
  ctx.shadowColor = 'rgba(255, 200, 80, 0.35)'
  ctx.shadowBlur = 6
  ctx.lineWidth = 2.4
  ctx.beginPath()
  ctx.moveTo(foulL.cx, foulL.cy)
  ctx.lineTo(foulR.cx, foulR.cy)
  ctx.stroke()
  ctx.restore()

  for (let i = 0; i < 5; i++) {
    const x = -0.2 + i * 0.1
    const p = project(x, 0.16, W, H)
    ctx.fillStyle = 'rgba(40, 160, 140, 0.45)'
    ctx.beginPath()
    ctx.moveTo(p.cx, p.cy - 5 * p.scale)
    ctx.lineTo(p.cx - 4 * p.scale, p.cy + 3 * p.scale)
    ctx.lineTo(p.cx + 4 * p.scale, p.cy + 3 * p.scale)
    ctx.closePath()
    ctx.fill()
  }

  drawSideParticles(ctx, W, H, t)

  const pins = [...e.pins].sort((a, b) => b.z - a.z)
  for (const pin of pins) drawPin(ctx, W, H, pin, t)

  if (e.phase === 'aim' && e.aimPower > 0.05) {
    const steps = 16
    for (let i = 1; i <= steps; i++) {
      const z = 0.08 + (0.78 * i) / steps
      const x = e.ball.x + e.aimX * (z - 0.04) * 0.9
      const p = project(x, z, W, H)
      ctx.fillStyle = `rgba(0, 220, 200, ${0.05 + (1 - i / steps) * 0.22})`
      ctx.beginPath()
      ctx.arc(p.cx, p.cy, 3.2 * p.scale, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  drawBall(ctx, W, H, e, t)
}

function drawSideWalls(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  // Soft architectural walls flanking the alley — dark paneling catching neon
  const nearL = project(-VIEW.LANE_HALF * 1.55, 0.0, W, H)
  const farL = project(-VIEW.LANE_HALF * 1.35, 0.74, W, H)
  const nearR = project(VIEW.LANE_HALF * 1.55, 0.0, W, H)
  const farR = project(VIEW.LANE_HALF * 1.35, 0.74, W, H)
  const top = H * 0.08

  ctx.save()
  // Left wall
  const lg = ctx.createLinearGradient(0, 0, nearL.cx, 0)
  lg.addColorStop(0, '#0a0716')
  lg.addColorStop(1, 'rgba(20, 12, 40, 0.55)')
  ctx.fillStyle = lg
  ctx.beginPath()
  ctx.moveTo(0, H)
  ctx.lineTo(nearL.cx - 8, nearL.cy + 30)
  ctx.lineTo(farL.cx - 4, top)
  ctx.lineTo(0, top)
  ctx.closePath()
  ctx.fill()
  // Right wall
  const rg = ctx.createLinearGradient(W, 0, nearR.cx, 0)
  rg.addColorStop(0, '#0a0716')
  rg.addColorStop(1, 'rgba(20, 12, 40, 0.55)')
  ctx.fillStyle = rg
  ctx.beginPath()
  ctx.moveTo(W, H)
  ctx.lineTo(nearR.cx + 8, nearR.cy + 30)
  ctx.lineTo(farR.cx + 4, top)
  ctx.lineTo(W, top)
  ctx.closePath()
  ctx.fill()

  // Neon wash on walls
  const pulse = 0.55 + 0.45 * Math.sin(t * 1.6)
  // Opaque side booths — fill phone edges like a real alley / Glide corridor
  const wallL = ctx.createLinearGradient(0, 0, W * 0.22, 0)
  wallL.addColorStop(0, '#2a1048')
  wallL.addColorStop(0.7, '#160a28')
  wallL.addColorStop(1, 'rgba(8,4,18,0.15)')
  ctx.fillStyle = wallL
  ctx.fillRect(0, 0, W * 0.22, H)
  const wallR = ctx.createLinearGradient(W, 0, W * 0.78, 0)
  wallR.addColorStop(0, '#321456')
  wallR.addColorStop(0.7, '#140820')
  wallR.addColorStop(1, 'rgba(8,4,18,0.15)')
  ctx.fillStyle = wallR
  ctx.fillRect(W * 0.78, 0, W * 0.22, H)
  // Ceiling neon grid strip
  ctx.fillStyle = 'rgba(20, 8, 48, 0.85)'
  ctx.fillRect(0, 0, W, H * 0.14)
  ctx.strokeStyle = 'rgba(0, 230, 210, 0.25)'
  ctx.lineWidth = 1.5
  for (let i = 0; i < 8; i++) {
    const x = (W * i) / 7
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(W * 0.5 + (x - W * 0.5) * 0.35, H * 0.14)
    ctx.stroke()
  }

  ctx.globalAlpha = 0.35 * pulse
  ctx.fillStyle = '#00e0c8'
  ctx.fillRect(0, H * 0.18, W * 0.045, H * 0.55)
  ctx.fillStyle = '#7b3fe4'
  ctx.fillRect(W * 0.955, H * 0.14, W * 0.045, H * 0.58)
  ctx.globalAlpha = 1

  // Neon rib lines on side walls
  ctx.strokeStyle = `rgba(0, 230, 210, ${0.22 * pulse})`
  ctx.lineWidth = 2
  for (let i = 0; i < 6; i++) {
    const y = H * (0.2 + i * 0.1)
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W * 0.18, y + H * 0.02)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(W, y)
    ctx.lineTo(W * 0.82, y + H * 0.02)
    ctx.stroke()
  }
  ctx.restore()
}

function drawGutters(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const gHalf = VIEW.LANE_HALF + 0.085
  const nearGL = project(-gHalf, 0.0, W, H)
  const nearGR = project(gHalf, 0.0, W, H)
  const farGL = project(-gHalf, 1.05, W, H)
  const farGR = project(gHalf, 1.05, W, H)
  const nearL = project(-VIEW.LANE_HALF, 0.0, W, H)
  const nearR = project(VIEW.LANE_HALF, 0.0, W, H)
  const farL = project(-VIEW.LANE_HALF, 0.74, W, H)
  const farR = project(VIEW.LANE_HALF, 0.74, W, H)

  // Left gutter channel
  ctx.beginPath()
  ctx.moveTo(nearGL.cx, nearGL.cy)
  ctx.lineTo(nearL.cx, nearL.cy)
  ctx.lineTo(farL.cx, farL.cy)
  ctx.lineTo(farGL.cx, farGL.cy)
  ctx.closePath()
  const lg = ctx.createLinearGradient(nearGL.cx, 0, nearL.cx, 0)
  lg.addColorStop(0, '#0a0a10')
  lg.addColorStop(0.55, '#151820')
  lg.addColorStop(1, '#0c0e14')
  ctx.fillStyle = lg
  ctx.fill()

  // Right gutter
  ctx.beginPath()
  ctx.moveTo(nearR.cx, nearR.cy)
  ctx.lineTo(nearGR.cx, nearGR.cy)
  ctx.lineTo(farGR.cx, farGR.cy)
  ctx.lineTo(farR.cx, farR.cy)
  ctx.closePath()
  const rg = ctx.createLinearGradient(nearR.cx, 0, nearGR.cx, 0)
  rg.addColorStop(0, '#0c0e14')
  rg.addColorStop(0.45, '#151820')
  rg.addColorStop(1, '#0a0a10')
  ctx.fillStyle = rg
  ctx.fill()
}

function drawLane(ctx: CanvasRenderingContext2D, W: number, H: number, e: FifthFrameEngine, t: number) {
  const nearL = project(-VIEW.LANE_HALF, 0.0, W, H)
  const nearR = project(VIEW.LANE_HALF, 0.0, W, H)
  const farL = project(-VIEW.LANE_HALF, 0.74, W, H)
  const farR = project(VIEW.LANE_HALF, 0.74, W, H)

  ctx.beginPath()
  ctx.moveTo(nearL.cx, nearL.cy)
  ctx.lineTo(nearR.cx, nearR.cy)
  ctx.lineTo(farR.cx, farR.cy)
  ctx.lineTo(farL.cx, farL.cy)
  ctx.closePath()

  // Polished dark wood base
  const wood = ctx.createLinearGradient(0, nearL.cy, 0, farL.cy)
  wood.addColorStop(0, '#5a3e24')
  wood.addColorStop(0.2, '#4a3220')
  wood.addColorStop(0.45, '#342318')
  wood.addColorStop(0.75, '#241810')
  wood.addColorStop(1, '#1a120c')
  ctx.fillStyle = wood
  ctx.fill()

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(nearL.cx, nearL.cy)
  ctx.lineTo(nearR.cx, nearR.cy)
  ctx.lineTo(farR.cx, farR.cy)
  ctx.lineTo(farL.cx, farL.cy)
  ctx.closePath()
  ctx.clip()

  // Board seams + grain
  for (let i = 1; i < 12; i++) {
    const x = -VIEW.LANE_HALF + (VIEW.LANE_HALF * 2 * i) / 12
    const a = project(x, 0.01, W, H)
    const b = project(x, 1.04, W, H)
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(120, 85, 45, 0.55)' : 'rgba(90, 60, 35, 0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(a.cx, a.cy)
    ctx.lineTo(b.cx, b.cy)
    ctx.stroke()
  }
  // Subtle cross grain ticks
  for (let z = 0.08; z < 1.0; z += 0.07) {
    const a = project(-VIEW.LANE_HALF * 0.92, z, W, H)
    const b = project(VIEW.LANE_HALF * 0.92, z, W, H)
    ctx.strokeStyle = `rgba(255, 210, 150, ${0.015 + (z % 0.14) * 0.04})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(a.cx, a.cy)
    ctx.lineTo(b.cx, b.cy)
    ctx.stroke()
  }

  // Oil / polish specular streak (physical gloss)
  const gloss = ctx.createLinearGradient(W * 0.5, nearL.cy, W * 0.5, farL.cy)
  gloss.addColorStop(0, 'rgba(255, 245, 220, 0.42)')
  gloss.addColorStop(0.12, 'rgba(255, 255, 255, 0.28)')
  gloss.addColorStop(0.3, 'rgba(200, 230, 255, 0.16)')
  gloss.addColorStop(0.55, 'rgba(0, 240, 220, 0.18)')
  gloss.addColorStop(0.8, 'rgba(160, 100, 240, 0.16)')
  gloss.addColorStop(1, 'rgba(255, 120, 80, 0.1)')
  ctx.fillStyle = gloss
  ctx.fillRect(0, 0, W, H)

  // Neon wash from rails / back wall (color on top of wood — still reads as wood)
  const neonWash = ctx.createLinearGradient(nearL.cx, 0, nearR.cx, 0)
  neonWash.addColorStop(0, 'rgba(40, 255, 180, 0.1)')
  neonWash.addColorStop(0.15, 'rgba(0,0,0,0)')
  neonWash.addColorStop(0.85, 'rgba(0,0,0,0)')
  neonWash.addColorStop(1, 'rgba(40, 255, 180, 0.1)')
  ctx.fillStyle = neonWash
  ctx.fillRect(0, 0, W, H)

  // Mirrored glow of back-wall sign on far lane
  const mir = ctx.createRadialGradient(W * 0.5, farL.cy + 6, 2, W * 0.5, farL.cy + 28, W * 0.3)
  mir.addColorStop(0, 'rgba(0, 230, 210, 0.28)')
  mir.addColorStop(0.35, 'rgba(123, 63, 228, 0.16)')
  mir.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = mir
  ctx.fillRect(0, 0, W, H)

  // Pin reflections on polished wood
  for (const pin of e.pins) {
    if (!pin.up) continue
    const p = project(pin.x, pin.z, W, H)
    ctx.save()
    ctx.globalAlpha = 0.22
    ctx.translate(p.cx, p.cy + 8 * p.scale)
    ctx.scale(1, -0.45)
    const rg = ctx.createLinearGradient(0, -12 * p.scale, 0, 12 * p.scale)
    rg.addColorStop(0, 'rgba(255,255,255,0.05)')
    rg.addColorStop(0.5, 'rgba(255,255,255,0.55)')
    rg.addColorStop(1, 'rgba(255,255,255,0.05)')
    ctx.fillStyle = rg
    ctx.beginPath()
    ctx.ellipse(0, 0, 4.2 * p.scale, 12 * p.scale, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  void t
  ctx.restore()
}

function drawApproach(ctx: CanvasRenderingContext2D, W: number, H: number) {
  // Approach boards in front of foul line (where bowler stands / ball starts)
  const nearL = project(-VIEW.LANE_HALF * 1.05, -0.02, W, H)
  const nearR = project(VIEW.LANE_HALF * 1.05, -0.02, W, H)
  const foulL = project(-VIEW.LANE_HALF, 0.1, W, H)
  const foulR = project(VIEW.LANE_HALF, 0.1, W, H)
  // project doesn't handle negative z well — clamp via manual near
  const y0 = H * 0.98
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(W * 0.08, y0)
  ctx.lineTo(W * 0.92, y0)
  ctx.lineTo(foulR.cx, foulR.cy)
  ctx.lineTo(foulL.cx, foulL.cy)
  ctx.closePath()
  const g = ctx.createLinearGradient(0, y0, 0, foulL.cy)
  g.addColorStop(0, '#2a2018')
  g.addColorStop(0.55, '#221810')
  g.addColorStop(1, '#1a140e')
  ctx.fillStyle = g
  ctx.fill()
  // Approach grain
  for (let i = 1; i < 10; i++) {
    const x = W * (0.12 + (0.76 * i) / 10)
    ctx.strokeStyle = 'rgba(70, 50, 30, 0.35)'
    ctx.beginPath()
    ctx.moveTo(x, y0)
    ctx.lineTo(foulL.cx + ((foulR.cx - foulL.cx) * i) / 10, foulL.cy)
    ctx.stroke()
  }
  void nearL
  void nearR
  ctx.restore()
}

function drawRails(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  const pulse = 0.75 + 0.25 * Math.sin(t * 2.4)
  const drawOne = (x: number) => {
    const a = project(x, 0.0, W, H)
    const b = project(x, 1.06, W, H)
    // Physical bumper body (dark metal/plastic under neon)
    ctx.save()
    ctx.strokeStyle = 'rgba(30, 40, 35, 0.9)'
    ctx.lineWidth = 9
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(a.cx, a.cy)
    ctx.lineTo(b.cx, b.cy)
    ctx.stroke()
    // Neon tube glow
    ctx.strokeStyle = `rgba(50, 255, 170, ${0.35 * pulse})`
    ctx.shadowColor = 'rgba(40, 255, 160, 0.95)'
    ctx.shadowBlur = 20
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(a.cx, a.cy)
    ctx.lineTo(b.cx, b.cy)
    ctx.stroke()
    ctx.strokeStyle = `rgba(0, 240, 210, ${0.9 * pulse})`
    ctx.shadowBlur = 12
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.moveTo(a.cx, a.cy)
    ctx.lineTo(b.cx, b.cy)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.shadowBlur = 0
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(a.cx, a.cy)
    ctx.lineTo(b.cx, b.cy)
    ctx.stroke()
    ctx.restore()
  }
  drawOne(-VIEW.LANE_HALF)
  drawOne(VIEW.LANE_HALF)
}

function drawBackWall(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  const deck = project(0, 0.72, W, H)
  const left = project(-VIEW.LANE_HALF * 1.3, 0.72, W, H)
  const right = project(VIEW.LANE_HALF * 1.3, 0.72, W, H)
  const wallTop = deck.cy - H * 0.48
  const wallBot = deck.cy + H * 0.035

  // Physical pin-deck wall
  const wg = ctx.createLinearGradient(0, wallTop, 0, wallBot)
  wg.addColorStop(0, '#0c0818')
  wg.addColorStop(0.55, '#141022')
  wg.addColorStop(1, '#1a1428')
  ctx.beginPath()
  ctx.moveTo(left.cx - 22, wallBot)
  ctx.lineTo(left.cx - 12, wallTop)
  ctx.lineTo(right.cx + 12, wallTop)
  ctx.lineTo(right.cx + 22, wallBot)
  ctx.closePath()
  ctx.fillStyle = wg
  ctx.fill()

  // Soft architectural panel lines
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  for (let i = 1; i < 5; i++) {
    const y = wallTop + ((wallBot - wallTop) * i) / 5
    ctx.beginPath()
    ctx.moveTo(left.cx - 8, y)
    ctx.lineTo(right.cx + 8, y)
    ctx.stroke()
  }

  // Neon halo behind emblem
  const pulse = 0.7 + 0.3 * Math.sin(t * 2.1)
  const halo = ctx.createRadialGradient(W * 0.5, deck.cy - H * 0.12, 4, W * 0.5, deck.cy - H * 0.1, W * 0.36)
  halo.addColorStop(0, `rgba(0, 230, 210, ${0.32 * pulse})`)
  halo.addColorStop(0.4, `rgba(123, 63, 228, ${0.2 * pulse})`)
  halo.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, wallTop - 30, W, wallBot - wallTop + 60)

  const ex = W * 0.5
  const ey = deck.cy - H * 0.26
  const er = Math.min(W, H) * 0.155

  // Neon ring frame around emblem (like a lit sign housing)
  ctx.save()
  ctx.shadowColor = `rgba(0, 230, 210, ${0.85 * pulse})`
  ctx.shadowBlur = 22
  ctx.strokeStyle = `rgba(0, 240, 220, ${0.9 * pulse})`
  ctx.lineWidth = 3.2
  ctx.beginPath()
  ctx.arc(ex, ey, er * 1.08, 0, Math.PI * 2)
  ctx.stroke()
  ctx.shadowColor = `rgba(255, 90, 60, ${0.55 * pulse})`
  ctx.strokeStyle = `rgba(255, 140, 80, ${0.45 * pulse})`
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(ex, ey, er * 1.2, 0.15, Math.PI * 1.55)
  ctx.stroke()
  ctx.restore()

  // Circle emblem as neon light sign
  if (wallEmblem && wallEmblem.complete && wallEmblem.naturalWidth > 0) {
    const size = er * 2.05
    ctx.save()
    ctx.beginPath()
    ctx.arc(ex, ey, er * 0.98, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(wallEmblem, ex - size / 2, ey - size / 2, size, size)
    ctx.restore()
    // Soft neon glaze over emblem so it reads as lit acrylic
    ctx.save()
    ctx.globalAlpha = 0.18 * pulse
    ctx.fillStyle = '#00e8d0'
    ctx.beginPath()
    ctx.arc(ex, ey, er * 0.98, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  } else {
    // Fallback while loading
    ctx.save()
    ctx.fillStyle = '#0a0614'
    ctx.beginPath()
    ctx.arc(ex, ey, er * 0.95, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f4f0ea'
    ctx.font = `800 ${Math.round(er * 1.1)}px Inter, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('5', ex, ey + 1)
    ctx.restore()
  }

  // Neon wordmark under emblem — FIFTH FRAME
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const fs = Math.max(18, Math.round(H * 0.038))
  ctx.font = `800 ${fs}px Inter, system-ui, sans-serif`
  ctx.shadowColor = `rgba(0, 230, 210, ${0.75 * pulse})`
  ctx.shadowBlur = 14
  const grad = ctx.createLinearGradient(ex - 110, 0, ex + 110, 0)
  grad.addColorStop(0, '#00f0d8')
  grad.addColorStop(0.45, '#8a5cff')
  grad.addColorStop(0.8, '#ff6a45')
  grad.addColorStop(1, '#ffc83c')
  ctx.fillStyle = grad
  ctx.fillText('FIFTH FRAME', ex, ey + er + 8)
  // Under-glow tube
  ctx.shadowBlur = 10
  ctx.strokeStyle = `rgba(0, 230, 210, ${0.45 * pulse})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(ex - fs * 4.2, ey + er + 8 + fs + 4)
  ctx.lineTo(ex + fs * 4.2, ey + er + 8 + fs + 4)
  ctx.stroke()
  ctx.restore()

  // Pin deck light strip
  ctx.save()
  ctx.strokeStyle = 'rgba(0, 230, 210, 0.55)'
  ctx.shadowColor = 'rgba(0, 230, 210, 0.75)'
  ctx.shadowBlur = 10
  ctx.lineWidth = 2.2
  ctx.beginPath()
  ctx.moveTo(left.cx + 8, deck.cy + 3)
  ctx.lineTo(right.cx - 8, deck.cy + 3)
  ctx.stroke()
  ctx.restore()
}

function drawVenueSparkles(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  ctx.save()
  for (let i = 0; i < 70; i++) {
    const side = i % 2 === 0 ? 0.06 : 0.94
    const sx = (side + (((i * 37) % 100) / 1000) * (i % 2 === 0 ? 1 : -1)) * W
    const sy = (((i * 61) % 1000) / 1000) * H * 0.7
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.3 + i * 0.7))
    const r = 0.7 + (i % 4) * 0.45
    ctx.fillStyle =
      i % 5 === 0 ? `rgba(50, 255, 190, ${0.18 + tw * 0.4})` : `rgba(150, 200, 255, ${0.12 + tw * 0.35})`
    ctx.beginPath()
    ctx.arc(sx, sy, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawSideParticles(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  const nearL = project(-VIEW.LANE_HALF, 0.05, W, H)
  const farL = project(-VIEW.LANE_HALF, 0.72, W, H)
  const nearR = project(VIEW.LANE_HALF, 0.05, W, H)
  const farR = project(VIEW.LANE_HALF, 0.72, W, H)
  ctx.save()
  for (let i = 0; i < 28; i++) {
    const u = (i * 0.07 + t * 0.06) % 1
    const side = i % 2 === 0 ? -1 : 1
    const ax = side < 0 ? nearL.cx : nearR.cx
    const ay = side < 0 ? nearL.cy : nearR.cy
    const bx = side < 0 ? farL.cx : farR.cx
    const by = side < 0 ? farL.cy : farR.cy
    const x = ax + (bx - ax) * u + side * (10 + (i % 5) * 3)
    const y = ay + (by - ay) * u
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2.2 + i))
    ctx.fillStyle = `rgba(70, 255, 200, ${0.12 + tw * 0.3})`
    ctx.shadowColor = 'rgba(0, 255, 200, 0.5)'
    ctx.shadowBlur = 5
    ctx.beginPath()
    ctx.arc(x, y, 1.1 + (i % 3) * 0.35, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawPin(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  pin: { x: number; z: number; up: boolean; angle: number; vx: number; vz: number },
  _t: number,
) {
  const p = project(pin.x, pin.z, W, H)
  const s = p.scale
  // Classic ten-pin proportions — hero scale (CV hoop energy, real pin silhouette)
  const h = Math.min(W, H) * 0.26 * s
  const bellyW = h * 0.175
  const neckW = h * 0.068
  const headW = h * 0.095

  ctx.save()
  ctx.translate(p.cx, p.cy)
  if (!pin.up) {
    const ang = pin.angle || Math.atan2(pin.vz, pin.vx) || 0.9
    ctx.rotate(ang)
    ctx.globalAlpha = 0.55
  }

  // Contact shadow on wood
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(0, h * 0.48, bellyW * 0.95, bellyW * 0.28, 0, 0, Math.PI * 2)
  ctx.fill()

  // Soft fill light from neon
  ctx.shadowColor = 'rgba(200, 230, 255, 0.35)'
  ctx.shadowBlur = 8 * s

  // Body path: head → neck → belly → base (realistic pin silhouette)
  const body = ctx.createLinearGradient(-bellyW, 0, bellyW, 0)
  body.addColorStop(0, '#cfc6ba')
  body.addColorStop(0.35, '#f7f2ea')
  body.addColorStop(0.55, '#ffffff')
  body.addColorStop(0.78, '#efe6da')
  body.addColorStop(1, '#b9aea0')
  ctx.fillStyle = body
  ctx.beginPath()
  // head
  ctx.moveTo(0, -h)
  ctx.bezierCurveTo(headW, -h, headW * 1.05, -h * 0.82, headW * 0.85, -h * 0.72)
  // neck
  ctx.bezierCurveTo(neckW * 1.1, -h * 0.62, neckW, -h * 0.48, neckW * 1.05, -h * 0.38)
  // upper belly
  ctx.bezierCurveTo(bellyW * 0.75, -h * 0.22, bellyW, -h * 0.05, bellyW, h * 0.12)
  // lower belly → base
  ctx.bezierCurveTo(bellyW * 0.98, h * 0.28, bellyW * 0.7, h * 0.4, bellyW * 0.35, h * 0.46)
  ctx.lineTo(0, h * 0.5)
  ctx.lineTo(-bellyW * 0.35, h * 0.46)
  ctx.bezierCurveTo(-bellyW * 0.7, h * 0.4, -bellyW * 0.98, h * 0.28, -bellyW, h * 0.12)
  ctx.bezierCurveTo(-bellyW, -h * 0.05, -bellyW * 0.75, -h * 0.22, -neckW * 1.05, -h * 0.38)
  ctx.bezierCurveTo(-neckW, -h * 0.48, -neckW * 1.1, -h * 0.62, -headW * 0.85, -h * 0.72)
  ctx.bezierCurveTo(-headW * 1.05, -h * 0.82, -headW, -h, 0, -h)
  ctx.closePath()
  ctx.fill()

  // Specular (glossy plastic/wood finish)
  ctx.shadowBlur = 0
  const spec = ctx.createLinearGradient(-bellyW * 0.5, -h * 0.75, bellyW * 0.35, h * 0.25)
  spec.addColorStop(0, 'rgba(255,255,255,0.75)')
  spec.addColorStop(0.2, 'rgba(255,255,255,0.35)')
  spec.addColorStop(0.45, 'rgba(255,255,255,0.08)')
  spec.addColorStop(0.6, 'rgba(255,255,255,0)')
  ctx.fillStyle = spec
  ctx.beginPath()
  ctx.ellipse(-bellyW * 0.28, -h * 0.15, bellyW * 0.28, h * 0.38, -0.15, 0, Math.PI * 2)
  ctx.fill()

  // Red neck stripe (classic)
  ctx.fillStyle = '#d32f2f'
  ctx.beginPath()
  ctx.ellipse(0, -h * 0.4, neckW * 1.55, Math.max(2.2 * s, neckW * 0.75), 0, 0, Math.PI * 2)
  ctx.fill()
  // second band for readable thickness at distance
  ctx.fillStyle = '#b71c1c'
  ctx.beginPath()
  ctx.ellipse(0, -h * 0.36, neckW * 1.45, Math.max(1.4 * s, neckW * 0.4), 0, 0, Math.PI * 2)
  ctx.fill()
  // Stripe highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = Math.max(0.8, 1.1 * s)
  ctx.beginPath()
  ctx.ellipse(0, -h * 0.4, neckW * 1.35, neckW * 0.55, 0, Math.PI * 1.1, Math.PI * 1.85)
  ctx.stroke()

  // Thin rim light from cyan neon (subtle — material first)
  ctx.strokeStyle = 'rgba(0, 220, 200, 0.18)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.ellipse(bellyW * 0.55, 0, bellyW * 0.12, h * 0.35, 0, 0, Math.PI * 2)
  ctx.stroke()

  ctx.restore()
}

function drawBall(ctx: CanvasRenderingContext2D, W: number, H: number, e: FifthFrameEngine, t: number) {
  const b = e.ball
  if (!b.alive && e.phase !== 'aim') return
  const p = project(b.x, b.z, W, H)
  // Visual mul: Court Vision–size hero ball (physics radius unchanged)
  const r = ((VIEW.BALL_R * W * 0.5 * p.scale) / VIEW.LANE_HALF) * 2.35

  ctx.save()
  // Shadow on wood
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.beginPath()
  ctx.ellipse(p.cx, p.cy + r * 0.72, r * 1.05, r * 0.34, 0, 0, Math.PI * 2)
  ctx.fill()

  // Glossy reflection blob on lane
  ctx.globalAlpha = 0.3
  ctx.fillStyle = 'rgba(120, 180, 255, 0.2)'
  ctx.beginPath()
  ctx.ellipse(p.cx, p.cy + r * 0.95, r * 0.7, r * 0.2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  if (b.rolling) {
    ctx.strokeStyle = 'rgba(0, 220, 200, 0.28)'
    ctx.shadowColor = 'rgba(120, 80, 255, 0.45)'
    ctx.shadowBlur = 12
    ctx.lineWidth = Math.max(2, r * 0.22)
    const trail = project(b.x - b.vx * 0.055, b.z - b.vz * 0.055, W, H)
    ctx.beginPath()
    ctx.moveTo(trail.cx, trail.cy)
    ctx.lineTo(p.cx, p.cy)
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  // Realistic dark resin sphere
  const g = ctx.createRadialGradient(p.cx - r * 0.35, p.cy - r * 0.4, r * 0.05, p.cx, p.cy, r)
  g.addColorStop(0, '#3a4558')
  g.addColorStop(0.3, '#1a2030')
  g.addColorStop(0.65, '#0c1018')
  g.addColorStop(1, '#05060a')
  ctx.fillStyle = g
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 10
  ctx.beginPath()
  ctx.arc(p.cx, p.cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0

  // Specular highlight (physical gloss)
  const hl = ctx.createRadialGradient(p.cx - r * 0.32, p.cy - r * 0.38, 0, p.cx - r * 0.32, p.cy - r * 0.38, r * 0.5)
  hl.addColorStop(0, 'rgba(255,255,255,0.55)')
  hl.addColorStop(0.35, 'rgba(200, 220, 255, 0.18)')
  hl.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = hl
  ctx.beginPath()
  ctx.arc(p.cx, p.cy, r, 0, Math.PI * 2)
  ctx.fill()

  // Subtle neon accent ring (cyberpunk — not covering the whole ball)
  const spin = t * (b.rolling ? 5.5 : 0.4)
  ctx.save()
  ctx.beginPath()
  ctx.arc(p.cx, p.cy, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.strokeStyle = 'rgba(160, 90, 255, 0.55)'
  ctx.shadowColor = 'rgba(160, 90, 255, 0.7)'
  ctx.shadowBlur = 6
  ctx.lineWidth = Math.max(1.2, r * 0.06)
  ctx.beginPath()
  ctx.ellipse(p.cx, p.cy, r * 0.72, r * 0.38, spin * 0.35, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(0, 230, 210, 0.4)'
  ctx.shadowColor = 'rgba(0, 230, 210, 0.55)'
  ctx.beginPath()
  ctx.ellipse(p.cx, p.cy + r * 0.05, r * 0.55, r * 0.28, spin * 0.35 + 0.8, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  // Finger holes
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  for (let i = 0; i < 3; i++) {
    const ang = -0.55 + i * 0.5
    const hx = p.cx + Math.cos(ang) * r * 0.2 - r * 0.08
    const hy = p.cy + Math.sin(ang) * r * 0.2 - r * 0.25
    ctx.beginPath()
    ctx.arc(hx, hy, Math.max(1.4, r * 0.08), 0, Math.PI * 2)
    ctx.fill()
  }

  // Soft rim light from neon
  ctx.strokeStyle = 'rgba(0, 230, 210, 0.35)'
  ctx.lineWidth = Math.max(1.2, r * 0.05)
  ctx.beginPath()
  ctx.arc(p.cx, p.cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}
