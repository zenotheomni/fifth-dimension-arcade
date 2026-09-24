import { Canvas } from '@react-three/fiber'
import { Suspense, useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cabinets } from '../core/cabinetConfig'
import { track } from '../analytics'
import { useReducedMotion } from '../useReducedMotion'
import { LobbyScene } from './LobbyScene'

export default function LobbyCanvas() {
  const [index, setIndex] = useState(0)
  const [zooming, setZooming] = useState(false)
  const drag = useRef<{ x: number; active: boolean; moved: boolean }>({
    x: 0,
    active: false,
    moved: false,
  })
  const navigate = useNavigate()
  const reducedMotion = useReducedMotion()

  const goTo = useCallback((i: number) => {
    setIndex(Math.max(0, Math.min(cabinets.length - 1, i)))
  }, [])

  const enterCabinet = useCallback(
    (i: number) => {
      const cabinet = cabinets[i]
      if (!cabinet || cabinet.status !== 'lit' || !cabinet.route) return
      track('arcade_cabinet_tap', {
        cabinet: cabinet.id,
        status: cabinet.status,
      })
      setZooming(true)
      window.setTimeout(() => {
        navigate(cabinet.route!)
      }, reducedMotion ? 120 : 480)
    },
    [navigate, reducedMotion],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, active: true, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return
    const dx = e.clientX - drag.current.x
    if (Math.abs(dx) > 28) {
      drag.current.moved = true
      drag.current.x = e.clientX
      goTo(index + (dx < 0 ? 1 : -1))
      drag.current.active = false
    }
  }
  const onPointerUp = () => {
    drag.current.active = false
  }

  return (
    <div
      className="lobby3d-canvas-wrap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <Canvas
        dpr={[1, 1.75]}
        gl={{
          antialias: false,
          powerPreference: 'high-performance',
          alpha: false,
        }}
        camera={{ position: [0, 1.65, 6.1], fov: 38, near: 0.1, far: 40 }}
        style={{ touchAction: 'none' }}
      >
        <Suspense fallback={null}>
          <LobbyScene
            index={index}
            onSelectCabinet={(i) => {
              if (drag.current.moved) return
              if (i === index) enterCabinet(i)
              else goTo(i)
            }}
            reducedMotion={reducedMotion}
            zooming={zooming}
          />
        </Suspense>
      </Canvas>

      <div className="lobby3d-dots" aria-hidden>
        {cabinets.map((c, i) => (
          <button
            key={c.id}
            type="button"
            className={
              i === index ? 'lobby3d-dot lobby3d-dot--on' : 'lobby3d-dot'
            }
            aria-label={c.title}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
      <p className="lobby3d-swipe-hint">Swipe · tap lit cabinet</p>
    </div>
  )
}
