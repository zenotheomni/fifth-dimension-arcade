import { challengePublicUrl } from './config'
import { getOrCreateDeviceId, getSavedHandle } from './identity'

export type ChallengeCreatePayload = {
  game: string
  /** Target score to beat (also accepted as `score` for M1 compat) */
  score: number
  mode?: string
  playerId?: string
  deviceId?: string
  handle?: string
  seed?: string
}

export type ChallengeCreateResult = {
  ok: boolean
  id?: string
  url?: string
  challenge?: Record<string, unknown>
  error?: string
  message?: string
}

export async function createChallenge(
  payload: ChallengeCreatePayload,
): Promise<Response> {
  const deviceId =
    payload.deviceId ?? payload.playerId ?? getOrCreateDeviceId()
  const handle = payload.handle ?? getSavedHandle() ?? undefined
  return fetch('/api/challenges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      game: payload.game,
      score: payload.score,
      mode: payload.mode ?? 'challenge',
      deviceId,
      handle,
      seed: payload.seed ?? '',
    }),
  })
}

export async function createChallengeJson(
  payload: ChallengeCreatePayload,
): Promise<ChallengeCreateResult> {
  const res = await createChallenge(payload)
  try {
    const data = (await res.json()) as ChallengeCreateResult
    if (data.ok && data.id && !data.url) {
      data.url = challengePublicUrl(data.id)
    }
    return data
  } catch {
    return { ok: false, error: 'bad_response' }
  }
}

export async function getChallenge(id: string): Promise<Response> {
  return fetch(`/api/challenges/${encodeURIComponent(id)}`)
}

export async function getChallengeJson(
  id: string,
): Promise<{ ok: boolean; challenge?: Record<string, unknown>; error?: string }> {
  const res = await getChallenge(id)
  try {
    return (await res.json()) as {
      ok: boolean
      challenge?: Record<string, unknown>
      error?: string
    }
  } catch {
    return { ok: false, error: 'bad_response' }
  }
}

export { challengePublicUrl }
