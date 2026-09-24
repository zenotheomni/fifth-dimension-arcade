import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleOptions, rpcErrorResponse } from './_lib/http.js'
import { getSupabase } from './_lib/supabase.js'

/**
 * GET /api/personal-best?game=&deviceId=&mode=
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, 'GET, OPTIONS')) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const game = String(req.query.game ?? '')
    const deviceId = String(req.query.deviceId ?? req.query.device_id ?? '')
    const mode = req.query.mode != null ? String(req.query.mode) : null

    if (!game || !deviceId) {
      return res.status(400).json({ ok: false, error: 'missing_params' })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase.rpc('arcade_personal_best', {
      p_device_id: deviceId,
      p_game_id: game,
      p_mode: mode,
    })

    if (error) return rpcErrorResponse(res, error)

    return res.status(200).json({
      ok: true,
      personalBest: data,
    })
  } catch (err) {
    return rpcErrorResponse(res, err)
  }
}
