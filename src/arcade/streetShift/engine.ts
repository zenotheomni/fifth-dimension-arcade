import {
  COLS,
  ROWS,
  generateMaze,
  ensureExits,
  isOpen,
  openNeighbors,
  nearestOpen,
  powerSpots,
  key,
  mulberry32,
  reachable,
} from './maze'
import {
  type Cell,
  type Dir,
  type Ghost,
  type GamePhase,
  type EndStats,
  DX,
  DY,
  OPP,
  STAR_PTS,
  TAG_BASE,
  POWER_S,
  SHIFT_EVERY_S,
  SHIFT_WARN_S,
  START_LIVES,
  PLAYER_SPEED,
  GHOST_SPEED,
  FRIGHT_SPEED,
  EATEN_SPEED,
  PB_KEY,
} from './types'

export type Hud = {
  phase: GamePhase
  score: number
  lives: number
  starsLeft: number
  powerLeft: number
  shiftWarn: number // 0..1 during warning, else 0
  shifts: number
  pb: number
  callout: string | null
}

export type Listener = (h: Hud) => void

const GHOST_COLORS = ['#FF5A3C', '#00C8C4', '#FF8C28', '#7DFFC3']

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

function atCenter(v: number, eps = 0.12) {
  return Math.abs(v - Math.round(v)) < eps
}

export class StreetShiftEngine {
  grid: Cell[] = []
  stars = new Set<number>()
  powers = new Set<number>()
  px = 1
  py = 1
  pDir: Dir = 1
  queued: Dir | null = null
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
  private rng = mulberry32(this.seed)
  private listeners = new Set<Listener>()
  private raf = 0
  private last = 0
  private ended: EndStats | null = null

  on(fn: Listener) {
    this.listeners.add(fn)
    fn(this.hud())
    return () => this.listeners.delete(fn)
  }

  hud(): Hud {
    return {
      phase: this.phase,
      score: this.score,
      lives: this.lives,
      starsLeft: this.stars.size,
      powerLeft: this.powerT,
      shiftWarn: this.warnT > 0 ? 1 - this.warnT / SHIFT_WARN_S : 0,
      shifts: this.shifts,
      pb: this.pb,
      callout: this.callout,
    }
  }

  private emit() {
    const h = this.hud()
    for (const fn of this.listeners) fn(h)
  }

