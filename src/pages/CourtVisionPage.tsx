import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { track } from '../arcade/analytics'
import { COURT_VISION_COPY, COPY } from '../arcade/copyLocks'
import { END_DOORS } from '../arcade/brandPlacement'

export default function CourtVisionPage() {
  useEffect(() => {
    track('arcade_court_vision_shell_view')
  }, [])

  return (
    <div className="arcade-root">
      <div className="arcade-glow arcade-glow--signal" aria-hidden />
      <div className="arcade-shell">
        <p className="arcade-ticket">Court Vision</p>
        <h1 className="arcade-shell__title">Court Vision</h1>
        <p className="arcade-shell__copy">
          Endless shell — gameplay lands in M2. {COPY.FLOW_STATE}
        </p>
        <p className="arcade-shell__whisper">{COURT_VISION_COPY.FIRST_MAKE}</p>
        <div className="arcade-shell__actions">
          {END_DOORS.courtVision.map((door) => (
            <span
              key={door.id}
              className="arcade-soft-cta arcade-soft-cta--muted"
              title="Unlocks after a run (M2+)"
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
