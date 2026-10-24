/**
 * FIFTH FRAME — true 3D Neon Paradise lane (visual target, phase 1).
 * Units are metres. Regulation-ish geometry: lane 1.066 m wide, ball r 0.109, pin 0.381 tall.
 * Renderer / post follow the Court Vision + Fifth Glide pattern (ACES, PMREM env, restrained bloom, SMAA).
 */
import * as THREE from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { BloomEffect, BrightnessContrastEffect, HueSaturationEffect, VignetteEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode } from 'postprocessing'

const BASE = import.meta.env.BASE_URL
export const LANE_W = 1.066
// Hero-game cheat: lane shortened from regulation 18.29 m so the rack reads large in portrait (refs do the same).
export const LANE_L = 6.6 // foul line → head pin
const GUTTER_R = 0.118
const BALL_R = 0.109
const PIN_SPACING = 0.3048

export type ViewName = 'hero' | 'pins' | 'ball'

export function loadTex(url: string) {
  return new Promise<THREE.Texture>((res, rej) => new THREE.TextureLoader().load(url, res, undefined, rej))
}
function loadImg(url: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = rej
    i.src = url
  })
}

/* ---------------- textures (procedural, baked once) ---------------- */

function maple(): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  const W = 512, H = 4096
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')!
  const boards = 39
  const bw = W / boards
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let b = 0; b < boards; b++) {
    const t = rnd()
    const base = [222 + t * 24, 150 + t * 26, 82 + t * 20]
    g.fillStyle = `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`
    g.fillRect(b * bw, 0, bw + 1, H)
    // long grain streaks
    for (let k = 0; k < 26; k++) {
      const x = b * bw + rnd() * bw
      g.strokeStyle = `rgba(${120 + rnd() * 40 | 0},${70 + rnd() * 30 | 0},${30},${0.05 + rnd() * 0.09})`
      g.lineWidth = 0.6 + rnd() * 1.4
      g.beginPath(); g.moveTo(x, 0)
      for (let y = 0; y <= H; y += 256) g.lineTo(x + Math.sin(y * 0.003 + k) * 1.2, y)
      g.stroke()
    }
    // board seam
    g.fillStyle = 'rgba(60,30,10,0.55)'
    g.fillRect(b * bw, 0, 1.6, H)
    // butt joints
    for (let y = rnd() * 600; y < H; y += 500 + rnd() * 900) { g.fillStyle = 'rgba(70,36,14,0.28)'; g.fillRect(b * bw, y, bw, 1.2) }
  }
  // pin deck is a lighter panel (last ~0.9 m)
  const deckPx = (0.95 / (LANE_L + 0.9)) * H
  g.fillStyle = 'rgba(255,236,205,0.16)'; g.fillRect(0, 0, W, deckPx)
  // pin spots
  const pinSpot = (x: number, zFromFoul: number) => {
    const px = (x / LANE_W + 0.5) * W
    const py = H - (zFromFoul / (LANE_L + 0.9)) * H
    g.fillStyle = 'rgba(40,22,10,0.6)'; g.beginPath(); g.ellipse(px, py, 4, 2.2, 0, 0, 7); g.fill()
  }
  for (const p of pinPositions()) pinSpot(p.x, LANE_L - p.z)
  // approach dots at 7 ft, arrows at 15 ft (board numbers 5,10,15,20,25,30,35)
  const boardX = (n: number) => W - (n - 0.5) * bw // board 1 on the right
  const yAt = (m: number) => H - (m / (LANE_L + 0.9)) * H
  for (const n of [3, 5, 8, 11, 14, 26, 29, 32, 35, 37]) {
    g.fillStyle = 'rgba(28,14,40,0.85)'; g.beginPath(); g.ellipse(boardX(n), yAt(2.13), 4.5, 9, 0, 0, 7); g.fill()
  }
  const arrowRow = [5, 10, 15, 20, 25, 30, 35]
  arrowRow.forEach((n) => {
    const off = Math.abs(n - 20) / 5 // V shape: centre arrow furthest
    const y = yAt(4.57 + (3 - off) * 0.3)
    const x = boardX(n)
    g.fillStyle = 'rgba(26,12,40,0.9)'
    g.beginPath(); g.moveTo(x, y - 90); g.lineTo(x - bw * 0.7, y + 30); g.lineTo(x + bw * 0.7, y + 30); g.closePath(); g.fill()
    g.fillStyle = 'rgba(0,214,210,0.55)'
    g.beginPath(); g.moveTo(x, y - 70); g.lineTo(x - bw * 0.35, y + 18); g.lineTo(x + bw * 0.35, y + 18); g.closePath(); g.fill()
  })
  // foul line is drawn on the approach, not here
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  // roughness: oil pattern — slicker in the front 12 m
  const r = document.createElement('canvas'); r.width = 64; r.height = 512
  const rg = r.getContext('2d')!
  const grad = rg.createLinearGradient(0, 512, 0, 0)
  grad.addColorStop(0, 'rgb(110,110,110)'); grad.addColorStop(0.62, 'rgb(120,120,120)'); grad.addColorStop(0.72, 'rgb(150,150,150)'); grad.addColorStop(1, 'rgb(160,160,160)')
  rg.fillStyle = grad; rg.fillRect(0, 0, 64, 512)
  const rough = new THREE.CanvasTexture(r)
  return { map, rough }
}

