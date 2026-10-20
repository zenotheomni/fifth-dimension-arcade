/**
 * Fifth Glide — close-in set dressing that you actually see while running:
 *  - palms lining the path on small floating planters just outside the deck edge (both sides),
 *  - towers rising out of the void beside and below the path (set-back shafts, lit windows, neon crowns).
 * Both are single InstancedMeshes re-filled each frame from path-distance slots (≈ 2 draw calls).
 * Slots near a corner are skipped so nothing ever stands on the crossing path after a turn.
 */
import * as THREE from 'three'
import type { Corner } from '../sim/track'
import type { PathLayout } from './layout'
import { addRim, towerMaterial } from './shaders'
import { palmGeometry } from './props'

const PALM_STEP = 8
const TOWER_STEP = 11
const hash = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return v - Math.floor(v)
}

export class Roadside {
  palms: THREE.InstancedMesh
  pots: THREE.InstancedMesh
  towers: THREE.InstancedMesh
  private seeds: THREE.InstancedBufferAttribute
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private e = new THREE.Euler()
  private v = new THREE.Vector3()
  private sc = new THREE.Vector3()
  private wp = { x: 0, z: 0, yaw: 0 }
  private maxPalms: number
  private maxTowers: number
  towerMat: THREE.ShaderMaterial

  private deckHalf: number

  constructor(deckHalf: number, viewAhead: number) {
    this.deckHalf = deckHalf
    this.maxPalms = Math.ceil((viewAhead + 30) / PALM_STEP) * 2 + 4
    this.maxTowers = Math.ceil((viewAhead + 60) / TOWER_STEP) * 3 + 6
    const palmMat = addRim(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide, emissive: new THREE.Color('#0b1a14'), emissiveIntensity: 1 }), new THREE.Color('#ff6ac8'), 0.95, 2.6)
    this.palms = new THREE.InstancedMesh(palmGeometry(), palmMat, this.maxPalms)
    // planter: dark basalt bowl with a glowing teal rim so the palm reads as floating beside the deck
    const pot = new THREE.CylinderGeometry(0.75, 0.35, 0.7, 20, 1)
    pot.translate(0, -0.35, 0)
    this.pots = new THREE.InstancedMesh(pot, addRim(new THREE.MeshStandardMaterial({ color: '#1a1622', metalness: 0.4, roughness: 0.5, emissive: new THREE.Color('#00a89c'), emissiveIntensity: 0.25 }), new THREE.Color('#00e0d0'), 1.2, 2.2), this.maxPalms)
    const box = new THREE.BoxGeometry(1, 1, 1)
    box.translate(0, 0.5, 0)
    this.towerMat = towerMaterial(120, 900)
    ;(this.towerMat.uniforms.uFog.value as THREE.Color).set('#2a1030')
    this.towers = new THREE.InstancedMesh(box, this.towerMat, this.maxTowers)
    this.seeds = new THREE.InstancedBufferAttribute(new Float32Array(this.maxTowers), 1)
    box.setAttribute('aSeed', this.seeds)
    for (const im of [this.palms, this.pots, this.towers]) {
      im.frustumCulled = false
      im.count = 0
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    }
  }

  private nearCorner(corners: Corner[], s: number, before: number, after: number) {
    for (const c of corners) if (s > c.s - before && s < c.s + after) return true
    return false
  }

  update(S: number, viewAhead: number, L: PathLayout, corners: Corner[], time: number) {
    // ── palms on planters, both sides ──
    let n = 0
    const p0 = Math.floor((S - 14) / PALM_STEP)
    const p1 = Math.ceil((S + viewAhead) / PALM_STEP)
    for (let j = p0; j <= p1; j++) {
      for (const side of [-1, 1]) {
        if (n >= this.maxPalms) break
        const h = hash(j * 2 + (side > 0 ? 1 : 0))
        if (h < 0.18) continue // a few gaps so it isn't a fence
        const s = j * PALM_STEP + (h - 0.5) * 3
        if (this.nearCorner(corners, s, 9, 9)) continue
        const seg = L.segFor(s)
        if (seg < 0) continue
        const lat = side * (this.deckHalf + 1.1 + hash(j + 0.3) * 0.8)
        const p = L.pt(seg, s, lat, this.wp)
        const k = 0.95 + hash(j + 0.7) * 0.45
        const y = -0.15 + Math.sin(time * 0.6 + j) * 0.08
        this.q.setFromEuler(this.e.set(0, p.yaw + h * 6.28, side * 0.06))
        this.m.compose(this.v.set(p.x, y, p.z), this.q, this.sc.set(k, k, k))
        this.palms.setMatrixAt(n, this.m)
        this.q.setFromEuler(this.e.set(0, p.yaw, 0))
        this.m.compose(this.v.set(p.x, y, p.z), this.q, this.sc.set(1, 1, 1))
        this.pots.setMatrixAt(n, this.m)
        n++
      }
    }
    this.palms.count = n
    this.pots.count = n
    this.palms.instanceMatrix.needsUpdate = true
    this.pots.instanceMatrix.needsUpdate = true

    // ── towers out of the void: one near row (12–30 m off the edge) and one far row, both sides ──
    let m = 0
    const t0 = Math.floor((S - 30) / TOWER_STEP)
    const t1 = Math.ceil((S + viewAhead + 40) / TOWER_STEP)
    const seeds = this.seeds.array as Float32Array
    for (let j = t0; j <= t1; j++) {
      for (let r = 0; r < 3; r++) {
        if (m >= this.maxTowers - 1) break
        const h = hash(j * 3.1 + r * 17.3)
        if (h < 0.25) continue
        const side = r === 2 ? (hash(j + 9.1) < 0.5 ? -1 : 1) : r === 0 ? -1 : 1
        const far = r === 2
        const s = j * TOWER_STEP + (h - 0.5) * 6
        // never where the next segment will cross after a turn (or the previous one came from)
        if (this.nearCorner(corners, s, far ? 110 : 60, far ? 40 : 25)) continue
        const seg = L.segFor(s)
        if (seg < 0) continue
        const w = far ? 14 + h * 16 : 7 + h * 9
        const lat = side * (this.deckHalf + (far ? 38 + hash(j + 1.7) * 40 : 9 + hash(j + 2.3) * 14) + w / 2)
        const p = L.pt(seg, s, lat, this.wp)
        // tops from well below the deck to well above it (so some you look down on, some tower over you)
        const top = far ? -10 + hash(j + 4.4) * 80 : -18 + hash(j + 5.5) * 42
        const base = -220
        const yaw = p.yaw + (hash(j + 6.6) - 0.5) * 0.3
        this.q.setFromEuler(this.e.set(0, yaw, 0))
        const shaft = (top - base) * 0.82
        this.m.compose(this.v.set(p.x, base, p.z), this.q, this.sc.set(w, shaft, w * (0.8 + hash(j + 7.7) * 0.4)))
        this.towers.setMatrixAt(m, this.m)
        seeds[m++] = h
        // set-back crown tier
        this.m.compose(this.v.set(p.x, base + shaft, p.z), this.q, this.sc.set(w * 0.7, top - base - shaft, w * 0.62))
        this.towers.setMatrixAt(m, this.m)
        seeds[m++] = h
      }
    }
    this.towers.count = m
    this.towers.instanceMatrix.needsUpdate = true
    this.seeds.needsUpdate = true
    this.towerMat.uniforms.uTime.value = time
  }
}
