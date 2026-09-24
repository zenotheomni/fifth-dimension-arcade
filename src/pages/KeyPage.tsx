import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { track } from '../arcade/analytics'
import { COPY } from '../arcade/copyLocks'

export default function KeyPage() {
  useEffect(() => {
    track('arcade_key_nfc_shell_view')
  }, [])

  return (
    <div className="arcade-root">
      <div className="arcade-glow arcade-glow--signal" aria-hidden />
      <div className="arcade-shell">
        <p className="arcade-ticket">NFC Key</p>
        <h1 className="arcade-shell__title">Key</h1>
        <p className="arcade-shell__copy">
          NFC landing placeholder — ships in M5. {COPY.RUN_IT_BACK}
        </p>
        <div className="arcade-shell__actions">
          <Link to="/" className="arcade-soft-cta">
            Enter Fifth Floor Arcade
          </Link>
          <Link to="/" className="arcade-back">
            ← Fifth Floor Arcade
          </Link>
        </div>
      </div>
    </div>
  )
}
