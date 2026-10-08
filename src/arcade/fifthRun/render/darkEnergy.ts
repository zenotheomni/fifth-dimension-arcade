/**
 * Dark energy chaser — a compact, living knot of black smoke that hunts the runner from behind
 * (Temple Run's monkeys, not a wall of fog). ~0.95 m wide × 1.05 m tall: a cluster of soft round
 * smoke puffs (camera-facing, radial falloff — no hard edges anywhere) around a dim violet core with
 * two glinting eyes. `threat` 0..1 pulls it in: off-frame behind the camera's feet when you run clean,
 * a small patch at the bottom of the frame after a stumble, on your heels when it catches you.
 */
import * as THREE from 'three'

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

const FRAG = /* glsl */ `
uniform float uTime; uniform float uSeed; uniform float uFade; uniform float uThreat;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
void main(){
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;                       // 0 centre → 1 at the quad's inscribed circle
  vec2 p = c * 3.2 + vec2(uSeed * 5.1, uSeed * 2.3);
  float d = fbm(p + vec2(0.0, -uTime * 0.9) + fbm(p * 1.7 - uTime * 0.35));
  float edge = r + (d - 0.5) * 0.55;
  float a = 1.0 - smoothstep(0.42, 0.92, edge);   // round, billowing silhouette; 0 well inside the corners
  a *= 0.92;
  vec3 col = mix(vec3(0.02, 0.016, 0.03), vec3(0.16, 0.13, 0.2), smoothstep(0.45, 0.8, d));
  float wisp = (1.0 - smoothstep(0.0, 0.05, abs(fbm(p * 2.4 + uTime * 0.6) - 0.5))) * (1.0 - smoothstep(0.2, 0.75, r));
  col += vec3(0.5, 0.22, 1.0) * wisp * (0.45 + 0.8 * uThreat);
  col += vec3(0.16, 0.06, 0.3) * (1.0 - smoothstep(0.55, 0.95, edge)) * smoothstep(0.35, 0.8, edge);  // violet rim light
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * uFade);
}`

const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uFade; varying vec2 vUv;
void main(){ float r = length(vUv - 0.5) * 2.0; float g = 1.0 - smoothstep(0.0, 1.0, r); g = g * g;
  gl_FragColor = vec4(uColor * g * uFade, 1.0); }`

/** Puff layout: [x, y, size, seed]. Fits inside ~0.95 × 1.05 m. */
const PUFFS: [number, number, number, number][] = [
  [0, 0.5, 0.95, 0.1],
  [-0.2, 0.32, 0.6, 0.7],
  [0.22, 0.34, 0.58, 1.3],
  [-0.1, 0.78, 0.55, 2.1],
  [0.14, 0.76, 0.5, 2.9],
]

export class DarkEnergy {
  group = new THREE.Group()
  private body = new THREE.Group()
  private mats: THREE.ShaderMaterial[] = []
  private glowMats: THREE.ShaderMaterial[] = []
  private eyes: THREE.Mesh[] = []
  private z = 4.6
  private x = 0
  private threatS = 0
  /** world width / height of the chaser (for QA). */
  static readonly SIZE = { w: 0.95, h: 1.05 }

  constructor(_layers = 4) {
    void _layers
    this.group.add(this.body)
    PUFFS.forEach(([x, y, size, seed], i) => {
      const m = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uFade: { value: 1 }, uThreat: { value: 0 } },
        vertexShader: VERT,
        fragmentShader: FRAG,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m)
      mesh.position.set(x, y, -i * 0.04)
      mesh.renderOrder = 18
      mesh.frustumCulled = false
      this.mats.push(m)
      this.body.add(mesh)
    })
    // faint violet core glow + two eye glints (additive, round)
    const glow = (color: string, size: number) => {
      const m = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(color) }, uFade: { value: 1 } },
        vertexShader: VERT,
        fragmentShader: GLOW_FRAG,
      })
      this.glowMats.push(m)
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m)
      mesh.renderOrder = 19
      mesh.frustumCulled = false
      return mesh
    }
    const core = glow('#5a2aa8', 1.1)
    core.position.set(0, 0.55, 0.02)
    this.body.add(core)
    for (const ex of [-0.11, 0.11]) {
      const e = glow('#d9b8ff', 0.16)
      e.position.set(ex, 0.72, 0.06)
      this.eyes.push(e)
      this.body.add(e)
    }
  }

  /**
   * threat 0..1 (1 = on your heels, >1 = caught); fade 0 hides (logo surge leaves it behind).
   * `camQ` billboards the puffs to the camera.
   */
  update(time: number, dt: number, threat: number, runnerX: number, fade: number, camQ?: THREE.Quaternion) {
    this.threatS += (threat - this.threatS) * (1 - Math.exp(-dt * 3))
    // metres behind the runner's feet: clean ≈ 4.6 (below the frame) → stumble (0.75) ≈ 2.0 → caught ≈ 0.5
    const target = Math.max(0.5, 4.6 - this.threatS * 3.5)
    this.z += (target - this.z) * (1 - Math.exp(-dt * 4))
    this.x += (runnerX - this.x) * (1 - Math.exp(-dt * 5))
    this.group.position.set(this.x, 0, this.z)
    if (camQ) this.body.quaternion.copy(camQ)
    // gentle hover / breathing so it reads as alive
    this.body.position.y = 0.04 * Math.sin(time * 3.1)
    const br = 1 + 0.05 * Math.sin(time * 4.3)
    this.body.scale.set(br, 2 - br, 1)
    this.group.visible = fade > 0.01
    for (const m of this.mats) {
      m.uniforms.uTime.value = time
      m.uniforms.uFade.value = fade
      m.uniforms.uThreat.value = Math.min(1, this.threatS)
    }
    const blink = Math.sin(time * 1.7) > 0.96 ? 0.15 : 1
    for (const m of this.glowMats) m.uniforms.uFade.value = fade * (0.6 + 0.4 * Math.min(1, this.threatS))
    for (const e of this.eyes) e.scale.set(1, blink, 1)
  }
}
