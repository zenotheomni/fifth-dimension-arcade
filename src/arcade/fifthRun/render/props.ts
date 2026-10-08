/** Fifth Glide — procedural props: shooting stars, traffic cars, barriers, gantries, gaps, 5D logo power-up, palms, gates, lamps. */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { addRim, glowMaterial } from './shaders'
import { blobTexture } from './textures'

let _carShadowBlob: THREE.Texture | null = null
const carShadowBlob = () => (_carShadowBlob ??= blobTexture())

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return g
}

/**
 * Gold shooting star (💫 vibe): 5-point head + tapered trail.
 * Used as a fallback mesh; the live scene prefers a textured billboard.
 * ~0.95 m tip-to-tail.
 */
export function shootingStarGeometry() {
  const outer = 0.26
  const inner = 0.11
  const shape = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  const head = new THREE.ExtrudeGeometry(shape, {
    depth: 0.07,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.018,
    bevelSegments: 1,
    steps: 1,
  })
  head.translate(0, 0, -0.035)

  const trailShape = new THREE.Shape()
  trailShape.moveTo(0.02, 0)
  trailShape.lineTo(-0.78, 0.09)
  trailShape.lineTo(-0.78, -0.09)
  trailShape.closePath()
  const trail = new THREE.ExtrudeGeometry(trailShape, { depth: 0.04, bevelEnabled: false, steps: 1 })
  trail.translate(0, 0, -0.02)

  const flareShape = new THREE.Shape()
  flareShape.moveTo(-0.02, 0)
  flareShape.lineTo(-0.88, 0.16)
  flareShape.lineTo(-0.88, -0.16)
  flareShape.closePath()
  const flare = new THREE.ExtrudeGeometry(flareShape, { depth: 0.02, bevelEnabled: false, steps: 1 })
  flare.translate(0, 0, -0.01)

  const g = mergeGeometries([head.toNonIndexed(), trail.toNonIndexed(), flare.toNonIndexed()])!
  g.computeVertexNormals()
  g.rotateZ(-0.4)
  return g
}

/** @deprecated Collectibles are shooting stars; kept as an alias for older imports. */
export function keyGeometry() {
  return shootingStarGeometry()
}

export const CAR_COLORS = ['#e11d48', '#2563eb', '#f59e0b', '#10b981', '#a855f7', '#f8fafc', '#0f172a', '#ec4899', '#06b6d4', '#ef4444']

export type CarParts = {
  group: THREE.Group
  paint: THREE.MeshStandardMaterial
  tail: THREE.MeshStandardMaterial
  head: THREE.MeshStandardMaterial
  shadow?: THREE.Mesh
}

/**
 * Compact modern sports coupe — Subway Surfers / casual-iPhone bar.
 * Rounded body (no slab extrudes), clearcoat paint, chrome, glass, lit lamps.
 * Rear faces +Z. Hitbox footprint ~4.4 m × ~1.8 m.
 */
