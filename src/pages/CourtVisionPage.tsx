import { lazy, Suspense, useEffect } from 'react'
import { track } from '../arcade/analytics'

const CourtVisionPhaser = lazy(
  () => import('../arcade/courtVisionPhaser/CourtVisionPhaser'),
)

export default function CourtVisionPage() {
  useEffect(() => {
    track('arcade_court_vision_view')
  }, [])

  return (
    <div className="arcade-root arcade-root--game">
      <Suspense
        fallback={
          <div
            style={{
              position: 'fixed',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              background: '#0a0a0c',
              color: '#ffc83c',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              fontSize: '0.8rem',
            }}
          >
            Loading Court Vision…
          </div>
        }
      >
        <CourtVisionPhaser />
      </Suspense>
    </div>
  )
}
