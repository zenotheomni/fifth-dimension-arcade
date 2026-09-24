import { lazy, Suspense, useEffect } from 'react'
import { track } from '../arcade/analytics'

const CourtVision3d = lazy(() => import('../arcade/courtVision3d/CourtVision3d'))

export default function CourtVisionPage() {
  useEffect(() => {
    track('arcade_court_vision_view')
  }, [])

  return (
    <div className="arcade-root arcade-root--game">
      <Suspense
        fallback={
          <div className="cv3d-overlay" style={{ position: 'fixed', inset: 0 }}>
            <p className="cv3d-overlay__copy">Loading Court Vision…</p>
          </div>
        }
      >
        <CourtVision3d />
      </Suspense>
    </div>
  )
}
