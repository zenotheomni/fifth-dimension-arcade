/** Fifth Gear — procedural props: shooting stars, modern sports coupe, barriers, gantries, gaps, power-ups, palms, gates, lamps. */
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

export function buildBarrier(chev: THREE.Texture, metal: THREE.Material) {
  const group = new THREE.Group()
  const faceMat = new THREE.MeshStandardMaterial({ map: chev, roughness: 0.5, emissive: new THREE.Color('#ff3d5a'), emissiveMap: chev, emissiveIntensity: 0.55 })
  const plank = new THREE.Mesh(box(1.6, 0.3, 0.07), faceMat)
  plank.position.y = 0.58
  group.add(plank)
  const plank2 = new THREE.Mesh(box(1.6, 0.18, 0.07), faceMat)
  plank2.position.y = 0.24
  group.add(plank2)
  for (const x of [-0.7, 0.7]) {
    for (const dz of [-0.16, 0.16]) {
      const leg = new THREE.Mesh(box(0.06, 0.76, 0.05), metal)
      leg.position.set(x, 0.37, dz)
      leg.rotation.x = dz > 0 ? -0.22 : 0.22
      group.add(leg)
    }
  }
  const lamp = new THREE.MeshStandardMaterial({ color: '#ffb020', emissive: new THREE.Color('#ffa000'), emissiveIntensity: 3 })
  for (const x of [-0.62, 0.62]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), lamp)
    l.position.set(x, 0.8, 0)
    group.add(l)
  }
  return { group, lamp }
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
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.9), glowMaterial(glow, '#00e0d0', 0.35))
  halo.position.set(0, 1.26, 0.2)
  group.add(halo)
  return { group }
}

/** Road gap: pseudo-depth void with a synthwave grid far below + glowing broken edges. */
export function buildGap(glow: THREE.Texture) {
  const group = new THREE.Group()
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    vertexShader: /* glsl */ `
      varying vec3 vW; varying vec2 vUv;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vW; varying vec2 vUv; uniform float uTime;
      void main(){
        vec3 rd = normalize(vW - cameraPosition);
        float depth = 7.0;
        vec3 p = vW + rd * (depth / max(0.05, -rd.y));
        vec2 g = abs(fract(p.xz * vec2(0.9, 0.6)) - 0.5);
        float grid = 1.0 - smoothstep(0.0, 0.06, min(g.x, g.y));
        vec3 col = vec3(0.012, 0.004, 0.03) + vec3(0.0, 0.7, 0.75) * grid * 0.55;
        // inner walls: darker near the edges
        float wall = smoothstep(0.0, 0.18, min(vUv.y, 1.0 - vUv.y)) * smoothstep(0.0, 0.08, min(vUv.x, 1.0 - vUv.x));
        col *= wall;
        col += vec3(0.6, 0.08, 0.3) * (1.0 - wall) * 0.25;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
  hole.rotation.x = -Math.PI / 2
  hole.position.y = 0.005
  group.add(hole)
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#f55', emissive: new THREE.Color('#ff3d5a'), emissiveIntensity: 3.5 })
  const near = new THREE.Mesh(box(1, 0.05, 0.06), edgeMat)
  const far = new THREE.Mesh(box(1, 0.05, 0.06), edgeMat)
  group.add(near, far)
  const nearGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.8), glowMaterial(glow, '#ff3d5a', 0.6))
  nearGlow.rotation.x = -Math.PI / 2
  nearGlow.position.y = 0.02
  group.add(nearGlow)
  return { group, hole, near, far, nearGlow, mat }
}

export function buildPickup(kind: 'hand', glow: THREE.Texture, _emblem: THREE.Texture | null) {
  void kind
  const group = new THREE.Group()
  const spin = new THREE.Group()
  spin.position.y = 1.0
  group.add(spin)
  const color = '#c9a0ff'
  // Open hand / five-fingers silhouette (🖐️ vibe) — palm disc + five finger capsules
  const palmMat = new THREE.MeshStandardMaterial({
    color: '#f2d9c8',
    emissive: new THREE.Color('#b48cff'),
    emissiveIntensity: 0.55,
    roughness: 0.55,
    metalness: 0.15,
  })
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), palmMat)
  palm.scale.set(1.05, 1.15, 0.55)
  spin.add(palm)
  const fingerMat = new THREE.MeshStandardMaterial({
    color: '#f6e0d2',
    emissive: new THREE.Color('#9a6dff'),
    emissiveIntensity: 0.4,
    roughness: 0.5,
  })
  const spreads = [-0.34, -0.17, 0, 0.17, 0.34]
  spreads.forEach((x, i) => {
    const len = i === 2 ? 0.42 : i === 0 || i === 4 ? 0.32 : 0.38
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, len, 4, 8), fingerMat)
    f.position.set(x, 0.28 + len * 0.35, 0.02)
    f.rotation.z = -x * 0.55
    spin.add(f)
  })
  // thumb
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.28, 4, 8), fingerMat)
  thumb.position.set(-0.32, 0.05, 0.06)
  thumb.rotation.z = 1.1
  spin.add(thumb)

  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), glowMaterial(glow, color, 0.65))
  halo.position.y = 1.0
  group.add(halo)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.62, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.03
  group.add(ring)
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 7, 20, 1, true),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uColor; varying float vY; void main(){ gl_FragColor = vec4(uColor * (1.0 - vY) * 0.55, 1.0); }',
    }),
  )
  beam.position.y = 3.5
  group.add(beam)
  return { group, spin, halo, ring }
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
    const m = new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(c), emissiveIntensity: 3.2 })
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
    const h = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), glowMaterial(glow, '#ffc83c', 0.4))
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
  const head = new THREE.Mesh(box(0.5, 0.08, 0.22), new THREE.MeshStandardMaterial({ color: '#fde', emissive: new THREE.Color('#ffb4e6'), emissiveIntensity: 4 }))
  head.position.set(-side * 1.2, 5.48, 0)
  group.add(head)
  const g = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), glowMaterial(glow, '#ff8ad8', 0.55))
  g.position.set(-side * 1.2, 5.4, 0.05)
  group.add(g)
  return group
}
