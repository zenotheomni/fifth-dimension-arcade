/**
 * Court Vision 3D — fully synthesized SFX (WebAudio). No samples, no
 * copyrighted audio: filtered noise + inharmonic partials.
 */
let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let muted = false

export function setSfxMuted(m: boolean) {
  muted = m
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.02)
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = muted ? 0 : 0.9
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -14
      comp.ratio.value = 3
      master.connect(comp)
      comp.connect(ctx.destination)
      const len = ctx.sampleRate * 2
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
      const d = noiseBuf.getChannelData(0)
      let seed = 1234567
      for (let i = 0; i < len; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0
        d[i] = (seed / 4294967296) * 2 - 1
      }
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

export function unlockSfx() {
  ac()
}

function noise(
  a: AudioContext,
  t: number,
  dur: number,
  type: BiquadFilterType,
  f0: number,
  f1: number,
  q: number,
  peak: number,
  attack = 0.008,
) {
  if (!noiseBuf || !master) return
  const src = a.createBufferSource()
  src.buffer = noiseBuf
  src.playbackRate.value = 1
  const filt = a.createBiquadFilter()
  filt.type = type
  filt.Q.value = q
  filt.frequency.setValueAtTime(f0, t)
  filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur)
  const g = a.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filt)
  filt.connect(g)
  g.connect(master)
  src.start(t, Math.random() * 1.5)
  src.stop(t + dur + 0.05)
}

function partial(a: AudioContext, t: number, f: number, dur: number, peak: number, type: OscillatorType = 'sine', fEnd?: number) {
  if (!master) return
  const o = a.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t + dur)
  const g = a.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + 0.003)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g)
  g.connect(master)
  o.start(t)
  o.stop(t + dur + 0.05)
}

/** Net swish: airy band-passed noise sweep, snappier for a clean swish. */
export function sfxSwish(clean: boolean) {
  const a = ac()
  if (!a) return
  const t = a.currentTime
  noise(a, t, clean ? 0.32 : 0.26, 'bandpass', 5200, 1700, 0.9, clean ? 0.5 : 0.32, 0.012)
  noise(a, t + 0.03, 0.22, 'highpass', 3800, 2400, 0.5, 0.16)
  partial(a, t, 70, 0.22, 0.14, 'sine', 48)
}

/** Rim clank: inharmonic steel partials + transient; louder with impact. */
export function sfxRim(impact: number) {
  const a = ac()
  if (!a) return
  const t = a.currentTime
  const v = Math.min(1, 0.25 + impact / 5)
  const base = 470 + Math.random() * 25
  const ratios = [1, 2.76, 5.4, 8.93]
  ratios.forEach((r, i) => partial(a, t, base * r, 0.55 - i * 0.1, (0.13 / (i + 1)) * v, 'sine'))
  noise(a, t, 0.05, 'bandpass', 3000, 1800, 1.4, 0.35 * v, 0.002)
  partial(a, t, 160, 0.12, 0.12 * v, 'triangle', 90)
}

/** Glass backboard thud: low body + mid knock + faint rattle. */
export function sfxGlass(impact: number) {
  const a = ac()
  if (!a) return
  const t = a.currentTime
  const v = Math.min(1, 0.3 + impact / 6)
  partial(a, t, 120, 0.2, 0.32 * v, 'sine', 62)
  noise(a, t, 0.09, 'bandpass', 900, 420, 1.2, 0.4 * v, 0.002)
  noise(a, t + 0.01, 0.25, 'bandpass', 2400, 2000, 6, 0.06 * v)
}

/** Ball bounce on asphalt. */
export function sfxBounce(impact: number) {
  const a = ac()
  if (!a) return
  const t = a.currentTime
  const v = Math.min(1, impact / 5)
  if (v < 0.04) return
  partial(a, t, 105, 0.16, 0.45 * v, 'sine', 52)
  noise(a, t, 0.05, 'lowpass', 1600, 500, 0.7, 0.3 * v, 0.002)
}

/** Release whoosh. */
export function sfxRelease(power: number) {
  const a = ac()
  if (!a) return
  const t = a.currentTime
  noise(a, t, 0.22, 'bandpass', 600, 1800 + power * 600, 0.8, 0.1, 0.03)
}

/** Crowd swell on streaks — pink-ish noise through a vowel-like band. */
export function sfxCrowd(level: number) {
  const a = ac()
  if (!a || !noiseBuf || !master) return
  const t = a.currentTime
  const dur = 1.6 + level * 0.6
  const peak = 0.05 + Math.min(0.12, level * 0.035)
  for (const [f, q] of [
    [520, 0.7],
    [1150, 0.9],
    [2400, 1.2],
  ] as const) {
    const src = a.createBufferSource()
    src.buffer = noiseBuf
    const filt = a.createBiquadFilter()
    filt.type = 'bandpass'
    filt.frequency.value = f
    filt.Q.value = q
    const g = a.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.45)
    g.gain.exponentialRampToValueAtTime(peak * 0.6, t + dur * 0.6)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(filt)
    filt.connect(g)
    g.connect(master)
    src.start(t, Math.random())
    src.stop(t + dur + 0.05)
  }
}
