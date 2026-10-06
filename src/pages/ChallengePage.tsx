import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { track } from '../arcade/analytics'
import {
  fetchChallengeView,
  startChallenge,
  type ChallengeView,
  type RunResult,
} from '../arcade/core/arcadeApi'
import { getCachedPlayer, hasSession } from '../arcade/core/session'
import type { CvChallengeConfig } from '../arcade/courtVisionPhaser/types'
import HandlePrompt from '../arcade/social/HandlePrompt'
import SharePanel from '../arcade/social/SharePanel'
import VsResult from '../arcade/social/VsResult'
import { requestAlertsRefresh } from '../arcade/social/alertStore'
import '../arcade/courtVisionPhaser/courtVisionPhaser.css'
import '../arcade/social/social.css'

const CourtVision3D = lazy(() => import('../arcade/courtVision3d/CourtVision3D'))

type Phase = 'loading' | 'ready' | 'handle' | 'starting' | 'playing' | 'vs' | 'creator' | 'error'

const BASE = import.meta.env.BASE_URL

type VsData = {
  meHandle: string
  myScore: number | null
  result: 'win' | 'loss' | 'tie' | null
  h2h: ChallengeView['h2h']
  boardLine?: string | null
}

export default function ChallengePage() {
  const { id } = useParams<{ id: string }>()
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ChallengeView | null>(null)
  const [vs, setVs] = useState<VsData | null>(null)

  useEffect(() => {
    track('arcade_challenge_shell_view', { challengeId: id ?? 'unknown' })
  }, [id])

  const load = useCallback(async () => {
    if (!id) {
      setPhase('error')
      setError('missing_id')
      return
    }
    setPhase('loading')
    const r = await fetchChallengeView(id)
    if (!r.ok) {
      setPhase('error')
      setError(r.error)
      return
    }
    const c = r.challenge
    setView(c)
    const me = getCachedPlayer()
    if (me && me.player_id === c.creator_player_id) {
      setPhase('creator')
      return
    }
    if (c.viewer_entry?.status === 'finished') {
      setVs({ meHandle: me?.handle ?? 'You', myScore: c.viewer_entry.score, result: c.viewer_entry.result, h2h: c.h2h })
      setPhase('vs')
      return
    }
    if (c.expired) {
      setPhase('error')
      setError('challenge_expired')
      return
    }
    setPhase('ready')
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const begin = async () => {
    if (!view) return
    setPhase('starting')
    const r = await startChallenge(view.id)
    if (!r.ok) {
      if (r.error === 'own_challenge') {
        setPhase('creator')
        return
      }
      setPhase('error')
      setError(r.error)
      return
    }
    track('arcade_challenge_start', { challengeId: view.id })
    requestAlertsRefresh()
    if (r.state === 'finished') {
      await load()
      return
    }
    setPhase('playing')
  }

  const onAccept = () => {
    const me = getCachedPlayer()
    if (hasSession() && me && !me.is_guest) void begin()
    else setPhase('handle')
  }

  const onRunResult = useCallback(
    (run: RunResult | null, final: { score: number }) => {
      const m = run?.match
      setVs({
        meHandle: run?.handle ?? getCachedPlayer()?.handle ?? 'You',
        myScore: m?.counted ? (m.my_score ?? final.score) : (m?.my_score ?? final.score),
        result: m?.result ?? (view ? (final.score > view.target_score ? 'win' : final.score < view.target_score ? 'loss' : 'tie') : null),
        h2h: m?.h2h ?? view?.h2h ?? null,
        boardLine: run?.board?.alltime ? `All-time #${run.board.alltime.rank} on the Court Vision board` : null,
      })
      setPhase('vs')
      track('arcade_challenge_resolved', { challengeId: id ?? 'unknown', result: m?.result ?? 'unknown', score: final.score })
      // refresh "next challenge" (rematch) info in the background
      if (id) void fetchChallengeView(id).then((r) => r.ok && setView(r.challenge))
    },
    [id, view],
  )

  const cvChallenge: CvChallengeConfig | null = view
    ? { id: view.id, targetScore: view.target_score, seed: view.seed || '', creatorHandle: view.creator_handle }
    : null

  if (phase === 'playing' && cvChallenge) {
    return (
      <div className="arcade-root arcade-root--game">
        <Suspense fallback={<div className="cv3-suspense">Loading Court Vision…</div>}>
          <CourtVision3D challenge={cvChallenge} lockMode onRunResult={onRunResult} />
        </Suspense>
      </div>
    )
  }

  if (phase === 'vs' && view && vs) {
    const next = view.next_challenge && view.next_challenge.creator_player_id === view.creator_player_id ? view.next_challenge : null
    return (
      <div className="arcade-root arcade-root--game">
        <VsResult
          me={{ handle: vs.meHandle, score: vs.myScore }}
          them={{ handle: view.creator_handle, score: view.target_score }}
          result={vs.result}
          h2h={vs.h2h}
          rivalPlayerId={view.creator_player_id}
          challengeId={view.id}
          nextChallengeId={next?.id ?? null}
          nextTarget={next?.target_score ?? null}
          boardLine={vs.boardLine}
        />
      </div>
    )
  }

  return (
    <div className="arcade-root arcade-root--game">
      <div className="cvp-challenger">
        <div className="cvp-challenger__bg" style={{ backgroundImage: `url(${BASE}art/court-bg.webp)` }} aria-hidden />
        <div className="cvp-challenger__scan" aria-hidden />
        <div className="cvp-challenger__vignette" aria-hidden />

        <div className="cvp-challenger__panel">
          {phase === 'loading' || phase === 'starting' ? (
            <>
              <p className="cvp-challenger__badge">Challenge</p>
              <h1 className="cvp-challenger__title">{phase === 'starting' ? 'Racking up…' : 'Loading…'}</h1>
              <p className="cvp-challenger__copy">Pulling the challenge card.</p>
            </>
          ) : null}

          {phase === 'error' ? (
            <>
              <p className="cvp-challenger__badge">Offline</p>
              <h1 className="cvp-challenger__title">Challenge offline</h1>
              <p className="cvp-challenger__copy">
                {error === 'challenge_expired'
                  ? 'This challenge expired. Run a fresh one from Court Vision.'
                  : error === 'rate_limited'
                    ? 'Too many challenges this hour — try again soon.'
                    : 'Could not find that challenge.'}
              </p>
              <Link to="/" className="ffa-btn ffa-btn--ghost">
                ← Back to Fifth Floor Arcade
              </Link>
            </>
          ) : null}

          {phase === 'creator' && view ? (
            <>
              <p className="cvp-challenger__badge">Your challenge</p>
              <h1 className="cvp-challenger__title">{view.target_score}</h1>
              {view.entries.filter((e) => e.role === 'challenger').length ? (
                <ul className="soc-rivals" style={{ width: '100%' }}>
                  {view.entries
                    .filter((e) => e.role === 'challenger')
                    .map((e) => (
                      <li key={e.player_id} className="soc-rival">
                        <div className="soc-rival__main">
                          <span className="soc-rival__handle">{e.handle}</span>
                          <span className="soc-rival__record">
                            {e.status === 'finished'
                              ? `${e.score} · ${e.result === 'win' ? 'beat you' : e.result === 'loss' ? 'came up short' : 'tied you'}`
                              : 'Playing now…'}
                          </span>
                        </div>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="cvp-challenger__copy">Nobody’s taken it yet. Send it again:</p>
              )}
              {view.url ? <SharePanel handle={view.creator_handle} score={view.target_score} url={view.url} /> : null}
              <Link to="/" className="ffa-btn ffa-btn--ghost ffa-btn--sm">
                ← Back to Fifth Floor Arcade
              </Link>
            </>
          ) : null}

          {phase === 'handle' && view ? (
            <>
              <p className="cvp-challenger__badge">
                <span className="cvp-challenger__dot" />
                {view.creator_handle} is waiting
                <span className="cvp-challenger__dot" />
              </p>
              <HandlePrompt
                title="Who’s shooting?"
                subtitle={`So ${view.creator_handle} knows who beat them.`}
                cta="Play"
                onDone={() => void begin()}
              />
            </>
          ) : null}

          {phase === 'ready' && view ? (
            <>
              <p className="cvp-challenger__badge">
                <span className="cvp-challenger__dot" />
                Here comes a new challenger!
                <span className="cvp-challenger__dot" />
              </p>

              <div className="cvp-challenger__vs">
                <div className="cvp-challenger__side">
                  <p className="cvp-challenger__role">Challenger</p>
                  <p className="cvp-challenger__handle">{view.creator_handle}</p>
                </div>
                <p className="cvp-challenger__vs-mark" aria-hidden>
                  VS
                </p>
                <div className="cvp-challenger__side cvp-challenger__side--you">
                  <p className="cvp-challenger__role">You</p>
                  <p className="cvp-challenger__handle cvp-challenger__handle--you">
                    {getCachedPlayer()?.handle ?? '???'}
                  </p>
                </div>
              </div>

              <p className="cvp-challenger__target-label">Beat this score</p>
              <p className="cvp-challenger__target">{view.target_score}</p>
              {view.h2h && view.h2h.games > 0 ? <p className="soc-vs__series">{view.h2h.text}</p> : null}
              <p className="cvp-challenger__copy">
                Court Vision · same court, same {view.seed.startsWith('still:') ? 'setup' : 'sway & wind'} · 60 seconds.
              </p>

              <button type="button" className="ffa-btn ffa-btn--primary" onClick={onAccept}>
                Accept challenge
              </button>
              <Link to="/" className="ffa-btn ffa-btn--ghost ffa-btn--sm">
                ← Back to Fifth Floor Arcade
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
