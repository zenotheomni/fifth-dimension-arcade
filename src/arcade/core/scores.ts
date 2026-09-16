export type ScorePayload = {
  game: string
  mode: string
  score: number
  meta?: Record<string, unknown>
}

/** POST /api/scores — M1 client stub */
export async function postScore(payload: ScorePayload): Promise<Response> {
  return fetch('/api/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
