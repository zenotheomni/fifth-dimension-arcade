/**
 * Fifth Glide — seeded endless Temple Run path.
 *
 * Everything is generated strictly in order from a single Mulberry32 stream, so the layout depends
 * only on the seed (never on the player). The path is straight segments joined by 90° corners and
 * T-junctions (`corners`), all addressed by path distance `s`; which way the path bends in 3D is a
 * render concern (render/layout.ts). Kit: low rubble (jump), arches (slide), pipes (either), gaps
 * (jump), missing lanes (narrow sections / edge drop-offs), crashed rockets and crashed satellites
 * (switch lanes). Power-up: the Fifth Dimension logo. Collectibles: shooting stars (💫).
 */
import { hashSeed, mulberry32 } from '../../core/seededRandom'
import { type Cell, type Reach, type Row, anyReach, fresh, stepRow } from './validate'
import { CORNER, JUMP_APEX, JUMP_T, OB, VOID, laneX, START_CLEAR_M, levelAt, pressureAt, speedAt, voidChanceAt, warmAt } from './constants'

/** void = a lane of the path is missing (narrow section / edge drop-off); car = toppled broken neon sign (static, switch lanes; was a crashed satellite) */
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

type Tok = 'E' | 'B' | 'O' | 'P' | 'K' | 'G' | 'H'

type Pattern = { p: string; min: number; w: (L: number) => number }

/** Lane multisets (Temple Run kit): B = low barrier (jump), O = overhead beam (slide),
 * G = gap in the path (jump or fall), K = tall crate stack (switch lanes). E = clear.
 * Full-width rows (BBB / OOO / GGG) are the signature "you must jump / slide" moments. */
