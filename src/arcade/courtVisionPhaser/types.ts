export type CvMode = 'timed' | 'endless'

export type CvHudState = {
  score: number
  streak: number
  multiplier: number
  timeLeft: number | null
  phase: 'ready' | 'playing' | 'ended'
  callout: string | null
  lastPoints: number | null
  pb: number
  newPb: boolean
  mode: CvMode
}

export type CvBridge = {
  onHud: (state: CvHudState) => void
  onEnded: (final: { score: number; pb: number; newPb: boolean; mode: CvMode }) => void
  muted: boolean
}
