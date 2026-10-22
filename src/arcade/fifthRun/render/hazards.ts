/**
 * v21 lane hazards (dodge by switching lanes; sim kinds 'block' / 'car', collision unchanged).
 * Replaces the palm-tree lane obstacle and the broken neon signs. No symbols or arrows anywhere.
 *  - meteor:    a stack of 2–3 glowing rocks (taller than a jump) with molten orange cracks + smoke, in a cracked crater
 *  - crates:    toppled stack of dark cargo crates with thin cyan edge trim
 *  - statue:    fallen chrome statue pieces — big polished head + broken arm, shards
 *  - holo:      broken holographic billboard — cracked frame, glitching blank teal panel
 *  - barricade: twisted steel barricade wreckage with small embers
 * `long` = the 5.4 m 'car' footprint (crates / holo / barricade only); short = the 1.6 m 'block'.
 * Every item owns its animated materials; `pose(variant, time)` drives glow / smoke / glitch.
 */
import * as THREE from 'three'
import { glowMaterial } from './shaders'

export type HazardKind = 'meteor' | 'crates' | 'statue' | 'holo' | 'barricade'
export const SHORT_HAZARDS: HazardKind[] = ['meteor', 'crates', 'statue', 'holo', 'barricade']
export const LONG_HAZARDS: HazardKind[] = ['crates', 'holo', 'barricade']
type Item = { group: THREE.Group; pose: (variant: number, time: number) => void }

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/** cracked-deck decal: dark radial cracks (canvas), lies on the deck */
let crackTex: THREE.CanvasTexture | null = null
function crackTexture(): THREE.CanvasTexture | null {
  if (crackTex) return crackTex
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const r = rng(7)
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128)
  grd.addColorStop(0, 'rgba(0,0,0,0.85)')
  grd.addColorStop(0.55, 'rgba(0,0,0,0.45)')
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 256, 256)
  g.strokeStyle = 'rgba(0,0,0,0.95)'
  for (let i = 0; i < 16; i++) {
    let x = 128, y = 128, a = r() * Math.PI * 2
    g.lineWidth = 2.5
    g.beginPath()
    g.moveTo(x, y)
    for (let k = 0; k < 7; k++) {
      a += (r() - 0.5) * 0.9
      x += Math.cos(a) * (10 + r() * 10)
      y += Math.sin(a) * (10 + r() * 10)
      g.lineTo(x, y)
      g.lineWidth = Math.max(0.6, 2.5 - k * 0.3)
    }
    g.stroke()
  }
  crackTex = new THREE.CanvasTexture(c)
  crackTex.colorSpace = THREE.SRGBColorSpace
  return crackTex
}
function crater(group: THREE.Group, size: number) {
  const t = crackTexture()
  if (!t) return
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }))
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.012
  group.add(m)
}

