/**
 * Web Push opt-in. Never called on load — only from the "Turn on alerts" button that appears
 * after a player sends or accepts a challenge (so the permission prompt has context + a gesture).
 */
import { api, ensureSession } from './session'

const BASE = import.meta.env.BASE_URL
const PREF_KEY = 'fd_arcade_alerts'
const DISMISS_KEY = 'fd_arcade_alerts_dismissed_at'

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export type AlertsState = 'on' | 'available' | 'ios-install' | 'denied' | 'unsupported'

export function alertsState(): AlertsState {
  if (isIos() && !isStandalone()) return 'ios-install'
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'granted' && localStorage.getItem(PREF_KEY) === 'on') return 'on'
  return 'available'
}

export function shouldOfferAlerts(): boolean {
  const s = alertsState()
  if (s === 'on' || s === 'denied' || s === 'unsupported') return false
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
    if (at && Date.now() - at < 3 * 24 * 3600_000) return false
  } catch {
    /* ignore */
  }
  return true
}

export function dismissAlertsOffer() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Must run inside a user gesture (button click). */
export async function enableAlerts(): Promise<'on' | 'denied' | 'unsupported' | 'error'> {
  if (!pushSupported()) return 'unsupported'
  try {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return 'denied'
    const reg = await navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE })
    await navigator.serviceWorker.ready
    const cfg = await api<{ enabled: boolean; publicKey: string | null }>('push-config', { auth: false })
    if (!cfg.ok || !cfg.publicKey) return 'unsupported'
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(cfg.publicKey),
      })
    }
    await ensureSession()
    const r = await api('push-subscribe', { body: { subscription: sub.toJSON() } })
    if (!r.ok) return 'error'
    localStorage.setItem(PREF_KEY, 'on')
    return 'on'
  } catch (e) {
    console.warn('[arcade] enableAlerts failed', e)
    return 'error'
  }
}
