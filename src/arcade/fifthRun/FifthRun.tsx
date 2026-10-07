import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { track } from '../analytics'
import { useArcadeAudio } from '../audio/AudioProvider'
import { END_DOORS } from '../brandPlacement'
import { COPY, FIFTH_RUN_COPY } from '../copyLocks'
import { challengeFromScore, newRunId, submitRun, type ChallengeInfo, type RunResult } from '../core/arcadeApi'
import { getCachedPlayer, onPlayerChange, type ArcadePlayer } from '../core/session'
import { DOCK_LINKS } from '../games/registry'
import HandlePrompt from '../social/HandlePrompt'
import SharePanel from '../social/SharePanel'
import StoryShareButton from '../social/StoryShareButton'
import { requestAlertsRefresh } from '../social/alertStore'
import { createFifthRun, type FifthRunHandle } from './engine'
import { BOOST, CHASE, FR_HZ, POWER_TICKS, START_LIVES, STAR_M } from './sim/constants'
import type { FrChallengeConfig, FrEndPayload, FrHudState } from './types'
import './fifthRun.css'

export type SeededRun = { ticketId: string; seed: string; rivalHandle?: string | null }

export type FifthRunProps = {
  /** Friend's challenge run (beat target_score on the same seed). */
  challenge?: FrChallengeConfig | null
  /** Seeded "set the bar" / rematch run — creates a new challenge on finish. */
  seeded?: SeededRun | null
  onChallengeResolved?: (result: { won: boolean; score: number }) => void
  /** Server result of a challenge run (parent shows the VS screen). */
  onRunResult?: (run: RunResult | null, final: FrEndPayload) => void
  onPlayNormal?: () => void
  /**
   * Optional replacement for the default story-card share button (kept as a slot so the
   * shared Share-score component can evolve without touching the game).
   */
  renderShare?: (args: { scoreId: string | null; score: number }) => React.ReactNode
}

const initialHud: FrHudState = {
  phase: 'loading',
  score: 0,
  distance: 0,
  keys: 0,
  combo: 0,
  mult: 1,
  lives: 3,
  threat: 0,
  timeS: 0,
  callout: null,
  pb: 0,
  newPb: false,
  hand: 0,
  speed: 0,
  target: null,
}

function randomSeed(): string {
  const a = new Uint32Array(2)
  try {
    crypto.getRandomValues(a)
  } catch {
    a[0] = (Math.random() * 2 ** 32) >>> 0
    a[1] = (Math.random() * 2 ** 32) >>> 0
  }
  return `run:${a[0].toString(16).padStart(8, '0')}${a[1].toString(16).padStart(8, '0').slice(0, 4)}`
}

function seedFromUrl(): string | null {
  try {
    const s = new URLSearchParams(window.location.search).get('seed')
    return s && /^[a-z]+:[0-9a-f]{6,32}$/.test(s) ? s : null
  } catch {
    return null
  }
}

