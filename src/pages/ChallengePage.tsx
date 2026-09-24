import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { track } from '../arcade/analytics'
import { getChallengeJson } from '../arcade/core/challenges'
import CourtVisionPhaser from '../arcade/courtVisionPhaser/CourtVisionPhaser'
import type { CvChallengeConfig } from '../arcade/courtVisionPhaser/types'
import '../arcade/courtVisionPhaser/courtVisionPhaser.css'

type Phase = 'loading' | 'ready' | 'playing' | 'error'

const BASE = import.meta.env.BASE_URL

export default function ChallengePage() {
  const { id } = useParams<{ id: string }>()
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [challenge, setChallenge] = useState<CvChallengeConfig | null>(null)

  useEffect(() => {
    track('arcade_challenge_shell_view', { challengeId: id ?? 'unknown' })
  }, [id])

  useEffect(() => {
    if (!id) {
      setPhase('error')
      setError('missing_id')
      return
    }
    let cancelled = false
    setPhase('loading')
    void (async () => {
      const res = await getChallengeJson(id)
      if (cancelled) return
      if (!res.ok || !res.challenge) {
        setPhase('error')
        setError(res.error ?? 'challenge_not_found')
        return
      }
      const c = res.challenge as {
        id: string
        target_score: number
        seed: string
        creator_handle: string
        expired?: boolean
      }
      if (c.expired) {
        setPhase('error')
        setError('challenge_expired')
        return
      }
      setChallenge({
        id: c.id,
        targetScore: c.target_score,
        seed: c.seed || '',
        creatorHandle: c.creator_handle,
      })
      setPhase('ready')
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const onResolved = useCallback(
    (r: { won: boolean; score: number }) => {
      track('arcade_challenge_resolved', {
        challengeId: id ?? 'unknown',
        won: r.won,
        score: r.score,
      })
    },
    [id],
  )

  if (phase === 'playing' && challenge) {
    return (
      <div className="arcade-root arcade-root--game">
        <CourtVisionPhaser
          challenge={challenge}
          lockMode
          onChallengeResolved={onResolved}
        />
      </div>
    )
  }

  return (
    <div className="arcade-root arcade-root--game">
      <div className="cvp-challenger">
        <div
          className="cvp-challenger__bg"
          style={{ backgroundImage: `url(${BASE}art/court-bg.webp)` }}
          aria-hidden
        />
        <div className="cvp-challenger__scan" aria-hidden />
        <div className="cvp-challenger__vignette" aria-hidden />

        <div className="cvp-challenger__panel">
          {phase === 'loading' ? (
            <>
              <p className="cvp-challenger__badge">Challenge</p>
              <h1 className="cvp-challenger__title">Loading…</h1>
              <p className="cvp-challenger__copy">Pulling the challenge card.</p>
            </>
          ) : null}

          {phase === 'error' ? (
            <>
              <p className="cvp-challenger__badge">Offline</p>
              <h1 className="cvp-challenger__title">Challenge offline</h1>
              <p className="cvp-challenger__copy">
                {error === 'challenge_expired'
                  ? 'This challenge expired. Run a fresh one from Court Vision.'
                  : 'Could not find that challenge.'}
              </p>
              <Link to="/" className="ffa-btn ffa-btn--ghost">
                ← Back to Fifth Floor Arcade
              </Link>
            </>
          ) : null}

          {phase === 'ready' && challenge ? (
            <>
              <p className="cvp-challenger__badge">
                <span className="cvp-challenger__dot" />
                Here comes a new challenger!
                <span className="cvp-challenger__dot" />
              </p>

              <div className="cvp-challenger__vs">
                <div className="cvp-challenger__side">
                  <p className="cvp-challenger__role">Challenger</p>
                  <p className="cvp-challenger__handle">
                    {challenge.creatorHandle}
                  </p>
                </div>
                <p className="cvp-challenger__vs-mark" aria-hidden>
                  VS
                </p>
                <div className="cvp-challenger__side cvp-challenger__side--you">
                  <p className="cvp-challenger__role">You</p>
                  <p className="cvp-challenger__handle cvp-challenger__handle--you">
                    ???
                  </p>
                </div>
              </div>

              <p className="cvp-challenger__target-label">Beat this score</p>
              <p className="cvp-challenger__target">{challenge.targetScore}</p>
              <p className="cvp-challenger__copy">
                Court Vision · same setup · 60 seconds.
                <br />
                Shift the scoreboard.
              </p>

              <button
                type="button"
                className="ffa-btn ffa-btn--primary"
                onClick={() => {
                  setPhase('playing')
                  track('arcade_challenge_start', { challengeId: challenge.id })
                }}
              >
                Accept challenge
              </button>
              <Link to="/" className="ffa-btn ffa-btn--ghost ffa-btn--sm">
                ← Back to Fifth Floor Arcade
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
