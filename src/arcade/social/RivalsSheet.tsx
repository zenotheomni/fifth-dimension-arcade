import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchInbox, fetchRivals, markInboxRead, type Alert, type Rival } from '../core/arcadeApi'
import { hasSession } from '../core/session'
import { requestAlertsRefresh, setUnread } from './alertStore'
import './social.css'

function ago(iso: string | null): string {
  if (!iso) return ''
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

export default function RivalsSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [rivals, setRivals] = useState<Rival[] | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!hasSession()) {
      setRivals([])
      return
    }
    let cancelled = false
    void (async () => {
      const [r, inbox] = await Promise.all([fetchRivals(), fetchInbox(0)])
      if (cancelled) return
      if (r.ok) setRivals(r.rivals)
      else {
        setRivals([])
        setErr('Could not load rivals')
      }
      if (inbox.ok) {
        setAlerts(inbox.alerts.slice(0, 4))
        if (inbox.latest_id && inbox.unread > 0) {
          await markInboxRead(inbox.latest_id)
          setUnread(0)
          requestAlertsRefresh()
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const go = (path: string) => {
    onClose()
    navigate(path)
  }

  return (
    <div className="soc-sheet" role="dialog" aria-modal="true" aria-label="Rivals">
      <button type="button" className="soc-sheet__scrim" aria-label="Close" onClick={onClose} />
      <div className="soc-sheet__panel">
        <header className="soc-sheet__head">
          <h3>Rivals</h3>
          <button type="button" className="soc-sheet__x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {alerts.length ? (
          <div className="soc-inbox">
            <p className="soc-inbox__label">Latest</p>
            {alerts.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`soc-inbox__item${a.read ? '' : ' is-new'}`}
                onClick={() => go(a.url.replace(/^\/arcade/, '') || '/')}
              >
                <span className="soc-inbox__title">{a.title}</span>
                <span className="soc-inbox__body">{a.body}</span>
                <span className="soc-inbox__when">{ago(a.created_at)}</span>
              </button>
            ))}
          </div>
        ) : null}

        {rivals === null ? <p className="soc-sheet__empty">Loading…</p> : null}
        {rivals && rivals.length === 0 ? (
          <div className="soc-sheet__empty">
            <p>No rivals yet.</p>
            <p>Send a challenge — whoever plays it becomes your rival, and the record keeps score.</p>
            <button type="button" className="ffa-btn ffa-btn--primary" onClick={() => go('/court-vision?setbar=1')}>
              Challenge a friend
            </button>
          </div>
        ) : null}
        {err ? <p className="soc-sheet__empty">{err}</p> : null}

        <ul className="soc-rivals">
          {(rivals ?? []).map((r) => {
            const lead =
              r.my_wins > r.their_wins
                ? `You lead ${r.my_wins}–${r.their_wins}`
                : r.my_wins < r.their_wins
                  ? `${r.rival_handle} leads ${r.their_wins}–${r.my_wins}`
                  : `Tied ${r.my_wins}–${r.their_wins}`
            return (
              <li key={r.rival_player_id} className={`soc-rival soc-rival--${r.status}`}>
                <div className="soc-rival__main">
                  <span className="soc-rival__handle">{r.rival_handle}</span>
                  <span className="soc-rival__record">
                    {lead}
                    {r.ties ? ` · ${r.ties} tie${r.ties > 1 ? 's' : ''}` : ''}
                  </span>
                  <span className="soc-rival__last">
                    Last: {r.last_my_score ?? '—'}–{r.last_their_score ?? '—'}{' '}
                    {r.last_result === 'win' ? 'W' : r.last_result === 'loss' ? 'L' : 'T'} · {ago(r.last_played_at)}
                  </span>
                </div>
                {r.status === 'your_turn' ? (
                  <button type="button" className="soc-chip soc-chip--turn" onClick={() => go(`/challenge/${r.turn_challenge_id}`)}>
                    Your turn
                  </button>
                ) : r.status === 'waiting' ? (
                  <span className="soc-chip soc-chip--wait">Waiting on them</span>
                ) : (
                  <button
                    type="button"
                    className="soc-chip soc-chip--ready"
                    onClick={() => go(`/court-vision?rival=${r.rival_player_id}${r.last_challenge_id ? `&parent=${r.last_challenge_id}` : ''}`)}
                  >
                    Run it back
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
