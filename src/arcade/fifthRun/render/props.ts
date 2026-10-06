/** Fifth Run — procedural props: shooting stars, ’59-style Cadillac, barriers, gantries, gaps, power-ups, palms, gates, lamps. */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { addRim, glowMaterial } from './shaders'

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

export const CAR_COLORS = ['#c8102e', '#ff8fb8', '#f2efe6', '#25cfc4', '#6b2fd6', '#141018']

function shapeFrom(pts: [number, number][]) {
  const s = new THREE.Shape()
  s.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1])
  s.closePath()
  return s
}

function extrudeSide(pts: [number, number][], width: number, bevel = 0.04) {
  const g = new THREE.ExtrudeGeometry(shapeFrom(pts), {
    depth: width,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    steps: 1,
  })
  // shape x → world z, extrude axis → world x (centred)
  g.rotateY(-Math.PI / 2)
  g.translate(width / 2, 0, 0)
  return g
}

export type CarParts = { group: THREE.Group; paint: THREE.MeshStandardMaterial; tail: THREE.MeshStandardMaterial; head: THREE.MeshStandardMaterial }

/** ’59 Eldorado-inspired land yacht: long low body, towering fins, twin bullet tail lights. Rear faces +Z. */
export function buildCar(shared: { chrome: THREE.Material; glass: THREE.Material; tire: THREE.Material; white: THREE.Material; glow: THREE.Texture }): CarParts {
  const group = new THREE.Group()
  const paint = new THREE.MeshStandardMaterial({ color: '#c8102e', metalness: 0.35, roughness: 0.3, envMapIntensity: 0.55 })
  const tail = new THREE.MeshStandardMaterial({ color: '#ff2030', emissive: new THREE.Color('#ff1a2a'), emissiveIntensity: 4.5, roughness: 0.3 })
  const head = new THREE.MeshStandardMaterial({ color: '#fff6e0', emissive: new THREE.Color('#fff2d0'), emissiveIntensity: 0, roughness: 0.2 })
  const W = 1.9
  // lower body (z: −2.7 front … +2.7 rear)
  const body = extrudeSide(
    [
      [-2.72, 0.3],
      [-2.72, 0.7],
      [-2.4, 0.78],
      [-1.0, 0.84],
      [1.9, 0.88],
      [2.72, 0.86],
      [2.72, 0.32],
      [2.2, 0.26],
      [-2.3, 0.26],
    ],
    W,
  )
  group.add(new THREE.Mesh(body, paint))
  // greenhouse (glass + thin pillars) — narrower
  const cabin = extrudeSide(
    [
      [-0.8, 0.86],
      [-0.25, 1.36],
      [0.85, 1.38],
      [1.35, 0.9],
    ],
    W - 0.28,
    0.03,
  )
  group.add(new THREE.Mesh(cabin, shared.glass))
  const roof = extrudeSide(
    [
      [-0.3, 1.33],
      [-0.22, 1.4],
      [0.85, 1.42],
      [0.92, 1.35],
    ],
    W - 0.24,
    0.02,
  )
  group.add(new THREE.Mesh(roof, paint))
  // fins
  for (const side of [-1, 1]) {
    const fin = extrudeSide(
      [
        [0.9, 0.86],
        [2.74, 1.22],
        [2.76, 1.12],
        [2.74, 0.86],
      ],
      0.14,
      0.02,
    )
    fin.translate(side * (W / 2 - 0.08), 0, 0)
    group.add(new THREE.Mesh(fin, paint))
    // twin bullet tail lights
    for (const y of [1.02, 0.93]) {
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.1, 3, 8), tail)
      b.rotation.x = Math.PI / 2
      b.position.set(side * (W / 2 - 0.08), y, 2.78)
      group.add(b)
    }
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), glowMaterial(shared.glow, '#ff2a3a', 0.85))
    halo.position.set(side * (W / 2 - 0.08), 0.98, 2.86)
    halo.userData.tailGlow = true
    group.add(halo)
    // headlights (front, quad)
    for (const x of [0.55, 0.78]) {
      const h = new THREE.Mesh(new THREE.CircleGeometry(0.075, 12), head)
      h.position.set(side * x, 0.66, -2.78)
      h.rotation.y = Math.PI
      group.add(h)
    }
    // side chrome strip
    const strip = new THREE.Mesh(box(0.02, 0.03, 4.6), shared.chrome)
    strip.position.set(side * (W / 2 + 0.05), 0.66, 0.1)
    group.add(strip)
  }
  // chrome bumpers
  const rb = new THREE.Mesh(box(W + 0.08, 0.16, 0.14), shared.chrome)
  rb.position.set(0, 0.42, 2.78)
  group.add(rb)
  const fb = new THREE.Mesh(box(W + 0.08, 0.18, 0.14), shared.chrome)
  fb.position.set(0, 0.44, -2.78)
  group.add(fb)
  const grille = new THREE.Mesh(box(1.3, 0.16, 0.04), shared.chrome)
  grille.position.set(0, 0.6, -2.76)
  group.add(grille)
  // wheels with whitewalls
  const wheelG = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 18)
  wheelG.rotateZ(Math.PI / 2)
  const wwG = new THREE.TorusGeometry(0.25, 0.05, 6, 18)
  wwG.rotateY(Math.PI / 2)
  for (const z of [-1.75, 1.55]) {
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(wheelG, shared.tire)
      w.position.set(side * 0.84, 0.36, z)
      group.add(w)
      const ww = new THREE.Mesh(wwG, shared.white)
      ww.position.set(side * 0.97, 0.36, z)
      group.add(ww)
    }
  }
  return { group, paint, tail, head }
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

