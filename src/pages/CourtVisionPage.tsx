import { useEffect } from 'react'
import { track } from '../arcade/analytics'
import CourtVisionEndless from '../arcade/courtVision/CourtVisionEndless'

export default function CourtVisionPage() {
  useEffect(() => {
    track('arcade_court_vision_view')
  }, [])

  return (
    <div className="arcade-root arcade-root--game">
      <CourtVisionEndless />
    </div>
  )
}
