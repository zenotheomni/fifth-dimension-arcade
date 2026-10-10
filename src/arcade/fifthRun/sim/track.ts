/**
 * Fifth Glide — seeded endless Temple Run path.
 *
 * Everything is generated strictly in order from a single Mulberry32 stream, so the layout depends
 * only on the seed (never on the player). The path is straight segments joined by 90° corners and
 * T-junctions (`corners`), all addressed by path distance `s`; which way the path bends in 3D is a
 * render concern (render/layout.ts). Kit: low rubble (jump), arches (slide), pipes (either), gaps
 * (jump), missing lanes (narrow sections / edge drop-offs), crate stacks and 1959 Cadillac wrecks
 * (switch lanes). Power-up: the Fifth Dimension logo. Collectibles: shooting stars (💫).
 */
import { hashSeed, mulberry32 } from '../../core/seededRandom'
import { CORNER, JUMP_APEX, JUMP_T, OB, VOID, laneX, START_CLEAR_M, levelAt, speedAt, voidChanceAt, warmAt } from './constants'

/** void = a lane of the path is missing (narrow section / edge drop-off); car = static Cadillac wreck */
export type ObKind = 'barrier' | 'overhead' | 'pipe' | 'block' | 'gap' | 'void' | 'car'

/** 90° corner (L / R) or T-junction (either way), centred at path distance `s`. */
export type CornerKind = 'L' | 'R' | 'T'
export type Corner = { id: number; s: number; kind: CornerKind }
/** Rare 5D logo invuln pickup. */
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

/** World-s of an obstacle (everything is static on the sky path; kept as a function for callers). */
export function obstacleS(o: Obstacle, runnerS: number): number {
  void runnerS
  return o.s
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
  /** motion: 0 static · 1 bob (up/down, some need a jump) · 2 drift (slides lane0 → lane) · 3 zig-zag (snakes across lanes) */
  mv: 0 | 1 | 2 | 3
  /** phase (bob / zig-zag) */
  a: number
  /** drift start lane */
  lane0: number
}

/**
 * Star position. Stars sit still in their lane (Temple Run coin lines) — the old drift / zig-zag
 * motion made them hard to catch. `mv === 1` lines get a slow visual bob in the renderer only.
 */
