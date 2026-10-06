import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { track } from '../arcade/analytics'
import { issueTicket } from '../arcade/core/arcadeApi'
import type { SeededRun } from '../arcade/fifthRun/FifthRun'
import FifthRunLoading from '../arcade/fifthRun/FifthRunLoading'
import '../arcade/social/social.css'

const FifthRun = lazy(() => import('../arcade/fifthRun/FifthRun'))

/**
 * /fifth-run            normal endless run (random seed)
 * /fifth-run?setbar=1   seeded "set the bar" run → open challenge to share
 * /fifth-run?rival=<player>&parent=<challenge>   seeded rematch → directed challenge + alert
 */
export default function FifthRunPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const rival = params.get('rival')
  const parent = params.get('parent')
  const wantsSeeded = params.get('setbar') === '1' || Boolean(rival)
  const [seeded, setSeeded] = useState<SeededRun | null>(null)
  const [stage, setStage] = useState<'intro' | 'issuing' | 'play' | 'error'>(wantsSeeded ? 'intro' : 'play')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    track('arcade_fifth_run_view', { seeded: wantsSeeded })
  }, [wantsSeeded])

  useEffect(() => {
    setStage(wantsSeeded ? 'intro' : 'play')
    setSeeded(null)
  }, [wantsSeeded, rival])

  const start = async () => {
    setStage('issuing')
    const r = await issueTicket({ game: 'fifth-run', rivalPlayerId: rival, parentChallengeId: parent })
    if (!r.ok) {
      setErr(
        r.error === 'rate_limited'
          ? 'Easy — that’s a lot of challenges this hour. Try again soon.'
          : r.error === 'not_rivals'
            ? 'You can only run it back with a rival.'
            : 'Couldn’t set up the run. Check your connection.',
      )
      setStage('error')
      return
    }
    setSeeded({ ticketId: r.ticket.ticket_id, seed: r.ticket.seed, rivalHandle: r.ticket.rival_handle })
    setStage('play')
  }

  if (stage === 'play') {
    return (
      <div className="arcade-root arcade-root--game">
        <Suspense fallback={<FifthRunLoading />}>
          <FifthRun key={seeded?.ticketId ?? 'normal'} seeded={seeded} onPlayNormal={() => navigate('/fifth-run', { replace: true })} />
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
            ? 'Fresh highway, same for both of you. Put up a score — your rival gets an alert that it’s their turn.'
            : 'Run one fresh highway. Then send it — your friend gets the exact same stars, cars and gaps.'}
        </p>
        {stage === 'error' ? <p style={{ color: '#ff7a9e', fontWeight: 700 }}>{err}</p> : null}
        <button type="button" className="ffa-btn ffa-btn--primary" disabled={stage === 'issuing'} onClick={() => void start()}>
          {stage === 'issuing' ? 'Paving the road…' : 'Start run'}
        </button>
        <Link to="/" className="ffa-btn ffa-btn--ghost ffa-btn--sm">
          Back to floor
        </Link>
      </div>
    </div>
  )
}
