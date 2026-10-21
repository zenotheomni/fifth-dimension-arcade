/**
 * Fifth Dimension obstacle props (replace the old crates, rocks and Cadillac wrecks):
 *  - buildCrystal   (kind 'block'):  a cluster of faceted energy-crashed rockets, ~2.6 m tall
 *  - buildSatellite (kind 'car'):    a crashed satellite lying across the lane: foil-wrapped bus, bent
 *                                    solar wings, dish and antenna, sparking — 5.4 m long, 1.5 m tall
 *  - buildTruss     (kind 'overhead'): a fallen lattice gantry / satellite arm — a real steel truss you
 *                                    duck under: bottom chord at head height (1.2 m), the lattice above it
 *                                    up to ~3.4 m, an energy strip glowing under the low chord.
 * Sizes match the sim hit boxes (OB in sim/constants).
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { addRim, glowMaterial } from './shaders'
import { dentGeometry, hullTextures } from './hull'

let seedN = 1
const rnd = () => {
  seedN = (seedN * 16807) % 2147483647
  return seedN / 2147483647
}

function crystalGeo(r: number, h: number) {
  // hexagonal prism with a pointed, slightly skewed tip
  const g = new THREE.CylinderGeometry(r * 0.75, r, h, 6, 1)
  g.translate(0, h / 2, 0)
  const tip = new THREE.ConeGeometry(r * 0.75, h * 0.35, 6)
  tip.translate(0, h + h * 0.175, 0)
  const m = mergeGeometries([g.toNonIndexed(), tip.toNonIndexed()])!
  m.computeVertexNormals()
  return m
}

export function buildCrystal(glow: THREE.Texture) {
  const group = new THREE.Group()
  const core = addRim(
    new THREE.MeshPhysicalMaterial({ color: '#7a3cff', emissive: new THREE.Color('#5a1cff'), emissiveIntensity: 0.9, metalness: 0.1, roughness: 0.08, transmission: 0, clearcoat: 1, clearcoatRoughness: 0.05, flatShading: true }),
    new THREE.Color('#d6b8ff'),
    1.4,
    2.0,
  )
  const pale = addRim(
    new THREE.MeshPhysicalMaterial({ color: '#33d6ff', emissive: new THREE.Color('#0aa8d8'), emissiveIntensity: 0.7, roughness: 0.1, clearcoat: 1, flatShading: true }),
    new THREE.Color('#c8f6ff'),
    1.2,
    2.0,
  )
  const spec: [number, number, number, number, number, number, THREE.Material][] = [
    [0, 0, 0.36, 1.95, 0, 0, core],
    [-0.45, 0.2, 0.24, 1.25, 0.2, -0.25, pale],
    [0.5, -0.15, 0.22, 1.1, -0.15, 0.3, core],
    [0.15, 0.45, 0.18, 0.8, 0.35, 0.1, pale],
    [-0.2, -0.5, 0.17, 0.7, -0.3, -0.2, core],
  ]
  for (const [x, z, r, h, rx, rz, m] of spec) {
    const c = new THREE.Mesh(crystalGeo(r, h), m)
    c.position.set(x, 0, z)
    c.rotation.set(rx, rnd() * 6, rz)
    group.add(c)
  }
  // dark basalt base it grew from
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.18, 9), new THREE.MeshStandardMaterial({ color: '#16121c', roughness: 0.9 }))
  base.position.y = 0.09
  group.add(base)
  const lampMat = new THREE.MeshStandardMaterial({ color: '#200a40', emissive: new THREE.Color('#b080ff'), emissiveIntensity: 1.6 })
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.4), glowMaterial(glow, '#9a5cff', 0.35))
  halo.position.set(0, 1.4, 0.6)
  group.add(halo)
  return { group, lamp: lampMat }
}


/** Fallen lattice truss to duck under (the low chord's underside is at OB.overhead.bottom = 1.2 m). */
export function buildTruss(glow: THREE.Texture) {
  const group = new THREE.Group()
  const steel = addRim(new THREE.MeshStandardMaterial({ color: '#5d6270', metalness: 0.9, roughness: 0.38 }), new THREE.Color('#ffb070'), 0.5, 2.6)
  const rust = new THREE.MeshStandardMaterial({ color: '#4a2e22', metalness: 0.6, roughness: 0.7 })
  const W = 2.3
  const lo = 1.32
  const hi = 3.3
  const chord = (y: number, z: number) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, 0.2), steel)
    c.position.set(0, y, z)
    group.add(c)
  }
  chord(lo, 0.18)
  chord(lo, -0.18)
  chord(hi, 0.18)
  chord(hi, -0.18)
  // diagonal lattice between the chords (zig-zag), front and back
  const N = 6
  for (const z of [0.18, -0.18]) {
    for (let i = 0; i < N; i++) {
      const x0 = -W / 2 + (W / N) * i
      const x1 = x0 + W / N
      const up = i % 2 === 0
      const a = new THREE.Vector3(x0, up ? lo : hi, z)
      const b = new THREE.Vector3(x1, up ? hi : lo, z)
      const len = a.distanceTo(b)
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 6), i % 3 === 1 ? rust : steel)
      d.position.copy(a).add(b).multiplyScalar(0.5)
      d.lookAt(b)
      d.rotateX(Math.PI / 2)
      group.add(d)
    }
  }
  // it fell onto two broken pylons at the deck edges
  for (const x of [-W / 2 - 0.05, W / 2 + 0.05]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.28, lo, 0.32), new THREE.MeshStandardMaterial({ color: '#211d28', metalness: 0.7, roughness: 0.45 }))
    p.position.set(x, lo / 2 - 0.05, 0)
    p.rotation.z = x < 0 ? 0.05 : -0.04
    group.add(p)
  }
  // hanging cable + energy strip glowing under the low chord (marks the head-height edge)
  const strip = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, 0.42), new THREE.MeshBasicMaterial({ color: '#ffb347' }))
  strip.position.y = lo - 0.12
  group.add(strip)
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(W + 1, 0.9), glowMaterial(glow, '#ff9a2a', 0.7))
  halo.position.set(0, lo - 0.12, 0.25)
  group.add(halo)
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.6, lo, 0.2), new THREE.Vector3(0.75, lo - 0.05, 0.22), new THREE.Vector3(0.9, lo + 0.05, 0.2)]), 8, 0.02, 5), new THREE.MeshStandardMaterial({ color: '#111' }))
  group.add(cable)
  return { group }
}

