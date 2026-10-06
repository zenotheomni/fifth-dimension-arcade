import { useEffect, useRef, useState } from 'react'
import type { Contest } from '../core/arcadeApi'
import { countdown, shortWhen, useServerNow } from './contestTime'
import './social.css'

type Props = {
  contest: Contest
  serverNow: string
  playable: boolean
  onPlay: () => void
  onBoard: () => void
  /** Called once when a countdown crosses zero (start → live, end → winner reveal). */
  onBoundary: () => void
}

/** Menu banner for a giveaway: prize, live countdown, play CTA; flips to the winner once announced. */
export default function ContestBanner({ contest: c, serverNow, playable, onPlay, onBoard, onBoundary }: Props) {
  const now = useServerNow(serverNow)
  const [rulesOpen, setRulesOpen] = useState(false)
  const fired = useRef<string | null>(null)
  const startMs = Date.parse(c.starts_at)
  const endMs = Date.parse(c.ends_at)

  let status = c.status
  if (status === 'upcoming' && now >= startMs) status = 'live'
  if (status === 'live' && now >= endMs) status = 'ended'

  useEffect(() => {
    const key = `${c.id}:${status}`
    if (status !== c.status && fired.current !== key) {
      fired.current = key
      // Give the server a beat past the boundary before re-reading.
      const id = window.setTimeout(onBoundary, 1500)
      return () => window.clearTimeout(id)
    }
  }, [status, c.status, c.id, onBoundary])

  const top = c.winners[0]
  const mine = c.winners.find((w) => w.is_me)
  const announced = status === 'winners_announced'

  return (
    <section className={`soc-contest soc-contest--${status}`} aria-label={`Giveaway: ${c.title}`}>
      {c.prize_image_url ? <img className="soc-contest__img" src={c.prize_image_url} alt="" loading="lazy" /> : null}
      {c.is_test ? <span className="soc-contest__test">Test</span> : null}
      <div className="soc-contest__body">
        {announced ? null : (
        <div className="soc-contest__row">
          <span className="soc-contest__chip">
            {status === 'live' ? '● Live giveaway' : status === 'upcoming' ? 'Giveaway soon' : announced ? '★ Winner' : 'Giveaway ended'}
          </span>
          {status === 'live' || status === 'upcoming' ? (
            <span className="soc-contest__clock" aria-live="off">
              <small>{status === 'live' ? 'Ends in' : 'Starts in'}</small>
              {countdown((status === 'live' ? endMs : startMs) - now)}
            </span>
          ) : null}
        </div>
        )}
        {announced ? (
          top ? (
            <p className="soc-contest__winner">
              ★ Winner: <strong>{top.handle}</strong> <span>· {top.score.toLocaleString()}</span>
            </p>
          ) : (
            <p className="soc-contest__note">No runs were posted in the window — no winner this time.</p>
          )
        ) : null}
        <p className="soc-contest__prize">
          <span>{announced ? c.title : 'Prize'}</span> {c.prize_text}
        </p>
        {mine ? (
          <p className="soc-contest__you">{mine.place === 1 ? 'You won!' : `You placed #${mine.place}!`} Claim code is in your alerts.</p>
        ) : status === 'ended' ? (
          <p className="soc-contest__note">Tallying the board — winner revealed shortly.</p>
        ) : null}
        <div className="soc-contest__actions">
          {status === 'live' || status === 'upcoming' ? (
            <button type="button" className="soc-contest__play" onClick={onPlay} disabled={!playable}>
              {!playable ? 'Opens soon' : status === 'live' ? 'Play to win' : 'Warm up'}
            </button>
          ) : null}
          <button type="button" className="soc-contest__link" onClick={onBoard}>
            {announced || status === 'ended' ? 'Results' : 'Board'}
          </button>
          <button type="button" className="soc-contest__link" onClick={() => setRulesOpen(true)}>
            Rules
          </button>
        </div>
      </div>

      {rulesOpen ? (
        <div className="soc-sheet" role="dialog" aria-modal="true" aria-label="Giveaway rules">
          <button type="button" className="soc-sheet__scrim" aria-label="Close" onClick={() => setRulesOpen(false)} />
          <div className="soc-sheet__panel soc-contest__rules">
            <header className="soc-sheet__head">
              <h3>{c.title}</h3>
              <button type="button" className="soc-sheet__x" aria-label="Close" onClick={() => setRulesOpen(false)}>
                ✕
              </button>
            </header>
            <dl>
              <dt>Prize</dt>
              <dd>{c.prize_text}</dd>
              <dt>Game</dt>
              <dd>{c.game_title ?? c.game_id}</dd>
              <dt>Window</dt>
              <dd>
                {shortWhen(c.starts_at)} → {shortWhen(c.ends_at)}
              </dd>
              <dt>How it works</dt>
              <dd>
                Your best run inside the window counts. {c.winner_count > 1 ? `Top ${c.winner_count} players win.` : 'Highest score wins.'}
              </dd>
              {c.rules_text ? (
                <>
                  <dt>Rules</dt>
                  <dd className="soc-contest__pre">{c.rules_text}</dd>
                </>
              ) : null}
              <dt>Claiming</dt>
              <dd>{c.how_to_claim || 'Winners get an in-app alert with a claim code — screenshot it and DM Fifth Dimension.'}</dd>
            </dl>
          </div>
        </div>
      ) : null}
    </section>
  )
}
