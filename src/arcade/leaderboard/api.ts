import type {
  ArcadeGame,
  ChallengePayload,
  LeaderboardPayload,
  LeaderboardWindow,
  PersonalBestPayload,
} from './types'
import { getCachedPlayer } from '../core/session'

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
  // Best score on the game's board for the cached device player (all-time).
  const me = getCachedPlayer()
  const params = new URLSearchParams({ game: opts.game, window: 'alltime' })
  if (me) params.set('playerId', me.player_id)
  const res = await fetch(`/api/arcade/board?${params.toString()}`)
  const json = (await res.json()) as { ok?: boolean; board?: { me: { score: number; handle: string } | null }; error?: string }
  if (!res.ok || !json.ok || !json.board) throw new Error(json.error ?? 'personal_best_failed')
  const mine = json.board.me
  return {
    found: Boolean(mine),
    player_id: me?.player_id,
    handle: mine?.handle,
    game_id: opts.game,
    mode: opts.mode ?? null,
    score: mine?.score ?? 0,
  }
}

export async function fetchChallenge(id: string): Promise<ChallengePayload> {
  const res = await fetch(`/api/arcade/challenge?id=${encodeURIComponent(id)}`)
  const json = (await res.json()) as { ok?: boolean; challenge?: ChallengePayload; error?: string }
  if (!res.ok || !json.ok || !json.challenge) {
    throw new Error(json.error ?? 'challenge_failed')
  }
  return json.challenge
}