// v21 declutter: a row holds at most 2 obstacles unless they're one unified wall (BBB / OOO / PPP / GGG)
const PATTERNS: Pattern[] = [
  // v36: rocks/sticks "here and there" — between v34 rare and v35 flood
  { p: 'BEE', min: 0, w: (L) => 2.2 - 0.4 * L },
  { p: 'OEE', min: 0, w: (L) => 1.4 - 0.4 * L },
  { p: 'KEE', min: 0, w: (L) => 2.8 + 0.2 * L },
  { p: 'GEE', min: 0, w: (L) => 1.0 - 0.3 * L },
  { p: 'BBB', min: 0, w: (L) => 1.5 + 0.3 * L },
  { p: 'OOO', min: 0.02, w: (L) => 1.1 + 0.4 * L },
  { p: 'GGG', min: 0.05, w: (L) => 1.2 + 0.8 * L },
  // v18: most of the width missing — jump, or thread the one remaining lane
  { p: 'GGE', min: 0.15, w: (L) => 0.5 + 0.7 * L },
  { p: 'KKE', min: 0.2, w: (L) => 0.2 + 0.35 * L }, // v36: adjacent tall blockers rare
  { p: 'KBE', min: 0.08, w: (L) => 0.6 + 0.6 * L },
  { p: 'KOE', min: 0.08, w: (L) => 0.6 + 0.6 * L },
  { p: 'BOE', min: 0.14, w: (L) => 0.5 + 0.6 * L },
  // P = chest-high pipe: jump over OR slide under (Temple Run "either" gate)
  { p: 'PEE', min: 0, w: (L) => 1.15 - 0.2 * L },
  { p: 'PPP', min: 0.05, w: (L) => 0.8 + 0.2 * L },
  { p: 'KPE', min: 0.12, w: (L) => 0.4 + 0.5 * L },
  // H = pothole: a short missing piece of ONE lane (any lane, the middle one too) — switch round it
  { p: 'HEE', min: 0.02, w: (L) => 0.9 + 0.3 * L },
  { p: 'HBE', min: 0.15, w: (L) => 0.3 + 0.5 * L },
  { p: 'HHE', min: 0.22, w: (L) => 0.2 + 0.6 * L },
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
/** v26: seconds of travel kept hole-free after a jump / slide obstacle, and clear after a hole before one */
const HOLE_AFTER_T = 1.2
const HOLE_BEFORE_T = 0.45
/**
 * v46: hard human react floors. Late-game pressure may tighten *toward* these, never below them.
 * Metres = speed × seconds, so the window scales automatically with the speed ramp.
 */
/** Minimum clear travel time between any two obstacle waves (s) */
const MIN_WAVE_S = 0.36
/** After jump / slide / gap: runway so landing isn't instant-death into the next hazard */
const MIN_POST_LAND_S = 0.42
/** After a tall-block / car row (forced lane change): settle + react before the next hazard */
const MIN_POST_LANE_S = 0.34
/** v28: below this level (first ~40 s) stars stay on the easy line; after it they sit on jumps / slides */
const STAR_CHOICE_L = 0.75
/** v27: main obstacle type of a pattern (first non-empty, holes grouped) */
const mainTok = (p: string): string => {
  const t = [...p].find((c) => c !== 'E') ?? 'E'
  return t === 'H' ? 'G' : t
}
/** side of a partial row: mean lane of its obstacles (0 / 1 / 2), -1 for empty or full-width rows */
const sideOf = (t: Tok[]): number => {
  const ls = [0, 1, 2].filter((l) => t[l] !== 'E')
  if (!ls.length || ls.length === 3 || (ls.length === 2 && ls[0] === 0 && ls[1] === 2)) return -1
  const m = ls.reduce((a, b) => a + b, 0) / ls.length
  return m < 1 ? 0 : m > 1 ? 2 : 1
}
const passable = (t: Tok) => t !== 'K' && t !== 'H'

/** Star coin lines (Temple Run): LINE_MIN..LINE_MAX stars STAR_SPACING m apart, then ≥ LINE_GAP_MIN m (and ≥ ~1.1 s) of nothing. */
export const STAR_SPACING = 3
export const LINE_MIN = 14
/** base line length max; a jump arc / slide trio can add ≤ 2 more, so a line never exceeds 15 */
export const LINE_MAX = 24
export const LINE_GAP_MIN = 5

/** v32: up to this much shorter wave spacing once the level passes 0.7 (≈ 30 s+) */
const MID_TIGHT = 0.22
/** v32: extra chance of a forced sequence once post-cap pressure builds */
const SEQ_LATE = 0.15
const SWERVE_MIN = 5
const SWERVE_MAX = 9

const COMBO_LATE = 2.5

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
  /** end of the last jump/slide obstacle — rockets keep a clear gap from them */
  private lastJS = -1e9
  /** v26: end of the last jump / slide obstacle (barrier, arch, pipe) — no hole lands right after it */
  private lastBOP = -1e9
  /** v26: end of the last hole (gap, pothole, void) — a little room before the next jump / slide */
  private lastHole = -1e9
  /** v26: side (0 left · 1 centre · 2 right) of recent partial rows, to cap same-side runs at 2 */
  private sideHist: number[] = []
  /** v27 variety: recent pattern picks and their main token (no same pattern / type back to back) */
  private patHist: number[] = []
  private tightRun = 0
  private tokHist: string[] = []
  /** v27: hazard look bags (block = 5 looks, car = 3 long looks), never the same look twice in a row */
  private lookLast: Record<string, number> = {}
  private lookBag: Record<string, number[]> = {}
  /** v36: lanes that held a tall blocker on the previous row (space adjacent talls) */
  private lastTallLanes: number[] = []
  /** v46: path-distance end of the last tall / car row — next hazard keeps a lane-settle window */
  private lastTallEnd = -1e9
  /** v18 choreographed sequence: queued rows (left→right token triples) */
  private seqQ: Tok[][] = []
  private seqRow = false
  private prevEnd = 0
  private pathLane = 1
  private nextId = 1
  private nextPickupS = 520
  private pickupBag: PowerKind[] = []
  /** star coin-line state: stars left in the current line, where the next line may start, bob flag */
  private lineLeft = 0
  /** v31: stars laid in the current lane since the last swerve, and the count that triggers the next one */
  private laneRun = 0
  private laneRunLane = -1
  private swerveAt = 7
  /** rows left after a corner that may block at most one lane (readable runway out of every turn) */
  private postCorner = 0
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
  /** route validator state: per-lane reach after the last row, and the last row's far end */
  private reach: Reach = fresh(0)
  private vEnd = 0
  /** rows the validator had to push back or thin out (should be rare) */
  repairs = 0

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
    if (kind === 'barrier' || kind === 'overhead' || kind === 'pipe' || kind === 'gap') this.lastJS = Math.max(this.lastJS, s + len)
    if (kind === 'barrier' || kind === 'overhead' || kind === 'pipe') this.lastBOP = Math.max(this.lastBOP, s + len)
    if (kind === 'gap' || kind === 'void') this.lastHole = Math.max(this.lastHole, s + len)
    let variant = Math.floor(this.r() * 1000)
    if (kind === 'block' || kind === 'car') {
      // every look in turn (meteor · crates · statue · holo · wreckage). v36: meteor ~2× baseline
      // (between v34 rare and v35 flood; still never twice in a row).
      const n = kind === 'block' ? 5 : 3
      let bag = this.lookBag[kind]
      if (!bag || !bag.length) {
        bag = kind === 'block' ? [0, 0, 1, 2, 3, 4] : Array.from({ length: n }, (_, i) => i)
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(this.r() * (i + 1))
          const t = bag[i]
          bag[i] = bag[j]
          bag[j] = t
        }
        if (bag[bag.length - 1] === this.lookLast[kind]) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]]
        this.lookBag[kind] = bag
      }
      const look = bag.pop()!
      this.lookLast[kind] = look
      variant = look + n * Math.floor(this.r() * 200)
    }
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
    // v19: the clear corner approach / exit carries a star line too (stars nearly all run long);
    // nothing on the corner square itself
    // v28: just a 2-star marker into and out of the turn — most stars sit on jumps / slides
    // (the warm-up's first corners keep the full guide run: it teaches the turn)
    // v29: full guide runs again (stars all run long); the exit run takes a FRESH random lane
    // no swerve in the last ~1 s before the turn: the corner itself is the move
    this.guideRun(Math.max(this.prevEnd + 2.2, this.starFloor), cs - CORNER.half - 2, v * 1.0)
    this.pathLane = this.freshLane([0, 1, 2].filter((l) => l !== this.pathLane), true)
    this.noteLine(this.pathLane)
    this.laneRunLane = this.pathLane
    this.laneRun = 0
    this.guideRun(cs + CORNER.half + 5, after)
    if (this.lineLeft > 0) this.endLine(this.prevEnd, v)
    this.lineGapTo = Math.max(this.lineGapTo, after + 4)
    this.cursor = after
    this.prevEnd = after
    this.postCorner = 2
    this.seqQ = []
    this.reach = fresh(after)
    this.vEnd = after
    this.starFloor = after + STAR_SPACING
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
    // v26: never open a hole within ~1.2 s of a jump landing / slide exit
    const start = q(Math.max(s0 + lead, this.lastBOP + v * HOLE_AFTER_T))
    const len = q(VOID.minLen + this.r() * (VOID.maxLen - VOID.minLen) * (0.6 + 0.4 * L))
    const end = start + len
    if (end + v * 1.1 + CORNER.half + 8 > this.nextCornerS) return false
    // narrow (only the middle left) · edge drop-off (a side lane gone) · centre hole (the MIDDLE lane gone)
    const kr = this.r()
    const side = this.r() < 0.5 ? 0 : 2
    // v18: more one-lane pinches
    const gone = kr < 0.4 ? [0, 2] : kr < 0.66 ? [side] : [1]
    const open = [0, 1, 2].filter((l) => !gone.includes(l))
    // route check: the open lanes must be reachable in time, else no void here
    const vcells = [0, 1, 2].map((l) => (gone.includes(l) ? 'X' : 'E')) as Cell[]
    const vReach = stepRow(this.reach, this.vEnd, { s0: start, cells: vcells, len: [len, len, len], end }, v)
    if (!anyReach(vReach)) return false
    // v19: only lay the void once its route check passed (a rejected one used to leave stray holes behind)
    for (const l of gone) this.addOb('void', l, start, len)
    this.voids++
    // stars run the open lane (the one nearest the current line)
    let path = open[0]
    for (const l of open) if (Math.abs(l - this.pathLane) < Math.abs(path - this.pathLane)) path = l
    // v29: a new line in the pinch takes a fresh open lane (rotation), a running one stays nearest
    if (this.lineLeft <= 0) path = this.freshLane(open)
    // later on: a hurdle or an arch inside the narrow stretch
    let mid = -1
    // v18 chokepoint: the pinch holds a hurdle / truss / pipe across every open lane — jump or slide, no dodging
    if (L > 0.1 && len > 20 && this.r() < 0.7 + 0.3 * L) {
      mid = q(start + len * (0.4 + this.r() * 0.2))
      const kr2 = this.r()
      const kind = kr2 < 0.38 ? 'barrier' : kr2 < 0.62 ? 'overhead' : 'pipe'
      const ol = kind === 'barrier' ? OB.barrier.len : kind === 'overhead' ? OB.overhead.len : OB.pipe.len
      for (const l of open) this.addOb(kind, l, mid, ol)
    }
    {
      let r = vReach
      if (mid > 0) {
        const lk = this.obstacles[this.obstacles.length - 1].kind
        const tk = lk === 'barrier' ? 'B' : lk === 'pipe' ? 'P' : 'O'
        const ml = tk === 'B' ? OB.barrier.len : tk === 'P' ? OB.pipe.len : OB.overhead.len
        const mc = [0, 1, 2].map((l) => (gone.includes(l) ? 'X' : tk)) as Cell[]
        r = stepRow(r, start, { s0: mid, cells: mc, len: [ml, ml, ml], end: mid + ml }, v)
      }
      // a void stretch with a mid hurdle is always passable in-lane; keep the reach state honest
      this.reach = anyReach(r) ? r.map((l) => l.map((x) => ({ mv: Math.max(x.mv, end), act: x.act }))) : fresh(end)
      this.vEnd = end
    }
    // v28: a void stretch only gets a line when it holds a hurdle / truss to clear (interactive)
    if (this.lineLeft <= 0 && start >= this.lineGapTo && path !== this.blockedLane()) {
      this.startLine()
      this.noteLine(path)
    }
    for (let s = Math.max(start + 3, this.starFloor); s <= end - 2 && this.lineLeft > 0; s += STAR_SPACING) {
      if (mid > 0 && Math.abs(s - mid) < v * 0.35) continue
      this.placeLineStar(path, s, 0.9, start)
    }
    if (mid > 0) {
      const lk = this.obstacles.filter((o) => o.s === mid)[0]?.kind
      for (const l of open) {
        if (lk === 'overhead') for (const d of [-1.5, 0.2, 1.9]) this.addKey(l, mid + d, 0.45)
        else {
          const half = (v * JUMP_T) / 2
          for (const f of [-0.5, -0.25, 0, 0.25, 0.5]) this.addKey(l, mid + 0.6 + f * half, JUMP_APEX * (1 - f * f) + 0.85)
        }
      }
    }
    this.obstacles.sort((a, b) => a.s - b.s || a.id - b.id)
    this.pathLane = path
    this.prevEnd = end
    this.starFloor = end + STAR_SPACING
    this.cursor = q(end + Math.max(8, v * 0.6))
    this.rows++
    return true
  }

  /**
   * v17 bait clusters in a lane other than the safe star line: an arc over a jump obstacle, a low
   * line under a slide truss, a short run straight up to a rocket / palm or hole (swerve late), or a
   * lane-switching trail across an open row. Stars only; never inside an obstacle footprint.
   */
  private bait(toks: Tok[], path: number, s0: number, v: number, gapLen: number) {
    const lanes = [0, 1, 2].filter((l) => l !== path).sort(() => this.r() - 0.5)
    for (const l of lanes) {
      const t = toks[l]
      if (t === 'B' || t === 'P' || t === 'G') {
        const len = t === 'B' ? OB.barrier.len : t === 'P' ? OB.pipe.len : gapLen
        const mid = s0 + len / 2
        const half = (v * JUMP_T) / 2
        for (const f of [-0.5, -0.25, 0, 0.25, 0.5]) this.addKey(l, mid + f * half, JUMP_APEX * (1 - f * f) + 0.85)
        return
      }
      if (t === 'O') {
        for (const d of [-3.2, -1.5, 0.2, 1.9]) this.addKey(l, s0 + d, 0.45)
        return
      }
      if (t === 'K' || t === 'H') {
        // a short run that ends right before the hazard: grab and dive out at the last moment
        const n = 3 + Math.floor(this.r() * 2)
        for (let i = n; i >= 1; i--) this.addKey(l, s0 - 1.2 - (i - 1) * STAR_SPACING, 0.9)
        return
      }
    }
    // open row: a lane-switching trail (two lanes, staggered) just before the row
    const free = [0, 1, 2].filter((l) => toks[l] === 'E' && l !== path)
    if (free.length >= 1 && this.r() < 0.04) {
      // zig-zag across the lanes beside the safe line (never on top of it)
      const a = free[0]
      const b = free.length > 1 ? free[1] : free[0]
      const from = s0 - 6 * STAR_SPACING
      for (let i = 0; i < 6; i++) this.addKey(i < 3 ? a : b, from + i * STAR_SPACING, 0.9)
    }
  }

  /** v18 sequences: forced quick moves, mirrored at random. Every row still goes through the validator. */
  private pickSequence(): Tok[][] {
    const S: string[][] = [
      ['KEE', 'EEK', 'KEE', 'OOO'], // v36: weave without adjacent talls
      ['EEK', 'KEE', 'EEK', 'BBB'], // left/right singles then jump
      ['KEE', 'EBE', 'EEK', 'KOE', 'EEK'], // v26: zigzag wall (no 3-in-a-row same side) with a jump / slide inside
      ['KEE', 'EKE', 'EEK', 'KEE', 'OOO'], // weave (tall next to empty / jumpable)
      ['EKE', 'KEK', 'EKE', 'GGG'], // centre, sides, centre, jump the gap
    ]
    const pick = S[Math.floor(this.r() * S.length)]
    const mirror = this.r() < 0.5
    return pick.map((r) => (mirror ? [r[2], r[1], r[0]] : [r[0], r[1], r[2]]) as Tok[])
  }

  /** v29: lanes of recent star lines (rotation: never a third line in a row in the same lane) */
  private lineLanes: number[] = []
  /** stats: lane of every star line started (capped) */
  lineLog: number[] = []
  private noteLine(lane: number) {
    if (this.lineLog.length < 5000) this.lineLog.push(lane)
    this.lineLanes.push(lane)
    if (this.lineLanes.length > 3) this.lineLanes.shift()
  }
  /** the lane a third same-lane line would repeat, or -1 */
  private blockedLane(): number {
    const h = this.lineLanes
    return h.length >= 2 && h[h.length - 1] === h[h.length - 2] ? h[h.length - 1] : -1
  }
  /** random lane among options, least-recently used first; avoidLast also skips the previous line's lane */
  private freshLane(options: number[], avoidLast = false): number {
    const h = this.lineLanes
    const bad = this.blockedLane()
    let ok = options.filter((l) => l !== bad && !(avoidLast && h.length && l === h[h.length - 1]))
    if (!ok.length) ok = options.filter((l) => l !== bad)
    if (!ok.length) ok = options
    // weight lanes used less in the last 3 lines higher
    const w = ok.map((l) => 1 / (1 + h.filter((x) => x === l).length * 1.5))
    let x = this.r() * w.reduce((a, b) => a + b, 0)
    for (let i = 0; i < ok.length; i++) if ((x -= w[i]) < 0) return ok[i]
    return ok[ok.length - 1]
  }

  /** v31: a clear guide run (corner approach / exit, no obstacles) — swerves one lane every few stars */
  private guideRun(a: number, b: number, calm = 0) {
    for (let s = a; s <= b; s += STAR_SPACING) {
      if (this.pathLane !== this.laneRunLane) { this.laneRunLane = this.pathLane; this.laneRun = 0 }
      if (this.laneRun >= this.swerveAt && s + 2 * STAR_SPACING <= b - calm) {
        const nb = [this.pathLane - 1, this.pathLane + 1].filter((l) => l >= 0 && l <= 2)
        this.pathLane = nb[Math.floor(this.r() * nb.length)]
        this.laneRunLane = this.pathLane
        this.laneRun = 0
        this.swerveAt = SWERVE_MIN + Math.floor(this.r() * (SWERVE_MAX - SWERVE_MIN + 1))
        continue
      }
      this.addKey(this.pathLane, s, 0.9)
      this.laneRun++
    }
  }

  private startLine() {
    this.lineLen = LINE_MIN + Math.floor(this.r() * (LINE_MAX - LINE_MIN + 1))
    this.lineLeft = this.lineLen
    this.lineBob = this.r() < 0.35
  }

  private endLine(at: number, v: number) {
    this.lineLeft = 0
    this.lineGapTo = q(at + Math.max(LINE_GAP_MIN, v * 0.16) + this.r() * 4)
  }

  /** One star of the running line (or the rare 5D logo in its middle when one is due). */
  private placeLineStar(lane: number, s: number, y: number, rowS: number) {
    const i = this.lineLen - this.lineLeft
    if (lane !== this.laneRunLane) { this.laneRunLane = lane; this.laneRun = 0 }
    this.laneRun++
    if (rowS >= this.nextPickupS && i === Math.floor(this.lineLen / 2)) {
      this.pickups.push({ id: this.nextId++, kind: this.nextPower(), lane, s: q(s), y: 1.0, taken: false, takenTick: -1 })
      this.nextPickupS = rowS + 1500 + this.r() * 900 // v32: ~35 % rarer (was 900 + r·600)
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
    this.guard(this.cursor - 90)
  }

  // ── v19 safety net: replay the exact route validator over finished rows (same grouping, void
  // overlay and corner resets as validateObstacles) and open any row it can't pass. The generator's own
  // per-row check carries a slightly different state history, so a razor-thin chain could slip through.
  // Rows are only checked once complete (≥ 90 m behind the cursor), so the result doesn't depend on how
  // far ahead ensure() is called — the layout stays a pure function of the seed.
  private gReach: Reach = fresh(0)
  private gPrevEnd = 0
  private gDone = -1
  private gCornerS = -1
  /** rows opened by the safety net (stats) */
  guardFixes = 0
  private guard(lim: number): void {
    const map: Record<string, Cell> = { barrier: 'B', overhead: 'O', pipe: 'P', block: 'K', car: 'K', gap: 'G', void: 'X' }
    const obs = this.obstacles
    let i = 0
    while (i < obs.length && obs[i].s <= this.gDone) i++
    while (i < obs.length && obs[i].s < lim) {
      const s0 = obs[i].s
      let j = i
      const row: Row = { s0, cells: ['E', 'E', 'E'], len: [0, 0, 0], end: s0 }
      while (j < obs.length && Math.abs(obs[j].s - s0) < 0.011) {
        const o = obs[j]
        row.cells[o.lane] = map[o.kind] ?? 'K'
        row.len[o.lane] = o.len
        row.end = Math.max(row.end, o.s + o.len)
        j++
      }
      for (const vo of obs) {
        if (vo.s >= s0) break
        if (vo.kind === 'void' && s0 > vo.s + 0.01 && s0 < vo.s + vo.len) row.cells[vo.lane] = 'X'
      }
      for (const c of this.corners) if (c.s > this.gCornerS && c.s < s0) {
        this.gReach = fresh(c.s)
        this.gPrevEnd = c.s
        this.gCornerS = c.s
      }
      let nx = stepRow(this.gReach, this.gPrevEnd, row, speedAt(s0))
      if (!anyReach(nx)) {
        // open the row: drop its obstacles (never makes anything harder); voids stay (lanes still missing)
        const drop = new Set(obs.slice(i, j).filter((o) => o.kind !== 'void').map((o) => o.id))
        if (drop.size) {
          this.obstacles = obs.filter((o) => !drop.has(o.id))
          this.guardFixes++
          return this.guard(lim)
        }
        nx = fresh(row.end)
      }
      this.gReach = nx
      this.gPrevEnd = Math.max(this.gPrevEnd, row.end)
      this.gDone = s0 + 0.011
      i = j
    }
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

  // v32 difficulty nudge
  private pickPattern(L: number, W = 0): Tok[] {
    let total = 0
    const ws: number[] = []
    for (const p of PATTERNS) {
      let w = L >= p.min ? Math.max(0, p.w(L)) : 0
      // warm-up: multi-car rows fade in only as the warm-up ends
      // warm-up: forced-lane combos (two crates, mixed rows) fade in only as the warm-up ends
      if (W > 0 && /K.*K|BO|G.*G.*K|GKG|HH|HB/.test(p.p) && p.p !== 'GGG') w *= W > 0.5 ? 0 : 1 - 2 * W
      // v32: mid/late, forced-lane combos (multi-car / mixed rows) come up more often
      else if (W === 0 && L > 0.7 && /K.*K|BO|GKG|HB/.test(p.p)) w *= 1 + COMBO_LATE * Math.min(1, (L - 0.7) / 0.3)
      // v27 variety: never the last two patterns again; the last row's main type is rarer
      const pi = ws.length
      if (this.patHist.includes(pi)) w = 0
      else if (this.tokHist.length && this.tokHist[this.tokHist.length - 1] === mainTok(p.p)) w *= 0.35
      ws.push(w)
      total += w
    }
    let x = this.r() * total
    let idx = 0
    for (; idx < PATTERNS.length - 1; idx++) {
      x -= ws[idx]
      if (x < 0) break
    }
    if (total <= 0) idx = Math.floor(this.r() * PATTERNS.length)
    const src = PATTERNS[idx].p
    this.patHist.push(idx)
    if (this.patHist.length > 2) this.patHist.shift()
    this.tokHist.push(mainTok(src))
    if (this.tokHist.length > 2) this.tokHist.shift()
    let perm = PERMS[Math.floor(this.r() * 6)]
    // v26: no third same-side partial row in a row (left left left / right right right)
    const h = this.sideHist
    if (h.length >= 2 && h[h.length - 1] === h[h.length - 2]) {
      const ok = PERMS.filter((pm) => sideOf([src[pm[0]], src[pm[1]], src[pm[2]]] as Tok[]) !== h[h.length - 1])
      if (ok.length) perm = ok[Math.floor(this.r() * ok.length)]
    }
    return [src[perm[0]], src[perm[1]], src[perm[2]]] as Tok[]
  }

  private genRow() {
    let s0 = this.cursor
    const L = levelAt(s0)
    const W = warmAt(s0)
    const v = speedAt(s0)
    // corner due: keep its approach clear (≈ CORNER.preS of running) and build it
    if (s0 + 8 > this.nextCornerS - CORNER.half - v * CORNER.preS) {
      this.addCorner()
      return
    }
    if (this.postCorner <= 0 && this.maybeVoid(s0, v, L)) return
    // v18: now and then a choreographed run of rows (zigzag / one-side wall / then slide)
    if (!this.seqQ.length && this.postCorner <= 0 && L > 0.2 && W === 0 && this.r() < 0.1 + 0.1 * L + SEQ_LATE * pressureAt(s0) && s0 + v * 6 < this.nextCornerS - CORNER.half - v * CORNER.preS) this.seqQ = this.pickSequence()
    this.seqRow = this.seqQ.length > 0
    const toks = this.seqRow ? this.seqQ.shift()! : this.pickPattern(L, W)
    if (this.postCorner > 0) {
      this.postCorner--
      // out of a turn: one obstacle at most, never a wall, so there's always an obvious line
      let kept = false
      // v19: scan from a random end, so the kept obstacle isn't always the LEFT-most one
      const order = this.r() < 0.5 ? [0, 1, 2] : [2, 1, 0]
      for (const i of order) {
        if (toks[i] === 'E') continue
        if (kept || toks[i] === 'K' || toks[i] === 'G' || toks[i] === 'H') toks[i] = 'E'
        else kept = true
      }
    }
    // first rows: never put a crate straight in the start lane before the player has learned to swipe
    if (W > 0.62 && toks[1] === 'K') {
      const e = toks[0] === 'E' && toks[2] === 'E' ? (this.r() < 0.5 ? 0 : 2) : toks[0] === 'E' ? 0 : 2
      toks[1] = toks[e]
      toks[e] = 'K'
    }
    // crashed-rocket rows (K with no jump/slide): hold them back a clear gap from the last jump/slide
    if (toks.includes('K') && !toks.some((x) => x === 'B' || x === 'O' || x === 'P' || x === 'G')) {
      const want = q(this.lastJS + Math.max(9, v * 0.5))
      if (want > s0 && want + 8 <= this.nextCornerS - CORNER.half - v * CORNER.preS && this.r() < 0.85) s0 = want
    }
    // v26: post-corner / warm-up edits can still line up a third same-side row — mirror it
    {
      const h = this.sideHist
      const sd = sideOf(toks)
      if (sd !== -1 && h.length >= 2 && h[h.length - 1] === sd && h[h.length - 2] === sd) {
        if (sd !== 1) { const t0 = toks[0]; toks[0] = toks[2]; toks[2] = t0 }
        else if (toks[1] !== 'E') { const e = this.r() < 0.5 ? 0 : 2; const t1 = toks[1]; toks[1] = toks[e]; toks[e] = t1 }
      }
    }
    // v26 hole buffer: no gap / pothole within ~1.2 s of travel after a jump landing or slide exit,
    // and a little room after a hole before the next jump / slide. Push the row back; if that would
    // crowd the corner, turn its holes into hurdles / blockers instead.
    // v46: ALSO keep a react window after the previous jump/slide landing or tall-blocker lane-change
    // before ANY next hazard (not only holes) — kills land→instant-death clusters.
    {
      const lim = this.nextCornerS - CORNER.half - v * CORNER.preS - 8
      const hasHole = toks.some((t) => t === 'G' || t === 'H')
      const hasBOP = toks.some((t) => t === 'B' || t === 'O' || t === 'P')
      const hasHazard = toks.some((t) => t !== 'E')
      let want = s0
      if (hasHole) want = Math.max(want, q(this.lastBOP + v * HOLE_AFTER_T))
      if (hasBOP) want = Math.max(want, q(this.lastHole + v * HOLE_BEFORE_T))
      if (hasHazard) {
        want = Math.max(want, q(this.lastJS + v * MIN_POST_LAND_S))
        want = Math.max(want, q(this.lastTallEnd + v * MIN_POST_LANE_S))
      }
      if (want > s0) {
        if (want <= lim) s0 = want
        else {
          // keep the row's challenge: a gap becomes a hurdle, a pothole a lane blocker
          for (let i = 0; i < 3; i++) if (toks[i] === 'G') toks[i] = 'B'; else if (toks[i] === 'H') toks[i] = 'K'
          if (hasBOP) s0 = Math.max(s0, Math.min(lim, q(this.lastHole + v * HOLE_BEFORE_T)))
          if (hasHazard) {
            s0 = Math.max(s0, Math.min(lim, q(this.lastJS + v * MIN_POST_LAND_S)))
            s0 = Math.max(s0, Math.min(lim, q(this.lastTallEnd + v * MIN_POST_LANE_S)))
          }
        }
      }
    }
    const gapLen = q(Math.min(5, Math.max(2.6, 0.3 * v)))
    if (W > 0.78 && toks.includes('P')) {
      // warm-up: teach jump and slide separately first (v35: only the very first stretch)
      for (let i = 0; i < 3; i++) if (toks[i] === 'P') toks[i] = 'O'
    }
    // v36: adjacent tall blockers only rarely (≤~12%) — prefer tall next to jump/slide/empty
    {
      const open: Tok[] = ['E', 'E', 'O', 'B']
      for (let i = 0; i < 2; i++) {
        if (toks[i] === 'K' && toks[i + 1] === 'K' && this.r() > 0.06) {
          const which = this.r() < 0.5 ? i : i + 1
          toks[which] = open[Math.floor(this.r() * open.length)]
        }
      }
      // also break talls that sit beside last row's tall (reads as a clump while running)
      if (this.lastTallLanes.length) {
        for (let i = 0; i < 3; i++) {
          if (toks[i] !== 'K') continue
          if (this.lastTallLanes.some((l) => Math.abs(l - i) <= 1) && this.r() > 0.08) {
            toks[i] = open[Math.floor(this.r() * open.length)]
          }
        }
      }
    }

    // ── route validator: this row must leave at least one passable route from where the runner can be ──
    {
      const holeLen = q(Math.min(7, Math.max(3.5, 0.13 * v)))
      const lenOf = (t: Tok) => (t === 'B' ? OB.barrier.len : t === 'O' ? OB.overhead.len : t === 'P' ? OB.pipe.len : t === 'K' ? OB.car.len : t === 'G' ? gapLen : t === 'H' ? holeLen : 0)
      const mk = (at: number): Row => {
        const len = toks.map(lenOf)
        return { s0: at, cells: toks.map((t) => (t === 'H' ? 'X' : t)) as Cell[], len, end: at + Math.max(0, ...len) }
      }
      // v19: a full-width must-jump / must-slide row also has to be reachable with 0.1 s less slack on
      // landing, so a razor-thin chain (gap jump → truss) can't depend on one exact state history
      const full = toks.every((t) => t !== 'E' && t !== 'K' && t !== 'H')
      const slack = (st: Reach, v: number) => st.map((l) => l.map((x) => ({ mv: x.mv, act: x.act + v * 0.1 })))
      const ok = (at: number) => {
        const v1 = speedAt(at)
        const r1 = stepRow(this.reach, this.vEnd, mk(at), v1)
        return anyReach(r1) && (!full || anyReach(stepRow(slack(this.reach, v1), this.vEnd, mk(at), v1))) ? r1 : null
      }
      let nx = ok(s0) ?? stepRow(this.reach, this.vEnd, mk(s0), speedAt(s0)).map(() => [])
      // 1) give the row a little more room (keeps the pattern)
      for (let k = 0; k < 18 && !anyReach(nx); k++) {
        s0 = q(s0 + 1)
        nx = ok(s0) ?? [[], [], []]
        if (anyReach(nx)) this.repairs++
      }
      if (!anyReach(nx)) nx = stepRow(this.reach, this.vEnd, mk(s0), speedAt(s0))
      // 2) still blocked: open the blocker nearest to a reachable lane
      while (!anyReach(nx)) {
        const rl = [0, 1, 2].filter((l) => this.reach[l].length > 0)
        const best = rl.length ? rl[Math.floor(this.r() * rl.length)] : 1
        let pick = -1
        for (const l of this.r() < 0.5 ? [best, 1, 0, 2] : [best, 1, 2, 0]) if (toks[l] !== 'E') { pick = l; break }
        if (pick < 0) break
        toks[pick] = 'E'
        this.repairs++
        nx = stepRow(this.reach, this.vEnd, mk(s0), speedAt(s0))
      }
      this.reach = anyReach(nx) ? nx : fresh(s0)
      this.vEnd = mk(s0).end
    }

    this.sideHist.push(sideOf(toks))
    if (this.sideHist.length > 4) this.sideHist.shift()
    let rowEnd = s0
    let rocketRow = false
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
        // crashed rocket or a crashed satellite across the lane
        // long cars need a clear gap from jump/slide; short talls may sit beside a hurdle/pipe
        // (v36: Jenks prefers tall next to jumpable — and meteor rocks only exist on 'block')
        const jsRow = toks.some((x) => x === 'B' || x === 'O' || x === 'P' || x === 'G')
        const rocketOk = !jsRow && s0 - this.lastJS > Math.max(9, v * 0.5)
        const wantCar = rocketOk ? this.r() < 0.12 : this.r() < 0.62
        if (wantCar) {
          this.addOb('car', lane, s0, OB.car.len)
          this.cars++
          rowEnd = Math.max(rowEnd, s0 + OB.car.len)
        } else {
          this.addOb('block', lane, s0, OB.block.len)
          rowEnd = Math.max(rowEnd, s0 + OB.block.len)
          rocketRow = true
        }
      } else if (t === 'H') {
        const hl = q(Math.min(7, Math.max(3.5, 0.13 * v)))
        this.addOb('void', lane, s0, hl)
        rowEnd = Math.max(rowEnd, s0 + hl)
      } else if (t === 'G') {
        this.addOb('gap', lane, s0, gapLen)
        rowEnd = Math.max(rowEnd, s0 + gapLen)
      }
    }

    this.lastTallLanes = [0, 1, 2].filter((l) => toks[l] === 'K')
    if (this.lastTallLanes.length) this.lastTallEnd = Math.max(this.lastTallEnd, rowEnd)

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
    if (this.lineLeft > 0 && passable(toks[this.pathLane])) {
      path = this.pathLane
      // v31: a line never runs one lane for a whole runway — after a few stars it swerves to a neighbour lane
      if (this.laneRun >= this.swerveAt) {
        const nb = [this.pathLane - 1, this.pathLane + 1].filter((l) => toks[l] === 'E')
        if (nb.length) {
          path = nb[Math.floor(this.r() * nb.length)]
          this.laneRun = 0
          this.swerveAt = SWERVE_MIN + Math.floor(this.r() * (SWERVE_MAX - SWERVE_MIN + 1))
        }
      }
    }
    // v29: a NEW line picks a fresh lane (rotation across left / middle / right); v31: never the last line's lane
    else if (this.lineLeft <= 0) path = this.freshLane(options, true)
    // v27 star choice: at a jump / slide row, often route the line OVER / UNDER the obstacle (the
    // risky option holds the stars, the open lane holds none)
    if (this.postCorner <= 0 && W === 0 && L >= STAR_CHOICE_L && toks.includes('E')) {
      const bad = this.lineLeft <= 0 ? this.blockedLane() : -1
      const js = [0, 1, 2].filter((l) => (toks[l] === 'B' || toks[l] === 'O' || toks[l] === 'P') && l !== bad)
      if (js.length) {
        let pick = js[0]
        for (const l of js) if (Math.abs(l - this.pathLane) < Math.abs(pick - this.pathLane)) pick = l
        path = pick
      }
    }
    const changed = path !== this.pathLane
    const tok = toks[path]
    // ── stars: short coin lines in the path lane, then a real gap (never a continuous river) ──
    // lane change inside a running line: the stars swerve right after the previous row (no hole in the line)
    const start = this.prevEnd + (changed && this.lineLeft > 0 ? Math.max(3, v * 0.12) : 2.2)
    const end = tok === 'E' ? rowEnd + 1 : s0 - (tok === 'O' ? 3.5 : v * 0.22 + 1.4)
    // v28: most new lines only start when they lead into a jump / slide (the player must commit to get them)
    const interactive = tok === 'B' || tok === 'O' || tok === 'P' || (tok === 'G' && L > 0.85)
    // v29: free lines fill the open stretches again (coverage ~90 %); jump / slide rows still pull the line over / under
    const freeLine = true
    for (let s = Math.max(start, this.starFloor); s <= end; s += STAR_SPACING) {
      if (this.lineLeft <= 0) {
        if (s < this.lineGapTo) continue
        if (!interactive && !freeLine) break
        // v29: never a third line in a row in one lane — leave a short break instead
        if (path === this.blockedLane()) break
        // start late enough that the line still has stars left to carry over / under the obstacle
        if (interactive && s < end - (LINE_MIN - 6) * STAR_SPACING) continue
        this.startLine()
        this.noteLine(path)
      }
      // v31: on an open stretch the running line swerves to a neighbour lane every few stars (one-lane swerve
      // with a short beat so it reads as a move, never a whole runway in one lane)
      if (tok === 'E' && this.laneRun >= this.swerveAt && this.lineLeft > 1 && s <= end - 12) {
        const nb = [path - 1, path + 1].filter((l) => toks[l] === 'E')
        if (nb.length) {
          path = nb[Math.floor(this.r() * nb.length)]
          this.swerveAt = SWERVE_MIN + Math.floor(this.r() * (SWERVE_MAX - SWERVE_MIN + 1))
          s += STAR_SPACING
          if (s > end) break
        }
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
    // ── v17 risk / reward: bait stars off the safe line, so grabbing them means flirting with danger ──
    // v27: stars sit on ONE option only — no bait when this row's star line already covers the decision
    const lineHere = this.keys.some((k) => k.lane === path && k.s >= s0 - v * 0.9 && k.s <= rowEnd + 3)
    if (!lineHere && this.postCorner <= 0 && W < 0.7 && this.r() < 0.8 + 0.2 * L) this.bait(toks, path, s0, v, gapLen)
    // keep keys sorted by s (bait / floaters can land out of order); only the freshly generated
    // tail (far ahead of the runner) is touched
    const n0 = Math.max(0, this.keys.length - 40)
    const tail = this.keys.slice(n0).sort((a, b) => a.s - b.s || a.id - b.id)
    for (let i = 0; i < tail.length; i++) this.keys[n0 + i] = tail[i]
    this.pathLane = path
    this.prevEnd = rowEnd

    // ── spacing to next wave (v46): late pressure tightens toward a HARD react floor, never under it ──
    // Metres = v × Tq, so the window scales with the speed ramp. Early warm-up still much roomier.
    const base = 0.84 - 0.54 * L // v22: a touch roomier early (speeds −10% shortened jumps)
      * (1 - MID_TIGHT * Math.min(1, Math.max(0, (L - 0.7) / 0.3))) // v32: mid / late a little tighter, warm-up untouched
    // warm-up: up to ~2.9× the gap between waves at the start line, tapering by WARM_M; a little
    // extra breathing room while the level is still low (fades out as L → 1)
    // after top speed, waves keep tightening (density-only difficulty) but never below MIN_WAVE_S
    const P = pressureAt(s0)
    const T = Math.max(MIN_WAVE_S, Math.max(0.24 - 0.12 * P, base * (0.7 + 0.35 * this.r()) * (1 + 1.6 * W + 0.3 * (1 - L)) * (1 - P)))
    // sequence rows: a fixed reaction window in seconds (≈ lane switch + reaction), so metres scale with speed
    let Tq = this.seqRow ? Math.max(MIN_WAVE_S, 0.62 + 0.15 * (1 - L) - 0.06 * P) : T // v32: late sequences a touch quicker
    // v27/v46 spacing: most rows keep a minimum reaction gap; "tight" runs still respect MIN_WAVE_S
    if (!this.seqRow) {
      // late denser, but max 2 tight in a row, and every gap stays ≥ MIN_WAVE_S
      const tight = this.tightRun < (P > 0.3 ? 2 : 1) && this.r() < 0.14 + 0.08 * L + 0.45 * P
      // floor that pressure cannot erase (pre-v46 minT could collapse to 0)
      const minT = Math.max(MIN_WAVE_S, (0.52 - 0.14 * L) * Math.max(0.4, 1 - 0.55 * P))
      if (tight) {
        this.tightRun++
        Tq = Math.max(Tq, MIN_WAVE_S)
      } else {
        this.tightRun = 0
        Tq = Math.max(Tq, minT)
      }
      if (W === 0 && this.r() < 0.07 - 0.03 * P) Tq += 1.3 + this.r() * 0.9
    }
    // post-action react: landing after jump/slide, or settle after a forced lane change
    const hadJumpSlide = toks.some((t) => t === 'B' || t === 'O' || t === 'P' || t === 'G')
    const hadLaneForce = toks.some((t) => t === 'K')
    if (hadJumpSlide) Tq = Math.max(Tq, MIN_POST_LAND_S)
    else if (hadLaneForce) Tq = Math.max(Tq, MIN_POST_LANE_S)
    // metre floor scales with speed (old absolute 5.2 m was ~0.1 s at vmax — unplayable)
    this.cursor = q(rowEnd + Math.max(rocketRow ? Math.max(9, v * 0.5) : v * MIN_WAVE_S, v * Tq))
    this.rows++
  }
}