export function buildCar(shared: {
  chrome: THREE.Material
  glass: THREE.Material
  tire: THREE.Material
  white: THREE.Material
  glow: THREE.Texture
}): CarParts {
  const group = new THREE.Group()

  const paint = new THREE.MeshPhysicalMaterial({
    color: '#e11d48',
    metalness: 0.45,
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.85,
    reflectivity: 0.85,
  })
  const chromeMat =
    (shared.chrome as THREE.MeshStandardMaterial).isMeshStandardMaterial
      ? (shared.chrome as THREE.MeshStandardMaterial)
      : new THREE.MeshStandardMaterial({ color: '#eef2f8', metalness: 1, roughness: 0.1, envMapIntensity: 1.5 })
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#071018',
    metalness: 0.05,
    roughness: 0.02,
    transmission: 0.55,
    transparent: true,
    opacity: 0.72,
    envMapIntensity: 2.6,
    thickness: 0.35,
  })
  const tail = new THREE.MeshStandardMaterial({
    color: '#ff2040',
    emissive: new THREE.Color('#ff1030'),
    emissiveIntensity: 5.5,
    roughness: 0.18,
    metalness: 0.3,
  })
  const head = new THREE.MeshStandardMaterial({
    color: '#fff8e8',
    emissive: new THREE.Color('#fff2d0'),
    emissiveIntensity: 0,
    roughness: 0.12,
    metalness: 0.2,
  })
  const dark = new THREE.MeshStandardMaterial({ color: '#0c0c10', roughness: 0.55, metalness: 0.35 })
  const underMat = new THREE.MeshStandardMaterial({ color: '#08080a', roughness: 0.95, metalness: 0.05 })
  const lensRed = new THREE.MeshPhysicalMaterial({
    color: '#ff2030',
    emissive: new THREE.Color('#ff1525'),
    emissiveIntensity: 2.8,
    roughness: 0.06,
    metalness: 0.05,
    transparent: true,
    opacity: 0.9,
    transmission: 0.3,
  })

  const W = 1.78

  // ── rounded lower body (capsule hull + sculpted hood/trunk) ──
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.52, 3.35, 8, 16), paint)
  hull.rotation.z = Math.PI / 2
  hull.scale.set(1, 1.05, 1.55)
  hull.position.set(0, 0.55, 0.05)
  group.add(hull)

  // Side body plump (reads width without boxes)
  for (const side of [-1, 1] as const) {
    const sidePod = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 2.9, 6, 12), paint)
    sidePod.rotation.z = Math.PI / 2
    sidePod.scale.set(1, 0.85, 1.15)
    sidePod.position.set(side * 0.55, 0.52, 0.05)
    group.add(sidePod)
  }

  // Hood slope (front = −Z)
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.45), paint)
  hood.scale.set(0.92, 0.38, 1.15)
  hood.position.set(0, 0.55, -1.55)
  group.add(hood)

  // Trunk / rear deck (rounded, not a slab)
  const trunk = new THREE.Mesh(new THREE.SphereGeometry(0.85, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), paint)
  trunk.scale.set(0.95, 0.36, 1.05)
  trunk.position.set(0, 0.58, 1.55)
  group.add(trunk)

  // Cabin greenhouse
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.78, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), glassMat)
  cabin.scale.set(0.95, 0.72, 1.35)
  cabin.position.set(0, 0.95, 0.05)
  group.add(cabin)

  // Painted roof cap
  const roof = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), paint)
  roof.scale.set(0.88, 0.42, 1.15)
  roof.position.set(0, 1.28, 0.08)
  group.add(roof)

  // Beltline chrome spear
  for (const side of [-1, 1] as const) {
    const spear = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 3.6, 3, 8), chromeMat)
    spear.rotation.z = Math.PI / 2
    spear.position.set(side * (W / 2 - 0.02), 0.72, 0.05)
    group.add(spear)
  }

  // Wheel-arch flares
  for (const z of [-1.35, 1.25]) {
    for (const side of [-1, 1] as const) {
      const flare = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 8, 18, Math.PI), paint)
      flare.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2
      flare.rotation.y = Math.PI / 2
      flare.position.set(side * (W / 2 - 0.06), 0.4, z)
      group.add(flare)
    }
  }

  // ── lights ──
  // Modern LED taillight bar
  const tailBar = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 1.35, 4, 10), tail)
  tailBar.rotation.z = Math.PI / 2
  tailBar.position.set(0, 0.72, 2.12)
  group.add(tailBar)
  const tailLens = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.12, 0.04), lensRed)
  tailLens.position.set(0, 0.72, 2.18)
  group.add(tailLens)
  const tailGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.55), glowMaterial(shared.glow, '#ff2a3a', 0.75))
  tailGlow.position.set(0, 0.72, 2.28)
  group.add(tailGlow)

  // Quad headlights + chrome bezels
  for (const side of [-1, 1] as const) {
    for (const x of [0.32, 0.55]) {
      const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.016, 8, 16), chromeMat)
      bezel.position.set(side * x, 0.58, -2.05)
      bezel.rotation.y = Math.PI
      group.add(bezel)
      const core = new THREE.Mesh(new THREE.CircleGeometry(0.065, 16), head)
      core.position.set(side * x, 0.58, -2.07)
      core.rotation.y = Math.PI
      group.add(core)
    }
    const headGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), glowMaterial(shared.glow, '#fff0c0', 0.55))
    headGlow.position.set(side * 0.44, 0.58, -2.15)
    headGlow.rotation.y = Math.PI
    group.add(headGlow)

    // Side mirror
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.12, 3, 6), chromeMat)
    arm.rotation.z = side > 0 ? -0.4 : 0.4
    arm.position.set(side * (W / 2 + 0.02), 0.98, -0.55)
    group.add(arm)
    const mir = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), dark)
    mir.scale.set(0.7, 1, 1.1)
    mir.position.set(side * (W / 2 + 0.12), 0.98, -0.55)
    group.add(mir)
  }

  // Grille
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 0.06), dark)
  grille.position.set(0, 0.42, -2.0)
  group.add(grille)
  for (let i = -3; i <= 3; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.18, 0.03), chromeMat)
    bar.position.set(i * 0.11, 0.42, -2.03)
    group.add(bar)
  }

  // Bumpers (rounded)
  const frontBump = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 1.55, 4, 10), chromeMat)
  frontBump.rotation.z = Math.PI / 2
  frontBump.position.set(0, 0.32, -2.05)
  group.add(frontBump)
  const rearBump = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 1.5, 4, 10), chromeMat)
  rearBump.rotation.z = Math.PI / 2
  rearBump.position.set(0, 0.32, 2.08)
  group.add(rearBump)

  // Underbody
  const under = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.06, 3.8), underMat)
  under.position.set(0, 0.16, 0.05)
  group.add(under)

  // ── wheels ──
  const wheelG = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 24)
  wheelG.rotateZ(Math.PI / 2)
  const rimG = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16)
  rimG.rotateZ(Math.PI / 2)
  const hubG = new THREE.CylinderGeometry(0.08, 0.08, 0.05, 12)
  hubG.rotateZ(Math.PI / 2)
  for (const z of [-1.35, 1.25]) {
    for (const side of [-1, 1] as const) {
      const w = new THREE.Mesh(wheelG, shared.tire)
      w.position.set(side * 0.82, 0.36, z)
      group.add(w)
      const rim = new THREE.Mesh(rimG, chromeMat)
      rim.position.set(side * 0.92, 0.36, z)
      group.add(rim)
      const hub = new THREE.Mesh(hubG, chromeMat)
      hub.position.set(side * 0.96, 0.36, z)
      group.add(hub)
    }
  }

  // Soft contact shadow
  const shadowMat = new THREE.MeshBasicMaterial({
    map: carShadowBlob(),
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
  })
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 4.6), shadowMat)
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.012
  shadow.renderOrder = -1
  group.add(shadow)

  return { group, paint, tail, head, shadow }
}

