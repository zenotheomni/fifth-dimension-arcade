import type {
  ArcadeGame,
  ChallengePayload,
  LeaderboardPayload,
  LeaderboardWindow,
  PersonalBestPayload,
} from './types'
import { getOrCreateDeviceId } from '../core/identity'

export async function fetchLeaderboard(opts: {
  game: string
  window?: LeaderboardWindow
  mode?: string
  contest?: string
  limit?: number
}): Promise<LeaderboardPayload> {
  const params = new URLSearchParams()
  params.set('game', opts.game)
  params.set('window', opts.window ?? 'weekly')
  if (opts.mode) params.set('mode', opts.mode)
  if (opts.contest) params.set('contest', opts.contest)
  if (opts.limit) params.set('limit', String(opts.limit))

  const res = await fetch(`/api/leaderboard?${params.toString()}`)
  const json = (await res.json()) as {
    ok?: boolean
    leaderboard?: LeaderboardPayload
    error?: string
  }
  if (!res.ok || !json.ok || !json.leaderboard) {
    throw new Error(json.error ?? 'leaderboard_failed')
  }
  return json.leaderboard
}

export async function fetchGames(): Promise<ArcadeGame[]> {
  const res = await fetch('/api/games')
  const json = (await res.json()) as {
    ok?: boolean
    games?: ArcadeGame[]
    error?: string
  }
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? 'games_failed')
  }
  return json.games ?? []
}

export async function fetchPersonalBest(opts: {
  game: string
  mode?: string
  deviceId?: string
}): Promise<PersonalBestPayload> {
  const deviceId = opts.deviceId ?? getOrCreateDeviceId()
  // Personal best goes through a lightweight scores helper endpoint pattern:
  // for v1 we call leaderboard personal-best via dedicated query on games API
  // or direct — expose via /api/leaderboard with pb flag would be odd.
  // Use client fetch to a small inline path: GET /api/scores is POST-only,
  // so we add personal best onto games? No — use fetch to supabase via API.
  // Temporary: encode as GET /api/leaderboard?pb=1 — cleaner to add /api/me/best.
  const params = new URLSearchParams({
    game: opts.game,
    deviceId,
  })
  if (opts.mode) params.set('mode', opts.mode)
  const res = await fetch(`/api/personal-best?${params.toString()}`)
  const json = (await res.json()) as {
    ok?: boolean
    personalBest?: PersonalBestPayload
    error?: string
  }
  if (!res.ok || !json.ok || !json.personalBest) {
    throw new Error(json.error ?? 'personal_best_failed')
  }
  return json.personalBest
}

export async function fetchChallenge(
  id: string,
): Promise<ChallengePayload> {
  const res = await fetch(`/api/challenges/${encodeURIComponent(id)}`)
  const json = (await res.json()) as {
    ok?: boolean
    challenge?: ChallengePayload
    error?: string
  }
  if (!res.ok || !json.ok || !json.challenge) {
    throw new Error(json.error ?? 'challenge_failed')
  }
  return json.challenge
}
