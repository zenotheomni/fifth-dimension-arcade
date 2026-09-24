import {
  getOrCreateDeviceId,
  sanitizeHandle,
  saveHandle,
} from './identity'

export async function registerPlayer(rawHandle: string): Promise<{
  ok: boolean
  handle?: string
  error?: string
  message?: string
}> {
  const handle = sanitizeHandle(rawHandle)
  if (handle.length < 3 || handle.length > 16) {
    return { ok: false, error: 'invalid_handle' }
  }
  const deviceId = getOrCreateDeviceId()
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle, deviceId }),
    })
    const data = (await res.json()) as {
      ok?: boolean
      error?: string
      message?: string
      player?: { handle?: string }
    }
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data.error ?? 'register_failed',
        message: data.message,
      }
    }
    const saved = data.player?.handle ?? handle
    saveHandle(saved)
    return { ok: true, handle: saved }
  } catch {
    return { ok: false, error: 'network' }
  }
}
