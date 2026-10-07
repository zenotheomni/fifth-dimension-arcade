import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { track } from '../analytics'
import { useArcadeAudio } from '../audio/AudioProvider'
import { END_DOORS } from '../brandPlacement'
import { COPY, COURT_VISION_COPY } from '../copyLocks'
import {
  challengeFromScore,
  newRunId,
  submitRun,
  type ChallengeInfo,
  type RunResult,
} from '../core/arcadeApi'
import { getCachedPlayer, onPlayerChange, type ArcadePlayer } from '../core/session'
import { toApiMode } from '../core/scores'
import HandlePrompt from '../social/HandlePrompt'
import SharePanel from '../social/SharePanel'
import StoryShareButton from '../social/StoryShareButton'
import { requestAlertsRefresh } from '../social/alertStore'
import { createCourtVision3D, type CourtVision3DHandle } from './engine'
import type {
  CvChallengeConfig,
  CvEndPayload,
  CvHudState,
  CvMode,
} from '../courtVisionPhaser/types'
import './courtVision3d.css'
import BrandLockup from '../brand/BrandLockup'

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

export type SeededRun = { ticketId: string; seed: string; rivalHandle?: string | null }

export type CourtVision3DProps = {
  /** Friend's challenge run (beat target_score on the same seed). */
  challenge?: CvChallengeConfig | null
  /** Seeded "set the bar" / rematch run — creates a new challenge on finish. */
  seeded?: SeededRun | null
  /** When true, hide mode switcher (challenge runs are fixed). */
  lockMode?: boolean
  onChallengeResolved?: (result: { won: boolean; score: number }) => void
  /** Called with the server result of a challenge run (parent shows the VS screen). */
  onRunResult?: (run: RunResult | null, final: CvEndPayload) => void
  /** Leave seeded mode and play a normal run. */
  onPlayNormal?: () => void
}