function approachTex(): THREE.CanvasTexture {
  const W = 512, H = 512
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')!
  const bw = W / 39
  for (let b = 0; b < 39; b++) {
    const t = (Math.sin(b * 12.9898) * 43758.5453) % 1
    g.fillStyle = `rgb(${200 + Math.abs(t) * 20 | 0},${150 + Math.abs(t) * 18 | 0},${98})`
    g.fillRect(b * bw, 0, bw + 1, H)
    g.fillStyle = 'rgba(60,32,14,0.35)'; g.fillRect(b * bw, 0, 1, H)
  }
  // foul line (top edge) + approach dots rows
  g.fillStyle = '#120a1c'; g.fillRect(0, 0, W, 10)
  g.fillStyle = 'rgba(0,214,210,0.9)'; g.fillRect(0, 10, W, 2)
  for (const yy of [150, 360]) for (const n of [3, 5, 8, 11, 14, 20, 26, 29, 32, 35, 37]) {
    g.fillStyle = 'rgba(28,14,40,0.85)'; g.beginPath(); g.arc(W - (n - 0.5) * bw, yy, 4, 0, 7); g.fill()
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}

async function ballTex(): Promise<THREE.CanvasTexture> {
  const W = 2048, H = 1024
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#07060c'; g.fillRect(0, 0, W, H)
  // subtle pearl swirl: violet / cyan veins (very low contrast)
  let s = 3
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let k = 0; k < 120; k++) {
    const hue = rnd() < 0.55 ? '120,70,230' : '0,190,210'
    g.strokeStyle = `rgba(${hue},${0.04 + rnd() * 0.07})`
    g.lineWidth = 6 + rnd() * 30
    g.beginPath()
    let x = rnd() * W, y = rnd() * H
    g.moveTo(x, y)
    for (let i = 0; i < 6; i++) { x += (rnd() - 0.5) * 500; y += (rnd() - 0.5) * 260; g.quadraticCurveTo(x + 120, y - 80, x, y) }
    g.stroke()
  }
  // Circle 5 decal on the equator facing camera (u=0.75 → +Z after our rotation)
  try {
    const logo = await loadImg(`${BASE}art/logo-5-emblem-circle.png`)
    const sz = 330
    const cx = W * 0.75, cy = H * 0.5
    g.save()
    g.fillStyle = '#f2eef8'; g.beginPath(); g.ellipse(cx, cy, sz * 0.47, sz * 0.47, 0, 0, 7); g.fill()
    // equirect: compensate horizontal stretch at equator (2:1 map) — width = sz, height = sz
    g.drawImage(logo, cx - sz / 2, cy - sz / 2, sz, sz)
    g.restore()
  } catch { /* text fallback */ }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}

