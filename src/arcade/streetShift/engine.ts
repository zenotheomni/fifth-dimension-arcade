import {
  COLS,
  ROWS,
  generateMaze,
  ensureExits,
  isOpen,
  nearestOpen,
  powerSpots,
  key,
  mulberry32,
  reachable,
  nextStyle,
  type MazeStyle,
} from './maze'
import {
  type Cell,
  type Dir,
  type Ghost,
  type GamePhase,
  type EndStats,
  type PickupFx,
  DX,
  DY,
  OPP,
  DIRS,
  STAR_PTS,
  TAG_BASE,
  POWER_S,
  SHIFT_EVERY_S,
  SHIFT_WARN_S,
  MORPH_S,
  START_LIVES,
  PLAYER_SPEED,
  GHOST_SPEED,
  FRIGHT_SPEED,
  EATEN_SPEED,
  INPUT_BUFFER_S,
  TURN_SNAP,
  TURN_EARLY,
  PB_KEY,
  MODE_PHASES,
} from './types'

export type Hud = {
  phase: GamePhase
  score: number
  lives: number
  starsLeft: number
  powerLeft: number
  /** 0..1 during warning (1 = imminent) */
  shiftWarn: number
  /** seconds until next shift */
  shiftIn: number
  shifts: number
  pb: number
  callout: string | null
  combo: number
  queued: Dir | null
  /** 0..1 while walls morph between shapes */
  morph: number
}

export type Listener = (h: Hud) => void

const GHOST_COLORS = ['#FF5A3C', '#00C8C4', '#7B3FE4', '#FFC83C']

function loadPb(): number {
  try {
    return Number(localStorage.getItem(PB_KEY) || 0) || 0
  } catch {
    return 0
  }
}
function savePb(v: number) {
  try {
    localStorage.setItem(PB_KEY, String(v))
  } catch {
    /* ignore */
  }
}

function wrapX(x: number) {
  if (x < -0.5) return COLS - 0.5
  if (x >= COLS - 0.5) return -0.5
  return x
}

function atCenter(v: number, eps = TURN_SNAP) {
  return Math.abs(v - Math.round(v)) < eps
}

function snap(v: number) {
  return Math.round(v)
}

export class StreetShiftEngine {
  grid: Cell[] = []
  /** Previous maze during soft morph (walls slide/reform). */
  prevGrid: Cell[] | null = null
  morphT = 0
  morphing = false
  mazeStyle: MazeStyle | null = null
  stars = new Set<number>()
  powers = new Set<number>()
  px = 1
  py = 1
  pDir: Dir = 1
  queued: Dir | null = null
  queueAge = 0
  ghosts: Ghost[] = []
  score = 0
  lives = START_LIVES
  phase: GamePhase = 'howto'
  powerT = 0
  tagChain = 0
  shiftT = 0
  warnT = 0
  shifts = 0
  livedS = 0
  tags = 0
  starsCollected = 0
  dyingT = 0
  invulnT = 0
  callout: string | null = null
  calloutT = 0
  pb = loadPb()
  seed = (Math.random() * 1e9) | 0
  fx: PickupFx[] = []
  /** player trail */
  pTrail: { x: number; y: number }[] = []
  private modeT = 0
  private modeIdx = 0
  private rng = mulberry32(this.seed)
  private listeners = new Set<Listener>()
  private raf = 0
  private last = 0
  private ended: EndStats | null = null
  private trailAcc = 0

  on(fn: Listener) {
    this.listeners.add(fn)
    fn(this.hud())
    return () => this.listeners.delete(fn)
  }

  hud(): Hud {
    const until = Math.max(0, SHIFT_EVERY_S - this.shiftT)
    return {
      phase: this.phase,
      score: this.score,
      lives: this.lives,
      starsLeft: this.stars.size,
      powerLeft: this.powerT,
      shiftWarn: this.warnT > 0 ? 1 - this.warnT / SHIFT_WARN_S : 0,
      shiftIn: until,
      shifts: this.shifts,
      pb: this.pb,
      callout: this.callout,
      combo: this.tagChain,
      queued: this.queued,
      morph: this.morphing ? Math.min(1, this.morphT / MORPH_S) : 0,
    }
  }

