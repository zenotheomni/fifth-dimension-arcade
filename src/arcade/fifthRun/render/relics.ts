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

export function buildSatellite(glow: THREE.Texture) {
  const group = new THREE.Group()
  const foil = addRim(new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 1, roughness: 0.32, envMapIntensity: 1.8 }), new THREE.Color('#ffd98a'), 0.6, 2.4)
  const steel = new THREE.MeshStandardMaterial({ color: '#8d93a0', metalness: 0.9, roughness: 0.35 })
  const dark = new THREE.MeshStandardMaterial({ color: '#23252c', metalness: 0.8, roughness: 0.5 })
  const panel = new THREE.MeshStandardMaterial({ color: '#0f1d4a', metalness: 0.6, roughness: 0.25, emissive: new THREE.Color('#0b2a7a'), emissiveIntensity: 0.5 })
  // body: octagonal bus lying along the lane, tilted, half dug in
  const bus = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.4, 8, 1), foil)
  bus.rotation.set(Math.PI / 2, 0, 0.12)
  bus.position.set(0.05, 0.62, 0)
  group.add(bus)
  for (const z of [-1.22, 1.22]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.08, 8), dark)
    cap.rotation.x = Math.PI / 2
    cap.position.set(0.05, 0.62, z)
    group.add(cap)
  }
  // solar wings: one snapped and folded down, one buckled along the deck
  const wing = (len: number) => {
    const g = new THREE.Group()
    const cells = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, len), panel)
    cells.position.z = len / 2
    g.add(cells)
    for (let i = 1; i < 4; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.04, 0.03), steel)
      rib.position.z = (len / 4) * i
      g.add(rib)
    }
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 6), steel)
    boom.rotation.x = Math.PI / 2
    boom.position.z = len / 2
    g.add(boom)
    return g
  }
  const w1 = wing(1.4)
  w1.position.set(0.05, 0.75, 1.2)
  w1.rotation.set(0.5, 0, -0.35)
  group.add(w1)
  const w2 = wing(1.3)
  w2.position.set(0.05, 0.7, -1.2)
  w2.rotation.set(Math.PI - 0.25, 0, 0.3)
  group.add(w2)
  // dish + antenna on top
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 10, 0, Math.PI * 2, 0, 0.9), steel)
  dish.material = new THREE.MeshStandardMaterial({ color: '#d8dce4', metalness: 0.7, roughness: 0.25, side: THREE.DoubleSide })
  dish.position.set(0.15, 1.18, 0.35)
  dish.rotation.set(-0.9, 0, 0.4)
  group.add(dish)
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 6), steel)
  ant.position.set(-0.25, 1.42, -0.5)
  ant.rotation.z = 0.5
  group.add(ant)
  // scorched impact skid + sparking status lamp
  const skid = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 4.8), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.45, depthWrite: false }))
  skid.rotation.x = -Math.PI / 2
  skid.position.y = 0.02
  group.add(skid)
  const lampMat = new THREE.MeshStandardMaterial({ color: '#300', emissive: new THREE.Color('#ff3a2a'), emissiveIntensity: 3 })
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), lampMat)
  lamp.position.set(-0.4, 1.12, -0.9)
  group.add(lamp)
  const g = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), glowMaterial(glow, '#ff6a3a', 0.6))
  g.position.copy(lamp.position)
  group.add(g)
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
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#3a2a22', emissive: new THREE.Color('#ff4a10'), emissiveIntensity: 0.6, roughness: 0.6 })
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
  const tex = hullTextures('rocket', { base: '#b9b6ae', brush: 0.6, panelsU: 8, panelsV: 6, rivets: true, soot: 1.4, seed: 59 })
  const hullMat = addRim(new THREE.MeshStandardMaterial({ map: tex.map, bumpMap: tex.bump, bumpScale: 2.2, roughnessMap: tex.rough, roughness: 0.62, metalness: 0.82, envMapIntensity: 1.4 }), new THREE.Color('#ffb27a'), 0.35, 3.0)
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
  finShape.moveTo(0, 0)
  finShape.lineTo(0.34, -0.12)
  finShape.lineTo(0.38, 0.3)
  finShape.lineTo(0.0, 0.55)
  finShape.closePath()
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 4 })
  finGeo.translate(0, 0, -0.0175)
  const finMat = new THREE.MeshStandardMaterial({ map: tex.map, color: '#77736c', metalness: 0.8, roughness: 0.5, bumpMap: tex.bump, bumpScale: 1.5 })
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(finGeo, finMat)
    const a = (i / 4) * Math.PI * 2
    f.position.set(Math.cos(a) * R0 * 0.95, 1.2, Math.sin(a) * R0 * 0.95)
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