/**
 * v16: a crashed rocket — nose buried in a cracked, broken deck, tail and fins up at 50–65°, dented
 * scorched hull (PBR: brushed metal map + panel seams + rivets + soot, bump + roughness maps), a torn
 * nozzle glowing from inside, a small flickering fire and rising smoke. Yaw / lean / tilt vary per
 * obstacle (`pose`). Everything stays inside the old pylon footprint (OB.block: ±0.85 × 1.6 × 2.6 m).
 */
let crackTex: THREE.CanvasTexture | null = null
function crackTexture() {
  if (crackTex) return crackTex
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const x = c.getContext('2d')!
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(8,5,4,1)')
  g.addColorStop(0.35, 'rgba(20,12,10,0.95)')
  g.addColorStop(0.75, 'rgba(20,14,12,0.5)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  x.fillStyle = g
  x.fillRect(0, 0, S, S)
  for (let i = 0; i < 26; i++) {
    let px = S / 2
    let py = S / 2
    let ang = (i / 26) * Math.PI * 2 + rnd() * 0.3
    x.beginPath()
    x.moveTo(px, py)
    const len = S * (0.22 + rnd() * 0.26)
    for (let d = 0; d < len; d += 10) {
      ang += (rnd() - 0.5) * 0.5
      px += Math.cos(ang) * 10
      py += Math.sin(ang) * 10
      x.lineTo(px, py)
    }
    x.strokeStyle = `rgba(255,${90 + rnd() * 60},20,${0.55 + rnd() * 0.4})`
    x.lineWidth = 1.5 + rnd() * 2.5
    x.stroke()
  }
  crackTex = new THREE.CanvasTexture(c)
  crackTex.colorSpace = THREE.SRGBColorSpace
  crackTex.anisotropy = 8
  return crackTex
}

const FLAME_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }'
const FLAME_FRAG = /* glsl */ `uniform float uTime; uniform float uSeed; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec2 q = vUv; float t = uTime * 2.6 + uSeed;
  float w = n(vec2(q.x * 5.0, q.y * 4.0 - t * 1.7)) * 0.6 + n(vec2(q.x * 11.0, q.y * 9.0 - t * 2.9)) * 0.4;
  float shape = smoothstep(0.5, 0.0, abs(q.x - 0.5) * (1.4 + q.y * 1.8)) * smoothstep(1.0, 0.15, q.y + w * 0.35);
  float core = smoothstep(0.35, 0.0, abs(q.x - 0.5) * 2.4) * smoothstep(0.6, 0.0, q.y);
  vec3 col = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.75, 0.3), core) * (shape * 2.2);
  gl_FragColor = vec4(col * smoothstep(0.0, 0.08, q.y), 1.0);
}`