/** molten-crack emissive map for the meteor */
function lavaTexture(seed: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, 512, 256)
  const r = rng(seed)
  g.lineCap = 'round'
  for (let i = 0; i < 26; i++) {
    let x = r() * 512, y = r() * 256, a = r() * Math.PI * 2
    g.beginPath()
    g.moveTo(x, y)
    for (let k = 0; k < 9; k++) {
      a += (r() - 0.5) * 1.1
      x += Math.cos(a) * 18
      y += Math.sin(a) * 18
      g.lineTo(x, y)
    }
    g.strokeStyle = '#ff6a10'
    g.lineWidth = 7
    g.shadowColor = '#ff4000'
    g.shadowBlur = 14
    g.stroke()
    g.strokeStyle = '#ffd27a'
    g.lineWidth = 2
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function meteor(glow: THREE.Texture, seed: number): Item {
  const group = new THREE.Group()
  const r = rng(seed)
  // v23: a STACK of 2–3 molten rocks, clearly taller than a jump (≈ crate / barricade height) so it
  // reads as "switch lanes", not "hop it". Collision is unchanged (meteors were never jumpable).
  const rockGeo = (rad: number, sq: number, k: number) => {
    const geo = new THREE.IcosahedronGeometry(rad, 4)
    const p = geo.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    const ph = [r() * 6 + k, r() * 6, r() * 6]
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      const n = 1 + 0.16 * Math.sin(v.x * 3.1 + ph[0]) * Math.cos(v.y * 2.7 + ph[1]) + 0.08 * Math.sin(v.z * 6.3 + ph[2]) + 0.04 * Math.sin(v.x * 11 + v.y * 9)
      v.multiplyScalar(n)
      v.y *= sq
      p.setXYZ(i, v.x, v.y, v.z)
    }
    geo.computeVertexNormals()
    return geo
  }
  const lava = lavaTexture(seed)
  const rock = new THREE.MeshStandardMaterial({ color: '#1d1714', roughness: 0.92, metalness: 0.05, emissive: new THREE.Color('#ff5a10'), emissiveIntensity: 2.2, emissiveMap: lava ?? undefined })
  const three = r() < 0.65
  // [radius, squash, y centre, x offset]
  const stack: [number, number, number, number][] = three
    ? [[0.86, 0.72, 0.56, 0], [0.62, 0.8, 1.38, (r() - 0.5) * 0.25], [0.44, 0.85, 2.0, (r() - 0.5) * 0.3]]
    : [[0.9, 0.76, 0.6, 0], [0.7, 0.85, 1.62, (r() - 0.5) * 0.25]]
  stack.forEach(([rad, sq, y, x], k) => {
    const m = new THREE.Mesh(rockGeo(rad, sq, k), rock)
    m.position.set(x, y, (r() - 0.5) * 0.15)
    m.rotation.set(r() * 0.6, r() * 6, r() * 0.4)
    group.add(m)
  })
  const top = three ? 2.35 : 2.25
  crater(group, 3.2)
  // rubble chunks around the impact
  const rub = new THREE.MeshStandardMaterial({ color: '#221c22', roughness: 0.9 })
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07 + r() * 0.09, 0), rub)
    const a = r() * Math.PI * 2, d = 0.85 + r() * 0.5
    c.position.set(Math.cos(a) * d, 0.05, Math.sin(a) * d)
    group.add(c)
  }
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.8, top + 0.6), glowMaterial(glow, '#ff6a1a', 0.5))
  halo.position.set(0, top / 2, 0.6)
  group.add(halo)
  const haloMat = halo.material as THREE.MeshBasicMaterial
  // smoke: soft grey puffs rising (normal blending)
  const puffs: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; o: number }[] = []
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: glow, color: '#3a3440', transparent: true, opacity: 0.5, depthWrite: false })
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), mat)
    group.add(pm)
    puffs.push({ m: pm, mat, o: i / 4 })
  }
  const pose = (variant: number, time: number) => {
    const t = time + (variant % 13)
    rock.emissiveIntensity = 1.9 + 0.5 * Math.sin(t * 2.3) + 0.25 * Math.sin(t * 7.1)
    haloMat.opacity = 0.38 + 0.12 * Math.sin(t * 2.3)
    for (const q of puffs) {
      const u = (t * 0.35 + q.o) % 1
      q.m.position.set(0.15 * Math.sin(u * 5 + q.o * 9), top - 0.3 + u * 2.2, -0.1)
      q.m.scale.setScalar(0.6 + u * 1.4)
      q.mat.opacity = 0.55 * Math.sin(u * Math.PI)
    }
  }
  return { group, pose }
}

