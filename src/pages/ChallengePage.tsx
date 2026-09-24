import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { track } from '../arcade/analytics'
import { COPY } from '../arcade/copyLocks'

export default function ChallengePage() {
  const { id } = useParams<{ id: string }>()

  useEffect(() => {
    track('arcade_challenge_shell_view', { challengeId: id ?? 'unknown' })
  }, [id])

  return (
    <div className="arcade-root">
      <div className="arcade-glow arcade-glow--ink" aria-hidden />
      <div className="arcade-shell">
        <p className="arcade-ticket">Challenge</p>
        <h1 className="arcade-shell__title">Challenge</h1>
        <p className="arcade-shell__id">{id ?? '—'}</p>
        <p className="arcade-shell__copy">
          Challenge links land in M3. {COPY.ALMOST_REARRANGE}
        </p>
        <div className="arcade-shell__actions">
          <Link to="/" className="arcade-back">
            ← Back to Fifth Floor Arcade
          </Link>
        </div>
      </div>
    </div>
  )
}
