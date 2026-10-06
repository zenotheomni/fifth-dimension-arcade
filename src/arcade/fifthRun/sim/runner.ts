/**
 * Fifth Run — fixed-step runner sim (120 Hz). Pure data + arithmetic, shared by the game,
 * the in-game autopilot and the headless harness.
 */
import {
  BODY,
  BUFFER_TICKS,
  FAST_FALL_VY,
  FR_DT,
  GRAVITY,
  JUMP_VY,
  KEY_PTS,
  LANE_SPEED,
  OB,
  POWER_TICKS,
  SLIDE_TICKS,
  laneX,
  multFor,
  speedAt,
} from './constants'
import type { ObKind, Obstacle, PowerKind, Track } from './track'

export type Action = 'left' | 'right' | 'jump' | 'slide'

export type RunEvent =
  | { type: 'key'; id: number; pts: number; combo: number; mult: number; magnet: boolean; first: boolean }
  | { type: 'miss'; id: number; lostCombo: number }
  | { type: 'mult'; mult: number }
  | { type: 'power'; kind: PowerKind; id: number }
  | { type: 'shield'; ob: number; kind: ObKind }
  | { type: 'jump' }
  | { type: 'slide' }
  | { type: 'land' }
  | { type: 'lane'; dir: -1 | 1 }
  | { type: 'bump'; dir: -1 | 1 }
  | { type: 'dead'; kind: ObKind; ob: number }

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
  deathKind: ObKind | null
  deathOb: number
  shield: boolean
  invuln: number
  magnet: number
  five: number
  keys: number
  combo: number
  maxCombo: number
  mult: number
  keyPts: number
  stumble: number
  /** buffered jump/slide (waits for landing within BUFFER_TICKS) */
  queued: Action | null
  queuedAt: number
  /** lane change (applies next tick, never buffered) */
  latQ: Action | null
  /** scan cursors into the track arrays (perf) */
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
    shield: false,
    invuln: 0,
    magnet: 0,
    five: 0,
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

export const scoreOf = (st: RunState) => Math.floor(st.s) + st.keyPts

export type StepOpts = {
  /** collect keys / pickups and allow the shield (false in survival search) */
  full: boolean
  events?: RunEvent[] | null
}

function carBeside(track: Track, lane: number, s: number, from: number): boolean {
  const obs = track.obstacles
  for (let i = Math.max(0, Math.min(from, obs.length) - 2); i < obs.length; i++) {
    const o = obs[i]
    if (o.s > s + 1) break
    if (o.kind !== 'car' || o.lane !== lane || o.smashed) continue
    if (o.s - BODY.halfD - 0.15 < s && o.s + o.len + BODY.halfD > s) return true
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
  // slide
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

/** Advance one fixed tick. */
export function step(st: RunState, track: Track, opts: StepOpts) {
  if (st.dead) return
  const ev = opts.events
  st.tick++

  // input: lane change first, then buffered jump/slide
  if (st.latQ) {
    applyAction(st, st.latQ, track, ev)
    st.latQ = null
  }
  if (st.queued) {
    if (applyAction(st, st.queued, track, ev)) st.queued = null
    else if (st.tick - st.queuedAt > BUFFER_TICKS) st.queued = null
  }

  // lateral
  const tx = laneX(st.lane)
  const dx = tx - st.x
  const maxStep = LANE_SPEED * FR_DT
  st.x = Math.abs(dx) <= maxStep ? tx : st.x + (dx > 0 ? maxStep : -maxStep)

  // vertical
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

  // forward
  st.s += st.v * FR_DT
  st.v = speedAt(st.s)

  if (st.invuln > 0) st.invuln--
  if (st.stumble > 0) st.stumble--
  if (st.magnet > 0) st.magnet--
  if (st.five > 0) st.five--

  // ── obstacles ──
  const obs = track.obstacles
  while (st.obCur < obs.length && obs[st.obCur].s + obs[st.obCur].len < st.s - 2) st.obCur++
  if (st.obCur > obs.length) st.obCur = 0
  const sB = st.s - BODY.halfD
  const sF = st.s + BODY.halfD
  const top = st.y + (st.slide > 0 && !st.air ? BODY.slideH : BODY.h)
  for (let i = Math.max(0, st.obCur - 2); i < obs.length; i++) {
    const o = obs[i]
    if (o.s > sF) break
    if (o.s + o.len < sB || o.smashed) continue
    const lx = Math.abs(st.x - laneX(o.lane))
    let hit = false
    if (o.kind === 'gap') {
      hit = !st.air && st.y <= 0 && lx < OB.gap.halfW && st.s > o.s + 0.2 && st.s < o.s + o.len - 0.2
    } else if (o.kind === 'barrier') {
      hit = lx < BODY.halfW + OB.barrier.halfW && st.y < OB.barrier.h - 0.05
    } else if (o.kind === 'overhead') {
      hit = lx < BODY.halfW + OB.overhead.halfW && top > OB.overhead.bottom
    } else {
      hit = lx < BODY.halfW + OB.car.halfW && st.y < OB.car.h
    }
    if (!hit || st.invuln > 0) continue
    if (opts.full && st.shield) {
      st.shield = false
      st.invuln = POWER_TICKS.invuln
      o.smashed = true
      if (o.kind === 'gap') {
        st.air = true
        st.vy = JUMP_VY
      }
      ev?.push({ type: 'shield', ob: o.id, kind: o.kind })
      continue
    }
    st.dead = true
    st.deathKind = o.kind
    st.deathOb = o.id
    ev?.push({ type: 'dead', kind: o.kind, ob: o.id })
    return
  }

  if (!opts.full) return

  // ── keys ──
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
    let mag = false
    if (st.magnet > 0 && dz > -0.7 && dz < 10) {
      take = true
      mag = Math.abs(dz) > 0.6 || Math.abs(st.x - laneX(k.lane)) > 0.85
    } else if (dz > -0.6 && dz < 0.6 && Math.abs(st.x - laneX(k.lane)) < 0.85 && k.y > st.y - 0.3 && k.y < bodyTop + 0.2) {
      take = true
    }
    if (take) {
      k.state = 1
      k.magnet = mag
      k.takenTick = st.tick
      const prevMult = st.mult
      st.keys++
      st.combo++
      if (st.combo > st.maxCombo) st.maxCombo = st.combo
      st.mult = multFor(st.combo)
      const pts = KEY_PTS * st.mult * (st.five > 0 ? 5 : 1)
      st.keyPts += pts
      ev?.push({ type: 'key', id: k.id, pts, combo: st.combo, mult: st.mult, magnet: mag, first: st.keys === 1 })
      if (st.mult > prevMult) ev?.push({ type: 'mult', mult: st.mult })
    } else if (dz < -0.8) {
      k.state = 2
      const lost = st.combo
      st.combo = 0
      st.mult = 1
      ev?.push({ type: 'miss', id: k.id, lostCombo: lost })
    }
  }

  // ── pickups ──
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
      if (p.kind === 'magnet') st.magnet = POWER_TICKS.magnet
      else if (p.kind === 'five') st.five = POWER_TICKS.five
      else st.shield = true
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