// ── Realistic debris: displaced-noise rock / asteroid chunks with a procedural albedo+roughness+bump map ──
let _rockTex: { map: THREE.Texture; bump: THREE.Texture } | null = null
function rockTextures() {
  if (_rockTex) return _rockTex
  const N = 256
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!
  const img = g.createImageData(N, N)
  const b = document.createElement('canvas')
  b.width = b.height = N
  const bg = b.getContext('2d')!
  const bimg = bg.createImageData(N, N)
  // value-noise fbm (tileable)
  const R = (x: number, y: number) => {
    const h = Math.sin(((x % 64) + 64) % 64 * 127.1 + (((y % 64) + 64) % 64) * 311.7) * 43758.5453
    return h - Math.floor(h)
  }
  const vn = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
    const a = R(xi, yi), b2 = R(xi + 1, yi), c2 = R(xi, yi + 1), d = R(xi + 1, yi + 1)
    return a + (b2 - a) * u + (c2 - a) * v + (a - b2 - c2 + d) * u * v
  }
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let f = 0, amp = 0.5, fr = 4 / N * 4
      for (let o = 0; o < 5; o++) {
        f += amp * vn(x * fr * 4, y * fr * 4)
        amp *= 0.5
        fr *= 2
      }
      const crack = Math.abs(vn(x / 9, y / 9) - 0.5) < 0.025 ? 0.45 : 1
      const i = (y * N + x) * 4
      const l = (34 + f * 70) * crack
      img.data[i] = l * 0.95
      img.data[i + 1] = l * 0.9
      img.data[i + 2] = l * 1.02
      img.data[i + 3] = 255
      const bv = f * 255 * crack
      bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = bv
      bimg.data[i + 3] = 255
    }
  g.putImageData(img, 0, 0)
  bg.putImageData(bimg, 0, 0)
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  const bump = new THREE.CanvasTexture(b)
  for (const t of [map, bump]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 4
  }
  _rockTex = { map, bump }
  return _rockTex
}

