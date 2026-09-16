import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cabinets, statusLabel } from '../arcade/core/cabinetConfig'
import { getOrCreatePlayerId } from '../arcade/core/identity'
import { track } from '../arcade/analytics'
import { COPY } from '../arcade/copyLocks'

const DOCK_ITEMS = [
  { id: 'boutique', label: 'Boutique' },
  { id: 'record-store', label: 'Record Store' },
  { id: 'theater', label: 'Theater' },
] as const

/** Placeholder friend challenge teaser — BEAT ___'S [score] */
const FRIEND_TEASER = {
  name: 'JENKS',
  score: 240,
} as const

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
  const qrSrc = useMemo(() => {
    const data = encodeURIComponent(`${window.location.origin}/arcade`)
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${data}`
  }, [])

  useEffect(() => {
    getOrCreatePlayerId()
    track('arcade_lobby_view')
  }, [])

  useEffect(() => {
    if (isDesktop) {
      track('arcade_desktop_qr_view')
    }
  }, [isDesktop])

  const firstLit = cabinets.find((c) => c.status === 'lit')

  return (
    <div className="arcade-root">
      <div className="arcade-glow arcade-glow--ink" aria-hidden />
      <div className="arcade-glow arcade-glow--signal" aria-hidden />
      <div className="arcade-glow arcade-glow--mint" aria-hidden />

      <div className="arcade-lobby-mobile">
        <div className="arcade-lobby">
          <header className="arcade-ticket" aria-label="The Fifth Floor">
            The Fifth Floor
          </header>

          <div className="arcade-cabinets" role="list">
            {cabinets.map((cabinet) => {
              const isLit = cabinet.status === 'lit' && cabinet.route
              const label = statusLabel(cabinet.status)
              const inner = (
                <>
                  <div className="arcade-cabinet__glass" aria-hidden />
                  {label ? (
                    <span className="arcade-cabinet__status">{label}</span>
                  ) : null}
                  {cabinet.badge ? (
                    <span className="arcade-cabinet__badge">{cabinet.badge}</span>
                  ) : null}
                  <h2 className="arcade-cabinet__title">{cabinet.title}</h2>
                  <p className="arcade-cabinet__tagline">{cabinet.tagline}</p>
                </>
              )

              if (isLit) {
                return (
                  <Link
                    key={cabinet.id}
                    to={cabinet.route!}
                    className="arcade-cabinet arcade-cabinet--lit"
                    role="listitem"
                    onClick={() =>
                      track('arcade_cabinet_tap', {
                        cabinet: cabinet.id,
                        status: cabinet.status,
                      })
                    }
                  >
                    {inner}
                  </Link>
                )
              }

              return (
                <div
                  key={cabinet.id}
                  className="arcade-cabinet arcade-cabinet--coming-up"
                  role="listitem"
                  aria-disabled="true"
                >
                  {inner}
                </div>
              )
            })}
          </div>

          {firstLit ? (
            <p className="arcade-teaser">
              <strong>
                BEAT {FRIEND_TEASER.name}&apos;S {FRIEND_TEASER.score}
              </strong>
              <span className="arcade-teaser__hint"> — {COPY.RUN_IT_BACK}</span>
            </p>
          ) : null}

          <nav className="arcade-dock" aria-label="Floor destinations">
            {DOCK_ITEMS.map((item) => (
              <a
                key={item.id}
                href="#"
                className="arcade-dock__btn"
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
      </div>

      <div className="arcade-desktop-gate">
        <p className="arcade-ticket">The Fifth Floor</p>
        <h1 className="arcade-desktop-gate__title">Open on your phone</h1>
        <p className="arcade-desktop-gate__copy">
          Night arcade lives best in your hand. Scan to step onto the floor.
        </p>
        <img
          className="arcade-desktop-gate__qr"
          src={qrSrc}
          width={220}
          height={220}
          alt="QR code linking to the arcade lobby"
        />
        <p className="arcade-desktop-gate__whisper">{COPY.FLOW_STATE}</p>
      </div>
    </div>
  )
}
