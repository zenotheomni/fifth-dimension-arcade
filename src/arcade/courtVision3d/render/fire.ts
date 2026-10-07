import * as THREE from 'three'

/**
 * Flow-state "ball on fire": CPU-simulated additive flame/ember sprites with a
 * procedural noise shader, a smoke puff on extinguish, a flowing heat shell
 * wrapping the ball and a flickering warm point light. Visual only.
 */

const VERT = /* glsl */ `
attribute float aAge;     // 0..1 normalized age
attribute float aSize;    // world size (m)
attribute float aSeed;
attribute float aKind;    // 0 flame, 1 ember, 2 smoke
uniform float uViewH;
varying float vAge;
varying float vSeed;
varying float vKind;
void main() {
  vAge = aAge; vSeed = aSeed; vKind = aKind;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float grow = aKind < 0.5 ? mix(0.75, 1.15, sin(min(aAge, 1.0) * 3.14159)) * (1.0 - aAge * 0.55)
             : aKind < 1.5 ? (1.0 - aAge)
             : mix(0.6, 2.2, aAge);
  gl_PointSize = max(1.0, aSize * grow * uViewH * projectionMatrix[1][1] * 0.5 / -mv.z);
}
`

const FRAG = /* glsl */ `
uniform float uTime;
varying float vAge;
varying float vSeed;
varying float vKind;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 1.7; a *= 0.5; }
  return v;
}
vec3 blackbody(float t) {
  // t: 1 hot core → 0 cooling
  vec3 c1 = vec3(0.35, 0.03, 0.0);
  vec3 c2 = vec3(1.0, 0.28, 0.02);
  vec3 c3 = vec3(1.0, 0.62, 0.16);
  vec3 c4 = vec3(1.0, 0.93, 0.72);
  return t < 0.33 ? mix(c1, c2, t / 0.33) : t < 0.7 ? mix(c2, c3, (t - 0.33) / 0.37) : mix(c3, c4, (t - 0.7) / 0.3);
}
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  uv.y = -uv.y;
  if (vKind > 1.5) {
    float r = length(uv);
    float n = fbm(uv * 2.2 + vSeed * 9.0 + uTime * 0.6);
    float a = smoothstep(1.0, 0.1, r + (n - 0.5) * 0.7) * (1.0 - vAge) * 0.5;
    gl_FragColor = vec4(vec3(0.16, 0.15, 0.14) + n * 0.08, a);
    return;
  }
  if (vKind > 0.5) {
    float r = length(uv);
    float a = exp(-r * r * 9.0) * (1.0 - vAge);
    gl_FragColor = vec4(blackbody(0.8 - vAge * 0.5) * 1.4 * a, 0.0);
    return;
  }
  // flame tongue: elongated upward, eroded by scrolling fbm
  vec2 q = vec2(uv.x * 1.9, uv.y * 0.75 + 0.3);
  float n = fbm(vec2(q.x * 2.4 + vSeed * 13.0, q.y * 2.0 - uTime * 3.2 - vSeed * 7.0));
  float shape = 1.0 - length(q + vec2(0.0, (n - 0.5) * 0.5));
  shape = shape * 1.45 - (1.0 - n) * 0.6 - vAge * 0.4;
  float m = smoothstep(0.0, 1.0, shape);
  if (m <= 0.002) discard;
  float heat = clamp(m * 1.3 - vAge * 0.9, 0.0, 1.0);
  vec3 col = blackbody(0.15 + heat * 0.7) * (0.35 + 0.6 * heat) * 0.6;
  float fade = 1.0 - vAge * vAge;
  // premultiplied: occludes a little of the sky so colour stays saturated
  gl_FragColor = vec4(col * m * fade, m * fade * 0.4);
}
`