let smokeTex: THREE.CanvasTexture | null = null
function smokeTexture() {
  if (smokeTex) return smokeTex
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const x = c.getContext('2d')!
  for (let i = 0; i < 18; i++) {
    const px = S / 2 + (rnd() - 0.5) * S * 0.4
    const py = S / 2 + (rnd() - 0.5) * S * 0.4
    const r = S * (0.15 + rnd() * 0.2)
    const g = x.createRadialGradient(px, py, 0, px, py, r)
    g.addColorStop(0, 'rgba(255,255,255,0.22)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = g
    x.fillRect(0, 0, S, S)
  }
  smokeTex = new THREE.CanvasTexture(c)
  return smokeTex
}

export function buildRocket(glow: THREE.Texture) {
  const group = new THREE.Group()
  // ── impact: scorched crater decal with glowing cracks + torn deck plates ──
  const crater = new THREE.Mesh(new THREE.CircleGeometry(1.0, 40), new THREE.MeshStandardMaterial({ map: crackTexture(), transparent: true, depthWrite: false, roughness: 0.9, emissive: new THREE.Color('#ff5a14'), emissiveMap: crackTexture(), emissiveIntensity: 0.9 }))
  crater.rotation.x = -Math.PI / 2
  crater.position.y = 0.012
  group.add(crater)
  const plateMat = new THREE.MeshStandardMaterial({ color: '#1c1a20', metalness: 0.6, roughness: 0.55 })
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#2a2320', metalness: 0.5, emissive: new THREE.Color('#ff4a10'), emissiveIntensity: 0.12, roughness: 0.7 })
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.4
    const w = 0.28 + rnd() * 0.22
    const pl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.2 + rnd() * 0.15), i % 3 === 0 ? edgeMat : plateMat)
    pl.position.set(Math.cos(a) * 0.42, 0.06 + rnd() * 0.05, Math.sin(a) * 0.42)
    pl.rotation.set((rnd() - 0.5) * 0.9, -a, 0.35 + rnd() * 0.5)
    group.add(pl)
  }
  // ── rocket (pivot at the impact point; +Y = from the buried nose up to the tail) ──
  const pivot = new THREE.Group()
  group.add(pivot)
  const tex = hullTextures('rocket', { base: '#a8a49b', brush: 0.6, panelsU: 8, panelsV: 6, rivets: true, soot: 2.2, seed: 59 })
  const hullMat = addRim(new THREE.MeshStandardMaterial({ map: tex.map, bumpMap: tex.bump, bumpScale: 2.2, roughnessMap: tex.rough, roughness: 0.78, metalness: 0.7, envMapIntensity: 0.75, color: '#a29d95' }), new THREE.Color('#ffb27a'), 0.25, 3.0)
  const R0 = 0.24
  const prof: THREE.Vector2[] = []
  // ogive nose (buried) → body → boat tail
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    prof.push(new THREE.Vector2(R0 * Math.sqrt(1 - (1 - t) * (1 - t)), -0.55 + t * 0.6))
  }
  prof.push(new THREE.Vector2(R0, 0.6), new THREE.Vector2(R0, 1.55), new THREE.Vector2(R0 * 0.92, 1.72), new THREE.Vector2(R0 * 0.8, 1.8))
  const bodyGeo = dentGeometry(new THREE.LatheGeometry(prof, 48), 7, 0.035)
  const body = new THREE.Mesh(bodyGeo, hullMat)
  pivot.add(body)
  // painted band + stencil stripe
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R0 + 0.004, R0 + 0.004, 0.12, 48, 1, true), new THREE.MeshStandardMaterial({ color: '#8e2a20', metalness: 0.4, roughness: 0.6 }))
  band.position.y = 1.25
  pivot.add(band)
  // fins: bevelled, scorched, one bent
  const finShape = new THREE.Shape()
  // swept, trapezoidal fins (smaller than the hull is wide)
  finShape.moveTo(0, 0)
  finShape.lineTo(0.2, 0.12)
  finShape.lineTo(0.22, 0.36)
  finShape.lineTo(0.0, 0.46)
  finShape.closePath()
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 4 })
  finGeo.translate(0, 0, -0.0175)
  const finMat = new THREE.MeshStandardMaterial({ map: tex.map, color: '#4a4640', metalness: 0.75, roughness: 0.62, bumpMap: tex.bump, bumpScale: 1.5 })
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(finGeo, finMat)
    const a = (i / 4) * Math.PI * 2
    f.position.set(Math.cos(a) * R0 * 0.95, 1.34, Math.sin(a) * R0 * 0.95)
    f.rotation.set(0, -a, i === 2 ? 0.45 : 0)
    pivot.add(f)
  }
  // torn nozzle bell: blued, heat-stained, glowing inside
  const bellMat = new THREE.MeshStandardMaterial({ color: '#3d3a48', metalness: 0.95, roughness: 0.32, side: THREE.DoubleSide, emissive: new THREE.Color('#ff3c08'), emissiveIntensity: 0.25 })
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.2, 0.3, 40, 1, true, 0.4, Math.PI * 2 - 0.9), bellMat)
  bell.position.y = 1.93
  pivot.add(bell)
  const lamp = new THREE.MeshStandardMaterial({ color: '#200400', emissive: new THREE.Color('#ff6a1a'), emissiveIntensity: 2.4, side: THREE.DoubleSide })
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), lamp)
  inner.rotation.x = -Math.PI / 2
  inner.position.y = 1.86
  pivot.add(inner)
  const heat = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), glowMaterial(glow, '#ff6020', 0.5))
  heat.position.y = 2.05
  pivot.add(heat)
  // fire out of the broken nozzle: two crossed animated flame sheets
  const flameMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uSeed: { value: rnd() * 10 } }, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG })
  for (const ry of [0, Math.PI / 2]) {
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.75), flameMat)
    fl.position.y = 2.3
    fl.rotation.y = ry
    pivot.add(fl)
  }
  // impact glow halo on the deck
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0), glowMaterial(glow, '#ff5a18', 0.4))
  halo.rotation.x = -Math.PI / 2
  halo.position.y = 0.03
  group.add(halo)
  // smoke: soft sprites that rise from the nozzle and fade (animated in pose)
  const smokes: THREE.Sprite[] = []
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture(), color: '#5d5862', transparent: true, depthWrite: false, opacity: 0.4 }))
    group.add(sp)
    smokes.push(sp)
  }
  const tail = new THREE.Vector3()
  const pose = (variant: number, time: number) => {
    // 50–65° up from the deck, leaning a random way; impact offset so the whole thing stays centred
    const up = THREE.MathUtils.degToRad(50 + (variant % 16))
    const tilt = Math.PI / 2 - up
    const lean = ((variant >> 4) % 8) * (Math.PI / 4) + 0.3
    pivot.rotation.order = 'YXZ'
    pivot.rotation.set(-tilt, lean, 0)
    // horizontal reach of the visible body (impact → tail): centre it on the obstacle footprint
    tail.set(0, 1.8, 0).applyEuler(pivot.rotation)
    const dx = tail.x * 0.5
    const dz = tail.z * 0.5
    pivot.position.set(-dx, 0, -dz)
    crater.position.set(-dx, 0.012, -dz)
    halo.position.set(-dx, 0.03, -dz)
    pivot.updateMatrix()
    tail.set(0, 2.3, 0).applyMatrix4(pivot.matrix)
    flameMat.uniforms.uTime.value = time
    for (let i = 0; i < smokes.length; i++) {
      const k = (time * 0.45 + i / smokes.length) % 1
      smokes[i].position.set(tail.x + k * 0.5, tail.y + k * 1.6, tail.z - k * 0.2)
      smokes[i].scale.setScalar(0.5 + k * 1.4)
      smokes[i].material.opacity = 0.42 * Math.sin(Math.PI * k)
    }
  }
  pose(0, 0)
  group.traverse((o) => (o.frustumCulled = false))
  return { group, lamp, pose }
}

