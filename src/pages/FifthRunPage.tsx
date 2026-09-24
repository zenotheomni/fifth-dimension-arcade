import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { track } from '../arcade/analytics'
import { FIFTH_RUN_COPY, COPY } from '../arcade/copyLocks'
import { END_DOORS } from '../arcade/brandPlacement'

export default function FifthRunPage() {
  useEffect(() => {
    track('arcade_fifth_run_shell_view')
  }, [])

  return (
    <div className="arcade-root">
      <div className="arcade-glow arcade-glow--mint" aria-hidden />
      <div className="arcade-shell">
        <p className="arcade-ticket">Fifth Run</p>
        <h1 className="arcade-shell__title">Fifth Run</h1>
        <p className="arcade-shell__copy">
          Endless shell — gameplay lands in M4. {COPY.FIFTH_STATE_UNLOCKED}
        </p>
        <p className="arcade-shell__whisper">{FIFTH_RUN_COPY.START}</p>
        <div className="arcade-shell__actions">
          {END_DOORS.fifthRun.map((door) => (
            <span
              key={door.id}
              className="arcade-soft-cta arcade-soft-cta--muted"
              title="Unlocks after a run (M4+)"
            >
              {door.label}
            </span>
          ))}
          <Link to="/" className="arcade-back">
            ← Back to The Fifth Floor
          </Link>
        </div>
      </div>
    </div>
  )
}
