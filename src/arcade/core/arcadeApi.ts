import { api, ensureSession, getCachedPlayer } from './session'

export type BoardWindow = 'alltime' | 'weekly' | 'contest'
export type BoardEntry = { rank: number; player_id: string; handle: string; score: number; created_at: string; is_me: boolean }
export type Board = {
  game_id: string
  window: BoardWindow
  size: number
  label: string
  entries: BoardEntry[]
  me: { rank: number; score: number; handle: string } | null
  total: number
  contest?: Contest
}

export type ContestStatus = 'upcoming' | 'live' | 'ended' | 'winners_announced'
export type Contest = {
  id: string
  game_id: string
  game_title: string | null
  title: string
  prize_text: string
  prize_image_url: string | null
  rules_text: string
  how_to_claim: string
  starts_at: string
  ends_at: string
  ended_early: boolean
  winner_count: number
  is_test: boolean
  status: ContestStatus
  winners_announced_at: string | null
  winners: { place: number; handle: string; score: number; is_me: boolean }[]
  server_now: string
}

export type TickerData = {
  boards: { game_id: string; game_title: string; label: string; weekly: { rank: number; handle: string; score: number }[]; alltime: { rank: number; handle: string; score: number }[] }[]
  contest: (Contest & { leaders: { rank: number; handle: string; score: number }[] }) | null
  server_now: string
}

export type ChallengeInfo = {
  id: string
  url?: string
  game_id: string
  target_score: number
  seed: string
  creator_player_id: string
  creator_handle: string
  opponent_player_id: string | null
  opponent_handle: string | null
  parent_challenge_id: string | null
  expires_at: string
  expired: boolean
}

export type H2H = { me_wins: number; them_wins: number; ties: number; games: number; last_winner: 'me' | 'them' | 'tie' | null; text?: string }

export type ChallengeView = ChallengeInfo & {
  entries: { player_id: string; handle: string; role: 'creator' | 'challenger'; status: 'started' | 'finished'; score: number | null; result: 'win' | 'loss' | 'tie' | null }[]
  viewer_entry: { status: 'started' | 'finished'; score: number | null; result: 'win' | 'loss' | 'tie' | null } | null
  h2h: H2H | null
  next_challenge: ChallengeInfo | null
}

export type MatchResult = {
  counted: boolean
  result: 'win' | 'loss' | 'tie' | null
  challenge_id: string
  my_score: number | null
  their_score: number
  rival_player_id: string
  rival_handle: string
  h2h: H2H
  h2h_text?: string
}

export type RunResult = {
  id: string
  mode: string
  score: number
  player_id: string
  handle: string
  is_guest: boolean
  personal_best: number
  duplicate: boolean
  board: { alltime: { rank: number; score: number } | null; weekly: { rank: number; score: number } | null }
  match: MatchResult | null
  created_challenge: ChallengeInfo | null
  created_challenge_error: string | null
  alerts_created: number
}

export type Rival = {
  rival_player_id: string
  rival_handle: string
  my_wins: number
  their_wins: number
  ties: number
  last_played_at: string | null
  last_result: 'win' | 'loss' | 'tie'
  last_my_score: number | null
  last_their_score: number | null
  last_challenge_id: string | null
  turn_challenge_id: string | null
  turn_target: number | null
  waiting_challenge_id: string | null
  status: 'your_turn' | 'waiting' | 'ready'
}

export type Alert = {
  id: number
  kind: 'rival_started' | 'rival_finished' | 'your_turn' | 'contest_won'
  title: string
  body: string
  url: string
  challenge_id: string | null
  created_at: string
  read: boolean
}

/** Test contests are only visible with ?preview=contests once (persisted) — used for QA. */
export function contestPreview(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('preview')
    if (q === 'contests') localStorage.setItem('fd_arcade_contest_preview', '1')
    if (q === 'off') localStorage.removeItem('fd_arcade_contest_preview')
    return localStorage.getItem('fd_arcade_contest_preview') === '1'
  } catch {
    return false
  }
}

export function fetchBoard(game: string, window: BoardWindow, contestId?: string | null) {
  return api<{ board: Board }>('board', {
    query: {
      game,
      window,
      contest: window === 'contest' ? contestId : undefined,
      playerId: getCachedPlayer()?.player_id,
      preview: contestPreview() ? '1' : undefined,
    },
    auth: false,
  })
}

export function fetchContests() {
  return api<{ contests: Contest[]; server_now: string }>('contests', {
    query: { playerId: getCachedPlayer()?.player_id, preview: contestPreview() ? '1' : undefined },
    auth: false,
  })
}

export function fetchTicker() {
  return api<TickerData>('ticker', { query: { preview: contestPreview() ? '1' : undefined }, auth: false })
}

export async function submitRun(input: {
  game: string
  mode: string
  score: number
  runId: string
  challengeId?: string | null
  ticketId?: string | null
  meta?: Record<string, unknown>
}) {
  const p = await ensureSession()
  if (!p) return { ok: false as const, error: 'network_error' }
  return api<{ run: RunResult }>('run', { body: input })
}

export async function issueTicket(input: { game: string; rivalPlayerId?: string | null; parentChallengeId?: string | null }) {
  const p = await ensureSession()
  if (!p) return { ok: false as const, error: 'network_error' }
  return api<{ ticket: { ticket_id: string; seed: string; rival_player_id: string | null; rival_handle: string | null } }>('ticket', {
    body: input,
  })
}

export function challengeFromScore(scoreId: string) {
  return api<{ challenge: ChallengeInfo & { reused: boolean } }>('challenge-from-score', { body: { scoreId } })
}

export async function startChallenge(challengeId: string) {
  const p = await ensureSession()
  if (!p) return { ok: false as const, error: 'network_error' }
  return api<{ state: 'started' | 'finished'; challenge: ChallengeInfo }>('challenge-start', { body: { challengeId } })
}

export function fetchChallengeView(id: string) {
  return api<{ challenge: ChallengeView }>('challenge', {
    query: { id, viewer: getCachedPlayer()?.player_id },
    auth: false,
  })
}

export function fetchRivals(game = 'court-vision') {
  return api<{ rivals: Rival[]; unread: number }>('rivals', { query: { game } })
}

export function fetchInbox(after = 0) {
  return api<{ alerts: Alert[]; unread: number; latest_id: number | null }>('inbox', { query: { after } })
}

export function markInboxRead(uptoId: number) {
  return api<{ marked: number }>('inbox-read', { body: { uptoId } })
}

export function newRunId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16))
  }
}