const SHELL_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = position;
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
const SHELL_FRAG = /* glsl */ `
uniform float uTime;
uniform float uLevel;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), u.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), u.x), u.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), u.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), u.x), u.y), u.z);
}
void main() {
  float fres = pow(1.0 - abs(dot(vN, vV)), 1.6);
  vec3 p = vP * 22.0;
  float n = noise(p + vec3(0.0, -uTime * 6.0, 0.0)) * 0.6 + noise(p * 2.1 + vec3(0.0, -uTime * 9.0, 0.0)) * 0.4;
  float a = smoothstep(0.35, 0.9, fres * (0.6 + n)) * uLevel;
  vec3 col = mix(vec3(1.0, 0.3, 0.03), vec3(1.0, 0.75, 0.3), n);
  gl_FragColor = vec4(col * a * 0.55, 1.0);
}
`

type Pool = {
  max: number
  pos: Float32Array
  vel: Float32Array
  age: Float32Array
  life: Float32Array
  size: Float32Array
  seed: Float32Array
  kind: Float32Array
  geo: THREE.BufferGeometry
  points: THREE.Points
  next: number
}

function makePool(max: number, mat: THREE.ShaderMaterial): Pool {
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(max * 3)
  const age = new Float32Array(max).fill(1)
  const size = new Float32Array(max)
  const seed = new Float32Array(max)
  const kind = new Float32Array(max)
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('aAge', new THREE.BufferAttribute(age, 1).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1).setUsage(THREE.DynamicDrawUsage))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100)
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  return { max, pos, vel: new Float32Array(max * 3), age, life: new Float32Array(max).fill(1), size, seed, kind, geo, points, next: 0 }
}

export type FireEmitter = { pos: THREE.Vector3; prev?: THREE.Vector3; vel: THREE.Vector3; radius: number; strength: number }

export class BallFire {
  group = new THREE.Group()
  light: THREE.PointLight
  shell: THREE.Mesh
  ghostShell: THREE.Mesh
  private flame: Pool
  private smoke: Pool
  private flameMat: THREE.ShaderMaterial
  private smokeMat: THREE.ShaderMaterial
  private shellMat: THREE.ShaderMaterial
  private ghostShellMat: THREE.ShaderMaterial
  private t = 0
  private acc = 0
  private rate: number
  level = 0
  private shown = 0
  private rnd = 0x9e3779b9

  constructor(ballRadius: number, low: boolean) {
    this.rate = low ? 380 : 760
    const common = { vertexShader: VERT, fragmentShader: FRAG, depthWrite: false, transparent: true }
    this.flameMat = new THREE.ShaderMaterial({
      ...common,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: { uTime: { value: 0 }, uViewH: { value: 800 } },
    })
    this.smokeMat = new THREE.ShaderMaterial({
      ...common,
      blending: THREE.NormalBlending,
      uniforms: { uTime: { value: 0 }, uViewH: { value: 800 } },
    })
    this.flame = makePool(low ? 360 : 720, this.flameMat)
    this.smoke = makePool(60, this.smokeMat)
    this.flame.points.renderOrder = 6
    this.smoke.points.renderOrder = 5
    this.group.add(this.smoke.points, this.flame.points)

    const shellGeo = new THREE.SphereGeometry(ballRadius * 1.06, 40, 24)
    const mk = () =>
      new THREE.ShaderMaterial({
        vertexShader: SHELL_VERT,
        fragmentShader: SHELL_FRAG,
        uniforms: { uTime: { value: 0 }, uLevel: { value: 0 } },
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      })
    this.shellMat = mk()
    this.ghostShellMat = mk()
    this.shell = new THREE.Mesh(shellGeo, this.shellMat)
    this.ghostShell = new THREE.Mesh(shellGeo, this.ghostShellMat)
    this.shell.visible = this.ghostShell.visible = false
    this.shell.renderOrder = this.ghostShell.renderOrder = 7
    this.group.add(this.shell, this.ghostShell)

    this.light = new THREE.PointLight(0xff7a2a, 0, 2.6, 2)
    this.group.add(this.light)
  }

