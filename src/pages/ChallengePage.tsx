import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { track } from '../arcade/analytics'
import { getChallengeJson } from '../arcade/core/challenges'
import CourtVisionPhaser from '../arcade/courtVisionPhaser/CourtVisionPhaser'
import type { CvChallengeConfig } from '../arcade/courtVisionPhaser/types'
import '../arcade/courtVisionPhaser/courtVisionPhaser.css'

type Phase = 'loading' | 'ready' | 'playing' | 'error'

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
    <div className="arcade-root">
      <div className="arcade-glow arcade-glow--ink" aria-hidden />
      <div className="arcade-shell cvp-challenge-shell">
        <p className="arcade-ticket">Challenge</p>
        {phase === 'loading' ? (
          <>
            <h1 className="arcade-shell__title">Loading…</h1>
            <p className="arcade-shell__copy">Pulling the challenge card.</p>
          </>
        ) : null}
        {phase === 'error' ? (
          <>
            <h1 className="arcade-shell__title">Challenge offline</h1>
            <p className="arcade-shell__copy">
              {error === 'challenge_expired'
                ? 'This challenge expired. Run a fresh one from Court Vision.'
                : 'Could not find that challenge.'}
            </p>
            <div className="arcade-shell__actions">
              <Link to="/" className="arcade-back">
                ← Back to Fifth Floor Arcade
              </Link>
            </div>
          </>
        ) : null}
        {phase === 'ready' && challenge ? (
          <>
            <h1 className="arcade-shell__title">Beat {challenge.creatorHandle}</h1>
            <p className="cvp-challenge-target">{challenge.targetScore}</p>
            <p className="arcade-shell__copy">
              Court Vision · same setup · 60 seconds. Shift the scoreboard.
            </p>
            <div className="arcade-shell__actions">
              <button
                type="button"
                className="cvp-btn-primary"
                style={{ width: '100%', textAlign: 'center' }}
                onClick={() => {
                  setPhase('playing')
                  track('arcade_challenge_start', { challengeId: challenge.id })
                }}
              >
                Accept challenge
              </button>
              <Link to="/" className="arcade-back">
                ← Back to Fifth Floor Arcade
              </Link>
            </div>
          </>
        ) : null}
              </div>
    </div>
  )
}
