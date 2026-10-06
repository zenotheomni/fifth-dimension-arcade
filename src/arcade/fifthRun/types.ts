export type FrMode = 'endless' | 'challenge'

export type FrChallengeConfig = {
  id: string
  targetScore: number
  seed: string
  creatorHandle: string
  /** Seeded run that creates a new challenge (no target yet). */
  setTheBar?: boolean
}

export type FrPhase = 'loading' | 'intro' | 'playing' | 'paused' | 'crashed' | 'ended'

export type FrHudState = {
  phase: FrPhase
  score: number
  distance: number
  keys: number
  combo: number
  mult: number
  callout: { text: string; id: number; tone: 'gold' | 'teal' | 'coral' } | null
  pb: number
  newPb: boolean
  /** 0..1 remaining */
  magnet: number
  five: number
  shield: boolean
  speed: number
  target: number | null
}

export type FrEndPayload = {
  score: number
  distance: number
  keys: number
  maxCombo: number
  durationS: number
  deathKind: string | null
  pb: number
  newPb: boolean
  mode: FrMode
  beatChallenge: boolean | null
  seed: string
}

export type FrBridge = {
  onHud: (s: FrHudState) => void
  onEnded: (e: FrEndPayload) => void
  muted: boolean
  seed: string
  challenge?: FrChallengeConfig | null
}