  private r() {
    // xorshift — deterministic, no Math.random dependence
    let x = this.rnd
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    this.rnd = x >>> 0
    return this.rnd / 4294967296
  }

  setViewHeight(px: number) {
    this.flameMat.uniforms.uViewH.value = px
    this.smokeMat.uniforms.uViewH.value = px
  }

  private spawn(p: Pool, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, kind: number) {
    const i = p.next
    p.next = (i + 1) % p.max
    p.pos[i * 3] = x
    p.pos[i * 3 + 1] = y
    p.pos[i * 3 + 2] = z
    p.vel[i * 3] = vx
    p.vel[i * 3 + 1] = vy
    p.vel[i * 3 + 2] = vz
    p.age[i] = 0
    p.life[i] = life
    p.size[i] = size
    p.seed[i] = this.r()
    p.kind[i] = kind
  }

  /** Smoke puff + a last burst of sparks where the fire dies. */
  puff(at: THREE.Vector3, radius: number) {
    for (let k = 0; k < 14; k++) {
      const a = this.r() * Math.PI * 2
      const s = 0.25 + this.r() * 0.35
      this.spawn(this.smoke, at.x + Math.cos(a) * radius * 0.6, at.y + (this.r() - 0.3) * radius, at.z + Math.sin(a) * radius * 0.6,
        Math.cos(a) * s * 0.5, 0.35 + this.r() * 0.4, Math.sin(a) * s * 0.5, 0.7 + this.r() * 0.5, radius * (2.2 + this.r() * 1.6), 2)
    }
    for (let k = 0; k < 10; k++) {
      this.spawn(this.flame, at.x, at.y, at.z, (this.r() - 0.5) * 1.6, 0.6 + this.r() * 1.2, (this.r() - 0.5) * 1.6, 0.4 + this.r() * 0.3, radius * 0.18, 1)
    }
  }

