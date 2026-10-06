import { useEffect, useState } from 'react'

/** Clock aligned to the server (`server_now` from the API) so countdowns don't trust a skewed phone clock. */
export function useServerNow(serverNow: string | null | undefined, tickMs = 1000): number {
  const [offset, setOffset] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!serverNow) return
    const t = Date.parse(serverNow)
    if (Number.isFinite(t)) setOffset(t - Date.now())
  }, [serverNow])
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), tickMs)
    return () => window.clearInterval(id)
  }, [tickMs])
  return now + offset
}

export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`
}

export function shortWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}
