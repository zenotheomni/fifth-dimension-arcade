/**
 * Fifth Glide — sky-path set dressing: 5-emblem arches over the path, holographic turn signs at
 * corners, and floating islands (palms near the start, bare asteroids out in space).
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
    // Fifth Dimension wordmark plate on top of the arch (white lettering with its own dark shadow)
    const e = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 4.4 * 0.482),
      new THREE.MeshBasicMaterial({ map: emblem, transparent: true, depthWrite: false, alphaTest: 0.04, color: new THREE.Color(1.25, 1.2, 1.15), fog: false }),
    )
    e.position.set(0, TOP + 1.45, 0.06)
    group.add(e)
    const h = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.4), glowMaterial(glow, '#8a4dff', 0.2))
    h.position.set(0, TOP + 1.45, -0.05)
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
const NEON = ['#2de2e6', '#ff6f61', '#9d4dff', '#ffc94a']
const SIGN_WORDS = ['5D', 'ARCADE', 'FIFTH', 'GLIDE', 'OPEN', 'VOID']
let signTex: THREE.CanvasTexture | null = null
/** one shared neon-sign atlas (6 words × 1 row), glow baked in */
function neonSignTexture() {
  if (signTex) return signTex
  const c = document.createElement('canvas')
  c.width = 1536
  c.height = 128
  const x = c.getContext('2d')!
  x.fillStyle = '#000'
  x.fillRect(0, 0, c.width, c.height)
  SIGN_WORDS.forEach((w, i) => {
    const col = NEON[i % 4]
    x.font = '900 70px system-ui, sans-serif'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.shadowColor = col
    for (const [b, a] of [[28, 0.9], [12, 1]] as const) {
      x.shadowBlur = b
      x.globalAlpha = a
      x.fillStyle = col
      x.fillText(w, i * 256 + 128, 66)
    }
    x.shadowBlur = 0
    x.fillStyle = '#fff'
    x.globalAlpha = 0.85
    x.fillText(w, i * 256 + 128, 66)
    x.globalAlpha = 1
  })
  signTex = new THREE.CanvasTexture(c)
  signTex.colorSpace = THREE.SRGBColorSpace
  signTex.anisotropy = 4
  return signTex
}

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
  // neon: a glowing rim strip round the top edge + a hanging strip under it, and a sign on a mast
  const k = Math.abs(Math.floor(seed * 7)) % 4
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.012, 6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON[k]).multiplyScalar(2.2), toneMapped: false }))
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.265
  group.add(rim)
  const rim2 = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.008, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON[(k + 2) % 4]).multiplyScalar(1.8), toneMapped: false }))
  rim2.rotation.x = Math.PI / 2
  rim2.position.y = 0.05
  group.add(rim2)
  const word = Math.abs(Math.floor(seed * 13)) % SIGN_WORDS.length
  const tex = neonSignTexture().clone()
  tex.needsUpdate = true
  tex.repeat.set(1 / SIGN_WORDS.length, 1)
  tex.offset.set(word / SIGN_WORDS.length, 0)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.155), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }))
  sign.position.set(-0.3, 0.62, 0.35)
  sign.rotation.y = 0.4
  group.add(sign)
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 5), new THREE.MeshStandardMaterial({ color: '#222', metalness: 0.8, roughness: 0.4 }))
  mast.position.set(-0.3, 0.44, 0.35)
  group.add(mast)
  return { group, rock, top, palms }
}
