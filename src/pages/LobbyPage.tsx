import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  type TickerScore,
} from '../arcade/games/registry'
import { fetchGames, fetchLeaderboard } from '../arcade/leaderboard/api'
import {
  playCoinInsert,
  playSelect,
  playUiConfirm,
  unlockAudio,
} from '../arcade/courtVision/sfx'
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
  const [tickerScores, setTickerScores] = useState<TickerScore[] | null>(null)


  const qrSrc = useMemo(() => {
    const data = encodeURIComponent(`${window.location.origin}/arcade`)
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${data}`
  }, [])

  const game = games[selected] ?? games[0] ?? GAMES[0]

  useEffect(() => {
    getOrCreatePlayerId()
    track('arcade_lobby_view')
    let cancelled = false
    void (async () => {
      try {
        const [lb, remoteGames] = await Promise.all([
          fetchLeaderboard({
            game: 'court-vision',
            window: 'weekly',
            limit: 10,
          }).catch(() => null),
          fetchGames().catch(() => null),
        ])
        if (cancelled) return
        if (remoteGames) {
          setGames(mergeGamesWithApi(GAMES, remoteGames))
        }
        if (lb?.entries?.length) {
          setTickerScores(
            lb.entries.map((e) => ({
              name: e.handle.toUpperCase(),
              game: 'Court Vision',
              score: e.score,
            })),
          )
        } else {
          setTickerScores([])
        }
      } catch {
        if (!cancelled) setTickerScores([])
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
    playSelect()
    track('arcade_game_focus', { game: g.id })
  }

  const onPlay = () => {
    if (!game.route) return
    playUiConfirm()
    track('arcade_game_launch', { game: game.id })
    navigate(game.route)
  }

  const lbReady = tickerScores !== null
  const hasScores = (tickerScores?.length ?? 0) > 0
  const tickerText = !lbReady
    ? 'Loading weekly board…'
    : hasScores
      ? (tickerScores ?? [])
          .map((s) => `${s.name} · ${s.game} · ${s.score}`)
          .join('   ◆   ')
      : 'Be the first on the board'

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
              <img src={`${BASE}art/emblem-160.webp`} alt="" />
              <p>Fifth Dimension presents</p>
            </div>

            <div className="ffa-title__brand">
              <img
                className="ffa-title__emblem"
                src={`${BASE}art/emblem-160.webp`}
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
          <div className="ffa-select">
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
              aria-label="Weekly Court Vision leaderboard"
            >
              <div className="ffa-ticker__track">
                <span className="ffa-ticker__label">
                  {hasScores ? 'WEEKLY · COURT VISION' : 'WEEKLY BOARD'}
                </span>
                {tickerText}
                {'   ◆   '}
                <span className="ffa-ticker__label">
                  {hasScores ? 'WEEKLY · COURT VISION' : 'WEEKLY BOARD'}
                </span>
                {tickerText}
              </div>
            </div>

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
                      {g.contest ? (
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
              className="ffa-select__play"
              disabled={!game.route}
              onClick={onPlay}
            >
              {game.route ? `Play ${game.title}` : 'Coming Up'}
            </button>

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
