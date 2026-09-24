/**
 * Data-driven game list — add games / contests here without rewriting the lobby.
 * Remote /api/games status overlays this local registry (local is the fallback).
 */
export type GameStatus = 'live' | 'new' | 'coming-soon'

export type ArcadeGame = {
  id: string
  title: string
  tagline: string
  status: GameStatus
  boxArt: string
  route: string | null
  accent: string
  accentAlt: string
  contest?: { label: string; endsAt?: string }
}

export type TickerScore = {
  name: string
  game: string
  score: number
}

const art = (file: string) => `${import.meta.env.BASE_URL}art/${file}`

export const GAMES: ArcadeGame[] = [
  {
    id: 'court-vision',
    title: 'Court Vision',
    tagline: 'Rooftop swish machine',
    status: 'new',
    boxArt: art('box-court-vision.webp'),
    route: '/court-vision',
    accent: '#FF5A3C',
    accentAlt: '#00C8C4',
    contest: { label: 'Top score giveaway — soon' },
  },
  {
    id: 'fifth-run',
    title: 'Fifth Run',
    tagline: 'Key runner. Keep moving.',
    status: 'live',
    boxArt: art('box-fifth-run.webp'),
    route: '/fifth-run',
    accent: '#00C8C4',
    accentAlt: '#FF8C28',
  },
  {
    id: 'break-and-rack',
    title: 'Break & Rack',
    tagline: 'Pool hall pressure',
    status: 'coming-soon',
    boxArt: art('box-coming-soon.webp'),
    route: null,
    accent: '#482078',
    accentAlt: '#DC283C',
    contest: { label: 'Drops with competition' },
  },
  {
    id: 'lane-drift',
    title: 'Lane Drift',
    tagline: 'Neon highway glide',
    status: 'coming-soon',
    boxArt: art('box-coming-soon.webp'),
    route: null,
    accent: '#14183C',
    accentAlt: '#00C8C4',
  },
]

export const DOCK_LINKS = [
  {
    id: 'boutique',
    label: 'Boutique',
    href: 'https://5dimperial.com/collections/apparel',
  },
  {
    id: 'record-store',
    label: 'Record Store',
    href: 'https://5dimperial.com/collections/music?view=record-store',
  },
  {
    id: 'theater',
    label: 'Theater',
    href: 'https://5dimperial.com/pages/5d-theater',
  },
] as const

export function statusLabel(status: GameStatus): string {
  switch (status) {
    case 'new':
      return 'NEW'
    case 'live':
      return 'LIVE'
    case 'coming-soon':
      return 'COMING UP'
  }
}

/** Map Supabase arcade_games.status → local GameStatus */
export function mapApiStatus(raw: string | undefined | null): GameStatus | null {
  if (!raw) return null
  if (raw === 'coming_soon' || raw === 'coming-soon') return 'coming-soon'
  if (raw === 'live' || raw === 'new') return raw
  return null
}

export function mergeGamesWithApi(
  local: ArcadeGame[],
  remote: Array<{ id: string; status?: string; title?: string }> | null | undefined,
): ArcadeGame[] {
  if (!remote?.length) return local
  const byId = new Map(remote.map((g) => [g.id, g]))
  return local.map((g) => {
    const api = byId.get(g.id)
    if (!api) return g
    const status = mapApiStatus(api.status) ?? g.status
    return { ...g, status }
  })
}
