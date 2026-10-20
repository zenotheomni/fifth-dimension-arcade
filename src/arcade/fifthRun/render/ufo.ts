/**
 * UFO chaser — the enemy. A dark, angular hunter craft (gunmetal hull, a ring of swept blades, a
 * single glowing red sensor band, red under-glow) that sweeps a red searchlight onto the astronaut.
 * Deliberately unlike the small plain silver saucers that fly past in the background.
 * `threat` 0..1 pulls it in: hanging just behind / below him when you run clean, rushing right onto
 * his heels after a stumble or a lost life (Temple Run's monkeys), overtaking him when it catches you.
 */
import * as THREE from 'three'
import { hullTextures } from './hull'
import { addRim } from './shaders'

const R = 0.5 // hull radius (m) before SCALE
const SCALE = 0.72

const GLOW_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const GLOW_FRAG = /* glsl */ `uniform vec3 uColor; uniform float uAmp; varying vec2 vUv;
void main(){ float r = length(vUv - 0.5) * 2.0; float g = 1.0 - smoothstep(0.0, 1.0, r); gl_FragColor = vec4(uColor * g * g * uAmp, 1.0); }`
// searchlight cone: brighter at the source and along the axis, scanning ripples
const BEAM_FRAG = /* glsl */ `uniform vec3 uColor; uniform float uAmp; uniform float uTime; varying vec2 vUv;
void main(){ float edge = 1.0 - smoothstep(0.15, 0.5, abs(vUv.x - 0.5)); float rip = 0.75 + 0.25 * sin(vUv.y * 30.0 - uTime * 9.0);
  gl_FragColor = vec4(uColor * edge * rip * (0.15 + 0.85 * vUv.y) * uAmp, 1.0); }`

function glowMat(color: string, frag = GLOW_FRAG) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uAmp: { value: 1 }, uTime: { value: 0 } },
    vertexShader: GLOW_VERT,
    fragmentShader: frag,
  })
}

/**
 * Chaser variants (v14 — Jenks picks one; ?ufo=a|b|c, remembered in localStorage):
 *   v13 (default) the red hunter at his lower right (current look)
 *   a  classic big silver saucer: spinning rim lights + cyan tractor beam, close behind, centred low
 *   b  the red hunter, large and looming above / behind him, swooping side to side
 *   c  Temple Run "monkeys": a small, toxic-green hunter always on his heels at lower right, lunging in on stumbles
 */
export type UfoVariant = 'saucer' | 'v13' | 'a' | 'b' | 'c'
const UFO_KEY = 'fr.ufoVariant'
/**
 * v15: everyone gets the hybrid "saucer" (silver flying saucer, B's looming swoop). The old variants
 * stay as hidden dev-only options via ?ufo= (never remembered); any old stored pick is cleared.
 */
export function pickUfoVariant(): UfoVariant {
  try {
    globalThis.localStorage?.removeItem(UFO_KEY)
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('ufo')
    if (q === 'a' || q === 'b' || q === 'c' || q === 'v13') return q
  } catch {
    /* private mode */
  }
  return 'saucer'
}

/** live tuning (hidden ?tune=1 panel): chaser distance / size / catch-up speed multipliers */
export const CHASER_TUNE = { dist: 1, size: 1, catchUp: 1 }

export class UfoChaser {
  group = new THREE.Group()
  private craft = new THREE.Group()
  private eyeMat!: THREE.MeshStandardMaterial
  private bladeLights: THREE.MeshStandardMaterial[] = []
  private under!: THREE.ShaderMaterial
  private beam!: THREE.Mesh
  private beamMat!: THREE.ShaderMaterial
  private spot!: THREE.Mesh
  private spotMat!: THREE.ShaderMaterial
  private z = 2.4
  private y = 1.6
  private x = 0
  private threatS = 0
  private near = 0
  /** screen-space chase pose the scene places the craft at (ndc x/y + camera distance) */
  readonly pose = { x: 0.42, y: -0.5, dist: 6 }
  private tmp = new THREE.Vector3()
  /** world size (QA): diameter × height */
  static readonly SIZE = { w: R * 3.4 * SCALE, h: 0.55 * SCALE }