/**
 * v17: the lane obstacle is a realistic coconut palm standing on the runway (replaces the rocket):
 * ringed, curved trunk (bark map + bump), a full crown of drooping pinnate fronds (alpha leaf map,
 * yellowing tips), a coconut cluster, planted in a small patch of cracked, upheaved deck tiles.
 * Same footprint as before (OB.block); `pose` varies yaw / bend per obstacle. No fire, no smoke.
 */
let barkTex: THREE.CanvasTexture | null = null
let leafTex: THREE.CanvasTexture | null = null
let soilTex: THREE.CanvasTexture | null = null
function palmTextures() {
  if (barkTex && leafTex && soilTex) return { bark: barkTex, leaf: leafTex, soil: soilTex }
  // bark: grey-brown with leaf-scar rings and fibrous streaks
  {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 1024
    const x = c.getContext('2d')!
    x.fillStyle = '#6b5a48'
    x.fillRect(0, 0, 256, 1024)
    for (let i = 0; i < 900; i++) {
      const v = 70 + rnd() * 70
      x.fillStyle = `rgba(${v},${v * 0.85},${v * 0.68},0.25)`
      x.fillRect(rnd() * 256, rnd() * 1024, 1 + rnd() * 2, 6 + rnd() * 30)
    }
    for (let y = 0; y < 1024; y += 26 + rnd() * 10) {
      x.fillStyle = 'rgba(30,22,16,0.75)'
      x.fillRect(0, y, 256, 3 + rnd() * 2)
      x.fillStyle = 'rgba(170,150,120,0.35)'
      x.fillRect(0, y + 4, 256, 2)
    }
    barkTex = new THREE.CanvasTexture(c)
    barkTex.colorSpace = THREE.SRGBColorSpace
    barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping
    barkTex.anisotropy = 8
  }
  // frond: pinnate leaflets either side of a midrib (alpha), deep green → yellow-brown at the tip
  {
    const W = 256
    const H = 1024
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const x = c.getContext('2d')!
    x.clearRect(0, 0, W, H)
    for (let y = 30; y < H - 10; y += 9) {
      const t = y / H
      const len = (W / 2 - 6) * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)) * (0.85 + rnd() * 0.15)
      const g = Math.round(95 + 40 * t + rnd() * 20)
      const r = Math.round(40 + 120 * Math.max(0, t - 0.75) * 4 * 0.25 + rnd() * 15)
      x.strokeStyle = `rgb(${r},${g},${Math.round(35 + rnd() * 15)})`
      x.lineWidth = 4 + rnd() * 2
      for (const side of [-1, 1]) {
        x.beginPath()
        x.moveTo(W / 2, y)
        x.quadraticCurveTo(W / 2 + side * len * 0.5, y + 8, W / 2 + side * len, y + 26 + rnd() * 10)
        x.stroke()
      }
    }
    x.strokeStyle = '#8a7a45'
    x.lineWidth = 6
    x.beginPath()
    x.moveTo(W / 2, 0)
    x.lineTo(W / 2, H)
    x.stroke()
    leafTex = new THREE.CanvasTexture(c)
    leafTex.colorSpace = THREE.SRGBColorSpace
    leafTex.anisotropy = 8
  }
  // planting patch: dark soil with cracked tile edges
  {
    const S = 512
    const c = document.createElement('canvas')
    c.width = c.height = S
    const x = c.getContext('2d')!
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    g.addColorStop(0, 'rgba(40,30,22,1)')
    g.addColorStop(0.45, 'rgba(48,36,26,0.95)')
    g.addColorStop(0.8, 'rgba(25,20,22,0.55)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    x.fillStyle = g
    x.fillRect(0, 0, S, S)
    for (let i = 0; i < 18; i++) {
      let px = S / 2
      let py = S / 2
      let a = (i / 18) * Math.PI * 2 + rnd() * 0.3
      x.beginPath()
      x.moveTo(px, py)
      for (let d = 0; d < S * (0.25 + rnd() * 0.2); d += 9) {
        a += (rnd() - 0.5) * 0.5
        px += Math.cos(a) * 9
        py += Math.sin(a) * 9
        x.lineTo(px, py)
      }
      x.strokeStyle = 'rgba(8,6,6,0.85)'
      x.lineWidth = 1.5 + rnd() * 2
      x.stroke()
    }
    soilTex = new THREE.CanvasTexture(c)
    soilTex.colorSpace = THREE.SRGBColorSpace
  }
  return { bark: barkTex!, leaf: leafTex!, soil: soilTex! }
}

