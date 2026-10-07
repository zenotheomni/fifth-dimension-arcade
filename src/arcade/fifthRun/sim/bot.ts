/**
 * Fifth Glide bots (harness + in-game autopilot for QA captures).
 *
 * - oracleSurvive: exhaustive breadth-first search over inputs every 50 ms with the real step
 *   function. If its frontier ever empties, the seed has an unavoidable obstacle combo.
 * - RuleBot: a "human" model — plans a lane + jump/slide timings a short window ahead, then
 *   executes them with reaction delay, timing jitter and occasional lapses.
 */
import { mulberry32 } from '../../core/seededRandom'
import { FR_HZ, JUMP_T, laneX, speedAt } from './constants'
import { cloneRun, queueAction, step, type Action, type RunState } from './runner'
import { obstacleS, type Track } from './track'

const ACTIONS: (Action | null)[] = [null, 'left', 'right', 'jump', 'slide']

function stateKey(c: RunState) {
  return `${c.lane}|${Math.round(c.x * 10)}|${c.air ? 1 : 0}|${Math.round(c.y * 20)}|${Math.round(c.vy * 4)}|${
    c.slide > 0 ? Math.ceil(c.slide / 6) : 0
  }|${c.slideOnLand ? 1 : 0}`
}

function validAction(c: RunState, a: Action | null) {
  if (a === null) return true
  if (a === 'left') return c.lane > 0
  if (a === 'right') return c.lane < 2
  if (a === 'jump') return !c.air
  return !(c.air && c.slideOnLand)
}

const NOEV = { full: false, events: null }

function flexibility(c: RunState) {
  // grounded, not sliding, centred in a lane = most options next step
  return (c.air ? 0 : 4) + (c.slide > 0 ? 0 : 2) + (Math.abs(c.x - laneX(c.lane)) < 0.01 ? 1 : 0)
}

/**
 * Survivability search from `start` until s ≥ maxS: every input (none/left/right/jump/slide)
 * every `dtTicks`, deduplicated by physical state. With `cap`, the frontier keeps the most
 * flexible states per lane (a found path is still a real proof); exhaustive when cap = 0.
 */
export function oracle(track: Track, start: RunState, maxS: number, dtTicks = 6, cap = 0) {
  let frontier: RunState[] = [cloneRun(start)]
  let maxFrontier = 1
  let farthest = start.s
  while (frontier.length) {
    const s = frontier[0].s
    if (s >= maxS) return { ok: true, s, maxFrontier }
    track.ensure(s + 400)
    const next = new Map<string, RunState>()
    for (const node of frontier) {
      for (const a of ACTIONS) {
        if (!validAction(node, a)) continue
        const c = cloneRun(node)
        if (a) queueAction(c, a)
        let dead = false
        for (let k = 0; k < dtTicks; k++) {
          step(c, track, NOEV)
          if (c.dead) {
            dead = true
            break
          }
        }
        if (dead) continue
        const key = stateKey(c)
        if (!next.has(key)) next.set(key, c)
      }
    }
    frontier = [...next.values()]
    if (cap && frontier.length > cap) {
      // keep a spread: per lane × (grounded / airborne / sliding), most flexible first
      const per = Math.max(2, Math.ceil(cap / 9))
      const buckets = new Map<string, RunState[]>()
      for (const c of frontier) {
        const k = `${c.lane}${c.air ? 'a' : c.slide > 0 ? 's' : 'g'}`
        const b = buckets.get(k)
        if (b) b.push(c)
        else buckets.set(k, [c])
      }
      const kept: RunState[] = []
      for (const b of buckets.values()) {
        b.sort((p, q) => flexibility(q) - flexibility(p) || p.tick - q.tick)
        // stride through the bucket so different phases survive
        const stride = Math.max(1, Math.floor(b.length / per))
        for (let i = 0; i < b.length && kept.length < cap * 2; i += stride) kept.push(b[i])
      }
      frontier = kept
    }
    if (frontier.length > maxFrontier) maxFrontier = frontier.length
    if (frontier.length) farthest = frontier[0].s
  }
  return { ok: false, s: farthest, maxFrontier }
}

export type Skill = {
  name: string
  /** base reaction before a lane change (ms) */
  reactMs: number
  /** gaussian timing error σ (ms) on every input */
  jitterMs: number
  /** chance a given input comes late */
  lapseP: number
  /** how late a lapse is (ms) */
  lapseMs: number
  /** look-ahead window (s) */
  lookS: number
  /** minimum time between two swipes (ms) */
  minGapMs: number
}