let _rockMat: THREE.MeshStandardMaterial | null = null
function rockMaterial() {
  const t = rockTextures()
  return (_rockMat ??= new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 2.2, roughnessMap: t.bump, roughness: 0.95, metalness: 0.08, color: '#9a94a6' }))
}

/** Jagged rock: icosphere with seeded radial noise, squashed to (sx, sy, sz). Faceted look via flat normals. */
function rockGeometry(seed: number, sx: number, sy: number, sz: number, detail = 2) {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail)
  g = g.index ? g.toNonIndexed() : g
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const h = (x: number, y: number, z: number) => {
    const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.13) * 43758.5453
    return v - Math.floor(v)
  }
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const k = 0.72 + 0.5 * h(Math.round(v.x * 4), Math.round(v.y * 4), Math.round(v.z * 4)) + 0.12 * h(Math.round(v.x * 9), Math.round(v.y * 9), Math.round(v.z * 9))
    v.multiplyScalar(k)
    pos.setXYZ(i, v.x * sx, v.y * sy, v.z * sz)
  }
  g.computeVertexNormals()
  // planar-ish UVs for the noise maps
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) * 0.9 + pos.getZ(i) * 0.6
    uv[i * 2 + 1] = pos.getY(i) * 0.9 + pos.getZ(i) * 0.3
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

let _rockSeed = 1
/**
 * Low hurdle (jump only): a short line of broken asteroid rubble with a bent, rusted guard rail.
 * Built to the sim box exactly — top ≤ OB.barrier.h (0.6 m), half-width ≤ OB.barrier.halfW (0.82 m) —
 * so "feet above the rocks" is always a clear.
 */
export function buildBarrier(chev: THREE.Texture, metal: THREE.Material) {
  void chev
  void metal
  const seed = _rockSeed++
  const group = new THREE.Group()
  const mat = rockMaterial()
  // [x, half-width, half-height, half-depth] — rock radius noise is ≤ 1.34× so tops stay < 0.58 m
  const chunks: [number, number, number, number][] = [
    [-0.52, 0.22, 0.2, 0.17],
    [0.0, 0.27, 0.215, 0.18],
    [0.5, 0.22, 0.19, 0.16],
    [-0.25, 0.14, 0.12, 0.12],
    [0.27, 0.13, 0.11, 0.12],
  ]
  chunks.forEach(([x, w, hgt, d], i) => {
    const m = new THREE.Mesh(rockGeometry(seed * 7 + i, w, hgt, d), mat)
    m.position.set(x, hgt * 0.8, i > 2 ? 0.12 : 0)
    m.rotation.set(0.15 * i, seed * 0.7 + i, 0.08)
    group.add(m)
  })
  const rust = new THREE.MeshStandardMaterial({ color: '#5a463c', metalness: 0.7, roughness: 0.66 })
  // bent guard rail: a gently sagging tube between two stubby posts
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.78, 0.5, 0.05),
    new THREE.Vector3(-0.2, 0.44, 0.08),
    new THREE.Vector3(0.3, 0.47, 0.04),
    new THREE.Vector3(0.78, 0.52, 0.06),
  ])
  const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.035, 8, false), rust)
  group.add(rail)
  for (const x of [-0.74, 0.74]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.52, 8), rust)
    post.position.set(x, 0.26, 0.05)
    post.rotation.z = x * 0.08
    group.add(post)
  }
  // hazard LED strip clamped along the rail + ember cracks: the bloom makes the hurdle readable
  // ~1.5 s (50+ m) out on the dark road
  const lamp = new THREE.MeshStandardMaterial({ color: '#2a0d06', emissive: new THREE.Color('#ff5a1f'), emissiveIntensity: 2.4 })
  const strip = new THREE.CatmullRomCurve3(curve.points.map((p) => new THREE.Vector3(p.x * 0.96, p.y + 0.04, p.z + 0.03)))
  group.add(new THREE.Mesh(new THREE.TubeGeometry(strip, 24, 0.016, 6, false), lamp))
  for (const x of [-0.45, 0.1, 0.55]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), lamp)
    e.position.set(x, 0.2, 0.2)
    group.add(e)
  }
  return { group, lamp }
}