/** a frond: a ribbon along a drooping arc, wider in the middle, slightly V-folded */
function frondGeometry(len: number, width: number, droop: number) {
  const N = 14
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const z = len * t
    const y = len * (0.35 * t - droop * t * t)
    const w = width * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95))
    const fold = w * 0.18
    pos.push(-w / 2, y + fold, z, 0, y, z, w / 2, y + fold, z)
    uv.push(0, t, 0.5, t, 1, t)
    if (i < N) {
      const a = i * 3
      idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

export function buildPalmObstacle() {
  const group = new THREE.Group()
  const tx = palmTextures()
  // planting patch + upheaved tiles
  const patch = new THREE.Mesh(new THREE.CircleGeometry(0.95, 40), new THREE.MeshStandardMaterial({ map: tx.soil, transparent: true, depthWrite: false, roughness: 0.95 }))
  patch.rotation.x = -Math.PI / 2
  patch.position.y = 0.012
  group.add(patch)
  const tileMat = new THREE.MeshStandardMaterial({ color: '#2a2433', metalness: 0.3, roughness: 0.6 })
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rnd() * 0.35
    const tile = new THREE.Mesh(new THREE.BoxGeometry(0.3 + rnd() * 0.18, 0.05, 0.2 + rnd() * 0.12), tileMat)
    tile.position.set(Math.cos(a) * 0.55, 0.05 + rnd() * 0.04, Math.sin(a) * 0.55)
    tile.rotation.set((rnd() - 0.5) * 0.6, -a, 0.25 + rnd() * 0.35)
    group.add(tile)
  }
  const pivot = new THREE.Group()
  group.add(pivot)
  // trunk: tapered, ringed, bent along a gentle curve
  const H = 3.9
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.21, H, 18, 40)
  trunkGeo.translate(0, H / 2, 0)
  const p = trunkGeo.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    const t = y / H
    const ring = 1 + 0.06 * Math.max(0, Math.sin(t * 150)) // leaf-scar ridges
    const flare = 1 + 0.5 * Math.max(0, 0.12 - t) * 8 // root flare at the base
    p.setX(i, p.getX(i) * ring * flare + 0.55 * t * t)
    p.setZ(i, p.getZ(i) * ring * flare)
  }
  trunkGeo.computeVertexNormals()
  const bark = tx.bark.clone()
  bark.needsUpdate = true
  bark.repeat.set(2, 3)
  const trunk = new THREE.Mesh(trunkGeo, new THREE.MeshStandardMaterial({ map: bark, bumpMap: bark, bumpScale: 3, roughness: 0.92, color: '#b5a693' }))
  pivot.add(trunk)
  // crown: fibrous boot + coconuts + fronds
  const top = new THREE.Vector3(0.55, H, 0)
  const boot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: '#5a4a30', roughness: 1 }))
  boot.position.copy(top).add(new THREE.Vector3(0, -0.08, 0))
  boot.scale.set(1, 0.8, 1)
  pivot.add(boot)
  const nutMat = new THREE.MeshStandardMaterial({ color: '#4b5a22', roughness: 0.55 })
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), nutMat)
    n.position.copy(top).add(new THREE.Vector3(Math.cos(a) * 0.17, -0.24 - (i % 2) * 0.06, Math.sin(a) * 0.17))
    n.scale.set(1, 1.15, 1)
    pivot.add(n)
  }
  const leafMat = new THREE.MeshStandardMaterial({ map: tx.leaf, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.68, color: '#cfe0b0' })
  const leafOld = new THREE.MeshStandardMaterial({ map: tx.leaf, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, color: '#b8a066' })
  const fronds = 15
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + rnd() * 0.25
    const lower = i % 3 === 0
    const f = new THREE.Mesh(frondGeometry(1.7 + rnd() * 0.5, 0.6 + rnd() * 0.15, lower ? 0.95 : 0.6 + rnd() * 0.2), lower && rnd() < 0.5 ? leafOld : leafMat)
    f.position.copy(top)
    f.rotation.order = 'YXZ'
    f.rotation.y = a
    f.rotation.x = lower ? 0.35 : -0.15 - rnd() * 0.2
    f.rotation.z = (rnd() - 0.5) * 0.4
    pivot.add(f)
  }
  // young spear fronds pointing up
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(frondGeometry(1.1, 0.4, 0.15), leafMat)
    f.position.copy(top)
    f.rotation.order = 'YXZ'
    f.rotation.y = (i / 3) * Math.PI * 2
    f.rotation.x = -1.0
    pivot.add(f)
  }
  const pose = (variant: number) => {
    // bend direction + yaw vary per obstacle; the trunk base stays on the patch centre
    pivot.rotation.y = ((variant % 16) / 16) * Math.PI * 2
    pivot.scale.setScalar(0.92 + ((variant >> 4) % 5) * 0.04)
  }
  pose(0)
  group.traverse((o) => (o.frustumCulled = false))
  return { group, pose }
}
