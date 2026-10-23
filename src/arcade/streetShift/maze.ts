import type { Cell } from './types'
import { DX, DY, DIRS, type Dir } from './types'

/** Odd cols/rows so recursive-backtracker leaves a clean corridor lattice. */
export const COLS = 15
export const ROWS = 19

export function key(x: number, y: number) {
  return y * COLS + x
}

export function inBounds(x: number, y: number) {
  return x >= 0 && y >= 0 && x < COLS && y < ROWS
}

/** Fresh maze: recursive backtracker on odd cells, then punch loops + border keep. */
export function generateMaze(rng: () => number): Cell[] {
  const g: Cell[] = new Array(COLS * ROWS).fill(1)
  const carve = (x: number, y: number) => {
    g[key(x, y)] = 0
  }
  // start at (1,1)
  const stack: [number, number][] = [[1, 1]]
  carve(1, 1)
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1]!
    const opts: Dir[] = []
    for (const d of DIRS) {
      const nx = cx + DX[d] * 2
      const ny = cy + DY[d] * 2
      if (inBounds(nx, ny) && g[key(nx, ny)] === 1) opts.push(d)
    }
    if (!opts.length) {
      stack.pop()
      continue
    }
    const d = opts[Math.floor(rng() * opts.length)]!
    const mx = cx + DX[d]
    const my = cy + DY[d]
    const nx = cx + DX[d] * 2
    const ny = cy + DY[d] * 2
    carve(mx, my)
    carve(nx, ny)
    stack.push([nx, ny])
  }
  // punch extra loops so it feels like a street grid, not a perfect tree
  const punches = Math.floor(COLS * ROWS * 0.08)
  for (let i = 0; i < punches; i++) {
    const x = 1 + Math.floor(rng() * (COLS - 2))
    const y = 1 + Math.floor(rng() * (ROWS - 2))
    if ((x + y) % 2 === 0) continue
    g[key(x, y)] = 0
  }
  // keep outer border solid
  for (let x = 0; x < COLS; x++) {
    g[key(x, 0)] = 1
    g[key(x, ROWS - 1)] = 1
  }
  for (let y = 0; y < ROWS; y++) {
    g[key(0, y)] = 1
    g[key(COLS - 1, y)] = 1
  }
  // wrap tunnels mid-row (Pac-Man style) — open left/right at mid
  const mid = Math.floor(ROWS / 2)
  if (mid % 2 === 1) {
    g[key(0, mid)] = 0
    g[key(COLS - 1, mid)] = 0
    g[key(1, mid)] = 0
    g[key(COLS - 2, mid)] = 0
  }
  return g
}

export function isOpen(g: Cell[], x: number, y: number) {
  if (!inBounds(x, y)) return false
  return g[key(x, y)] === 0
}

/** BFS reachability from (sx,sy). Returns set of reachable path cells. */
export function reachable(g: Cell[], sx: number, sy: number): Set<number> {
  const out = new Set<number>()
  if (!isOpen(g, sx, sy)) return out
  const q: [number, number][] = [[sx, sy]]
  out.add(key(sx, sy))
  while (q.length) {
    const [x, y] = q.pop()!
    for (const d of DIRS) {
      let nx = x + DX[d]
      let ny = y + DY[d]
      // wrap tunnels
      if (nx < 0) nx = COLS - 1
      if (nx >= COLS) nx = 0
      if (!inBounds(nx, ny) || !isOpen(g, nx, ny)) continue
      const k = key(nx, ny)
      if (out.has(k)) continue
      out.add(k)
      q.push([nx, ny])
    }
  }
  return out
}

/** Open walls until player can reach at least `minCells` path cells (never trap). */
export function ensureExits(g: Cell[], px: number, py: number, minCells = 40, rng: () => number): void {
  // snap player to nearest open if needed
  if (!isOpen(g, px, py)) {
    const n = nearestOpen(g, px, py)
    px = n.x
    py = n.y
  }
  let guard = 0
  while (reachable(g, px, py).size < minCells && guard++ < 400) {
    // pick a wall adjacent to the reachable set and carve it
    const reach = reachable(g, px, py)
    const candidates: number[] = []
    for (const k of reach) {
      const x = k % COLS
      const y = (k / COLS) | 0
      for (const d of DIRS) {
        const nx = x + DX[d]
        const ny = y + DY[d]
        if (!inBounds(nx, ny)) continue
        if (nx === 0 || ny === 0 || nx === COLS - 1 || ny === ROWS - 1) continue
        if (g[key(nx, ny)] === 1) candidates.push(key(nx, ny))
      }
    }
    if (!candidates.length) break
    const pick = candidates[Math.floor(rng() * candidates.length)]!
    g[pick] = 0
  }
}

export function nearestOpen(g: Cell[], x: number, y: number): { x: number; y: number } {
  let best = { x: 1, y: 1 }
  let bestD = Infinity
  for (let yy = 0; yy < ROWS; yy++) {
    for (let xx = 0; xx < COLS; xx++) {
      if (!isOpen(g, xx, yy)) continue
      const d = (xx - x) ** 2 + (yy - y) ** 2
      if (d < bestD) {
        bestD = d
        best = { x: xx, y: yy }
      }
    }
  }
  return best
}

export function openNeighbors(g: Cell[], x: number, y: number): Dir[] {
  const out: Dir[] = []
  for (const d of DIRS) {
    let nx = x + DX[d]
    let ny = y + DY[d]
    if (nx < 0) nx = COLS - 1
    if (nx >= COLS) nx = 0
    if (isOpen(g, nx, ny)) out.push(d)
  }
  return out
}

/** Place power pellets near the four interior corners of the reachable set. */
export function powerSpots(g: Cell[], px: number, py: number): { x: number; y: number }[] {
  const reach = reachable(g, px, py)
  const corners = [
    { x: 1, y: 1 },
    { x: COLS - 2, y: 1 },
    { x: 1, y: ROWS - 2 },
    { x: COLS - 2, y: ROWS - 2 },
  ]
  return corners.map((c) => {
    let best = c
    let bestD = Infinity
    for (const k of reach) {
      const x = k % COLS
      const y = (k / COLS) | 0
      const d = (x - c.x) ** 2 + (y - c.y) ** 2
      if (d < bestD) {
        bestD = d
        best = { x, y }
      }
    }
    return best
  })
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
