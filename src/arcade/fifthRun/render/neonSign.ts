/**
 * v20: broken neon sign — replaces the crashed satellite (kind 'car') on the runway. Same footprint
 * (OB.car: ≈1.8 m wide, ≤1.5 m tall, 5.4 m along the lane), so lanes / collision / spacing are unchanged.
 * A toppled, dented steel sign frame leaning back on its snapped pole, glass neon tubes in a generic
 * glyph (arrow · star · palm · OPEN): some segments lit, some flickering, some dead and cracked, sparks
 * at the broken end and a few dangling wires. Each pool item owns its animated materials; `pose` drives
 * the flicker per obstacle.
 */
import * as THREE from 'three'
import { glowMaterial } from './shaders'

type V2 = [number, number]
const COLORS = ['#ff3d9a', '#3df5ff', '#ffb347', '#b26bff', '#ff5a3c', '#5cff9d']
const GLYPHS = ['arrow', 'star', 'palm', 'open'] as const

/** glyph strokes in board space (x ∈ ±0.7, y ∈ 0..2.2) */
function strokes(kind: (typeof GLYPHS)[number]): V2[][] {
  if (kind === 'arrow') return [[[0, 0.25], [0, 1.6]], [[-0.5, 1.15], [0, 1.85], [0.5, 1.15]]]
  if (kind === 'star') {
    const p: V2[] = []
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5
      const r = i % 2 ? 0.27 : 0.65
      p.push([Math.cos(a) * r, 1.1 + Math.sin(a) * r])
    }
    return [p.slice(0, 4), p.slice(3, 8), p.slice(7, 11)]
  }
  if (kind === 'palm') {
    const trunk: V2[] = [[0.1, 0.2], [0.02, 0.8], [-0.04, 1.35], [0, 1.7]]
    const frond = (dx: number, dy: number): V2[] => [[0, 1.7], [dx * 0.5, 1.7 + dy * 0.9], [dx, 1.7 + dy * 0.2]]
    return [trunk, frond(-0.6, 0.35), frond(0.6, 0.35), frond(-0.45, -0.25), frond(0.45, -0.25)]
  }
  // OPEN, small block letters
  const y0 = 0.85, y1 = 1.45, w = 0.26
  const O: V2[] = []
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; O.push([-0.52 + Math.cos(a) * 0.13, 1.15 + Math.sin(a) * 0.3]) }
  const xP = -0.24, xE = 0.06, xN = 0.36
  return [
    O,
    [[xP, y0], [xP, y1], [xP + w * 0.8, y1], [xP + w * 0.8, 1.17], [xP, 1.17]],
    [[xE + w * 0.8, y1], [xE, y1], [xE, y0], [xE + w * 0.8, y0]],
    [[xE, 1.15], [xE + w * 0.6, 1.15]],
    [[xN, y0], [xN, y1], [xN + w * 0.8, y0], [xN + w * 0.8, y1]],
  ]
}

function tube(pts: V2[], r: number, mat: THREE.Material) {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'catmullrom', 0.05)
  return new THREE.Mesh(new THREE.TubeGeometry(c, Math.max(8, pts.length * 6), r, 6, false), mat)
}

/** Split a stroke into pieces with small cracks between them. */
function pieces(pts: V2[], n: number): V2[][] {
  const out: V2[][] = []
  const segs = pts.length - 1
  for (let k = 0; k < n; k++) {
    const t0 = k / n + 0.02, t1 = (k + 1) / n - 0.02
    const at = (t: number): V2 => {
      const f = t * segs, i = Math.min(segs - 1, Math.floor(f)), u = f - i
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u]
    }
    const p: V2[] = [at(t0)]
    for (let i = 1; i < pts.length - 1; i++) { const ti = i / segs; if (ti > t0 && ti < t1) p.push(pts[i]) }
    p.push(at(t1))
    out.push(p)
  }
  return out
}