export default function FifthRun({ challenge = null, seeded = null, onChallengeResolved, onRunResult, onPlayNormal, renderShare }: FifthRunProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<FifthRunHandle | null>(null)
  const audio = useArcadeAudio()
  const mutedRef = useRef(audio.muted)
  const engineChallenge = useMemo<FrChallengeConfig | null>(() => {
    if (challenge) return challenge
    if (seeded) return { id: '', targetScore: 0, seed: seeded.seed, creatorHandle: seeded.rivalHandle ?? '', setTheBar: true }
    return null
  }, [challenge, seeded])
  const [hud, setHud] = useState<FrHudState>(initialHud)
  const [ended, setEnded] = useState<FrEndPayload | null>(null)
  const [run, setRun] = useState<RunResult | null>(null)
  const [runState, setRunState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [shareChallenge, setShareChallenge] = useState<ChallengeInfo | null>(null)
  const [busyShare, setBusyShare] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)
  const [remount, setRemount] = useState(0)
  const [player, setPlayer] = useState<ArcadePlayer | null>(() => getCachedPlayer())
  const [renaming, setRenaming] = useState(false)
  const [howto, setHowto] = useState(true)
  const howtoRef = useRef(true)
  howtoRef.current = howto
  const runIdRef = useRef<string>(newRunId())
  const onRunResultRef = useRef(onRunResult)
  onRunResultRef.current = onRunResult

  useEffect(() => onPlayerChange(setPlayer), [])

  useEffect(() => {
    audio.duck(true)
    return () => audio.duck(false)
  }, [audio])

  useEffect(() => {
    mutedRef.current = audio.muted
    gameRef.current?.setMuted(audio.muted)
  }, [audio.muted])

  const destroyGame = useCallback(() => {
    gameRef.current?.destroy()
    gameRef.current = null
  }, [])

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    destroyGame()
    setEnded(null)
    setRun(null)
    setRunState('idle')
    setShareChallenge(null)
    setShareNote(null)
    setHud(initialHud)
    runIdRef.current = newRunId()
    const seed = engineChallenge?.seed ?? (remount === 0 ? seedFromUrl() : null) ?? randomSeed()
    const mode = engineChallenge ? 'challenge' : 'endless'

    gameRef.current = createFifthRun(el, {
      muted: mutedRef.current,
      seed,
      challenge: engineChallenge,
      onHud: setHud,
      onEnded: (final) => {
        setEnded(final)
        track('arcade_fifth_run_end', {
          score: final.score,
          distance: final.distance,
          keys: final.keys,
          newPb: final.newPb,
          challenge: Boolean(challenge),
          seeded: Boolean(seeded),
        })
        if (challenge && final.beatChallenge != null) onChallengeResolved?.({ won: final.beatChallenge, score: final.score })
        setRunState('saving')
        void (async () => {
          const r = await submitRun({
            game: 'fifth-run',
            mode,
            score: final.score,
            runId: runIdRef.current,
            challengeId: challenge?.id || null,
            ticketId: seeded?.ticketId ?? null,
            meta: {
              pb: final.pb,
              seed: final.seed,
              bestStreak: final.maxCombo,
              distance: final.distance,
              keys: final.keys,
              durationS: final.durationS,
            },
          })
          if (r.ok) {
            setRun(r.run)
            setRunState('saved')
            if (r.run.created_challenge) setShareChallenge(r.run.created_challenge)
            if (r.run.alerts_created) requestAlertsRefresh()
          } else {
            setRunState('error')
          }
          if (challenge) onRunResultRef.current?.(r.ok ? r.run : null, final)
        })()
      },
    })
    gameRef.current.setLocked(howtoRef.current)
    return () => destroyGame()
  }, [remount, destroyGame, engineChallenge, challenge, seeded, onChallengeResolved])

  const startFromHowto = () => {
    setHowto(false)
    gameRef.current?.start()
    track('arcade_fifth_run_howto_start')
  }

  const displayPb = Math.max(run?.personal_best ?? 0, ended?.pb ?? hud.pb)

  const headline = useMemo(() => {
    if (!ended) return COPY.RUN_IT_BACK
    if (seeded) return seeded.rivalHandle ? 'Your move is in' : 'Bar is set'
    if (ended.beatChallenge === true) return FIFTH_RUN_COPY.BEAT_FRIEND
    if (ended.beatChallenge === false) return 'They outran you. Run it back.'
    if (ended.newPb) return FIFTH_RUN_COPY.NEW_PB
    return FIFTH_RUN_COPY.CRASH
  }, [ended, seeded])

  const runItBack = () => {
    if (seeded && onPlayNormal) {
      onPlayNormal()
      return
    }
    setEnded(null)
    setRemount((n) => n + 1)
    track('arcade_fifth_run_run_it_back')
  }

  const challengeFriend = async () => {
    if (!ended || busyShare || !run) return
    setBusyShare(true)
    setShareNote(null)
    try {
      const created = await challengeFromScore(run.id)
      if (!created.ok || !created.challenge.url) {
        setShareNote(!created.ok && created.error === 'rate_limited' ? 'Easy — too many challenges this hour' : 'Challenge failed — try again')
        return
      }
      setShareChallenge(created.challenge)
      track('arcade_challenge_create', { score: ended.score, id: created.challenge.id, game: 'fifth-run' })
    } finally {
      setBusyShare(false)
    }
  }

  const boardLine = run?.board
    ? [run.board.alltime ? `All-time #${run.board.alltime.rank}` : null, run.board.weekly ? `Weekly #${run.board.weekly.rank}` : null]
        .filter(Boolean)
        .join(' · ')
    : ''
  const handle = run?.handle ?? player?.handle ?? ''
  const isGuest = run ? run.is_guest && (player?.is_guest ?? true) : (player?.is_guest ?? true)
  const canChallenge = Boolean(ended && !challenge && !seeded)
  const playing = hud.phase === 'playing' || hud.phase === 'paused'
  const recordStore = DOCK_LINKS.find((d) => d.id === 'record-store')?.href ?? 'https://5dimperial.com/collections/music?view=record-store'

  return (
    <div className="fr-root">
      <Link to="/" className="fr-pill fr-back">
        ← Floor
      </Link>
      <div className="fr-pill fr-top-right">
        {challenge ? (
          <span className="fr-tag">
            Beat {challenge.creatorHandle} · {challenge.targetScore}
          </span>
        ) : seeded ? (
          <span className="fr-tag">{seeded.rivalHandle ? `Rematch · ${seeded.rivalHandle}` : 'Set the bar'}</span>
        ) : (
          <span className="fr-tag fr-tag--muted">Endless</span>
        )}
        <button type="button" onClick={audio.toggleMute} aria-label={audio.muted ? 'Unmute' : 'Mute'}>
          {audio.muted ? '🔇' : '🔊'}
        </button>
      </div>

      <div ref={hostRef} className="fr-stage" />
      <div className="fr-vignette" aria-hidden />
      <div className="fr-threat" aria-hidden style={{ opacity: playing ? Math.min(1, hud.threat * 1.25) : 0 }} />
      {hud.phase === 'playing' && (hud.speed > 95 || hud.hand > 0) ? <div className={`fr-speedwash${hud.hand > 0 ? ' is-surge' : ''}`} aria-hidden /> : null}

      {hud.phase === 'loading' ? (
        <div className="fr-loading" aria-live="polite">
          <span className="fr-loading__bar" />
          Lighting up the highway…
        </div>
      ) : null}

      <div className="fr-hud" aria-live="polite">
        <div className={`fr-board${hud.phase === 'intro' ? ' is-dim' : ''}`}>
          <div className="fr-cell">
            <span className="fr-cell__label">Stars</span>
            <span className="fr-cell__value">
              <i className="fr-staricon" aria-hidden>💫</i>
              {hud.keys}
            </span>
          </div>
          <div className="fr-cell fr-cell--center fr-cell--main">
            <span className="fr-cell__label">Distance</span>
            <span className="fr-cell__value">
              {hud.score.toLocaleString('en-US')}
              <small>m</small>
            </span>
          </div>
          <div className="fr-cell fr-cell--right">
            <span className="fr-cell__label">Time</span>
            <span className="fr-cell__value">
              {hud.timeS}
              <small>s</small>
            </span>
          </div>
        </div>

        <div className="fr-chips">
          {hud.combo >= 3 ? (
            <span className="fr-chip fr-chip--combo">Combo {hud.combo}</span>
          ) : null}
          {hud.target != null && playing ? (
            <span className={`fr-chip ${hud.score > hud.target ? 'fr-chip--beat' : 'fr-chip--target'}`}>
              {hud.score > hud.target ? 'Ahead' : `Target ${hud.target.toLocaleString('en-US')} m`}
            </span>
          ) : null}
        </div>

        <div className="fr-lives" aria-label={`${hud.lives} lives`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={`fr-life${i < hud.lives ? ' is-on' : ''}`} aria-hidden>
              ♥
            </span>
          ))}
        </div>

        <div className="fr-powers">
          {hud.hand > 0 ? (
            <span className="fr-power fr-power--hand" style={{ ['--p' as string]: hud.hand }}>
              <i aria-hidden>✦</i>Invincible · {Math.ceil(hud.hand * (POWER_TICKS.hand / FR_HZ))}s
            </span>
          ) : null}
        </div>

        {hud.callout ? (
          <p key={hud.callout.id} className={`fr-callout fr-callout--${hud.callout.tone}`}>
            {hud.callout.text}
          </p>
        ) : null}

        {hud.phase === 'intro' && !howto ? (
          <div className="fr-intro">
            <p className="fr-intro__title">Fifth Glide</p>
            <p className="fr-intro__tag">Outrun the dark energy.</p>
            <div className="fr-intro__controls">
              <span>
                <b>←→</b>Lanes
              </span>
              <span>
                <b>↑</b>Jump
              </span>
              <span>
                <b>↓</b>Slide
              </span>
            </div>
            <p className="fr-intro__go">Swipe to run</p>
            {hud.pb > 0 ? <p className="fr-intro__pb">Best {hud.pb.toLocaleString('en-US')}</p> : null}
          </div>
        ) : null}
        {hud.phase === 'paused' ? (
          <div className="fr-intro fr-intro--paused">
            <p className="fr-intro__title">Paused</p>
            <p className="fr-intro__go">Tap to keep moving</p>
          </div>
        ) : null}
      </div>


      {howto && !ended ? (
        <div className="fr-howto" role="dialog" aria-label="How to play Fifth Glide">
          <div className="fr-howto__card">
            <p className="fr-howto__eyebrow">How to play</p>
            <h2 className="fr-howto__title">Fifth Glide</h2>
            <section>
              <h3>Controls</h3>
              <ul className="fr-howto__controls">
                <li><b>←&nbsp;→</b>Swipe left / right to change lanes</li>
                <li><b>↑</b>Swipe up to jump barriers &amp; gaps</li>
                <li><b>↓</b>Swipe down to slide under beams</li>
              </ul>
            </section>
            <section>
              <h3>Rules</h3>
              <ul>
                <li><b>☁</b>Dark energy is chasing you. Stay ahead of it</li>
                <li><b>⚠</b>Hit an obstacle and you stumble: you slow down and it closes in. Stumble again before you pull away (about {Math.round((CHASE.hit - CHASE.catchAt) * CHASE.recoverS)} s of clean running) and it catches you</li>
                <li><b>{'♥'.repeat(START_LIVES)}</b>{START_LIVES} lives. Getting caught or falling into a gap costs one, then you respawn and keep running</li>
                <li><b>☠</b>Lose all {START_LIVES} and the run is over. It gets faster the farther you go</li>
              </ul>
            </section>
            <section>
              <h3>Scoring</h3>
              <ul>
                <li><b>m</b>Your score is your distance, 1 point per metre</li>
                <li><b>💫</b>Each shooting star adds +{STAR_M} m</li>
                <li><b className="fr-howto__logo">5D</b>Rare 5D logo: {Math.round(POWER_TICKS.hand / FR_HZ)} s invincible plus a {BOOST.mul}× speed surge. Nothing can catch you, you can’t fall, you blast through everything</li>
              </ul>
            </section>
            <button type="button" className="ffa-btn ffa-btn--primary fr-howto__start" onClick={startFromHowto} disabled={hud.phase === 'loading'}>
              {hud.phase === 'loading' ? 'Loading…' : 'START'}
            </button>
          </div>
        </div>
      ) : null}

      {ended && !(challenge && onRunResult) ? (
        <div className="fr-end">
          <p className="fr-end__eyebrow">{seeded ? (seeded.rivalHandle ? `Rematch vs ${seeded.rivalHandle}` : 'Set the bar') : 'Fifth Glide'}</p>
          <h2>{headline}</h2>
          <div className="fr-end__score">
            {ended.score.toLocaleString('en-US')}
            <small> m</small>
          </div>
          <div className="fr-end__stats">
            <span>
              <b>{ended.ranM.toLocaleString('en-US')}</b>m run
            </span>
            <span>
              <b>{ended.keys}</b>stars (+{ended.starM} m)
            </span>
            <span>
              <b>{Math.round(ended.durationS)}s</b>lasted
            </span>
          </div>
          <p className="fr-end__pb">
            Personal best <strong>{displayPb.toLocaleString('en-US')} m</strong>
            {boardLine ? (
              <>
                {' '}
                · <strong>{boardLine}</strong>
              </>
            ) : null}
          </p>
          {runState === 'saving' ? <p className="fr-end__note">Posting to the board…</p> : null}
          {runState === 'error' ? <p className="fr-end__note">Couldn’t post this run — check your connection.</p> : null}
          {challenge ? (
            <p className="fr-end__target">
              Target <strong>{challenge.targetScore} m</strong> · {challenge.creatorHandle}
            </p>
          ) : null}

          {shareChallenge?.url ? (
            <SharePanel
              game="fifth-run"
              handle={handle}
              score={shareChallenge.target_score}
              url={shareChallenge.url}
              rivalHandle={shareChallenge.opponent_handle}
              autoShareLabel={shareChallenge.opponent_handle ? 'Share link too' : 'Send challenge'}
            />
          ) : null}

          {run && (isGuest || renaming) ? (
            <HandlePrompt
              compact
              title={isGuest ? `Playing as ${handle}` : 'Change handle'}
              subtitle={isGuest ? 'Lock in a name for the board (optional)' : undefined}
              cta="Lock it in"
              onDone={() => setRenaming(false)}
            />
          ) : handle ? (
            <p className="fr-end__handle">
              Playing as <strong>{handle}</strong>{' '}
              <button type="button" className="soc-handle__skip" onClick={() => setRenaming(true)}>
                Edit
              </button>
            </p>
          ) : null}

          <div className="fr-end__actions">
            {canChallenge && !shareChallenge ? (
              <button type="button" className="ffa-btn ffa-btn--primary" onClick={() => void challengeFriend()} disabled={busyShare || !run}>
                {busyShare ? 'Building challenge…' : END_DOORS.fifthRun[0].label}
              </button>
            ) : null}
            {renderShare ? renderShare({ scoreId: run?.id ?? null, score: ended.score }) : <StoryShareButton scoreId={run?.id ?? null} score={ended.score} />}
            <button
              type="button"
              className={`ffa-btn ${canChallenge && !shareChallenge ? 'ffa-btn--secondary' : shareChallenge ? 'ffa-btn--ghost' : 'ffa-btn--primary'}`}
              onClick={runItBack}
            >
              {seeded ? 'Play a normal run' : COPY.RUN_IT_BACK}
            </button>
            {shareNote ? <p className="fr-end__note">{shareNote}</p> : null}
            <a
              className="ffa-btn ffa-btn--ghost ffa-btn--sm"
              href={recordStore}
              target="_blank"
              rel="noreferrer"
              onClick={() => track('arcade_end_record_store', { game: 'fifth-run' })}
            >
              {END_DOORS.fifthRun[1].label}
            </a>
            <Link to="/" className="ffa-btn ffa-btn--ghost ffa-btn--sm">
              Back to select
            </Link>
          </div>
        </div>
      ) : null}
      {ended && challenge && onRunResult ? (
        <div className="fr-end">
          <p className="fr-end__eyebrow">Fifth Glide</p>
          <h2>Final: {ended.score.toLocaleString('en-US')} m</h2>
          <p className="fr-end__pb">{runState === 'error' ? 'Couldn’t post — check your connection.' : 'Tallying the head-to-head…'}</p>
        </div>
      ) : null}
    </div>
  )
}
