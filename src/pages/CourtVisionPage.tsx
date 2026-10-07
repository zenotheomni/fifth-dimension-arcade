import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { track } from '../arcade/analytics'
import { issueTicket } from '../arcade/core/arcadeApi'
import type { SeededRun } from '../arcade/courtVision3d/CourtVision3D'
import '../arcade/social/social.css'
import BrandLockup from '../arcade/brand/BrandLockup'

const CourtVision3D = lazy(() => import('../arcade/courtVision3d/CourtVision3D'))

const loading = (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      display: 'grid',
      placeItems: 'center',
      background: '#0a0a0c',
      color: '#ffc83c',
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      fontSize: '0.8rem',
    }}
  >
    <div style={{ display: 'grid', justifyItems: 'center', gap: 18 }}>
      <BrandLockup size={120} />
      <span>Loading Court Vision…</span>
    </div>
  </div>
)

/**
 * /court-vision            normal run
 * /court-vision?setbar=1   seeded "set the bar" run → open challenge to share
 * /court-vision?rival=<player>&parent=<challenge>   seeded rematch → directed challenge + alert
 */
export default function CourtVisionPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const rival = params.get('rival')
  const parent = params.get('parent')
  const wantsSeeded = params.get('setbar') === '1' || Boolean(rival)
  const [seeded, setSeeded] = useState<SeededRun | null>(null)
  const [stage, setStage] = useState<'intro' | 'issuing' | 'play' | 'error'>(wantsSeeded ? 'intro' : 'play')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    track('arcade_court_vision_view', { seeded: wantsSeeded })
  }, [wantsSeeded])

  useEffect(() => {
    setStage(wantsSeeded ? 'intro' : 'play')
    setSeeded(null)
  }, [wantsSeeded, rival])

  const start = async () => {
    setStage('issuing')
    const r = await issueTicket({ game: 'court-vision', rivalPlayerId: rival, parentChallengeId: parent })
    if (!r.ok) {
      setErr(r.error === 'rate_limited' ? 'Easy — that’s a lot of challenges this hour. Try again soon.' : r.error === 'not_rivals' ? 'You can only run it back with a rival.' : 'Couldn’t set up the run. Check your connection.')
      setStage('error')
      return
    }
    setSeeded({ ticketId: r.ticket.ticket_id, seed: r.ticket.seed, rivalHandle: r.ticket.rival_handle })
    setStage('play')
  }

  if (stage === 'play') {
    return (
      <div className="arcade-root arcade-root--game">
        <Suspense fallback={loading}>
          <CourtVision3D
            key={seeded?.ticketId ?? 'normal'}
            seeded={seeded}
            lockMode={Boolean(seeded)}
            onPlayNormal={() => navigate('/court-vision', { replace: true })}
          />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="arcade-root">
      <div className="soc-page">
        <p className="soc-page__eyebrow">{rival ? 'Run it back' : 'Challenge a friend'}</p>
        <h1>{rival ? 'Rematch' : 'Set the bar'}</h1>
        <p>
          {rival
            ? 'New court, new wind. Put up a score — your rival gets an alert that it’s their turn.'
            : 'Play one 60-second run on a fresh court. Then send it — your friend gets the exact same sway and wind.'}
        </p>
        {stage === 'error' ? <p style={{ color: '#ff7a9e', fontWeight: 700 }}>{err}</p> : null}
        <button type="button" className="ffa-btn ffa-btn--primary" disabled={stage === 'issuing'} onClick={() => void start()}>
          {stage === 'issuing' ? 'Racking up…' : 'Start run'}
        </button>
        <Link to="/" className="ffa-btn ffa-btn--ghost ffa-btn--sm">
          Back to floor
        </Link>
      </div>
    </div>
  )
}