export function keyPos(k: KeyItem, runnerS: number): { x: number; y: number } {
  void runnerS
  return { x: laneX(k.lane), y: k.y }
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

type Tok = 'E' | 'B' | 'O' | 'P' | 'K' | 'G'

type Pattern = { p: string; min: number; w: (L: number) => number }

/** Lane multisets (Temple Run kit): B = low barrier (jump), O = overhead beam (slide),
 * G = gap in the path (jump or fall), K = tall crate stack (switch lanes). E = clear.
 * Full-width rows (BBB / OOO / GGG) are the signature "you must jump / slide" moments. */
const PATTERNS: Pattern[] = [
  { p: 'BEE', min: 0, w: (L) => 2.0 - 0.8 * L },
  { p: 'OEE', min: 0, w: (L) => 1.6 - 0.6 * L },
  { p: 'KEE', min: 0, w: (L) => 1.6 - 0.6 * L },
  { p: 'GEE', min: 0, w: (L) => 1.0 - 0.3 * L },
  { p: 'BBB', min: 0, w: (L) => 1.3 + 0.4 * L },
  { p: 'OOO', min: 0.02, w: (L) => 1.1 + 0.4 * L },
  { p: 'GGG', min: 0.05, w: (L) => 0.9 + 0.6 * L },
  { p: 'KKE', min: 0.04, w: (L) => 1.0 + 0.6 * L },
  { p: 'KBE', min: 0.08, w: (L) => 0.6 + 0.6 * L },
  { p: 'KOE', min: 0.08, w: (L) => 0.6 + 0.6 * L },
  { p: 'BOE', min: 0.14, w: (L) => 0.5 + 0.6 * L },
  // P = chest-high pipe: jump over OR slide under (Temple Run "either" gate)
  { p: 'PEE', min: 0, w: (L) => 0.9 - 0.2 * L },
  { p: 'PPP', min: 0.06, w: (L) => 0.7 + 0.3 * L },
  { p: 'KPE', min: 0.12, w: (L) => 0.4 + 0.5 * L },
  { p: 'KKB', min: 0.18, w: (L) => 0.3 + 0.9 * L },
  { p: 'KKO', min: 0.18, w: (L) => 0.3 + 0.9 * L },
  { p: 'KKG', min: 0.26, w: (L) => 0.2 + 0.8 * L },
  { p: 'BOG', min: 0.3, w: (L) => 0.2 + 0.7 * L },
  { p: 'GKG', min: 0.34, w: (L) => 0.2 + 0.6 * L },
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
const passable = (t: Tok) => t !== 'K'

/** Star coin lines (Temple Run): LINE_MIN..LINE_MAX stars STAR_SPACING m apart, then ≥ LINE_GAP_MIN m (and ≥ ~1.1 s) of nothing. */
export const STAR_SPACING = 3
export const LINE_MIN = 8
/** base line length max; a jump arc / slide trio can add ≤ 2 more, so a line never exceeds 15 */
export const LINE_MAX = 13
export const LINE_GAP_MIN = 40

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
  private nextPickupS = 520
  private pickupBag: PowerKind[] = []
  /** star coin-line state: stars left in the current line, where the next line may start, bob flag */
  private lineLeft = 0
  private lineLen = 0
  private lineGapTo = 0
  private lineBob = false
  /** first s a new star may use (after the previous row's jump arc) */
  private starFloor = 0
  corners: Corner[] = []
  private nextCornerS = 0
  private lastTurns: CornerKind[] = []
  voids = 0
  cars = 0

  constructor(seed: string) {
    this.seed = seed
    this.rng = mulberry32(hashSeed(`fifth-run|${seed}`))
    // opening runway: one 12-star line straight ahead, then a real gap
    for (let s = 14; s <= 47; s += STAR_SPACING) this.addKey(1, s, 0.9)
    this.lineGapTo = 47 + LINE_GAP_MIN
    this.prevEnd = 60
    // first corner after a calm straight (~10 s) so the turn is learned on its own
    this.nextCornerS = 230 + Math.floor(this.r() * 40)
  }

  private r() {
    return this.rng()
  }

  private addKey(lane: number, s: number, y: number, mv: 0 | 1 | 2 | 3 = 0, a = 0, lane0 = lane) {
    this.keys.push({ id: this.nextId++, lane, s: q(s), y: q(y), state: 0, magnet: false, takenTick: -1, mv, a: q(a), lane0 })
  }

  private addOb(kind: ObKind, lane: number, s: number, len: number, vs = 0) {
    const variant = Math.floor(this.r() * 1000)
    this.obstacles.push({ id: this.nextId++, kind, lane, s: q(s), len: q(len), vs, variant, smashed: false })
  }

  /** Next corner: L / R (never three the same way in a row, so the path can't fold back on itself) or T. */
  private addCorner() {
    const cs = this.nextCornerS
    const L = levelAt(cs)
    let kind: CornerKind
    if (this.corners.length >= 1 && this.r() < CORNER.tP) kind = 'T'
    else {
      kind = this.r() < 0.5 ? 'L' : 'R'
      const n = this.lastTurns.length
      if (n >= 2 && this.lastTurns[n - 1] === kind && this.lastTurns[n - 2] === kind) kind = kind === 'L' ? 'R' : 'L'
    }
    if (kind !== 'T') {
      this.lastTurns.push(kind)
      if (this.lastTurns.length > 4) this.lastTurns.shift()
    }
    this.corners.push({ id: this.nextId++, s: cs, kind })
    const v = speedAt(cs)
    // nothing on the corner square or just after it (a T keeps both arms empty for postT m)
    const after = q(cs + CORNER.half + (kind === 'T' ? CORNER.postT : Math.max(14, v * CORNER.postS)))
    if (this.lineLeft > 0) this.endLine(this.prevEnd, v)
    this.lineGapTo = Math.max(this.lineGapTo, after + 4)
    this.cursor = after
    this.prevEnd = after
    this.starFloor = after + 2
    const segMin = CORNER.segMin + (CORNER.segMinHard - CORNER.segMin) * L
    const segMax = CORNER.segMax + (CORNER.segMaxHard - CORNER.segMax) * L
    const seg = segMin + this.r() * (segMax - segMin)
    this.nextCornerS = q(Math.max(cs + seg, after + v * 3.2))
  }

  /**
   * A stretch where lanes are missing: narrow (only the middle lane) or an edge drop-off (one side
   * lane gone). Starts with a reaction lead after the previous row. Returns false if it doesn't fit.
   */
  private maybeVoid(s0: number, v: number, L: number): boolean {
    const p = voidChanceAt(s0)
    if (p <= 0 || this.r() >= p) return false
    const lead = v * 0.55
    const start = q(s0 + lead)
    const len = q(VOID.minLen + this.r() * (VOID.maxLen - VOID.minLen) * (0.6 + 0.4 * L))
    const end = start + len
    if (end + v * 1.1 + CORNER.half + 8 > this.nextCornerS) return false
    const narrow = this.r() < 0.5
    const side = this.r() < 0.5 ? 0 : 2
    const gone = narrow ? [0, 2] : [side]
    for (const l of gone) this.addOb('void', l, start, len)
    this.voids++
    const open = [0, 1, 2].filter((l) => !gone.includes(l))
    // stars run the open lane (the one nearest the current line)
    let path = open[0]
    for (const l of open) if (Math.abs(l - this.pathLane) < Math.abs(path - this.pathLane)) path = l
    // later on: a hurdle or an arch inside the narrow stretch
    let mid = -1
    if (L > 0.2 && len > 24 && this.r() < 0.55 + 0.4 * L) {
      mid = q(start + len * (0.4 + this.r() * 0.2))
      const kind = this.r() < 0.5 ? 'barrier' : 'overhead'
      for (const l of open) this.addOb(kind, l, mid, kind === 'barrier' ? OB.barrier.len : OB.overhead.len)
    }
    if (this.lineLeft <= 0 && start >= this.lineGapTo) this.startLine()
    for (let s = Math.max(start + 3, this.starFloor); s <= end - 2 && this.lineLeft > 0; s += STAR_SPACING) {
      if (mid > 0 && Math.abs(s - mid) < v * 0.35) continue
      this.placeLineStar(path, s, 0.9, start)
    }
    this.obstacles.sort((a, b) => a.s - b.s || a.id - b.id)
    this.pathLane = path
    this.prevEnd = end
    this.starFloor = end + STAR_SPACING
    this.cursor = q(end + Math.max(8, v * 0.6))
    this.rows++
    return true
  }

  private startLine() {
    this.lineLen = LINE_MIN + Math.floor(this.r() * (LINE_MAX - LINE_MIN + 1))
    this.lineLeft = this.lineLen
    this.lineBob = this.r() < 0.35
  }

  private endLine(at: number, v: number) {
    this.lineLeft = 0
    this.lineGapTo = q(at + Math.max(LINE_GAP_MIN, v * 1.1) + this.r() * 30)
  }

  /** One star of the running line (or the rare 5D logo in its middle when one is due). */
  private placeLineStar(lane: number, s: number, y: number, rowS: number) {
    const i = this.lineLen - this.lineLeft
    if (rowS >= this.nextPickupS && i === Math.floor(this.lineLen / 2)) {
      this.pickups.push({ id: this.nextId++, kind: this.nextPower(), lane, s: q(s), y: 1.0, taken: false, takenTick: -1 })
      this.nextPickupS = rowS + 900 + this.r() * 600
    } else this.addKey(lane, s, y, this.lineBob ? 1 : 0, i * 0.12)
    this.lineLeft--
    if (this.lineLeft <= 0) this.endLine(s, speedAt(s))
  }

  private nextPower(): PowerKind {
    if (!this.pickupBag.length) {
      // bag of 5D logos
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
    if (this.corners.length > 12 && this.corners[0].s < cut - 100) this.corners = this.corners.filter((c) => c.s >= cut - 100)
    if (this.obstacles.length > 80 && this.obstacles[0].s + this.obstacles[0].len < cut) {
      this.obstacles = this.obstacles.filter((o) => o.s + o.len >= cut)
    }
    if (this.keys.length > 200 && this.keys[0].s < cut) this.keys = this.keys.filter((k) => k.s >= cut)
    if (this.pickups.length > 10 && this.pickups[0].s < cut) this.pickups = this.pickups.filter((p) => p.s >= cut)
  }

  private pickPattern(L: number, W = 0): Tok[] {
    let total = 0
    const ws: number[] = []
    for (const p of PATTERNS) {
      let w = L >= p.min ? Math.max(0, p.w(L)) : 0
      // warm-up: multi-car rows fade in only as the warm-up ends
      // warm-up: forced-lane combos (two crates, mixed rows) fade in only as the warm-up ends
      if (W > 0 && /K.*K|BO|G.*G.*K|GKG/.test(p.p) && p.p !== 'GGG') w *= W > 0.5 ? 0 : 1 - 2 * W
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
    const W = warmAt(s0)
    const v = speedAt(s0)
    // corner due: keep its approach clear (≈ CORNER.preS of running) and build it
    if (s0 + 8 > this.nextCornerS - CORNER.half - v * CORNER.preS) {
      this.addCorner()
      return
    }
    if (this.maybeVoid(s0, v, L)) return
    const toks = this.pickPattern(L, W)
    // first rows: never put a crate straight in the start lane before the player has learned to swipe
    if (W > 0.62 && toks[1] === 'K') {
      const e = toks[0] === 'E' ? 0 : 2
      toks[1] = toks[e]
      toks[e] = 'K'
    }
    const gapLen = q(Math.min(5, Math.max(2.6, 0.3 * v)))
    if (W > 0.62 && toks.includes('P')) {
      // warm-up: teach jump and slide separately first
      for (let i = 0; i < 3; i++) if (toks[i] === 'P') toks[i] = 'O'
    }

    let rowEnd = s0
    for (let lane = 0; lane < 3; lane++) {
      const t = toks[lane]
      if (t === 'B') {
        this.addOb('barrier', lane, s0, OB.barrier.len)
        rowEnd = Math.max(rowEnd, s0 + OB.barrier.len)
      } else if (t === 'O') {
        this.addOb('overhead', lane, s0, OB.overhead.len)
        rowEnd = Math.max(rowEnd, s0 + OB.overhead.len)
      } else if (t === 'P') {
        this.addOb('pipe', lane, s0, OB.pipe.len)
        rowEnd = Math.max(rowEnd, s0 + OB.pipe.len)
      } else if (t === 'K') {
        // crate stack or a wrecked '59 Cadillac across the lane
        if (this.r() < 0.4) {
          this.addOb('car', lane, s0, OB.car.len)
          this.cars++
          rowEnd = Math.max(rowEnd, s0 + OB.car.len)
        } else {
          this.addOb('block', lane, s0, OB.block.len)
          rowEnd = Math.max(rowEnd, s0 + OB.block.len)
        }
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
    // a running coin line stays in its lane whenever that lane is open
    if (this.lineLeft > 0 && passable(toks[this.pathLane])) path = this.pathLane
    const changed = path !== this.pathLane
    const tok = toks[path]
    // ── stars: short coin lines in the path lane, then a real gap (never a continuous river) ──
    // lane change inside a running line: the stars swerve right after the previous row (no hole in the line)
    const start = this.prevEnd + (changed && this.lineLeft > 0 ? Math.max(3, v * 0.12) : 2.2)
    const end = tok === 'E' ? rowEnd + 1 : s0 - (tok === 'O' ? 3.5 : v * 0.22 + 1.4)
    for (let s = Math.max(start, this.starFloor); s <= end; s += STAR_SPACING) {
      if (this.lineLeft <= 0) {
        if (s < this.lineGapTo) continue
        this.startLine()
      }
      this.placeLineStar(path, s, 0.9, s0)
    }
    // finish the move over / under this row's obstacle when a line is running through it
    if (this.lineLeft > 0) {
      let lastS = rowEnd
      if (tok === 'B' || tok === 'G' || tok === 'P') {
        const len = tok === 'B' ? OB.barrier.len : tok === 'P' ? OB.pipe.len : gapLen
        const mid = s0 + len / 2
        const half = (v * JUMP_T) / 2
        for (const f of this.lineLeft >= 5 ? [-0.5, -0.25, 0, 0.25, 0.5] : [-0.35, 0, 0.35]) {
          const feet = JUMP_APEX * (1 - f * f)
          this.addKey(path, mid + f * half, feet + 0.85)
          this.lineLeft--
          lastS = Math.max(lastS, mid + f * half)
        }
      } else if (tok === 'O') {
        for (const d of [-1.5, 0.2, 1.9]) {
          this.addKey(path, s0 + d, 0.45)
          this.lineLeft--
        }
      }
      this.starFloor = lastS + STAR_SPACING
      if (this.lineLeft <= 0) this.endLine(lastS, v)
    }
    // keep keys sorted by s (bait / floaters can land out of order); only the freshly generated
    // tail (far ahead of the runner) is touched
    const n0 = Math.max(0, this.keys.length - 40)
    const tail = this.keys.slice(n0).sort((a, b) => a.s - b.s || a.id - b.id)
    for (let i = 0; i < tail.length; i++) this.keys[n0 + i] = tail[i]
    this.pathLane = path
    this.prevEnd = rowEnd

    // ── spacing to next wave: reaction window shrinks; density ramps like Surfers ──
    const base = 0.78 - 0.5 * L
    // warm-up: up to ~2.9× the gap between waves at the start line, tapering by WARM_M; a little
    // extra breathing room while the level is still low (fades out as L → 1)
    const T = Math.max(0.28, base * (0.7 + 0.35 * this.r()) * (1 + 1.6 * W + 0.3 * (1 - L)))
    this.cursor = q(rowEnd + Math.max(5.2, v * T))
    this.rows++
  }
}