/**
 * Chest-high bar (jump over OR slide under): a scorched steel conduit pipe on two braced stanchions.
 * Pipe spans y ∈ [OB.pipe.bottom, OB.pipe.top] = [0.95, 1.2] m across the lane.
 */
export function buildPipe(metal: THREE.Material) {
  void metal
  const group = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: '#6c707a', metalness: 0.85, roughness: 0.42 })
  const dark = new THREE.MeshStandardMaterial({ color: '#2b2a31', metalness: 0.7, roughness: 0.55 })
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 1.9, 24), steel)
  pipe.rotation.z = Math.PI / 2
  pipe.position.y = 1.075
  group.add(pipe)
  for (const x of [-0.62, 0.62]) {
    const flange = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.022, 8, 24), dark)
    flange.rotation.y = Math.PI / 2
    flange.position.set(x, 1.075, 0)
    group.add(flange)
  }
  for (const x of [-0.92, 0.92]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.2, 10), dark)
    post.position.set(x, 0.6, 0)
    group.add(post)
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.05, 12), dark)
    foot.position.set(x, 0.025, 0)
    group.add(foot)
  }
  // hazard band + a blinking amber warning lamp so it reads 1.5 s out
  const lampMat = new THREE.MeshStandardMaterial({ color: '#3a2004', emissive: new THREE.Color('#ffb020'), emissiveIntensity: 2.4 })
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.22, 24), lampMat)
  band.rotation.z = Math.PI / 2
  band.position.y = 1.075
  group.add(band)
  return { group, lamp: lampMat }
}

export function buildGantry(chev: THREE.Texture, metal: THREE.Material, glow: THREE.Texture) {
  const group = new THREE.Group()
  const beamMat = new THREE.MeshStandardMaterial({ color: '#1a1426', roughness: 0.4, metalness: 0.6 })
  const beam = new THREE.Mesh(box(1.98, 0.5, 0.3), beamMat)
  beam.position.y = 1.5
  group.add(beam)
  const signMat = new THREE.MeshStandardMaterial({ map: chev, emissive: new THREE.Color('#ffc83c'), emissiveMap: chev, emissiveIntensity: 0.9, roughness: 0.4 })
  const sign = new THREE.Mesh(box(1.86, 0.3, 0.02), signMat)
  sign.position.set(0, 1.5, 0.16)
  group.add(sign)
  const tube = new THREE.MeshStandardMaterial({ color: '#7cf', emissive: new THREE.Color('#00e0d0'), emissiveIntensity: 3.2 })
  const t1 = new THREE.Mesh(box(1.98, 0.045, 0.05), tube)
  t1.position.set(0, 1.26, 0.16)
  group.add(t1)
  const tube2 = new THREE.MeshStandardMaterial({ color: '#f8a', emissive: new THREE.Color('#ff3d8a'), emissiveIntensity: 3.2 })
  const t2 = new THREE.Mesh(box(1.98, 0.04, 0.05), tube2)
  t2.position.set(0, 1.74, 0.16)
  group.add(t2)
  for (const x of [-0.98, 0.98]) {
    const post = new THREE.Mesh(box(0.08, 1.75, 0.08), metal)
    post.position.set(x, 0.875, 0)
    group.add(post)
  }
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.9), glowMaterial(glow, '#00e0d0', 0.22))
  halo.position.set(0, 1.26, 0.2)
  group.add(halo)
  return { group }
}

/**
 * Road gap: a real pit (the road shader cuts the hole away) with lit walls and a glowing grid floor
 * 7 m down, ringed by bright cyan LED kerbs and a soft cyan spill on the asphalt so it reads ~1.5 s
 * (50+ m) out. The pit is a unit footprint scaled per gap (x = width, z = length); kerbs are placed
 * per frame by the scene.
 */