export default function CourtVision3D({
  challenge = null,
  seeded = null,
  lockMode = false,
  onChallengeResolved,
  onRunResult,
  onPlayNormal,
}: CourtVision3DProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<CourtVision3DHandle | null>(null)
  const audio = useArcadeAudio()
  const mutedRef = useRef(audio.muted)
  const engineChallenge = useMemo<CvChallengeConfig | null>(() => {
    if (challenge) return challenge
    if (seeded) {
      return { id: '', targetScore: 0, seed: seeded.seed, creatorHandle: seeded.rivalHandle ?? '', setTheBar: true }
    }
    return null
  }, [challenge, seeded])
  const initialMode: CvMode = engineChallenge ? 'challenge' : 'timed'
  const [mode, setMode] = useState<CvMode>(initialMode)
  const [hud, setHud] = useState<CvHudState>({
    ...initialHud,
    mode: initialMode,
  })
  const [ended, setEnded] = useState<CvEndPayload | null>(null)
  const [howTo, setHowTo] = useState(true)
  const [run, setRun] = useState<RunResult | null>(null)
  const [runState, setRunState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [shareChallenge, setShareChallenge] = useState<ChallengeInfo | null>(null)
  const [busyShare, setBusyShare] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)
  const [remount, setRemount] = useState(0)
  const [player, setPlayer] = useState<ArcadePlayer | null>(() => getCachedPlayer())
  const [renaming, setRenaming] = useState(false)
  const runIdRef = useRef<string>(newRunId())
  const onRunResultRef = useRef(onRunResult)
  onRunResultRef.current = onRunResult

  useEffect(() => onPlayerChange(setPlayer), [])

  const destroyGame = useCallback(() => {
    if (gameRef.current) {
      gameRef.current.destroy()
      gameRef.current = null
    }
  }, [])

  useEffect(() => {
    audio.duck(true)
    return () => audio.duck(false)
  }, [audio])

  useEffect(() => {
    mutedRef.current = audio.muted
    gameRef.current?.setMuted(audio.muted)
  }, [audio.muted])

  useEffect(() => {
    if (engineChallenge) setMode('challenge')
  }, [engineChallenge])

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    destroyGame()
    setEnded(null)
    setRun(null)
    setRunState('idle')
    setShareChallenge(null)
    setShareNote(null)
    runIdRef.current = newRunId()
    setHud({
      ...initialHud,
      mode,
      timeLeft: mode === 'endless' ? null : 60,
    })

    const game = createCourtVision3D(
      el,
      {
        muted: mutedRef.current,
        onHud: setHud,
        challenge: engineChallenge,
        onEnded: (final) => {
          setEnded(final)
          track('arcade_court_vision_end', {
            score: final.score,
            mode: final.mode,
            newPb: final.newPb,
            challenge: Boolean(challenge),
            seeded: Boolean(seeded),
          })
          if (challenge && final.beatChallenge != null) {
            onChallengeResolved?.({ won: final.beatChallenge, score: final.score })
          }
          setRunState('saving')
          void (async () => {
            const r = await submitRun({
              game: 'court-vision',
              mode: toApiMode(final.mode),
              score: final.score,
              runId: runIdRef.current,
              challengeId: challenge?.id || null,
              ticketId: seeded?.ticketId ?? null,
              meta: { pb: final.pb, seed: engineChallenge?.seed ?? null, bestStreak: final.bestStreak ?? 0 },
            })
            if (r.ok) {
              setRun(r.run)
              setRunState('saved')
              if (r.run.created_challenge) setShareChallenge(r.run.created_challenge)
              if (r.run.alerts_created) requestAlertsRefresh()
            } else {
              setRunState('error')
            }
            if (challenge) onRunResultRef.current?.(r.ok ? r.run : null, final)
          })()
        },
      },
      mode,
    )
    gameRef.current = game
    game.setHold(true)
    setHowTo(true)
    return () => destroyGame()
  }, [mode, remount, destroyGame, engineChallenge, challenge, seeded, onChallengeResolved])

  const displayPb = Math.max(run?.personal_best ?? 0, ended?.pb ?? hud.pb)

  const headline = useMemo(() => {
    if (!ended) return COPY.RUN_IT_BACK
    if (seeded) return seeded.rivalHandle ? `Your move is in` : 'Bar is set'
    if (ended.beatChallenge === true) return COURT_VISION_COPY.WON_CHALLENGE
    if (ended.beatChallenge === false) return COURT_VISION_COPY.LOST_CHALLENGE
    if (ended.newPb) return COURT_VISION_COPY.NEW_PB
    return COPY.RUN_IT_BACK
  }, [ended, seeded])

  const runItBack = () => {
    if (seeded && onPlayNormal) {
      onPlayNormal()
      return
    }
    setEnded(null)
    setRemount((n) => n + 1)
    track('arcade_court_vision_run_it_back')
  }

  const challengeFriend = async () => {
    if (!ended || busyShare || !run) return
    setBusyShare(true)
    setShareNote(null)
    try {
      const created = await challengeFromScore(run.id)
      if (!created.ok || !created.challenge.url) {
        setShareNote(created.ok ? 'Challenge failed — try again' : created.error === 'rate_limited' ? 'Easy — too many challenges this hour' : 'Challenge failed — try again')
        return
      }
      setShareChallenge(created.challenge)
      track('arcade_challenge_create', { score: ended.score, id: created.challenge.id })
    } finally {
      setBusyShare(false)
    }
  }

  const boardLine = run?.board
    ? [
        run.board.alltime ? `All-time #${run.board.alltime.rank}` : null,
        run.board.weekly ? `Weekly #${run.board.weekly.rank}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''
  const handle = run?.handle ?? player?.handle ?? ''
  const isGuest = run ? run.is_guest && (player?.is_guest ?? true) : (player?.is_guest ?? true)
  const canChallenge = Boolean(ended && !challenge && !seeded && ended.mode !== 'endless')

  const showClock = hud.mode === 'timed' || hud.mode === 'challenge'

  return (
    <div className="cvp-root cv3-root">
      <Link to="/" className="cvp-back">
        ← Floor
      </Link>
      {!lockMode && !engineChallenge ? (
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
      ) : (
        <div className="cvp-mode">
          {challenge ? (
            <span className="cvp-mode__challenge">
              Beat {challenge.creatorHandle} · {challenge.targetScore}
            </span>
          ) : seeded ? (
            <span className="cvp-mode__challenge">
              {seeded.rivalHandle ? `Rematch · ${seeded.rivalHandle}` : 'Set the bar'}
            </span>
          ) : null}
          <button type="button" onClick={audio.toggleMute} aria-label="Mute">
            {audio.muted ? '🔇' : '🔊'}
          </button>
        </div>
      )}

      <div ref={hostRef} className="cvp-canvas" />
      <div className="cv3-vignette" aria-hidden />
      {hud.phase === 'ready' && !ended ? (
        <div className="cv3-loading" aria-live="polite">
          <BrandLockup size={96} />
          <span className="cv3-loading__bar" />
          Warming up the court…
        </div>
      ) : null}

      {howTo && !ended ? (
        <div className="cv3-howto" role="dialog" aria-label="How to play">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><BrandLockup size={64} /></div>
          <p className="cv3-howto__eyebrow">Court Vision</p>
          <h2 className="cv3-howto__title">How to play</h2>
          <ul className="cv3-howto__list">
            <li>
              <span className="cv3-howto__ico">☝️</span>
              <span><b>Flick up</b> on the ball to shoot. Aim straight, don't overpower it.</span>
            </li>
            <li>
              <span className="cv3-howto__ico">🏀</span>
              <span><b>3 pts</b> every make.</span>
            </li>
            <li>
              <span className="cv3-howto__ico">🔥</span>
              <span><b>5 in a row = FLOW STATE.</b> Ball's on fire, every make is <b>5 pts</b>.</span>
            </li>
            <li>
              <span className="cv3-howto__ico">❌</span>
              <span>A miss resets your streak.</span>
            </li>
            {hud.mode !== 'endless' ? (
              <li>
                <span className="cv3-howto__ico">⏱️</span>
                <span><b>60 seconds.</b> Hit <b>50 pts</b> for <b>+15s</b> (once a run).</span>
              </li>
            ) : (
              <li>
                <span className="cv3-howto__ico">∞</span>
                <span>Endless: no clock. End the run whenever you're ready.</span>
              </li>
            )}
          </ul>
          <button
            type="button"
            className="ffa-btn ffa-btn--primary cv3-howto__start"
            disabled={hud.phase === 'ready'}
            onClick={() => {
              setHowTo(false)
              gameRef.current?.setHold(false)
            }}
          >
            {hud.phase === 'ready' ? 'Loading…' : 'Tap to play'}
          </button>
        </div>
      ) : null}

      <div className="cvp-hud" aria-live="polite">
        <div className="cvp-hud__top">
          <div className="cvp-panel">
            <span className="cvp-panel__label">Score</span>
            <span className="cvp-panel__value">{hud.score}</span>
            {hud.streak >= 5 ? (
              <div className="cvp-streak">🔥 FLOW STATE · 5 PTS</div>
            ) : hud.streak >= 1 ? (
              <div className="cvp-streak">{hud.streak} in a row · {5 - hud.streak} to flow</div>
            ) : null}
          </div>
          <div
            className={`cvp-panel cvp-panel--center${hud.clockBonusId ? ' cvp-clock-bonus' : ''}`}
            key={`clock-${hud.clockBonusId ?? 0}`}
          >
            <span className="cvp-panel__label">
              {showClock ? 'Clock' : 'Endless'}
            </span>
            <span className="cvp-panel__value">
              {showClock
                ? `${Math.floor((hud.timeLeft ?? 0) / 60)}:${String((hud.timeLeft ?? 0) % 60).padStart(2, '0')}`
                : '∞'}
            </span>
          </div>
          <div className="cvp-panel cvp-panel--right">
            <span className="cvp-panel__label">Combo</span>
            <span className="cvp-panel__value">{hud.streak}</span>
          </div>
        </div>

        {hud.callout ? (
          <p className={`cvp-callout${/^\+\d+s$/.test(hud.callout) ? ' cvp-callout--time' : ''}`}>{hud.callout}</p>
        ) : null}
        {hud.lastPoints ? (
          <p className="cvp-points" key={`${hud.score}-${hud.lastPoints}`}>
            +{hud.lastPoints}
          </p>
        ) : null}

        {!ended && hud.score === 0 && hud.streak === 0 ? (
          <p className="cvp-hint">Flick up to shoot</p>
        ) : null}
        {!ended && hud.mode === 'endless' && hud.phase === 'playing' ? (
          <button
            type="button"
            className="cvp-back cvp-end-run"
            onClick={() => {
              gameRef.current?.requestEnd()
            }}
          >
            End run
          </button>
        ) : null}
      </div>

      {ended && !(challenge && onRunResult) ? (
        <div className="cvp-end">
          <p className="cvp-end__eyebrow">{seeded ? (seeded.rivalHandle ? `Rematch vs ${seeded.rivalHandle}` : 'Set the bar') : 'Court Vision'}</p>
          <h2>{headline}</h2>
          <div className="cv3-end__stats">
            <div className="cv3-end__stat">
              <span className="cv3-end__label">Score</span>
              <div className="cvp-end__score">{ended.score}</div>
            </div>
            <div className="cv3-end__stat cv3-end__stat--combo">
              <span className="cv3-end__label">Best combo</span>
              <div className="cvp-end__score cv3-end__combo">
                {ended.bestStreak ?? 0}
                {(ended.bestStreak ?? 0) >= 5 ? <span aria-hidden> 🔥</span> : null}
              </div>
            </div>
          </div>
          <p className="cvp-end__pb">
            Personal best <strong>{displayPb}</strong>
            {boardLine ? (
              <>
                {' '}
                · <strong>{boardLine}</strong>
              </>
            ) : null}
          </p>
          {runState === 'saving' ? <p className="cvp-end__share">Posting to the board…</p> : null}
          {runState === 'error' ? <p className="cvp-end__share">Couldn’t post this run — check your connection.</p> : null}
          {challenge ? (
            <p className="cvp-end__target">
              Target <strong>{challenge.targetScore}</strong> · {challenge.creatorHandle}
            </p>
          ) : null}

          {shareChallenge?.url ? (
            <SharePanel
              handle={handle}
              score={shareChallenge.target_score}
              url={shareChallenge.url}
              rivalHandle={shareChallenge.opponent_handle}
              autoShareLabel={shareChallenge.opponent_handle ? 'Share link too' : 'Send challenge'}
            />
          ) : null}

          {run && (isGuest || renaming) ? (
            <HandlePrompt
              compact
              title={isGuest ? `Playing as ${handle}` : 'Change handle'}
              subtitle={isGuest ? 'Lock in a name for the board (optional)' : undefined}
              cta="Lock it in"
              onDone={() => setRenaming(false)}
            />
          ) : handle ? (
            <p className="cvp-end__handle">
              Playing as <strong>{handle}</strong>{' '}
              <button type="button" className="soc-handle__skip" onClick={() => setRenaming(true)}>
                Edit
              </button>
            </p>
          ) : null}

          <div className="cvp-end__actions">
            {canChallenge && !shareChallenge ? (
              <button
                type="button"
                className="ffa-btn ffa-btn--primary"
                onClick={() => void challengeFriend()}
                disabled={busyShare || !run}
              >
                {busyShare ? 'Building challenge…' : END_DOORS.courtVision[0].label}
              </button>
            ) : null}
            <StoryShareButton scoreId={run?.id ?? null} score={ended.score} />
            <button
              type="button"
              className={`ffa-btn ${canChallenge && !shareChallenge ? 'ffa-btn--secondary' : shareChallenge ? 'ffa-btn--ghost' : 'ffa-btn--primary'}`}
              onClick={runItBack}
            >
              {seeded ? 'Play a normal run' : COPY.RUN_IT_BACK}
            </button>
            {shareNote ? <p className="cvp-end__share">{shareNote}</p> : null}
            <a
              className="ffa-btn ffa-btn--ghost ffa-btn--sm"
              href="https://5dimperial.com/collections/apparel"
              target="_blank"
              rel="noreferrer"
              onClick={() => track('arcade_end_boutique')}
            >
              {END_DOORS.courtVision[1].label}
            </a>
            <Link to="/" className="ffa-btn ffa-btn--ghost ffa-btn--sm">
              Back to select
            </Link>
          </div>
        </div>
      ) : null}
      {ended && challenge && onRunResult ? (
        <div className="cvp-end">
          <p className="cvp-end__eyebrow">Court Vision</p>
          <h2>Final: {ended.score}</h2>
          <p className="cvp-end__pb">{runState === 'error' ? 'Couldn’t post — check your connection.' : 'Tallying the head-to-head…'}</p>
        </div>
      ) : null}
    </div>
  )
}
