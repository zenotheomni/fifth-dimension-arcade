import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleOptions, rpcErrorResponse } from './_lib/http.js'
import { getSupabase } from './_lib/supabase.js'

/**
 * GET /api/leaderboard?game=&window=weekly|alltime|contest&contest=&mode=&limit=
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, 'GET, OPTIONS')) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const game = String(req.query.game ?? '')
    const window = String(req.query.window ?? 'weekly')
    const mode = req.query.mode != null ? String(req.query.mode) : null
    const contest =
      req.query.contest != null && String(req.query.contest).length > 0
        ? String(req.query.contest)
        : null
    const limit = req.query.limit != null ? Number(req.query.limit) : 25

    if (!game) {
      return res.status(400).json({ ok: false, error: 'missing_game' })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase.rpc('arcade_leaderboard', {
      p_game_id: game,
      p_window: window,
      p_mode: mode,
      p_contest_id: contest,
      p_limit: Number.isFinite(limit) ? limit : 25,
    })

    if (error) return rpcErrorResponse(res, error)

    return res.status(200).json({
      ok: true,
      leaderboard: data,
    })
  } catch (err) {
    return rpcErrorResponse(res, err)
  }
}
