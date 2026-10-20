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

export class UfoChaser {
  group = new THREE.Group()
  private craft = new THREE.Group()
  private eyeMat: THREE.MeshStandardMaterial
  private bladeLights: THREE.MeshStandardMaterial[] = []
  private under: THREE.ShaderMaterial
  private beam: THREE.Mesh
  private beamMat: THREE.ShaderMaterial
  private spot: THREE.Mesh
  private spotMat: THREE.ShaderMaterial
  private z = 2.4
  private y = 1.6
  private x = 0
  private threatS = 0
  private near = 0
  private tmp = new THREE.Vector3()
  /** world size (QA): diameter × height */
  static readonly SIZE = { w: R * 3.4 * SCALE, h: 0.55 * SCALE }

  constructor() {
    this.group.add(this.craft)
    this.craft.scale.setScalar(SCALE)
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
    const hullMat = addRim(new THREE.MeshStandardMaterial({ color: '#4a4652', metalness: 0.85, roughness: 0.3, envMapIntensity: 2.2, emissive: new THREE.Color('#3a0810'), emissiveIntensity: 1 }), new THREE.Color('#ff4040'), 1.6, 2.2)
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
      const m = new THREE.MeshStandardMaterial({ color: '#200', emissive: new THREE.Color('#ff1a1a'), emissiveIntensity: 3 })
      this.bladeLights.push(m)
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), m)
      tip.position.set(Math.cos(a - 0.35) * (R * 0.85 + 0.6), -0.01, Math.sin(a - 0.35) * (R * 0.85 + 0.6))
      this.craft.add(tip)
    }
    // the red sensor band (menacing "eye" all the way round)
    this.eyeMat = new THREE.MeshStandardMaterial({ color: '#300', emissive: new THREE.Color('#ff2020'), emissiveIntensity: 4 })
    const eye = new THREE.Mesh(new THREE.TorusGeometry(R * 0.36, 0.028, 8, 48), this.eyeMat)
    eye.rotation.x = Math.PI / 2
    eye.position.y = 0.17
    this.craft.add(eye)
    // red under-glow
    this.under = glowMat('#ff2030')
    const ug = new THREE.Mesh(new THREE.CircleGeometry(R * 2.2, 32), this.under)
    ug.rotation.x = Math.PI / 2
    ug.position.y = -0.17
    this.craft.add(ug)
    // searchlight cone from the belly onto the runner (aimed every frame in aim())
    this.beamMat = glowMat('#ff3a3a', BEAM_FRAG)
    const bg = new THREE.CylinderGeometry(0.05, 0.6, 1, 24, 1, true)
    bg.translate(0, -0.5, 0) // apex at the origin, opens along −Y
    bg.rotateX(-Math.PI / 2) // → opens along +Z
    this.beam = new THREE.Mesh(bg, this.beamMat)
    this.group.add(this.beam)
    // the lit spot on the deck around his feet
    this.spotMat = glowMat('#ff2a2a')
    this.spot = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), this.spotMat)
    this.spot.rotation.x = -Math.PI / 2
    this.group.traverse((o) => {
      o.frustumCulled = false
    })
    this.spot.frustumCulled = false
  }

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
    this.threatS += (threat - this.threatS) * (1 - Math.exp(-dt * (threat > this.threatS ? 9 : 2.2)))
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
    this.group.position.set(this.x, this.y + bob, this.z)
    this.craft.rotation.set(-0.22 + 0.04 * Math.sin(time * 2.1), time * 0.9, 0.05 * Math.sin(time * 1.7))
    this.group.visible = true
    const pulse = 0.5 + 0.5 * Math.sin(time * (5 + 6 * near))
    this.eyeMat.emissiveIntensity = 2.5 + 3 * pulse
    for (let i = 0; i < this.bladeLights.length; i++) this.bladeLights[i].emissiveIntensity = (i + Math.floor(time * 8)) % 3 === 0 ? 5 : 1.8
    this.under.uniforms.uAmp.value = 0.7 + 0.6 * near
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
    this.beamMat.uniforms.uAmp.value = visible ? 0.35 + 0.45 * this.near : 0
    this.spot.position.set(target.x, 0.03, target.z)
    this.spot.visible = visible
    this.spotMat.uniforms.uAmp.value = 0.35 + 0.4 * this.near
  }
}
