export const COPY = {
  FLOW_STATE: 'Flow state.',
  FIFTH_STATE_UNLOCKED: 'Fifth State unlocked.',
  RUN_IT_BACK: 'Run it back.',
  ALMOST_REARRANGE: 'Almost. Rearrange. Run it back.',
} as const

export type CopyLock = (typeof COPY)[keyof typeof COPY]

export const COURT_VISION_COPY = {
  FIRST_MAKE: "You're in.",
  STREAK_X5: COPY.FLOW_STATE,
  STREAK_X10: 'Nothing in the way.',
  NEW_PB: COPY.FIFTH_STATE_UNLOCKED,
  LOST_CHALLENGE: COPY.ALMOST_REARRANGE,
  WON_CHALLENGE: 'You shifted the scoreboard.',
} as const

export const FIFTH_RUN_COPY = {
  START: "Fifth gear. You're already rolling.",
  FIRST_KEY: 'Star acquired.',
  MULTIPLIER_X2: COPY.FLOW_STATE,
  NEW_PB: COPY.FIFTH_STATE_UNLOCKED,
  CRASH: 'Crash. Rearrange. Drive it back.',
  BEAT_FRIEND: 'You outdrove their reality.',
  HAND: 'Invisible · 15s',
} as const
