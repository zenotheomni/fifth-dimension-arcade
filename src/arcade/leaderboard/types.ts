export type LeaderboardWindow = 'weekly' | 'alltime' | 'contest'

export type LeaderboardEntry = {
  rank: number
  player_id: string
  handle: string
  score: number
  created_at: string
}

export type LeaderboardPayload = {
  game_id: string
  window: LeaderboardWindow | string
  mode: string | null
  contest_id?: string
  entries: LeaderboardEntry[]
}

export type ArcadeGame = {
  id: string
  title: string
  status: 'live' | 'coming_soon' | 'new' | string
  sort_order: number
  created_at: string
}

export type PersonalBestPayload = {
  found: boolean
  player_id?: string
  handle?: string
  game_id: string
  mode: string | null
  score: number
  achieved_at?: string | null
}

export type ChallengePayload = {
  id: string
  game_id: string
  mode: string
  target_score: number
  seed: string
  creator_handle: string
  creator_player_id: string
  created_at: string
  expires_at: string
  expired: boolean
  attempts: Array<{
    handle: string
    player_id: string
    score: number
    created_at: string
    is_creator: boolean
  }>
}
