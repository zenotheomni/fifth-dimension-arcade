/**
 * Soft procedural SFX — swish + bass; mint flash is visual elsewhere.
 * No external audio assets required for M2.
 */

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      ctx = new AC()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(
  frequency: number,
  start: number,
  duration: number,
  type: OscillatorType,
  gainPeak: number,
) {
  const ac = getCtx()
  if (!ac) return
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, start)
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(gainPeak, start + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(g)
  g.connect(ac.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

/** Soft net swish + low bass thump */
export function playSwish(): void {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  // airy swish (noise-ish via high sine sweep)
  tone(880, t, 0.18, 'sine', 0.08)
  tone(1320, t + 0.02, 0.14, 'triangle', 0.05)
  // bass
  tone(72, t, 0.28, 'sine', 0.14)
  tone(48, t + 0.01, 0.22, 'triangle', 0.08)
}

export function playMake(): void {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  tone(420, t, 0.12, 'sine', 0.06)
  tone(640, t + 0.04, 0.1, 'triangle', 0.04)
  tone(60, t, 0.2, 'sine', 0.09)
}

export function playMiss(): void {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  tone(180, t, 0.15, 'sine', 0.05)
  tone(110, t + 0.05, 0.2, 'triangle', 0.04)
}

export function playRelease(): void {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  tone(220, t, 0.06, 'sine', 0.03)
}

export function playBounce5d(): void {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  tone(520, t, 0.1, 'sine', 0.07)
  tone(780, t + 0.05, 0.12, 'triangle', 0.05)
  tone(90, t, 0.22, 'sine', 0.1)
}

/** Unlock audio on first user gesture */
export function unlockAudio(): void {
  getCtx()
}

export function playCoinInsert(): void {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  tone(980, t, 0.08, 'square', 0.06)
  tone(1310, t + 0.07, 0.1, 'square', 0.05)
  tone(1600, t + 0.14, 0.12, 'sine', 0.04)
}

export function playSelect(): void {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  tone(660, t, 0.06, 'square', 0.04)
  tone(880, t + 0.05, 0.08, 'sine', 0.035)
}

export function playUiConfirm(): void {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  tone(520, t, 0.05, 'square', 0.04)
  tone(780, t + 0.04, 0.1, 'triangle', 0.05)
}