  /**
   * level: 0 off, 1 flow state (5+), 2 inferno (10+).
   * emitters: fire sources this frame (live ball, fading ghost ball).
   */
  update(dt: number, level: number, emitters: FireEmitter[], ballMesh: THREE.Mesh, ghostMesh: THREE.Mesh | null) {
    this.t += dt
    this.level = level
    const target = level > 0 ? (level >= 2 ? 1.35 : 1) : 0
    this.shown += (target - this.shown) * Math.min(1, dt * (target > this.shown ? 6 : 30))
    if (this.shown < 0.01) this.shown = 0
    const s = this.shown

    // Emit
    if (s > 0 && dt > 0) {
      this.acc += dt * this.rate * s
      const total = emitters.reduce((a, e) => a + e.strength, 0) || 1
      while (this.acc >= 1) {
        this.acc -= 1
        let pick = this.r() * total
        let e = emitters[0]
        for (const em of emitters) {
          pick -= em.strength
          if (pick <= 0) {
            e = em
            break
          }
        }
        if (!e) break
        // random point on the ball surface, biased to the trailing/top side
        const u = this.r() * 2 - 1
        const th = this.r() * Math.PI * 2
        const rr = Math.sqrt(1 - u * u)
        const R = e.radius * 0.9
        const ox = rr * Math.cos(th) * R
        const oy = Math.abs(u) * R * 0.8 + u * R * 0.2
        const oz = rr * Math.sin(th) * R - R * 0.55 // keep tongues off the camera-facing side
        const ember = this.r() < 0.05
        const wrap = !ember && this.r() < 0.5
        const lift = 0.7 + this.r() * 0.6
        // sub-frame position along the ball's path → continuous trail
        const sf = this.r()
        const bx = e.prev ? e.prev.x + (e.pos.x - e.prev.x) * sf : e.pos.x
        const by = e.prev ? e.prev.y + (e.pos.y - e.prev.y) * sf : e.pos.y
        const bz = e.prev ? e.prev.z + (e.pos.z - e.prev.z) * sf : e.pos.z
        // wrap tongues ride with the ball; trail tongues lag behind it
        const lag = wrap ? 0.12 : 0.6 + this.r() * 0.25
        const big = level >= 2 ? 1.3 : 1
        this.spawn(
          this.flame,
          bx + ox, by + oy, bz + oz,
          e.vel.x * (1 - lag) + ox * 2.2, e.vel.y * (1 - lag) + lift + oy, e.vel.z * (1 - lag) + oz * 2.2,
          ember ? 0.55 + this.r() * 0.5 : wrap ? (0.12 + this.r() * 0.1) * big : (0.16 + this.r() * 0.14) * big,
          ember ? e.radius * (0.05 + this.r() * 0.05) : wrap ? e.radius * (1.6 + this.r() * 0.8) * big : e.radius * (1.3 + this.r() * 0.9) * big,
          ember ? 1 : 0,
        )
      }
    }

    // Integrate
    for (const p of [this.flame, this.smoke]) {
      for (let i = 0; i < p.max; i++) {
        if (p.age[i] >= 1) continue
        p.age[i] = Math.min(1, p.age[i] + dt / p.life[i])
        const k = p.kind[i]
        const drag = k === 1 ? 0.6 : k === 2 ? 1.8 : 2.6
        const buoy = k === 1 ? 0.4 : k === 2 ? 0.5 : 2.2
        const f = Math.exp(-drag * dt)
        p.vel[i * 3] *= f
        p.vel[i * 3 + 1] = p.vel[i * 3 + 1] * f + buoy * dt
        p.vel[i * 3 + 2] *= f
        if (k === 1) {
          // embers flutter
          p.vel[i * 3] += Math.sin(this.t * 17 + p.seed[i] * 40) * dt * 1.5
        }
        p.pos[i * 3] += p.vel[i * 3] * dt
        p.pos[i * 3 + 1] += p.vel[i * 3 + 1] * dt
        p.pos[i * 3 + 2] += p.vel[i * 3 + 2] * dt
      }
      const g = p.geo
      g.attributes.position.needsUpdate = true
      g.attributes.aAge.needsUpdate = true
      g.attributes.aSize.needsUpdate = true
      g.attributes.aSeed.needsUpdate = true
      g.attributes.aKind.needsUpdate = true
    }

    this.flameMat.uniforms.uTime.value = this.t
    this.smokeMat.uniforms.uTime.value = this.t

    // Shell + light follow the live ball
    this.shell.visible = s > 0 && ballMesh.visible
    this.shell.position.copy(ballMesh.position)
    this.shell.scale.copy(ballMesh.scale)
    this.shellMat.uniforms.uTime.value = this.t
    this.shellMat.uniforms.uLevel.value = s
    const gv = !!ghostMesh && ghostMesh.visible && s > 0
    this.ghostShell.visible = gv
    if (gv && ghostMesh) {
      this.ghostShell.position.copy(ghostMesh.position)
      this.ghostShell.scale.copy(ghostMesh.scale)
      this.ghostShellMat.uniforms.uTime.value = this.t + 3
      this.ghostShellMat.uniforms.uLevel.value = s * ((ghostMesh.material as THREE.Material).opacity ?? 1)
    }
    const flick = 0.75 + 0.15 * Math.sin(this.t * 23) + 0.1 * Math.sin(this.t * 37 + 1.3)
    this.light.intensity = s * 2.2 * flick
    this.light.position.set(ballMesh.position.x, ballMesh.position.y + 0.12, ballMesh.position.z + 0.05)
  }

  dispose() {
    this.flame.geo.dispose()
    this.smoke.geo.dispose()
    this.flameMat.dispose()
    this.smokeMat.dispose()
    this.shellMat.dispose()
    this.ghostShellMat.dispose()
    this.shell.geometry.dispose()
  }
}