export const GAP_DEPTH = 7
export function buildGap(glow: THREE.Texture) {
  const group = new THREE.Group()
  const pitMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vL; varying vec3 vW;
      void main(){ vL = position; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vL; varying vec3 vW; uniform float uTime;
      void main(){
        float depth = clamp(-vW.y / ${GAP_DEPTH.toFixed(1)}, 0.0, 1.0); // world y: road surface = 0
        // walls: rim light spilling down from the cyan kerb, fading into the dark
        float dm = max(0.0, -vW.y);
        vec3 col = vec3(0.004, 0.01, 0.02) + vec3(0.1, 0.75, 0.9) * exp(-dm * 2.6) * 0.85;
        // faint light bands down the shaft: depth cue while he falls
        float band = 1.0 - smoothstep(0.0, 0.05, abs(fract(dm / 1.2) - 0.5));
        col += vec3(0.1, 0.6, 0.8) * band * 0.22 * exp(-dm * 0.3);
        // floor: synthwave grid far below
        if (depth > 0.98) {
          vec2 g = abs(fract(vW.xz * vec2(0.9, 0.6)) - 0.5);
          float grid = 1.0 - smoothstep(0.0, 0.06, min(g.x, g.y));
          col = vec3(0.01, 0.006, 0.03) + vec3(0.0, 0.7, 0.8) * grid * 0.6;
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const pit = new THREE.Group()
  const D = GAP_DEPTH
  const wall = (w: number, x: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, D), pitMat)
    m.position.set(x, -D / 2, z)
    m.rotation.y = ry
    pit.add(m)
  }
  wall(1, 0, -0.5, 0) // far
  wall(1, 0, 0.5, 0) // near
  wall(1, -0.5, 0, Math.PI / 2)
  wall(1, 0.5, 0, Math.PI / 2)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), pitMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -D
  pit.add(floor)
  group.add(pit)

  // bright raised LED kerbs on all four edges (unit length, scaled per frame)
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#dff', emissive: new THREE.Color('#39f3ff'), emissiveIntensity: 4, roughness: 0.4 })
  const near = new THREE.Mesh(box(1, 0.12, 0.2), edgeMat)
  const far = new THREE.Mesh(box(1, 0.12, 0.2), edgeMat)
  const left = new THREE.Mesh(box(0.16, 0.12, 1), edgeMat)
  const right = new THREE.Mesh(box(0.16, 0.12, 1), edgeMat)
  for (const m of [near, far, left, right]) group.add(m)
  // cyan spill on the asphalt just before / after the hole (never over it, so the pit stays dark)
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMaterial(glow, '#39e8ff', 0.5))
  spill.rotation.x = -Math.PI / 2
  spill.position.y = 0.012
  group.add(spill)
  const spillFar = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMaterial(glow, '#39e8ff', 0.35))
  spillFar.rotation.x = -Math.PI / 2
  spillFar.position.y = 0.012
  group.add(spillFar)
  // low light curtain rising off the near + far kerbs: reads from ~1.5 s out on a dark road
  const curtainMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uAmp: { value: 0.5 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `varying vec2 vUv; uniform float uAmp;
      void main(){ float side = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        float up = pow(1.0 - vUv.y, 2.2);
        gl_FragColor = vec4(vec3(0.22, 0.95, 1.0) * up * side * uAmp, 1.0); }`,
  })
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), curtainMat)
  const curtainFar = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), curtainMat)
  group.add(curtain, curtainFar)
  // soft beacon over the hole while it is still far off (fades out as you get close)
  const beaconMat = glowMaterial(glow, '#39f3ff', 0.0)
  const beacon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), beaconMat)
  group.add(beacon)
  return { group, pit, near, far, left, right, spill, spillFar, curtain, curtainFar, curtainMat, beacon, beaconMat, mat: pitMat, edgeMat }
}

