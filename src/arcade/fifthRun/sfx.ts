/** Fifth Run — synthesized WebAudio SFX (no samples). */
let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let muted = false

export function setSfxMuted(m: boolean) {
  muted = m
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.02)
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = muted ? 0 : 0.8
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -16
      comp.ratio.value = 3
      master.connect(comp)
      comp.connect(ctx.destination)
      const len = ctx.sampleRate
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
      const d = noiseBuf.getChannelData(0)
      let seed = 99991
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

function tone(a: AudioContext, t: number, f0: number, f1: number, dur: number, type: OscillatorType, peak: number, attack = 0.005) {
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g)
  g.connect(master!)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function noise(a: AudioContext, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number) {
  if (!noiseBuf) return
  const src = a.createBufferSource()
  src.buffer = noiseBuf
  const f = a.createBiquadFilter()
  f.type = type
  f.Q.value = q
  f.frequency.setValueAtTime(f0, t)
  f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur)
  const g = a.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f)
  f.connect(g)
  g.connect(master!)
  src.start(t, Math.random() * 0.5)
  src.stop(t + dur + 0.02)
}

let lastKey = 0
/** Star chime — pitch climbs with combo (pentatonic). */
export function sfxKey(combo: number, five: boolean) {
  const a = ac()
  if (!a || muted) return
  const t = a.currentTime
  if (t - lastKey < 0.035) return
  lastKey = t
  const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]
  const n = scale[combo % scale.length] + Math.floor(combo / scale.length) * 0
  const f = 880 * Math.pow(2, n / 12)
  tone(a, t, f, f * 1.01, 0.16, 'triangle', 0.13)
  tone(a, t + 0.012, f * 2, f * 2.02, 0.1, 'sine', five ? 0.09 : 0.05)
}

export function sfxJump() {
  const a = ac()
  if (!a || muted) return
  const t = a.currentTime
  noise(a, t, 0.22, 'bandpass', 700, 2600, 1.2, 0.12)
  tone(a, t, 220, 440, 0.16, 'sine', 0.06)
}

export function sfxSlide() {
  const a = ac()
  if (!a || muted) return
  noise(a, a.currentTime, 0.3, 'bandpass', 2400, 600, 0.9, 0.12)
}

export function sfxLane() {
  const a = ac()
  if (!a || muted) return
  noise(a, a.currentTime, 0.09, 'highpass', 3000, 5000, 0.7, 0.05)
}

export function sfxBump() {
  const a = ac()
  if (!a || muted) return
  const t = a.currentTime
  tone(a, t, 140, 70, 0.12, 'square', 0.06)
  noise(a, t, 0.08, 'lowpass', 900, 300, 1, 0.1)
}

export function sfxPower(kind: 'magnet' | 'five' | 'shield' | 'hand') {
  const a = ac()
  if (!a || muted) return
  const t = a.currentTime
  const base = kind === 'five' ? 523.25 : kind === 'magnet' ? 392 : kind === 'hand' ? 554.37 : 440
  ;[0, 4, 7, 12].forEach((s, i) => tone(a, t + i * 0.055, base * Math.pow(2, s / 12), base * Math.pow(2, s / 12), 0.22, 'sawtooth', 0.045))
  tone(a, t, base / 2, base, 0.35, 'sine', 0.08)
}

export function sfxMult() {
  const a = ac()
  if (!a || muted) return
  const t = a.currentTime
  ;[523.25, 659.25, 783.99].forEach((f) => tone(a, t, f, f, 0.4, 'triangle', 0.05))
}

export function sfxShieldBreak() {
  const a = ac()
  if (!a || muted) return
  const t = a.currentTime
  noise(a, t, 0.35, 'highpass', 4000, 1500, 0.8, 0.18)
  tone(a, t, 1200, 300, 0.3, 'sine', 0.08)
}

export function sfxCrash() {
  const a = ac()
  if (!a || muted) return
  const t = a.currentTime
  tone(a, t, 110, 38, 0.5, 'sine', 0.35)
  noise(a, t, 0.45, 'lowpass', 2400, 200, 0.8, 0.3)
  // glitch stutter
  for (let i = 0; i < 4; i++) tone(a, t + 0.05 + i * 0.045, 1800 - i * 300, 900, 0.03, 'square', 0.035)
}

export function sfxStart() {
  const a = ac()
  if (!a || muted) return
  const t = a.currentTime
  ;[392, 523.25, 783.99].forEach((f, i) => tone(a, t + i * 0.07, f, f, 0.25, 'triangle', 0.06))
}