function crates(seed: number, long: boolean): Item {
  const group = new THREE.Group()
  const r = rng(seed)
  const body = new THREE.MeshStandardMaterial({ color: '#1b1d24', metalness: 0.7, roughness: 0.45 })
  const rib = new THREE.MeshStandardMaterial({ color: '#2a2d36', metalness: 0.8, roughness: 0.35 })
  const trim = new THREE.MeshBasicMaterial({ color: '#4ff6ff' })
  const crate = (w: number, h: number, d: number) => {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), body))
    // ribs around the box
    for (const z of [-d * 0.32, d * 0.32]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.09), rib)
      b.position.z = z
      g.add(b)
    }
    // thin cyan trim along the long edges
    for (const [x, y] of [[w / 2, h / 2], [-w / 2, h / 2], [w / 2, -h / 2], [-w / 2, -h / 2]] as const) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, d * 0.9), trim)
      e.position.set(x + Math.sign(x) * 0.012, y + Math.sign(y) * 0.012, 0)
      g.add(e)
    }
    // latches
    for (const z of [-d * 0.15, d * 0.15]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.06), rib)
      l.position.set(w / 2 + 0.03, h * 0.25, z)
      g.add(l)
    }
    return g
  }
  const n = long ? 3 : 2
  const D = long ? 1.7 : 1.35
  for (let i = 0; i < n; i++) {
    const c = crate(1.25, 0.72, D)
    const z = long ? (i - 1) * 1.75 : 0
    if (i === 1 && !long) {
      // the top crate slid off and lies tilted against the bottom one
      c.position.set(0.12, 0.92, -0.15)
      c.rotation.set(0.12, 0.25 + r() * 0.2, -0.32)
    } else {
      c.position.set((r() - 0.5) * 0.12, 0.36, z)
      c.rotation.y = (r() - 0.5) * 0.18
      if (long && i === 1) {
        c.position.y = 0.55
        c.rotation.set(0.1, 0.3, -0.42)
      }
    }
    group.add(c)
  }
  crater(group, long ? 3.4 : 2.6)
  return { group, pose: () => {} }
}

function statue(glow: THREE.Texture, seed: number): Item {
  const group = new THREE.Group()
  const r = rng(seed)
  void glow
  const chrome = new THREE.MeshStandardMaterial({ color: '#e8ebf2', metalness: 1, roughness: 0.07, envMapIntensity: 2.4 })
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2b33', metalness: 1, roughness: 0.25 })
  // head lying on its side, face up toward the runner
  const head = new THREE.Group()
  const skull = new THREE.SphereGeometry(0.62, 40, 30)
  const p = skull.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    // egg-shaped head: narrower jaw, flatter sides, a little brow ridge
    const y = v.y / 0.62
    v.x *= 0.82 - 0.12 * Math.max(0, -y)
    v.z *= 0.92 - 0.1 * Math.max(0, -y)
    v.y *= 1.22
    if (v.z > 0.3 && y > 0.05 && y < 0.3) v.z += 0.05
    p.setXYZ(i, v.x, v.y, v.z)
  }
  skull.computeVertexNormals()
  head.add(new THREE.Mesh(skull, chrome))
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 12), chrome)
  nose.position.set(0, 0.0, 0.58)
  nose.rotation.x = Math.PI / 2 - 0.25
  head.add(nose)
  for (const x of [-0.2, 0.2]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 10), dark)
    eye.position.set(x, 0.15, 0.5)
    eye.scale.z = 0.4
    head.add(eye)
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), chrome)
    ear.scale.set(0.4, 1, 0.7)
    ear.position.set(x * 2.65, 0.05, 0)
    head.add(ear)
  }
  const lips = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 8, 16, Math.PI), dark)
  lips.position.set(0, -0.3, 0.52)
  lips.rotation.set(0.3, 0, Math.PI)
  head.add(lips)
  // broken neck stump
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.3, 14), dark)
  neck.position.y = -0.85
  head.add(neck)
  head.rotation.set(-1.2, 0.3, 1.25)
  head.position.set(-0.15, 0.56, 0.2)
  group.add(head)
  // broken forearm + hand reaching across the deck
  const arm = new THREE.Group()
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.95, 18), chrome)
  fore.rotation.z = Math.PI / 2
  arm.add(fore)
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 18), dark)
  stump.rotation.z = Math.PI / 2
  stump.position.x = -0.49
  arm.add(stump)
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.26), chrome)
  palm.position.set(0.6, 0, 0)
  arm.add(palm)
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 4, 8), chrome)
    f.rotation.z = Math.PI / 2 + 0.3
    f.position.set(0.86, -0.04, -0.1 + i * 0.07)
    arm.add(f)
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.16, 4, 8), chrome)
  thumb.position.set(0.6, 0, 0.18)
  thumb.rotation.set(Math.PI / 2, 0.6, 0)
  arm.add(thumb)
  arm.position.set(0.3, 0.16, 0.85)
  arm.rotation.set(0, -0.5, 0.05)
  group.add(arm)
  // shards
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.05 + r() * 0.06), chrome)
    const a = r() * Math.PI * 2, d = 0.6 + r() * 0.6
    s.position.set(Math.cos(a) * d, 0.03, Math.sin(a) * d)
    s.rotation.set(r() * 3, r() * 3, r() * 3)
    group.add(s)
  }
  crater(group, 2.6)
  return { group, pose: () => {} }
}

