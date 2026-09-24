/** Canonical public base for challenge deep links (universal links later). */
export const ARCADE_PUBLIC_BASE_URL =
  (process.env.ARCADE_PUBLIC_BASE_URL || 'https://5dimperial.com/arcade').replace(
    /\/$/,
    '',
  )

export function challengePublicUrl(id: string): string {
  return `${ARCADE_PUBLIC_BASE_URL}/challenge/${encodeURIComponent(id)}`
}

export function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const anonKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  if (!url || !anonKey) {
    throw new Error('missing_supabase_env')
  }
  return { url, anonKey }
}
