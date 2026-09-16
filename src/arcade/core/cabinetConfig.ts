export type CabinetStatus = 'lit' | 'coming_up'

export type Cabinet = {
  id: string
  title: string
  tagline: string
  status: CabinetStatus
  badge?: string
  route?: string
}

export const cabinets: Cabinet[] = [
  {
    id: 'court-vision',
    title: 'Court Vision',
    tagline: 'Finger-flick basketball. Hold. Aim. Release.',
    status: 'lit',
    badge: 'NEW',
    route: '/court-vision',
  },
  {
    id: 'fifth-run',
    title: 'Fifth Run',
    tagline: '3-lane night runner. Swipe. Jump. Slide.',
    status: 'lit',
    route: '/fifth-run',
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
  return status === 'lit' ? '' : 'COMING UP'
}
