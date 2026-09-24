/** Layout fractions for straight-on court-bg + sprite hoop (centered). */
export const COURT_BG = {
  hoopX: 0.5,
  /** Rim center — just above the key, below crowd/fence */
  hoopY: 0.305,
  backboardTop: 0.218,
  backboardBottom: 0.298,
  floorSplit: 0.52,
  wordmarkX: 0.5,
  wordmarkY: 0.245,
} as const

/** Native display sizes for hoop sprites (integer pixel art). */
export const HOOP_SPRITES = {
  /** Backboard display size */
  boardW: 148,
  boardH: 116,
  /** Rim display */
  rimW: 78,
  rimH: 20,
  /** Net display */
  netW: 72,
  netH: 84,
  /** Pole */
  poleW: 28,
  poleH: 140,
  /** Board center above rim (px) */
  boardOffsetY: -58,
  /** Net hangs below rim */
  netOffsetY: 10,
  /** Pole offset below rim */
  poleOffsetY: 48,
} as const
