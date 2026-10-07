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
  BOOST,
  CHASE,
  SLOW_TICKS,
  STAR_M,
  START_LIVES,
  FR_HZ,
  warmAt,
  laneX,
  multFor,
  speedAt,
} from './constants'
import { keyPos, obstacleS, type ObKind, type Obstacle, type PowerKind, type Track } from './track'

export type Action = 'left' | 'right' | 'jump' | 'slide'

export type RunEvent =
  | { type: 'key'; id: number; pts: number; combo: number; mult: number; magnet: boolean; first: boolean }
  | { type: 'miss'; id: number; lostCombo: number }
  | { type: 'mult'; mult: number }
  | { type: 'power'; kind: PowerKind; id: number }
  | { type: 'hit'; ob: number; kind: ObKind; lives: number }
  | { type: 'stumble'; ob: number; kind: ObKind }
  | { type: 'life'; cause: 'caught' | 'fall'; lives: number }
  | { type: 'boostEnd' }
  | { type: 'jump' }
  | { type: 'slide' }
  | { type: 'land' }
  | { type: 'lane'; dir: -1 | 1 }
  | { type: 'bump'; dir: -1 | 1 }
  | { type: 'dead'; kind: string; ob: number }

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
  keys: number
  combo: number
  maxCombo: number
  mult: number
  keyPts: number
  stumble: number
  queued: Action | null
  queuedAt: number
  latQ: Action | null
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
    keys: 0,
    combo: 0,
    maxCombo: 0,
    mult: 1,
    keyPts: 0,
    stumble: 0,
    queued: null,
    queuedAt: 0,
    latQ: null,
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
    const k = Math.min(1, el / BOOST.easeInS, left / BOOST.easeOutS)
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
    if (o.kind !== 'block' || o.lane !== lane || o.smashed) continue
    const os = o.s
    if (os - BODY.halfD - 0.15 < s && os + o.len + BODY.halfD > s) return true
  }
  return false
}

const ONCOMING_LEAD = 45

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
    ev?.push({ type: 'lane', dir })
    return true
  }
  if (a === 'jump') {
    if (st.air) return false
    st.air = true
    st.vy = JUMP_VY
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

export function queueAction(st: RunState, a: Action) {
  if (a === 'left' || a === 'right') {
    st.latQ = a
    return
  }
  st.queued = a
  st.queuedAt = st.tick
}

function loseLife(st: RunState, o: Obstacle, cause: 'caught' | 'fall', ev: RunEvent[] | null | undefined) {
  st.lives--
  if (cause === 'caught') st.caughtN++
  else st.fallN++
  if (st.lives <= 0) {
    st.dead = true
    st.deathKind = cause
    st.deathOb = o.id
    ev?.push({ type: 'dead', kind: cause, ob: o.id })
    return
  }
  // respawn on safe ground from the same distance: smoke pushed back, grace window
  st.threat = 0
  st.slowT = 0
  st.invuln = POWER_TICKS.respawn
  if (cause === 'fall') {
    st.air = true
    st.vy = JUMP_VY
    st.slide = 0
  }
  ev?.push({ type: 'life', cause, lives: st.lives })
}

function applyHit(st: RunState, o: Obstacle, opts: StepOpts, ev: RunEvent[] | null | undefined) {
  // Survival search: any hit ends the path
  if (!opts.full) {
    st.dead = true
    st.deathKind = o.kind
    st.deathOb = o.id
    ev?.push({ type: 'dead', kind: o.kind, ob: o.id })
    return
  }
  o.smashed = true
  if (o.kind === 'gap') {
    loseLife(st, o, 'fall', ev)
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

  if (st.latQ) {
    applyAction(st, st.latQ, track, ev)
    st.latQ = null
  }
  if (st.queued) {
    if (applyAction(st, st.queued, track, ev)) st.queued = null
    else if (st.tick - st.queuedAt > BUFFER_TICKS) st.queued = null
  }

  const tx = laneX(st.lane)
  const dx = tx - st.x
  const maxStep = LANE_SPEED * FR_DT
  st.x = Math.abs(dx) <= maxStep ? tx : st.x + (dx > 0 ? maxStep : -maxStep)

  if (st.air) {
    st.vy -= GRAVITY * FR_DT
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
    if (o.kind === 'gap') {
      hit = !st.air && st.y <= 0 && lx < OB.gap.halfW && st.s > os + 0.2 && st.s < os + o.len - 0.2
    } else if (o.kind === 'barrier') {
      hit = lx < BODY.halfW + OB.barrier.halfW && st.y < OB.barrier.h - 0.05
    } else if (o.kind === 'overhead') {
      hit = lx < BODY.halfW + OB.overhead.halfW && top > OB.overhead.bottom
    } else {
      hit = lx < BODY.halfW + OB.block.halfW - 0.2 && st.y < OB.block.h
    }
    if (!hit) continue
    if (protected_) {
      // Hand / post-hit: smash through without losing a life
      // Logo: auto-pass (smash) everything, gaps included. Post-hit grace: pass through.
      if (st.hand > 0 && o.kind !== 'gap') o.smashed = true
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
      const lost = st.combo
      st.combo = 0
      st.mult = 1
      ev?.push({ type: 'miss', id: k.id, lostCombo: lost })
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