  private say(msg: string, s = 1.4) {
    this.callout = msg
    this.calloutT = s
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
    this.ended = null
    this.seed = (Math.random() * 1e9) | 0
    this.rng = mulberry32(this.seed)
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

  queueDir(d: Dir) {
    if (this.phase !== 'playing') return
    // reverse immediately when opposite
    if (d === OPP[this.pDir]) {
      this.pDir = d
      this.queued = null
      return
    }
    this.queued = d
  }

  private buildLevel(placePlayer: boolean) {
    this.grid = generateMaze(this.rng)
    const spawn = nearestOpen(this.grid, Math.floor(COLS / 2), Math.floor(ROWS / 2) + 2)
    if (placePlayer) {
      this.px = spawn.x
      this.py = spawn.y
      this.pDir = 1
      this.queued = null
    } else {
      const n = nearestOpen(this.grid, Math.round(this.px), Math.round(this.py))
      this.px = n.x
      this.py = n.y
    }
    ensureExits(this.grid, Math.round(this.px), Math.round(this.py), 45, this.rng)
    const reach = reachable(this.grid, Math.round(this.px), Math.round(this.py))
    // stars on reachable cells except spawn neighborhood
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
    }))
  }

  private mazeShift() {
    const px = Math.round(this.px)
    const py = Math.round(this.py)
    const keptStars = new Set<number>()
    this.grid = generateMaze(this.rng)
    const n = nearestOpen(this.grid, px, py)
    this.px = n.x
    this.py = n.y
    ensureExits(this.grid, n.x, n.y, 45, this.rng)
    const reach = reachable(this.grid, n.x, n.y)
    for (const k of this.stars) {
      if (reach.has(k)) keptStars.add(k)
    }
    // refill a bit so shift doesn't empty the board
    for (const k of reach) {
      if (keptStars.size >= Math.floor(reach.size * 0.55)) break
      const x = k % COLS
      const y = (k / COLS) | 0
      if (Math.abs(x - n.x) + Math.abs(y - n.y) < 2) continue
      if (this.powers.has(k)) continue
      keptStars.add(k)
    }
    this.stars = keptStars
    // re-place powers on open corners
    this.powers = new Set()
    for (const p of powerSpots(this.grid, n.x, n.y)) {
      const k = key(p.x, p.y)
      if (reach.has(k)) {
        this.powers.add(k)
        this.stars.delete(k)
      }
    }
    for (const g of this.ghosts) {
      const gn = nearestOpen(this.grid, Math.round(g.x), Math.round(g.y))
      g.x = gn.x
      g.y = gn.y
      if (g.mode === 'frightened') continue
      g.mode = 'scatter'
    }
    this.shifts++
    this.say('MAZE SHIFT', 1.2)
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
    if (this.powerT > 0) {
      this.powerT -= dt
      if (this.powerT <= 0) {
        this.powerT = 0
        this.tagChain = 0
        for (const g of this.ghosts) {
          if (g.mode === 'frightened') g.mode = 'chase'
        }
      }
    }

    // maze shift timer
    this.shiftT += dt
    const until = SHIFT_EVERY_S - this.shiftT
    if (until <= SHIFT_WARN_S && until > 0) {
      this.warnT = until
    } else {
      this.warnT = 0
    }
    if (this.shiftT >= SHIFT_EVERY_S) {
      this.shiftT = 0
      this.warnT = 0
      this.mazeShift()
    }

    this.movePlayer(dt)
    this.moveGhosts(dt)
    this.collect()
    this.collisions()

    // refill if cleared
    if (this.stars.size === 0 && this.powers.size === 0) {
      this.score += 500
      this.say('STREET CLEARED +500', 1.5)
      this.buildLevel(false)
    }

    this.emit()
  }

  private movePlayer(dt: number) {
    // try queued turn at cell centers
    if (this.queued != null && atCenter(this.px) && atCenter(this.py)) {
      const cx = Math.round(this.px)
      const cy = Math.round(this.py)
      const opts = openNeighbors(this.grid, cx, cy)
      if (opts.includes(this.queued)) {
        this.px = cx
        this.py = cy
        this.pDir = this.queued
        this.queued = null
      }
    }
    // forgiving: also allow turn slightly before center if next cell in queued dir is open
    if (this.queued != null) {
      const cx = Math.round(this.px)
      const cy = Math.round(this.py)
      const q = this.queued
      let nx = cx + DX[q]
      let ny = cy + DY[q]
      if (nx < 0) nx = COLS - 1
      if (nx >= COLS) nx = 0
      if (isOpen(this.grid, nx, ny)) {
        const along = this.pDir === 1 || this.pDir === 3 ? this.px - cx : this.py - cy
        if (Math.abs(along) < 0.35) {
          this.px = cx
          this.py = cy
          this.pDir = q
          this.queued = null
        }
      }
    }

    let speed = PLAYER_SPEED
    const step = speed * dt
    let nx = this.px + DX[this.pDir] * step
    let ny = this.py + DY[this.pDir] * step
    nx = wrapX(nx)

    // wall stop: if next cell blocked, snap to center and wait
    const tx = Math.round(this.px + DX[this.pDir] * 0.55)
    const ty = Math.round(this.py + DY[this.pDir] * 0.55)
    let checkX = tx
    if (checkX < 0) checkX = COLS - 1
    if (checkX >= COLS) checkX = 0
    if (!isOpen(this.grid, checkX, ty) && inFrontWall()) {
      this.px = Math.round(this.px)
      this.py = Math.round(this.py)
      // auto-pick if only one way (besides reverse) — keeps flow on phone
      const opts = openNeighbors(this.grid, this.px, this.py).filter((d) => d !== OPP[this.pDir])
      if (opts.length === 1) this.pDir = opts[0]!
      else if (this.queued != null && opts.includes(this.queued)) {
        this.pDir = this.queued
        this.queued = null
      }
      return
    }
    this.px = nx
    this.py = ny

    function inFrontWall() {
      return true
    }
  }

  private moveGhosts(dt: number) {
    const chase = this.livedS % 12 > 5 // alternate scatter/chase
    for (const g of this.ghosts) {
      if (g.mode === 'eaten') {
        // return home
        const dx = g.homeX - g.x
        const dy = g.homeY - g.y
        if (dx * dx + dy * dy < 0.04) {
          g.x = g.homeX
          g.y = g.homeY
          g.mode = this.powerT > 0 ? 'frightened' : chase ? 'chase' : 'scatter'
        } else {
          this.stepActor(g, EATEN_SPEED * dt, g.homeX, g.homeY)
        }
        continue
      }
      if (g.mode !== 'frightened') {
        g.mode = chase ? 'chase' : 'scatter'
      }
      const spd = g.mode === 'frightened' ? FRIGHT_SPEED : GHOST_SPEED
      let tx = g.scatterX
      let ty = g.scatterY
      if (g.mode === 'chase') {
        tx = this.px
        ty = this.py
      } else if (g.mode === 'frightened') {
        tx = g.x - (this.px - g.x)
        ty = g.y - (this.py - g.y)
      }
      this.stepActor(g, spd * dt, tx, ty)
    }
  }

  private stepActor(g: Ghost, step: number, tx: number, ty: number) {
    if (atCenter(g.x, 0.15) && atCenter(g.y, 0.15)) {
      g.x = Math.round(g.x)
      g.y = Math.round(g.y)
      let opts = openNeighbors(this.grid, g.x, g.y)
      // no reverse unless dead-end
      const noRev = opts.filter((d) => d !== OPP[g.dir])
      if (noRev.length) opts = noRev
      if (!opts.length) return
      // pick dir that minimizes / maximizes distance to target
      let best = opts[0]!
      let bestScore = Infinity
      for (const d of opts) {
        let nx = g.x + DX[d]
        let ny = g.y + DY[d]
        if (nx < 0) nx = COLS - 1
        if (nx >= COLS) nx = 0
        const dist = (nx - tx) ** 2 + (ny - ty) ** 2
        const score = g.mode === 'frightened' ? -dist : dist
        // tiny jitter
        const j = this.rng() * 0.01
        if (score + j < bestScore) {
          bestScore = score + j
          best = d
        }
      }
      g.dir = best
    }
    let nx = g.x + DX[g.dir] * step
    let ny = g.y + DY[g.dir] * step
    nx = wrapX(nx)
    const cx = Math.round(g.x + DX[g.dir] * 0.55)
    const cy = Math.round(g.y + DY[g.dir] * 0.55)
    let checkX = cx
    if (checkX < 0) checkX = COLS - 1
    if (checkX >= COLS) checkX = 0
    if (!isOpen(this.grid, checkX, cy)) {
      g.x = Math.round(g.x)
      g.y = Math.round(g.y)
      return
    }
    g.x = nx
    g.y = ny
  }

  private collect() {
    const cx = Math.round(this.px)
    const cy = Math.round(this.py)
    if (!atCenter(this.px, 0.35) || !atCenter(this.py, 0.35)) return
    const k = key(cx, cy)
    if (this.stars.has(k)) {
      this.stars.delete(k)
      this.score += STAR_PTS
      this.starsCollected++
    }
    if (this.powers.has(k)) {
      this.powers.delete(k)
      this.powerT = POWER_S
      this.tagChain = 0
      this.say('5D POWER', 1.2)
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
      if (dx * dx + dy * dy > 0.35) continue
      if (g.mode === 'frightened') {
        g.mode = 'eaten'
        const pts = TAG_BASE * Math.pow(2, this.tagChain)
        this.tagChain = Math.min(this.tagChain + 1, 3)
        this.score += pts
        this.tags++
        this.say(`TAG +${pts}`, 1)
      } else if (g.mode !== 'eaten') {
        this.hit()
        return
      }
    }
  }

  private hit() {
    this.lives--
    this.phase = 'dying'
    this.dyingT = 1.1
    this.powerT = 0
    this.say(this.lives > 0 ? 'GLITCH' : 'RUN OVER', 1.1)
    this.emit()
  }

  private respawn() {
    const n = nearestOpen(this.grid, Math.floor(COLS / 2), Math.floor(ROWS / 2) + 2)
    this.px = n.x
    this.py = n.y
    this.pDir = 1
    this.queued = null
    this.invulnT = 2
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
