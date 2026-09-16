const STORAGE_KEY = 'fd_arcade_player_id'

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

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
