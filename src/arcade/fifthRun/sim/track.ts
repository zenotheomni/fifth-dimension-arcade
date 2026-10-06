/**
 * Fifth Run — seeded endless track.
 *
 * Rows of lane obstacles are generated strictly in order from a single Mulberry32 stream, so the
 * layout depends only on the seed (never on the player). Every row keeps ≥1 lane passable
 * (open, jumpable or slidable) and rows are spaced by a minimum reaction time at the current speed.
 * The headless harness (scripts/fr-tune.mjs) verifies survivability with an exhaustive search.
 */
import { hashSeed, mulberry32 } from '../../core/seededRandom'
import { JUMP_APEX, JUMP_T, OB, START_CLEAR_M, levelAt, speedAt } from './constants'

export type ObKind = 'barrier' | 'overhead' | 'car' | 'gap'
export type PowerKind = 'magnet' | 'five' | 'shield'

export type Obstacle = {
  id: number
  kind: ObKind
  lane: number
  s: number
  len: number
  /** visual variant (car colour / facing etc.) */
  variant: number
  smashed: boolean
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

/** Lane multisets; lanes are randomly permuted per row. */
const PATTERNS: Pattern[] = [
  { p: 'BEE', min: 0, w: (L) => 1.0 - 0.6 * L },
  { p: 'OEE', min: 0, w: (L) => 0.85 - 0.5 * L },
  { p: 'CEE', min: 0, w: (L) => 1.0 - 0.55 * L },
  { p: 'CCE', min: 0, w: () => 1.15 },
  { p: 'BBE', min: 0.06, w: (L) => 0.35 + 0.3 * L },
  { p: 'OOE', min: 0.1, w: (L) => 0.3 + 0.3 * L },
  { p: 'BBB', min: 0.14, w: () => 0.55 },
  { p: 'OOO', min: 0.14, w: () => 0.5 },
  { p: 'GEE', min: 0.17, w: () => 0.45 },
  { p: 'CCB', min: 0.15, w: (L) => 0.3 + 0.8 * L },
  { p: 'CCO', min: 0.15, w: (L) => 0.3 + 0.7 * L },
  { p: 'DEE', min: 0.15, w: () => 0.45 },
  { p: 'DDE', min: 0.24, w: () => 0.55 },
  { p: 'DCE', min: 0.24, w: () => 0.45 },
  { p: 'BOE', min: 0.2, w: () => 0.4 },
  { p: 'GGE', min: 0.3, w: () => 0.4 },
  { p: 'GGG', min: 0.34, w: () => 0.42 },
  { p: 'CCG', min: 0.34, w: () => 0.45 },
  { p: 'BOC', min: 0.3, w: () => 0.55 },
  { p: 'BOB', min: 0.32, w: () => 0.35 },
  { p: 'OBO', min: 0.32, w: () => 0.35 },
  { p: 'DDB', min: 0.4, w: () => 0.45 },
  { p: 'DDO', min: 0.4, w: () => 0.45 },
  { p: 'GBO', min: 0.45, w: () => 0.3 },
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
  private nextPickupS = 170
  private pickupBag: PowerKind[] = []

  constructor(seed: string) {
    this.seed = seed
    this.rng = mulberry32(hashSeed(`fifth-run|${seed}`))
    // opening runway: a short key line straight ahead
    for (let s = 14; s <= 58; s += 3) this.addKey(1, s, 0.9)
    this.prevEnd = 60
  }

  private r() {
    return this.rng()
  }

  private addKey(lane: number, s: number, y: number) {
    this.keys.push({ id: this.nextId++, lane, s: q(s), y: q(y), state: 0, magnet: false, takenTick: -1 })
  }

  private addOb(kind: ObKind, lane: number, s: number, len: number) {
    const variant = Math.floor(this.r() * 1000)
    this.obstacles.push({ id: this.nextId++, kind, lane, s: q(s), len: q(len), variant, smashed: false })
  }

  private nextPower(): PowerKind {
    if (!this.pickupBag.length) {
      const bag: PowerKind[] = ['magnet', 'five', 'shield', 'magnet', 'five', 'shield']
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
        this.addOb('car', lane, s0, OB.car.len)
        rowEnd = Math.max(rowEnd, s0 + OB.car.len)
      } else if (t === 'D') {
        this.addOb('car', lane, s0, OB.car.len)
        this.addOb('car', lane, s0 + OB.car.len + 0.3, OB.car.len)
        rowEnd = Math.max(rowEnd, s0 + 2 * OB.car.len + 0.3)
      } else if (t === 'G') {
        this.addOb('gap', lane, s0, gapLen)
        rowEnd = Math.max(rowEnd, s0 + gapLen)
      }
    }

    // ── keys: corridor line in the path lane leading into this row, then through/over it ──
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
    if (this.r() < 0.82) {
      const start = this.prevEnd + (changed ? Math.max(4, v * 0.45) : 2.5)
      const tok = toks[path]
      const end = tok === 'E' ? rowEnd + 1 : s0 - (tok === 'O' ? 2.2 : v * 0.25 + 1.5)
      const keyS: number[] = []
      for (let s = start; s <= end; s += 3) keyS.push(s)
      let pickupAt = -1
      if (s0 >= this.nextPickupS && keyS.length >= 3) {
        pickupAt = Math.floor(keyS.length / 2)
        this.nextPickupS = s0 + 250 + this.r() * 170
      }
      keyS.forEach((s, i) => {
        if (i === pickupAt) {
          this.pickups.push({ id: this.nextId++, kind: this.nextPower(), lane: path, s: q(s), y: 1.0, taken: false, takenTick: -1 })
        } else this.addKey(path, s, 0.9)
      })
      if (tok === 'B' || tok === 'G') {
        // arc over the obstacle, matching a jump whose apex is centred on it
        const mid = tok === 'B' ? s0 + OB.barrier.len / 2 : s0 + gapLen / 2
        const half = (v * JUMP_T) / 2
        for (const f of [-0.6, -0.3, 0, 0.3, 0.6]) {
          const tau = f // fraction of half-airtime
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
    const base = 1.4 - 0.95 * L
    const T = Math.max(0.55, base * (0.85 + 0.4 * this.r()))
    this.cursor = q(rowEnd + Math.max(9, v * T))
    this.rows++
  }
}
