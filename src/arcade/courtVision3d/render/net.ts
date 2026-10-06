import * as THREE from 'three'
import { DIM, RIM_MAJOR } from '../sim/constants'

const STRANDS = 12
const ROWS = 7
const NET_LEN = 0.44
const BOTTOM_R = 0.135
const TOP_R = RIM_MAJOR - 0.004

type Node = { x: number; y: number; z: number; px: number; py: number; pz: number; pinned: boolean; ang: number }
type Link = { a: number; b: number; rest: number; k: number }

/**
 * Verlet cloth net: diamond mesh hanging from the rim hooks. Ball collision
 * pushes nodes out and drags them (stretch/wrap), springs whip it back.
 */
export class VerletNet {
  nodes: Node[] = []
  links: Link[] = []
  strings: Link[] = []
  mesh: THREE.InstancedMesh
  private tmpM = new THREE.Matrix4()
  private tmpQ = new THREE.Quaternion()
  private tmpS = new THREE.Vector3()
  private tmpP = new THREE.Vector3()
  private up = new THREE.Vector3(0, 1, 0)
  private dir = new THREE.Vector3()
  private ox = 0
  private oy = 0
  /** monotonically-advancing phase for deterministic jiggle */
  private jig = 0

  constructor(material: THREE.Material) {
    const idx = (r: number, i: number) => r * STRANDS + (((i % STRANDS) + STRANDS) % STRANDS)
    for (let r = 0; r <= ROWS; r++) {
      const f = r / ROWS
      const rad = TOP_R + (BOTTOM_R - TOP_R) * Math.pow(f, 0.85)
      const y = DIM.rimY - 0.012 - f * NET_LEN
      for (let i = 0; i < STRANDS; i++) {
        const ang = ((i + (r % 2) * 0.5) / STRANDS) * Math.PI * 2
        const x = Math.cos(ang) * rad
        const z = DIM.rimZ + Math.sin(ang) * rad
        this.nodes.push({ x, y, z, px: x, py: y, pz: z, pinned: r === 0, ang })
      }
    }
    const dist = (a: number, b: number) => {
      const A = this.nodes[a]
      const B = this.nodes[b]
      return Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z)
    }
    for (let r = 1; r <= ROWS; r++) {
      for (let i = 0; i < STRANDS; i++) {
        const n = idx(r, i)
        // diamond: odd rows sit between i and i+1 of the row above, even between i-1 and i
        const a = idx(r - 1, i)
        const b = r % 2 ? idx(r - 1, i + 1) : idx(r - 1, i - 1)
        for (const m of [a, b]) {
          const l = { a: m, b: n, rest: dist(m, n) * 1.02, k: 1 }
          this.links.push(l)
          this.strings.push(l)
        }
      }
    }
    // weak hoop-shape links (the knots keep the mesh open)
    for (let r = 1; r <= ROWS; r++) {
      for (let i = 0; i < STRANDS; i++) {
        const a = idx(r, i)
        const b = idx(r, i + 1)
        this.links.push({ a, b, rest: dist(a, b) * 1.06, k: 0.22 })
      }
    }
    const geo = new THREE.CylinderGeometry(0.0052, 0.0052, 1, 5, 1, true)
    geo.translate(0, 0.5, 0)
    this.mesh = new THREE.InstancedMesh(geo, material, this.strings.length)
    this.mesh.frustumCulled = false
    this.mesh.castShadow = false
    this.updateMesh()
  }

  /** Move the pinned top row with the hoop (seeded sway). */
  setOffset(x: number, y: number) {
    const dx = x - this.ox
    const dy = y - this.oy
    if (dx === 0 && dy === 0) return
    this.ox = x
    this.oy = y
    for (const n of this.nodes) {
      if (n.pinned) {
        n.x += dx
        n.y += dy
        n.px = n.x
        n.py = n.y
      }
    }
  }

  /** Impulse on the net (rim hit jiggle / swish snap). */
  kick(strength: number, mode: 'jiggle' | 'snap') {
    this.jig += 1.7
    for (let k = 0; k < this.nodes.length; k++) {
      const n = this.nodes[k]
      if (n.pinned) continue
      const row = Math.floor(k / STRANDS)
      const f = row / ROWS
      if (mode === 'snap') {
        // downward pull then whip back via springs
        n.py += strength * 0.012 * f
        const rx = n.x - this.ox
        const rz = n.z - DIM.rimZ
        n.px += rx * 0.06 * strength * f
        n.pz += rz * 0.06 * strength * f
      } else {
        const s = Math.sin(n.ang * 3 + this.jig) * strength * 0.006 * (0.4 + f)
        n.px += Math.cos(n.ang + this.jig) * s
        n.pz += Math.sin(n.ang * 2 - this.jig) * s
        n.py -= Math.abs(s) * 0.5
      }
    }
  }

  step(dt: number, ball: { x: number; y: number; z: number; vx: number; vy: number; vz: number } | null, wind: number) {
    const g = -9.81 * dt * dt
    const damp = 0.982
    for (const n of this.nodes) {
      if (n.pinned) continue
      const vx = (n.x - n.px) * damp
      const vy = (n.y - n.py) * damp
      const vz = (n.z - n.pz) * damp
      n.px = n.x
      n.py = n.y
      n.pz = n.z
      n.x += vx + wind * dt * dt
      n.y += vy + g
      n.z += vz
    }
    const R = DIM.ballR + 0.008
    for (let it = 0; it < 6; it++) {
      for (const l of this.links) {
        const A = this.nodes[l.a]
        const B = this.nodes[l.b]
        const dx = B.x - A.x
        const dy = B.y - A.y
        const dz = B.z - A.z
        const d = Math.hypot(dx, dy, dz) || 1e-6
        // strings only resist stretch (they can go slack); shape links both ways
        if (l.k === 1 && d < l.rest) continue
        const diff = ((d - l.rest) / d) * l.k
        const wa = A.pinned ? 0 : B.pinned ? 1 : 0.5
        const wb = B.pinned ? 0 : A.pinned ? 1 : 0.5
        A.x += dx * diff * wa
        A.y += dy * diff * wa
        A.z += dz * diff * wa
        B.x -= dx * diff * wb
        B.y -= dy * diff * wb
        B.z -= dz * diff * wb
      }
      if (ball) {
        for (const n of this.nodes) {
          if (n.pinned) continue
          const dx = n.x - ball.x
          const dy = n.y - ball.y
          const dz = n.z - ball.z
          const d = Math.hypot(dx, dy, dz)
          if (d < R && d > 1e-6) {
            const push = (R - d) / d
            n.x += dx * push
            n.y += dy * push
            n.z += dz * push
            if (it === 0) {
              // friction: the ball drags the cords along (stretch + wrap)
              n.px -= ball.vx * dt * 0.35
              n.py -= ball.vy * dt * 0.55
              n.pz -= ball.vz * dt * 0.35
            }
          }
        }
      }
    }
  }

  updateMesh() {
    for (let i = 0; i < this.strings.length; i++) {
      const l = this.strings[i]
      const A = this.nodes[l.a]
      const B = this.nodes[l.b]
      this.dir.set(B.x - A.x, B.y - A.y, B.z - A.z)
      const len = this.dir.length() || 1e-6
      this.dir.multiplyScalar(1 / len)
      this.tmpQ.setFromUnitVectors(this.up, this.dir)
      this.tmpP.set(A.x, A.y, A.z)
      this.tmpS.set(1, len, 1)
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS)
      this.mesh.setMatrixAt(i, this.tmpM)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  /** Hook anchor points (for rendering the hooks). */
  hookPositions(): THREE.Vector3[] {
    return this.nodes.filter((n) => n.pinned).map((n) => new THREE.Vector3(n.x, n.y, n.z))
  }
}
