import type { VercelRequest } from '@vercel/node'
import { bodyOf, str } from './http.js'

export type ArcadeAuth = { deviceId: string; token: string | null }

/** Device id + player token, from headers (preferred) or JSON body. */
export function readAuth(req: VercelRequest): ArcadeAuth | null {
  const body = bodyOf(req)
  const deviceId =
    str(req.headers['x-arcade-device'], 128) ?? str(body.deviceId, 128) ?? null
  const token = str(req.headers['x-arcade-token'], 128) ?? str(body.token, 128) ?? null
  if (!deviceId) return null
  return { deviceId, token }
}
