/**
 * Fifth Glide — where the path goes in 3D.
 *
 * The sim addresses everything by path distance `s` and lateral `x`. The path is straight segments
 * joined at corner centres; segment k starts at corner k−1 (segment 0 at s = 0, heading −Z). Through an
 * L / R corner the next heading is known in advance; through a T it is known only once the runner
 * picks a side (`setTurn`), so content past an unresolved T is not placed yet (the two arms are drawn
 * empty — the generator keeps them clear).
 */
import type { Corner } from '../sim/track'

export type Seg = {
  /** path distance where the segment starts (corner centre) */
  s0: number
  /** id of the corner that ends it (−1 = open) */
  endId: number
  /** start point and unit heading on the XZ plane */
  x: number
  z: number
  fx: number
  fz: number
}

export type WorldPt = { x: number; z: number; yaw: number }

export const yawOf = (fx: number, fz: number) => Math.atan2(-fx, -fz)

/** heading after turning `dir` (−1 left, 1 right) */
export function turned(fx: number, fz: number, dir: number): [number, number] {
  // right of F is (−fz, fx)
  return dir > 0 ? [-fz, fx] : [fz, -fx]
}

export class PathLayout {
  segs: Seg[] = [{ s0: 0, endId: -1, x: 0, z: 0, fx: 0, fz: -1 }]
  /** chosen way at corners (id → −1 / 1) */
  private dirs = new Map<number, number>()
  /** first corner whose way isn't known yet (a T not taken) — content beyond it isn't placed */
  pending: Corner | null = null
  /** index into segs of the runner's segment */
  runnerSeg = 0

  reset() {
    this.segs = [{ s0: 0, endId: -1, x: 0, z: 0, fx: 0, fz: -1 }]
    this.dirs.clear()
    this.pending = null
    this.runnerSeg = 0
  }

  setTurn(id: number, dir: number) {
    this.dirs.set(id, dir)
    if (this.dirs.size > 64) this.dirs.delete(this.dirs.keys().next().value as number)
  }

  /** Extend segments through every corner whose way is known. */
  sync(corners: Corner[]) {
    this.pending = null
    for (const c of corners) {
      const last = this.segs[this.segs.length - 1]
      if (c.s <= last.s0) continue
      const dir = c.kind === 'L' ? -1 : c.kind === 'R' ? 1 : this.dirs.get(c.id)
      if (dir === undefined) {
        this.pending = c
        return
      }
      last.endId = c.id
      const cx = last.x + (c.s - last.s0) * last.fx
      const cz = last.z + (c.s - last.s0) * last.fz
      const [fx, fz] = turned(last.fx, last.fz, dir)
      this.segs.push({ s0: c.s, endId: -1, x: cx, z: cz, fx, fz })
    }
    // keep the array short: drop segments well behind the runner
    while (this.segs.length > 8 && this.runnerSeg > 3) {
      this.segs.shift()
      this.runnerSeg--
    }
  }

  /** Runner turned at corner `id`: move to the segment starting there. */
  onTurn(id: number, dir: number, corners: Corner[]) {
    this.setTurn(id, dir)
    this.sync(corners)
    for (let i = this.runnerSeg; i < this.segs.length - 1; i++) {
      if (this.segs[i].endId === id) {
        this.runnerSeg = i + 1
        return
      }
    }
  }

  /** Segment index for content at path distance s (−1 if past an unresolved T). */
  segFor(s: number): number {
    if (this.pending && s > this.pending.s) return -1
    for (let i = this.segs.length - 1; i >= 0; i--) if (this.segs[i].s0 <= s) return i
    return 0
  }

  pt(seg: number, s: number, x: number, out: WorldPt): WorldPt {
    const g = this.segs[Math.max(0, Math.min(this.segs.length - 1, seg))]
    const d = s - g.s0
    out.x = g.x + d * g.fx - x * g.fz
    out.z = g.z + d * g.fz + x * g.fx
    out.yaw = yawOf(g.fx, g.fz)
    return out
  }

  /** Point on an explicit heading from a corner centre (used for the arms of an unresolved T). */
  static ptFrom(cx: number, cz: number, fx: number, fz: number, d: number, x: number, out: WorldPt): WorldPt {
    out.x = cx + d * fx - x * fz
    out.z = cz + d * fz + x * fx
    out.yaw = yawOf(fx, fz)
    return out
  }

  /** Centre of corner c (on the segment that ends there). */
  cornerCentre(c: Corner, out: WorldPt): WorldPt | null {
    const i = this.segFor(c.s - 0.01)
    if (i < 0) return null
    return this.pt(i, c.s, 0, out)
  }
}
