import type { Cell } from './types'
import { DX, DY, DIRS, type Dir } from './types'

/** Odd cols/rows so corridor lattices stay clean. */
export const COLS = 15
export const ROWS = 19

export type MazeStyle = 'lattice' | 'diagonal' | 'diamond' | 'scurve' | 'cross'

const STYLES: MazeStyle[] = ['lattice', 'diagonal', 'diamond', 'scurve', 'cross']

export function key(x: number, y: number) {
  return y * COLS + x
}

export function inBounds(x: number, y: number) {
  return x >= 0 && y >= 0 && x < COLS && y < ROWS
}

function solidBorder(g: Cell[]) {
  for (let x = 0; x < COLS; x++) {
    g[key(x, 0)] = 1
    g[key(x, ROWS - 1)] = 1
  }
  for (let y = 0; y < ROWS; y++) {
    g[key(0, y)] = 1
    g[key(COLS - 1, y)] = 1
  }
  // wrap tunnels mid-row
  const mid = Math.floor(ROWS / 2)
  if (mid % 2 === 1) {
    g[key(0, mid)] = 0
    g[key(COLS - 1, mid)] = 0
    g[key(1, mid)] = 0
    g[key(COLS - 2, mid)] = 0
  }
}

function punchLoops(g: Cell[], rng: () => number, frac: number) {
  const punches = Math.floor(COLS * ROWS * frac)
  for (let i = 0; i < punches; i++) {
    const x = 1 + Math.floor(rng() * (COLS - 2))
    const y = 1 + Math.floor(rng() * (ROWS - 2))
    if ((x + y) % 2 === 0) continue
    g[key(x, y)] = 0
  }
}

/** Classic recursive-backtracker lattice. */
function carveLattice(g: Cell[], rng: () => number) {
  const carve = (x: number, y: number) => {
    g[key(x, y)] = 0
  }
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
    carve(cx + DX[d], cy + DY[d])
    carve(cx + DX[d] * 2, cy + DY[d] * 2)
    stack.push([cx + DX[d] * 2, cy + DY[d] * 2])
  }
  punchLoops(g, rng, 0.12)
}

/** Slanted / diagonal ribbons. */
function carveDiagonal(g: Cell[], rng: () => number) {
  const step = 2 + Math.floor(rng() * 2)
  const lean = rng() < 0.5 ? 1 : -1
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      const band = (x + lean * y + 40) % (step * 2)
      if (band < step) g[key(x, y)] = 0
    }
  }
  // stitch horizontals so it stays runnable
  for (let y = 1; y < ROWS - 1; y += 3) {
    for (let x = 1; x < COLS - 1; x++) g[key(x, y)] = 0
  }
  punchLoops(g, rng, 0.06)
}

/** Diamond / concentric diamond rings from center. */
function carveDiamond(g: Cell[], rng: () => number) {
  const cx = (COLS - 1) / 2
  const cy = (ROWS - 1) / 2
  const maxR = Math.max(COLS, ROWS)
  for (let r = 1; r < maxR; r += 2) {
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        const d = Math.abs(x - cx) + Math.abs(y - cy)
        if (d === r || d === r + 1) g[key(x, y)] = 0
      }
    }
  }
  // spokes
  for (let x = 1; x < COLS - 1; x++) {
    g[key(x, Math.floor(cy))] = 0
    if (cy + 1 < ROWS - 1) g[key(x, Math.floor(cy) + 1)] = 0
  }
  for (let y = 1; y < ROWS - 1; y++) {
    g[key(Math.floor(cx), y)] = 0
    if (cx + 1 < COLS - 1) g[key(Math.floor(cx) + 1, y)] = 0
  }
  punchLoops(g, rng, 0.08)
}

/** Vertical S-curve / snake corridors. */
function carveScurve(g: Cell[], rng: () => number) {
  const amp = 2 + Math.floor(rng() * 2)
  const period = 4 + Math.floor(rng() * 3)
  for (let y = 1; y < ROWS - 1; y++) {
    const phase = Math.sin((y / period) * Math.PI) * amp
    const col = Math.round(COLS / 2 + phase)
    for (let dx = -1; dx <= 1; dx++) {
      const x = col + dx
      if (x > 0 && x < COLS - 1) g[key(x, y)] = 0
    }
    // second snake offset
    const col2 = Math.round(3 + ((y * 0.55 + amp) % (COLS - 6)))
    for (let dx = -1; dx <= 1; dx++) {
      const x = col2 + dx
      if (x > 0 && x < COLS - 1) g[key(x, y)] = 0
    }
  }
  // occasional cross links
  for (let y = 2; y < ROWS - 2; y += 3) {
    for (let x = 1; x < COLS - 1; x++) g[key(x, y)] = 0
  }
  punchLoops(g, rng, 0.05)
}

/** Big cross + side pockets. */
function carveCross(g: Cell[], rng: () => number) {
  const mx = Math.floor(COLS / 2)
  const my = Math.floor(ROWS / 2)
  for (let x = 1; x < COLS - 1; x++) {
    g[key(x, my)] = 0
    g[key(x, my - 1)] = 0
    if (my + 1 < ROWS - 1) g[key(x, my + 1)] = 0
  }
  for (let y = 1; y < ROWS - 1; y++) {
    g[key(mx, y)] = 0
    g[key(mx - 1, y)] = 0
    if (mx + 1 < COLS - 1) g[key(mx + 1, y)] = 0
  }
  // corner rooms
  const rooms = [
    [2, 2],
    [COLS - 4, 2],
    [2, ROWS - 4],
    [COLS - 4, ROWS - 4],
  ]
  for (const [rx, ry] of rooms) {
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        const x = rx + dx
        const y = ry + dy
        if (inBounds(x, y) && x > 0 && y > 0 && x < COLS - 1 && y < ROWS - 1) g[key(x, y)] = 0
      }
    }
    // tunnel to cross
    const tx = rx + 1
    for (let y = Math.min(ry + 1, my); y <= Math.max(ry + 1, my); y++) {
      if (y > 0 && y < ROWS - 1) g[key(tx, y)] = 0
    }
  }
  punchLoops(g, rng, 0.07)
}

/**
 * Fresh maze with a shape bias (lattice / diagonal / diamond / S-curve / cross).
 * Always keeps a solid border + mid wrap tunnels.
 */
export function generateMaze(rng: () => number, style?: MazeStyle): Cell[] {
  const g: Cell[] = new Array(COLS * ROWS).fill(1)
  const pick = style ?? STYLES[Math.floor(rng() * STYLES.length)]!
  if (pick === 'diagonal') carveDiagonal(g, rng)
  else if (pick === 'diamond') carveDiamond(g, rng)
  else if (pick === 'scurve') carveScurve(g, rng)
  else if (pick === 'cross') carveCross(g, rng)
  else carveLattice(g, rng)
  solidBorder(g)
  return g
}

export function nextStyle(prev: MazeStyle | null, rng: () => number): MazeStyle {
  const opts = STYLES.filter((s) => s !== prev)
  return opts[Math.floor(rng() * opts.length)]!
}

export function isOpen(g: Cell[], x: number, y: number) {
  if (!inBounds(x, y)) return false
  return g[key(x, y)] === 0
}

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

export function ensureExits(g: Cell[], px: number, py: number, minCells = 48, rng: () => number): void {
  if (!isOpen(g, px, py)) {
    const n = nearestOpen(g, px, py)
    px = n.x
    py = n.y
  }
  let guard = 0
  while (reachable(g, px, py).size < minCells && guard++ < 500) {
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
    g[candidates[Math.floor(rng() * candidates.length)]!] = 0
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
