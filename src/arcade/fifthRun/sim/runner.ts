/**
 * Fifth Glide — fixed-step on-foot runner sim (120 Hz).
 * Temple Run chase: dark energy behind you, stumbles let it close in, caught / fall = −1 life (3).
 * 💫 stars = bonus metres; Fifth Dimension logo = 10 s invincible + 1.5× surge.
 */
import {
  BODY,
  BUFFER_TICKS,
  FAST_FALL_VY,
  FR_DT,
  GRAVITY,
  JUMP_VY,
  LANE_SPEED,
  OB,
  POWER_TICKS,
  SLIDE_TICKS,
  COYOTE_S,
  HANG,
  BOOST,
  CHASE,
  CORNER,
  PATH_HALF,
  LANE_W,
  DOWN_S,
  SLOW_TICKS,
  STAR_M,
  START_LIVES,
  FR_HZ,
  warmAt,
  laneX,
  multFor,
  speedAt,
} from './constants'
import { keyPos, obstacleS, type Corner, type ObKind, type Obstacle, type PowerKind, type Track } from './track'

export type Action = 'left' | 'right' | 'jump' | 'slide'
/** fall = gap / void / missed corner · crash = crate stack / Cadillac wreck · caught = the UFO got you */
export type LifeCause = 'caught' | 'fall' | 'crash'

export type RunEvent =
  | { type: 'key'; id: number; pts: number; combo: number; mult: number; magnet: boolean; first: boolean }
  | { type: 'miss'; id: number; lostCombo: number }
  | { type: 'mult'; mult: number }
  | { type: 'power'; kind: PowerKind; id: number }
  | { type: 'hit'; ob: number; kind: ObKind; lives: number }
  | { type: 'stumble'; ob: number; kind: ObKind }
  | { type: 'life'; cause: LifeCause; lives: number }
  | { type: 'respawn'; cause: LifeCause }
  | { type: 'boostEnd' }
  | { type: 'jump' }
  | { type: 'slide' }
  | { type: 'land' }
  | { type: 'lane'; dir: -1 | 1 }
  | { type: 'bump'; dir: -1 | 1 }
  | { type: 'dead'; kind: string; ob: number }
  /** took corner `id` (dir −1 = left, 1 = right); `auto` = invincible / respawn auto-turn */
  | { type: 'turn'; id: number; s: number; dir: -1 | 1; auto: boolean; respawn?: boolean }
  /** a left/right swipe was taken as a turn request for the next corner */
  | { type: 'turnQ'; id: number; dir: -1 | 1 }

export type RunState = {
  tick: number
  s: number
  v: number
  lane: number
  x: number
  y: number
  vy: number
  air: boolean
  slide: number
  slideOnLand: boolean
  dead: boolean
  deathKind: string | null
  deathOb: number
  lives: number
  /** 5D logo invuln ticks remaining */
  hand: number
  /** brief post-hit i-frames */
  invuln: number
  /** dark energy closeness 0..1 */
  threat: number
  /** stumble slow-down ticks */
  slowT: number
  stumbles: number
  caughtN: number
  fallN: number
  crashN: number
  keys: number
  combo: number
  maxCombo: number
  mult: number
  keyPts: number
  stumble: number
  /** hang-assist ticks used this jump */
  hang: number
  /** Temple Run continue: ticks left in the fall / crash before respawning in place (0 = running) */
  down: number
  downMax: number
  downKind: LifeCause | null
  /** where to respawn (gap far edge for a fall) */
  downS: number
  queued: Action | null
  queuedAt: number
  latQ: Action | null
  /** lateral target x (lane centre, or tilt) */
  tx: number
  /** device tilt −1..1 (NaN = not in use) and the swipe bias stacked on it */
  tilt: number
  tiltBias: number
  /** s of the last corner handled (turned / fallen at); the next corner is the first beyond it */
  cDone: number
  /** queued turn for the next corner (−1 / 1, 0 = none) */
  turnQ: number
  /** corner fall: the correct way to auto-turn on respawn (0 = none) */
  pendTurn: number
  pendCorner: number
  turns: number
  cornerFallN: number
  obCur: number
  keyCur: number
  pkCur: number
}

