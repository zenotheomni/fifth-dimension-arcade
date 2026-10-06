import { useEffect, useState } from 'react'
import { fetchBoard, type Board, type BoardWindow } from '../core/arcadeApi'
import { getCachedPlayer, onPlayerChange } from '../core/session'
import './social.css'

/** Retro top-N board for any game that has an arcade_boards row (data-driven by game id). */
export default function TopFiveBoard({ gameId, title }: { gameId: string; title: string }) {
  const [win, setWin] = useState<BoardWindow>('alltime')
  const [board, setBoard] = useState<Board | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'none'>('loading')
  const [playerKey, setPlayerKey] = useState(() => getCachedPlayer()?.player_id ?? '')

  useEffect(() => onPlayerChange((p) => setPlayerKey(p?.player_id ?? '')), [])

  useEffect(() => {
    let cancelled = false
    setState((s) => (s === 'ready' ? s : 'loading'))
    void fetchBoard(gameId, win).then((r) => {
      if (cancelled) return
      if (r.ok) {
        setBoard(r.board)
        setState('ready')
      } else setState(r.error === 'unknown_game' ? 'none' : 'error')
    })
    return () => {
      cancelled = true
    }
  }, [gameId, win, playerKey])

  if (state === 'none') return null
  const size = board?.size ?? 5
  const rows = Array.from({ length: size }, (_, i) => board?.entries[i] ?? null)
  const me = board?.me
  const meOnBoard = Boolean(board?.entries.some((e) => e.is_me))

  return (
    <section className="soc-board" aria-label={`${title} top ${size}`}>
      <header className="soc-board__head">
        <h3 className="soc-board__title">
          <span className="soc-board__top">Top {size}</span> {title}
        </h3>
        <div className="soc-toggle" role="tablist" aria-label="Board window">
          {(['alltime', 'weekly'] as const).map((w) => (
            <button
              key={w}
              type="button"
              role="tab"
              aria-selected={win === w}
              className={win === w ? 'is-on' : ''}
              onClick={() => setWin(w)}
            >
              {w === 'alltime' ? 'All-time' : 'Weekly'}
            </button>
          ))}
        </div>
      </header>
      <ol className="soc-board__list">
        {rows.map((e, i) => (
          <li
            key={e ? e.player_id : `empty-${i}`}
            className={`soc-board__row soc-board__row--r${i + 1}${e?.is_me ? ' is-me' : ''}${e ? '' : ' is-empty'}`}
          >
            <span className="soc-board__rank">{String(i + 1).padStart(2, '0')}</span>
            <span className="soc-board__handle">
              {e ? e.handle : state === 'loading' ? '· · ·' : '— open —'}
              {e?.is_me ? <em className="soc-board__you">you</em> : null}
            </span>
            <span className="soc-board__score">{e ? e.score.toLocaleString() : ''}</span>
          </li>
        ))}
      </ol>
      {me && !meOnBoard ? (
        <p className="soc-board__me">
          You: <strong>#{me.rank}</strong> · {me.score.toLocaleString()}
        </p>
      ) : null}
      {state === 'ready' && board && board.entries.length === 0 ? (
        <p className="soc-board__me">{win === 'weekly' ? 'Fresh week — claim #1.' : 'Be the first on the board.'}</p>
      ) : null}
      {state === 'error' ? <p className="soc-board__me">Board offline — tap to retry later.</p> : null}
    </section>
  )
}
