import { Link } from 'react-router-dom'
import { track } from '../analytics'
import { END_DOORS } from '../brandPlacement'
import { COPY, COURT_VISION_COPY } from '../copyLocks'
import { useCourtVisionGame } from './useCourtVisionGame'
import './courtVision.css'

export type CourtVisionEndlessProps = {
  onExit?: () => void
}

export default function CourtVisionEndless({ onExit }: CourtVisionEndlessProps) {
  const g = useCourtVisionGame()

  return (
    <div className="cv-root">
      <div className="cv-hud" aria-live="polite">
        <div className="cv-hud__left">
          <Link to="/" className="cv-hud__back" onClick={onExit}>
            ← Floor
          </Link>
          <span className="cv-hud__mode">Endless</span>
        </div>
        <div className="cv-hud__scoreblock">
          <span className="cv-hud__score">{g.score}</span>
          <span className="cv-hud__meta">
            x{g.streak || 0}
            {g.mult > 1 ? ` · ${g.mult}x` : ''}
          </span>
        </div>
        <div className="cv-hud__pb">PB {g.pb}</div>
      </div>

      <div className="cv-stage" ref={g.wrapRef}>
        <canvas
          ref={g.canvasRef}
          className="cv-canvas"
          onPointerDown={g.onPointerDown}
          onPointerMove={g.onPointerMove}
          onPointerUp={g.onPointerUp}
          onPointerCancel={g.onPointerUp}
        />

        <div className="cv-toasts" aria-live="polite">
          {g.toasts.map((t) => (
            <div
              key={t.id}
              className={t.mint ? 'cv-toast cv-toast--mint' : 'cv-toast'}
            >
              {t.text}
            </div>
          ))}
        </div>

        {!g.started ? (
          <div className="cv-overlay">
            <p className="arcade-ticket">Court Vision</p>
            <h1 className="cv-overlay__title">Endless</h1>
            <p className="cv-overlay__copy">
              Hold the ball, pull to aim and power, release. One mid-air nudge.
              Miss ends the run.
            </p>
            <button
              type="button"
              className="arcade-soft-cta"
              onClick={g.startRun}
            >
              Run it
            </button>
            <p className="cv-overlay__whisper">{COPY.FLOW_STATE}</p>
          </div>
        ) : null}

        {g.phase === 'ended' ? (
          <div className="cv-overlay cv-overlay--end">
            <p className="arcade-ticket">Run complete</p>
            <h1 className="cv-overlay__title">{g.score}</h1>
            {g.newPb ? (
              <p className="cv-overlay__whisper">{COURT_VISION_COPY.NEW_PB}</p>
            ) : (
              <p className="cv-overlay__copy">
                {g.lastShot?.kind === 'miss'
                  ? COPY.ALMOST_REARRANGE
                  : COPY.RUN_IT_BACK}
              </p>
            )}
            <div className="cv-end-doors">
              {END_DOORS.courtVision.map((door) =>
                door.id === 'challenge' ? (
                  <Link
                    key={door.id}
                    to="/challenge/new"
                    className="arcade-soft-cta"
                    onClick={() =>
                      track('arcade_court_vision_end_door', {
                        door: door.id,
                      })
                    }
                  >
                    {door.label}
                  </Link>
                ) : (
                  <button
                    key={door.id}
                    type="button"
                    className="arcade-soft-cta"
                    onClick={() => {
                      track('arcade_court_vision_end_door', { door: door.id })
                      track('arcade_dock_tap', { dock: 'boutique' })
                    }}
                  >
                    {door.label}
                  </button>
                ),
              )}
              <button
                type="button"
                className="arcade-soft-cta arcade-soft-cta--ghost"
                onClick={g.startRun}
              >
                {COPY.RUN_IT_BACK}
              </button>
              <Link to="/" className="arcade-back">
                ← Back to The Fifth Floor
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      {g.started && g.phase !== 'ended' ? (
        <p className="cv-hint">{g.hint}</p>
      ) : null}
    </div>
  )
}