export function frondTex(): THREE.CanvasTexture {
  const W = 256, H = 1024
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')!
  g.clearRect(0, 0, W, H)
  // rachis down the centre, leaflets both sides tapering to tip
  for (let y = 20; y < H - 10; y += 9) {
    const f = y / H
    const len = Math.sin(Math.PI * Math.min(1, f * 1.15)) * (W * 0.48)
    const col = `rgba(${40 + f * 40 | 0},${120 + f * 50 | 0},${70 + f * 20 | 0},1)`
    g.strokeStyle = col; g.lineWidth = 5
    for (const sgn of [-1, 1]) {
      g.beginPath(); g.moveTo(W / 2, y); g.quadraticCurveTo(W / 2 + sgn * len * 0.6, y + 10, W / 2 + sgn * len, y + 34); g.stroke()
    }
  }
  g.strokeStyle = 'rgba(90,110,50,1)'; g.lineWidth = 6; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke()
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function windowsTex(): THREE.CanvasTexture {
  const W = 128, H = 512
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H)
  let s = 11
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let y = 4; y < H; y += 8) for (let x = 4; x < W; x += 10) {
    if (rnd() < 0.36) {
      const warm = rnd() < 0.7
      g.fillStyle = warm ? `rgba(255,${190 + rnd() * 40 | 0},${140},${0.5 + rnd() * 0.5})` : `rgba(120,240,255,${0.5 + rnd() * 0.4})`
      g.fillRect(x, y, 6, 4)
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/* ---------------- geometry ---------------- */

export function pinPositions(): { x: number; z: number }[] {
  // z measured from head pin backwards (negative = further from bowler); head pin at z=0
  const out: { x: number; z: number }[] = []
  const rowDz = PIN_SPACING * Math.sqrt(3) / 2
  for (let row = 0; row < 4; row++) for (let i = 0; i <= row; i++) out.push({ x: (i - row / 2) * PIN_SPACING, z: -row * rowDz })
  return out
}

function pinGeometry(): THREE.BufferGeometry {
  // Regulation ten-pin profile (radius, height) in metres, smoothed by Catmull-Rom.
  const ctrl: [number, number][] = [
    [0.0001, 0], [0.026, 0], [0.034, 0.006], [0.0405, 0.019], [0.050, 0.045], [0.0575, 0.085], [0.0605, 0.114],
    [0.0590, 0.145], [0.0530, 0.180], [0.0420, 0.212], [0.0300, 0.238], [0.0232, 0.256], [0.0228, 0.268],
    [0.0260, 0.292], [0.0315, 0.322], [0.0323, 0.338], [0.0295, 0.358], [0.0215, 0.372], [0.010, 0.379], [0.0001, 0.381],
  ]
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([r, h]) => new THREE.Vector3(r, h, 0)), false, 'centripetal')
  const pts = curve.getSpacedPoints(160).map((p) => new THREE.Vector2(Math.max(0.0001, p.x), p.y))
  const geo = new THREE.LatheGeometry(pts, 48)
  // two red neck stripes via vertex colour
  const pos = geo.attributes.position
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const red = (y > 0.247 && y < 0.257) || (y > 0.263 && y < 0.273)
    col[i * 3] = red ? 0.72 : 1; col[i * 3 + 1] = red ? 0.03 : 1; col[i * 3 + 2] = red ? 0.05 : 1
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.computeVertexNormals()
  return geo
}

export function palm(height: number, lean: number, frondMat: THREE.Material, trunkMat: THREE.Material): THREE.Group {
  const g = new THREE.Group()
  const top = new THREE.Vector3(lean, height, lean * 0.2)
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.15, height * 0.45, 0), new THREE.Vector3(lean * 0.6, height * 0.85, lean * 0.1), top])
  // ringed trunk: tube with radius that tapers
  const tube = new THREE.TubeGeometry(curve, 48, 1, 10, false)
  const p = tube.attributes.position
  const tmp = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    const seg = Math.floor(i / 11) / 48
    const c = curve.getPoint(seg)
    tmp.set(p.getX(i), p.getY(i), p.getZ(i)).sub(c)
    const ring = 1 + 0.08 * Math.max(0, Math.sin(seg * 48 * Math.PI))
    const r = (0.2 - seg * 0.09) * ring
    tmp.setLength(r).add(c)
    p.setXYZ(i, tmp.x, tmp.y, tmp.z)
  }
  tube.computeVertexNormals()
  const trunk = new THREE.Mesh(tube, trunkMat)
  trunk.castShadow = true
  g.add(trunk)
  // fronds: arched ribbon strips
  const N = 11
  for (let k = 0; k < N; k++) {
    const len = 2.6 + ((k * 37) % 7) * 0.12
    const seg = 14
    const geo = new THREE.PlaneGeometry(0.9, len, 1, seg)
    const gp = geo.attributes.position
    for (let i = 0; i < gp.count; i++) {
      const v = Math.min(1, Math.max(0, gp.getY(i) / len + 0.5)) // 0 base → 1 tip
      const x = gp.getX(i)
      const droop = Math.pow(v, 1.7) * 1.5
      gp.setXYZ(i, x * (1 - v * 0.55), -droop + Math.sin(v * Math.PI) * 0.35 - Math.abs(x) * 0.25, v * len)
    }
    geo.computeVertexNormals()
    const m = new THREE.Mesh(geo, frondMat)
    m.position.copy(top)
    m.rotation.y = (k / N) * Math.PI * 2 + (k % 2) * 0.2
    m.rotation.x = -0.25 - (k % 3) * 0.12
    m.castShadow = true
    g.add(m)
  }
  return g
}

/* ---------------- scene ---------------- */

export class FfScene {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(42, 1, 0.05, 1200)
  composer!: EffectComposer
  ball!: THREE.Mesh
  pins: THREE.Mesh[] = []
  view: ViewName = 'hero'
  private t0 = performance.now()
  private raf = 0
  private dynamic: { tick: (t: number) => void }[] = []
  ready = false

