export type CvMode = 'timed' | 'endless' | 'challenge'

export type CvChallengeConfig = {
  id: string
  targetScore: number
  seed: string
  creatorHandle: string
}

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

export type CvEndPayload = {
  score: number
  pb: number
  newPb: boolean
  mode: CvMode
  beatChallenge: boolean | null
}

export type CvBridge = {
  onHud: (state: CvHudState) => void
  onEnded: (final: CvEndPayload) => void
  muted: boolean
  challenge?: CvChallengeConfig | null
}
