import { newRunId, submitRun } from './arcadeApi'

/** UI modes (timed/endless/challenge) → backend modes (timed60/endless/challenge). */
export function toApiMode(mode: string): string {
  if (mode === 'timed' || mode === 'timed60') return 'timed60'
  if (mode === 'challenge') return 'challenge'
  return 'endless'
}

/** Legacy helper (2D Court Vision). Routes through the token-checked run submission. */
export async function postScore(payload: { game: string; mode: string; score: number; meta?: Record<string, unknown> }) {
  return submitRun({ game: payload.game, mode: toApiMode(payload.mode), score: payload.score, runId: newRunId(), meta: payload.meta })
}
