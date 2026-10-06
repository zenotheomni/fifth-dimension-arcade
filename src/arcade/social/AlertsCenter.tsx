import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchInbox, type Alert } from '../core/arcadeApi'
import { hasSession, onPlayerChange } from '../core/session'
import { setUnread, useAlertStore } from './alertStore'
import './social.css'

const SEEN_KEY = 'fd_arcade_alert_seen'
const POLL_MS = 20_000

/** Global in-app alerts: light polling of the inbox, toasts for new items, unread badge count. */
export default function AlertsCenter() {
  const navigate = useNavigate()
  const { nonce } = useAlertStore()
  const [toasts, setToasts] = useState<Alert[]>([])
  const [active, setActive] = useState(() => hasSession())
  const stopped = useRef(false)

  useEffect(() => onPlayerChange((p) => setActive(Boolean(p))), [])

  const poll = useCallback(async () => {
    if (!hasSession() || stopped.current || document.visibilityState === 'hidden') return
    const r = await fetchInbox(0)
    if (!r.ok) {
      if (r.error === 'bad_token' || r.error === 'player_not_found') stopped.current = true
      return
    }
    setUnread(r.unread)
    const seen = Number(localStorage.getItem(SEEN_KEY) ?? 0)
    const fresh = r.alerts.filter((a) => a.id > seen && !a.read).slice(0, 2)
    if (r.latest_id) localStorage.setItem(SEEN_KEY, String(Math.max(seen, r.latest_id)))
    // First poll on a device: don't toast the backlog.
    if (seen === 0) return
    if (fresh.length) {
      setToasts((t) => [...fresh, ...t].slice(0, 2))
      fresh.forEach((a) => window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== a.id)), 7000))
    }
  }, [])

  useEffect(() => {
    if (!active) return
    void poll()
    const id = window.setInterval(() => void poll(), POLL_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') void poll()
    }
    document.addEventListener('visibilitychange', onVis)
    const onSwMsg = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type === 'arcade-push') void poll()
    }
    navigator.serviceWorker?.addEventListener('message', onSwMsg)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      navigator.serviceWorker?.removeEventListener('message', onSwMsg)
    }
  }, [active, poll])

  useEffect(() => {
    if (nonce > 0 && active) void poll()
  }, [nonce, active, poll])

  if (!toasts.length) return null
  return (
    <div className="soc-toasts" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`soc-toast soc-toast--${t.kind}`}
          onClick={() => {
            setToasts((x) => x.filter((y) => y.id !== t.id))
            navigate(t.url.replace(/^\/arcade/, '') || '/')
          }}
        >
          <span className="soc-toast__title">{t.title}</span>
          <span className="soc-toast__body">{t.body}</span>
        </button>
      ))}
    </div>
  )
}
