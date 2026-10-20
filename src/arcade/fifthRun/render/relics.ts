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
 * v16: a small crashed rocket, nose buried in the lane and tilted, engine end up — scorched metal
 * body (smooth lathe, 40 sides), four swept fins (one bent), a burnt nozzle bell, crater debris,
 * an ember glow at the impact point and a faint smoke wisp. Footprint / hitbox = the old crystal
 * pylon (`OB.block`: half-width 0.85, height 2.6, length 1.6), so the route validator is unchanged.
 */
export function buildRocket(glow: THREE.Texture) {
  const group = new THREE.Group()
  // scorch: bright paint at the top fading to soot-black toward the buried nose (vertex colours)
  const prof: THREE.Vector2[] = []
  const pts: [number, number][] = [[0.0, 0.0], [0.12, 0.08], [0.24, 0.3], [0.3, 0.6], [0.31, 1.0], [0.31, 1.9], [0.29, 2.05], [0.24, 2.12]]
  for (const [r, y] of pts) prof.push(new THREE.Vector2(r, y))
  const bodyGeo = new THREE.LatheGeometry(prof, 40)
  const pos = bodyGeo.getAttribute('position') as THREE.BufferAttribute
  const col: number[] = []
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const a = Math.atan2(pos.getZ(i), pos.getX(i))
    const burn = THREE.MathUtils.clamp(1 - y / 1.4 + 0.25 * Math.sin(a * 5 + y * 7) + 0.15 * Math.sin(a * 13), 0, 1)
    const band = Math.abs(y - 1.55) < 0.07 ? 0.55 : 1 // a painted stripe ring
    const base = new THREE.Color('#d9d6cf').multiplyScalar(band)
    if (y > 1.45 && y < 1.65 && Math.abs(y - 1.55) >= 0.07) base.set('#c43c2c')
    base.lerp(new THREE.Color('#141110'), burn * 0.92)
    col.push(base.r, base.g, base.b)
  }
  bodyGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  bodyGeo.computeVertexNormals()
  const metal = addRim(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.75, roughness: 0.42, envMapIntensity: 1.6 }), new THREE.Color('#ffb070'), 0.5, 2.6)
  const rocket = new THREE.Group()
  rocket.add(new THREE.Mesh(bodyGeo, metal))
  // nozzle bell (burnt, blued steel) at the top
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.27, 0.32, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#3a3448', metalness: 0.95, roughness: 0.3, side: THREE.DoubleSide, emissive: new THREE.Color('#2a0c04'), emissiveIntensity: 1 }))
  bell.position.y = 2.28
  rocket.add(bell)
  // four swept fins near the engine end (one bent by the impact)
  const finShape = new THREE.Shape()
  finShape.moveTo(0, 0)
  finShape.lineTo(0.42, 0.25)
  finShape.lineTo(0.42, 0.55)
  finShape.lineTo(0, 0.7)
  finShape.closePath()
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 })
  const finMat = new THREE.MeshStandardMaterial({ color: '#2a2624', metalness: 0.7, roughness: 0.5 })
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(finGeo, finMat)
    const a = (i / 4) * Math.PI * 2 + 0.4
    f.position.set(Math.cos(a) * 0.28, 1.45, Math.sin(a) * 0.28)
    f.rotation.set(0, -a, i === 1 ? 0.35 : 0)
    rocket.add(f)
  }
  // nose-down, tilted, sunk into the deck
  rocket.rotation.set(0.22, 0.6, Math.PI - 0.38)
  rocket.position.set(-0.25, 2.05, 0)
  group.add(rocket)
  // crater: torn deck plates + debris chunks around the impact
  const debrisMat = new THREE.MeshStandardMaterial({ color: '#1b1716', metalness: 0.5, roughness: 0.7 })
  for (let i = 0; i < 9; i++) {
    const d = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06 + rnd() * 0.1, 1), debrisMat)
    const a = rnd() * Math.PI * 2
    const r = 0.35 + rnd() * 0.45
    d.position.set(Math.cos(a) * r, 0.04, Math.sin(a) * r)
    d.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3)
    group.add(d)
  }
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.06, 24), new THREE.MeshStandardMaterial({ color: '#0e0b0b', roughness: 0.95 }))
  plate.position.y = 0.03
  group.add(plate)
  // ember glow at the impact (the scene flickers `lamp`) + a soft additive halo
  const lamp = new THREE.MeshStandardMaterial({ color: '#2a0800', emissive: new THREE.Color('#ff5a1a'), emissiveIntensity: 2 })
  const ember = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 32), lamp)
  ember.rotation.x = Math.PI / 2
  ember.position.y = 0.07
  group.add(ember)
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), glowMaterial(glow, '#ff6a20', 0.45))
  halo.rotation.x = -Math.PI / 2
  halo.position.y = 0.09
  group.add(halo)
  // faint smoke wisp rising off the hot engine end
  for (let i = 0; i < 3; i++) {
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.9 + i * 0.5, 1.1 + i * 0.6), new THREE.MeshBasicMaterial({ map: glow, color: '#5a5560', transparent: true, opacity: 0.22 - i * 0.05, depthWrite: false }))
    sm.position.set(0.35 + i * 0.12, 2.6 + i * 0.7, -0.1)
    sm.rotation.z = 0.3 * i
    group.add(sm)
  }
  return { group, lamp }
}
