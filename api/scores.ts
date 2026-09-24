import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleOptions, rpcErrorResponse } from './_lib/http'
import { getSupabase } from './_lib/supabase'

/**
 * POST /api/scores
 * Body: { game, mode, score, meta?, deviceId?, handle?, challengeId?, contestId? }
 * Registers the player (handle + deviceId) when provided, then submits score.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, 'POST, OPTIONS')) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const game = String(body.game ?? body.game_id ?? '')
    const mode = String(body.mode ?? 'endless')
    const score = Number(body.score)
    const meta =
      body.meta && typeof body.meta === 'object'
        ? (body.meta as Record<string, unknown>)
        : {}
    const deviceId = String(body.deviceId ?? body.device_id ?? body.playerId ?? '')
    const handle = body.handle != null ? String(body.handle) : ''
    const challengeId =
      body.challengeId != null || body.challenge_id != null
        ? String(body.challengeId ?? body.challenge_id)
        : null
    const contestId =
      body.contestId != null || body.contest_id != null
        ? String(body.contestId ?? body.contest_id)
        : null

    if (!game || !deviceId || !Number.isFinite(score)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_body',
        message: 'game, deviceId, and numeric score are required',
      })
    }

    const supabase = getSupabase()

    if (handle) {
      const { error: regErr } = await supabase.rpc('arcade_register_player', {
        p_handle: handle,
        p_device_id: deviceId,
      })
      if (regErr) return rpcErrorResponse(res, regErr)
    }

    const { data, error } = await supabase.rpc('arcade_submit_score', {
      p_game_id: game,
      p_mode: mode,
      p_score: Math.floor(score),
      p_meta: meta,
      p_device_id: deviceId,
      p_challenge_id: challengeId,
      p_contest_id: contestId,
    })

    if (error) return rpcErrorResponse(res, error)

    return res.status(200).json({
      ok: true,
      score: data,
    })
  } catch (err) {
    return rpcErrorResponse(res, err)
  }
}
