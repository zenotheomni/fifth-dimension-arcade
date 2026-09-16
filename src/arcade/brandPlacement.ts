export const BRAND_RULES = {
  NO_GIANT_HUD_WATERMARKS: true,
  PREFERRED: [
    'rim plate / front support (Court Vision)',
    'center-court mark ~15-20% opacity',
    'micro stamp on ball seam',
    'world neon / boutique windows (Fifth Run)',
  ] as const,
  BACKBOARD_GEOMETRY_ONLY: true,
} as const

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
