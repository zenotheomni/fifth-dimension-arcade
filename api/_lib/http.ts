import type { VercelRequest, VercelResponse } from '@vercel/node'

export function setCors(
  res: VercelResponse,
  methods: string,
): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export function handleOptions(
  req: VercelRequest,
  res: VercelResponse,
  methods: string,
): boolean {
  setCors(res, methods)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }
  return false
}

/** Map Postgres / RPC error messages to HTTP status + stable code. */
export function rpcErrorResponse(
  res: VercelResponse,
  err: unknown,
): VercelResponse {
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: string }).message)
      : 'unknown_error'

  const lower = message.toLowerCase()
  const code =
    lower.includes('rate_limited')
      ? 'rate_limited'
      : lower.includes('handle_taken')
        ? 'handle_taken'
        : lower.includes('invalid_handle')
          ? 'invalid_handle'
          : lower.includes('invalid_device')
            ? 'invalid_device_id'
            : lower.includes('player_not_found')
              ? 'player_not_found'
              : lower.includes('score_too_high')
                ? 'score_too_high'
                : lower.includes('invalid_score')
                  ? 'invalid_score'
                  : lower.includes('invalid_mode')
                    ? 'invalid_mode'
                    : lower.includes('unknown_game')
                      ? 'unknown_game'
                      : lower.includes('game_not_live')
                        ? 'game_not_live'
                        : lower.includes('challenge_not_found')
                          ? 'challenge_not_found'
                          : lower.includes('challenge_expired')
                            ? 'challenge_expired'
                            : lower.includes('contest_')
                              ? 'contest_error'
                              : lower.includes('missing_supabase')
                                ? 'misconfigured'
                                : 'rpc_error'

  const status =
    code === 'rate_limited'
      ? 429
      : code === 'misconfigured'
        ? 503
        : code === 'player_not_found' || code === 'challenge_not_found'
          ? 404
          : code === 'rpc_error'
            ? 500
            : 400

  return res.status(status).json({ ok: false, error: code, message })
}
