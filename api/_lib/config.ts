/** Canonical public base for challenge deep links (universal links later). */
export const ARCADE_PUBLIC_BASE_URL = (
  process.env.ARCADE_PUBLIC_BASE_URL || 'https://5dimperial.com/arcade'
).replace(/\/$/, '')

export function challengePublicUrl(id: string): string {
  return `${ARCADE_PUBLIC_BASE_URL}/challenge/${encodeURIComponent(id)}`
}

/** Origin that serves /api (OG images). Derived from the public base unless overridden. */
export function apiOrigin(): string {
  const explicit = process.env.ARCADE_API_ORIGIN
  if (explicit) return explicit.replace(/\/$/, '')
  try {
    return new URL(ARCADE_PUBLIC_BASE_URL).origin
  } catch {
    return 'https://fifth-dimension-arcade.vercel.app'
  }
}

export function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  if (!url || !anonKey) {
    throw new Error('missing_supabase_env')
  }
  return { url, anonKey }
}

export function getPushEnv(): {
  publicKey: string
  privateKey: string
  subject: string
  serverKey: string
} | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY || ''
  const privateKey = process.env.VAPID_PRIVATE_KEY || ''
  const serverKey = process.env.ARCADE_PUSH_SERVER_KEY || ''
  const subject =
    process.env.VAPID_SUBJECT || 'https://fifth-dimension-arcade.vercel.app/arcade'
  if (!publicKey || !privateKey || !serverKey) return null
  return { publicKey, privateKey, subject, serverKey }
}
