/**
 * UFO chaser — the enemy. A dark, angular hunter craft (gunmetal hull, a ring of swept blades, a
 * single glowing red sensor band, red under-glow) that sweeps a red searchlight onto the astronaut.
 * Deliberately unlike the small plain silver saucers that fly past in the background.
 * `threat` 0..1 pulls it in: hanging just behind / below him when you run clean, rushing right onto
 * his heels after a stumble or a lost life (Temple Run's monkeys), overtaking him when it catches you.
 */
import * as THREE from 'three'
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
export type UfoVariant = 'v13' | 'a' | 'b' | 'c'
const UFO_KEY = 'fr.ufoVariant'
export function pickUfoVariant(): UfoVariant {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('ufo')
    if (q === 'a' || q === 'b' || q === 'c' || q === 'v13') {
      globalThis.localStorage?.setItem(UFO_KEY, q)
      return q
    }
    const s = globalThis.localStorage?.getItem(UFO_KEY)
    if (s === 'a' || s === 'b' || s === 'c' || s === 'v13') return s
  } catch {
    /* private mode */
  }
  return 'v13'
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
  private swoopV = 0
  private lastSwoopX = 0
  private lunge = 0

  constructor(variant: UfoVariant = 'v13') {
    this.variant = variant
    this.group.add(this.craft)
    this.baseScale = variant === 'a' ? SCALE * 1.45 : variant === 'b' ? SCALE * 1.7 : variant === 'c' ? SCALE * 0.62 : SCALE
    this.craft.scale.setScalar(this.baseScale)
    if (variant === 'a') {
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
    const prof = [
      new THREE.Vector2(0.0, -0.13),
      new THREE.Vector2(R * 0.5, -0.12),
      new THREE.Vector2(R * 0.95, -0.03),
      new THREE.Vector2(R * 1.05, 0.0),
      new THREE.Vector2(R * 0.95, 0.04),
      new THREE.Vector2(R * 0.5, 0.1),
      new THREE.Vector2(0.0, 0.11),
    ]
    const silver = addRim(new THREE.MeshStandardMaterial({ color: '#d9dde6', metalness: 0.95, roughness: 0.18, envMapIntensity: 2.6, emissive: new THREE.Color('#1a2230'), emissiveIntensity: 1 }), new THREE.Color('#bfe9ff'), 1.4, 2.4)
    this.craft.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 48), silver))
    // glass dome with a faint cyan cabin glow
    this.eyeMat = new THREE.MeshStandardMaterial({ color: '#6fd8ff', emissive: new THREE.Color('#38c8ff'), emissiveIntensity: 1.2, transparent: true, opacity: 0.75, metalness: 0.2, roughness: 0.05 })
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 0.42, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), this.eyeMat)
    dome.position.y = 0.09
    this.craft.add(dome)
    // spinning ring of rim lights (alternating colours chase round)
    this.ring = new THREE.Group()
    const cols = ['#ffd84a', '#ff4ad8', '#4affd2']
    const N = 14
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      const m = new THREE.MeshStandardMaterial({ color: '#111', emissive: new THREE.Color(cols[i % 3]), emissiveIntensity: 3 })
      this.bladeLights.push(m)
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), m)
      b.position.set(Math.cos(a) * R * 1.0, 0.0, Math.sin(a) * R * 1.0)
      this.ring.add(b)
    }
    this.craft.add(this.ring)
    this.under = glowMat('#6ff0ff')
    const ug = new THREE.Mesh(new THREE.CircleGeometry(R * 2.0, 32), this.under)
    ug.rotation.x = Math.PI / 2
    ug.position.y = -0.14
    this.craft.add(ug)
    // wide tractor beam
    this.beamMat = glowMat('#8ff6ff', BEAM_FRAG)
    const bg = new THREE.CylinderGeometry(0.12, 1.05, 1, 32, 1, true)
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
      this.pose.y = -0.6 + 0.1 * near + over * 0.35 + 0.03 * Math.sin(time * 2.2)
      this.pose.dist = 6.4 - 2.6 * near + hunt * 1.4 * (1 - near) + back * 1.5 - over * 1.2
    } else if (v === 'b') {
      // large and looming above and behind, swooping side to side; dives lower when it closes in
      const sx = 0.42 * Math.sin(time * 0.75) + 0.08 * Math.sin(time * 1.9)
      this.swoopV = (sx - this.lastSwoopX) / Math.max(dt, 1e-3)
      this.lastSwoopX = sx
      this.pose.x = sx * (1 - 0.5 * near)
      this.pose.y = 0.12 - 0.42 * near + over * 0.2 + 0.04 * Math.sin(time * 1.6)
      this.pose.dist = 8.2 - 3.6 * near + back * 2 - over * 1.4
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
    if (v === 'a') {
      this.craft.rotation.set(-0.3 + 0.03 * Math.sin(time * 1.4), 0, 0.04 * Math.sin(time * 1.1))
      if (this.ring) this.ring.rotation.y = time * 2.6
    } else if (v === 'b') this.craft.rotation.set(-0.25, time * 0.7, THREE.MathUtils.clamp(-this.swoopV * 0.5, -0.45, 0.45))
    else this.craft.rotation.set(-0.42 + 0.04 * Math.sin(time * 2.1), time * (v === 'c' ? 2.2 : 0.9), 0.05 * Math.sin(time * 1.7))
    this.group.visible = true
    const pulse = 0.5 + 0.5 * Math.sin(time * (5 + 6 * near))
    this.eyeMat.emissiveIntensity = v === 'a' ? 1 + 0.8 * pulse + 2 * this.flare : 2.5 + 3 * pulse + 3 * this.flare
    for (let i = 0; i < this.bladeLights.length; i++) this.bladeLights[i].emissiveIntensity = (i + Math.floor(time * 8)) % 3 === 0 ? 5 : 1.8
    this.under.uniforms.uAmp.value = 0.7 + 0.6 * near + 1.2 * this.flare
    this.beamMat.uniforms.uTime.value = time
  }

  /** Point the searchlight at the runner (local frame), after any on-screen clamping of the craft. */
  aim(target: THREE.Vector3, visible: boolean) {
    const g = this.group.position
    this.tmp.copy(target).sub(g)
    const len = Math.max(0.5, this.tmp.length())
    this.beam.position.set(0, -0.12, 0)
    // cone opens along +Z of the beam mesh; Object3D.lookAt points +Z at the target (scene = local frame)
    this.beam.lookAt(target)
    this.beam.scale.set(1, 1, len)
    this.beam.visible = visible
    this.beamMat.uniforms.uAmp.value = visible ? (this.variant === 'a' ? 0.5 : 0.35) + 0.45 * this.near + 1.4 * this.flare : 0
    this.spot.position.set(target.x, 0.03, target.z)
    this.spot.visible = visible
    this.spotMat.uniforms.uAmp.value = 0.35 + 0.4 * this.near + 0.9 * this.flare
  }
}