export function newRun(): RunState {
  return {
    tick: 0,
    s: 0,
    v: speedAt(0),
    lane: 1,
    x: 0,
    y: 0,
    vy: 0,
    air: false,
    slide: 0,
    slideOnLand: false,
    dead: false,
    deathKind: null,
    deathOb: -1,
    lives: START_LIVES,
    hand: 0,
    invuln: 0,
    threat: 0,
    slowT: 0,
    stumbles: 0,
    caughtN: 0,
    fallN: 0,
    crashN: 0,
    keys: 0,
    combo: 0,
    maxCombo: 0,
    mult: 1,
    keyPts: 0,
    stumble: 0,
    hang: 0,
    down: 0,
    downMax: 0,
    downKind: null,
    downS: 0,
    queued: null,
    queuedAt: 0,
    latQ: null,
    tx: 0,
    tilt: NaN,
    tiltBias: 0,
    cDone: -1,
    turnQ: 0,
    pendTurn: 0,
    pendCorner: -1,
    turns: 0,
    cornerFallN: 0,
    obCur: 0,
    keyCur: 0,
    pkCur: 0,
  }
}

/** Score = distance: metres run + STAR_M bonus metres per star. */
export const scoreOf = (st: RunState) => Math.floor(st.s) + st.keys * STAR_M

/** Speed multiplier from stumble slow-down × logo surge (eased). */
export function speedMul(st: RunState) {
  let m = 1
  if (st.slowT > 0) m *= 1 - (1 - CHASE.slowMul) * (st.slowT / SLOW_TICKS)
  if (st.hand > 0) {
    const el = (POWER_TICKS.hand - st.hand) / FR_HZ
    const left = st.hand / FR_HZ
    const k = Math.max(0, Math.min(1, el / BOOST.easeInS, left / BOOST.easeOutS))
    m *= 1 + (BOOST.mul - 1) * k
  }
  return m
}

export type StepOpts = {
  /** collect stars / pickups and apply lives (false in survival search → any hit = dead) */
  full: boolean
  events?: RunEvent[] | null
}

function carBeside(track: Track, lane: number, s: number, from: number): boolean {
  const obs = track.obstacles
  for (let i = Math.max(0, Math.min(from, obs.length) - 2); i < obs.length; i++) {
    const o = obs[i]
    if (o.s > s + ONCOMING_LEAD) break
    if ((o.kind !== 'block' && o.kind !== 'car') || o.lane !== lane || o.smashed) continue
    const os = o.s
    if (os - BODY.halfD - 0.15 < s && os + o.len + BODY.halfD > s) return true
  }
  return false
}

const ONCOMING_LEAD = 45
const HANG_TICKS = Math.round(HANG.maxS * FR_HZ)

/** A jumpable (hurdle / pipe / gap) in the runner's lane starting within `ahead` metres of the feet. */
function hurdleAhead(track: Track, st: RunState, ahead: number): boolean {
  const obs = track.obstacles
  for (let i = Math.max(0, st.obCur - 2); i < obs.length; i++) {
    const o = obs[i]
    if (o.s > st.s + ahead + BODY.halfD) break
    if (o.smashed || o.kind === 'block' || o.kind === 'car' || o.kind === 'overhead' || o.kind === 'void') continue
    if (Math.abs(st.x - laneX(o.lane)) > 1.0) continue
    if (o.s + o.len < st.s - BODY.halfD) continue
    return true
  }
  return false
}

/** Try to apply an action now. Returns false if it should stay buffered. */
function applyAction(st: RunState, a: Action, track: Track, ev: RunEvent[] | null | undefined): boolean {
  if (a === 'left' || a === 'right') {
    const dir = a === 'left' ? -1 : 1
    const target = st.lane + dir
    if (target < 0 || target > 2) {
      st.stumble = Math.round(0.25 / FR_DT)
      ev?.push({ type: 'bump', dir })
      return true
    }
    if (carBeside(track, target, st.s, st.obCur)) {
      st.stumble = Math.round(0.35 / FR_DT)
      ev?.push({ type: 'bump', dir })
      return true
    }
    st.lane = target
    if (st.tilt === st.tilt) st.tiltBias = Math.max(-2 * LANE_W, Math.min(2 * LANE_W, st.tiltBias + dir * LANE_W))
    else st.tx = laneX(target)
    ev?.push({ type: 'lane', dir })
    return true
  }
  if (a === 'jump') {
    if (st.air) return false
    st.air = true
    st.vy = JUMP_VY
    st.hang = 0
    st.slide = 0
    st.slideOnLand = false
    ev?.push({ type: 'jump' })
    return true
  }
  if (st.air) {
    if (st.vy > -FAST_FALL_VY) st.vy = -FAST_FALL_VY
    st.slideOnLand = true
    return true
  }
  st.slide = SLIDE_TICKS
  ev?.push({ type: 'slide' })
  return true
}

