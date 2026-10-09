/**
 * Court Vision 3D — fully synthesized SFX (WebAudio). No samples, no
 * copyrighted audio: filtered noise + inharmonic partials.
 *
 * Uses the arcade's shared AudioContext (src/arcade/audio/audioContext.ts),
 * the same one the scene music runs through, so a single tap unlocks both on
 * iOS. Music is handled by src/arcade/audio/sceneMusic.ts.
 *
 *   voices ─► sfxBus (SFX_LEVEL) ─► compressor ─► mute ─► destination
 */
import { getAudioContext } from '../audio/audioContext'

/** Overall SFX bus — every voice below is scaled by this (music sits at 0.4). */
export const SFX_LEVEL = 0.42

let ctx: AudioContext | null = null
let sfxBus: GainNode | null = null
let out: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let muted = false

function ac(): AudioContext | null {
  const a = getAudioContext()
  if (!a) return null
  if (ctx !== a) {
    ctx = a
    out = a.createGain()
    out.gain.value = muted ? 0 : 1
    out.connect(a.destination)
    sfxBus = a.createGain()
    sfxBus.gain.value = SFX_LEVEL
    const comp = a.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 3
    sfxBus.connect(comp)
    comp.connect(out)
    const len = a.sampleRate * 2
    noiseBuf = a.createBuffer(1, len, a.sampleRate)
    const d = noiseBuf.getChannelData(0)
    let seed = 1234567
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      d[i] = (seed / 4294967296) * 2 - 1
    }
  }
  return a
}

/** Call from a user gesture (first tap) — creates/resumes the shared context. */
export function unlockSfx() {
  ac()
}

export function setSfxMuted(m: boolean) {
  muted = m
  if (out && ctx) out.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.03)
}

// ── SFX voices ─────────────────────────────────────────────────────────

/** ±pct random factor so repeats don't sound robotic. */
const jit = (pct: number) => 1 + (Math.random() * 2 - 1) * pct

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
  if (!noiseBuf || !sfxBus) return
  const src = a.createBufferSource()
  src.buffer = noiseBuf
  const filt = a.createBiquadFilter()
  filt.type = type
  filt.Q.value = q
  filt.frequency.setValueAtTime(f0, t)
  filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur)
  const g = a.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filt)
  filt.connect(g)
  g.connect(sfxBus)
  src.start(t, Math.random() * 1.5)
  src.stop(t + dur + 0.05)
}

function partial(a: AudioContext, t: number, f: number, dur: number, peak: number, type: OscillatorType = 'sine', fEnd?: number) {
  if (!sfxBus) return
  const o = a.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t + dur)
  const g = a.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.003)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g)
  g.connect(sfxBus)
  o.start(t)
  o.stop(t + dur + 0.05)
}

/** Light rim tick that precedes a rim-in make (when no clank already played). */
export function sfxRimTick() {
  const a = ac()
  if (!a) return
  const t = a.currentTime
  const p = jit(0.04)
  const v = 0.55 * jit(0.12)
  const base = 480 * p
  ;[1, 2.76, 5.4].forEach((r, i) => partial(a, t, base * r, 0.22 - i * 0.05, (0.07 / (i + 1)) * v))
  noise(a, t, 0.03, 'bandpass', 3200 * p, 2200, 1.4, 0.12 * v, 0.002)
}

/**
 * Make: airy net swish + soft net snap. `clean` = pure swish (no rim);
 * rim-in makes call sfxRimTick first and pass `clean=false`.
 */
export function sfxSwish(clean: boolean) {
  const a = ac()
  if (!a) return
  const t = a.currentTime + (clean ? 0 : 0.045)
  const p = jit(0.05)
  const v = jit(0.12)
  noise(a, t, clean ? 0.34 : 0.28, 'bandpass', 5200 * p, 1700 * p, 0.9, (clean ? 0.42 : 0.3) * v, 0.014)
  noise(a, t + 0.03, 0.22, 'highpass', 3800 * p, 2400, 0.5, 0.12 * v)
  // net snap: short tight mid tick as the cords whip
  noise(a, t + 0.07, 0.06, 'bandpass', 1500 * p, 900, 2.2, 0.16 * v, 0.002)
  partial(a, t + 0.07, 70 * p, 0.16, 0.08 * v, 'sine', 48)
}