  private canvas: HTMLCanvasElement
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  }

  async build() {
    const s = this.scene
    // Origin: foul line centre at lane surface y=0. +z toward bowler. Head pin at z = -LANE_L.
    RectAreaLightUniformsLib.init()
    s.background = new THREE.Color(0x020104)
    s.fog = new THREE.FogExp2(0x140a22, 0.028) // soft alley haze

    this.lights()
    this.lane()
    await this.ballAndPins()
    await this.sign()
    this.alley()
    // bake the lit room into a PMREM env once (mobile-friendly reflections of the neon)
    const pm = new THREE.PMREMGenerator(this.renderer)
    this.ball.visible = false
    s.environment = pm.fromScene(s, 0.02, 0.1, 100, { position: new THREE.Vector3(0, 0.8, -2.5) }).texture
    this.ball.visible = true
    s.environmentIntensity = 1.0
    pm.dispose()
    this.post()
    this.resize()
    this.ready = true
  }

  private lights() {
    const s = this.scene
    s.add(new THREE.HemisphereLight(0x8a7ac0, 0x140a20, 0.55))
    // soft overhead key (recessed ceiling cans) — casts the ball/pin shadows
    const key = new THREE.DirectionalLight(0xf4ecff, 0.5)
    key.position.set(-1.2, 9, 3)
    key.target.position.set(0, 0, -LANE_L * 0.6)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    const sc = key.shadow.camera as THREE.OrthographicCamera
    sc.left = -3; sc.right = 3; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 60
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02
    s.add(key, key.target)
    // pin-deck spot: lit deck reads bright white under the masking wall
    const spot = new THREE.SpotLight(0xfff6ee, 6, 7, 0.55, 0.5, 1.6)
    spot.position.set(0, 0.68, -LANE_L + 0.6)
    spot.target.position.set(0, 0, -LANE_L - 0.6)
    spot.castShadow = true
    spot.shadow.mapSize.set(1024, 1024)
    spot.shadow.bias = -0.0003
    s.add(spot, spot.target)
  }

  private lane() {
    const s = this.scene
    const { map, rough } = maple()
    const wood = new THREE.MeshPhysicalMaterial({ map, roughnessMap: rough, roughness: 1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.1 })
    const L = LANE_L + 0.9 // include pin deck
    const T = 0.07
    const laneGeo = new THREE.BoxGeometry(LANE_W, T, L)
    // only the top face uses the full map: fix uvs on top (box default already 0..1 per face)
    const lane = new THREE.Mesh(laneGeo, [new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.6 }), wood, new THREE.MeshStandardMaterial({ color: 0x3a2414 }), new THREE.MeshStandardMaterial({ color: 0x6b4426 }), new THREE.MeshStandardMaterial({ color: 0x6b4426 })])
    lane.position.set(0, -T / 2, -L / 2)
    lane.receiveShadow = true
    s.add(lane)
    wood.transparent = true; wood.opacity = 0.86; wood.depthWrite = false
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const mirror = new Reflector(new THREE.PlaneGeometry(LANE_W, L), {
      textureWidth: Math.round(window.innerWidth * dpr * 0.5), textureHeight: Math.round(window.innerHeight * dpr * 0.5), color: 0x5c5a66, clipBias: 0.003,
    })
    mirror.rotation.x = -Math.PI / 2; mirror.position.set(0, -0.002, -L / 2)
    s.add(mirror)

    // approach (bowler side) 4.6 m
    const ap = new THREE.Mesh(new THREE.BoxGeometry(LANE_W + GUTTER_R * 2 + 0.06, T, 4.6), [0, 0, 0, 0, 0, 0].map((_, i) => (i === 2 ? new THREE.MeshPhysicalMaterial({ map: approachTex(), color: 0x8a6650, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.2 }) : new THREE.MeshStandardMaterial({ color: 0x4a2e1a }))))
    ap.position.set(0, -T / 2, 2.3)
    ap.receiveShadow = true
    s.add(ap)

    // gutters: half-pipes in brushed dark chrome, full length
    const gutMat = new THREE.MeshPhysicalMaterial({ color: 0x1c1a26, metalness: 1, roughness: 0.26, side: THREE.DoubleSide, envMapIntensity: 1.2 })
    for (const sgn of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.CylinderGeometry(GUTTER_R, GUTTER_R, L, 32, 1, true, Math.PI / 2, Math.PI), gutMat)
      g.rotation.x = Math.PI / 2
      g.rotation.y = 0
      g.position.set(sgn * (LANE_W / 2 + GUTTER_R), -0.004, -L / 2)
      g.rotation.z = 0
      // CylinderGeometry axis is Y; rotate to Z then open upward
      g.rotation.set(Math.PI / 2, 0, Math.PI)
      g.receiveShadow = true
      s.add(g)
      // capping: rounded rail with a thin restrained neon inlay
      const capW = 0.16
      const cap = new THREE.Mesh(new THREE.BoxGeometry(capW, 0.11, L + 4.6), new THREE.MeshPhysicalMaterial({ color: 0x14101f, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.1 }))
      const cx = sgn * (LANE_W / 2 + GUTTER_R * 2 + capW / 2)
      cap.position.set(cx, 0.0, -L / 2 + 2.3)
      cap.castShadow = true; cap.receiveShadow = true
      s.add(cap)
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, L + 4.6), new THREE.MeshBasicMaterial({ color: sgn < 0 ? new THREE.Color(0x00d8e4).multiplyScalar(2.2) : new THREE.Color(0xc04cff).multiplyScalar(2.2) }))
      strip.position.set(cx - sgn * capW * 0.32, 0.056, -L / 2 + 2.3)
      s.add(strip)
    }

    // pit / masking unit: dark pit behind pins
    const pit = new THREE.Mesh(new THREE.BoxGeometry(LANE_W + 0.5, 0.4, 0.9), new THREE.MeshStandardMaterial({ color: 0x07050b, roughness: 0.9 }))
    pit.position.set(0, -0.2, -L - 0.45)
    s.add(pit)
    const kick = new THREE.MeshPhysicalMaterial({ color: 0x1b1428, roughness: 0.3, metalness: 0.6, clearcoat: 1 })
    for (const sgn of [-1, 1]) {
      const kb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 1.6), kick)
      kb.position.set(sgn * (LANE_W / 2 + GUTTER_R * 2 + 0.02), 0.11, -L + 0.3)
      kb.castShadow = kb.receiveShadow = true
      s.add(kb)
    }
  }

  private async ballAndPins() {
    const s = this.scene
    const bt = await ballTex()
    const ballMat = new THREE.MeshPhysicalMaterial({
      map: bt, color: 0xffffff, roughness: 0.16, metalness: 0.05,
      clearcoat: 1, clearcoatRoughness: 0.03,
      iridescence: 0.35, iridescenceIOR: 1.4, iridescenceThicknessRange: [180, 420],
      sheen: 0.15, sheenColor: new THREE.Color(0x5a2cff), envMapIntensity: 1.25,
    })
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 96, 64), ballMat)
    this.ball.position.set(0, BALL_R, 0.62)
    // decal at u=0.75 → faces +x by default; rotate so it faces camera (+z), slightly tilted
    this.ball.rotation.set(0.12, Math.PI + 0.35, 0.06)
    this.ball.castShadow = true
    // finger holes (real geometry insets read as dark ellipses)
    const holeMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.9 })
    const hole = (theta: number, phi: number, r: number) => {
      const h = new THREE.Mesh(new THREE.CircleGeometry(r, 24), holeMat)
      const n = new THREE.Vector3().setFromSphericalCoords(BALL_R * 1.0005, phi, theta)
      h.position.copy(n); h.lookAt(n.clone().multiplyScalar(2)); this.ball.add(h)
    }
    hole(-0.18, 0.52, 0.011); hole(0.18, 0.52, 0.011); hole(0, 0.95, 0.013)
    s.add(this.ball)
    // ball return-side contact shadow helper (soft)
    const pinMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.9 })
    const geo = pinGeometry()
    for (const p of pinPositions()) {
      const m = new THREE.Mesh(geo, pinMat)
      m.position.set(p.x, 0, -LANE_L + p.z)
      m.rotation.y = Math.random() * Math.PI
      m.castShadow = true; m.receiveShadow = true
      s.add(m)
      this.pins.push(m)
    }
  }

  /* masking-unit sign: Circle 5 + FIFTH DIMENSION wordmark, near the pin end */
  private async sign() {
    const s = this.scene
    const W = 2.5, H = 0.7
    const z = -LANE_L - 0.8
    const arch = new THREE.Group()
    const frameMat = new THREE.MeshPhysicalMaterial({ color: 0x120d1c, roughness: 0.28, metalness: 0.7, clearcoat: 1 })
    const header = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.2), frameMat)
    header.position.set(0, 1.3, z + 0.02)
    arch.add(header)
    // thin cyan/violet edge light on the arch (restrained)
    const edge = new THREE.Mesh(new THREE.BoxGeometry(W, 0.018, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00e0e8).multiplyScalar(2) }))
    edge.position.set(0, 1.3 - H / 2 - 0.01, z + 0.13)
    arch.add(edge)
    const edge2 = edge.clone(); (edge2.material as THREE.MeshBasicMaterial) = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc04cff).multiplyScalar(2) }); edge2.position.y = 1.3 + H / 2 + 0.01
    arch.add(edge2)
    // face texture: logo + wordmark
    const c = document.createElement('canvas'); c.width = 2048; c.height = 576
    const g = c.getContext('2d')!
    g.fillStyle = '#0b0814'; g.fillRect(0, 0, c.width, c.height)
    try {
      const [logo, word] = await Promise.all([loadImg(`${BASE}art/logo-5-emblem-circle.png`), loadImg(`${BASE}art/5d-wordmark-white.png`)])
      g.fillStyle = '#f4f0f8'; g.beginPath(); g.arc(320, 288, 236, 0, 7); g.fill(); g.drawImage(logo, 80, 48, 480, 480)
      const ww = 1260, wh = ww * (word.height / word.width)
      g.drawImage(word, 640, (c.height - wh) / 2, ww, wh)
    } catch {
      g.fillStyle = '#fff'; g.font = 'bold 150px Inter, sans-serif'; g.fillText('FIFTH DIMENSION', 600, 340)
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, (W - 0.1) * (576 / 2048)), new THREE.MeshBasicMaterial({ map: tex, toneMapped: true, color: new THREE.Color(0.85, 0.85, 0.85) }))
    face.position.set(0, 1.3, z + 0.13)
    arch.add(face)
    s.add(arch)
  }

  /* indoor neon alley: neighbour lanes, ball returns, masking wall, 3D ceiling, haze */
  private alley() {
    const s = this.scene
    const PITCH = 1.9
    const L = LANE_L + 0.9
    const neon = (c: number, k = 2.4) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) })
    const CY = 0x00e5ff, MG = 0xff2bd6, PK = 0xff5a9a
    const { map, rough } = maple()
    const wood = new THREE.MeshPhysicalMaterial({ map, roughnessMap: rough, roughness: 1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.0 })
    const gutMat = new THREE.MeshPhysicalMaterial({ color: 0x1c1a26, metalness: 1, roughness: 0.26, side: THREE.DoubleSide })
    const capMat = new THREE.MeshPhysicalMaterial({ color: 0x0e0b16, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x07050c, roughness: 0.85 })
    const pinMat = this.pins[0].material
    const pinGeo = this.pins[0].geometry
    const FAR = 4.6 + L
    // floor under everything
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshPhysicalMaterial({ color: 0x0a0812, roughness: 0.35, clearcoat: 0.6 }))
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.08, -6); floor.receiveShadow = true
    s.add(floor)
    // neighbour lanes
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue
      const x = k * PITCH
      const ln = new THREE.Mesh(new THREE.BoxGeometry(LANE_W, 0.07, L), [dark, dark, wood, dark, dark, dark])
      ln.position.set(x, -0.035, -L / 2); ln.receiveShadow = true; s.add(ln)
      const ap = new THREE.Mesh(new THREE.BoxGeometry(LANE_W + 0.3, 0.07, 4.6), [dark, dark, wood, dark, dark, dark])
      ap.position.set(x, -0.035, 2.3); s.add(ap)
      for (const sg of [-1, 1]) {
        const g = new THREE.Mesh(new THREE.CylinderGeometry(GUTTER_R, GUTTER_R, L, 16, 1, true, Math.PI / 2, Math.PI), gutMat)
        g.rotation.set(Math.PI / 2, 0, Math.PI); g.position.set(x + sg * (LANE_W / 2 + GUTTER_R), -0.004, -L / 2); s.add(g)
      }
      for (const p of pinPositions()) {
        const m = new THREE.Mesh(pinGeo, pinMat)
        m.position.set(x + p.x, 0, -LANE_L + p.z); m.rotation.y = p.x * 9; m.castShadow = true; s.add(m)
      }
      const deck = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W, 0.05), neon(0xfff4e8, 2.2))
      deck.position.set(x, 0.74, -LANE_L - 0.85); s.add(deck)
    }
    // dividers (capping) between every lane, neon-capped
    for (let k = -3; k <= 3; k++) {
      const x = (k + 0.5) * PITCH
      const capW = PITCH - LANE_W - GUTTER_R * 4
      const cap = new THREE.Mesh(new THREE.BoxGeometry(capW, 0.11, FAR), capMat)
      cap.position.set(x, 0, -L / 2 + 2.3); cap.receiveShadow = true; s.add(cap)
      if (k === 0 || k === -1) continue // main-lane caps already built
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, FAR), neon(k % 2 ? CY : MG))
      st.position.set(x, 0.057, -L / 2 + 2.3); s.add(st)
    }
    // ball returns on the approach between lane pairs
    for (const k of [-2, 0, 1, 3]) {
      const x = (k - 0.5) * PITCH
      const g = new THREE.Group()
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 1.3), new THREE.MeshPhysicalMaterial({ color: 0x15101f, roughness: 0.3, metalness: 0.5, clearcoat: 1 }))
      body.position.y = 0.21; body.castShadow = true
      const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.5, 32, 1, false, 0, Math.PI), new THREE.MeshPhysicalMaterial({ color: 0x1d1530, roughness: 0.2, metalness: 0.6, clearcoat: 1 }))
      hood.rotation.z = Math.PI / 2; hood.rotation.y = Math.PI / 2; hood.position.set(0, 0.42, -0.45)
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.018, 1.32), neon(k % 2 ? MG : CY, 2))
      rim.position.y = 0.43
      g.add(body, hood, rim)
      const cols = [0x3a1cff, 0xff2b8a, 0x10c8d8]
      for (let b = 0; b < 3; b++) {
        const bb = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 16), new THREE.MeshPhysicalMaterial({ color: cols[(b + k + 3) % 3], roughness: 0.15, clearcoat: 1 }))
        bb.position.set(0, 0.43 + BALL_R * 0.7, 0.05 + b * 0.22); g.add(bb)
      }
      g.position.set(x, 0, 2.6); s.add(g)
    }
    // masking wall over the pin decks (dark, with neon trims + per-lane panels)
    const MZ = -LANE_L - 1.05
    const wall = new THREE.Mesh(new THREE.BoxGeometry(16, 2.0, 0.3), new THREE.MeshPhysicalMaterial({ color: 0x08060e, roughness: 0.5, clearcoat: 0.4 }))
    wall.position.set(0, 0.78 + 1.0, MZ); s.add(wall)
    const lip = new THREE.Mesh(new THREE.BoxGeometry(16, 0.03, 0.04), neon(CY, 2.6)); lip.position.set(0, 0.78, MZ + 0.16); s.add(lip)
    const lip2 = new THREE.Mesh(new THREE.BoxGeometry(16, 0.02, 0.04), neon(MG, 2.4)); lip2.position.set(0, 2.5, MZ + 0.16); s.add(lip2)
    for (let k = -3; k <= 3; k++) {
      if (Math.abs(k) < 2) continue
      const x = k * PITCH
      // per-lane neon panel: ring + 5
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.018, 8, 64), neon(k % 2 ? MG : CY, 2.2))
      ring.position.set(x, 1.35, MZ + 0.17); s.add(ring)
      const n = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.012, 0.02), neon(PK, 1.6)); n.position.set(x, 1.85, MZ + 0.17); s.add(n)
    }
    // pin-deck back (kickback/pit curtain) dark, deck glow strip
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.8), new THREE.MeshStandardMaterial({ color: 0x030206 }))
    pit.position.set(0, 0.4, MZ + 0.05); s.add(pit)
    // side walls + subtle neon palm/sunset mural (brand nod)
    for (const sg of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.4, 18), new THREE.MeshStandardMaterial({ color: 0x0a0712, roughness: 0.7 }))
      w.position.set(sg * 7.4, 1.6, -3); s.add(w)
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 18), neon(sg < 0 ? CY : MG, 2)); strip.position.set(sg * 7.28, 0.9, -3); s.add(strip)
    }
    const sun = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.64, 64, 1, 0, Math.PI), neon(0xff7a3a, 1.8))
    sun.position.set(-7.28, 1.7, -4); sun.rotation.y = Math.PI / 2; s.add(sun)
    // ceiling: perforated acoustic tiles, recessed light panels, beams, neon runs
    const CH = 2.75
    const ct = document.createElement('canvas'); ct.width = ct.height = 256
    const cg = ct.getContext('2d')!
    cg.fillStyle = '#4a4058'; cg.fillRect(0, 0, 256, 256)
    cg.fillStyle = '#07060a'
    for (let y = 6; y < 256; y += 10) for (let x = 6; x < 256; x += 10) { cg.beginPath(); cg.arc(x, y, 1.6, 0, 7); cg.fill() }
    cg.fillStyle = '#050408'; cg.fillRect(0, 0, 256, 3); cg.fillRect(0, 0, 3, 256)
    const tile = new THREE.CanvasTexture(ct); tile.wrapS = tile.wrapT = THREE.RepeatWrapping; tile.repeat.set(24, 30); tile.colorSpace = THREE.SRGBColorSpace; tile.anisotropy = 8
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(16, 20), new THREE.MeshStandardMaterial({ map: tile, roughness: 0.9, emissiveMap: tile, emissive: 0x9a88c0, emissiveIntensity: 0.55 }))
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, CH, -3); s.add(ceil)
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x0c0a12, roughness: 0.6 })
    const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8f0ff).multiplyScalar(2.2) })
    for (let z = 3; z > -LANE_L - 1.2; z -= 1.6) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(16, 0.22, 0.12), beamMat); beam.position.set(0, CH - 0.11, z); s.add(beam)
      const nb = new THREE.Mesh(new THREE.BoxGeometry(16, 0.015, 0.02), neon(Math.round(z * 10) % 2 ? MG : CY, 1.8)); nb.position.set(0, CH - 0.225, z + 0.06); s.add(nb)
    }
    for (let k = -3; k <= 3; k++) for (let z = 2.2; z > -LANE_L - 0.5; z -= 1.6) {
      for (const dx of [-0.48, 0.48]) {
        const pn = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), panelMat)
        pn.rotation.x = Math.PI / 2; pn.position.set(k * PITCH + dx, CH - 0.005, z + 0.8); s.add(pn)
        const can = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 6, 24), beamMat)
        can.rotation.x = Math.PI / 2; can.position.set(k * PITCH + dx, CH - 0.01, z + 0.8); s.add(can)
      }
    }
    // neon runs down each divider line on the ceiling
    for (let k = -3; k <= 3; k++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 11), neon(k % 2 ? PK : CY, 2.2))
      r.position.set((k + 0.5) * PITCH, CH - 0.26, -2.2); s.add(r)
    }
    // real area lights from the neon (cyan left / magenta right) + soft ceiling wash
    const ra = (c: number, i: number, x: number, z: number, w: number, h: number) => {
      const l = new THREE.RectAreaLight(c, i, w, h); l.position.set(x, CH - 0.3, z); l.lookAt(x, 0, z); s.add(l)
    }
    ra(0x40e8ff, 1.6, -0.95, -2.2, 0.15, 9)
    ra(0xff3ad8, 1.6, 0.95, -2.2, 0.15, 9)
    ra(0xe6ecff, 1.4, 0, -1.0, 1.2, 4)
    for (const k of [-2, -1, 1, 2]) ra(k % 2 ? 0xff60e0 : 0x50e0ff, 3.0, k * PITCH, -2.5, 1.0, 8)
    // bright neon coves along wall/ceiling edges and the masking-wall top
    for (const sg of [-1, 1]) {
      const cv = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 18), neon(sg < 0 ? MG : CY, 4))
      cv.position.set(sg * 7.25, CH - 0.06, -3); s.add(cv)
      const cv2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 18), neon(sg < 0 ? PK : 0x7a5cff, 3))
      cv2.position.set(sg * 4.8, CH - 0.04, -3); s.add(cv2)
    }
    const cvb = new THREE.Mesh(new THREE.BoxGeometry(16, 0.06, 0.06), neon(MG, 4)); cvb.position.set(0, 2.76, MZ + 0.18); s.add(cvb)
    const script = (txt: string, col: string, x: number, w: number) => {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 256
      const g = c.getContext('2d')!
      g.font = 'italic 600 120px "Brush Script MT", "Segoe Script", cursive'
      g.textAlign = 'center'; g.textBaseline = 'middle'
      g.shadowColor = col; g.shadowBlur = 28; g.fillStyle = col; g.fillText(txt, 512, 132)
      g.shadowBlur = 6; g.fillStyle = '#ffffff'; g.fillText(txt, 512, 132)
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, color: new THREE.Color(1.6, 1.6, 1.6) }))
      m.position.set(x, 2.08, MZ + 0.17); s.add(m)
    }
    script('Fifth Frame', '#28e8ff', 0, 1.6)

    // bowler seating silhouettes behind the approach
    const seat = new THREE.MeshPhysicalMaterial({ color: 0x1a1030, roughness: 0.4, clearcoat: 0.8 })
    for (let k = -3; k <= 3; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 0.5), seat); b.position.set(k * PITCH, 0.22, 5.6); s.add(b)
      const bk = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 0.12), seat); bk.position.set(k * PITCH, 0.55, 5.9); s.add(bk)
    }
  }

  private bloom!: BloomEffect
  private post() {
    const composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 4 })
    composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new BloomEffect({ intensity: 0.55, luminanceThreshold: 0.86, luminanceSmoothing: 0.12, mipmapBlur: true, radius: 0.55 })
    composer.addPass(new EffectPass(this.camera, this.bloom, new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }), new BrightnessContrastEffect({ contrast: 0.14 }), new HueSaturationEffect({ saturation: 0.08 }), new VignetteEffect({ offset: 0.3, darkness: 0.55 })))
    composer.addPass(new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.HIGH })))
    this.renderer.toneMapping = THREE.NoToneMapping
    this.composer = composer
  }

  setView(v: ViewName) { this.view = v }

  private applyCamera(t: number) {
    const cam = this.camera
    const aspect = cam.aspect
    if (this.view === 'pins') {
      cam.fov = 40
      cam.position.set(0.0, 0.8, -LANE_L + 6.6)
      cam.lookAt(0, 0.62, -LANE_L - 1.2)
    } else if (this.view === 'ball') {
      cam.fov = 34
      cam.position.set(0.3, 0.3, 1.45)
      cam.lookAt(0, 0.11, 0.58)
    } else {
      // low cinematic third-person behind the ball; portrait needs a wider vertical FOV
      cam.fov = aspect < 0.7 ? 50 : 38
      const sway = Math.sin(t * 0.25) * 0.015
      cam.position.set(sway, 0.38, 1.7)
      cam.lookAt(0, 0.12, -LANE_L)
    }
    cam.updateProjectionMatrix()
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.renderer.setSize(w, h, false)
    this.composer?.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  renderOnce() {
    const t = (performance.now() - this.t0) / 1000
    for (const d of this.dynamic) d.tick(t)
    this.applyCamera(t)
    this.composer.render()
  }

  start() {
    const loop = () => { this.renderOnce(); this.raf = requestAnimationFrame(loop) }
    this.raf = requestAnimationFrame(loop)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.composer?.dispose()
    this.renderer.dispose()
  }
}
