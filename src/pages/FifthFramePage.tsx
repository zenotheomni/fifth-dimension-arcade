import { lazy, Suspense, useEffect } from 'react'
import { track } from '../arcade/analytics'
import BrandLockup from '../arcade/brand/BrandLockup'

const FifthFrame = lazy(() => import('../arcade/fifthFrame/FifthFrame'))

const loading = (
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
    <div style={{ display: 'grid', justifyItems: 'center', gap: 18 }}>
      <BrandLockup size={120} />
      <span>Loading FIFTH FRAME…</span>
    </div>
  </div>
)

export default function FifthFramePage() {
  useEffect(() => {
    track('arcade_fifth_frame_view')
  }, [])

  return (
    <div className="arcade-root arcade-root--game">
      <Suspense fallback={loading}>
        <FifthFrame />
      </Suspense>
    </div>
  )
}
