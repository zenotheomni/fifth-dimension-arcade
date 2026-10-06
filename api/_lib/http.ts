import type { VercelRequest, VercelResponse } from '@vercel/node'

export function setCors(res: VercelResponse, methods: string): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Arcade-Device, X-Arcade-Token',
  )
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

/** Error codes raised by arcade RPCs (RAISE EXCEPTION '<code>'). */
const STATUS_BY_CODE: Record<string, number> = {
  rate_limited: 429,
  misconfigured: 503,
  bad_token: 401,
  missing_auth: 401,
  forbidden: 403,
  player_not_found: 404,
  challenge_not_found: 404,
  score_not_found: 404,
  contest_not_found: 404,
  handle_taken: 409,
  handle_conflict: 409,
  rpc_error: 500,
}

const KNOWN = new Set([
  ...Object.keys(STATUS_BY_CODE),
  'invalid_handle',
  'handle_reserved',
  'handle_not_allowed',
  'invalid_device_id',
  'invalid_claim_code',
  'score_too_high',
  'invalid_score',
  'invalid_mode',
  'invalid_window',
  'unknown_game',
  'game_not_live',
  'challenge_expired',
  'challenge_game_mismatch',
  'own_challenge',
  'not_rivals',
  'invalid_ticket',
  'ticket_and_challenge',
  'score_too_old',
  'invalid_subscription',
  'contest_not_active',
  'invalid_body',
])

export function errorCodeOf(err: unknown): { code: string; message: string } {
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: string }).message)
      : 'unknown_error'
  const lower = message.toLowerCase().trim()
  if (KNOWN.has(lower)) return { code: lower, message }
  if (lower.includes('missing_supabase')) return { code: 'misconfigured', message }
  for (const k of KNOWN) if (lower.includes(k)) return { code: k, message }
  return { code: 'rpc_error', message }
}

/** Map Postgres / RPC error messages to HTTP status + stable code. */
export function rpcErrorResponse(res: VercelResponse, err: unknown): VercelResponse {
  const { code, message } = errorCodeOf(err)
  const status = STATUS_BY_CODE[code] ?? 400
  if (status >= 500) console.error('[arcade] rpc error', message)
  return res
    .status(status)
    .json({ ok: false, error: code, message: status >= 500 ? 'server_error' : message })
}

export function bodyOf(req: VercelRequest): Record<string, unknown> {
  const b = req.body
  if (b && typeof b === 'object') return b as Record<string, unknown>
  if (typeof b === 'string') {
    try {
      const parsed = JSON.parse(b)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

export function str(v: unknown, max = 256): string | null {
  if (v == null) return null
  const s = String(Array.isArray(v) ? v[0] : v).trim()
  if (!s) return null
  return s.slice(0, max)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function uuidOrNull(v: unknown): string | null {
  const s = str(v, 64)
  return s && UUID_RE.test(s) ? s : null
}
