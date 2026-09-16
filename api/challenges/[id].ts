import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * GET /api/challenges/:id — M1 stub
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { id } = req.query
  return res.status(501).json({
    ok: false,
    stub: true,
    message: 'GET /challenges/:id not implemented (M1 stub)',
    id: typeof id === 'string' ? id : Array.isArray(id) ? id[0] : null,
  })
}