/** Device tilt −1..1 (NaN turns tilt steering off and snaps back to lanes). */
export function setTilt(st: RunState, t: number) {
  if (t !== t) {
    if (st.tilt === st.tilt) {
      st.tilt = NaN
      st.tiltBias = 0
      st.tx = laneX(st.lane)
    }
    return
  }
  st.tilt = Math.max(-1, Math.min(1, t))
}

/** The next corner not yet handled (null if none generated). */
export function nextCorner(st: RunState, track: Track): Corner | null {
  for (const c of track.corners) if (c.s > st.cDone) return c
  return null
}

const cornerDir = (c: Corner, want: number): -1 | 1 => (c.kind === 'L' ? -1 : c.kind === 'R' ? 1 : want < 0 ? -1 : 1)

function doTurn(st: RunState, c: Corner, dir: -1 | 1, auto: boolean, ev: RunEvent[] | null | undefined) {
  st.cDone = c.s
  st.turnQ = 0
  st.turns++
  ev?.push({ type: 'turn', id: c.id, s: c.s, dir, auto })
}

/** Ran off the corner (too late / wrong way): fall, respawn already turned the right way. */
function cornerFall(st: RunState, c: Corner, want: number, opts: StepOpts, ev: RunEvent[] | null | undefined) {
  const fake = { id: c.id, kind: 'gap', lane: 1, s: c.s, len: 0, vs: 0, variant: 0, smashed: false } as Obstacle
  st.cornerFallN++
  if (st.combo > 0) breakCombo(st, -1, ev)
  if (!opts.full) {
    st.dead = true
    st.deathKind = 'fall'
    st.deathOb = c.id
    ev?.push({ type: 'dead', kind: 'fall', ob: c.id })
    return
  }
  st.cDone = c.s
  st.turnQ = 0
  st.pendTurn = cornerDir(c, want || (st.x <= 0 ? -1 : 1))
  st.pendCorner = c.id
  loseLife(st, fake, 'fall', ev)
  st.downS = c.s + CORNER.half + 0.6
}

export function queueAction(st: RunState, a: Action) {
  if (a === 'left' || a === 'right') {
    st.latQ = a
    return
  }
  st.queued = a
  st.queuedAt = st.tick
}

function loseLife(st: RunState, o: Obstacle, cause: LifeCause, ev: RunEvent[] | null | undefined) {
  st.lives--
  if (cause === 'caught') st.caughtN++
  else if (cause === 'fall') st.fallN++
  else st.crashN++
  if (st.lives <= 0) {
    st.dead = true
    st.deathKind = cause
    st.deathOb = o.id
    ev?.push({ type: 'dead', kind: cause, ob: o.id })
    return
  }
  // Temple Run continue: play the fall / crash in place, then respawn on this spot (see step()).
  st.down = Math.round(DOWN_S[cause] * FR_HZ)
  st.downMax = st.down
  st.downKind = cause
  st.downS = cause === 'fall' && o.kind === 'gap' ? Math.max(st.s, o.s + o.len + 0.6) : st.s
  st.threat = 0
  st.slowT = 0
  st.queued = null
  st.latQ = null
  st.slideOnLand = false
  ev?.push({ type: 'life', cause, lives: st.lives })
}

