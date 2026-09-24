/** Layout fractions for baked straight-on court-bg (gen-court-straight-hoop). */
export const COURT_BG = {
  hoopX: 0.5,
  /** Rim opening center */
  hoopY: 0.2861,
  backboardTop: 0.1194,
  /** Glass bottom just above rim */
  backboardBottom: 0.2736,
  floorSplit: 0.55,
  wordmarkX: 0.5,
  wordmarkY: 0.168,
  /** Shooter square top */
  squareTop: 0.2111,
} as const

/** Overlay sprite sizes tuned to baked rim (~97px wide at 390). */
export const HOOP_OVERLAY = {
  rimWidthPx: 97,
  netW: 104,
  netH: 120,
  netOffsetY: 4,
  rimFrontW: 104,
  rimFrontH: 24,
} as const
