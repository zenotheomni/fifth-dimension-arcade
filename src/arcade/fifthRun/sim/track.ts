/**
 * Fifth Run — seeded endless track (v2).
 *
 * Rows of lane obstacles are generated strictly in order from a single Mulberry32 stream, so the
 * layout depends only on the seed (never on the player). Cars carry an oncoming approach speed
 * (`vs`); barriers / overheads / gaps stay static. Power-ups are 🖐️ hand (15 s invuln) only.
 * Collectibles are shooting stars (💫). The headless harness verifies survivability.
 */
import { hashSeed, mulberry32 } from '../../core/seededRandom'
import { JUMP_APEX, JUMP_T, OB, ONCOMING_WINDOW, START_CLEAR_M, levelAt, speedAt } from './constants'

export type ObKind = 'barrier' | 'overhead' | 'car' | 'gap'
/** v2: only the open-hand invuln pickup. */
export type PowerKind = 'hand'

export type Obstacle = {
  id: number
  kind: ObKind
  lane: number
  /** Spawn / meet-point distance (immutable; used for determinism & sorting). */
  s: number
  len: number
  /** Oncoming approach speed (m/s). 0 = static lane blocker. */
  vs: number
  /** visual variant (car colour / facing etc.) */
  variant: number
  smashed: boolean
}

/**
 * Live world-s of an obstacle. Oncoming cars close from ahead as the runner approaches the
 * meet point — derived only from runner.s (input-independent, deterministic).
 */
export function obstacleS(o: Obstacle, runnerS: number): number {
  if (o.vs <= 0 || o.smashed) return o.s
  const gap = o.s - runnerS
  // Past the meet point — stay put (smashed or already cleared).
  if (gap <= 0) return o.s
  // Lead distance the car starts ahead of the meet point.
  const lead = ONCOMING_WINDOW * (o.vs / (o.vs + 18))
  if (gap >= ONCOMING_WINDOW) return o.s + lead
  // Lerp from (meet + lead) down to meet as the runner closes the gap.
  return o.s + lead * (gap / ONCOMING_WINDOW)
}

export type KeyItem = {
  id: number
  lane: number
  s: number
  y: number
  /** 0 = live, 1 = taken, 2 = missed */
  state: 0 | 1 | 2
  magnet: boolean
  takenTick: number
}

export type Pickup = {
  id: number
  kind: PowerKind
  lane: number
  s: number
  y: number
  taken: boolean
  takenTick: number
}

type Tok = 'E' | 'B' | 'O' | 'C' | 'D' | 'G'

type Pattern = { p: string; min: number; w: (L: number) => number }

/** Lane multisets; lanes are randomly permuted per row. Heavier on cars for oncoming traffic feel. */
const PATTERNS: Pattern[] = [
  { p: 'BEE', min: 0, w: (L) => 0.85 - 0.5 * L },
  { p: 'OEE', min: 0, w: (L) => 0.7 - 0.4 * L },
  { p: 'CEE', min: 0, w: (L) => 1.25 - 0.35 * L },
  { p: 'CCE', min: 0, w: () => 1.35 },
  { p: 'BBE', min: 0.06, w: (L) => 0.3 + 0.25 * L },
  { p: 'OOE', min: 0.1, w: (L) => 0.25 + 0.25 * L },
  { p: 'BBB', min: 0.14, w: () => 0.45 },
  { p: 'OOO', min: 0.14, w: () => 0.4 },
  { p: 'GEE', min: 0.17, w: () => 0.4 },
  { p: 'CCB', min: 0.12, w: (L) => 0.4 + 0.9 * L },
  { p: 'CCO', min: 0.12, w: (L) => 0.4 + 0.8 * L },
  { p: 'DEE', min: 0.12, w: () => 0.55 },
  { p: 'DDE', min: 0.22, w: () => 0.65 },
  { p: 'DCE', min: 0.22, w: () => 0.5 },
  { p: 'BOE', min: 0.2, w: () => 0.35 },
  { p: 'GGE', min: 0.3, w: () => 0.35 },
  { p: 'GGG', min: 0.34, w: () => 0.38 },
  { p: 'CCG', min: 0.3, w: () => 0.5 },
  { p: 'BOC', min: 0.28, w: () => 0.55 },
  { p: 'BOB', min: 0.32, w: () => 0.3 },
  { p: 'OBO', min: 0.32, w: () => 0.3 },
  { p: 'DDB', min: 0.38, w: () => 0.5 },
  { p: 'DDO', min: 0.38, w: () => 0.5 },
  { p: 'GBO', min: 0.45, w: () => 0.28 },
]