/** End of the downed beat: back on your feet at the same spot, flashing (i-frames), still running. */
function respawn(st: RunState, track: Track, ev: RunEvent[] | null | undefined) {
  const cause = st.downKind ?? 'crash'
  st.s = st.downS
  if (st.pendTurn) {
    ev?.push({ type: 'turn', id: st.pendCorner, s: st.cDone, dir: st.pendTurn as -1 | 1, auto: true, respawn: true })
    st.turns++
    st.pendTurn = 0
    st.pendCorner = -1
  }
  // fell off a missing lane: come back on the nearest lane that is there
  for (let i = Math.max(0, st.obCur - 2); i < track.obstacles.length; i++) {
    const o = track.obstacles[i]
    if (o.s > st.s + 4) break
    if (o.kind !== 'void' || o.s + o.len < st.s - 1 || o.lane !== st.lane) continue
    st.lane = 1
  }
  st.tiltBias = 0
  st.tx = laneX(st.lane)
  st.x = laneX(st.lane)
  st.y = 0
  st.vy = 0
  st.air = false
  st.slide = 0
  st.stumble = 0
  st.invuln = POWER_TICKS.respawn
  // ease back up to speed instead of snapping
  st.slowT = SLOW_TICKS
  st.downKind = null
  st.downMax = 0
  // whatever downed you is cleared so you never respawn inside it
  for (let i = Math.max(0, st.obCur - 2); i < track.obstacles.length; i++) {
    const o = track.obstacles[i]
    if (o.s > st.s + 3) break
    const os = obstacleS(o, st.s)
    if (os <= st.s + 3 && os + o.len >= st.s - 1 && o.lane === st.lane && o.kind !== 'gap' && o.kind !== 'void') o.smashed = true
  }
  ev?.push({ type: 'respawn', cause })
}

/** Streak over: a missed star while vulnerable, or a real hit. */
function breakCombo(st: RunState, id: number, ev: RunEvent[] | null | undefined) {
  const lost = st.combo
  st.combo = 0
  st.mult = 1
  ev?.push({ type: 'miss', id, lostCombo: lost })
}

function applyHit(st: RunState, o: Obstacle, opts: StepOpts, ev: RunEvent[] | null | undefined) {
  // a real hit (only reached when vulnerable) ends the star streak
  if (st.combo > 0) breakCombo(st, -1, ev)
  // Survival search: any hit ends the path
  if (!opts.full) {
    st.dead = true
    st.deathKind = o.kind
    st.deathOb = o.id
    ev?.push({ type: 'dead', kind: o.kind, ob: o.id })
    return
  }
  if (o.kind === 'gap' || o.kind === 'void') {
    loseLife(st, o, 'fall', ev)
    return
  }
  o.smashed = true
  // walls: running into a boulder or an oncoming car costs a life outright
  if (o.kind === 'block' || o.kind === 'car') {
    loseLife(st, o, 'crash', ev)
    return
  }
  st.stumbles++
  if (st.threat >= CHASE.catchAt) {
    loseLife(st, o, 'caught', ev)
    return
  }
  st.threat = CHASE.hit
  st.slowT = SLOW_TICKS
  st.stumble = Math.round(0.45 * FR_HZ)
  st.invuln = POWER_TICKS.stumble
  ev?.push({ type: 'stumble', ob: o.id, kind: o.kind })
}

