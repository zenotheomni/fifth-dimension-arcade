import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readAuth } from './_lib/auth.js'
import { challengePublicUrl, getPushEnv } from './_lib/config.js'
import { bodyOf, errorCodeOf, handleOptions, rpcErrorResponse, str, uuidOrNull } from './_lib/http.js'
import { flushPush } from './_lib/push.js'
import { getSupabase } from './_lib/supabase.js'

/**
 * Fifth Floor Arcade — player API (single function, routed by /api/arcade/:action).
 *
 * Every write goes through a SECURITY DEFINER RPC that verifies the device's player token.
 * Auth: X-Arcade-Device + X-Arcade-Token headers (or deviceId/token in the JSON body).
 */

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>

class HttpError extends Error {
  status: number
  constructor(status: number, code: string) {
    super(code)
    this.status = status
  }
}

async function call<T = Record<string, unknown>>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args)
  if (error) throw error
  return data as T
}

function auth(req: VercelRequest): { p_device_id: string; p_token: string | null } {
  const a = readAuth(req)
  if (!a) throw new HttpError(401, 'missing_auth')
  return { p_device_id: a.deviceId, p_token: a.token }
}

function withUrl<T extends Record<string, unknown> | null | undefined>(c: T): T {
  if (c && typeof c === 'object' && typeof c.id === 'string') {
    return { ...c, url: challengePublicUrl(c.id) }
  }
  return c
}

async function maybeFlush(result: unknown, reason: string) {
  const n = Number((result as { alerts_created?: number } | null)?.alerts_created ?? 0)
  if (n > 0) return flushPush(reason)
  return null
}

const GET: Record<string, Handler> = {
  async board(req, res) {
    const game = str(req.query.game, 40) ?? 'court-vision'
    const window = str(req.query.window, 16) ?? 'alltime'
    const playerId = uuidOrNull(req.query.playerId)
    const limit = req.query.limit != null ? Number(req.query.limit) : null
    const board = await call('arcade_board', {
      p_game_id: game,
      p_window: window,
      p_player_id: playerId,
      p_limit: Number.isFinite(limit) ? limit : null,
    })
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ ok: true, board })
  },

  async challenge(req, res) {
    const id = str(req.query.id, 32)
    if (!id) throw new HttpError(400, 'invalid_body')
    const challenge = await call('arcade_challenge_view', {
      p_id: id,
      p_viewer_player_id: uuidOrNull(req.query.viewer),
    })
    const next = (challenge as { next_challenge?: Record<string, unknown> }).next_challenge
    return res.status(200).json({
      ok: true,
      challenge: { ...withUrl(challenge), next_challenge: withUrl(next ?? null) },
    })
  },

  async rivals(req, res) {
    const game = str(req.query.game, 40) ?? 'court-vision'
    const data = await call('arcade_rivals', { ...auth(req), p_game_id: game })
    return res.status(200).json({ ok: true, ...data })
  },

  async inbox(req, res) {
    const after = Number(req.query.after ?? 0)
    const data = await call('arcade_inbox', {
      ...auth(req),
      p_after_id: Number.isFinite(after) ? Math.max(0, Math.floor(after)) : 0,
      p_limit: 20,
    })
    return res.status(200).json({ ok: true, ...data })
  },

  async 'push-config'(_req, res) {
    const env = getPushEnv()
    return res.status(200).json({ ok: true, enabled: Boolean(env), publicKey: env?.publicKey ?? null })
  },
}

