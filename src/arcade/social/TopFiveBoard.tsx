import { useEffect, useState } from 'react'
import { fetchBoard, type Board, type BoardWindow, type Contest } from '../core/arcadeApi'
import { getCachedPlayer, onPlayerChange } from '../core/session'
import './social.css'

/** Retro top-N board for any game that has an arcade_boards row (data-driven by game id). */
export default function TopFiveBoard({
  gameId,
  title,
  contest,
  win: controlledWin,
  onWinChange,
}: {
  gameId: string
  title: string
  /** Giveaway for this game (adds a Contest tab: best run per player inside the window). */
  contest?: Contest | null
  win?: BoardWindow
  onWinChange?: (w: BoardWindow) => void
}) {
  const [localWin, setLocalWin] = useState<BoardWindow>('alltime')
  const hasContest = Boolean(contest && contest.game_id === gameId)
  const requested = controlledWin ?? localWin
  const win: BoardWindow = requested === 'contest' && !hasContest ? 'alltime' : requested
  const setWin = (w: BoardWindow) => {
    setLocalWin(w)
    onWinChange?.(w)
  }
  const contestId = hasContest ? contest!.id : null
  const contestStatus = hasContest ? contest!.status : null
  const [board, setBoard] = useState<Board | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'none'>('loading')
  const [playerKey, setPlayerKey] = useState(() => getCachedPlayer()?.player_id ?? '')

  useEffect(() => onPlayerChange((p) => setPlayerKey(p?.player_id ?? '')), [])

  useEffect(() => {
    let cancelled = false
    setState((s) => (s === 'ready' ? s : 'loading'))
    void fetchBoard(gameId, win, contestId).then((r) => {
      if (cancelled) return
      if (r.ok) {
        setBoard(r.board)
        setState('ready')
      } else setState(r.error === 'unknown_game' ? 'none' : 'error')
    })
    return () => {
      cancelled = true
    }
  }, [gameId, win, playerKey, contestId, contestStatus])

  if (state === 'none') return null
  // Never show the previous window's rows under a newly selected tab.
  const fresh = Boolean(board && board.window === win && (win !== 'contest' || board.contest?.id === contestId))
  const shown = fresh ? board : null
  const loading = state === 'loading' || (state === 'ready' && !fresh)
  const size = board?.size ?? 5
  const rows = Array.from({ length: size }, (_, i) => shown?.entries[i] ?? null)
  const me = shown?.me
  const meOnBoard = Boolean(shown?.entries.some((e) => e.is_me))

  return (
    <section className={`soc-board${win === 'contest' ? ' is-contest' : ''}`} aria-label={`${title} top ${size}`} id="arcade-board">
      <header className="soc-board__head">
        <h3 className="soc-board__title">
          <span className="soc-board__top">Top {size}</span> {win === 'contest' ? 'Giveaway' : title}
        </h3>
        <div className={`soc-toggle${hasContest ? ' soc-toggle--3' : ''}`} role="tablist" aria-label="Board window">
          {(hasContest ? (['alltime', 'weekly', 'contest'] as const) : (['alltime', 'weekly'] as const)).map((w) => (
            <button
              key={w}
              type="button"
              role="tab"
              aria-selected={win === w}
              className={win === w ? 'is-on' : ''}
              onClick={() => setWin(w)}
            >
              {w === 'alltime' ? 'All-time' : w === 'weekly' ? 'Weekly' : 'Contest'}
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
              {e ? e.handle : loading ? '· · ·' : '— open —'}
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
      {state === 'ready' && shown && shown.entries.length === 0 ? (
        <p className="soc-board__me">
          {win === 'weekly'
            ? 'Fresh week — claim #1.'
            : win === 'contest'
              ? contestStatus === 'upcoming'
                ? 'Giveaway opens soon — runs count once it starts.'
                : contestStatus === 'live'
                  ? 'No entries yet — play to win.'
                  : 'No runs were posted in the window.'
              : 'Be the first on the board.'}
        </p>
      ) : null}
      {win === 'contest' && hasContest && state === 'ready' && shown && shown.entries.length > 0 ? (
        <p className="soc-board__foot">
          {contestStatus === 'live' ? 'Live · best run per player in the giveaway window' : contestStatus === 'upcoming' ? 'Opens soon' : 'Final standings'}
        </p>
      ) : null}
      {state === 'error' ? <p className="soc-board__me">Board offline — tap to retry later.</p> : null}
    </section>
  )
}
