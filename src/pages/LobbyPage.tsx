import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getOrCreatePlayerId } from '../arcade/core/identity'
import { track } from '../arcade/analytics'
import { COPY } from '../arcade/copyLocks'
import { useArcadeAudio } from '../arcade/audio/AudioProvider'
import {
  DOCK_LINKS,
  GAMES,
  mergeGamesWithApi,
  statusLabel,
  type ArcadeGame,
} from '../arcade/games/registry'
import { fetchGames } from '../arcade/leaderboard/api'
import { fetchContests, fetchTicker, type BoardWindow, type Contest, type TickerData } from '../arcade/core/arcadeApi'
import ContestBanner from '../arcade/social/ContestBanner'
import { countdown } from '../arcade/social/contestTime'
import {
  playCoinInsert,
  playSelect,
  playUiConfirm,
  unlockAudio,
} from '../arcade/courtVision/sfx'
import TopFiveBoard from '../arcade/social/TopFiveBoard'
import RivalsSheet from '../arcade/social/RivalsSheet'
import { useAlertStore } from '../arcade/social/alertStore'
import '../arcade/lobby/lobby.css'

const BASE = import.meta.env.BASE_URL

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(min-width: 768px)').matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = () => setIsDesktop(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isDesktop
}

type TickerSeg = { label: string; text: string }

/** Ticker = best run per player (weekly top 5, all-time if the week is empty) + the giveaway, if any. */
function buildTicker(t: TickerData | null): TickerSeg[] {
  if (!t) return []
  const segs: TickerSeg[] = []
  const c = t.contest
  if (c) {
    const now = Date.parse(t.server_now) || Date.now()
    const leaders = c.leaders.map((l) => `#${l.rank} ${l.handle.toUpperCase()} ${l.score.toLocaleString()}`).join(' · ')
    if (c.status === 'live') {
      segs.push({
        label: '★ LIVE GIVEAWAY',
        text: `${c.title} · Prize: ${c.prize_text} · ends in ${countdown(Date.parse(c.ends_at) - now).replace(/:\d\d$/, '')}${leaders ? ` · ${leaders}` : ' · no entries yet — play to win'}`,
      })
    } else if (c.status === 'upcoming') {
      segs.push({ label: '★ GIVEAWAY SOON', text: `${c.title} · Prize: ${c.prize_text} · starts in ${countdown(Date.parse(c.starts_at) - now).replace(/:\d\d$/, '')}` })
    } else if (c.status === 'winners_announced' && c.winners[0]) {
      segs.push({ label: '★ GIVEAWAY WINNER', text: `${c.winners[0].handle.toUpperCase()} · ${c.winners[0].score.toLocaleString()} · ${c.title}` })
    } else if (c.status === 'ended') {
      segs.push({ label: '★ GIVEAWAY ENDED', text: `${c.title} · winner revealed soon${leaders ? ` · ${leaders}` : ''}` })
    }
  }
  for (const b of t.boards) {
    const weekly = b.weekly.length > 0
    const rows = weekly ? b.weekly : b.alltime
    if (!rows.length) continue
    segs.push({
      label: `${weekly ? 'WEEKLY' : 'ALL-TIME'} · ${b.game_title.toUpperCase()}`,
      text: rows.map((r) => `#${r.rank} ${r.handle.toUpperCase()} ${r.score.toLocaleString()}`).join(' · '),
    })
  }
  return segs
}

const TWINKLES = [
  { top: '8%', left: '12%', delay: '0s' },
  { top: '14%', left: '72%', delay: '0.4s' },
  { top: '22%', left: '40%', delay: '1.1s' },
  { top: '18%', left: '88%', delay: '1.7s' },
  { top: '6%', left: '55%', delay: '0.8s' },
]