/** Flow-state layer on makes: soft rising "fire" whoosh. */
export function sfxFlow() {
  const a = ac()
  if (!a) return
  const t = a.currentTime
  const p = jit(0.06)
  const v = jit(0.12)
  noise(a, t, 0.5, 'bandpass', 380 * p, 2600 * p, 0.7, 0.22 * v, 0.12)
  noise(a, t + 0.05, 0.4, 'lowpass', 900 * p, 300, 0.5, 0.14 * v, 0.08)
}

/** Rim clank: inharmonic steel partials + transient; louder with impact. */
export function sfxRim(impact: number) {
  const a = ac()
  if (!a) return
  const t = a.currentTime
  const v = Math.min(1, 0.25 + impact / 5) * jit(0.12)
  const base = 470 * jit(0.04)
  const ratios = [1, 2.76, 5.4, 8.93]
  ratios.forEach((r, i) => partial(a, t, base * r, 0.5 - i * 0.09, (0.11 / (i + 1)) * v, 'sine'))
  noise(a, t, 0.05, 'bandpass', 3000 * jit(0.05), 1800, 1.4, 0.28 * v, 0.002)
  partial(a, t, 160 * jit(0.05), 0.12, 0.1 * v, 'triangle', 90)
}

/** Glass backboard thud: low body + mid knock + faint rattle. */
export function sfxGlass(impact: number) {
  const a = ac()
  if (!a) return
  const t = a.currentTime
  const v = Math.min(1, 0.3 + impact / 6) * jit(0.12)
  const p = jit(0.05)
  partial(a, t, 120 * p, 0.2, 0.26 * v, 'sine', 62)
  noise(a, t, 0.09, 'bandpass', 900 * p, 420, 1.2, 0.32 * v, 0.002)
  noise(a, t + 0.01, 0.25, 'bandpass', 2400 * p, 2000, 6, 0.05 * v)
}

/** Ball bounce on the court. */
export function sfxBounce(impact: number) {
  const a = ac()
  if (!a) return
  const t = a.currentTime
  const v = Math.min(1, impact / 5) * jit(0.12)
  if (v < 0.04) return
  const p = jit(0.06)
  partial(a, t, 105 * p, 0.16, 0.34 * v, 'sine', 52)
  noise(a, t, 0.05, 'lowpass', 1600 * p, 500, 0.7, 0.22 * v, 0.002)
}

/** Release whoosh. */
export function sfxRelease(power: number) {
  const a = ac()
  if (!a) return
  const t = a.currentTime
  noise(a, t, 0.22, 'bandpass', 600 * jit(0.06), 1800 + power * 600, 0.8, 0.08 * jit(0.12), 0.03)
}

/** Crowd swell on streaks — noise through vowel-like bands. */
export function sfxCrowd(level: number) {
  const a = ac()
  if (!a || !noiseBuf || !sfxBus) return
  const t = a.currentTime
  const dur = 1.6 + level * 0.6
  const peak = (0.04 + Math.min(0.09, level * 0.026)) * jit(0.1)
  for (const [f, q] of [
    [520, 0.7],
    [1150, 0.9],
    [2400, 1.2],
  ] as const) {
    const src = a.createBufferSource()
    src.buffer = noiseBuf
    const filt = a.createBiquadFilter()
    filt.type = 'bandpass'
    filt.frequency.value = f * jit(0.04)
    filt.Q.value = q
    const g = a.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.45)
    g.gain.exponentialRampToValueAtTime(peak * 0.6, t + dur * 0.6)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(filt)
    filt.connect(g)
    g.connect(sfxBus)
    src.start(t, Math.random())
    src.stop(t + dur + 0.05)
  }
}

/** Bonus time: bright rising three-note chime + shimmer. */
export function sfxTimeBonus() {
  const a = ac()
  if (!a) return
  const t = a.currentTime
  ;[784, 988, 1319].forEach((f, i) => {
    partial(a, t + i * 0.08, f, 0.42, 0.16, 'triangle')
    partial(a, t + i * 0.08, f * 2.01, 0.25, 0.04)
  })
  noise(a, t + 0.18, 0.45, 'highpass', 6000, 9000, 0.6, 0.06, 0.02)
}
