/**
 * UFO chaser — a small flying saucer hunting the astronaut from behind (Temple Run's monkeys, not a
 * mothership). ~0.95 m across: brushed-metal disc, glowing glass dome, a ring of chasing rim lights
 * and a violet under-glow, so it reads clearly against the dark road. `threat` 0..1 pulls it in:
 * below the frame when you run clean, a small craft at the bottom of the frame after a stumble,
 * right on your heels (tractor beam on) when it catches you.
 */
import * as THREE from 'three'

const R = 0.48 // disc radius (m)

const GLOW_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const GLOW_FRAG = /* glsl */ `uniform vec3 uColor; uniform float uAmp; varying vec2 vUv;
void main(){ float r = length(vUv - 0.5) * 2.0; float g = 1.0 - smoothstep(0.0, 1.0, r); gl_FragColor = vec4(uColor * g * g * uAmp, 1.0); }`
const BEAM_FRAG = /* glsl */ `uniform vec3 uColor; uniform float uAmp; uniform float uTime; varying vec2 vUv;
void main(){ float edge = 1.0 - smoothstep(0.25, 0.5, abs(vUv.x - 0.5)); float rings = 0.6 + 0.4 * sin(vUv.y * 40.0 + uTime * 12.0);
  gl_FragColor = vec4(uColor * edge * rings * (0.35 + 0.65 * vUv.y) * uAmp, 1.0); }`

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
  private lights: THREE.MeshStandardMaterial[] = []
  private under: THREE.ShaderMaterial
  private beam: THREE.Mesh
  private beamMat: THREE.ShaderMaterial
  private z = 4.8
  private x = 0
  private threatS = 0
  /** world size (QA): diameter × height */
  static readonly SIZE = { w: R * 2, h: 0.42 }

  constructor() {
    this.group.add(this.craft)
    // disc hull: lathe profile (rim → top shoulder → bottom bowl)
    const prof = [
      new THREE.Vector2(0.0, -0.12),
      new THREE.Vector2(R * 0.45, -0.11),
      new THREE.Vector2(R * 0.85, -0.05),
      new THREE.Vector2(R, 0.0),
      new THREE.Vector2(R * 0.92, 0.04),
      new THREE.Vector2(R * 0.55, 0.09),
      new THREE.Vector2(0.0, 0.1),
    ]
    const hullMat = new THREE.MeshStandardMaterial({ color: '#d4d9e4', metalness: 0.65, roughness: 0.3, envMapIntensity: 1.6, emissive: new THREE.Color('#2b3550'), emissiveIntensity: 0.9 })
    const hull = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), hullMat)
    this.craft.add(hull)
    const band = new THREE.Mesh(new THREE.TorusGeometry(R * 0.97, 0.022, 8, 48), new THREE.MeshStandardMaterial({ color: '#3b3f4a', metalness: 0.8, roughness: 0.4 }))
    band.rotation.x = Math.PI / 2
    this.craft.add(band)
    // glass dome with a cool inner glow
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.42, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#9ff', emissive: new THREE.Color('#2ad8ff'), emissiveIntensity: 2.6, metalness: 0.1, roughness: 0.15, transparent: true, opacity: 0.9 }),
    )
    dome.position.y = 0.08
    this.craft.add(dome)
    // rim light ring (chasing pattern)
    const cols = ['#ff3dbb', '#39f3ff', '#ffd23a']
    const N = 12
    for (let i = 0; i < N; i++) {
      const m = new THREE.MeshStandardMaterial({ color: '#fff', emissive: new THREE.Color(cols[i % 3]), emissiveIntensity: 3 })
      this.lights.push(m)
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), m)
      const a = (i / N) * Math.PI * 2
      b.position.set(Math.cos(a) * R * 0.99, 0.0, Math.sin(a) * R * 0.99)
      this.craft.add(b)
    }
    // violet under-glow disc + tractor beam (on when it's close)
    this.under = glowMat('#9a5bff')
    const ug = new THREE.Mesh(new THREE.CircleGeometry(R * 1.5, 32), this.under)
    ug.rotation.x = Math.PI / 2
    ug.position.y = -0.13
    this.craft.add(ug)
    this.beamMat = glowMat('#b58cff', BEAM_FRAG)
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.35, R * 0.9, 1, 24, 1, true), this.beamMat)
    this.beam.position.y = -0.6
    this.craft.add(this.beam)
    this.group.traverse((o) => {
      o.frustumCulled = false
    })
  }

  /**
   * threat 0..1 (1 = on your heels, >1 = caught); fade 0 hides it (logo surge leaves it behind).
   */
  update(time: number, dt: number, threat: number, runnerX: number, fade: number, _camQ?: THREE.Quaternion) {
    void _camQ
    this.threatS += (threat - this.threatS) * (1 - Math.exp(-dt * 3))
    const k = Math.min(1.5, this.threatS)
    // metres behind the runner: clean ≈ 5 (below the frame) → stumble (0.75) ≈ 2.0 → caught ≈ 0.9
    const target = Math.max(0.9, 5 - k * 4) + (1 - fade) * 4
    this.z += (target - this.z) * (1 - Math.exp(-dt * 4))
    this.x += (runnerX - this.x) * (1 - Math.exp(-dt * 4.5))
    // skims the road low behind him so it never sits on top of the astronaut in frame; rises to
    // beam him up when it catches him
    const hover = 0.8 + Math.max(0, k - 1) * 2.8 + 0.07 * Math.sin(time * 3.3)
    // weaves a little off his line so it never hides his feet
    const side = (runnerX <= 0 ? 1 : -1) * 0.55 * Math.min(1, Math.max(0, 1.1 - k) * 2)
    this.group.position.set(this.x + side + 0.18 * Math.sin(time * 1.3), hover, this.z)
    this.craft.rotation.set(-0.18 + 0.05 * Math.sin(time * 2.1), time * 1.6, 0.06 * Math.sin(time * 1.7))
    this.group.visible = fade > 0.01
    for (let i = 0; i < this.lights.length; i++) {
      this.lights[i].emissiveIntensity = (i + Math.floor(time * 10)) % 4 === 0 ? 5 : 1.6
    }
    this.under.uniforms.uAmp.value = 0.8 + 0.4 * Math.min(1, k)
    const beamOn = Math.max(0, Math.min(1, (k - 0.85) * 2.5))
    this.beam.visible = beamOn > 0.01
    this.beam.scale.set(1, 0.6 + hover, 1)
    this.beam.position.y = -0.13 - (0.6 + hover) / 2
    this.beamMat.uniforms.uAmp.value = beamOn * 0.8
    this.beamMat.uniforms.uTime.value = time
  }
}