const PERMS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
]

const q = (x: number) => Math.round(x * 100) / 100
const passable = (t: Tok) => t === 'E' || t === 'B' || t === 'O' || t === 'G'

export class Track {
  readonly seed: string
  obstacles: Obstacle[] = []
  keys: KeyItem[] = []
  pickups: Pickup[] = []
  /** rows generated so far (for stats) */
  rows = 0
  generatedTo = 0
  private rng: () => number
  private cursor = START_CLEAR_M
  private prevEnd = 0
  private pathLane = 1
  private nextId = 1
  private nextPickupS = 140
  private pickupBag: PowerKind[] = []

  constructor(seed: string) {
    this.seed = seed
    this.rng = mulberry32(hashSeed(`fifth-run|${seed}`))
    // opening runway: a short star line straight ahead
    for (let s = 14; s <= 58; s += 3) this.addKey(1, s, 0.9)
    this.prevEnd = 60
  }

  private r() {
    return this.rng()
  }

  private addKey(lane: number, s: number, y: number) {
    this.keys.push({ id: this.nextId++, lane, s: q(s), y: q(y), state: 0, magnet: false, takenTick: -1 })
  }

  private addOb(kind: ObKind, lane: number, s: number, len: number, vs = 0) {
    const variant = Math.floor(this.r() * 1000)
    this.obstacles.push({ id: this.nextId++, kind, lane, s: q(s), len: q(len), vs, variant, smashed: false })
  }

  private carVs(L: number) {
    // Oncoming: 7–16 m/s closing (plus runner speed ≈ 23–58 m/s relative)
    return q(7 + L * 9 + this.r() * 3)
  }

