/**
 * Device-bound player session.
 *
 * - deviceId: random id in localStorage (existing key, so legacy players carry over)
 * - token:    64-hex secret issued by the server once; only its sha256 lives in the DB
 * - player:   cached {player_id, handle, is_guest}
 *
 * Handles are bound to this browser/device until the native app or real accounts exist.
 */
import { getOrCreateDeviceId, saveHandle } from './identity'

const TOKEN_KEY = 'fd_arcade_token'
const PLAYER_KEY = 'fd_arcade_player'
const DEVICE_KEY = 'fd_arcade_player_id'

export type ArcadePlayer = {
  player_id: string
  handle: string
  is_guest: boolean
}

type Listener = (p: ArcadePlayer | null) => void
const listeners = new Set<Listener>()

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getCachedPlayer(): ArcadePlayer | null {
  return read<ArcadePlayer>(PLAYER_KEY)
}

export function hasSession(): boolean {
  return Boolean(getToken() && getCachedPlayer())
}

function setPlayer(p: ArcadePlayer | null) {
  try {
    if (p) {
      localStorage.setItem(PLAYER_KEY, JSON.stringify({ player_id: p.player_id, handle: p.handle, is_guest: p.is_guest }))
      if (!p.is_guest) saveHandle(p.handle)
    } else localStorage.removeItem(PLAYER_KEY)
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(p))
}

export function onPlayerChange(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'X-Arcade-Device': getOrCreateDeviceId() }
  const t = getToken()
  if (t) h['X-Arcade-Token'] = t
  return h
}

export type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: string; message?: string; status?: number }

export async function api<T = Record<string, unknown>>(
  action: string,
  opts: { method?: 'GET' | 'POST'; body?: unknown; query?: Record<string, string | number | null | undefined>; auth?: boolean } = {},
): Promise<ApiResult<T>> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET')
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v != null && v !== '') qs.set(k, String(v))
  const url = `/api/arcade/${action}${qs.size ? `?${qs.toString()}` : ''}`
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.auth === false ? {} : authHeaders()),
      },
      body: method === 'POST' ? JSON.stringify(opts.body ?? {}) : undefined,
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok || json.ok === false) {
      return { ok: false, error: String(json.error ?? `http_${res.status}`), message: json.message as string, status: res.status }
    }
    return json as { ok: true } & T
  } catch {
    return { ok: false, error: 'network_error' }
  }
}

let inflight: Promise<ArcadePlayer | null> | null = null

/** Create-or-resume the device player. Pass a handle to create with it (new devices only). */
export function ensureSession(handle?: string): Promise<ArcadePlayer | null> {
  if (inflight) return inflight
  inflight = (async () => {
    const attempt = async () =>
      api<{ player: ArcadePlayer & { token: string | null } }>('session', {
        body: handle ? { handle } : {},
      })
    let r = await attempt()
    if (!r.ok && r.error === 'bad_token') {
      // Token lost/mismatched for this device id: start a fresh device identity.
      try {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.setItem(DEVICE_KEY, crypto.randomUUID())
      } catch {
        /* ignore */
      }
      r = await attempt()
    }
    if (!r.ok && r.error === 'handle_taken' && handle) {
      handle = undefined
      r = await attempt()
    }
    if (!r.ok) return null
    if (r.player.token) {
      try {
        localStorage.setItem(TOKEN_KEY, r.player.token)
      } catch {
        /* ignore */
      }
    }
    setPlayer(r.player)
    return r.player
  })().finally(() => {
    inflight = null
  })
  return inflight
}

export async function setHandle(handle: string): Promise<ApiResult<{ player: ArcadePlayer }>> {
  const p = await ensureSession()
  if (!p) return { ok: false, error: 'network_error' }
  const r = await api<{ player: ArcadePlayer }>('handle', { body: { handle } })
  if (r.ok) setPlayer(r.player)
  return r
}

export async function claimHandle(code: string): Promise<ApiResult<{ player: ArcadePlayer & { claimed: string } }>> {
  const p = await ensureSession()
  if (!p) return { ok: false, error: 'network_error' }
  const r = await api<{ player: ArcadePlayer & { claimed: string } }>('claim', { body: { code } })
  if (r.ok) setPlayer(r.player)
  return r
}

export function handleErrorCopy(code: string): string {
  switch (code) {
    case 'handle_taken':
      return 'That handle is taken'
    case 'handle_reserved':
      return 'That handle is reserved'
    case 'handle_not_allowed':
      return 'Keep it clean — try another'
    case 'invalid_handle':
      return '3–16 letters, numbers, or _'
    case 'rate_limited':
      return 'Slow down — try again in a minute'
    default:
      return 'Could not save — try again'
  }
}
