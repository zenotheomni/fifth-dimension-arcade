import { useState } from 'react'
import { alertsState, dismissAlertsOffer, enableAlerts, shouldOfferAlerts } from '../core/alerts'
import { track } from '../analytics'
import './social.css'

/** Shown only after sending or accepting a challenge — never on first load. */
export default function AlertsOptIn({ reason }: { reason: 'sent' | 'accepted' }) {
  const [visible, setVisible] = useState(() => shouldOfferAlerts())
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!visible) return status ? <p className="soc-alerts__done">{status}</p> : null

  const state = alertsState()
  if (state === 'ios-install') {
    return (
      <div className="soc-alerts soc-alerts--ios">
        <p className="soc-alerts__title">Get pinged when they play</p>
        <p className="soc-alerts__body">
          On iPhone, alerts need the arcade on your Home Screen: tap <strong>Share</strong> →{' '}
          <strong>Add to Home Screen</strong>, open it from there, then turn on alerts (iOS 16.4+).
        </p>
        <button
          type="button"
          className="soc-alerts__later"
          onClick={() => {
            dismissAlertsOffer()
            setVisible(false)
          }}
        >
          Got it
        </button>
      </div>
    )
  }

  return (
    <div className="soc-alerts">
      <p className="soc-alerts__title">
        {reason === 'sent' ? 'Know the second they play' : 'Know when they run it back'}
      </p>
      <p className="soc-alerts__body">We’ll alert you when your rival starts and when they finish — with who won.</p>
      <div className="soc-alerts__row">
        <button
          type="button"
          className="ffa-btn ffa-btn--secondary ffa-btn--sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const r = await enableAlerts()
            setBusy(false)
            track('arcade_alerts_optin', { result: r, reason })
            setStatus(
              r === 'on'
                ? 'Alerts on 🔔'
                : r === 'denied'
                  ? 'Alerts blocked — you’ll still see them in Rivals'
                  : 'Alerts not available here — check Rivals for updates',
            )
            setVisible(false)
          }}
        >
          {busy ? 'Turning on…' : 'Turn on alerts'}
        </button>
        <button
          type="button"
          className="soc-alerts__later"
          onClick={() => {
            dismissAlertsOffer()
            setVisible(false)
          }}
        >
          Not now
        </button>
      </div>
    </div>
  )
}
