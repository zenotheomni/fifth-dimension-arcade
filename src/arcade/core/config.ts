/**
 * Canonical public base for challenge links / future universal links.
 * Override with VITE_ARCADE_PUBLIC_BASE_URL (no trailing slash).
 */
const DEFAULT_BASE = 'https://5dimperial.com/arcade'

function resolvePublicBase(): string {
  const fromEnv = import.meta.env.VITE_ARCADE_PUBLIC_BASE_URL as string | undefined
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.replace(/\/$/, '')
  }
  // Dev / preview fallback: current origin + /arcade when not on the brand domain
  if (typeof window !== 'undefined') {
    const { origin, hostname } = window.location
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.vercel.app') ||
      hostname === '127.0.0.1'
    ) {
      return `${origin}/arcade`
    }
  }
  return DEFAULT_BASE
}

export const ARCADE_PUBLIC_BASE_URL = resolvePublicBase()

export function challengePublicUrl(id: string): string {
  return `${ARCADE_PUBLIC_BASE_URL}/challenge/${encodeURIComponent(id)}`
}

export function getBrowserSupabaseEnv(): {
  url: string | undefined
  anonKey: string | undefined
} {
  return {
    url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  }
}