  private emit() {
    const h = this.hud()
    for (const fn of this.listeners) fn(h)
  }

  private say(msg: string, s = 1.35) {
    this.callout = msg
    this.calloutT = s
  }

  globalMode(): 'scatter' | 'chase' {
    return MODE_PHASES[Math.min(this.modeIdx, MODE_PHASES.length - 1)]!.mode
  }

  start() {
    this.score = 0
    this.lives = START_LIVES
    this.livedS = 0
    this.tags = 0
    this.starsCollected = 0
    this.shifts = 0
    this.shiftT = 0
    this.warnT = 0
    this.powerT = 0
    this.tagChain = 0
    this.invulnT = 0
    this.modeT = 0
    this.modeIdx = 0
    this.fx = []
    this.pTrail = []
    this.ended = null
    this.queued = null
    this.queueAge = 0
    this.seed = (Math.random() * 1e9) | 0
    this.rng = mulberry32(this.seed)
    this.prevGrid = null
    this.morphT = 0
    this.morphing = false
    this.mazeStyle = null
    this.buildLevel(true)
    this.phase = 'playing'
    this.last = performance.now()
    this.emit()
    this.loop()
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  getEndStats() {
    return this.ended
  }

  /** Queue next turn. Opposite = instant reverse. Buffer refreshed every press. */
  queueDir(d: Dir) {
    if (this.phase !== 'playing') return
    if (d === OPP[this.pDir]) {
      this.pDir = d
      this.queued = null
      this.queueAge = 0
      // snap onto axis so reverse feels instant
      if (d === 0 || d === 2) this.px = snap(this.px)
      else this.py = snap(this.py)
      return
    }
    this.queued = d
    this.queueAge = 0
  }

  private buildLevel(placePlayer: boolean) {
    this.mazeStyle = nextStyle(this.mazeStyle, this.rng)
    this.grid = generateMaze(this.rng, this.mazeStyle)
    this.prevGrid = null
    this.morphing = false
    this.morphT = 0
    const spawn = nearestOpen(this.grid, Math.floor(COLS / 2), Math.floor(ROWS / 2) + 2)
    if (placePlayer) {
      this.px = spawn.x
      this.py = spawn.y
      this.pDir = 1
      this.queued = null
      this.queueAge = 0
    } else {
      const n = nearestOpen(this.grid, Math.round(this.px), Math.round(this.py))
      this.px = n.x
      this.py = n.y
    }
    ensureExits(this.grid, Math.round(this.px), Math.round(this.py), 50, this.rng)
    const reach = reachable(this.grid, Math.round(this.px), Math.round(this.py))
    this.stars = new Set()
    for (const k of reach) {
      const x = k % COLS
      const y = (k / COLS) | 0
      if (Math.abs(x - this.px) + Math.abs(y - this.py) < 2) continue
      this.stars.add(k)
    }
    this.powers = new Set()
    for (const p of powerSpots(this.grid, Math.round(this.px), Math.round(this.py))) {
      const k = key(p.x, p.y)
      this.powers.add(k)
      this.stars.delete(k)
    }
    this.spawnGhosts()
  }

  private spawnGhosts() {
    const cx = Math.floor(COLS / 2)
    const cy = Math.floor(ROWS / 2)
    const homes = [
      nearestOpen(this.grid, cx, cy),
      nearestOpen(this.grid, cx - 2, cy),
      nearestOpen(this.grid, cx + 2, cy),
      nearestOpen(this.grid, cx, cy - 2),
    ]
    const scatters = [
      { x: COLS - 2, y: 1 },
      { x: 1, y: 1 },
      { x: COLS - 2, y: ROWS - 2 },
      { x: 1, y: ROWS - 2 },
    ]
    this.ghosts = homes.map((h, i) => ({
      id: i,
      x: h.x,
      y: h.y,
      dir: 0 as Dir,
      mode: 'scatter' as const,
      color: GHOST_COLORS[i]!,
      homeX: h.x,
      homeY: h.y,
      scatterX: scatters[i]!.x,
      scatterY: scatters[i]!.y,
      trail: [],
    }))
  }

  private mazeShift() {
    const px = Math.round(this.px)
    const py = Math.round(this.py)
    this.prevGrid = this.grid.slice()
    this.mazeStyle = nextStyle(this.mazeStyle, this.rng)
    const next = generateMaze(this.rng, this.mazeStyle)
    // light chaos so successive morphs still feel distinct
    const chaos = Math.floor(COLS * ROWS * 0.05)
    for (let i = 0; i < chaos; i++) {
      const x = 1 + Math.floor(this.rng() * (COLS - 2))
      const y = 1 + Math.floor(this.rng() * (ROWS - 2))
      const k = key(x, y)
      next[k] = next[k] === 1 ? 0 : 1
    }
    for (let x = 0; x < COLS; x++) {
      next[key(x, 0)] = 1
      next[key(x, ROWS - 1)] = 1
    }
    for (let y = 0; y < ROWS; y++) {
      next[key(0, y)] = 1
      next[key(COLS - 1, y)] = 1
    }
    const mid = Math.floor(ROWS / 2)
    if (mid % 2 === 1) {
      next[key(0, mid)] = 0
      next[key(COLS - 1, mid)] = 0
      next[key(1, mid)] = 0
      next[key(COLS - 2, mid)] = 0
    }
    const n = nearestOpen(next, px, py)
    ensureExits(next, n.x, n.y, 55, this.rng)
    const reach = reachable(next, n.x, n.y)
    const keptStars = new Set<number>()
    for (const k of this.stars) {
      if (reach.has(k)) keptStars.add(k)
    }
    for (const k of reach) {
      if (keptStars.size >= Math.floor(reach.size * 0.55)) break
      const x = k % COLS
      const y = (k / COLS) | 0
      if (Math.abs(x - n.x) + Math.abs(y - n.y) < 2) continue
      if (this.powers.has(k)) continue
      keptStars.add(k)
    }
    this.stars = keptStars
    this.powers = new Set()
    for (const p of powerSpots(next, n.x, n.y)) {
      const k = key(p.x, p.y)
      if (reach.has(k)) {
        this.powers.add(k)
        this.stars.delete(k)
      }
    }
    this.grid = next
    this.morphT = 0
    this.morphing = true
    this.shifts++
    this.say('DIMENSION MORPH', 1.4)
    this.invulnT = Math.max(this.invulnT, 0.9)
  }

  /** Finish morph — snap actors onto the new shape. */
  private finishMorph() {
    this.morphing = false
    this.morphT = 0
    this.prevGrid = null
    const n = nearestOpen(this.grid, Math.round(this.px), Math.round(this.py))
    this.px = n.x
    this.py = n.y
    for (const g of this.ghosts) {
      const gn = nearestOpen(this.grid, Math.round(g.x), Math.round(g.y))
      g.x = gn.x
      g.y = gn.y
      g.trail = []
      if (g.mode !== 'frightened' && g.mode !== 'eaten') g.mode = this.globalMode()
    }
  }

  /** Walkable during morph = open in old OR new (never trap the runner). */
  private openAt(x: number, y: number): boolean {
    if (this.morphing && this.prevGrid) {
      return isOpen(this.grid, x, y) || isOpen(this.prevGrid, x, y)
    }
    return isOpen(this.grid, x, y)
  }

  private neighborsAt(x: number, y: number): Dir[] {
    const out: Dir[] = []
    for (const d of DIRS) {
      let nx = x + DX[d]
      let ny = y + DY[d]
      if (nx < 0) nx = COLS - 1
      if (nx >= COLS) nx = 0
      if (this.openAt(nx, ny)) out.push(d)
    }
    return out
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    let dt = (now - this.last) / 1000
    this.last = now
    if (dt > 0.05) dt = 0.05
    this.tick(dt)
  }

  private tick(dt: number) {
    if (this.calloutT > 0) {
      this.calloutT -= dt
      if (this.calloutT <= 0) this.callout = null
    }
    // fx decay
    if (this.fx.length) {
      this.fx = this.fx.filter((f) => {
        f.t -= dt
        return f.t > 0
      })
    }

    if (this.phase === 'dying') {
      this.dyingT -= dt
      if (this.dyingT <= 0) {
        if (this.lives <= 0) this.finish()
        else this.respawn()
      }
      this.emit()
      return
    }
    if (this.phase !== 'playing') return

    this.livedS += dt
    if (this.invulnT > 0) this.invulnT -= dt

    // classic mode clock (paused while power active)
    if (this.powerT <= 0) {
      this.modeT += dt
      const cur = MODE_PHASES[Math.min(this.modeIdx, MODE_PHASES.length - 1)]!
      if (this.modeT >= cur.dur) {
        this.modeT = 0
        this.modeIdx = Math.min(this.modeIdx + 1, MODE_PHASES.length - 1)
      }
    }

    if (this.powerT > 0) {
      this.powerT -= dt
      if (this.powerT <= 0) {
        this.powerT = 0
        this.tagChain = 0
        for (const g of this.ghosts) {
          if (g.mode === 'frightened') g.mode = this.globalMode()
        }
      }
    }

    // input buffer expiry
    if (this.queued != null) {
      this.queueAge += dt
      if (this.queueAge > INPUT_BUFFER_S) {
        this.queued = null
        this.queueAge = 0
      }
    }

    // soft morph progress
    if (this.morphing) {
      this.morphT += dt
      if (this.morphT >= MORPH_S) this.finishMorph()
    }

    // maze morph timer
    this.shiftT += dt
    const until = SHIFT_EVERY_S - this.shiftT
    if (until <= SHIFT_WARN_S && until > 0) this.warnT = until
    else this.warnT = 0
    if (this.shiftT >= SHIFT_EVERY_S && !this.morphing) {
      this.shiftT = 0
      this.warnT = 0
      this.mazeShift()
    }

    this.movePlayer(dt)
    this.moveGhosts(dt)
    this.collect()
    this.collisions()

    // trails
    this.trailAcc += dt
    if (this.trailAcc > 0.028) {
      this.trailAcc = 0
      this.pTrail.push({ x: this.px, y: this.py })
      if (this.pTrail.length > 10) this.pTrail.shift()
      for (const g of this.ghosts) {
        g.trail.push({ x: g.x, y: g.y })
        if (g.trail.length > 7) g.trail.shift()
      }
    }

    if (this.stars.size === 0 && this.powers.size === 0) {
      this.score += 500
      this.say('LAYER CLEARED +500', 1.5)
      this.buildLevel(false)
    }

    this.emit()
  }

  private tryApplyQueue(): boolean {
    if (this.queued == null) return false
    if (!atCenter(this.px, TURN_EARLY) || !atCenter(this.py, TURN_EARLY)) return false
    const cx = snap(this.px)
    const cy = snap(this.py)
    const opts = this.neighborsAt(cx, cy)
    if (!opts.includes(this.queued)) return false
    // only commit when close enough to center (or early window toward the turn)
    const along =
      this.pDir === 1 || this.pDir === 3 ? Math.abs(this.px - cx) : Math.abs(this.py - cy)
    if (along > TURN_EARLY) return false
    this.px = cx
    this.py = cy
    this.pDir = this.queued
    this.queued = null
    this.queueAge = 0
    return true
  }

  private movePlayer(dt: number) {
    this.tryApplyQueue()

    const step = PLAYER_SPEED * dt
    // probe next cell
    const look = 0.5
    let tx = snap(this.px + DX[this.pDir] * look)
    let ty = snap(this.py + DY[this.pDir] * look)
    if (tx < 0) tx = COLS - 1
    if (tx >= COLS) tx = 0

    if (!this.openAt(tx, ty)) {
      // approach wall — snap to center, try queue, or auto-pick sole exit
      this.px = snap(this.px)
      this.py = snap(this.py)
      if (this.tryApplyQueue()) {
        /* turned */
      } else {
        const opts = this.neighborsAt(this.px, this.py)
        const forward = opts.filter((d) => d !== OPP[this.pDir])
        if (forward.length === 1) {
          this.pDir = forward[0]!
        } else if (this.queued != null && opts.includes(this.queued)) {
          this.pDir = this.queued
          this.queued = null
          this.queueAge = 0
        }
        // else stop at center until input — no corner stick by sliding into wall
      }
      return
    }

    let nx = this.px + DX[this.pDir] * step
    let ny = this.py + DY[this.pDir] * step
    nx = wrapX(nx)

    if (this.pDir === 1 || this.pDir === 3) {
      this.px = nx
      this.py = snap(this.py)
    } else {
      this.py = ny
      this.px = snap(this.px)
    }
  }

  private moveGhosts(dt: number) {
    const gMode = this.globalMode()
    for (const g of this.ghosts) {
      if (g.mode === 'eaten') {
        const dx = g.homeX - g.x
        const dy = g.homeY - g.y
        if (dx * dx + dy * dy < 0.04) {
          g.x = g.homeX
          g.y = g.homeY
          g.mode = this.powerT > 0 ? 'frightened' : gMode
        } else {
          this.stepActor(g, EATEN_SPEED * dt, g.homeX, g.homeY)
        }
        continue
      }
      if (g.mode !== 'frightened') g.mode = gMode

      const spd = g.mode === 'frightened' ? FRIGHT_SPEED : GHOST_SPEED
      let tx = g.scatterX
      let ty = g.scatterY
      if (g.mode === 'chase') {
        // blinky-like + slight offsets per ghost (inky/pinky/clyde-lite)
        if (g.id === 0) {
          tx = this.px
          ty = this.py
        } else if (g.id === 1) {
          tx = this.px + DX[this.pDir] * 4
          ty = this.py + DY[this.pDir] * 4
        } else if (g.id === 2) {
          tx = this.px * 2 - g.x
          ty = this.py * 2 - g.y
        } else {
          const d2 = (g.x - this.px) ** 2 + (g.y - this.py) ** 2
          if (d2 > 64) {
            tx = this.px
            ty = this.py
          } else {
            tx = g.scatterX
            ty = g.scatterY
          }
        }
      } else if (g.mode === 'frightened') {
        tx = g.x - (this.px - g.x)
        ty = g.y - (this.py - g.y)
      }
      this.stepActor(g, spd * dt, tx, ty)
    }
  }

  private pickGhostDir(g: Ghost, tx: number, ty: number) {
    const cx = snap(g.x)
    const cy = snap(g.y)
    let opts = this.neighborsAt(cx, cy)
    const noRev = opts.filter((d) => d !== OPP[g.dir])
    if (noRev.length) opts = noRev
    if (!opts.length) return
    let best = opts[0]!
    let bestScore = Infinity
    for (const d of opts) {
      let nx = cx + DX[d]
      let ny = cy + DY[d]
      if (nx < 0) nx = COLS - 1
      if (nx >= COLS) nx = 0
      const dist = (nx - tx) ** 2 + (ny - ty) ** 2
      const score = g.mode === 'frightened' ? -dist : dist
      const j = this.rng() * 0.02
      if (score + j < bestScore) {
        bestScore = score + j
        best = d
      }
    }
    g.dir = best
  }

  private stepActor(g: Ghost, step: number, tx: number, ty: number) {
    // Decide only when landing on a tile center — threshold MUST be < one step,
    // or ghosts snap back every frame and jitter in place (look frozen).
    const centerEps = Math.min(0.12, Math.max(0.04, step * 0.55))
    if (atCenter(g.x, centerEps) && atCenter(g.y, centerEps)) {
      g.x = snap(g.x)
      g.y = snap(g.y)
      this.pickGhostDir(g, tx, ty)
    }

    // Peek into the next cell along current heading (integer grid — never floats).
    let lookX = snap(g.x) + DX[g.dir]
    let lookY = snap(g.y) + DY[g.dir]
    if (lookX < 0) lookX = COLS - 1
    if (lookX >= COLS) lookX = 0
    if (!this.openAt(lookX, lookY)) {
      // Hit a wall mid-tile or chose a dead end: snap + rechoose, then re-check.
      g.x = snap(g.x)
      g.y = snap(g.y)
      this.pickGhostDir(g, tx, ty)
      lookX = snap(g.x) + DX[g.dir]
      lookY = snap(g.y) + DY[g.dir]
      if (lookX < 0) lookX = COLS - 1
      if (lookX >= COLS) lookX = 0
      if (!this.openAt(lookX, lookY)) return
    }

    // Don't overshoot the next center — stop exactly on it so the next tick can turn.
    const ax = DX[g.dir]
    const ay = DY[g.dir]
    if (ax !== 0) {
      const target = snap(g.x) + ax // next center along axis
      const dist = (target - g.x) * ax // positive distance remaining toward target
      if (dist > 0 && step >= dist) {
        g.x = wrapX(target)
        g.y = snap(g.y)
        return
      }
      g.x = wrapX(g.x + ax * step)
      g.y = snap(g.y)
    } else {
      const target = snap(g.y) + ay
      const dist = (target - g.y) * ay
      if (dist > 0 && step >= dist) {
        g.y = target
        g.x = snap(g.x)
        return
      }
      g.y = g.y + ay * step
      g.x = snap(g.x)
    }
  }

  private collect() {
    if (!atCenter(this.px, 0.38) || !atCenter(this.py, 0.38)) return
    const cx = snap(this.px)
    const cy = snap(this.py)
    const k = key(cx, cy)
    if (this.stars.has(k)) {
      this.stars.delete(k)
      this.score += STAR_PTS
      this.starsCollected++
      this.fx.push({ x: cx, y: cy, t: 0.35, kind: 'star' })
    }
    if (this.powers.has(k)) {
      this.powers.delete(k)
      this.powerT = POWER_S
      this.tagChain = 0
      this.say('5D POWER', 1.2)
      this.fx.push({ x: cx, y: cy, t: 0.55, kind: 'power' })
      for (const g of this.ghosts) {
        if (g.mode !== 'eaten') {
          g.mode = 'frightened'
          g.dir = OPP[g.dir]
        }
      }
    }
  }

  private collisions() {
    if (this.invulnT > 0) return
    for (const g of this.ghosts) {
      const dx = g.x - this.px
      const dy = g.y - this.py
      if (dx * dx + dy * dy > 0.32) continue
      if (g.mode === 'frightened') {
        g.mode = 'eaten'
        const pts = TAG_BASE * Math.pow(2, this.tagChain)
        this.tagChain = Math.min(this.tagChain + 1, 3)
        this.score += pts
        this.tags++
        this.say(`TAG +${pts}`, 0.95)
        this.fx.push({ x: g.x, y: g.y, t: 0.7, kind: 'tag', pts })
      } else if (g.mode !== 'eaten') {
        this.hit()
        return
      }
    }
  }

  private hit() {
    this.lives--
    this.phase = 'dying'
    this.dyingT = 1.15
    this.powerT = 0
    this.pTrail = []
    this.say(this.lives > 0 ? 'PHASE BREAK' : 'SIGNAL LOST', 1.1)
    this.emit()
  }

  private respawn() {
    const n = nearestOpen(this.grid, Math.floor(COLS / 2), Math.floor(ROWS / 2) + 2)
    this.px = n.x
    this.py = n.y
    this.pDir = 1
    this.queued = null
    this.queueAge = 0
    this.invulnT = 2.4
    this.spawnGhosts()
    this.phase = 'playing'
    this.say("YOU'RE IN", 1)
  }

  private finish() {
    this.stop()
    const timeBonus = Math.floor(this.livedS * 2)
    this.score += timeBonus
    if (this.score > this.pb) {
      this.pb = this.score
      savePb(this.pb)
    }
    this.ended = {
      score: this.score,
      stars: this.starsCollected,
      tags: this.tags,
      livedS: this.livedS,
      timeBonus,
      shifts: this.shifts,
    }
    this.phase = 'ended'
    this.emit()
  }
}

export { COLS, ROWS }