const POST: Record<string, Handler> = {
  async session(req, res) {
    const a = readAuth(req)
    if (!a) throw new HttpError(400, 'invalid_device_id')
    const body = bodyOf(req)
    const player = await call('arcade_session', {
      p_device_id: a.deviceId,
      p_token: a.token,
      p_handle: str(body.handle, 32),
    })
    return res.status(200).json({ ok: true, player })
  },

  async handle(req, res) {
    const body = bodyOf(req)
    const player = await call('arcade_set_handle', { ...auth(req), p_handle: str(body.handle, 32) ?? '' })
    return res.status(200).json({ ok: true, player })
  },

  async claim(req, res) {
    const body = bodyOf(req)
    const player = await call('arcade_claim_handle', { ...auth(req), p_code: str(body.code, 128) ?? '' })
    return res.status(200).json({ ok: true, player })
  },

  async run(req, res) {
    const body = bodyOf(req)
    const score = Number(body.score)
    if (!Number.isFinite(score)) throw new HttpError(400, 'invalid_score')
    const meta = body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta) ? body.meta : {}
    const result = await call<Record<string, unknown>>('arcade_submit_run', {
      ...auth(req),
      p_game_id: str(body.game, 40) ?? '',
      p_mode: str(body.mode, 16) ?? 'endless',
      p_score: Math.floor(score),
      p_meta: meta,
      p_run_id: uuidOrNull(body.runId),
      p_challenge_id: str(body.challengeId, 32),
      p_ticket_id: uuidOrNull(body.ticketId),
      p_contest_id: uuidOrNull(body.contestId),
    })
    const push = await maybeFlush(result, 'run')
    return res.status(200).json({
      ok: true,
      run: {
        ...result,
        created_challenge: withUrl(result.created_challenge as Record<string, unknown> | null),
      },
      push,
    })
  },

  async ticket(req, res) {
    const body = bodyOf(req)
    const ticket = await call('arcade_issue_ticket', {
      ...auth(req),
      p_game_id: str(body.game, 40) ?? 'court-vision',
      p_rival_player_id: uuidOrNull(body.rivalPlayerId),
      p_parent_challenge_id: str(body.parentChallengeId, 32),
    })
    return res.status(200).json({ ok: true, ticket })
  },

  async 'challenge-from-score'(req, res) {
    const body = bodyOf(req)
    const scoreId = uuidOrNull(body.scoreId)
    if (!scoreId) throw new HttpError(400, 'invalid_body')
    const challenge = await call<Record<string, unknown>>('arcade_challenge_from_score', {
      ...auth(req),
      p_score_id: scoreId,
    })
    return res.status(200).json({ ok: true, challenge: withUrl(challenge) })
  },

  async 'challenge-start'(req, res) {
    const body = bodyOf(req)
    const id = str(body.challengeId, 32)
    if (!id) throw new HttpError(400, 'invalid_body')
    const result = await call('arcade_challenge_start', { ...auth(req), p_challenge_id: id })
    const push = await maybeFlush(result, 'challenge-start')
    return res.status(200).json({ ok: true, ...result, push })
  },

  async 'inbox-read'(req, res) {
    const body = bodyOf(req)
    const upto = Number(body.uptoId ?? 0)
    const result = await call('arcade_inbox_read', {
      ...auth(req),
      p_upto_id: Number.isFinite(upto) ? Math.floor(upto) : 0,
    })
    return res.status(200).json({ ok: true, ...result })
  },

  async 'push-subscribe'(req, res) {
    const body = bodyOf(req)
    const sub = (body.subscription ?? {}) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    const result = await call('arcade_push_subscribe', {
      ...auth(req),
      p_endpoint: str(sub.endpoint, 1024) ?? '',
      p_p256dh: str(sub.keys?.p256dh, 200) ?? '',
      p_auth: str(sub.keys?.auth, 100) ?? '',
      p_user_agent: str(req.headers['user-agent'], 300) ?? '',
    })
    return res.status(200).json({ ok: true, ...result })
  },

  async 'push-unsubscribe'(req, res) {
    const body = bodyOf(req)
    const result = await call('arcade_push_unsubscribe', {
      ...auth(req),
      p_endpoint: str(body.endpoint, 1024) ?? '',
    })
    return res.status(200).json({ ok: true, ...result })
  },
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, 'GET, POST, OPTIONS')) return
  const action = str(req.query.action, 40) ?? ''
  const table = req.method === 'GET' ? GET : req.method === 'POST' ? POST : null
  const fn = table?.[action]
  if (!fn) {
    const exists = action in GET || action in POST
    return res
      .status(exists ? 405 : 404)
      .json({ ok: false, error: exists ? 'method_not_allowed' : 'unknown_action' })
  }
  try {
    await fn(req, res)
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ ok: false, error: err.message })
    }
    const { code } = errorCodeOf(err)
    if (code === 'rpc_error') console.error('[arcade]', action, err)
    return rpcErrorResponse(res, err)
  }
}
