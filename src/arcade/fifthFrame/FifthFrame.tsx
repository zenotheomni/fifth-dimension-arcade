import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useArcadeAudio } from '../audio/AudioProvider'
import { prepareSceneMusic, unlockMusic } from '../audio/sceneMusic'
import { track } from '../analytics'
import {
  challengeFromScore,
  newRunId,
  submitRun,
  type ChallengeInfo,
  type RunResult,
} from '../core/arcadeApi'
import { toApiMode } from '../core/scores'
import { getCachedPlayer, onPlayerChange, type ArcadePlayer } from '../core/session'
import type { CvChallengeConfig } from '../courtVisionPhaser/types'
import HandlePrompt from '../social/HandlePrompt'
import SharePanel from '../social/SharePanel'
import { requestAlertsRefresh } from '../social/alertStore'
import { FifthFrameEngine } from './engine'
import { paintWorld } from './world'
import type { EndStats, Hud } from './types'
import './fifthFrame.css'
import '../social/social.css'

const BRAND_LOGO = `${import.meta.env.BASE_URL}art/emblem-neon-sign.webp`

export type FifthFrameProps = {
  challenge?: CvChallengeConfig | null
  onRunResult?: (run: RunResult | null, final: { score: number }) => void
}

export default function FifthFrame({ challenge = null, onRunResult }: FifthFrameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const eng = useRef<FifthFrameEngine | null>(null)
  const audio = useArcadeAudio()
  const { claimScene, duck } = audio
  const [howto, setHowto] = useState(!challenge)
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
  const [run, setRun] = useState<RunResult | null>(null)
  const [runState, setRunState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [player, setPlayer] = useState<ArcadePlayer | null>(() => getCachedPlayer())
  const [renaming, setRenaming] = useState(false)
  const [shareChallenge, setShareChallenge] = useState<ChallengeInfo | null>(null)
  const [busyShare, setBusyShare] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)
  const runIdRef = useRef(newRunId())
  const onRunResultRef = useRef(onRunResult)
  onRunResultRef.current = onRunResult
  const challengeRef = useRef(challenge)
  challengeRef.current = challenge

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

  // Lock page scroll while bowling (mobile Safari)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const e = new FifthFrameEngine()
    eng.current = e
    e.setOnEnd((stats) => {
      setEnded(stats)
      setHud(e.hud())
      track('arcade_fifth_frame_end', {
        score: stats.score,
        strikes: stats.strikes,
        spares: stats.spares,
        newPb: stats.newPb,
        challenge: Boolean(challengeRef.current),
      })
    })
    setHud(e.hud())
    if (challenge) {
      // Challenge runs skip howto — start immediately after mount paint
      window.setTimeout(() => {
        claimScene('fifth-frame')
        unlockMusic()
        e.start()
        setHowto(false)
        setHud(e.hud())
      }, 80)
    }

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
          paintWorld(ctx, w, h, e, now / 1000)
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
  }, [challenge, claimScene])

  const startFromHowto = useCallback(() => {
    setHowto(false)
    setEnded(null)
    setRun(null)
    setRunState('idle')
    setShareChallenge(null)
    setShareNote(null)
    runIdRef.current = newRunId()
    unlockMusic()
    claimScene('fifth-frame')
    eng.current?.start()
    setHud(eng.current!.hud())
    track('arcade_fifth_frame_start')
  }, [claimScene])

  const runItBack = useCallback(() => {
    if (challenge) return
    setEnded(null)
    setRun(null)
    setRunState('idle')
    setShareChallenge(null)
    setShareNote(null)
    runIdRef.current = newRunId()
    claimScene('fifth-frame')
    eng.current?.start()
    setHud(eng.current!.hud())
    track('arcade_fifth_frame_run_it_back')
  }, [claimScene, challenge])

  useEffect(() => {
    if (!ended || runState !== 'idle') return
    setRunState('saving')
    void (async () => {
      try {
        const r = await submitRun({
          game: 'fifth-frame',
          mode: toApiMode(challenge ? 'challenge' : 'frames10'),
          score: ended.score,
          runId: runIdRef.current,
          challengeId: challenge?.id || null,
          meta: { strikes: ended.strikes, spares: ended.spares, v: 2 },
        })
        if (r.ok) {
          setRun(r.run)
          setRunState('saved')
          if (r.run.created_challenge) setShareChallenge(r.run.created_challenge)
          if (r.run.alerts_created) requestAlertsRefresh()
        } else {
          setRunState('error')
        }
        if (challenge) onRunResultRef.current?.(r.ok ? r.run : null, { score: ended.score })
      } catch {
        setRunState('error')
        if (challenge) onRunResultRef.current?.(null, { score: ended.score })
      }
    })()
  }, [ended, runState, challenge])

  const challengeFriend = async () => {
    if (!ended || busyShare || !run || challenge) return
    setBusyShare(true)
    setShareNote(null)
    try {
      const created = await challengeFromScore(run.id)
      if (!created.ok || !created.challenge.url) {
        setShareNote(
          created.ok
            ? 'Challenge failed — try again'
            : created.error === 'rate_limited'
              ? 'Easy — too many challenges this hour'
              : 'Challenge failed — try again',
        )
        return
      }
      setShareChallenge(created.challenge)
      track('arcade_challenge_create', { score: ended.score, id: created.challenge.id, game: 'fifth-frame' })
    } finally {
      setBusyShare(false)
    }
  }

  const toLocal = (ev: React.PointerEvent) => {
    const wrap = wrapRef.current
    if (!wrap) return { x: 0, y: 0 }
    const r = wrap.getBoundingClientRect()
    return { x: ev.clientX - r.left, y: ev.clientY - r.top }
  }

  const onPointerDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (howto || ended) return
    ev.preventDefault()
    ev.currentTarget.setPointerCapture(ev.pointerId)
    const { x, y } = toLocal(ev)
    eng.current?.onPointerDown(x, y, ev.pointerId)
  }
  const onPointerMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (howto || ended) return
    ev.preventDefault()
    const { x, y } = toLocal(ev)
    eng.current?.onPointerMove(x, y, ev.pointerId)
  }
  const onPointerUp = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (howto || ended) return
    ev.preventDefault()
    const { x, y } = toLocal(ev)
    eng.current?.onPointerUp(x, y, ev.pointerId)
  }

  const handle = run?.handle ?? player?.handle ?? ''
  const playing = !howto && !ended
  const canChallenge = Boolean(ended && !challenge && run)

  return (
    <div className="ff-root">
      <div className="ff-top">
        <Link to="/" className="ff-back" aria-label="Back to floor">
          ← Floor
        </Link>
        <div className="ff-hud">
          <div className="ff-hud__chrome">
            <span className="ff-score">{hud.score}</span>
            <span className="ff-chip ff-chip--frame">
              Frame <b>{hud.frame}</b>/10
            </span>
            <span className="ff-chip ff-chip--ball">
              Ball <b>{hud.ballInFrame}</b>
            </span>
            {challenge ? (
              <span className="ff-chip ff-chip--chal">
                Beat {challenge.creatorHandle} · {challenge.targetScore}
              </span>
            ) : (
              <span className="ff-chip ff-chip--dim">Neon Paradise</span>
            )}
          </div>
        </div>
        <button type="button" className="ff-mute" onClick={audio.toggleMute} aria-label={audio.muted ? 'Unmute' : 'Mute'}>
          {audio.muted ? '🔇' : '🔊'}
        </button>
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
            <img src={BRAND_LOGO} alt="" width={64} height={64} className="ff-howto__logo" />
            <p className="ff-howto__eyebrow">Fifth Dimension Arcade</p>
            <h2 className="ff-howto__title">FIFTH FRAME</h2>
            <p className="ff-howto__tag">Neon Paradise. Flick to bowl. Ten frames. Feel the pins.</p>
            <section>
              <h3>Controls</h3>
              <ul>
                <li>
                  <b>Flick up</b> on the ball — angle aims, speed is power, sideways adds curve.
                </li>
                <li>One thumb on a phone. No buttons mid-shot.</li>
              </ul>
            </section>
            <section>
              <h3>Rules</h3>
              <ul>
                <li>
                  <b>10 frames</b> classic bowling. Strike clears the rack. Spare needs ball two.
                </li>
                <li>Frame 10 can give up to three balls after a strike or spare.</li>
              </ul>
            </section>
            <button type="button" className="ffa-btn ffa-btn--primary ff-howto__start" onClick={startFromHowto}>
              PLAY NOW
            </button>
          </div>
        </div>
      ) : null}

      {ended && !challenge ? (
        <div className="ff-end" role="dialog" aria-label="Game over">
          <div className="ff-end__card">
            <p className="ff-end__eyebrow">FIFTH FRAME · Neon Paradise</p>
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
            {runState === 'saved' && run?.board?.alltime ? (
              <p className="ff-end__note">All-time #{run.board.alltime.rank} on the board.</p>
            ) : null}
            {runState === 'saved' && !run?.board?.alltime ? <p className="ff-end__note">On the board.</p> : null}

            {renaming || !handle ? (
              <HandlePrompt title="Who’s bowling?" cta="Save" compact onDone={() => setRenaming(false)} />
            ) : (
              <p className="ff-end__note">
                Playing as <strong>{handle}</strong>{' '}
                <button type="button" className="soc-handle__skip" onClick={() => setRenaming(true)}>
                  Change
                </button>
              </p>
            )}

            {shareChallenge?.url ? (
              <SharePanel
                game="fifth-frame"
                handle={shareChallenge.creator_handle || handle}
                score={shareChallenge.target_score}
                url={shareChallenge.url}
                rivalHandle={shareChallenge.opponent_handle}
                autoShareLabel={shareChallenge.opponent_handle ? 'Share link too' : 'Send challenge'}
              />
            ) : null}

            <div className="ff-end__actions">
              {canChallenge && !shareChallenge ? (
                <button
                  type="button"
                  className="ffa-btn ffa-btn--primary"
                  disabled={busyShare || runState !== 'saved'}
                  onClick={() => void challengeFriend()}
                >
                  {busyShare ? 'Building challenge…' : 'Challenge a friend'}
                </button>
              ) : null}
              <button type="button" className={`ffa-btn ${shareChallenge ? 'ffa-btn--ghost' : 'ffa-btn--ghost'}`} onClick={runItBack}>
                Run it back
              </button>
              <Link to="/" className="ffa-btn ffa-btn--ghost ffa-btn--sm">
                ← Floor
              </Link>
            </div>
            {shareNote ? <p className="ff-end__note">{shareNote}</p> : null}
          </div>
        </div>
      ) : null}

      {ended && challenge ? (
        <div className="ff-end" role="dialog" aria-label="Challenge result">
          <div className="ff-end__card">
            <p className="ff-end__eyebrow">Challenge</p>
            <h2>
              {ended.score > challenge.targetScore
                ? 'You took it.'
                : ended.score < challenge.targetScore
                  ? 'Came up short.'
                  : 'Dead heat.'}
            </h2>
            <div className="ff-end__score">
              {ended.score}
              <small> vs {challenge.targetScore}</small>
            </div>
            {runState === 'saving' ? <p className="ff-end__note">Locking the score…</p> : null}
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
