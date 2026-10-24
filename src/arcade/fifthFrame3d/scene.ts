/**
 * FIFTH FRAME — true 3D Neon Paradise lane (visual target, phase 1).
 * Units are metres. Regulation-ish geometry: lane 1.066 m wide, ball r 0.109, pin 0.381 tall.
 * Renderer / post follow the Court Vision + Fifth Glide pattern (ACES, PMREM env, restrained bloom, SMAA).
 */
import * as THREE from 'three'
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

function frondTex(): THREE.CanvasTexture {
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

function windowsTex(): THREE.CanvasTexture {
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

function palm(height: number, lean: number, frondMat: THREE.Material, trunkMat: THREE.Material): THREE.Group {
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
    this.sky()
    const pm = new THREE.PMREMGenerator(this.renderer)
    s.environment = pm.fromScene(this.skyOnlyScene(), 0.04).texture
    s.environmentIntensity = 0.85
    s.fog = new THREE.FogExp2(0x3a1050, 0.0005)

    this.lights()
    this.lane()
    await this.ballAndPins()
    await this.sign()
    this.resort()
    this.ocean()
    this.skyline()
    this.post()
    this.resize()
    this.ready = true
  }

  /* sky dome: peach horizon → pink → violet → cosmic, stars, sun */
  private skyMat?: THREE.ShaderMaterial
  private makeSkyMat(disc = 1.1) {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0.0, 0.03, -1).normalize() }, uDisc: { value: disc } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir; uniform float uTime; uniform vec3 uSun; uniform float uDisc;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
        void main(){
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 peach = vec3(1.0,0.38,0.06);
          vec3 pink  = vec3(0.92,0.06,0.42);
          vec3 viol  = vec3(0.26,0.04,0.48);
          vec3 deep  = vec3(0.03,0.01,0.1);
          vec3 c = mix(peach, pink, smoothstep(0.0, 0.03, y));
          c = mix(c, viol, smoothstep(0.03, 0.14, y));
          c = mix(c, deep, smoothstep(0.18, 0.42, y));
          // horizon band glow toward the sun
          float sd = max(dot(d, uSun), 0.0);
          c += vec3(1.0,0.55,0.35) * pow(sd, 40.0) * 0.55 * min(1.0, uDisc);
          c += vec3(1.0,0.82,0.6) * smoothstep(0.9994, 0.99975, sd) * uDisc; // sun disc
          // below horizon: dark sea haze (dome only, water reflects env)
          c = mix(c, vec3(0.16,0.08,0.2), smoothstep(0.0, -0.08, y));
          // stars only high up
          vec3 sp = floor(d * 420.0);
          float st = step(0.9965, h(sp)) * smoothstep(0.1, 0.35, y);
          c += vec3(0.9,0.9,1.0) * st * (0.55 + 0.45 * sin(uTime*1.7 + h(sp)*40.0));
          gl_FragColor = vec4(c * 0.82, 1.0);
        }`,
    })
  }
  private sky() {
    this.skyMat = this.makeSkyMat()
    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), this.skyMat)
    dome.renderOrder = -10
    this.scene.add(dome)
    this.dynamic.push({ tick: (t) => { this.skyMat!.uniforms.uTime.value = t } })
    // ringed planet, high and small — subtle celestial accent
    const pl = new THREE.Group()
    const ps = new THREE.Mesh(new THREE.SphereGeometry(14, 48, 24), new THREE.MeshBasicMaterial({ color: 0xe9b8a8, fog: false }))
    const shade = new THREE.Mesh(new THREE.SphereGeometry(14.05, 48, 24), new THREE.MeshBasicMaterial({ color: 0x1a0c2a, transparent: true, opacity: 0.55, fog: false }))
    shade.scale.set(1, 1, 1); shade.position.set(-5, 3, 2)
    const ring = new THREE.Mesh(new THREE.RingGeometry(19, 27, 96), new THREE.MeshBasicMaterial({ color: 0xffd6c0, transparent: true, opacity: 0.35, side: THREE.DoubleSide, fog: false }))
    ring.rotation.x = Math.PI / 2.3
    pl.add(ps, ring)
    pl.position.set(150, 260, -620)
    pl.lookAt(0, 0, 0)
    this.scene.add(pl)
  }
  private skyOnlyScene() {
    const sc = new THREE.Scene()
    sc.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.makeSkyMat(0.25)))
    // soft cyan + magenta panels so chrome/ball pick up branded reflections
    const panel = (color: number, x: number, y: number, z: number, w: number, h: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }))
      m.position.set(x, y, z); m.lookAt(0, 0, 0); sc.add(m)
    }
    panel(0x00c8d4, -40, 18, 10, 30, 6)
    panel(0x9a3cff, 40, 22, 20, 30, 6)
    panel(0xffb48a, 0, 60, 30, 40, 20)
    return sc
  }

  private lights() {
    const s = this.scene
    s.add(new THREE.HemisphereLight(0xffb7a0, 0x261238, 0.55))
    // warm sunset back-light from beyond the pins
    const sun = new THREE.DirectionalLight(0xffa07a, 0.8)
    sun.position.set(4, 7, -40)
    // sun kept off the lane's specular path (grazing clearcoat hotspot washed out the lane)
    sun.position.set(30, 6, -40)
    s.add(sun)
    // key light from behind/above the bowler — casts the shadows
    const key = new THREE.DirectionalLight(0xfff0e6, 1.35)
    key.position.set(-3, 9, 6)
    key.target.position.set(0, 0, -LANE_L * 0.6)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    const sc = key.shadow.camera as THREE.OrthographicCamera
    sc.left = -3; sc.right = 3; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 60
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02
    s.add(key, key.target)
    // pin-deck spot so pins read crisp white
    const spot = new THREE.SpotLight(0xfff4ea, 16, 9, 0.5, 0.6, 1.6)
    spot.position.set(0, 3.2, -LANE_L + 2.4)
    spot.target.position.set(0, 0, -LANE_L - 0.4)
    spot.castShadow = true
    spot.shadow.mapSize.set(1024, 1024)
    spot.shadow.bias = -0.0003
    s.add(spot, spot.target)
    // restrained brand accents
    const cyan = new THREE.PointLight(0x00e0e8, 3.2, 5, 2); cyan.position.set(-1.0, 0.6, -LANE_L + 0.4)
    const mag = new THREE.PointLight(0xd24cff, 3.2, 5, 2); mag.position.set(1.0, 0.6, -LANE_L + 0.4)
    s.add(cyan, mag)
  }

  private lane() {
    const s = this.scene
    const { map, rough } = maple()
    const wood = new THREE.MeshPhysicalMaterial({ map, roughnessMap: rough, roughness: 1, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.22, envMapIntensity: 0.18 })
    const L = LANE_L + 0.9 // include pin deck
    const T = 0.07
    const laneGeo = new THREE.BoxGeometry(LANE_W, T, L)
    // only the top face uses the full map: fix uvs on top (box default already 0..1 per face)
    const lane = new THREE.Mesh(laneGeo, [new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.6 }), wood, new THREE.MeshStandardMaterial({ color: 0x3a2414 }), new THREE.MeshStandardMaterial({ color: 0x6b4426 }), new THREE.MeshStandardMaterial({ color: 0x6b4426 })])
    lane.position.set(0, -T / 2, -L / 2)
    lane.receiveShadow = true
    s.add(lane)

    // approach (bowler side) 4.6 m
    const ap = new THREE.Mesh(new THREE.BoxGeometry(LANE_W + GUTTER_R * 2 + 0.06, T, 4.6), [0, 0, 0, 0, 0, 0].map((_, i) => (i === 2 ? new THREE.MeshPhysicalMaterial({ map: approachTex(), roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.2 }) : new THREE.MeshStandardMaterial({ color: 0x4a2e1a }))))
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

    // suspended deck: dark stone + glass edge, the lane sits on it over the water
    const deckW = 7.6
    const deck = new THREE.Mesh(new THREE.BoxGeometry(deckW, 0.5, L + 9), new THREE.MeshPhysicalMaterial({ color: 0x17121f, roughness: 0.38, metalness: 0.2, clearcoat: 0.6 }))
    deck.position.set(0, -0.32, -L / 2 + 1.4)
    deck.receiveShadow = true
    s.add(deck)
    // underside glow line (sells "suspended")
    for (const sgn of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, L + 9), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa0a0).multiplyScalar(1.4) }))
      edge.position.set(sgn * deckW / 2, -0.56, -L / 2 + 1.4)
      s.add(edge)
    }
    // slender pylons into the sea
    const pyMat = new THREE.MeshStandardMaterial({ color: 0x120c1a, roughness: 0.5, metalness: 0.4 })
    for (let z = 2; z > -L - 6; z -= 6) for (const sgn of [-1, 1]) {
      const py = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 14, 16), pyMat)
      py.position.set(sgn * (deckW / 2 - 0.5), -7.5, z)
      s.add(py)
    }

    // pit / masking unit: dark pit behind pins
    const pit = new THREE.Mesh(new THREE.BoxGeometry(LANE_W + 0.5, 0.4, 0.9), new THREE.MeshStandardMaterial({ color: 0x07050b, roughness: 0.9 }))
    pit.position.set(0, -0.2, -L - 0.45)
    s.add(pit)
    const kick = new THREE.MeshPhysicalMaterial({ color: 0x1b1428, roughness: 0.3, metalness: 0.6, clearcoat: 1 })
    for (const sgn of [-1, 1]) {
      const kb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 1.6), kick)
      kb.position.set(sgn * (LANE_W / 2 + GUTTER_R * 2 + 0.02), 0.3, -L + 0.3)
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
    const z = -LANE_L - 1.25
    const arch = new THREE.Group()
    const frameMat = new THREE.MeshPhysicalMaterial({ color: 0x120d1c, roughness: 0.28, metalness: 0.7, clearcoat: 1 })
    const header = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.2), frameMat)
    header.position.set(0, 1.3, z)
    arch.add(header)
    for (const sgn of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 0.16), frameMat)
      post.position.set(sgn * (W / 2 - 0.08), 0.6, z)
      post.castShadow = true
      arch.add(post)
    }
    // thin cyan/violet edge light on the arch (restrained)
    const edge = new THREE.Mesh(new THREE.BoxGeometry(W, 0.018, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00e0e8).multiplyScalar(2) }))
    edge.position.set(0, 1.3 - H / 2 - 0.01, z + 0.11)
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
    face.position.set(0, 1.3, z + 0.105)
    arch.add(face)
    s.add(arch)
  }

  /* resort framing: palms in lit planters both sides, low glass rails */
  private resort() {
    const s = this.scene
    const frondMat = new THREE.MeshStandardMaterial({ map: frondTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, color: 0xffffff, emissive: 0x1a3020 })
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a26, roughness: 0.9 })
    const planterMat = new THREE.MeshPhysicalMaterial({ color: 0x15101e, roughness: 0.3, metalness: 0.3, clearcoat: 1 })
    const rimCyan = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00d8e4).multiplyScalar(1.6) })
    const zs = [-0.6, -LANE_L - 3.0, -LANE_L - 6.0]
    zs.forEach((z, i) => {
      for (const sgn of [-1, 1]) {
        const x = sgn * [2.15, 1.85, 2.5][i]
        const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.3, 0.55, 40), planterMat)
        pl.position.set(x, 0.27, z)
        pl.castShadow = pl.receiveShadow = true
        s.add(pl)
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.012, 8, 64), rimCyan)
        rim.rotation.x = Math.PI / 2; rim.position.set(x, 0.55, z)
        s.add(rim)
        const glow = new THREE.PointLight(0x40e0e8, 1.2, 2.4, 2); glow.position.set(x, 0.9, z); s.add(glow)
        const h = 3.6 + ((i * 3 + (sgn > 0 ? 1 : 0)) % 3) * 0.5
        const p = palm(h, i === 0 ? -sgn * 0.45 : sgn * 0.5, frondMat, trunkMat)
        p.position.set(x, 0.5, z)
        s.add(p)
      }
    })
    // glass rail at deck edges
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, transmission: 0, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0 })
    for (const sgn of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.9, LANE_L + 9), glass)
      r.position.set(sgn * 3.78, 0.45, -LANE_L / 2 + 1.4)
      s.add(r)
    }
  }

  private ocean() {
    const s = this.scene
    const geo = new THREE.PlaneGeometry(2400, 2400, 1, 1)
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x0a0418, roughness: 0.05, metalness: 1.0, envMapIntensity: 1.4 })
    // ripple normals
    const c = document.createElement('canvas'); c.width = c.height = 256
    const g = c.getContext('2d')!
    const img = g.createImageData(256, 256)
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const nx = Math.sin(x * 0.18 + Math.sin(y * 0.07) * 2) * 0.5 + Math.sin((x + y) * 0.11) * 0.3
      const ny = Math.cos(y * 0.21 + Math.sin(x * 0.05) * 2) * 0.5
      const i = (y * 256 + x) * 4
      img.data[i] = 128 + nx * 60; img.data[i + 1] = 128 + ny * 60; img.data[i + 2] = 255; img.data[i + 3] = 255
    }
    g.putImageData(img, 0, 0)
    const n = new THREE.CanvasTexture(c); n.wrapS = n.wrapT = THREE.RepeatWrapping; n.repeat.set(220, 220)
    mat.normalMap = n; mat.normalScale.set(0.35, 0.35)
    const sea = new THREE.Mesh(geo, mat)
    sea.rotation.x = -Math.PI / 2
    sea.position.y = -2.2
    s.add(sea)
    this.dynamic.push({ tick: (t) => { n.offset.set(t * 0.004, t * 0.006) } })
    // sun glitter path on the water toward the horizon
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(14, 900), new THREE.MeshBasicMaterial({ color: 0xffa060, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))
    gl.rotation.x = -Math.PI / 2; gl.position.set(0, -2.15, -470); (gl.material as THREE.MeshBasicMaterial).opacity = 0.75
    s.add(gl)
  }

  /* distant futuristic skyline across the water (designed rhythm, not random boxes) */
  private skyline() {
    const s = this.scene
    const wt = windowsTex()
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x1a1028, roughness: 0.5, metalness: 0.4, emissive: 0xffffff, emissiveMap: wt, emissiveIntensity: 1.4 })
    const g = new THREE.Group()
    // two clusters left and right of the vanishing point keep the pins' backdrop clean
    const cluster = (cx: number, count: number, maxH: number) => {
      for (let i = 0; i < count; i++) {
        const f = i / (count - 1)
        const h = maxH * (0.35 + 0.65 * Math.sin(Math.PI * f) ** 1.4) * (0.85 + ((i * 7) % 5) * 0.06)
        const w = 9 + ((i * 5) % 4) * 3
        const geo = new THREE.CylinderGeometry(w * 0.42, w * 0.55, h, 6, 1)
        const m = new THREE.Mesh(geo, towerMat)
        m.position.set(cx + (i - count / 2) * 13, -2.2 + h / 2, -330 - ((i * 13) % 5) * 18)
        m.rotation.y = i * 0.4
        g.add(m)
        if (h > maxH * 0.7) {
          const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 1.2, h * 0.25, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8fd0).multiplyScalar(1.2) }))
          spire.position.set(m.position.x, -2.2 + h + h * 0.12, m.position.z)
          g.add(spire)
        }
      }
    }
    cluster(-82, 7, 38)
    cluster(80, 7, 32)
    s.add(g)
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
      cam.position.set(0.0, 0.95, -LANE_L + 6.6)
      cam.lookAt(0, 0.55, -LANE_L - 1.2)
    } else if (this.view === 'ball') {
      cam.fov = 34
      cam.position.set(0.3, 0.3, 1.45)
      cam.lookAt(0, 0.11, 0.58)
    } else {
      // low cinematic third-person behind the ball; portrait needs a wider vertical FOV
      cam.fov = aspect < 0.7 ? 40 : 32
      const sway = Math.sin(t * 0.25) * 0.015
      cam.position.set(sway, 0.5, 2.0)
      cam.lookAt(0, -0.42, -LANE_L)
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
