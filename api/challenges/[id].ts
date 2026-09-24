import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleOptions, rpcErrorResponse } from '../_lib/http.js'
import { getSupabase } from '../_lib/supabase.js'

/**
 * GET /api/challenges/:id
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, 'GET, OPTIONS')) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const raw = req.query.id
    const id = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : ''
    if (!id) {
      return res.status(400).json({ ok: false, error: 'missing_id' })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase.rpc('arcade_get_challenge', {
      p_id: id,
    })

    if (error) return rpcErrorResponse(res, error)

    return res.status(200).json({
      ok: true,
      challenge: data,
    })
  } catch (err) {
    return rpcErrorResponse(res, err)
  }
}