export function buildPickup(kind: 'hand', glow: THREE.Texture, emblem: THREE.Texture | null) {
  void kind
  const group = new THREE.Group()
  const spin = new THREE.Group()
  spin.position.y = 1.35
  group.add(spin)
  const color = '#ffd36a'
  // Rare Fifth Dimension logo — spinning emblem disc (15s invincible when collected)
  if (emblem) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 48),
      new THREE.MeshBasicMaterial({ map: emblem, transparent: true, side: THREE.DoubleSide, depthWrite: true, alphaTest: 0.3, toneMapped: false }),
    )
    spin.add(disc)
    const back = disc.clone()
    back.rotation.y = Math.PI
    spin.add(back)
  } else {
    const fallback = new THREE.Mesh(
      new THREE.CircleGeometry(0.4, 28),
      new THREE.MeshStandardMaterial({
        color: '#1a1028',
        emissive: new THREE.Color('#b48cff'),
        emissiveIntensity: 0.85,
        roughness: 0.4,
        metalness: 0.2,
      }),
    )
    spin.add(fallback)
    const five = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.28, 5),
      new THREE.MeshBasicMaterial({ color: '#ff5a1f', side: THREE.DoubleSide }),
    )
    five.position.z = 0.02
    spin.add(five)
  }

  const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), glowMaterial(glow, color, 0.45))
  halo.position.y = 1.35
  halo.renderOrder = -1
  group.add(halo)
  // wide far-visibility flare
  const flare = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), glowMaterial(glow, '#b48cff', 0.35))
  flare.position.y = 1.35
  flare.renderOrder = -2
  group.add(flare)
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(0.74, 0.84, 48),
    new THREE.MeshBasicMaterial({ color: '#ffe7a0', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  )
  spin.add(rim)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1.15, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.03
  group.add(ring)
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.75, 26, 24, 1, true),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uColor; varying float vY; void main(){ gl_FragColor = vec4(uColor * pow(clamp(1.0 - vY, 0.0, 1.0), 1.6) * 0.6, 1.0); }',
    }),
  )
  beam.position.y = 2.3 + 13
  group.add(beam)
  return { group, spin, halo, ring, flare, beam }
}


/** Palm silhouette: curved trunk + drooping fronds (vertex-coloured, merged). */
export function palmGeometry() {
  const geoms: THREE.BufferGeometry[] = []
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.15, 2.5, 0), new THREE.Vector3(0.55, 5.2, 0), new THREE.Vector3(1.0, 7.0, 0)])
  const trunk = new THREE.TubeGeometry(curve, 16, 0.17, 7, false)
  const tc = new Float32Array(trunk.attributes.position.count * 3)
  for (let i = 0; i < tc.length; i += 3) {
    tc[i] = 0.16
    tc[i + 1] = 0.1
    tc[i + 2] = 0.14
  }
  trunk.setAttribute('color', new THREE.BufferAttribute(tc, 3))
  geoms.push(trunk.toNonIndexed())
  const top = curve.getPoint(1)
  const N = 9
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.3
    const len = 2.6 + (i % 3) * 0.35
    const seg = 7
    const pos: number[] = []
    const col: number[] = []
    for (let j = 0; j < seg; j++) {
      const t0 = j / seg
      const t1 = (j + 1) / seg
      const pt = (t: number, side: number) => {
        const r = t * len
        const w = 0.42 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - t * 0.6)
        const droop = -1.6 * t * t + 0.5 * t
        const x = Math.cos(a) * r - Math.sin(a) * w * side
        const z = Math.sin(a) * r + Math.cos(a) * w * side
        return [top.x + x, top.y + droop - Math.abs(side) * 0.08 * t, top.z + z]
      }
      const p00 = pt(t0, -1)
      const p01 = pt(t0, 1)
      const p10 = pt(t1, -1)
      const p11 = pt(t1, 1)
      const mid0 = pt(t0, 0)
      const mid1 = pt(t1, 0)
      mid0[1] += 0.06
      mid1[1] += 0.06
      pos.push(...p00, ...mid0, ...p10, ...mid0, ...mid1, ...p10, ...mid0, ...p01, ...mid1, ...p01, ...p11, ...mid1)
      for (let k = 0; k < 12; k++) col.push(0.05, 0.16 + 0.05 * t0, 0.14)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2))
    g.computeVertexNormals()
    geoms.push(g)
  }
  for (const g of geoms) if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 2).fill(0), 2))
  const m = mergeGeometries(geoms.map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n }))!
  m.computeVertexNormals()
  return m
}

export function palmMaterial() {
  return addRim(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), new THREE.Color('#ff5ab4'), 0.4, 3.2)
}

