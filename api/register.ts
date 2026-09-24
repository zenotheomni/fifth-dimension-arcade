import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleOptions, rpcErrorResponse } from './_lib/http.js'
import { getSupabase } from './_lib/supabase.js'

/**
 * POST /api/register
 * Body: { handle, deviceId }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, 'POST, OPTIONS')) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const handle = String(body.handle ?? '')
    const deviceId = String(body.deviceId ?? body.device_id ?? '')
    if (!handle || !deviceId) {
      return res.status(400).json({ ok: false, error: 'invalid_body' })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase.rpc('arcade_register_player', {
      p_handle: handle,
      p_device_id: deviceId,
    })
    if (error) return rpcErrorResponse(res, error)

    return res.status(200).json({ ok: true, player: data })
  } catch (err) {
    return rpcErrorResponse(res, err)
  }
}
