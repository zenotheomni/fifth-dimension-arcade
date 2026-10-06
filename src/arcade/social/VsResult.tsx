import { Link, useNavigate } from 'react-router-dom'
import type { H2H } from '../core/arcadeApi'
import { gameTitle } from '../core/challenges'
import AlertsOptIn from './AlertsOptIn'
import './social.css'

export type VsSide = { handle: string; score: number | null }

export default function VsResult({
  me,
  them,
  result,
  h2h,
  rivalPlayerId,
  challengeId,
  nextChallengeId,
  nextTarget,
  showAlerts = true,
  boardLine,
  game = 'court-vision',
}: {
  me: VsSide
  them: VsSide
  result: 'win' | 'loss' | 'tie' | null
  h2h: H2H | null
  rivalPlayerId: string
  challengeId: string
  nextChallengeId?: string | null
  nextTarget?: number | null
  showAlerts?: boolean
  boardLine?: string | null
  game?: string
}) {
  const navigate = useNavigate()
  const headline = result === 'win' ? 'You win!' : result === 'loss' ? `${them.handle} wins` : 'Dead heat'
  const series = h2h
    ? h2h.me_wins > h2h.them_wins
      ? `${me.handle} leads ${h2h.me_wins}–${h2h.them_wins}`
      : h2h.me_wins < h2h.them_wins
        ? `${them.handle} leads ${h2h.them_wins}–${h2h.me_wins}`
        : `Series tied ${h2h.me_wins}–${h2h.them_wins}`
    : null

  return (
    <div className={`soc-vs soc-vs--${result ?? 'tie'}`}>
      <div className="soc-vs__grid" aria-hidden />
      <p className="soc-vs__eyebrow">{gameTitle(game)} · Head to head</p>
      <h2 className="soc-vs__headline">{headline}</h2>
      <div className="soc-vs__sides">
        <div className={`soc-vs__side${result === 'win' ? ' is-winner' : ''}`}>
          {result === 'win' ? <span className="soc-vs__crown">Winner</span> : null}
          <span className="soc-vs__role">You</span>
          <span className="soc-vs__handle">{me.handle}</span>
          <span className="soc-vs__score">{me.score ?? '—'}</span>
        </div>
        <span className="soc-vs__mark">VS</span>
        <div className={`soc-vs__side soc-vs__side--them${result === 'loss' ? ' is-winner' : ''}`}>
          {result === 'loss' ? <span className="soc-vs__crown">Winner</span> : null}
          <span className="soc-vs__role">Rival</span>
          <span className="soc-vs__handle">{them.handle}</span>
          <span className="soc-vs__score">{them.score ?? '—'}</span>
        </div>
      </div>
      {series ? <p className="soc-vs__series">{series}</p> : null}
      {boardLine ? <p className="soc-vs__board">{boardLine}</p> : null}
      <div className="soc-vs__actions">
        {nextChallengeId ? (
          <button type="button" className="ffa-btn ffa-btn--primary" onClick={() => navigate(`/challenge/${nextChallengeId}`)}>
            Your turn · beat {nextTarget ?? 'it'}
          </button>
        ) : (
          <button
            type="button"
            className="ffa-btn ffa-btn--primary"
            onClick={() => navigate(`/${game}?rival=${encodeURIComponent(rivalPlayerId)}&parent=${encodeURIComponent(challengeId)}`)}
          >
            Run it back
          </button>
        )}
        <Link to="/?rivals=1" className="ffa-btn ffa-btn--ghost ffa-btn--sm">
          Rivals
        </Link>
        <Link to="/" className="ffa-btn ffa-btn--ghost ffa-btn--sm">
          Back to floor
        </Link>
      </div>
      {showAlerts ? <AlertsOptIn reason="accepted" /> : null}
    </div>
  )
}
