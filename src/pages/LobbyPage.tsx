import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { getOrCreatePlayerId } from '../arcade/core/identity'
import { track } from '../arcade/analytics'
import { COPY } from '../arcade/copyLocks'
import { useArcadeAudio } from '../arcade/audio/AudioProvider'
import '../arcade/lobby3d/lobby3d.css'

const LobbyCanvas = lazy(() => import('../arcade/lobby3d/LobbyCanvas'))

const DOCK_ITEMS = [
  { id: 'boutique', label: 'Boutique' },
  { id: 'record-store', label: 'Record Store' },
  { id: 'theater', label: 'Theater' },
] as const

const FRIEND_TEASER = { name: 'JENKS', score: 240 } as const

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
  const qrSrc = useMemo(() => {
    const data = encodeURIComponent(`${window.location.origin}/arcade`)
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${data}`
  }, [])

  useEffect(() => {
    getOrCreatePlayerId()
    track('arcade_lobby_view')
  }, [])

  useEffect(() => {
    if (isDesktop) track('arcade_desktop_qr_view')
  }, [isDesktop])

  return (
    <div className="lobby3d-root arcade-root">
      <div className="lobby3d-mobile">
        {!audio.entered ? (
          <button
            type="button"
            className="lobby3d-enter"
            onClick={() => {
              audio.enterFloor()
              track('arcade_enter_floor')
            }}
          >
            <p className="lobby3d-ticket">Fifth Dimension</p>
            <h1 className="lobby3d-enter__title">The Fifth Floor</h1>
            <p className="lobby3d-enter__copy">
              Night arcade. Tap in — music starts, cabinets light.
            </p>
            <span className="lobby3d-enter__cta">Enter the Fifth Floor</span>
            <p className="lobby3d-enter__whisper">{COPY.FLOW_STATE}</p>
          </button>
        ) : null}

        <Suspense
          fallback={
            <div className="lobby3d-enter" aria-busy>
              <p className="lobby3d-enter__copy">Loading the floor…</p>
            </div>
          }
        >
          <LobbyCanvas />
        </Suspense>

        <div className="lobby3d-overlay">
          <header className="lobby3d-ticket" aria-label="The Fifth Floor">
            The Fifth Floor
          </header>
          <p className="lobby3d-teaser">
            <strong>
              BEAT {FRIEND_TEASER.name}&apos;S {FRIEND_TEASER.score}
            </strong>
            <span> — {COPY.RUN_IT_BACK}</span>
          </p>
        </div>

        <button
          type="button"
          className="lobby3d-mute"
          aria-label={audio.muted ? 'Unmute music' : 'Mute music'}
          onClick={audio.toggleMute}
        >
          {audio.muted ? '🔇' : '🔊'}
        </button>

        <nav className="lobby3d-dock" aria-label="Floor destinations">
          {DOCK_ITEMS.map((item) => (
            <a
              key={item.id}
              href="#"
              className="lobby3d-dock__btn"
              onClick={(e) => {
                e.preventDefault()
                track('arcade_dock_tap', { dock: item.id })
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="lobby3d-desktop-gate">
        <p className="lobby3d-ticket">The Fifth Floor</p>
        <h1 className="lobby3d-desktop-gate__title">Open on your phone</h1>
        <p className="lobby3d-desktop-gate__copy">
          Night arcade lives best in your hand. Scan to step onto the floor.
        </p>
        <img
          className="lobby3d-desktop-gate__qr"
          src={qrSrc}
          width={220}
          height={220}
          alt="QR code linking to the arcade lobby"
        />
        <p className="lobby3d-desktop-gate__whisper">{COPY.FLOW_STATE}</p>
      </div>
    </div>
  )
}