export function buildNeonSign(glow: THREE.Texture, idx: number) {
  const group = new THREE.Group()
  const color = new THREE.Color(COLORS[idx % COLORS.length])
  const kind = GLYPHS[idx % GLYPHS.length]
  const steel = new THREE.MeshStandardMaterial({ color: '#4a4652', metalness: 0.85, roughness: 0.42 })
  const rust = new THREE.MeshStandardMaterial({ color: '#5a3a2c', metalness: 0.6, roughness: 0.75 })
  const backing = new THREE.MeshStandardMaterial({ color: '#141019', metalness: 0.4, roughness: 0.8 })
  const lit = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.6) })
  const flick = new THREE.MeshBasicMaterial({ color: color.clone() })
  const dead = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.18), metalness: 0.1, roughness: 0.15, transparent: true, opacity: 0.75 })
  const wire = new THREE.MeshStandardMaterial({ color: '#0c0c0e', roughness: 0.6 })

  // the board: leans back ~32° from the deck, bottom edge propped on a crumpled leg, facing the runner (+Z)
  const board = new THREE.Group()
  board.rotation.x = -(Math.PI / 2 - 0.56)
  board.rotation.z = ((idx % 3) - 1) * 0.07
  board.position.set(0, 0.22, 1.2)
  group.add(board)
  const W = 1.62, H = 2.3
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.08), backing)
  back.position.set(0, H / 2, -0.06)
  board.add(back)
  // dented frame: four rails, one bent in, one corner sprung
  const rail = (x: number, y: number, w: number, h: number, rz = 0, rx = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), idx % 2 ? steel : rust)
    m.position.set(x, y, 0)
    m.rotation.set(rx, 0, rz)
    board.add(m)
  }
  rail(0, 0.03, W + 0.1, 0.1)
  rail(-W / 2, H / 2, 0.1, H, 0.02)
  rail(W / 2 + 0.04, H / 2 - 0.06, 0.1, H - 0.1, -0.05, 0.08)
  rail(-0.18, H - 0.02, W * 0.78, 0.1, 0.09)
  // glyph tubes: split into cracked pieces; a mix of lit / flickering / dead
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.6, H * 1.3), glowMaterial(glow, COLORS[idx % COLORS.length], 0.45))
  halo.position.set(0, H / 2, 0.12)
  const haloMat = halo.material as THREE.Material & { opacity: number }
  board.add(halo)
  let k = idx * 7
  for (const st of strokes(kind)) {
    for (const p of pieces(st, st.length > 6 ? 3 : 2)) {
      k = (k * 1103515245 + 12345) & 0x7fffffff
      const r = (k % 100) / 100
      const m = r < 0.5 ? lit : r < 0.78 ? flick : dead
      const t = tube(p, 0.035, m)
      t.position.z = 0.09
      board.add(t)
    }
  }
  // tube holders (little standoffs) along the bottom
  for (const x of [-0.5, 0, 0.5]) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 5), steel)
    s.rotation.x = Math.PI / 2
    s.position.set(x, 0.4, 0.04)
    board.add(s)
  }
  // snapped pole lying behind (along −Z), its stump torn
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.6, 8), rust)
  pole.rotation.set(Math.PI / 2, 0, 0.18)
  pole.position.set(0.25, 0.12, -1.6)
  group.add(pole)
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), steel)
  leg.position.set(-0.55, 0.2, 1.25)
  leg.rotation.z = 0.35
  group.add(leg)
  // dangling wires from the torn top corner down to the deck
  const top = new THREE.Vector3(0.75, 1.35, -0.25)
  for (let i = 0; i < 3; i++) {
    const end = new THREE.Vector3(0.6 + i * 0.18, 0.02, -0.2 - i * 0.35)
    const mid = top.clone().lerp(end, 0.5).add(new THREE.Vector3(0.12 + i * 0.05, -0.25, 0.1))
    const c = new THREE.CatmullRomCurve3([top.clone().add(new THREE.Vector3(0, 0, i * 0.05)), mid, end])
    group.add(new THREE.Mesh(new THREE.TubeGeometry(c, 12, 0.014, 4), wire))
  }
  // sparks at the torn wire ends: small hot glints with their own material (burst-animated)
  const sparkMat = glowMaterial(glow, '#fff2b0', 0.0) as THREE.Material & { opacity: number }
  for (let i = 0; i < 4; i++) {
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.22 - i * 0.03, 0.22 - i * 0.03), sparkMat)
    sp.position.set(0.72 + (i % 2) * 0.1, 1.25 - i * 0.12, -0.2 + i * 0.06)
    group.add(sp)
  }
  const base = color.clone()
  const pose = (variant: number, time: number) => {
    const ph = (variant % 97) * 0.37
    // stuttering flicker: mostly on, dropping out in short bursts
    const n = Math.sin(time * 31 + ph) + Math.sin(time * 7.3 + ph * 2) + Math.sin(time * 2.1 + ph * 3)
    const on = n > -0.6 ? 1 : 0.08
    flick.color.copy(base).multiplyScalar(on * (1.2 + 0.3 * Math.sin(time * 60 + ph)))
    haloMat.opacity = 0.32 + 0.12 * on
    const burst = Math.max(0, Math.sin(time * 3.7 + ph)) ** 12
    sparkMat.opacity = burst * (0.6 + 0.4 * Math.sin(time * 80 + ph))
  }
  return { group, pose }
}
