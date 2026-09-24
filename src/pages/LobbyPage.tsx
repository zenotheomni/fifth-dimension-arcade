import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getOrCreatePlayerId } from '../arcade/core/identity'
import { track } from '../arcade/analytics'
import { COPY } from '../arcade/copyLocks'
import { useArcadeAudio } from '../arcade/audio/AudioProvider'
import {
  DOCK_LINKS,
  GAMES,
  SAMPLE_TOP_SCORES,
  statusLabel,
  type ArcadeGame,
} from '../arcade/games/registry'
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

export default function LobbyPage() {
  const isDesktop = useIsDesktop()
  const audio = useArcadeAudio()
  const navigate = useNavigate()
  const [exiting, setExiting] = useState(false)
  const [selected, setSelected] = useState(0)

  const qrSrc = useMemo(() => {
    const data = encodeURIComponent(`${window.location.origin}/arcade`)
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${data}`
  }, [])

  const game = GAMES[selected] ?? GAMES[0]

  useEffect(() => {
    getOrCreatePlayerId()
    track('arcade_lobby_view')
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

  const tickerText = SAMPLE_TOP_SCORES.map(
    (s) =>
      `${s.sample ? '[SAMPLE] ' : ''}${s.name} · ${s.game} · ${s.score}`,
  ).join('   ◆   ')

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
            <div
              className="ffa-title__bg"
              style={{ backgroundImage: `url(${BASE}art/title-hero.webp)` }}
            />
            <div className="ffa-title__stars" aria-hidden>
              <img
                className="ffa-title__star"
                src={`${BASE}art/star-192.webp`}
                alt=""
                style={{ top: '12%', right: '8%', animationDelay: '0s' }}
              />
              <img
                className="ffa-title__star"
                src={`${BASE}art/star-96.webp`}
                alt=""
                style={{ top: '22%', right: '28%', animationDelay: '2.2s', width: 48 }}
              />
              <img
                className="ffa-title__star"
                src={`${BASE}art/star-96.webp`}
                alt=""
                style={{ top: '8%', right: '45%', animationDelay: '4.1s', width: 40 }}
              />
            </div>
            <div className="ffa-title__vignette" />
            <div className="ffa-title__chevrons" aria-hidden />

            <div className="ffa-title__sting" aria-hidden>
              <img src={`${BASE}art/emblem-256.webp`} alt="" />
              <p>Fifth Dimension presents</p>
            </div>

            <h1 className="visually-hidden">Fifth Floor Arcade</h1>
            <p className="ffa-title__cta">▶▶ Tap to Start ◀◀</p>
            <p className="ffa-title__whisper">{COPY.FLOW_STATE}</p>
          </button>
        ) : (
          <div className="ffa-select">
            <header className="ffa-select__header">
              <img
                className="ffa-select__wordmark"
                src={`${BASE}art/wordmark-320.webp`}
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

            <div className="ffa-ticker" aria-label="Top scores sample ticker">
              <div className="ffa-ticker__track">
                <span className="ffa-ticker__sample">SAMPLE SCORES</span>
                {tickerText}
                {'   ◆   '}
                <span className="ffa-ticker__sample">SAMPLE SCORES</span>
                {tickerText}
              </div>
            </div>

            <div className="ffa-cards" role="listbox" aria-label="Games">
              {GAMES.map((g, i) => {
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
        <img src={`${BASE}art/emblem-256.webp`} alt="" width={96} height={96} />
        <p style={{ letterSpacing: '0.28em', textTransform: 'uppercase', color: '#ffc83c' }}>
          Fifth Floor Arcade
        </p>
        <h1 style={{ margin: 0, fontSize: '1.6rem' }}>Open on your phone</h1>
        <p style={{ maxWidth: 360, color: 'rgba(242,240,234,0.7)' }}>
          The arcade is built for touch — flick shots, juiced pixels, Miami dusk.
          Scan to step onto the Fifth Floor.
        </p>
        <img src={qrSrc} width={200} height={200} alt="QR code to the arcade" />
        <p style={{ letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.6 }}>
          {COPY.FLOW_STATE}
        </p>
      </div>
    </div>
  )
}