/** Synthwave gate over the highway. */
export function buildGate(glow: THREE.Texture, emblem: THREE.Texture | null, metal: THREE.Material) {
  const group = new THREE.Group()
  const H = 7.4
  const X = 5.3
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(box(0.34, H, 0.34), metal)
    post.position.set(side * X, H / 2, 0)
    group.add(post)
  }
  const beam = new THREE.Mesh(box(2 * X + 0.34, 0.4, 0.34), metal)
  beam.position.y = H
  group.add(beam)
  const cols = ['#00e0d0', '#ff3d8a', '#8a4dff']
  const tubes: THREE.MeshStandardMaterial[] = []
  cols.forEach((c, i) => {
    const m = new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(c), emissiveIntensity: 1.9 })
    tubes.push(m)
    const y = H - 0.32 - i * 0.16
    const t = new THREE.Mesh(box(2 * X - 0.3, 0.06, 0.06), m)
    t.position.set(0, y, 0.2)
    group.add(t)
    for (const side of [-1, 1]) {
      const v = new THREE.Mesh(box(0.06, H - 0.6 - i * 0.16, 0.06), m)
      v.position.set(side * (X - 0.3 - i * 0.14), (H - 0.6 - i * 0.16) / 2, 0.2)
      group.add(v)
    }
  })
  if (emblem) {
    const e = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 1.7),
      new THREE.MeshBasicMaterial({ map: emblem, transparent: true, color: new THREE.Color(1.6, 1.5, 1.3), fog: false }),
    )
    e.position.set(0, H + 1.2, 0.05)
    group.add(e)
    const h = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), glowMaterial(glow, '#ffc83c', 0.22))
    h.position.set(0, H + 1.2, 0)
    group.add(h)
  }
  return { group, tubes }
}

export function buildLamp(glow: THREE.Texture, metal: THREE.Material, side: number) {
  const group = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 5.6, 8), metal)
  pole.position.y = 2.8
  group.add(pole)
  const arm = new THREE.Mesh(box(1.3, 0.07, 0.07), metal)
  arm.position.set(-side * 0.6, 5.55, 0)
  group.add(arm)
  const head = new THREE.Mesh(box(0.5, 0.08, 0.22), new THREE.MeshStandardMaterial({ color: '#fde', emissive: new THREE.Color('#ffb4e6'), emissiveIntensity: 3 }))
  head.position.set(-side * 1.2, 5.48, 0)
  group.add(head)
  const g = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), glowMaterial(glow, '#ff8ad8', 0.28))
  g.position.set(-side * 1.2, 5.4, 0.05)
  group.add(g)
  return group
}

/** Tall blocker (switch lanes): a huge fractured asteroid boulder with a chunk of twisted hull plating. */
export function buildBlock(chev: THREE.Texture, metal: THREE.Material) {
  void chev
  void metal
  const seed = _rockSeed++ + 100
  const group = new THREE.Group()
  const mat = rockMaterial()
  const big = new THREE.Mesh(rockGeometry(seed, 0.95, 1.3, 0.9, 3), mat)
  big.position.y = 1.25
  big.rotation.y = seed
  group.add(big)
  const small = new THREE.Mesh(rockGeometry(seed + 3, 0.5, 0.42, 0.5), mat)
  small.position.set(0.55, 0.38, 0.45)
  group.add(small)
  const plate = new THREE.MeshStandardMaterial({ color: '#3b3f4a', metalness: 0.9, roughness: 0.48, side: THREE.DoubleSide })
  const hull = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6, 4, 3), plate)
  const hp = hull.geometry.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < hp.count; i++) hp.setZ(i, Math.sin(hp.getX(i) * 4 + seed) * 0.08)
  hull.geometry.computeVertexNormals()
  hull.position.set(-0.45, 0.5, 0.75)
  hull.rotation.set(-0.3, 0.4, 0.5)
  group.add(hull)
  const lampMat = new THREE.MeshStandardMaterial({ color: '#2a0806', emissive: new THREE.Color('#ff3b1f'), emissiveIntensity: 1.6 })
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), lampMat)
  lamp.position.set(-0.3, 0.66, 0.86)
  group.add(lamp)
  return { group, lamp: lampMat }
}
