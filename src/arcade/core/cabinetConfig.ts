export type CabinetStatus = 'lit' | 'coming_up'

export type Cabinet = {
  id: string
  title: string
  tagline: string
  status: CabinetStatus
  /** Shown on cabinet glass when set (e.g. NEW) */
  badge?: string
  /** React Router path relative to basename /arcade */
  route?: string
}

/**
 * Lobby cabinets — Creative Brief order.
 * Lit = playable shell / glow. COMING UP = dimmed teaser.
 */
export const cabinets: Cabinet[] = [
  {
    id: 'court-vision',
    title: 'COURT VISION',
    tagline: 'Finger-flick basketball. Hold. Aim. Release.',
    status: 'lit',
    badge: 'NEW',
    route: '/court-vision',
  },
  {
    id: 'fifth-run',
    title: 'FIFTH GLIDE',
    tagline: 'Run the Fifth Dimension. Swipe. Jump. Slide.',
    status: 'lit',
    route: '/fifth-run',
  },
  {
    id: 'street-shift',
    title: 'NOVA 5',
    tagline: 'Pac-Man DNA. Maze Shift every 20s.',
    status: 'lit',
    badge: 'NEW',
    route: '/nova-5',
  },
  {
    id: 'break-and-rack',
    title: 'Break & Rack',
    tagline: 'Table games. Coming to the floor.',
    status: 'coming_up',
  },
  {
    id: 'lane-drift',
    title: 'Lane Drift',
    tagline: 'Side-scroll drift. Coming to the floor.',
    status: 'coming_up',
  },
]

export function statusLabel(status: CabinetStatus): string {
  return status === 'lit' ? 'LIT' : 'COMING UP'
}