export default function LobbyPage() {
  const isDesktop = useIsDesktop()
  const audio = useArcadeAudio()
  const navigate = useNavigate()
  const [exiting, setExiting] = useState(false)
  const [selected, setSelected] = useState(0)
  const [games, setGames] = useState<ArcadeGame[]>(GAMES)
  const [ticker, setTicker] = useState<TickerData | null | undefined>(undefined)
  const [contests, setContests] = useState<{ list: Contest[]; serverNow: string }>({ list: [], serverNow: '' })
  const [boardWin, setBoardWin] = useState<BoardWindow>('alltime')
  const boardFocus = useRef(false)
  const [params, setParams] = useSearchParams()
  const [rivalsOpen, setRivalsOpen] = useState(() => params.get('rivals') === '1')
  const { unread } = useAlertStore()


  const qrSrc = useMemo(() => {
    const data = encodeURIComponent(`${window.location.origin}/arcade`)
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${data}`
  }, [])

  const game = games[selected] ?? games[0] ?? GAMES[0]
  const contest = contests.list[0] ?? null
  const contestFor = (gameId: string) => contests.list.find((c) => c.game_id === gameId) ?? null

  const loadContests = useCallback(async () => {
    const [r, t] = await Promise.all([fetchContests(), fetchTicker()])
    if (r.ok) setContests({ list: r.contests, serverNow: r.server_now })
    setTicker(t.ok ? t : null)
  }, [])

  useEffect(() => {
    void loadContests()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadContests()
    }, 120_000)
    return () => window.clearInterval(id)
  }, [loadContests])

  const showContestBoard = useCallback(
    (c: Contest) => {
      const idx = games.findIndex((g) => g.id === c.game_id)
      if (idx >= 0) setSelected(idx)
      setBoardWin('contest')
      boardFocus.current = true
    },
    [games],
  )

  // Deep link from a "You won" alert / shared link: /arcade/?contest=<id>
  const contestParam = params.get('contest')
  useEffect(() => {
    if (!contestParam || !audio.entered || !contests.serverNow) return
    const c = contests.list.find((x) => x.id === contestParam)
    if (c) showContestBoard(c)
    const next = new URLSearchParams(params)
    next.delete('contest')
    setParams(next, { replace: true })
  }, [contestParam, audio.entered, contests, params, setParams, showContestBoard])

  useEffect(() => {
    if (!boardFocus.current || !audio.entered) return
    boardFocus.current = false
    window.setTimeout(() => document.getElementById('arcade-board')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
  })

  useEffect(() => {
    getOrCreatePlayerId()
    track('arcade_lobby_view')
    let cancelled = false
    void (async () => {
      try {
        const remoteGames = await fetchGames().catch(() => null)
        if (cancelled) return
        if (remoteGames) {
          setGames(mergeGamesWithApi(GAMES, remoteGames))
        }
      } catch {
        /* keep the static registry */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (isDesktop) track('arcade_desktop_qr_view')
  }, [isDesktop])

  const onTapToStart = () => {
    if (exiting || audio.entered) return
    unlockAudio()
    playCoinInsert()
    audio.enterFloor()
    track('arcade_enter_floor')
    setExiting(true)
    window.setTimeout(() => setExiting(false), 600)
  }

  const onSelectCard = (index: number, g: ArcadeGame) => {
    setSelected(index)
    if (g.id !== game.id) setBoardWin(contestFor(g.id) && boardWin === 'contest' ? 'contest' : 'alltime')
    playSelect()
    track('arcade_game_focus', { game: g.id })
  }

  const onPlay = () => {
    if (!game.route) return
    playUiConfirm()
    track('arcade_game_launch', { game: game.id })
    navigate(game.route)
  }

  const lbReady = ticker !== undefined
  const segs = buildTicker(ticker ?? null)
  const hasScores = segs.length > 0
  const tickerSegs: TickerSeg[] = !lbReady
    ? [{ label: 'LEADERBOARD', text: 'Loading the board…' }]
    : hasScores
      ? segs
      : [{ label: 'LEADERBOARD', text: 'Be the first on the board' }]
  const tickerChars = tickerSegs.reduce((n, x) => n + x.label.length + x.text.length + 8, 0)
  const tickerDuration = `${Math.max(28, Math.round(tickerChars * 0.22))}s`
  const renderTicker = (copy: number) =>
    tickerSegs.map((x, i) => (
      <span key={`${copy}-${i}`}>
        <span className="ffa-ticker__label">{x.label}</span>
        {x.text}
        {'   ◆   '}
      </span>
    ))

  return (
    <div className="ffa-root arcade-root">
      <div className="ffa-mobile">
        {!audio.entered ? (
          <button
            type="button"
            className={`ffa-title${exiting ? ' is-exiting' : ''}`}
            onClick={onTapToStart}
            aria-label="Tap to start Fifth Floor Arcade"
          >
            <div className="ffa-title__bg-wrap">
              <div
                className="ffa-title__bg ffa-pixel"
                style={{ backgroundImage: `url(${BASE}art/title-bg.webp)` }}
              />
              <div className="ffa-title__stars" aria-hidden>
                {TWINKLES.map((t, i) => (
                  <span
                    key={i}
                    className="ffa-title__twinkle"
                    style={{ top: t.top, left: t.left, animationDelay: t.delay }}
                  />
                ))}
                <img
                  className="ffa-title__star"
                  src={`${BASE}art/star-192.webp`}
                  alt=""
                  style={{ top: '10%', right: '4%', animationDelay: '0s' }}
                />
                <img
                  className="ffa-title__star"
                  src={`${BASE}art/star-96.webp`}
                  alt=""
                  style={{
                    top: '20%',
                    right: '30%',
                    animationDelay: '2.6s',
                    width: 44,
                  }}
                />
                <img
                  className="ffa-title__star"
                  src={`${BASE}art/star-96.webp`}
                  alt=""
                  style={{
                    top: '6%',
                    right: '52%',
                    animationDelay: '5s',
                    width: 36,
                  }}
                />
              </div>
              <div className="ffa-title__scan" aria-hidden />
              <div className="ffa-title__vignette" />
            </div>

            <div className="ffa-title__sting" aria-hidden>
              <img src={`${BASE}art/5d-logo-color.png`} alt="" />
              <p>Fifth Dimension presents</p>
            </div>

            <div className="ffa-title__brand">
              <img
                className="ffa-title__emblem"
                src={`${BASE}art/5d-logo-color.png`}
                alt=""
              />
              <div className="ffa-logo" aria-hidden={false}>
                <span className="ffa-logo__shine" aria-hidden />
                <h1 className="visually-hidden">Fifth Floor Arcade</h1>
                <p className="ffa-logo__line">Fifth Floor</p>
                <p className="ffa-logo__line ffa-logo__line--arcade">Arcade</p>
              </div>
              <p className="ffa-title__tag">Music · Games · Nostalgia</p>
            </div>

            <p className="ffa-title__cta">▶▶ Tap to Start ◀◀</p>
            <img
              className="ffa-title__wordmark"
              src={`${BASE}art/wordmark-280.webp`}
              alt="Fifth Dimension"
            />
          </button>
        ) : (
          <div className={`ffa-select ffa-select--social${contest ? ' has-contest' : ''}`}>
            <header className="ffa-select__header">
              <img
                className="ffa-select__wordmark"
                src={`${BASE}art/wordmark-280.webp`}
                alt="Fifth Dimension"
              />
              <h2 className="ffa-select__heading">Select Game</h2>
              <button
                type="button"
                className="ffa-mute"
                aria-label={audio.muted ? 'Unmute music' : 'Mute music'}
                onClick={audio.toggleMute}
              >
                {audio.muted ? '🔇' : '🔊'}
              </button>
            </header>

            <div
              className={`ffa-ticker${lbReady && !hasScores ? ' is-empty' : ''}`}
              aria-label="Leaderboard ticker"
            >
              <div className="ffa-ticker__track" style={{ animationDuration: tickerDuration }}>
                {renderTicker(0)}
                {renderTicker(1)}
              </div>
            </div>

            {contest ? (
              <ContestBanner
                contest={contest}
                serverNow={contests.serverNow}
                playable={Boolean(games.find((g) => g.id === contest.game_id)?.route)}
                onPlay={() => {
                  const g = games.find((x) => x.id === contest.game_id)
                  if (!g?.route) return
                  playUiConfirm()
                  track('arcade_contest_play', { game: g.id })
                  navigate(g.route)
                }}
                onBoard={() => {
                  playSelect()
                  track('arcade_contest_board')
                  showContestBoard(contest)
                }}
                onBoundary={() => void loadContests()}
              />
            ) : null}

            <div className="ffa-cards" role="listbox" aria-label="Games">
              {games.map((g, i) => {
                const locked = !g.route
                const badgeClass =
                  g.status === 'live'
                    ? 'ffa-card__badge ffa-card__badge--live'
                    : g.status === 'coming-soon'
                      ? 'ffa-card__badge ffa-card__badge--soon'
                      : 'ffa-card__badge'
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="option"
                    aria-selected={i === selected}
                    className={`ffa-card${i === selected ? ' is-active' : ''}${locked ? ' is-locked' : ''}`}
                    style={{ ['--card-accent' as string]: g.accent }}
                    onClick={() => onSelectCard(i, g)}
                  >
                    <img
                      className="ffa-card__art"
                      src={g.boxArt}
                      alt=""
                      draggable={false}
                    />
                    <span className={badgeClass}>{statusLabel(g.status)}</span>
                    <div className="ffa-card__meta">
                      <h3 className="ffa-card__title">{g.title}</h3>
                      <p className="ffa-card__tag">{g.tagline}</p>
                      {contestFor(g.id) ? (
                        <p className="ffa-card__contest">
                          {contestFor(g.id)!.status === 'live'
                            ? 'Giveaway live now'
                            : contestFor(g.id)!.status === 'upcoming'
                              ? 'Giveaway soon'
                              : contestFor(g.id)!.status === 'ended'
                                ? 'Giveaway ended'
                                : 'See the winner'}
                        </p>
                      ) : g.contest ? (
                        <p className="ffa-card__contest">{g.contest.label}</p>
                      ) : null}
                    </div>
                  </button>
                )
              })}
            </div>

            <p className="ffa-select__hint">Swipe · tap a cabinet · press play</p>
            <button
              type="button"
              className="ffa-btn ffa-btn--primary ffa-select__play"
              disabled={!game.route}
              onClick={onPlay}
            >
              {game.route ? `Play ${game.title}` : 'Coming Up'}
            </button>

            {game.id === 'court-vision' || game.id === 'fifth-run' ? (
              <div className="soc-actions">
                <button
                  type="button"
                  className="ffa-btn ffa-btn--secondary"
                  onClick={() => {
                    playUiConfirm()
                    track('arcade_menu_challenge', { game: game.id })
                    navigate(`${game.route}?setbar=1`)
                  }}
                >
                  Challenge a friend
                </button>
                <span className="soc-badge-wrap">
                  <button
                    type="button"
                    className="ffa-btn ffa-btn--ghost"
                    onClick={() => {
                      playSelect()
                      setRivalsOpen(true)
                    }}
                  >
                    Rivals
                  </button>
                  {unread > 0 ? (
                    <span className="soc-badge" aria-label={`${unread} new`}>
                      {unread > 9 ? '9+' : unread}
                    </span>
                  ) : null}
                </span>
              </div>
            ) : null}

            {game.route ? (
              <TopFiveBoard
                key={game.id}
                gameId={game.id}
                title={game.title}
                contest={contestFor(game.id)}
                win={boardWin}
                onWinChange={setBoardWin}
              />
            ) : null}

            {rivalsOpen ? (
              <RivalsSheet
                gameId={game.id === 'fifth-run' ? 'fifth-run' : 'court-vision'}
                onClose={() => {
                  setRivalsOpen(false)
                  if (params.get('rivals')) setParams({}, { replace: true })
                }}
              />
            ) : null}

            <nav className="ffa-dock" aria-label="Fifth Dimension destinations">
              {DOCK_LINKS.map((item) => (
                <a
                  key={item.id}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => track('arcade_dock_tap', { dock: item.id })}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        )}
      </div>

      <div className="ffa-desktop">
        <img
          className="emblem"
          src={`${BASE}art/emblem-160.webp`}
          alt=""
          width={96}
          height={96}
        />
        <p
          style={{
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: '#ffc83c',
            fontFamily: 'Bungee, sans-serif',
          }}
        >
          Fifth Floor Arcade
        </p>
        <h1 style={{ margin: 0, fontSize: '1.6rem' }}>Open on your phone</h1>
        <p style={{ maxWidth: 360, color: 'rgba(242,240,234,0.7)' }}>
          Built for touch — flick shots, juiced pixels, Miami dusk. Scan to step
          onto the Fifth Floor.
        </p>
        <img className="qr" src={qrSrc} width={200} height={200} alt="QR code to the arcade" />
        <p
          style={{
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            opacity: 0.6,
          }}
        >
          {COPY.FLOW_STATE}
        </p>
      </div>
    </div>
  )
}
