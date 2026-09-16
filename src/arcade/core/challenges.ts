export type ChallengeCreatePayload = {
  game: string
  score: number
  playerId?: string
}

/** POST /api/challenges — M1 client stub */
export async function createChallenge(
  payload: ChallengeCreatePayload,
): Promise<Response> {
  return fetch('/api/challenges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

/** GET /api/challenges/:id — M1 client stub */
export async function getChallenge(id: string): Promise<Response> {
  return fetch(`/api/challenges/${encodeURIComponent(id)}`)
}
