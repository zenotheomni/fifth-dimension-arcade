/** Mulberry32 — deterministic PRNG from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** Hash arbitrary string → uint32 for seeding. */
export function hashSeed(input: string): number {
  const s = input || 'fifth-floor'
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export type CourtVisionSeedConfig = {
  /** Horizontal sway amplitude in px */
  swayAmpX: number
  /** Vertical sway amplitude in px */
  swayAmpY: number
  /** Sway speed (radians / ms) */
  swaySpeed: number
  /** Phase offset */
  swayPhase: number
  /** Ball home X offset from center */
  ballHomeOffsetX: number
  /** Lateral wind bias applied to shot target (-1..1 scaled) */
  windBias: number
  /** Extra aim noise scale (challenge feel) */
  aimJitter: number
}

export function courtVisionSeedConfig(seed: string): CourtVisionSeedConfig {
  const rnd = mulberry32(hashSeed(seed))
  const r = () => rnd()
  return {
    swayAmpX: 10 + r() * 22, // 10–32px
    swayAmpY: 3 + r() * 8, // 3–11px
    swaySpeed: 0.0011 + r() * 0.0018,
    swayPhase: r() * Math.PI * 2,
    ballHomeOffsetX: (r() - 0.5) * 36,
    windBias: (r() - 0.5) * 2, // -1..1
    aimJitter: 0.04 + r() * 0.08,
  }
}
