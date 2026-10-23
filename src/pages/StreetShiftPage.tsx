import { lazy, Suspense, useEffect } from 'react'
import { track } from '../arcade/analytics'

const StreetShift = lazy(() => import('../arcade/streetShift/StreetShift'))

function Loading() {
  return (
    <div className="arcade-root arcade-root--game" style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }}>
      <p style={{ fontFamily: 'Bungee, sans-serif', color: '#ffc83c', letterSpacing: '0.06em' }}>NOVA-SLIDE</p>
    </div>
  )
}

export default function StreetShiftPage() {
  useEffect(() => {
    track('arcade_street_shift_view')
  }, [])

  return (
    <div className="arcade-root arcade-root--game">
      <Suspense fallback={<Loading />}>
        <StreetShift />
      </Suspense>
    </div>
  )
}