  readonly variant: UfoVariant
  private baseScale = SCALE
  private ring: THREE.Group | null = null
  private engMat: THREE.MeshStandardMaterial | null = null
  private swoopV = 0
  private lastSwoopX = 0
  private lunge = 0

  constructor(variant: UfoVariant = 'saucer') {
    this.variant = variant
    this.group.add(this.craft)
    this.baseScale = variant === 'saucer' ? SCALE * 1.6 : variant === 'a' ? SCALE * 1.5 : variant === 'b' ? SCALE * 1.55 : variant === 'c' ? SCALE * 0.72 : SCALE
    this.craft.scale.setScalar(this.baseScale)
    if (variant === 'a' || variant === 'saucer') {
      this.buildSaucer()
      return
    }
    const C = variant === 'c' ? { hull: '#3d4a3a', em: '#0f2a08', rim: '#9dff3a', eye: '#b6ff2a', glow: '#7dff3a', beam: '#a8ff4a' } : { hull: '#4a4652', em: '#3a0810', rim: '#ff4040', eye: '#ff2020', glow: '#ff2030', beam: '#ff3a3a' }
    this.buildHunter(C)
  }

  /** the dark angular hunter (v13 / b / c) */
  private buildHunter(C: { hull: string; em: string; rim: string; eye: string; glow: string; beam: string }) {
    // hull: flat, wide, sharp-edged lens with a raised armoured spine — no glass bubble
    const prof = [
      new THREE.Vector2(0.0, -0.16),
      new THREE.Vector2(R * 0.55, -0.13),
      new THREE.Vector2(R, -0.02),
      new THREE.Vector2(R * 1.02, 0.0),
      new THREE.Vector2(R * 0.7, 0.09),
      new THREE.Vector2(R * 0.38, 0.14),
      new THREE.Vector2(R * 0.3, 0.22),
      new THREE.Vector2(0.0, 0.24),
    ]
    const hullMat = addRim(new THREE.MeshStandardMaterial({ color: C.hull, metalness: 0.85, roughness: 0.3, envMapIntensity: 2.2, emissive: new THREE.Color(C.em), emissiveIntensity: 1 }), new THREE.Color(C.rim), 1.6, 2.2)
    const hull = new THREE.Mesh(new THREE.LatheGeometry(prof, 6, 0, Math.PI * 2), hullMat) // hexagonal, faceted
    hull.rotation.y = Math.PI / 6
    this.craft.add(hull)
    // swept blades around the rim (spiky silhouette)
    const bladeGeo = new THREE.ConeGeometry(0.09, 0.62, 4)
    bladeGeo.rotateZ(-Math.PI / 2)
    bladeGeo.translate(0.31, 0, 0)
    const N = 6
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      const b = new THREE.Mesh(bladeGeo, hullMat)
      b.position.set(Math.cos(a) * R * 0.85, -0.01, Math.sin(a) * R * 0.85)
      b.rotation.set(0, -a - 0.35, 0)
      this.craft.add(b)
      const m = new THREE.MeshStandardMaterial({ color: '#200', emissive: new THREE.Color(C.eye), emissiveIntensity: 3 })
      this.bladeLights.push(m)
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), m)
      tip.position.set(Math.cos(a - 0.35) * (R * 0.85 + 0.6), -0.01, Math.sin(a - 0.35) * (R * 0.85 + 0.6))
      this.craft.add(tip)
    }
    // the red sensor band (menacing "eye" all the way round)
    this.eyeMat = new THREE.MeshStandardMaterial({ color: '#300', emissive: new THREE.Color(C.eye), emissiveIntensity: 4 })
    const eye = new THREE.Mesh(new THREE.TorusGeometry(R * 0.36, 0.028, 8, 48), this.eyeMat)
    eye.rotation.x = Math.PI / 2
    eye.position.y = 0.17
    this.craft.add(eye)
    // red under-glow
    this.under = glowMat(C.glow)
    const ug = new THREE.Mesh(new THREE.CircleGeometry(R * 2.2, 32), this.under)
    ug.rotation.x = Math.PI / 2
    ug.position.y = -0.17
    this.craft.add(ug)
    // searchlight cone from the belly onto the runner (aimed every frame in aim())
    this.beamMat = glowMat(C.beam, BEAM_FRAG)
    const bg = new THREE.CylinderGeometry(0.05, 0.6, 1, 24, 1, true)
    bg.translate(0, -0.5, 0) // apex at the origin, opens along −Y
    bg.rotateX(-Math.PI / 2) // → opens along +Z
    this.beam = new THREE.Mesh(bg, this.beamMat)
    this.group.add(this.beam)
    // the lit spot on the deck around his feet
    this.spotMat = glowMat(C.glow)
    this.spot = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), this.spotMat)
    this.spot.rotation.x = -Math.PI / 2
    this.group.traverse((o) => {
      o.frustumCulled = false
    })
    this.spot.frustumCulled = false
  }

  /** (a) classic big silver saucer: polished disc, glass dome, spinning rim lights, cyan tractor beam */
  private buildSaucer() {
    // ── hull: stepped gunmetal disc (brushed + polished panels, seams, rivets, vents) ──
    const P = (r: number, y: number) => new THREE.Vector2(R * r, y)
    const prof = [P(0, -0.165), P(0.2, -0.165), P(0.23, -0.13), P(0.5, -0.115), P(0.53, -0.1), P(0.9, -0.042), P(1.02, -0.014), P(1.06, 0), P(1.02, 0.015), P(0.9, 0.04), P(0.64, 0.082), P(0.61, 0.098), P(0.46, 0.112), P(0.44, 0.12), P(0, 0.12)]
    const tex = hullTextures('saucer', { base: '#8b9099', brush: 1.2, panelsU: 24, panelsV: 7, rivets: true, soot: 0.15, seed: 21 })
    const gun = addRim(new THREE.MeshPhysicalMaterial({ color: '#c3c8d0', map: tex.map, bumpMap: tex.bump, bumpScale: 1.6, roughnessMap: tex.rough, roughness: 0.42, metalness: 1, clearcoat: 0.35, clearcoatRoughness: 0.2, envMapIntensity: 1.8 }), new THREE.Color('#dff4ff'), 0.9, 3.2)
    this.craft.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 96), gun))
    const dark = new THREE.MeshStandardMaterial({ color: '#2a2e35', metalness: 0.9, roughness: 0.38, envMapIntensity: 1.4 })
    const polished = new THREE.MeshStandardMaterial({ color: '#e6e9ee', metalness: 1, roughness: 0.12, envMapIntensity: 2.2 })
    // rim band + polished trim rings
    const band = new THREE.Mesh(new THREE.TorusGeometry(R * 1.035, 0.022, 10, 96), dark)
    band.rotation.x = Math.PI / 2
    this.craft.add(band)
    for (const [r, y] of [[0.62, 0.092], [0.9, 0.041]] as const) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(R * r, 0.006, 6, 96), polished)
      t.rotation.x = Math.PI / 2
      t.position.y = y
      this.craft.add(t)
    }
    // greebles on the upper hull: armour blocks, vent grilles, antenna nubs
    const greb = new THREE.BoxGeometry(1, 1, 1)
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      const vent = i % 4 === 0
      const m = new THREE.Mesh(greb, vent ? dark : i % 2 ? polished : dark)
      const r = R * (vent ? 0.76 : 0.8)
      m.position.set(Math.cos(a) * r, vent ? 0.066 : 0.058, Math.sin(a) * r)
      m.scale.set(vent ? 0.09 : 0.035, vent ? 0.012 : 0.016, vent ? 0.06 : 0.05 + (i % 3) * 0.02)
      m.rotation.set(0, -a, vent ? 0 : -0.28)
      this.craft.add(m)
      if (vent) for (let k = -2; k <= 2; k++) {
        const slat = new THREE.Mesh(greb, polished)
        slat.position.set(Math.cos(a) * r + Math.sin(a) * k * 0.014, 0.074, Math.sin(a) * r - Math.cos(a) * k * 0.014)
        slat.scale.set(0.006, 0.004, 0.05)
        slat.rotation.y = -a
        this.craft.add(slat)
      }
    }
    // ── tinted glass dome (reflective), a dim cabin glow behind it ──
    const glass = new THREE.MeshPhysicalMaterial({ color: '#1a2b36', metalness: 0.2, roughness: 0.03, transparent: true, opacity: 0.62, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 3.2, specularIntensity: 1 })
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 0.42, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), glass)
    dome.position.y = 0.115
    dome.scale.y = 0.78
    this.craft.add(dome)
    const collar = new THREE.Mesh(new THREE.TorusGeometry(R * 0.425, 0.012, 8, 64), polished)
    collar.rotation.x = Math.PI / 2
    collar.position.y = 0.118
    this.craft.add(collar)
    this.eyeMat = new THREE.MeshStandardMaterial({ color: '#0a1218', emissive: new THREE.Color('#6fc8e0'), emissiveIntensity: 0.6, roughness: 0.6 })
    const cabin = new THREE.Mesh(new THREE.SphereGeometry(R * 0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.eyeMat)
    cabin.position.y = 0.112
    cabin.scale.y = 0.55
    this.craft.add(cabin)
    // ── running lights: small recessed white / cold-cyan lenses in the rim band, slow sweep ──
    this.ring = new THREE.Group()
    const N = 16
    const lens = new THREE.CylinderGeometry(0.014, 0.014, 0.01, 12)
    lens.rotateZ(Math.PI / 2)
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      const m = new THREE.MeshStandardMaterial({ color: '#0b0e12', emissive: new THREE.Color(i % 4 === 0 ? '#bfefff' : '#f2f6ff'), emissiveIntensity: 1.5 })
      this.bladeLights.push(m)
      const b = new THREE.Mesh(lens, m)
      b.position.set(Math.cos(a) * R * 1.058, 0, Math.sin(a) * R * 1.058)
      b.rotation.y = -a
      this.ring.add(b)
    }
    this.craft.add(this.ring)
    // ── underside: plating rings, three engine pods with cold-cyan cores, central emitter ──
    for (const [r, y] of [[0.36, -0.118], [0.72, -0.075]] as const) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(R * r, 0.01, 6, 96), dark)
      t.rotation.x = Math.PI / 2
      t.position.y = y
      this.craft.add(t)
    }
    const engCore = new THREE.MeshStandardMaterial({ color: '#05080c', emissive: new THREE.Color('#7fe6ff'), emissiveIntensity: 2.2 })
    this.engMat = engCore
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.05, 24), dark)
      pod.position.set(Math.cos(a) * R * 0.6, -0.11, Math.sin(a) * R * 0.6)
      this.craft.add(pod)
      const core = new THREE.Mesh(new THREE.CircleGeometry(0.058, 24), engCore)
      core.rotation.x = Math.PI / 2
      core.position.set(pod.position.x, -0.137, pod.position.z)
      this.craft.add(core)
    }
    const hub = new THREE.Mesh(new THREE.TorusGeometry(R * 0.14, 0.014, 8, 48), engCore)
    hub.rotation.x = Math.PI / 2
    hub.position.y = -0.168
    this.craft.add(hub)
    // heat haze / engine glow: a soft cold shimmer under the hull (no pastel disc)
    this.under = glowMat('#7fdcff')
    const ug = new THREE.Mesh(new THREE.CircleGeometry(R * 1.2, 48), this.under)
    ug.rotation.x = Math.PI / 2
    ug.position.y = -0.2
    this.craft.add(ug)
    // wide tractor beam
    this.beamMat = glowMat('#8ff6ff', BEAM_FRAG)
    const bg = new THREE.CylinderGeometry(0.16, this.variant === 'saucer' ? 1.35 : 1.05, 1, 32, 1, true)
    bg.translate(0, -0.5, 0)
    bg.rotateX(-Math.PI / 2)
    this.beam = new THREE.Mesh(bg, this.beamMat)
    this.group.add(this.beam)
    this.spotMat = glowMat('#7ff4ff')
    this.spot = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), this.spotMat)
    this.spot.rotation.x = -Math.PI / 2
    this.group.traverse((o) => {
      o.frustumCulled = false
    })
    this.spot.frustumCulled = false
  }

  /** v16: beam/spotlight only while he's slowed after a hit (eased on / off) */
  beamOn = false
  private beamK = 0

  /** opening flare (intro): 0..1 extra beam / glow */
  flare = 0

  /** The deck spot lives in the scene, not on the craft. */
  get spotlight() {
    return this.spot
  }

  /**
   * threat 0..1 (1 = on your heels, >1 = caught); fade 0 = hanging back (logo surge / intro).
   */
  update(time: number, dt: number, threat: number, runnerX: number, fade: number, _camQ?: THREE.Quaternion) {
    void _camQ
    // rush in fast on a hit, ease back out slowly
    const prevT = this.threatS
    this.threatS += (threat - this.threatS) * (1 - Math.exp(-dt * (threat > this.threatS ? 9 : 2.2) * CHASER_TUNE.catchUp))
    // (c) lunge: a quick extra snap forward whenever the threat jumps (stumble)
    this.lunge = Math.max(this.lunge * Math.exp(-dt * 3), Math.min(1, (this.threatS - prevT) * 12))
    const k = Math.min(1.5, this.threatS)
    const near = Math.min(1, k)
    this.near = near
    const back = 1 - fade
    const over = Math.max(0, k - 1) * 2
    // v11 framing (what Jenks wants): low at the lower right, right behind him and big in frame.
    // Clean: hanging just behind his right shoulder, weaving and bobbing. Stumble: lunges up to his heels.
    // Caught: overtakes and beams him. It also surges / falls back on its own so it always reads as hunting.
    const hunt = 0.18 * Math.sin(time * 0.9) + 0.1 * Math.sin(time * 2.3)
    const zT = 2.55 - 1.6 * near - over * 2.6 + back * 0.4 + hunt * (1 - near)
    const yT = 1.45 + 0.05 * near + over * 1.1 + back * 0.15
    this.z += (zT - this.z) * (1 - Math.exp(-dt * (zT < this.z ? 7 : 2.5)))
    this.y += (yT - this.y) * (1 - Math.exp(-dt * 3.5))
    const off = 1.0 - 0.45 * near - over * 0.6 + 0.12 * Math.sin(time * 1.3)
    this.x += (runnerX + off - this.x) * (1 - Math.exp(-dt * 4))
    const bob = 0.09 * Math.sin(time * 3.1)
    // screen pose (v11 / Jenks's screenshot): lower right, big, bobbing; lunges in and grows on a stumble
    const v = this.variant
    if (v === 'a') {
      // big saucer close behind, centred low; gentle hover, eases in on a stumble
      this.pose.x = 0.04 * Math.sin(time * 0.8)
      this.pose.y = -0.74 + 0.1 * near + over * 0.35 + 0.025 * Math.sin(time * 2.2)
      this.pose.dist = 3.9 - 1.2 * near + hunt * 1.4 * (1 - near) + back * 1.5 - over * 1.2
    } else if (v === 'saucer') {
      // v16: up high and a little BEHIND him (nearer the camera than he is), following and swooping
      // gently; a hit no longer brings it in — the spotlight switching on is the threat cue
      const sx = 0.26 * Math.sin(time * 0.75) + 0.05 * Math.sin(time * 1.9)
      this.swoopV = (sx - this.lastSwoopX) / Math.max(dt, 1e-3)
      this.lastSwoopX = sx
      this.pose.x = sx
      this.pose.y = 0.52 + over * 0.1 + 0.035 * Math.sin(time * 1.6)
      this.pose.dist = 4.4 + back * 2 - over * 1.4
    } else if (v === 'b') {
      // large and looming above and behind, swooping side to side; dives lower when it closes in
      const sx = 0.42 * Math.sin(time * 0.75) + 0.08 * Math.sin(time * 1.9)
      this.swoopV = (sx - this.lastSwoopX) / Math.max(dt, 1e-3)
      this.lastSwoopX = sx
      this.pose.x = sx * (1 - 0.5 * near)
      this.pose.y = 0.2 - 0.45 * near + over * 0.2 + 0.04 * Math.sin(time * 1.6)
      this.pose.dist = 4.6 - 1.6 * near + back * 2 - over * 1.4
    } else if (v === 'c') {
      // small, always right on his heels at the lower right, scurrying; lunges hard on a stumble
      this.pose.x = 0.36 - 0.12 * near - 0.1 * this.lunge + 0.05 * Math.sin(time * 4.3)
      this.pose.y = -0.56 + 0.1 * near + over * 0.35 + 0.05 * Math.abs(Math.sin(time * 6.2))
      this.pose.dist = 4.0 - 1.9 * near - 1.2 * this.lunge + 0.5 * Math.sin(time * 1.7) * (1 - near) + back * 1.2 - over * 0.8
    } else {
      // v13 (current): lower right, big, bobbing; lunges in and grows on a stumble
      this.pose.x = 0.4 - 0.1 * near - over * 0.3 + 0.06 * Math.sin(time * 1.3)
      this.pose.y = -0.5 + 0.12 * near + over * 0.35 + 0.035 * Math.sin(time * 3.1)
      this.pose.dist = 6.2 - 3.1 * near + hunt * 2.2 * (1 - near) + back * 1.5 - over * 1.2
    }
    this.pose.dist = Math.max(1.6, this.pose.dist * CHASER_TUNE.dist)
    this.craft.scale.setScalar(this.baseScale * CHASER_TUNE.size)
    this.group.position.set(this.x, this.y + bob, this.z)
    if (v === 'saucer') {
      this.craft.rotation.set(-0.18, 0, THREE.MathUtils.clamp(-this.swoopV * 0.45, -0.4, 0.4))
      if (this.ring) this.ring.rotation.y = time * 0.5
    } else if (v === 'a') {
      this.craft.rotation.set(-0.3 + 0.03 * Math.sin(time * 1.4), 0, 0.04 * Math.sin(time * 1.1))
      if (this.ring) this.ring.rotation.y = time * 0.5
    } else if (v === 'b') this.craft.rotation.set(-0.25, time * 0.7, THREE.MathUtils.clamp(-this.swoopV * 0.5, -0.45, 0.45))
    else this.craft.rotation.set(-0.42 + 0.04 * Math.sin(time * 2.1), time * (v === 'c' ? 2.2 : 0.9), 0.05 * Math.sin(time * 1.7))
    this.group.visible = true
    const pulse = 0.5 + 0.5 * Math.sin(time * (5 + 6 * near))
    this.eyeMat.emissiveIntensity = v === 'a' || v === 'saucer' ? 0.5 + 0.15 * pulse + 1.2 * this.flare : 2.5 + 3 * pulse + 3 * this.flare
    if (v === 'saucer' || v === 'a') {
      // subtle running lights: a slow sweep + a crisp strobe on two lenses
      const n = this.bladeLights.length
      for (let i = 0; i < n; i++) {
        const ph = (((time * 0.6 - i / n) % 1) + 1) % 1
        this.bladeLights[i].emissiveIntensity = 1.1 + 1.6 * Math.exp(-ph * 9) + (i % 8 === 0 && time % 1.3 < 0.06 ? 4 : 0)
      }
      if (this.engMat) this.engMat.emissiveIntensity = 2 + 0.3 * Math.sin(time * 17) + 0.2 * Math.sin(time * 41) + 1.5 * this.flare
    } else for (let i = 0; i < this.bladeLights.length; i++) this.bladeLights[i].emissiveIntensity = (i + Math.floor(time * 8)) % 3 === 0 ? 5 : 1.8
    this.under.uniforms.uAmp.value = (this.variant === 'saucer' ? 0.4 : 1) * (0.7 + 0.6 * near + 1.2 * this.flare)
    this.beamMat.uniforms.uTime.value = time
  }

  /** Point the searchlight at the runner (local frame), after any on-screen clamping of the craft. */
  aim(target: THREE.Vector3, visible0: boolean) {
    if (this.variant === 'saucer') this.beamK += ((this.beamOn ? 1 : 0) - this.beamK) * (this.beamOn ? 0.35 : 0.12)
    else this.beamK = 1
    const visible = visible0 && this.beamK > 0.02
    const g = this.group.position
    this.tmp.copy(target).sub(g)
    const len = Math.max(0.5, this.tmp.length())
    this.beam.position.set(0, -0.12, 0)
    // cone opens along +Z of the beam mesh; Object3D.lookAt points +Z at the target (scene = local frame)
    this.beam.lookAt(target)
    this.beam.scale.set(1, 1, len)
    this.beam.visible = visible
    this.beamMat.uniforms.uAmp.value = visible ? ((this.variant === 'a' || this.variant === 'saucer' ? 0.55 : 0.35) + 0.45 * this.near + 1.4 * this.flare) * this.beamK : 0
    this.spot.position.set(target.x, 0.03, target.z)
    this.spot.visible = visible
    this.spotMat.uniforms.uAmp.value = (0.35 + 0.4 * this.near + 0.9 * this.flare) * this.beamK
  }
}
