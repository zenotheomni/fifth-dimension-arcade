/**
 * One shared WebAudio context for arcade music + Court Vision SFX.
 *
 * iOS Safari: the context must be created/resumed inside a user gesture. We
 * resume on every tap while it isn't running (iOS can leave it "suspended" or
 * "interrupted" after calls/Siri/lock screen), suspend when the tab is hidden
 * and resume when it's visible again. Listeners registered via onGesture run
 * synchronously inside the tap so they may call HTMLMediaElement.play().
 */
let ctx: AudioContext | null = null
let bound = false
const gestureHooks = new Set<() => void>()
const visibilityHooks = new Set<(hidden: boolean) => void>()

function bind() {
  if (bound || typeof window === 'undefined') return
  bound = true
  const onTap = () => {
    if (ctx && ctx.state !== 'running' && !document.hidden) void ctx.resume().catch(() => {})
    gestureHooks.forEach((fn) => fn())
  }
  // capture phase: runs before React handlers, still inside the gesture
  window.addEventListener('pointerdown', onTap, { capture: true, passive: true })
  window.addEventListener('touchend', onTap, { capture: true, passive: true })
  window.addEventListener('keydown', onTap, { capture: true, passive: true })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void ctx?.suspend().catch(() => {})
    else void ctx?.resume().catch(() => {})
    visibilityHooks.forEach((fn) => fn(document.hidden))
  })
}

/** Get (and lazily create) the shared context. Call from a gesture the first time on iOS. */
export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  bind()
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state !== 'running' && !document.hidden) void ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

/** Context if it already exists (never creates one). */
export function peekAudioContext(): AudioContext | null {
  return ctx
}

export function onGesture(fn: () => void): () => void {
  bind()
  gestureHooks.add(fn)
  return () => gestureHooks.delete(fn)
}

export function onVisibility(fn: (hidden: boolean) => void): () => void {
  bind()
  visibilityHooks.add(fn)
  return () => visibilityHooks.delete(fn)
}
