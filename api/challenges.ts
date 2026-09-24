import type { VercelRequest, VercelResponse } from '@vercel/node'
import { challengePublicUrl } from './_lib/config'
import { handleOptions, rpcErrorResponse } from './_lib/http'
import { getSupabase } from './_lib/supabase'

/**
 * POST /api/challenges
 * Body: { game, score|targetScore, mode?, deviceId|playerId, handle?, seed? }
 * Returns { ok, id, url, challenge }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, 'POST, OPTIONS')) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const game = String(body.game ?? body.game_id ?? '')
    const mode = String(body.mode ?? 'challenge')
    const targetScore = Number(body.targetScore ?? body.target_score ?? body.score)
    const deviceId = String(body.deviceId ?? body.device_id ?? body.playerId ?? '')
    const handle = body.handle != null ? String(body.handle) : ''
    const seed = body.seed != null ? String(body.seed) : ''

    if (!game || !deviceId || !Number.isFinite(targetScore)) {
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

    const { data, error } = await supabase.rpc('arcade_create_challenge', {
      p_game_id: game,
      p_mode: mode,
      p_device_id: deviceId,
      p_target_score: Math.floor(targetScore),
      p_seed: seed,
    })

    if (error) return rpcErrorResponse(res, error)

    const id = (data as { id?: string } | null)?.id
    if (!id) {
      return res.status(500).json({ ok: false, error: 'create_failed' })
    }

    const url = challengePublicUrl(id)

    return res.status(200).json({
      ok: true,
      id,
      url,
      challenge: data,
    })
  } catch (err) {
    return rpcErrorResponse(res, err)
  }
}
