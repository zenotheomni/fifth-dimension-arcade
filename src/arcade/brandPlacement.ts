/**
 * Brand placement rules — see BRAND_PLACEMENT.md + CREATIVE_BRIEF.md
 * No giant HUD watermarks. Rim / world-object marks only.
 */

export const BRAND_RULES = {
  /** Never stamp a giant logo on HUD overlays */
  NO_GIANT_HUD_WATERMARKS: true,
  /** Preferred in-world placements */
  PREFERRED: [
    'rim plate / front support (Court Vision)',
    'center-court mark ~15–20% opacity',
    'micro stamp on ball seam',
    'world neon / boutique windows (Fifth Run)',
  ] as const,
  /** Backboard: faint geometry only — no big logo */
  BACKBOARD_GEOMETRY_ONLY: true,
} as const

/** Soft end-of-run doors — always present after gameplay (M2+) */
export const END_DOORS = {
  courtVision: [
    { id: 'challenge', label: 'Challenge a friend' },
    { id: 'boutique', label: 'Enter boutique' },
  ],
  fifthRun: [
    { id: 'challenge', label: 'Challenge a friend' },
    { id: 'record-store', label: 'Enter record store' },
  ],
} as const

/** In-world placement knobs used by Court Vision canvas (M2) */
export const COURT_VISION_PLACEMENT = {
  centerCourtOpacity: 0.17, // ~15–20%
  rimPlateMark: '5D',
  ballSeamStamp: '5D',
  backboardBigLogo: false,
} as const
