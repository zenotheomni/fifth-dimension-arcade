import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleOptions, rpcErrorResponse } from './_lib/http.js'
import { getSupabase } from './_lib/supabase.js'

/**
 * GET /api/games — data-driven game registry
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, 'GET, OPTIONS')) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase.rpc('arcade_list_games')
    if (error) return rpcErrorResponse(res, error)

    return res.status(200).json({
      ok: true,
      games: data ?? [],
    })
  } catch (err) {
    return rpcErrorResponse(res, err)
  }
}