export const SKILLS: Record<string, Skill> = {
  /** first-timer on a phone: slow reads of oncoming traffic, frequent late swipes (calibrated so the
   *  pre-tune curve reproduced the ~24 s / 528 m first run seen in review: median 32 s, IQR 22–37 s) */
  rookie: { name: 'rookie', reactMs: 600, jitterMs: 170, lapseP: 0.22, lapseMs: 500, lookS: 0.8, minGapMs: 350 },
  novice: { name: 'novice', reactMs: 330, jitterMs: 90, lapseP: 0.05, lapseMs: 260, lookS: 1.2, minGapMs: 240 },
  decent: { name: 'decent', reactMs: 250, jitterMs: 70, lapseP: 0.03, lapseMs: 230, lookS: 1.4, minGapMs: 190 },
  expert: { name: 'expert', reactMs: 180, jitterMs: 40, lapseP: 0.01, lapseMs: 180, lookS: 1.7, minGapMs: 130 },
  perfect: { name: 'perfect', reactMs: 0, jitterMs: 0, lapseP: 0, lapseMs: 0, lookS: 1.8, minGapMs: 0 },
}

type Sched = { a: Action; tick: number; ob?: number; lat?: number }

export class RuleBot {
  skill: Skill
  rng: () => number
  sched: Sched[] = []
  targetLane = 1
  /** tick at which the current target lane was chosen (reaction starts here) */
  laneChosen = 0
  latNoise = 0
  nextThink = 0
  private obNoise = new Map<number, number>()
  private done = new Set<number>()
  private lastInput = -1e9
  private exitOk = new Map<string, boolean>()
  constructor(skill: Skill, seed = 1) {
    this.skill = skill
    this.rng = mulberry32(seed >>> 0)
  }

