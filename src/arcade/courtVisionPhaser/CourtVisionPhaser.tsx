import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type Phaser from 'phaser'
import { track } from '../analytics'
import { useArcadeAudio } from '../audio/AudioProvider'
import { END_DOORS } from '../brandPlacement'
import { COPY, COURT_VISION_COPY } from '../copyLocks'
import { createChallenge } from '../core/challenges'
import { getOrCreatePlayerId } from '../core/identity'
import { postScore } from '../core/scores'
import { createCourtVisionGame } from './createGame'
import type { CvHudState, CvMode } from './types'
import './courtVisionPhaser.css'

const initialHud: CvHudState = {
  score: 0,
  streak: 0,
  multiplier: 1,
  timeLeft: 60,
  phase: 'ready',
  callout: null,
  lastPoints: null,
  pb: 0,
  newPb: false,
  mode: 'timed',
}

export default function CourtVisionPhaser() {
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const audio = useArcadeAudio()
  const [mode, setMode] = useState<CvMode>('timed')
  const [hud, setHud] = useState<CvHudState>(initialHud)
  const [ended, setEnded] = useState<{
    score: number
    pb: number
    newPb: boolean
    mode: CvMode
  } | null>(null)
  const [busyShare, setBusyShare] = useState(false)
  const [remount, setRemount] = useState(0)

  const destroyGame = useCallback(() => {
    if (gameRef.current) {
      gameRef.current.destroy(true)
      gameRef.current = null
    }
  }, [])

  useEffect(() => {
    audio.duck(true)
    return () => audio.duck(false)
  }, [audio])

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    destroyGame()
    setEnded(null)
    setHud({ ...initialHud, mode, timeLeft: mode === 'timed' ? 60 : null })

    const game = createCourtVisionGame(
      el,
      {
        muted: audio.muted,
        onHud: setHud,
        onEnded: (final) => {
          setEnded(final)
          track('arcade_court_vision_end', {
            score: final.score,
            mode: final.mode,
            newPb: final.newPb,
          })
          void postScore({
            game: 'court-vision',
            mode: final.mode,
            score: final.score,
            meta: { playerId: getOrCreatePlayerId(), pb: final.pb },
          }).catch(() => {})
        },
      },
      mode,
    )
    gameRef.current = game
    return () => destroyGame()
  }, [mode, remount, destroyGame, audio.muted])

  const runItBack = () => {
    setEnded(null)
    setRemount((n) => n + 1)
    track('arcade_court_vision_run_it_back')
  }

  const challengeFriend = async () => {
    if (!ended || busyShare) return
    setBusyShare(true)
    try {
      const res = await createChallenge({
        game: 'court-vision',
        score: ended.score,
        playerId: getOrCreatePlayerId(),
      })
      let challengeId = `local-${Date.now()}`
      try {
        const data = (await res.json()) as { id?: string }
        if (data.id) challengeId = data.id
      } catch {
        /* stub may not return json */
      }
      const url = `${window.location.origin}/arcade/challenge/${challengeId}`
      const text = `Beat my Court Vision score of ${ended.score} on the Fifth Floor Arcade.`
      if (navigator.share) {
        await navigator.share({ title: 'Court Vision Challenge', text, url })
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${text} ${url}`)
        alert('Challenge link copied.')
      }
      track('arcade_challenge_share', { score: ended.score })
    } finally {
      setBusyShare(false)
    }
  }

  return (
    <div className="cvp-root">
      <Link to="/" className="cvp-back">
        ← Floor
      </Link>
      <div className="cvp-mode">
        <button
          type="button"
          className={mode === 'timed' ? 'is-on' : ''}
          onClick={() => {
            if (!ended) setMode('timed')
          }}
        >
          60s
        </button>
        <button
          type="button"
          className={mode === 'endless' ? 'is-on' : ''}
          onClick={() => {
            if (!ended) setMode('endless')
          }}
        >
          Endless
        </button>
        <button type="button" onClick={audio.toggleMute} aria-label="Mute">
          {audio.muted ? '🔇' : '🔊'}
        </button>
      </div>

      <div ref={hostRef} className="cvp-canvas" />

      <div className="cvp-hud" aria-live="polite">
        <div className="cvp-hud__top">
          <div className="cvp-panel">
            <span className="cvp-panel__label">Score</span>
            <span className="cvp-panel__value">{hud.score}</span>
            {hud.streak >= 3 ? (
              <div className="cvp-streak">
                x{hud.multiplier} streak fire
              </div>
            ) : null}
          </div>
          <div className="cvp-panel cvp-panel--center">
            <span className="cvp-panel__label">
              {hud.mode === 'timed' ? 'Clock' : 'Endless'}
            </span>
            <span className="cvp-panel__value">
              {hud.mode === 'timed'
                ? `0:${String(hud.timeLeft ?? 0).padStart(2, '0')}`
                : '∞'}
            </span>
          </div>
          <div className="cvp-panel cvp-panel--right">
            <span className="cvp-panel__label">Combo</span>
            <span className="cvp-panel__value">{hud.streak}</span>
          </div>
        </div>

        {hud.callout ? <p className="cvp-callout">{hud.callout}</p> : null}
        {hud.lastPoints ? (
          <p className="cvp-points" key={`${hud.score}-${hud.lastPoints}`}>
            +{hud.lastPoints}
          </p>
        ) : null}

        {!ended && hud.score === 0 && hud.streak === 0 ? (
          <p className="cvp-hint">Hold ball · pull back · release</p>
        ) : null}
        {!ended && hud.mode === 'endless' && hud.phase === 'playing' ? (
          <button
            type="button"
            className="cvp-back"
            style={{ top: 'auto', bottom: '1.25rem', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto' }}
            onClick={() => {
              const scene = gameRef.current?.scene.getScene('CourtVision') as
                | { requestEnd?: () => void }
                | undefined
              scene?.requestEnd?.()
            }}
          >
            End run
          </button>
        ) : null}
      </div>

      {ended ? (
        <div className="cvp-end">
          <p style={{ letterSpacing: '0.28em', textTransform: 'uppercase', color: '#00c8c4', margin: 0 }}>
            Court Vision
          </p>
          <h2>{ended.newPb ? COURT_VISION_COPY.NEW_PB : COPY.RUN_IT_BACK}</h2>
          <div className="cvp-end__score">{ended.score}</div>
          <p className="cvp-end__pb">
            Personal best <strong>{ended.pb}</strong>
          </p>
          {ended.newPb ? (
            <p className="cvp-end__pb">{COURT_VISION_COPY.WON_CHALLENGE}</p>
          ) : null}
          <div className="cvp-end__actions">
            <button type="button" className="cvp-btn-primary" onClick={runItBack}>
              {COPY.RUN_IT_BACK}
            </button>
            <button
              type="button"
              className="cvp-btn-secondary"
              onClick={() => void challengeFriend()}
              disabled={busyShare}
            >
              {END_DOORS.courtVision[0].label}
            </button>
            <a
              className="cvp-btn-ghost"
              href="https://5dimperial.com/collections/apparel"
              target="_blank"
              rel="noreferrer"
              onClick={() => track('arcade_end_boutique')}
            >
              {END_DOORS.courtVision[1].label}
            </a>
            <Link to="/" className="cvp-btn-ghost">
              Back to select
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
