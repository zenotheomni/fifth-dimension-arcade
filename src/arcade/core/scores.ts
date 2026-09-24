import { getOrCreateDeviceId, getSavedHandle } from './identity'

export type ScorePayload = {
  game: string
  mode: string
  score: number
  meta?: Record<string, unknown>
  /** Optional; defaults to local device id */
  deviceId?: string
  /** Optional display handle; registers/updates player when set */
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

export async function postScore(payload: ScorePayload): Promise<Response> {
  const deviceId = payload.deviceId ?? getOrCreateDeviceId()
  const handle = payload.handle ?? getSavedHandle() ?? undefined
  return fetch('/api/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      game: payload.game,
      mode: payload.mode,
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