/** Advance one fixed tick. */
export function step(st: RunState, track: Track, opts: StepOpts) {
  if (st.dead) return
  const ev = opts.events
  st.tick++

  if (st.down > 0) {
    // downed: falling into the hole / knocked flat — no forward motion, inputs ignored
    st.down--
    st.v = 0
    st.queued = null
    st.latQ = null
    if (st.down === 0) respawn(st, track, ev)
    return
  }

  const corner = nextCorner(st, track)
  if (st.latQ) {
    // near a corner a left/right swipe is a turn, not a lane change
    const d = corner ? corner.s - st.s : 1e9
    if (corner && d <= st.v * CORNER.armS + CORNER.half && d >= -CORNER.half - st.v * (CORNER.lateS + CORNER.lateWarmS)) {
      st.turnQ = st.latQ === 'left' ? -1 : 1
      ev?.push({ type: 'turnQ', id: corner.id, dir: st.turnQ as -1 | 1 })
    } else applyAction(st, st.latQ, track, ev)
    st.latQ = null
  }
  if (st.queued) {
    if (applyAction(st, st.queued, track, ev)) st.queued = null
    else if (st.tick - st.queuedAt > BUFFER_TICKS) st.queued = null
  }

  if (st.tilt === st.tilt) {
    st.tx = Math.max(-PATH_HALF, Math.min(PATH_HALF, st.tilt * PATH_HALF * 1.15 + st.tiltBias))
    st.lane = st.tx < -LANE_W / 2 ? 0 : st.tx > LANE_W / 2 ? 2 : 1
  }
  const tx = st.tx
  const dx = tx - st.x
  const maxStep = LANE_SPEED * FR_DT
  st.x = Math.abs(dx) <= maxStep ? tx : st.x + (dx > 0 ? maxStep : -maxStep)

  if (st.air) {
    let g = GRAVITY
    // hang assist: falling with a hurdle / gap just ahead in this lane → float a little longer
    if (st.vy < 0 && st.hang < HANG_TICKS && hurdleAhead(track, st, st.v * HANG.leadS)) {
      g = GRAVITY * HANG.g
      st.hang++
    }
    st.vy -= g * FR_DT
    st.y += st.vy * FR_DT
    if (st.y <= 0) {
      st.y = 0
      st.vy = 0
      st.air = false
      ev?.push({ type: 'land' })
      if (st.slideOnLand) {
        st.slideOnLand = false
        st.slide = SLIDE_TICKS
        ev?.push({ type: 'slide' })
      }
    }
  } else if (st.slide > 0) st.slide--

  st.s += st.v * FR_DT
  st.v = speedAt(st.s) * speedMul(st)

  // ── corners ──
  if (corner) {
    if (st.hand > 0 && st.s >= corner.s - 0.5) {
      // invincible: takes the turn by itself (a T goes the way you asked, else toward your side)
      doTurn(st, corner, cornerDir(corner, st.turnQ || (st.x <= 0 ? -1 : 1)), true, ev)
    } else if (st.turnQ && st.s >= corner.s - CORNER.half) {
      const ok = corner.kind === 'T' || (corner.kind === 'L' ? st.turnQ < 0 : st.turnQ > 0)
      if (ok) doTurn(st, corner, st.turnQ as -1 | 1, false, ev)
      else {
        cornerFall(st, corner, st.turnQ, opts, ev)
        return
      }
    } else if (st.s >= corner.s + CORNER.half + st.v * (CORNER.lateS + CORNER.lateWarmS * warmAt(st.s))) {
      cornerFall(st, corner, 0, opts, ev)
      return
    }
  }

  if (st.invuln > 0) st.invuln--
  if (st.slowT > 0) st.slowT--
  if (st.hand > 0) {
    st.hand--
    st.threat = 0
    if (st.hand === 0) {
      st.invuln = Math.max(st.invuln, POWER_TICKS.afterBoost)
      ev?.push({ type: 'boostEnd' })
    }
  } else if (st.threat > 0) {
    const rec = CHASE.recoverS * (1 - CHASE.warmRecoverCut * warmAt(st.s))
    st.threat = Math.max(0, st.threat - FR_DT / rec)
  }
  if (st.stumble > 0) st.stumble--

  // ── obstacles (use live oncoming positions) ──
  const obs = track.obstacles
  while (st.obCur < obs.length && obs[st.obCur].s + obs[st.obCur].len < st.s - 25) st.obCur++
  if (st.obCur > obs.length) st.obCur = 0
  const sB = st.s - BODY.halfD
  const sF = st.s + BODY.halfD
  const top = st.y + (st.slide > 0 && !st.air ? BODY.slideH : BODY.h)
  const protected_ = st.invuln > 0 || st.hand > 0
  for (let i = Math.max(0, st.obCur - 2); i < obs.length; i++) {
    const o = obs[i]
    if (o.s > st.s + ONCOMING_LEAD + 5) break
    if (o.smashed) continue
    const os = obstacleS(o, st.s)
    if (os > sF) continue
    if (os + o.len < sB) continue
    const lx = Math.abs(st.x - laneX(o.lane))
    let hit = false
    // Hits only when the body box really intersects the obstacle box (the meshes are built to these sizes).
    if (o.kind === 'gap') {
      // you fall only with both feet on the ground over the hole; coyote time at the near edge
      const coy = Math.min(o.len * 0.35, 0.2 + st.v * COYOTE_S)
      hit = !st.air && st.y <= 0 && lx < OB.gap.halfW - 0.1 && st.s > os + coy && st.s < os + o.len - 0.35
    } else if (o.kind === 'void') {
      // the lane isn't there: fall as soon as both feet are down over it (no jumping a whole stretch)
      hit = !st.air && st.y <= 0 && lx < OB.gap.halfW - 0.1 && st.s > os + 0.25 && st.s < os + o.len - 0.25
    } else if (o.kind === 'barrier') {
      // low hurdle: feet above the top = clear, always
      hit = lx < BODY.halfW + OB.barrier.halfW && st.y < OB.barrier.h
    } else if (o.kind === 'overhead') {
      hit = lx < BODY.halfW + OB.overhead.halfW && top > OB.overhead.bottom
    } else if (o.kind === 'pipe') {
      // chest-high bar: slide under (head below) or jump over (feet above)
      hit = lx < BODY.halfW + OB.pipe.halfW && top > OB.pipe.bottom && st.y < OB.pipe.top
    } else if (o.kind === 'car') {
      hit = lx < BODY.halfW + OB.car.halfW - 0.12 && st.y < OB.car.h
    } else {
      hit = lx < BODY.halfW + OB.block.halfW - 0.2 && st.y < OB.block.h
    }
    if (!hit) continue
    if (protected_) {
      // Hand / post-hit: smash through without losing a life
      // Logo: auto-pass (smash) everything, gaps included. Post-hit grace: pass through.
      if (st.hand > 0 && o.kind !== 'gap' && o.kind !== 'void') o.smashed = true
      continue
    }
    applyHit(st, o, opts, ev)
    if (st.dead) return
  }

  if (!opts.full) return

  // ── shooting stars ──
  const keys = track.keys
  while (st.keyCur < keys.length && keys[st.keyCur].s < st.s - 3) st.keyCur++
  if (st.keyCur > keys.length) st.keyCur = 0
  const bodyTop = st.y + (st.slide > 0 && !st.air ? BODY.slideH : BODY.h)
  for (let i = Math.max(0, st.keyCur - 4); i < keys.length; i++) {
    const k = keys[i]
    const dz = k.s - st.s
    if (dz > 10.5) break
    if (k.state !== 0) continue
    let take = false
    const kp = dz > -0.6 && dz < 0.6 ? keyPos(k, st.s) : null
    if (kp && Math.abs(st.x - kp.x) < 0.85 && kp.y > st.y - 0.3 && kp.y < bodyTop + 0.2) {
      take = true
    }
    if (take) {
      k.state = 1
      k.magnet = false
      k.takenTick = st.tick
      const prevMult = st.mult
      st.keys++
      st.combo++
      if (st.combo > st.maxCombo) st.maxCombo = st.combo
      st.mult = multFor(st.combo)
      const pts = STAR_M
      st.keyPts += pts
      ev?.push({ type: 'key', id: k.id, pts, combo: st.combo, mult: st.mult, magnet: false, first: st.keys === 1 })
      if (st.mult > prevMult) ev?.push({ type: 'mult', mult: st.mult })
    } else if (dz < -0.8) {
      k.state = 2
      // invincible (5D logo, incl. its blinking tail) or respawn grace: smashing / passing through
      // things skips their star arcs without breaking the streak
      if (st.invuln > 0 || st.hand > 0) continue
      breakCombo(st, k.id, ev)
    }
  }

  // ── pickups (🖐️ hand) ──
  const pks = track.pickups
  while (st.pkCur < pks.length && pks[st.pkCur].s < st.s - 3) st.pkCur++
  if (st.pkCur > pks.length) st.pkCur = 0
  for (let i = Math.max(0, st.pkCur - 1); i < pks.length; i++) {
    const p = pks[i]
    const dz = p.s - st.s
    if (dz > 2) break
    if (p.taken) continue
    if (Math.abs(dz) < 0.8 && Math.abs(st.x - laneX(p.lane)) < 1.0 && st.y < 1.6) {
      p.taken = true
      p.takenTick = st.tick
      st.hand = POWER_TICKS.hand
      st.slowT = 0
      st.threat = 0
      st.stumble = 0
      ev?.push({ type: 'power', kind: p.kind, id: p.id })
    }
  }
}

export function resetCursors(st: RunState) {
  st.obCur = 0
  st.keyCur = 0
  st.pkCur = 0
}

export function cloneRun(st: RunState): RunState {
  return { ...st }
}

export type { Obstacle }