function holo(glow: THREE.Texture, seed: number, long: boolean): Item {
  const group = new THREE.Group()
  const r = rng(seed)
  const W = long ? 2.0 : 1.6
  const H = long ? 1.15 : 1.0
  const steel = new THREE.MeshStandardMaterial({ color: '#2d2f38', metalness: 0.85, roughness: 0.35 })
  const panelMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uSeed: { value: r() * 10 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uT; uniform float uSeed;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        float t = uT + uSeed;
        float band = floor(vUv.y * 46.0);
        float shift = step(0.93, h(band + floor(t * 9.0))) * (h(band * 3.1 + floor(t * 9.0)) - 0.5) * 0.12;
        float x = vUv.x + shift;
        float line = 0.55 + 0.45 * step(0.5, fract(vUv.y * 46.0));
        float streak = step(0.6, h(band * 7.7 + floor(x * 18.0) + floor(t * 3.0))) * 0.5;
        float flick = 0.75 + 0.25 * step(0.2, h(floor(t * 14.0)));
        float edge = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x) * smoothstep(0.0, 0.05, vUv.y) * smoothstep(1.0, 0.95, vUv.y);
        float dead = step(0.72, x) * step(vUv.y, 0.35 + 0.3 * x);   // a dead, cracked corner
        vec3 c = vec3(0.12, 0.95, 0.9) * (line * 0.6 + streak) * flick;
        gl_FragColor = vec4(c * edge * (1.0 - dead * 0.85), 0.85 * edge);
      }`,
  })
  const board = new THREE.Group()
  // leaning back, propped on the bottom rail, one side sagging
  board.rotation.set(-0.95, 0, ((seed % 3) - 1) * 0.08)
  board.position.set(0, 0.08, long ? 0.6 : 0.3)
  group.add(board)
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(W, H), panelMat)
  panel.position.set(0, H / 2 + 0.06, 0.03)
  board.add(panel)
  const back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, H + 0.1, 0.06), new THREE.MeshStandardMaterial({ color: '#0d0f14', metalness: 0.5, roughness: 0.6 }))
  back.position.set(0, H / 2 + 0.06, -0.03)
  board.add(back)
  // cracked frame: rails, one broken in two with a gap, a sprung corner
  const rail = (x: number, y: number, w: number, h: number, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), steel)
    m.position.set(x, y, 0.02)
    m.rotation.z = rz
    board.add(m)
  }
  rail(0, 0.03, W + 0.16, 0.09)
  rail(-W / 2 - 0.04, H / 2 + 0.06, 0.09, H + 0.1)
  rail(W / 2 + 0.04, H * 0.3, 0.09, H * 0.55)
  rail(W / 2 + 0.1, H * 0.85, 0.09, H * 0.3, -0.25)
  rail(-W * 0.2, H + 0.1, W * 0.62, 0.09, 0.03)
  rail(W * 0.36, H + 0.04, W * 0.3, 0.09, -0.12)
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.7, H * 1.8), glowMaterial(glow, '#20e8d8', 0.32))
  halo.position.set(0, H / 2, 0.15)
  board.add(halo)
  const haloMat = halo.material as THREE.MeshBasicMaterial
  // support legs: one standing, one snapped
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), steel)
  leg.position.set(-W * 0.35, 0.3, -0.35)
  leg.rotation.x = 0.4
  group.add(leg)
  const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), steel)
  leg2.position.set(W * 0.35, 0.12, -0.25)
  leg2.rotation.set(0.9, 0, 0.5)
  group.add(leg2)
  crater(group, long ? 3.2 : 2.4)
  const pose = (variant: number, time: number) => {
    panelMat.uniforms.uT.value = time + (variant % 17)
    haloMat.opacity = 0.26 + 0.08 * Math.sin(time * 13 + variant)
  }
  return { group, pose }
}

function barricade(glow: THREE.Texture, seed: number, long: boolean): Item {
  const group = new THREE.Group()
  const r = rng(seed)
  const steel = new THREE.MeshStandardMaterial({ color: '#34363e', metalness: 0.9, roughness: 0.38 })
  const scorched = new THREE.MeshStandardMaterial({ color: '#1a1a1e', metalness: 0.7, roughness: 0.6 })
  const L = long ? 4.8 : 2.0
  // a beam that is bent in the middle (two pieces meeting at a kink)
  const bent = (len: number, kink: number, mat: THREE.Material) => {
    const g = new THREE.Group()
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(len / 2, 0.14, 0.16), mat)
      b.position.x = (s * len) / 4
      b.rotation.z = -s * kink * 0.5
      b.position.y = Math.abs(Math.sin(kink * 0.5)) * len * 0.12
      g.add(b)
    }
    return g
  }
  const n = long ? 9 : 6
  for (let i = 0; i < n; i++) {
    const b = bent(1.5 + r() * 0.6, (r() - 0.3) * 0.7, i % 3 ? steel : scorched)
    b.position.set((r() - 0.5) * 0.7, 0.18 + r() * 0.75, (r() - 0.5) * L)
    b.rotation.set((r() - 0.5) * 0.6, r() * Math.PI, (r() - 0.5) * 0.9 + (i % 2 ? 0.6 : -0.6))
    group.add(b)
  }
  // a couple of uprights / brackets
  for (let i = 0; i < (long ? 4 : 2); i++) {
    const u = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), steel)
    u.position.set((r() - 0.5) * 0.9, 0.42, (r() - 0.5) * L * 0.8)
    u.rotation.set((r() - 0.5) * 0.7, 0, (r() - 0.5) * 0.9)
    group.add(u)
  }
  crater(group, long ? 3.6 : 2.6)
  // small embers glowing in the tangle
  const emberMat = glowMaterial(glow, '#ff7a1a', 0.8)
  for (let i = 0; i < (long ? 5 : 3); i++) {
    const e = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), emberMat)
    e.position.set((r() - 0.5) * 0.6, 0.08 + r() * 0.3, (r() - 0.5) * L * 0.8)
    group.add(e)
  }
  const pose = (variant: number, time: number) => {
    emberMat.opacity = 0.55 + 0.3 * Math.sin(time * 5.3 + variant) + 0.15 * Math.sin(time * 17 + variant * 2)
  }
  return { group, pose }
}

/**
 * v31 readability: every blocker must look NOTICEABLY too tall to jump — its top sits well above the
 * runner's head at jump apex (feet 1.8 m + body 1.75 m ≈ 3.5 m). Tall-stretch each look so the top is
 * ≥ BLOCKER_TOP (y scale, with a milder xz grow capped so it stays inside its lane). Rocks already pass.
 */
export const BLOCKER_TOP = 3.4
function rawHazard(kind: HazardKind, glow: THREE.Texture, seed: number, long: boolean): Item {
  if (kind === 'meteor') return meteor(glow, seed)
  if (kind === 'crates') return crates(seed, long)
  if (kind === 'statue') return statue(glow, seed)
  if (kind === 'holo') return holo(glow, seed, long)
  return barricade(glow, seed, long)
}
export function buildHazard(kind: HazardKind, glow: THREE.Texture, seed: number, long = false): Item {
  const it = rawHazard(kind, glow, seed, long)
  it.group.updateMatrixWorld(true)
  // solid (opaque mesh) bounds only — glow sprites / smoke / scanline haze don't count as height
  const b = new THREE.Box3()
  it.group.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || (m as unknown as THREE.Sprite).isSprite) return
    const mat = m.material as THREE.Material
    if (mat.transparent) return
    m.geometry.computeBoundingBox()
    b.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld))
  })
  const top = b.max.y
  if (top > 0.1 && top < BLOCKER_TOP) {
    const fy = BLOCKER_TOP / top
    const halfX = Math.max(Math.abs(b.min.x), Math.abs(b.max.x), 0.01)
    const fx = Math.min(Math.pow(fy, 0.35), Math.max(1, 0.95 / halfX))
    const inner = new THREE.Group()
    while (it.group.children.length) inner.add(it.group.children[0])
    inner.scale.set(fx, fy, long ? 1 : fx)
    it.group.add(inner)
  }
  return it
}
