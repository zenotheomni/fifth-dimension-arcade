import { getOrCreateDeviceId, getSavedHandle } from './identity'

export type ScorePayload = {
  game: string
  mode: string
  score: number
  meta?: Record<string, unknown>
  deviceId?: string
  handle?: string
  challengeId?: string
  contestId?: string
}

export type ScoreSubmitResult = {
  ok: boolean
  score?: {
    id: string
    game_id: string
    mode: string
    score: number
    player_id: string
    handle: string
    personal_best: number
    challenge_id: string | null
    contest_id: string | null
    created_at: string
  }
  error?: string
  message?: string
}

/** Phaser uses timed/endless; backend uses timed60/endless/challenge */
export function toApiMode(mode: string): string {
  if (mode === 'timed' || mode === 'timed60') return 'timed60'
  if (mode === 'challenge') return 'challenge'
  return 'endless'
}

export async function postScore(payload: ScorePayload): Promise<Response> {
  const deviceId = payload.deviceId ?? getOrCreateDeviceId()
  const handle = payload.handle ?? getSavedHandle() ?? undefined
  return fetch('/api/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      game: payload.game,
      mode: toApiMode(payload.mode),
      score: payload.score,
      meta: payload.meta ?? {},
      deviceId,
      handle,
      challengeId: payload.challengeId,
      contestId: payload.contestId,
    }),
  })
}

export async function postScoreJson(
  payload: ScorePayload,
): Promise<ScoreSubmitResult> {
  const res = await postScore(payload)
  try {
    return (await res.json()) as ScoreSubmitResult
  } catch {
    return { ok: false, error: 'bad_response' }
  }
}
