import { challengePublicUrl } from './config'
import { getOrCreateDeviceId, getSavedHandle } from './identity'
import { toApiMode } from './scores'

export type ChallengeCreatePayload = {
  game: string
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
      mode: toApiMode(payload.mode ?? 'challenge'),
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

export function challengeShareText(score: number, url: string): string {
  return `I just put up ${score} on Court Vision at the Fifth Floor Arcade. Beat it: ${url}`
}

export async function shareOrCopy(text: string, url: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({
        title: 'Court Vision Challenge',
        text,
        url,
      })
      return 'shared'
    }
  } catch {
    /* user cancelled or share failed — fall through to copy */
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text.includes(url) ? text : `${text} ${url}`)
      return 'copied'
    }
  } catch {
    /* ignore */
  }
  return 'failed'
}
