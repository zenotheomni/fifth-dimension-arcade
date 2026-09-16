import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * POST /api/challenges — M1 stub → would return id + URL
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Mock shape for M1 — real persistence in M3
  const id = `chal_${Date.now().toString(36)}`
  return res.status(501).json({
    ok: false,
    stub: true,
    message: 'POST /challenges not implemented (M1 stub)',
    mock: {
      id,
      url: `/arcade/challenge/${id}`,
    },
  })
}