export function buildPickup(kind: 'magnet' | 'five' | 'shield', glow: THREE.Texture, emblem: THREE.Texture | null) {
  const group = new THREE.Group()
  const spin = new THREE.Group()
  spin.position.y = 1.0
  group.add(spin)
  let color = '#ff3d5a'
  if (kind === 'magnet') {
    const red = new THREE.MeshStandardMaterial({ color: '#e0203a', emissive: new THREE.Color('#ff2040'), emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.3 })
    const silver = new THREE.MeshStandardMaterial({ color: '#e8eef8', metalness: 1, roughness: 0.15, emissive: new THREE.Color('#9cf'), emissiveIntensity: 0.4 })
    const u = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.085, 10, 22, Math.PI), red)
    u.rotation.z = Math.PI
    spin.add(u)
    for (const x of [-0.24, 0.24]) {
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.086, 0.16, 12), silver)
      tip.position.set(x, 0.08, 0)
      spin.add(tip)
    }
  } else if (kind === 'five') {
    color = '#ffc83c'
    const rim = new THREE.MeshStandardMaterial({ color: '#ffcf4a', metalness: 1, roughness: 0.2, emissive: new THREE.Color('#ff9a00'), emissiveIntensity: 0.8 })
    const face = new THREE.MeshStandardMaterial({ color: '#ffffff', map: emblem ?? undefined, emissive: new THREE.Color('#ffd27a'), emissiveMap: emblem ?? undefined, emissiveIntensity: emblem ? 1.1 : 0.6, transparent: true })
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.07, 32), rim)
    coin.rotation.x = Math.PI / 2
    spin.add(coin)
    for (const z of [0.04, -0.04]) {
      const f = new THREE.Mesh(new THREE.CircleGeometry(0.34, 32), face)
      f.position.z = z
      if (z < 0) f.rotation.y = Math.PI
      spin.add(f)
    }
  } else {
    color = '#00e0d0'
    const cage = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.42, 1),
      new THREE.MeshStandardMaterial({ color: '#4ff', emissive: new THREE.Color('#00e0d0'), emissiveIntensity: 2.2, wireframe: true }),
    )
    spin.add(cage)
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: '#bff', emissive: new THREE.Color('#5ff'), emissiveIntensity: 1.6, transparent: true, opacity: 0.8 }))
    spin.add(core)
  }
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
