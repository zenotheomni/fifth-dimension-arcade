const STORAGE_KEY = 'fd_arcade_player_id'
const HANDLE_KEY = 'fd_arcade_handle'

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/** Anonymous device identity (persisted). Used as device_id for arcade RPCs. */
export function getOrCreatePlayerId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY)
    if (existing) return existing
    const id = createId()
    localStorage.setItem(STORAGE_KEY, id)
    return id
  } catch {
    return createId()
  }
}

export function getPlayerId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** Alias — same as getOrCreatePlayerId; clarifies device_id semantics. */
export function getOrCreateDeviceId(): string {
  return getOrCreatePlayerId()
}

export function getSavedHandle(): string | null {
  try {
    return localStorage.getItem(HANDLE_KEY)
  } catch {
    return null
  }
}

export function saveHandle(handle: string): void {
  try {
    localStorage.setItem(HANDLE_KEY, handle)
  } catch {
    /* ignore */
  }
}

export function sanitizeHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 16)
}