  private gauss() {
    const u = Math.max(1e-9, this.rng())
    const v = this.rng()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  private noise(): number {
    let ms = this.gauss() * this.skill.jitterMs
    if (this.rng() < this.skill.lapseP) ms += this.skill.lapseMs * (0.6 + this.rng() * 0.8)
    return Math.round((ms / 1000) * FR_HZ)
  }

  private noiseFor(id: number) {
    let n = this.obNoise.get(id)
    if (n === undefined) {
      n = this.noise()
      this.obNoise.set(id, n)
      if (this.obNoise.size > 400) this.obNoise.delete(this.obNoise.keys().next().value as number)
    }
    return n
  }

  /** earliest tick ≥ t at which `lane` has no car alongside the runner */
  private unblocked(st: RunState, track: Track, lane: number, t: number) {
    const v = st.v
    let tick = t
    for (let pass = 0; pass < 3; pass++) {
      const sAt = st.s + ((tick - st.tick) / FR_HZ) * v
      let moved = false
      for (let i = Math.max(0, st.obCur - 2); i < track.obstacles.length; i++) {
        const o = track.obstacles[i]
        if (o.s > sAt + 30) break
        if (o.kind !== 'block' || o.lane !== lane || o.smashed) continue
        const os = obstacleS(o, sAt)
        if (os - 0.45 < sAt && os + o.len + 0.3 > sAt) {
          tick = st.tick + Math.ceil(((os + o.len + 0.36 - st.s) / Math.max(v, 1)) * FR_HZ)
          moved = true
        }
      }
      if (!moved) break
    }
    return tick
  }

  /** Ideal input plan for running `lane` through the window (null if a car sits in it). */
  private planFor(st: RunState, track: Track, lane: number, until: number, chosenAt: number): Sched[] | null {
    const out: Sched[] = []
    const react = Math.round((this.skill.reactMs / 1000) * FR_HZ)
    const ln = lane === this.targetLane ? this.latNoise : 0
    let t = Math.max(st.tick, chosenAt + react + ln)
    const dir = lane > st.lane ? 'right' : 'left'
    for (let l = st.lane; l !== lane; l += lane > st.lane ? 1 : -1) {
      const u = this.unblocked(st, track, l + (lane > st.lane ? 1 : -1), t)
      if (u > t) t = u + Math.max(0, ln)
      out.push({ a: dir, tick: t, lat: 1 })
      t += Math.round(0.15 * FR_HZ)
    }
    const v = st.v
    for (let i = Math.max(0, st.obCur - 2); i < track.obstacles.length; i++) {
      const o = track.obstacles[i]
      if (o.s > until) break
      if (o.smashed || o.s + o.len < st.s - 0.3 || o.lane !== lane) continue
      if (o.kind === 'block' || this.done.has(o.id)) continue
      const mid = o.s + o.len / 2
      const lead = o.kind === 'overhead' ? o.s - st.s - v * 0.3 : mid - st.s - (v * JUMP_T) / 2
      const tk = st.tick + Math.round((lead / v) * FR_HZ)
      out.push({ a: o.kind === 'overhead' ? 'slide' : 'jump', tick: tk, ob: o.id })
    }
    return out.sort((a, b) => a.tick - b.tick)
  }

  /** Run the ideal plan to `untilS`; returns the end state (null if it crashes). */
  private simulate(st: RunState, track: Track, plan: Sched[], untilS: number): RunState | null {
    const c = cloneRun(st)
    let qi = 0
    while (c.s < untilS) {
      while (qi < plan.length && plan[qi].tick <= c.tick) queueAction(c, plan[qi++].a)
      step(c, track, NOEV)
      if (c.dead) return null
    }
    while (qi < plan.length) queueAction(c, plan[qi++].a)
    return c
  }

  /** End of the next obstacle row ahead (doubles included), or null. */
  private nextRowEnd(st: RunState, track: Track, until: number): number | null {
    let rowS = -1
    let end = -1
    for (let i = Math.max(0, st.obCur - 2); i < track.obstacles.length; i++) {
      const o = track.obstacles[i]
      if (o.smashed || o.s + o.len < st.s - 0.3) continue
      if (rowS < 0) {
        if (o.s > until) return null
        rowS = o.s
        end = o.s + o.len
        continue
      }
      if (o.s <= rowS + 0.5 || (o.kind === 'block' && o.s < end + 0.5)) end = Math.max(end, o.s + o.len)
      else if (o.s > end + 0.5) break
    }
    return rowS < 0 ? null : end
  }

  /** Call once per tick before step(); queues inputs on the run state. */
  update(st: RunState, track: Track) {
    if (st.dead) return
    if (st.tick >= this.nextThink) {
      this.nextThink = st.tick + 6
      this.think(st, track)
    }
    while (this.sched.length && this.sched[0].tick <= st.tick) {
      const a = this.sched.shift()!
      queueAction(st, a.a)
      this.lastInput = st.tick
      if (a.ob !== undefined) {
        this.done.add(a.ob)
        if (this.done.size > 400) this.done.delete(this.done.values().next().value as number)
      }
      if (a.lat) this.laneChosen = st.tick - 100000 // later steps of a multi-lane move follow immediately
    }
  }

  private think(st: RunState, track: Track) {
    const v = st.v || speedAt(st.s)
    const until = st.s + v * this.skill.lookS
    track.ensure(until + 50)
    // mid lane-change: let it finish
    if (Math.abs(st.x - laneX(st.lane)) > 0.05) return
    let keyLane = -1
    for (let i = Math.max(0, st.keyCur - 2); i < track.keys.length; i++) {
      const k = track.keys[i]
      if (k.s > st.s + v * 1.2) break
      if (k.state === 0 && k.s > st.s + 1) {
        keyLane = k.lane
        break
      }
    }
    const order = [this.targetLane, keyLane, st.lane, st.lane - 1, st.lane + 1, st.lane - 2, st.lane + 2].filter(
      (l, i, a) => l >= 0 && l <= 2 && a.indexOf(l) === i,
    )
    const rowEnd = this.nextRowEnd(st, track, until)
    const horizon = rowEnd === null ? st.s + v * 0.5 : rowEnd + 1
    for (const lane of order) {
      const chosenAt = lane === this.targetLane ? this.laneChosen : st.tick
      const plan = this.planFor(st, track, lane, horizon, lane === st.lane ? st.tick : chosenAt)
      if (!plan) continue
      const ideal = plan.map((p) => (p.lat ? { ...p, tick: Math.max(st.tick, p.tick) } : p))
      const end = this.simulate(st, track, ideal, horizon)
      if (!end) continue
      // don't walk into a dead end: something must still be survivable just past this row
      if (rowEnd !== null) {
        const mk = `${lane}|${rowEnd}`
        let okNext = this.exitOk.get(mk)
        if (okNext === undefined) {
          okNext = oracle(track, end, end.s + v * 0.7, 6, 18).ok
          this.exitOk.set(mk, okNext)
          if (this.exitOk.size > 64) this.exitOk.delete(this.exitOk.keys().next().value as string)
        }
        if (!okNext) continue
      }
      let final = plan
      if (lane !== this.targetLane) {
        this.targetLane = lane
        this.laneChosen = st.tick
        this.latNoise = this.noise()
        final = this.planFor(st, track, lane, horizon, st.tick) ?? plan
      }
      this.sched = final
        .map((p) => ({ ...p, tick: Math.max(st.tick + 1, p.tick + (p.ob !== undefined ? this.noiseFor(p.ob) : 0)) }))
        .sort((a, b) => a.tick - b.tick)
      // thumbs aren't instant: consecutive swipes need a minimum gap
      const gap = Math.round((this.skill.minGapMs / 1000) * FR_HZ)
      let prev = this.lastInput
      for (const x of this.sched) {
        if (x.tick < prev + gap) x.tick = prev + gap
        prev = x.tick
      }
      return
    }
    this.sched = this.sched.filter((x) => x.ob !== undefined)
  }
}

export { laneX }
