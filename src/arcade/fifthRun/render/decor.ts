/**
 * Fifth Glide — sky-path set dressing: 5-emblem arches over the path, holographic turn signs at
 * corners, and floating islands (palms near Miami, bare asteroids out in space).
 */
import * as THREE from 'three'
import { glowMaterial } from './shaders'
import { palmGeometry, palmMaterial, rockGeometry, rockMaterial } from './props'

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)

/** Brand arch spanning the path: dark steel pillars hanging into the void, neon tubes, the 5 emblem. */
export function buildArch(glow: THREE.Texture, emblem: THREE.Texture | null) {
  const group = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: '#1d1a26', metalness: 0.85, roughness: 0.32 })
  const X = 3.75
  const TOP = 5.4
  const BOT = -7
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(box(0.42, TOP - BOT, 0.5), steel)
    p.position.set(side * X, (TOP + BOT) / 2, 0)
    group.add(p)
    // glowing tip under the pillar (reads as a floating pylon)
    const tip = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), glowMaterial(glow, side < 0 ? '#00e0d0' : '#ff4d5e', 0.5))
    tip.position.set(side * X, BOT - 0.2, 0)
    group.add(tip)
  }
  const beam = new THREE.Mesh(box(2 * X + 0.42, 0.5, 0.55), steel)
  beam.position.y = TOP
  group.add(beam)
  const tubes: THREE.MeshStandardMaterial[] = []
  ;['#00e0d0', '#ff4d5e', '#8a4dff'].forEach((c, i) => {
    const m = new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(c), emissiveIntensity: 2.2 })
    tubes.push(m)
    const inset = 0.32 + i * 0.13
    const t = new THREE.Mesh(box(2 * X - inset * 2, 0.05, 0.05), m)
    t.position.set(0, TOP - 0.3 - i * 0.13, 0.3)
    group.add(t)
    for (const side of [-1, 1]) {
      const h = TOP - 0.3 - i * 0.13
      const v = new THREE.Mesh(box(0.05, h + 0.5, 0.05), m)
      v.position.set(side * (X - inset), (h - 0.5) / 2, 0.3)
      group.add(v)
    }
  })
  if (emblem) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.0, 40), new THREE.MeshStandardMaterial({ color: '#111', metalness: 0.9, roughness: 0.3 }))
    disc.position.set(0, TOP + 1.05, 0.02)
    group.add(disc)
    const e = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 1.8),
      new THREE.MeshBasicMaterial({ map: emblem, transparent: true, depthWrite: false, alphaTest: 0.04, color: new THREE.Color(1.5, 1.4, 1.25), fog: false }),
    )
    e.position.set(0, TOP + 1.05, 0.06)
    group.add(e)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.05, 8, 48), new THREE.MeshStandardMaterial({ color: '#ffc83c', emissive: new THREE.Color('#ffb020'), emissiveIntensity: 2.4, metalness: 1, roughness: 0.2 }))
    ring.position.set(0, TOP + 1.05, 0.04)
    group.add(ring)
    const h = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), glowMaterial(glow, '#ffc83c', 0.18))
    h.position.set(0, TOP + 1.05, -0.05)
    group.add(h)
  }
  return { group, tubes }
}

function signTexture(dir: -1 | 0 | 1) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 192
  const g = c.getContext('2d')!
  g.clearRect(0, 0, 512, 192)
  const col = dir < 0 ? '#00f0e0' : dir > 0 ? '#ff5a6a' : '#ffc83c'
  g.strokeStyle = col
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.shadowColor = col
  g.shadowBlur = 18
  g.lineWidth = 22
  const chev = (x: number, d: number) => {
    g.beginPath()
    g.moveTo(x - d * 30, 40)
    g.lineTo(x + d * 30, 96)
    g.lineTo(x - d * 30, 152)
    g.stroke()
  }
  if (dir === 0) {
    for (const x of [90, 170]) chev(x, -1)
    for (const x of [342, 422]) chev(x, 1)
  } else for (const x of [130, 256, 382]) chev(dir < 0 ? 512 - x : x, dir)
  // frame
  g.shadowBlur = 8
  g.lineWidth = 6
  g.strokeStyle = 'rgba(255,255,255,0.55)'
  g.strokeRect(10, 10, 492, 172)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Holographic turn sign floating at the far edge of a corner square. */
export function buildTurnSign(glow: THREE.Texture) {
  const group = new THREE.Group()
  const mats = {
    L: new THREE.MeshBasicMaterial({ map: signTexture(-1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }),
    R: new THREE.MeshBasicMaterial({ map: signTexture(1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }),
    T: new THREE.MeshBasicMaterial({ map: signTexture(0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }),
  }
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.72), mats.L)
  panel.position.y = 2.3
  group.add(panel)
  const backing = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 1.8), new THREE.MeshBasicMaterial({ color: '#05030a', transparent: true, opacity: 0.55, depthWrite: false }))
  backing.position.set(0, 2.3, -0.03)
  group.add(backing)
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.4), glowMaterial(glow, '#ffffff', 0.12))
  halo.position.set(0, 2.3, -0.06)
  group.add(halo)
  return { group, panel, mats, halo }
}

let palmGeo: THREE.BufferGeometry | null = null
let palmMat: THREE.Material | null = null

/** Floating island: a jagged rock with a flat grassy top and palms (or a bare asteroid). */
export function buildIsland(seed: number) {
  const group = new THREE.Group()
  const g = rockGeometry(seed, 1, 1, 1, 3)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  // flatten the top, stretch the underside into a long tapering keel
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y > 0.25) pos.setY(i, 0.25 + (y - 0.25) * 0.12)
    else pos.setY(i, y * (1.6 + 0.6 * Math.abs(Math.sin(pos.getX(i) * 3 + seed))))
  }
  g.computeVertexNormals()
  const rock = new THREE.Mesh(g, rockMaterial())
  group.add(rock)
  const top = new THREE.Mesh(
    new THREE.CircleGeometry(0.82, 18),
    new THREE.MeshStandardMaterial({ color: '#1d3a2c', roughness: 0.95 }),
  )
  top.rotation.x = -Math.PI / 2
  top.position.y = 0.27
  group.add(top)
  palmGeo ??= palmGeometry()
  palmMat ??= palmMaterial()
  const palms: THREE.Mesh[] = []
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(palmGeo, palmMat)
    const a = seed * 2.1 + i * 2.2
    p.position.set(Math.cos(a) * 0.4, 0.26, Math.sin(a) * 0.4)
    p.rotation.y = a * 1.7
    group.add(p)
    palms.push(p)
  }
  return { group, rock, top, palms }
}
