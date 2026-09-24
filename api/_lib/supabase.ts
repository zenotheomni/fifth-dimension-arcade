import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from './config.js'

let cached: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (cached) return cached
  const { url, anonKey } = getSupabaseEnv()
  cached = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
