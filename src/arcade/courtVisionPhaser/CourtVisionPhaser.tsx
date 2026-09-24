import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type Phaser from 'phaser'
import { track } from '../analytics'
import { useArcadeAudio } from '../audio/AudioProvider'
import { END_DOORS } from '../brandPlacement'
import { COPY, COURT_VISION_COPY } from '../copyLocks'
import {
  challengeShareText,
  createChallengeJson,
  shareOrCopy,
} from '../core/challenges'
import {
  getOrCreatePlayerId,
  getSavedHandle,
  sanitizeHandle,
} from '../core/identity'
import { registerPlayer } from '../core/players'
import { postScoreJson } from '../core/scores'
import { fetchLeaderboard, fetchPersonalBest } from '../leaderboard/api'
import { createCourtVisionGame } from './createGame'
import type {
  CvChallengeConfig,
  CvEndPayload,
  CvHudState,
  CvMode,
} from './types'
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

export type CourtVisionPhaserProps = {
  challenge?: CvChallengeConfig | null
  /** When true, hide mode switcher (challenge runs are fixed). */
  lockMode?: boolean
  onChallengeResolved?: (result: {
    won: boolean
    score: number
  }) => void
}

export default function CourtVisionPhaser({
  challenge = null,
  lockMode = false,
  onChallengeResolved,
}: CourtVisionPhaserProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const audio = useArcadeAudio()
  const initialMode: CvMode = challenge ? 'challenge' : 'timed'
  const [mode, setMode] = useState<CvMode>(initialMode)
  const [hud, setHud] = useState<CvHudState>({
    ...initialHud,
    mode: initialMode,
  })
  const [ended, setEnded] = useState<CvEndPayload | null>(null)
  const [busyShare, setBusyShare] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)
  const [remount, setRemount] = useState(0)
  const [handle, setHandle] = useState(() => getSavedHandle() ?? '')
  const [handleDraft, setHandleDraft] = useState(() => getSavedHandle() ?? '')
  const [handleError, setHandleError] = useState<string | null>(null)
  const [handleBusy, setHandleBusy] = useState(false)
  const [needsHandle, setNeedsHandle] = useState(() => !getSavedHandle())
  const [weeklyRank, setWeeklyRank] = useState<number | null>(null)
  const [serverPb, setServerPb] = useState<number | null>(null)

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
    if (challenge) setMode('challenge')
  }, [challenge])

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    destroyGame()
    setEnded(null)
    setWeeklyRank(null)
    setShareNote(null)
    setHud({
      ...initialHud,
      mode,
      timeLeft: mode === 'endless' ? null : 60,
    })

    const game = createCourtVisionGame(
      el,
      {
        muted: audio.muted,
        onHud: setHud,
        challenge,
        onEnded: (final) => {
          setEnded(final)
          track('arcade_court_vision_end', {
            score: final.score,
            mode: final.mode,
            newPb: final.newPb,
            challenge: Boolean(challenge),
          })
          if (challenge && final.beatChallenge != null) {
            onChallengeResolved?.({
              won: final.beatChallenge,
              score: final.score,
            })
          }
          void (async () => {
            const saved = getSavedHandle()
            const result = await postScoreJson({
              game: 'court-vision',
              mode: final.mode,
              score: final.score,
              handle: saved ?? undefined,
              challengeId: challenge?.id,
              meta: {
                playerId: getOrCreatePlayerId(),
                pb: final.pb,
                seed: challenge?.seed ?? null,
              },
            })
            if (result.ok && result.score) {
              setServerPb(result.score.personal_best)
            }
            try {
              const lb = await fetchLeaderboard({
                game: 'court-vision',
                window: 'weekly',
                mode: final.mode === 'timed' ? 'timed60' : undefined,
                limit: 100,
              })
              const deviceHandle = (saved ?? result.score?.handle ?? '').toLowerCase()
              const mine = lb.entries.find(
                (e) => e.handle.toLowerCase() === deviceHandle,
              )
              if (mine) setWeeklyRank(mine.rank)
              else if (!deviceHandle) {
                // rank unknown until handle is set
                setWeeklyRank(null)
              }
            } catch {
              /* ignore */
            }
            try {
              const pb = await fetchPersonalBest({
                game: 'court-vision',
                mode:
                  final.mode === 'timed'
                    ? 'timed60'
                    : final.mode === 'challenge'
                      ? 'challenge'
                      : 'endless',
              })
              if (pb.found) setServerPb(pb.score)
            } catch {
              /* ignore */
            }
          })()
        },
      },
      mode,
    )
    gameRef.current = game
    return () => destroyGame()
  }, [
    mode,
    remount,
    destroyGame,
    audio.muted,
    challenge,
    onChallengeResolved,
  ])

  const displayPb = serverPb ?? ended?.pb ?? hud.pb

  const headline = useMemo(() => {
    if (!ended) return COPY.RUN_IT_BACK
    if (ended.beatChallenge === true) return COURT_VISION_COPY.WON_CHALLENGE
    if (ended.beatChallenge === false) return COURT_VISION_COPY.LOST_CHALLENGE
    if (ended.newPb) return COURT_VISION_COPY.NEW_PB
    return COPY.RUN_IT_BACK
  }, [ended])

  const runItBack = () => {
    setEnded(null)
    setRemount((n) => n + 1)
    track('arcade_court_vision_run_it_back')
  }

  const saveHandleFromEnd = async () => {
    if (handleBusy) return
    setHandleBusy(true)
    setHandleError(null)
    const cleaned = sanitizeHandle(handleDraft)
    if (cleaned.length < 3 || cleaned.length > 16) {
      setHandleError('3–16 letters, numbers, or _')
      setHandleBusy(false)
      return
    }
    const result = await registerPlayer(cleaned)
    setHandleBusy(false)
    if (!result.ok) {
      setHandleError(
        result.error === 'handle_taken'
          ? 'That handle is taken'
          : result.error === 'invalid_handle'
            ? '3–16 letters, numbers, or _'
            : 'Could not save handle',
      )
      return
    }
    setHandle(result.handle ?? cleaned)
    setNeedsHandle(false)
    track('arcade_handle_saved')
    // Refresh weekly rank now that we have a handle
    if (ended) {
      try {
        const lb = await fetchLeaderboard({
          game: 'court-vision',
          window: 'weekly',
          limit: 100,
        })
        const mine = lb.entries.find(
          (e) => e.handle.toLowerCase() === (result.handle ?? cleaned).toLowerCase(),
        )
        if (mine) setWeeklyRank(mine.rank)
      } catch {
        /* ignore */
      }
    }
  }

  const challengeFriend = async () => {
    if (!ended || busyShare) return
    if (needsHandle || !getSavedHandle()) {
      setHandleError('Pick a handle before challenging')
      return
    }
    setBusyShare(true)
    setShareNote(null)
    try {
      const created = await createChallengeJson({
        game: 'court-vision',
        score: ended.score,
        mode: 'challenge',
        seed: challenge?.seed || `cv-${ended.score}-${Date.now().toString(36)}`,
      })
      if (!created.ok || !created.id || !created.url) {
        setShareNote('Challenge failed — try again')
        return
      }
      const text = challengeShareText(ended.score, created.url)
      const how = await shareOrCopy(text, created.url)
      setShareNote(
        how === 'shared'
          ? 'Shared!'
          : how === 'copied'
            ? 'Link copied'
            : created.url,
      )
      track('arcade_challenge_share', { score: ended.score, id: created.id })
    } finally {
      setBusyShare(false)
    }
  }

  const showClock = hud.mode === 'timed' || hud.mode === 'challenge'

  return (
    <div className="cvp-root">
      <Link to="/" className="cvp-back">
        ← Floor
      </Link>
      {!lockMode && !challenge ? (
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
          ) : null}
          <button type="button" onClick={audio.toggleMute} aria-label="Mute">
            {audio.muted ? '🔇' : '🔊'}
          </button>
        </div>
      )}

      <div ref={hostRef} className="cvp-canvas" />

      <div className="cvp-hud" aria-live="polite">
        <div className="cvp-hud__top">
          <div className="cvp-panel">
            <span className="cvp-panel__label">Score</span>
            <span className="cvp-panel__value">{hud.score}</span>
            {hud.streak >= 3 ? (
              <div className="cvp-streak">x{hud.multiplier} streak fire</div>
            ) : null}
          </div>
          <div className="cvp-panel cvp-panel--center">
            <span className="cvp-panel__label">
              {showClock ? 'Clock' : 'Endless'}
            </span>
            <span className="cvp-panel__value">
              {showClock
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
            style={{
              top: 'auto',
              bottom: '1.25rem',
              left: '50%',
              transform: 'translateX(-50%)',
              pointerEvents: 'auto',
            }}
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
          <p className="cvp-end__eyebrow">Court Vision</p>
          <h2>{headline}</h2>
          <div className="cvp-end__score">{ended.score}</div>
          <p className="cvp-end__pb">
            Personal best <strong>{displayPb}</strong>
            {weeklyRank != null ? (
              <>
                {' '}
                · Weekly <strong>#{weeklyRank}</strong>
              </>
            ) : null}
          </p>
          {challenge ? (
            <p className="cvp-end__target">
              Target <strong>{challenge.targetScore}</strong> · {challenge.creatorHandle}
            </p>
          ) : null}

          {needsHandle ? (
            <form
              className="cvp-handle"
              onSubmit={(e) => {
                e.preventDefault()
                void saveHandleFromEnd()
              }}
            >
              <label className="cvp-handle__label" htmlFor="cvp-handle-input">
                Pick your handle
              </label>
              <input
                id="cvp-handle-input"
                className="cvp-handle__input"
                maxLength={16}
                autoComplete="off"
                placeholder="e.g. jenks"
                value={handleDraft}
                onChange={(e) => setHandleDraft(e.target.value)}
              />
              {handleError ? (
                <p className="cvp-handle__error">{handleError}</p>
              ) : (
                <p className="cvp-handle__hint">3–16 chars · letters, numbers, _</p>
              )}
              <button
                type="submit"
                className="ffa-btn ffa-btn--primary"
                disabled={handleBusy}
              >
                {handleBusy ? 'Saving…' : 'Lock it in'}
              </button>
            </form>
          ) : (
            <p className="cvp-end__handle">Playing as <strong>{handle}</strong></p>
          )}

          <div className="cvp-end__actions">
            <button type="button" className="ffa-btn ffa-btn--primary" onClick={runItBack}>
              {COPY.RUN_IT_BACK}
            </button>
            {!challenge ? (
              <button
                type="button"
                className="ffa-btn ffa-btn--secondary"
                onClick={() => void challengeFriend()}
                disabled={busyShare || needsHandle}
              >
                {END_DOORS.courtVision[0].label}
              </button>
            ) : null}
            {shareNote ? <p className="cvp-end__share">{shareNote}</p> : null}
            <a
              className="ffa-btn ffa-btn--ghost"
              href="https://5dimperial.com/collections/apparel"
              target="_blank"
              rel="noreferrer"
              onClick={() => track('arcade_end_boutique')}
            >
              {END_DOORS.courtVision[1].label}
            </a>
            <Link to="/" className="ffa-btn ffa-btn--ghost">
              Back to select
            </Link>
          </div>

          {challenge ? (
            <p className="cvp-end__app">Get the app — coming soon</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
