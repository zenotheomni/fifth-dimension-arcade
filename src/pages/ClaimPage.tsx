import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { track } from '../arcade/analytics'
import { claimHandle } from '../arcade/core/session'
import '../arcade/social/social.css'

/** /claim?code=… — one-time link that binds a reserved handle to this device. */
export default function ClaimPage() {
  const [params] = useSearchParams()
  const code = useMemo(() => params.get('code') ?? '', [params])
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [handle, setHandle] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    track('arcade_claim_view')
  }, [])

  const claim = async () => {
    setState('busy')
    const r = await claimHandle(code)
    if (!r.ok) {
      setErr(
        r.error === 'invalid_claim_code'
          ? 'This claim link was already used or isn’t valid.'
          : r.error === 'handle_conflict'
            ? 'That handle is held by another player. Ask the arcade to reset it.'
            : 'Couldn’t claim right now — check your connection and try again.',
      )
      setState('error')
      return
    }
    setHandle(r.player.handle)
    setState('done')
    // Drop the code from the address bar/history.
    window.history.replaceState(null, '', `${import.meta.env.BASE_URL}claim`)
    track('arcade_claim_done')
  }

  return (
    <div className="arcade-root">
      <div className="soc-page">
        <p className="soc-page__eyebrow">Fifth Floor Arcade</p>
        {state === 'done' && handle ? (
          <>
            <h1>You’re in</h1>
            <p className="soc-page__big">{handle}</p>
            <p>That handle is now locked to this device. Your scores, challenges and rivals post under it.</p>
            <Link to="/" className="ffa-btn ffa-btn--primary">
              Hit the floor
            </Link>
          </>
        ) : (
          <>
            <h1>Claim your handle</h1>
            <p>
              This one-time link locks your reserved handle to <strong>this</strong> device. Open it on the phone you
              play on.
            </p>
            {!code ? <p style={{ color: '#ff7a9e', fontWeight: 700 }}>This link is missing its code.</p> : null}
            {err ? <p style={{ color: '#ff7a9e', fontWeight: 700 }}>{err}</p> : null}
            <button
              type="button"
              className="ffa-btn ffa-btn--primary"
              disabled={!code || state === 'busy'}
              onClick={() => void claim()}
            >
              {state === 'busy' ? 'Claiming…' : 'Claim it'}
            </button>
            <Link to="/" className="ffa-btn ffa-btn--ghost ffa-btn--sm">
              Back to floor
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