  private nextPower(): PowerKind {
    if (!this.pickupBag.length) {
      // bag of hands only (v2)
      const bag: PowerKind[] = ['hand', 'hand', 'hand', 'hand']
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.r() * (i + 1))
        const t = bag[i]
        bag[i] = bag[j]
        bag[j] = t
      }
      this.pickupBag = bag
    }
    return this.pickupBag.pop()!
  }

  ensure(s: number) {
    while (this.cursor < s) this.genRow()
    this.generatedTo = this.cursor
  }

  /** Drop items well behind the runner (keeps arrays short on long runs). */
  prune(behind: number) {
    const cut = behind - 40
    if (this.obstacles.length > 80 && this.obstacles[0].s + this.obstacles[0].len < cut) {
      this.obstacles = this.obstacles.filter((o) => o.s + o.len >= cut)
    }
    if (this.keys.length > 200 && this.keys[0].s < cut) this.keys = this.keys.filter((k) => k.s >= cut)
    if (this.pickups.length > 10 && this.pickups[0].s < cut) this.pickups = this.pickups.filter((p) => p.s >= cut)
  }

  private pickPattern(L: number): Tok[] {
    let total = 0
    const ws: number[] = []
    for (const p of PATTERNS) {
      const w = L >= p.min ? Math.max(0, p.w(L)) : 0
      ws.push(w)
      total += w
    }
    let x = this.r() * total
    let idx = 0
    for (; idx < PATTERNS.length - 1; idx++) {
      x -= ws[idx]
      if (x < 0) break
    }
    const src = PATTERNS[idx].p
    const perm = PERMS[Math.floor(this.r() * 6)]
    return [src[perm[0]], src[perm[1]], src[perm[2]]] as Tok[]
  }

  private genRow() {
    const s0 = this.cursor
    const L = levelAt(s0)
    const v = speedAt(s0)
    const toks = this.pickPattern(L)
    const gapLen = q(Math.min(5, Math.max(2.6, 0.3 * v)))

    let rowEnd = s0
    for (let lane = 0; lane < 3; lane++) {
      const t = toks[lane]
      if (t === 'B') {
        this.addOb('barrier', lane, s0, OB.barrier.len)
        rowEnd = Math.max(rowEnd, s0 + OB.barrier.len)
      } else if (t === 'O') {
        this.addOb('overhead', lane, s0, OB.overhead.len)
        rowEnd = Math.max(rowEnd, s0 + OB.overhead.len)
      } else if (t === 'C') {
        this.addOb('car', lane, s0, OB.car.len, this.carVs(L))
        rowEnd = Math.max(rowEnd, s0 + OB.car.len)
      } else if (t === 'D') {
        const vs = this.carVs(L)
        this.addOb('car', lane, s0, OB.car.len, vs)
        this.addOb('car', lane, s0 + OB.car.len + 0.3, OB.car.len, vs)
        rowEnd = Math.max(rowEnd, s0 + 2 * OB.car.len + 0.3)
      } else if (t === 'G') {
        this.addOb('gap', lane, s0, gapLen)
        rowEnd = Math.max(rowEnd, s0 + gapLen)
      }
    }

    // ── stars: corridor line in the path lane leading into this row, then through/over it ──
    const options = [0, 1, 2].filter((l) => passable(toks[l]))
    let path = options[0]
    if (this.r() < 0.3) path = options[Math.floor(this.r() * options.length)]
    else {
      let best = 99
      for (const l of options) {
        const d = Math.abs(l - this.pathLane) + this.r() * 0.5
        if (d < best) {
          best = d
          path = l
        }
      }
    }
    const changed = path !== this.pathLane
    if (this.r() < 0.84) {
      const start = this.prevEnd + (changed ? Math.max(4, v * 0.4) : 2.2)
      const tok = toks[path]
      const end = tok === 'E' ? rowEnd + 1 : s0 - (tok === 'O' ? 2.2 : v * 0.22 + 1.4)
      const keyS: number[] = []
      for (let s = start; s <= end; s += 2.8) keyS.push(s)
      let pickupAt = -1
      if (s0 >= this.nextPickupS && keyS.length >= 3) {
        pickupAt = Math.floor(keyS.length / 2)
        this.nextPickupS = s0 + 200 + this.r() * 140
      }
      keyS.forEach((s, i) => {
        if (i === pickupAt) {
          this.pickups.push({ id: this.nextId++, kind: this.nextPower(), lane: path, s: q(s), y: 1.0, taken: false, takenTick: -1 })
        } else this.addKey(path, s, 0.9)
      })
      if (tok === 'B' || tok === 'G') {
        const mid = tok === 'B' ? s0 + OB.barrier.len / 2 : s0 + gapLen / 2
        const half = (v * JUMP_T) / 2
        for (const f of [-0.6, -0.3, 0, 0.3, 0.6]) {
          const tau = f
          const feet = JUMP_APEX * (1 - tau * tau)
          this.addKey(path, mid + f * half, feet + 0.85)
        }
      } else if (tok === 'O') {
        for (const d of [-1.5, 0.2, 1.9]) this.addKey(path, s0 + d, 0.45)
      }
    }
    this.pathLane = path
    this.prevEnd = rowEnd

    // ── spacing to next row: reaction time shrinks with difficulty ──
    const base = 1.45 - 0.9 * L
    const T = Math.max(0.58, base * (0.85 + 0.4 * this.r()))
    this.cursor = q(rowEnd + Math.max(10, v * T))
    this.rows++
  }
}
