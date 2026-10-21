/**
 * Fifth Glide v14 — route validator. Guarantees every obstacle row (or missing-lane stretch) has at
 * least one passable route given lane-switch time at the current speed, jump airtime and slide time.
 *
 * Model (conservative): per lane we keep the earliest path distance `free` at which the runner can be
 * standing in that lane with no action running (Infinity = unreachable). Earlier always dominates, so
 * a min per lane is exact for this model. Between rows the runner may switch lanes; during a row he
 * can't cross a blocked lane. Rows: E clear · B/G jump · O slide · P jump or slide · K / X blocked
 * (X = lane missing in a void stretch).
 */
import { JUMP_APEX, JUMP_T, LANE_SPEED, LANE_W, OB } from './constants'

export type Cell = 'E' | 'B' | 'O' | 'P' | 'K' | 'G' | 'X'
export type Row = { s0: number; cells: Cell[]; len: number[]; end: number }

/** time to switch one lane (s) and a small reaction allowance per decision */
export const SWITCH_S = LANE_W / LANE_SPEED
export const REACT_S = 0.08

/** Per-lane state: mv = earliest s a lane switch may start, act = earliest s on the ground (can jump). */
export type St = { mv: number; act: number }
/** fraction of the jump arc before the feet clear a hurdle of height h */
const uFor = (h: number) => (1 - Math.sqrt(Math.max(0, 1 - h / JUMP_APEX))) / 2

/**
 * Step the reach state across one row. Lane switches are allowed in the air and mid-slide (as in the
 * runner) but never across a row's blocked span; a jump needs the ground; a slide in the air is a fast
 * fall, so it may start a little before landing. Jumps may take off anywhere that clears the obstacle.
 */
export type Reach = St[][]
const MAX_STATES = 24

function addState(list: St[], c: St) {
  for (const x of list) if (Math.abs(x.act - c.act) < 0.05 && Math.abs(x.mv - c.mv) < 0.05) return
  list.push(c)
  if (list.length > MAX_STATES) {
    // keep the earliest-landing, the latest-landing (long carry-over arcs) and the best mover
    list.sort((p, q) => p.act - q.act)
    const keep = new Set([list[0], list[list.length - 1], list.reduce((m, x) => (x.mv < m.mv ? x : m)), ...list.slice(1, MAX_STATES - 2)])
    list.splice(0, list.length, ...keep)
  }
}

export function stepRow(reach: Reach, prevEnd: number, row: Row, v: number): Reach {
  const out: Reach = [[], [], []]
  const J = v * JUMP_T
  const blocked = row.cells.some((c) => c === 'K' || c === 'X')
  for (let to = 0; to < 3; to++) {
    const c = row.cells[to]
    if (c === 'K' || c === 'X') continue
    const len = row.len[to]
    const passEnd = blocked ? row.end : row.s0 + len
    for (let from = 0; from < 3; from++) {
      for (const f of reach[from]) {
        const steps = Math.abs(to - from)
        const arrive = steps === 0 ? -Infinity : Math.max(f.mv, prevEnd) + v * (steps * SWITCH_S + REACT_S)
        if (c === 'E') {
          if (arrive <= row.s0) addState(out[to], { mv: Math.max(passEnd, steps ? arrive : f.mv), act: Math.max(f.act, arrive) })
          continue
        }
        if (c === 'B' || c === 'G' || c === 'P') {
          const need = c === 'B' ? OB.barrier.h : c === 'P' ? OB.pipe.top : 0
          // still airborne from an earlier jump: that arc may already carry over this row
          if (f.act > row.s0 && arrive <= row.s0) {
            const t0 = f.act - J
            const h = (x: number) => { const u = (x - t0) / J; return 4 * JUMP_APEX * u * (1 - u) }
            if (row.s0 >= t0 && f.act >= row.s0 + len + 0.3 && h(row.s0) > need && h(row.s0 + len) > need)
              addState(out[to], { mv: Math.max(passEnd, steps ? arrive : f.mv), act: f.act })
          }
          const u = c === 'G' ? 0.02 : uFor(need)
          const tMin = row.s0 + len - (1 - u) * J
          const tMax = row.s0 - u * J
          const T = Math.max(tMin, arrive, f.act)
          if (T <= tMax) {
            addState(out[to], { mv: Math.max(passEnd, T), act: T + J })
            // a late take-off too: its long arc can carry over the next row
            // later take-offs too: a longer arc can carry over the next row (and still land in time for the one after)
            if (tMax - T > 0.5) for (const k of [0.25, 0.5, 0.75, 1]) { const t = T + (tMax - T) * k; addState(out[to], { mv: Math.max(passEnd, t), act: t + J }) }
          }
        }
        if (c === 'O' || c === 'P') {
          const start = Math.max(arrive, f.act - v * 0.12)
          if (start <= row.s0 - v * 0.04) addState(out[to], { mv: Math.max(passEnd, start), act: row.s0 + len })
        }
      }
    }
  }
  return out
}

export const anyReach = (r: Reach) => r.some((l) => l.length > 0)
export const fresh = (s: number): Reach => [0, 1, 2].map(() => [{ mv: s, act: s }])

/** Rebuild rows from a generated obstacle list and check every one. Returns failures (s positions). */
export function validateObstacles(
  obs: { kind: string; lane: number; s: number; len: number }[],
  corners: { s: number }[],
  speedAt: (s: number) => number,
  upTo: number,
): { rows: number; fails: number[] } {
  const map: Record<string, Cell> = { barrier: 'B', overhead: 'O', pipe: 'P', block: 'K', car: 'K', gap: 'G', void: 'X' }
  const sorted = obs.filter((o) => o.s < upTo).slice().sort((a, b) => a.s - b.s)
  const rows: Row[] = []
  for (const o of sorted) {
    let r = rows.find((x) => Math.abs(x.s0 - o.s) < 0.011)
    if (!r) {
      r = { s0: o.s, cells: ['E', 'E', 'E'], len: [0, 0, 0], end: o.s }
      rows.push(r)
    }
    r.cells[o.lane] = map[o.kind] ?? 'K'
    r.len[o.lane] = o.len
    r.end = Math.max(r.end, o.s + o.len)
  }
  // a void stretch also blocks its lanes for any row that sits inside it (hurdles in a narrow section)
  const voids = sorted.filter((o) => o.kind === 'void')
  for (const r of rows) for (const vo of voids) if (r.s0 > vo.s + 0.01 && r.s0 < vo.s + vo.len) r.cells[vo.lane] = 'X'
  rows.sort((a, b) => a.s0 - b.s0)
  let reach = fresh(0)
  let prevEnd = 0
  let ci = 0
  const fails: number[] = []
  for (const r of rows) {
    // a corner between rows resets the lane state (path re-frames, post-corner runway is clear)
    while (ci < corners.length && corners[ci].s < r.s0) {
      reach = fresh(corners[ci].s)
      prevEnd = corners[ci].s
      ci++
    }
    const nx = stepRow(reach, prevEnd, r, speedAt(r.s0))
    if (!anyReach(nx)) {
      fails.push(r.s0)
      reach = fresh(r.end)
    } else reach = nx
    prevEnd = Math.max(prevEnd, r.end)
  }
  return { rows: rows.length, fails }
}
