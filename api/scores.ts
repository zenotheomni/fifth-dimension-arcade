import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * POST /api/scores — M1 stub
 * Body: { game, mode, score, meta }
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

  const body = req.body ?? {}
  return res.status(501).json({
    ok: false,
    stub: true,
    message: 'POST /scores not implemented (M1 stub)',
    received: {
      game: body.game ?? null,
      mode: body.mode ?? null,
      score: body.score ?? null,
    },
  })
}
