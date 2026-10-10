/**
 * Fifth Glide — three.js view of the Temple Run sky path.
 *
 * World space is laid out by `PathLayout` (straight segments + 90° corners). Each frame the whole world
 * group is moved / rotated so the runner's segment points down −Z under a smoothed yaw, so the chase
 * camera, UFO and HUD effects work in a fixed local frame and the camera swings smoothly round turns.
 * Sim → view only (no game logic here).
 */
import * as THREE from 'three'
import { BloomEffect, Effect, EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode } from 'postprocessing'
import { CORNER, laneX } from '../sim/constants'
import { keyPos, type Corner, type KeyItem, type Obstacle, type Pickup, type PowerKind } from '../sim/track'
import { buildBarrier, buildBlock, buildGantry, buildPickup, buildPipe } from './props'
import { UfoChaser } from './ufo'
import { RunnerFigure, type PoseInput, type RunnerView } from './runnerFigure'
import { loadHumanRunner } from './humanRunner'
import { neonEnvironment } from './env'
import { mergeStatic } from './merge'
import { glowMaterial, PALETTE, towerMaterial } from './shaders'
import { blobTexture, chevronTexture, glowTexture, planetTexture, shootingStarTexture, streakTexture } from './textures'
import { PathLayout, turned, type WorldPt } from './layout'
import { buildCornerSquare, buildDeckChunk, deckMaterial, DECK_HALF, glowStripMaterial } from './deck'
import { voidSkyMaterial } from './sky'
import { buildCadillac } from './cadillac'
import { buildArch, buildIsland, buildTurnSign } from './decor'

export type QualityTier = 'high' | 'low'

export type ViewState = {
  time: number
  s: number
  x: number
  y: number
  vy: number
  air: boolean
  sliding: boolean
  speed: number
  dead: boolean
  deadT: number
  deathKind: string | null
  /** lost a life (not the last): playing the fall / crash before respawning in place */
  downed: boolean
  idle: boolean
  lives: number
  hand: number
  /** dark energy closeness 0..1 */
  threat: number
  /** speed multiplier (logo surge > 1) */
  boost: number
  invuln: boolean
  /** Fifth Dimension logo power — invincible (violet shell + rim) */
  invisible: boolean
  /** last BLINK_S seconds of the logo invincibility (still invincible) */
  blink: boolean
  stumble: number
  obstacles: Obstacle[]
  keys: KeyItem[]
  pickups: Pickup[]
  corners: Corner[]
  /** track generated up to this s (deck beyond it isn't known yet) */
  generatedTo: number
  tick: number
  hz: number
  shake: number
}

/**
 * Scrubs NaN / Inf / negative pixels out of the HDR buffer before bloom. On Apple GPUs a single bad
 * pixel gets smeared by the mip-chain bloom into a flashing black square.
 */
class SanitizeEffect extends Effect {
  constructor() {
    super(
      'SanitizeEffect',
      `#if __VERSION__ >= 300
      bool frBad(float x){ return (floatBitsToUint(x) & 0x7f800000u) == 0x7f800000u; }
      #else
      bool frBad(float x){ return !(x < 1e30 && x > -1e30); }
      #endif
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
        vec3 c = inputColor.rgb;
        bool bad = frBad(c.r) || frBad(c.g) || frBad(c.b);
        outputColor = vec4(bad ? vec3(0.004, 0.005, 0.009) : clamp(c, 0.0, 512.0), 1.0);
      }`,
    )
  }
}

/** Cinematic grade after tone mapping: lifted-black crush, teal shadows / warm highlights, vignette, fine grain. */
class GradeEffect extends Effect {
  constructor() {
    super(
      'GradeEffect',
      `uniform float uTime;
      float gh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
        vec3 c = inputColor.rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(c, c * vec3(0.92, 1.0, 1.08), smoothstep(0.35, 0.0, l) * 0.5);
        c = mix(c, c * vec3(1.06, 1.0, 0.92), smoothstep(0.45, 1.0, l) * 0.4);
        c = pow(max(c, 0.0), vec3(1.06));
        vec2 q = uv - 0.5;
        c *= 1.0 - dot(q, q) * 0.62;
        c += (gh(uv * 913.0 + uTime) - 0.5) * 0.012;
        outputColor = vec4(c, inputColor.a);
      }`,
      { uniforms: new Map([['uTime', new THREE.Uniform(0)]]) },
    )
  }
}

const VIEW_AHEAD = 180
const CH = 30
/** T-junction arms are drawn this far before a side is chosen (and the unchosen one stays) */
const ARM_LEN = 120
const rnd = (() => {
  let t = 12345
  return () => {
    t = (t * 1664525 + 1013904223) >>> 0
    return t / 4294967296
  }
})()
const hash = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return v - Math.floor(v)
}

type Chunk = { key: string; deck: THREE.Mesh; glow: THREE.Mesh; used: boolean }
type Ghost = { id: number; s: number; cx: number; cz: number; fx: number; fz: number }

export class FrScene {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  tier: QualityTier
  composer: EffectComposer | null = null
  bloom: BloomEffect | null = null
  private grade: GradeEffect | null = null
  dprScale = 1
  dprCap = 2.5
  static EXPOSURE = 0.92
  static BLOOM = 0.7
  width = 1
  height = 1
  runner: RunnerView
  layout = new PathLayout()
  private runnerLight: THREE.SpotLight | null = null

  private world = new THREE.Group()
  private skyGroup = new THREE.Group()
  private sky: THREE.Mesh
  private skyMat: THREE.ShaderMaterial
  private glow: THREE.Texture
  private stars!: THREE.Points
  private starMat!: THREE.ShaderMaterial
  private comets: { mesh: THREE.Mesh; t: number; dur: number; x: number; y: number; dx: number; dy: number; wait: number }[] = []
  private skyline!: THREE.InstancedMesh
  private skylineMat!: THREE.ShaderMaterial
  private planets: THREE.Object3D[] = []
  private deckMat: THREE.MeshStandardMaterial
  private stripMat: THREE.MeshBasicMaterial
  private chunks = new Map<string, Chunk>()
  private corners = new Map<string, Chunk>()
  private ghosts: Ghost[] = []
  private keys!: THREE.InstancedMesh
  private keyHalos!: THREE.InstancedMesh
  private keyMat!: THREE.MeshBasicMaterial
  private pools: {
    barrier: { group: THREE.Group; lamp: THREE.MeshStandardMaterial }[]
    overhead: { group: THREE.Group }[]
    pipe: { group: THREE.Group; lamp: THREE.MeshStandardMaterial }[]
    block: { group: THREE.Group; lamp: THREE.MeshStandardMaterial }[]
    car: { group: THREE.Group }[]
  } = { barrier: [], overhead: [], pipe: [], block: [], car: [] }
  private arches: { group: THREE.Group; tubes: THREE.MeshStandardMaterial[] }[] = []
  private signs: ReturnType<typeof buildTurnSign>[] = []
  private islands: (ReturnType<typeof buildIsland> & { slot: number })[] = []
  dark: UfoChaser
  private pickupPools: Record<PowerKind, ReturnType<typeof buildPickup>[]> = { hand: [] }
  private smashT = new Map<number, number>()
  private blob: THREE.Mesh
  private shieldMesh: THREE.Mesh
  private shieldMat: THREE.ShaderMaterial
  private speedLines!: THREE.InstancedMesh
  private speedLineState: { a: number; r: number; z: number; len: number }[] = []
  private speedMat!: THREE.MeshBasicMaterial
  private sparks!: THREE.Points
  private sparkData: { p: THREE.Vector3; v: THREE.Vector3; life: number; max: number }[] = []
  private sparkGeo!: THREE.BufferGeometry
  private darkFade = 1
  private camX = 0
  private camY = 3.9
  private fov = 62
  private camYaw = 0
  private runYaw = 0
  private space = 0
  /** decaying offsets that hide the hop when the runner changes segment at a corner */
  private offR = new THREE.Vector2()
  private offO = new THREE.Vector2()
  private pendingTurn: { oldSeg: number; snap: boolean } | null = null
  private runnerLocal = new THREE.Vector3()
  private billQ = new THREE.Quaternion()
  private invWorldQ = new THREE.Quaternion()
  private tmpM = new THREE.Matrix4()
  private tmpQ = new THREE.Quaternion()
  private tmpV = new THREE.Vector3()
  private tmpS = new THREE.Vector3()
  private tmpE = new THREE.Euler()
  private lookT = new THREE.Vector3()
  private wp: WorldPt = { x: 0, z: 0, yaw: 0 }
  private wp2: WorldPt = { x: 0, z: 0, yaw: 0 }
  private lastS = 0
  private lastX = 0
  private emblem: THREE.Texture | null

  constructor(canvas: HTMLCanvasElement, tier: QualityTier, emblem: THREE.Texture | null, logo: THREE.Texture | null = null) {
    this.tier = tier
    this.emblem = emblem
    this.runner = new RunnerFigure()
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: tier === 'high', powerPreference: 'high-performance', alpha: false })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = FrScene.EXPOSURE
    if (tier === 'low') this.dprCap = 2
    this.camera = new THREE.PerspectiveCamera(64, 1, 0.1, 2400)
    this.scene.add(this.camera)
    this.scene.background = new THREE.Color('#05040a')
    this.scene.fog = new THREE.FogExp2('#2a1430', 0.0042)
    this.glow = glowTexture()

    // ── sky / void ──
    this.skyMat = voidSkyMaterial()
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1700, 48, 24), this.skyMat)
    this.sky.frustumCulled = false
    this.sky.renderOrder = -10
    this.skyGroup.add(this.sky)
    this.scene.add(this.skyGroup)
    this.buildEnv()
    this.buildStars()
    this.buildPlanets()
    this.buildComets()
    this.buildSkyline()

    // ── lights (sunset key from the sun side, cool rim from space) ──
    const hemi = new THREE.HemisphereLight('#8a7ab8', '#20101c', 0.55)
    const key = new THREE.DirectionalLight('#ffd2b0', 1.5)
    key.position.set(-6, 10, -12)
    const back = new THREE.DirectionalLight('#ff5aa0', 0.6)
    back.position.set(5, 4, 10)
    const fill = new THREE.DirectionalLight('#30d8d0', 0.45)
    fill.position.set(3, 2, 6)
    this.camera.add(hemi, key, back, fill)
    key.target.position.set(0, 0, -10)
    this.camera.add(key.target)

    this.deckMat = deckMaterial(null)
    this.stripMat = glowStripMaterial()
    this.scene.add(this.world)
    this.buildPools(logo ?? emblem)
    this.buildDecor()
    this.dark = new UfoChaser()
    this.scene.add(this.dark.group)
    this.buildKeys()

    // ── runner + fx ──
    this.world.add(this.runner.group)
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.55 }))
    this.blob.rotation.x = -Math.PI / 2
    this.world.add(this.blob)
    this.shieldMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader:
        'uniform float uTime; uniform float uAlpha; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(clamp(1.0 - abs(dot(vN, vV)), 0.0, 1.0), 4.2); float band = 0.5 + 0.5*sin(vN.y*18.0 - uTime*2.5); gl_FragColor = vec4(vec3(0.7,0.5,1.0) * (f*(1.1 + band*0.35)) * uAlpha, 1.0); }',
    })
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(0.95, 28, 18), this.shieldMat)
    this.shieldMesh.scale.set(0.92, 1.2, 0.85)
    this.world.add(this.shieldMesh)
    this.buildSpeedLines()
    this.buildSparks()

    if (tier === 'high') this.enableComposer()
    this.applyAnisotropy()
  }

  // ───────────────────────── builders ─────────────────────────
  private buildEnv() {
    const env = new THREE.Scene()
    const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), voidSkyMaterial())
    env.add(sky)
    const panel = (c: string, x: number, y: number, z: number, w: number, h: number, k = 3) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide }))
      m.position.set(x, y, z)
      m.lookAt(0, 0, 0)
      env.add(m)
    }
    panel('#00e0d0', -30, 4, -20, 12, 4, 3)
    panel('#ff3d8a', 30, 6, -16, 14, 4, 3)
    panel('#ffb070', 0, 6, -34, 26, 6, 2.5)
    panel('#8a4dff', 0, 25, 10, 32, 12, 1.6)
    panel('#ffffff', 0, 18, 25, 22, 8, 1.2)
    const pm = new THREE.PMREMGenerator(this.renderer)
    const rt = pm.fromScene(env, 0.02)
    this.scene.environment = rt.texture
    pm.dispose()
  }

  private buildStars() {
    const N = 1400
    const pos = new Float32Array(N * 3)
    const ph = new Float32Array(N)
    const sz = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const u = rnd() * 2 - 1
      const a = rnd() * Math.PI * 2
      const r = 1000
      const c = Math.sqrt(1 - u * u)
      pos[i * 3] = Math.cos(a) * c * r
      pos[i * 3 + 1] = u * r
      pos[i * 3 + 2] = Math.sin(a) * c * r
      ph[i] = rnd() * 6.28
      sz[i] = rnd() < 0.06 ? 3.4 : 1.1 + rnd() * 1.5
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1))
    this.starMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uAmt: { value: 0.3 } },
      vertexShader:
        'attribute float aPh; attribute float aSize; uniform float uTime; uniform float uPx; uniform float uAmt; varying float vA; void main(){ vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p; float up = normalize(position).y; vA = (0.55 + 0.45*sin(uTime*1.7 + aPh*3.0)) * mix(smoothstep(0.15, 0.5, up), 1.0, uAmt); gl_PointSize = aSize * uPx; }',
      fragmentShader:
        'uniform float uAmt; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vec3(1.0,0.92,1.0)*a*vA*1.4, 1.0); }',
    })
    this.stars = new THREE.Points(g, this.starMat)
    this.stars.frustumCulled = false
    this.skyGroup.add(this.stars)
  }

  private planetMat(tex: THREE.Texture, tint: THREE.Color, rim: THREE.Color) {
    return new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uTex: { value: tex }, uLight: { value: new THREE.Vector3(-0.6, 0.3, 0.75).normalize() }, uTint: { value: tint }, uRim: { value: rim }, uA: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; uniform vec3 uLight; uniform vec3 uTint; uniform vec3 uRim; uniform float uA; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){
          vec3 albedo = texture2D(uTex, vUv).rgb;
          float l = clamp(dot(vN, uLight) * 1.1 + 0.05, 0.0, 1.0);
          float rim = pow(1.0 - clamp(dot(vN, vV), 0.0, 1.0), 3.0);
          vec3 col = albedo * uTint * l + uRim * rim * (0.35 + l);
          gl_FragColor = vec4(col, uA);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
  }

  private buildPlanets() {
    const tex = planetTexture()
    const add = (dir: THREE.Vector3, r: number, dist: number, tint: string, rim: string, rings = false) => {
      const g = new THREE.Group()
      const p = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), this.planetMat(tex, new THREE.Color(tint), new THREE.Color(rim)))
      p.rotation.set(0.4, rnd() * 6, 0.2)
      g.add(p)
      if (rings) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(r * 1.35, r * 2.2, 96, 1),
          new THREE.ShaderMaterial({
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            uniforms: { uA: { value: 0 }, uIn: { value: r * 1.35 }, uOut: { value: r * 2.2 } },
            vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
            fragmentShader:
              'uniform float uA; uniform float uIn; uniform float uOut; varying vec3 vP; void main(){ float t = (length(vP.xy) - uIn) / (uOut - uIn); float b = 0.55 + 0.45*sin(t*70.0) * sin(t*13.0); float a = smoothstep(0.0,0.06,t)*smoothstep(1.0,0.85,t)*b*0.7; gl_FragColor = vec4(vec3(1.0,0.78,0.6)*a*1.2, a*uA); }',
          }),
        )
        ring.rotation.set(1.2, 0.3, 0.1)
        g.add(ring)
      }
      g.position.copy(dir.normalize().multiplyScalar(dist))
      this.skyGroup.add(g)
      this.planets.push(g)
    }
    add(new THREE.Vector3(0.45, 0.22, -1), 150, 1400, '#7090ff', '#5a8cff')
    add(new THREE.Vector3(-1, 0.35, -0.3), 95, 1420, '#ffb080', '#ff7a50', true)
    add(new THREE.Vector3(0.2, -0.55, 1), 380, 1500, '#4a8ad8', '#66b0ff')
  }

  private buildComets() {
    const tex = streakTexture()
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(190, 7), glowMaterial(tex, '#ffd27a', 1))
      m.visible = false
      this.skyGroup.add(m)
      this.comets.push({ mesh: m, t: 0, dur: 1.4, x: 0, y: 0, dx: -1, dy: -0.5, wait: 0.4 + i * 1.3 })
    }
  }

  /** Miami skyline far below the path at the start line (sinks away as the run heads into space). */
  private buildSkyline() {
    const geo = new THREE.BoxGeometry(1, 1, 1)
    geo.translate(0, 0.5, 0)
    this.skylineMat = towerMaterial(700, 1600)
    ;(this.skylineMat.uniforms.uFog.value as THREE.Color).set('#4a1c3a')
    const N = 170
    const mesh = new THREE.InstancedMesh(geo, this.skylineMat, N)
    const seeds = new Float32Array(N)
    // one downtown waterfront cluster ahead-left of the start line, far below the path
    const dir = -Math.PI / 2 - 0.45
    for (let i = 0; i < N; i++) {
      const u = (rnd() - 0.5) * 2
      const a = dir + u * 0.42
      const core = Math.exp(-u * u * 4)
      const r = 1150 + rnd() * 220 - core * 120
      const h = 20 + rnd() * 40 + core * (60 + 120 * rnd() * rnd())
      const w = 12 + rnd() * 20
      this.tmpQ.setFromEuler(this.tmpE.set(0, rnd() * 3, 0))
      this.tmpM.compose(this.tmpV.set(Math.cos(a) * r, -230, Math.sin(a) * r), this.tmpQ, this.tmpS.set(w, h + 120, w * (0.7 + rnd() * 0.6)))
      mesh.setMatrixAt(i, this.tmpM)
      seeds[i] = rnd()
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
    mesh.frustumCulled = false
    this.skyline = mesh
    this.skyGroup.add(mesh)
  }

  private buildPools(emblem: THREE.Texture | null) {
    const chev = chevronTexture()
    const metal = new THREE.MeshStandardMaterial({ color: '#3a3448', metalness: 0.8, roughness: 0.3 })
    const add = <T extends { group: THREE.Group }>(arr: T[], make: () => T, n: number, merge = true) => {
      for (let i = 0; i < n; i++) {
        const o = make()
        if (merge) mergeStatic(o.group)
        o.group.visible = false
        this.world.add(o.group)
        arr.push(o)
      }
    }
    add(this.pools.pipe, () => buildPipe(metal), 18)
    add(this.pools.barrier, () => buildBarrier(chev, metal), 24)
    add(this.pools.overhead, () => buildGantry(chev, metal, this.glow), 24)
    add(this.pools.block, () => buildBlock(chev, metal), 16)
    add(this.pools.car, () => buildCadillac(this.glow), 8, false)
    for (const k of ['hand'] as PowerKind[]) {
      for (let i = 0; i < 2; i++) {
        const p = buildPickup(k, this.glow, emblem)
        p.group.visible = false
        this.world.add(p.group)
        this.pickupPools[k].push(p)
      }
    }
  }

  private buildDecor() {
    for (let i = 0; i < 4; i++) {
      const a = buildArch(this.glow, this.emblem)
      a.group.visible = false
      this.world.add(a.group)
      this.arches.push(a)
    }
    for (let i = 0; i < 3; i++) {
      const s = buildTurnSign(this.glow)
      s.group.visible = false
      this.world.add(s.group)
      this.signs.push(s)
    }
    for (let i = 0; i < 14; i++) {
      const isl = buildIsland(i * 3.7 + 1)
      isl.group.visible = false
      this.world.add(isl.group)
      this.islands.push({ ...isl, slot: -1 })
    }
  }

  private buildKeys() {
    this.keyMat = new THREE.MeshBasicMaterial({
      map: shootingStarTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      color: '#ffe08a',
    })
    this.keys = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.2, 1.2), this.keyMat, 160)
    this.keys.frustumCulled = false
    this.keys.renderOrder = 2
    this.keys.count = 0
    this.world.add(this.keys)
    this.keyHalos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.45, 1.45), glowMaterial(this.glow, '#ffb02a', 0.32), 160)
    this.keyHalos.frustumCulled = false
    this.keyHalos.count = 0
    this.world.add(this.keyHalos)
  }

  private buildSpeedLines() {
    const N = 40
    this.speedMat = new THREE.MeshBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
    const g = new THREE.PlaneGeometry(0.035, 1)
    g.rotateX(-Math.PI / 2)
    this.speedLines = new THREE.InstancedMesh(g, this.speedMat, N)
    this.speedLines.frustumCulled = false
    for (let i = 0; i < N; i++) this.speedLineState.push({ a: rnd() * Math.PI * 2, r: 2.2 + rnd() * 4, z: -rnd() * 40, len: 2 + rnd() * 4 })
    this.camera.add(this.speedLines)
  }

  private buildSparks() {
    const N = 140
    this.sparkGeo = new THREE.BufferGeometry()
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    this.sparkGeo.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(N), 1))
    for (let i = 0; i < N; i++) this.sparkData.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1 })
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPx: { value: 1 } },
      vertexShader:
        'attribute float aA; uniform float uPx; varying float vA; void main(){ vA = aA; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = (aA > 0.0 ? 34.0 : 0.0) * uPx / max(1.0, -mv.z); }',
      fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if (d>0.5) discard; gl_FragColor = vec4(vec3(1.0,0.8,0.35)*smoothstep(0.5,0.0,d)*vA*2.0, 1.0); }',
    })
    this.sparks = new THREE.Points(this.sparkGeo, mat)
    this.sparks.frustumCulled = false
    this.world.add(this.sparks)
  }

  // ───────────────────────── fx hooks ─────────────────────────
  burst(lane: number, s: number, y: number, n = 10, color?: 'gold') {
    void color
    const seg = this.layout.segFor(s)
    if (seg < 0) return
    const p = this.layout.pt(seg, s, laneX(lane), this.wp2)
    let made = 0
    for (const sp of this.sparkData) {
      if (sp.life > 0) continue
      sp.p.set(p.x, y, p.z)
      sp.v.set((Math.random() - 0.5) * 5, 1.5 + Math.random() * 4, (Math.random() - 0.5) * 5)
      sp.max = 0.35 + Math.random() * 0.3
      sp.life = sp.max
      if (++made >= n) break
    }
  }

  /** The runner took corner `id`. `snap`: respawn / auto turn after a fall (no swing). */
  onTurn(id: number, dir: number, corners: Corner[], snap = false) {
    const old = this.layout.runnerSeg
    const c = corners.find((x) => x.id === id)
    // a T keeps its other arm in view for a while
    if (c && c.kind === 'T') {
      const centre = this.layout.cornerCentre(c, this.wp2)
      const seg = this.layout.segs[this.layout.segFor(c.s - 0.01)]
      if (centre && seg) {
        const [fx, fz] = turned(seg.fx, seg.fz, -dir)
        this.ghosts.push({ id: c.id, s: c.s, cx: centre.x, cz: centre.z, fx, fz })
        if (this.ghosts.length > 3) this.ghosts.shift()
      }
    }
    this.layout.onTurn(id, dir, corners)
    if (this.layout.runnerSeg !== old) this.pendingTurn = { oldSeg: old, snap }
  }

  applyAnisotropy(root: THREE.Object3D = this.scene) {
    const max = this.renderer.capabilities.getMaxAnisotropy()
    root.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
        for (const val of Object.values(m)) {
          if (val instanceof THREE.Texture && val.anisotropy !== max) {
            val.anisotropy = max
            val.needsUpdate = true
          }
        }
      }
    })
  }

  enableComposer() {
    if (this.composer) return
    const samples = Math.min(4, this.renderer.capabilities.maxSamples || 0)
    const composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: samples })
    composer.addPass(new RenderPass(this.scene, this.camera))
    composer.addPass(new EffectPass(this.camera, new SanitizeEffect()))
    this.bloom = new BloomEffect({ intensity: FrScene.BLOOM, luminanceThreshold: 0.82, luminanceSmoothing: 0.14, mipmapBlur: true, radius: 0.62, levels: 6 })
    this.grade = new GradeEffect()
    composer.addPass(new EffectPass(this.camera, this.bloom, new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }), this.grade))
    composer.addPass(new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.HIGH })))
    this.composer = composer
    this.renderer.toneMapping = THREE.NoToneMapping
    composer.setSize(this.width, this.height, false)
  }

  disableComposer() {
    if (!this.composer) return
    this.composer.dispose()
    this.composer = null
    this.bloom = null
    this.grade = null
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
  }

  resize(w: number, h: number) {
    this.width = w
    this.height = h
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap) * this.dprScale
    this.renderer.setPixelRatio(Math.max(0.75, dpr))
    this.renderer.setSize(w, h, false)
    this.composer?.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    const pr = this.renderer.getPixelRatio()
    this.starMat.uniforms.uPx.value = pr
    ;(this.sparks.material as THREE.ShaderMaterial).uniforms.uPx.value = pr * (h / 844) * 1.4
  }

  // ───────────────────────── per-frame ─────────────────────────
  update(v: ViewState, dt: number) {
    const t = v.time
    const S = v.s
    const L = this.layout
    L.sync(v.corners)
    const seg = L.runnerSeg

    // ── runner + frame origin on the path, hop offsets on a segment change ──
    const pr = L.pt(seg, S, v.x, this.wp)
    let rx = pr.x
    let rz = pr.z
    const segYaw = pr.yaw
    const po = L.pt(seg, S, 0, this.wp2)
    let ox = po.x
    let oz = po.z
    if (this.pendingTurn) {
      const pt = this.pendingTurn
      this.pendingTurn = null
      if (pt.snap) {
        this.offR.set(0, 0)
        this.offO.set(0, 0)
        this.camYaw = segYaw
        this.runYaw = segYaw
      } else {
        const a = L.pt(pt.oldSeg, this.lastS, this.lastX, this.wp2)
        this.offR.set(a.x - rx, a.z - rz)
        const b = L.pt(pt.oldSeg, this.lastS, 0, this.wp2)
        this.offO.set(b.x - ox, b.z - oz)
      }
    }
    const kOff = Math.exp(-dt * 9)
    this.offR.multiplyScalar(kOff)
    this.offO.multiplyScalar(kOff)
    rx += this.offR.x
    rz += this.offR.y
    ox += this.offO.x
    oz += this.offO.y
    this.lastS = S
    this.lastX = v.x
    // smoothed yaw (wrap-safe): the camera swings round the corner, the runner pivots faster
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
    this.runYaw += wrap(segYaw - this.runYaw) * (1 - Math.exp(-dt * 16))
    this.camYaw += wrap(segYaw - this.camYaw) * (1 - Math.exp(-dt * 6.5))

    // world → local frame: origin at the path centre under the runner, heading −Z under camYaw
    this.world.rotation.set(0, -this.camYaw, 0)
    this.tmpV.set(ox, 0, oz).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -this.camYaw)
    this.world.position.set(-this.tmpV.x, 0, -this.tmpV.z)
    this.world.updateMatrixWorld(true)
    this.invWorldQ.copy(this.world.quaternion).invert()

    // runner
    this.runner.group.position.set(rx, v.y, rz)
    this.runner.group.rotation.y = this.runYaw
    const pose: PoseInput = {
      dt,
      speed: v.speed,
      air: v.air,
      vy: v.vy,
      sliding: v.sliding,
      bank: THREE.MathUtils.clamp((v.x - (this.runner.group.userData.prevX ?? v.x)) / Math.max(dt, 1e-3) / 14, -1, 1) + wrap(segYaw - this.runYaw) * 1.2,
      dead: v.dead,
      deadT: v.deadT,
      deathKind: v.deathKind,
      idle: v.idle,
    }
    this.runner.group.userData.prevX = v.x
    this.runner.update(pose)
    // runner's yaw is applied on the group; RunnerView sets its own pose inside
    this.runner.group.rotation.y = this.runYaw
    if (v.dead && v.deathKind === 'gap') this.runner.group.position.y = -Math.min(14, v.deadT * v.deadT * 11)
    this.runnerLocal.copy(this.runner.group.position).applyMatrix4(this.world.matrixWorld)
    if (this.runnerLight) {
      this.runnerLight.position.set(this.runnerLocal.x * 0.7 - 0.6, this.runnerLocal.y + 4.2, this.runnerLocal.z + 4.6)
      this.runnerLight.target.position.set(this.runnerLocal.x, this.runnerLocal.y + 1.0, this.runnerLocal.z)
      this.runnerLight.target.updateMatrixWorld()
    }
    const flick = v.blink ? (Math.floor(t * 9) % 2 ? 0.35 : 1) : v.invuln && !v.invisible ? (Math.floor(t * 18) % 2 ? 0.35 : 1) : 1
    this.runner.group.visible = flick > 0.5
    this.blob.position.set(rx, 0.015, rz)
    const bs = Math.max(0.45, 1 - v.y * 0.3)
    this.blob.scale.set(bs, bs, bs)
    ;(this.blob.material as THREE.MeshBasicMaterial).opacity = 0.5 * Math.max(0.25, 1 - v.y * 0.4)
    this.blob.visible = !(v.dead && v.deathKind === 'gap')
    this.shieldMesh.visible = v.invisible && !v.dead && flick > 0.5
    this.shieldMesh.position.set(rx, v.y + 0.92 - (v.sliding ? 0.4 : 0), rz)
    this.shieldMat.uniforms.uTime.value = t
    this.shieldMat.uniforms.uAlpha.value = v.blink ? 0.08 + 0.12 * Math.max(0, Math.sin(t * 14)) : 0.17 + 0.05 * Math.sin(t * 5)
    this.runner.setRim(v.invisible ? '#ffd36a' : '#ff4fd0')

    this.updateCamera(v, dt)
    this.billQ.copy(this.invWorldQ).multiply(this.camera.quaternion)

    this.updateDeck(v)
    this.updateObstacles(v)
    this.updateKeys(v)
    this.updatePickups(v)
    this.updateDecor(v)
    this.updateSparks(dt)
    this.updateSky(v, dt)
    this.darkFade += ((v.invisible || v.idle ? 0 : 1) - this.darkFade) * (1 - Math.exp(-dt * (v.invisible ? 1.5 : 2.5)))
    this.dark.update(t, dt, v.dead && v.deathKind === 'caught' ? 1.5 : v.threat, this.runnerLocal.x, v.idle ? 0 : Math.max(0.0, this.darkFade), this.camera.quaternion)
    {
      const g = this.dark.group
      const p = this.ufoNdc.copy(g.position).project(this.camera)
      const d = Math.max(1, this.camera.position.z - g.position.z)
      const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * d
      const mx = (UfoChaser.SIZE.w * 0.5 + 0.1) / (halfH * this.camera.aspect)
      const my = (UfoChaser.SIZE.h * 0.5 + 0.08) / halfH
      const cx = THREE.MathUtils.clamp(p.x, -1 + mx, 1 - mx)
      const cy = THREE.MathUtils.clamp(p.y, -1 + my + 0.04, 1 - my)
      if (cx !== p.x || cy !== p.y) {
        p.x = cx
        p.y = cy
        p.unproject(this.camera)
        g.position.copy(p)
      }
    }
    const sh = this.deckMat.userData.shader as { uniforms: { uTime: { value: number } } } | undefined
    if (sh) sh.uniforms.uTime.value = t
    this.skylineMat.uniforms.uTime.value = t
    if (this.grade) (this.grade.uniforms.get('uTime') as THREE.Uniform).value = t % 100
  }

  // ── deck chunks ──
  private holesIn(obs: Obstacle[], a: number, b: number) {
    const out: { lane: number; a: number; b: number }[] = []
    for (const o of obs) {
      if (o.s > b) break
      if ((o.kind !== 'gap' && o.kind !== 'void') || o.s + o.len < a) continue
      out.push({ lane: o.lane, a: o.s, b: o.s + o.len })
    }
    return out
  }

  private useChunk(map: Map<string, Chunk>, key: string, make: () => { deck: THREE.BufferGeometry; glow: THREE.BufferGeometry }, place: (m: THREE.Object3D) => void) {
    let c = map.get(key)
    if (!c) {
      const g = make()
      const deck = new THREE.Mesh(g.deck, this.deckMat)
      const glow = new THREE.Mesh(g.glow, this.stripMat)
      deck.matrixAutoUpdate = false
      glow.matrixAutoUpdate = false
      place(deck)
      deck.updateMatrix()
      glow.position.copy(deck.position)
      glow.rotation.copy(deck.rotation)
      glow.updateMatrix()
      this.world.add(deck, glow)
      c = { key, deck, glow, used: true }
      map.set(key, c)
    }
    c.used = true
  }

  private sweep(map: Map<string, Chunk>) {
    for (const [k, c] of map) {
      if (c.used) {
        c.used = false
        continue
      }
      this.world.remove(c.deck, c.glow)
      c.deck.geometry.dispose()
      c.glow.geometry.dispose()
      map.delete(k)
    }
  }

  private updateDeck(v: ViewState) {
    const S = v.s
    const L = this.layout
    const H = DECK_HALF
    const lo0 = S - 50
    const hi0 = Math.min(S + VIEW_AHEAD, v.generatedTo - 4)
    let built = 0
    for (let i = Math.max(0, L.runnerSeg - 1); i < L.segs.length; i++) {
      const g = L.segs[i]
      const segStart = i === 0 && g.s0 === 0 ? -40 : g.s0 + H
      const segEnd = i + 1 < L.segs.length ? L.segs[i + 1].s0 - H : L.pending ? L.pending.s - H : Infinity
      const lo = Math.max(segStart, lo0)
      const hi = Math.min(segEnd, hi0)
      if (lo >= hi) continue
      for (let k = Math.floor((lo - g.s0) / CH); g.s0 + k * CH < hi; k++) {
        const a = Math.max(segStart, g.s0 + k * CH)
        const b = Math.min(segEnd, g.s0 + (k + 1) * CH, v.generatedTo - 4)
        if (b - a < 0.05) continue
        const closed = b >= segEnd - 0.01
        const key = `${g.s0}|${k}|${closed ? 'c' : b.toFixed(0)}`
        if (!this.chunks.has(key) && built > 3) continue
        if (!this.chunks.has(key)) built++
        this.useChunk(
          this.chunks,
          key,
          () => buildDeckChunk(a, b, this.holesIn(v.obstacles, a, b), i === 0 && a <= -39, closed && segEnd === Infinity),
          (m) => {
            const p = L.pt(i, a, 0, this.wp2)
            m.position.set(p.x, 0, p.z)
            m.rotation.set(0, p.yaw, 0)
          },
        )
      }
    }
    // corner squares (+ the arms of an unresolved T, + the unchosen arm of a taken T)
    const arm = (cid: number, cx: number, cz: number, fx: number, fz: number, sC: number, tag: string) => {
      for (let k = 0; k * CH < ARM_LEN; k++) {
        const d0 = H + k * CH
        const d1 = Math.min(H + ARM_LEN, d0 + CH)
        // skip pieces far behind / ahead of the runner
        if (sC + d0 > S + VIEW_AHEAD + 30 || sC + d1 < S - 60) continue
        this.useChunk(
          this.corners,
          `arm|${cid}|${tag}|${k}`,
          () => buildDeckChunk(d0, d1, [], false, d1 >= H + ARM_LEN - 0.01),
          (m) => {
            const p = PathLayout.ptFrom(cx, cz, fx, fz, d0, 0, this.wp2)
            m.position.set(p.x, 0, p.z)
            m.rotation.set(0, p.yaw, 0)
          },
        )
      }
    }
    for (let i = Math.max(0, L.runnerSeg - 1); i < L.segs.length - 1; i++) {
      const g = L.segs[i]
      const c = v.corners.find((x) => x.id === g.endId)
      if (!c || c.s > S + VIEW_AHEAD + 10 || c.s < S - 70) continue
      this.useChunk(
        this.corners,
        `sq|${c.id}`,
        () => buildCornerSquare(c.s, c.kind, { left: c.kind !== 'R', right: c.kind !== 'L', ahead: false }),
        (m) => {
          const p = L.pt(i, c.s, 0, this.wp2)
          m.position.set(p.x, 0, p.z)
          m.rotation.set(0, p.yaw, 0)
        },
      )
    }
    const pend = L.pending
    if (pend && pend.s < S + VIEW_AHEAD + 10) {
      const i = L.segFor(pend.s - 0.01)
      const g = L.segs[i]
      const p = L.pt(i, pend.s, 0, this.wp2)
      const cx = p.x
      const cz = p.z
      this.useChunk(
        this.corners,
        `sq|${pend.id}`,
        () => buildCornerSquare(pend.s, 'T', { left: true, right: true, ahead: false }),
        (m) => {
          m.position.set(cx, 0, cz)
          m.rotation.set(0, p.yaw, 0)
        },
      )
      for (const dir of [-1, 1]) {
        const [fx, fz] = turned(g.fx, g.fz, dir)
        arm(pend.id, cx, cz, fx, fz, pend.s, `p${dir}`)
      }
    }
    this.ghosts = this.ghosts.filter((gh) => gh.s > S - 90)
    for (const gh of this.ghosts) arm(gh.id, gh.cx, gh.cz, gh.fx, gh.fz, gh.s, 'g')
    this.sweep(this.chunks)
    this.sweep(this.corners)
  }

  /** Compile every material up front so the first pickup / obstacle type never stalls a frame. */
  warmup() {
    const hidden: THREE.Object3D[] = []
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o)
        o.visible = true
      }
    })
    try {
      this.renderer.compile(this.scene, this.camera)
    } catch {
      /* best effort */
    }
    for (const o of hidden) o.visible = false
  }

  async loadGltfRunner() {
    try {
      const human = await loadHumanRunner()
      const old = this.runner
      human.group.userData.prevX = old.group.userData.prevX
      this.world.remove(old.group)
      old.group.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) m.geometry?.dispose?.()
      })
      human.setEnv(neonEnvironment(this.renderer))
      this.runner = human
      this.world.add(human.group)
      const chase = new THREE.SpotLight('#eef2ff', 20, 14, 0.42, 0.85, 1.6)
      this.runnerLight = chase
      this.scene.add(chase)
      this.scene.add(chase.target)
      this.warmup()
      return true
    } catch (e) {
      console.warn('[fifth-glide] runner GLB failed, keeping procedural fallback', e)
      return false
    }
  }

  private updateObstacles(v: ViewState) {
    const S = v.s
    const L = this.layout
    const idx = { barrier: 0, overhead: 0, pipe: 0, block: 0, car: 0 }
    const now = v.time
    for (const o of v.obstacles) {
      if (o.s > S + VIEW_AHEAD + 10) break
      if (o.kind === 'gap' || o.kind === 'void') continue
      const behind = v.dead ? 12 : o.kind === 'block' || o.kind === 'car' ? 4 : 2.6
      if (o.s + o.len < S - behind) continue
      const mid = o.s + o.len / 2
      const seg = L.segFor(mid)
      if (seg < 0) continue
      let scale = 1
      let lift = 0
      if (o.smashed) {
        if (!this.smashT.has(o.id)) {
          this.smashT.set(o.id, now)
          this.burst(o.lane, o.s, 0.8, 18)
        }
        const k = (now - this.smashT.get(o.id)!) / 0.35
        if (k >= 1) continue
        scale = 1 - k
        lift = k * 2
      }
      const p = L.pt(seg, mid, laneX(o.lane), this.wp2)
      const pool = this.pools[o.kind as keyof typeof this.pools] as { group: THREE.Group; lamp?: THREE.MeshStandardMaterial }[]
      const item = pool?.[idx[o.kind as keyof typeof idx]++]
      if (!item) continue
      item.group.visible = true
      item.group.position.set(p.x, lift, p.z)
      item.group.rotation.set(0, p.yaw + (o.kind === 'car' ? ((o.variant % 9) - 4) * 0.035 : o.kind === 'block' ? ((o.variant % 7) - 3) * 0.02 : 0), 0)
      item.group.scale.setScalar(scale)
      if (item.lamp) item.lamp.emissiveIntensity = Math.floor(now * 3 + o.id) % 2 ? 3.2 : 1.2
    }
    for (const k of ['barrier', 'overhead', 'pipe', 'block', 'car'] as const) {
      const pool = this.pools[k] as { group: THREE.Group }[]
      for (let i = idx[k]; i < pool.length; i++) pool[i].group.visible = false
    }
    if (this.smashT.size > 40) this.smashT.clear()
  }

  private updateKeys(v: ViewState) {
    const S = v.s
    const L = this.layout
    let n = 0
    const t = v.time
    const fiveBoost = v.invisible ? 1.12 : 1
    for (const k of v.keys) {
      if (k.s < S - 3 && k.state !== 1) continue
      if (k.s > S + VIEW_AHEAD) break
      if (k.state === 2) continue
      const seg = L.segFor(k.s)
      if (seg < 0) continue
      const kp = keyPos(k, S)
      const p = L.pt(seg, k.s, kp.x, this.wp2)
      let x = p.x
      let z = p.z
      let y = kp.y + 0.05 + (k.mv === 1 ? Math.sin(t * 2.4 + k.a * 6) * 0.16 : Math.sin(t * 2 + k.id * 0.3) * 0.04)
      let sc = 1
      if (k.state === 1) {
        const age = (v.tick - k.takenTick) / v.hz
        if (age > 0.18 || age < 0) continue
        const f = age / 0.18
        y += f * 0.8
        sc = 1 + f * 0.6
        if (f > 0.5) sc *= 1 - (f - 0.5) * 2
        void x
        void z
      }
      if (n >= 160) break
      this.tmpQ.copy(this.billQ).multiply(this.tmpQ2.setFromAxisAngle(Z_AXIS, Math.sin(t * 1.6 + k.id) * 0.05))
      const s = sc * fiveBoost
      this.tmpM.compose(this.tmpV.set(x, y, z), this.tmpQ, this.tmpS.set(s, s, 1))
      this.keys.setMatrixAt(n, this.tmpM)
      this.tmpM.compose(this.tmpV.set(x, y, z), this.billQ, this.tmpS.set(s * 0.95, s * 0.95, 1))
      this.keyHalos.setMatrixAt(n, this.tmpM)
      n++
      x = 0
      z = 0
    }
    this.keys.count = n
    this.keyHalos.count = n
    this.keys.instanceMatrix.needsUpdate = true
    this.keyHalos.instanceMatrix.needsUpdate = true
    this.keyMat.color.set(v.invisible ? '#ffffff' : '#ffe08a')
  }
  private tmpQ2 = new THREE.Quaternion()

  private updatePickups(v: ViewState) {
    const idx: Record<PowerKind, number> = { hand: 0 }
    const t = v.time
    for (const p of v.pickups) {
      if (p.s < v.s - 3) continue
      if (p.s > v.s + VIEW_AHEAD) break
      const seg = this.layout.segFor(p.s)
      if (seg < 0) continue
      const item = this.pickupPools[p.kind][idx[p.kind]++]
      if (!item) continue
      if (p.taken) {
        const age = (v.tick - p.takenTick) / v.hz
        if (age > 0.3) {
          item.group.visible = false
          continue
        }
        item.group.scale.setScalar(1 + age * 4)
        ;(item.halo.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - age / 0.3)
      } else {
        item.group.scale.setScalar(1)
        ;(item.halo.material as THREE.MeshBasicMaterial).opacity = 0.45
      }
      item.group.visible = true
      const w = this.layout.pt(seg, p.s, laneX(p.lane), this.wp2)
      item.group.position.set(w.x, 0, w.z)
      item.group.rotation.set(0, w.yaw, 0)
      item.spin.rotation.y = t * 2.2
      item.spin.position.y = 1.35 + Math.sin(t * 3 + p.id) * 0.12
      item.ring.scale.setScalar(1 + 0.18 * Math.sin(t * 5))
      const pulse = 1 + 0.22 * Math.sin(t * 6)
      if (!p.taken) item.halo.scale.setScalar(pulse)
      item.flare.scale.setScalar(0.85 + 0.3 * Math.abs(Math.sin(t * 2.4)))
      // billboards: undo the group yaw then face the camera
      this.tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -w.yaw).multiply(this.billQ)
      item.halo.quaternion.copy(this.tmpQ)
      item.flare.quaternion.copy(this.tmpQ)
    }
    for (const k of ['hand'] as PowerKind[]) for (let i = idx[k]; i < this.pickupPools[k].length; i++) this.pickupPools[k][i].group.visible = false
  }

  /** Arches at every segment start + every ~150 m, turn signs at corners, floating islands. */
  private updateDecor(v: ViewState) {
    const S = v.s
    const L = this.layout
    const t = v.time
    // arches
    const archS: number[] = []
    for (let i = Math.max(0, L.runnerSeg - 1); i < L.segs.length; i++) {
      const g = L.segs[i]
      const end = i + 1 < L.segs.length ? L.segs[i + 1].s0 : L.pending ? L.pending.s : S + VIEW_AHEAD
      const first = i === 0 ? 40 : g.s0 + CORNER.half + 7
      for (let s = first; s < end - 40; s += 150) if (s > S - 8 && s < S + VIEW_AHEAD) archS.push(s)
    }
    let ai = 0
    for (const s of archS) {
      const a = this.arches[ai]
      if (!a) break
      // keep arches out of obstacle rows (a beam under an arch reads as one object)
      const seg = L.segFor(s)
      if (seg < 0) continue
      const p = L.pt(seg, s, 0, this.wp2)
      a.group.visible = true
      a.group.position.set(p.x, 0, p.z)
      a.group.rotation.set(0, p.yaw, 0)
      a.tubes.forEach((m, k) => (m.emissiveIntensity = 1.6 + 0.8 * Math.max(0, Math.sin(t * 3 - k * 1.2 + s))))
      ai++
    }
    for (; ai < this.arches.length; ai++) this.arches[ai].group.visible = false
    // turn signs: floating just past the far edge of each corner square in view
    let si = 0
    const cs: Corner[] = []
    for (let i = Math.max(0, L.runnerSeg); i < L.segs.length - 1; i++) {
      const c = v.corners.find((x) => x.id === L.segs[i].endId)
      if (c) cs.push(c)
    }
    if (L.pending) cs.push(L.pending)
    for (const c of cs) {
      if (c.s < S - 2 || c.s > S + VIEW_AHEAD) continue
      const sign = this.signs[si++]
      if (!sign) break
      const seg = L.segFor(c.s - 0.01)
      const p = L.pt(seg, c.s + CORNER.half + 0.6, 0, this.wp2)
      sign.group.visible = true
      sign.group.position.set(p.x, 0, p.z)
      sign.group.rotation.set(0, p.yaw, 0)
      sign.panel.material = sign.mats[c.kind]
      const pulse = 0.75 + 0.25 * Math.sin(t * 6)
      ;(sign.panel.material as THREE.MeshBasicMaterial).opacity = pulse
    }
    for (; si < this.signs.length; si++) this.signs[si].group.visible = false
    // floating islands, one slot every ~42 m, kept clear of any corner's crossing path
    const first = Math.floor((S - 40) / 42)
    const wanted = new Set<number>()
    for (let j = first; j < first + Math.ceil((VIEW_AHEAD + 60) / 42); j++) wanted.add(j)
    for (const isl of this.islands) if (!wanted.has(isl.slot)) isl.slot = -1
    for (const j of wanted) {
      if (this.islands.some((x) => x.slot === j)) continue
      const free = this.islands.find((x) => x.slot === -1)
      if (!free) break
      free.slot = j
    }
    const palmsOn = this.space < 0.55
    for (const isl of this.islands) {
      if (isl.slot < 0) {
        isl.group.visible = false
        continue
      }
      const j = isl.slot
      const s = j * 42 + hash(j) * 20
      const sc = 2.6 + hash(j + 0.5) * 4.5
      const side = hash(j + 0.2) < 0.5 ? -1 : 1
      const lat = side * (DECK_HALF + 5 + sc + hash(j + 0.7) * 26)
      let ok = true
      for (const c of v.corners) if (Math.abs(c.s - s) < sc * 1.6 + 8) ok = false
      const seg = L.segFor(s)
      if (!ok || seg < 0) {
        isl.group.visible = false
        continue
      }
      const p = L.pt(seg, s, lat, this.wp2)
      isl.group.visible = true
      const bob = Math.sin(t * 0.4 + j) * 0.4
      isl.group.position.set(p.x, -3 - hash(j + 0.9) * 9 + bob, p.z)
      isl.group.rotation.set(0, j * 1.3, 0)
      isl.group.scale.setScalar(sc)
      isl.top.visible = palmsOn
      for (const pm of isl.palms) {
        pm.visible = palmsOn && hash(j + pm.id * 0.01) < 0.8
        pm.scale.setScalar((0.95 + hash(j + pm.id) * 0.35) / sc)
      }
    }
  }

  private updateSparks(dt: number) {
    const pos = this.sparkGeo.getAttribute('position') as THREE.BufferAttribute
    const a = this.sparkGeo.getAttribute('aA') as THREE.BufferAttribute
    this.sparkData.forEach((sp, i) => {
      if (sp.life > 0) {
        sp.life -= dt
        sp.v.y -= 9 * dt
        sp.p.addScaledVector(sp.v, dt)
      }
      pos.setXYZ(i, sp.p.x, sp.p.y, sp.p.z)
      a.setX(i, Math.max(0, sp.life / sp.max))
    })
    pos.needsUpdate = true
    a.needsUpdate = true
  }

  private updateSky(v: ViewState, dt: number) {
    this.skyGroup.position.copy(this.camera.position)
    this.skyGroup.rotation.set(0, -this.camYaw, 0)
    this.starMat.uniforms.uTime.value = v.time
    this.skyMat.uniforms.uTime.value = v.time
    // Miami sunset → open space between ~250 m and ~1700 m
    const target = THREE.MathUtils.smoothstep(v.s, 250, 1700)
    this.space += (target - this.space) * Math.min(1, dt * 1.5)
    const sp = this.space
    this.skyMat.uniforms.uSpace.value = sp
    this.starMat.uniforms.uAmt.value = sp
    this.skyline.position.y = -sp * 520
    this.skyline.visible = sp < 0.92
    for (const p of this.planets) {
      p.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined
        if (m?.uniforms?.uA) m.uniforms.uA.value = THREE.MathUtils.smoothstep(sp, 0.25, 0.8)
      })
      p.visible = sp > 0.24
    }
    const fog = this.scene.fog as THREE.FogExp2
    fog.color.setRGB(0.17 - sp * 0.13, 0.07 - sp * 0.045, 0.16 - sp * 0.07)
    fog.density = 0.0042 - sp * 0.0012
    if (this.bloom) this.bloom.intensity = FrScene.BLOOM + sp * 0.15
    for (const c of this.comets) {
      if (c.wait > 0) {
        c.wait -= dt
        c.mesh.visible = false
        if (c.wait <= 0) {
          c.t = 0
          c.dur = 1.1 + Math.random() * 0.8
          c.x = -260 + Math.random() * 520
          c.y = 220 + Math.random() * 220
          const ang = Math.PI + 0.32 + Math.random() * 0.25
          c.dx = Math.cos(ang)
          c.dy = Math.sin(ang)
        }
        continue
      }
      c.t += dt
      const f = c.t / c.dur
      if (f >= 1) {
        c.wait = 0.8 + Math.random() * 3.2
        c.mesh.visible = false
        continue
      }
      c.mesh.visible = true
      const travel = 280 * f
      // comets live in the camera's current heading (sky group is yaw-rotated): place in world-yaw space
      this.tmpV.set(c.x + c.dx * travel, c.y + c.dy * travel, -800).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.camYaw)
      c.mesh.position.copy(this.tmpV)
      c.mesh.rotation.set(0, this.camYaw, Math.atan2(c.dy, c.dx))
      ;(c.mesh.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.PI * Math.min(1, f * 1.15)) * (0.5 + 0.5 * Math.max(sp, 0.3))
    }
  }

  private camPush = 0
  private ufoNdc = new THREE.Vector3()
  private updateCamera(v: ViewState, dt: number) {
    const rl = this.runnerLocal
    const k = 1 - Math.exp(-dt * 7)
    this.camX += (rl.x * 0.62 - this.camX) * k
    const ty = 3.9 + Math.max(0, v.y) * 0.08
    this.camY += (ty - this.camY) * (1 - Math.exp(-dt * 6))
    const speedF = THREE.MathUtils.clamp((v.speed - 18) / 22, 0, 1)
    const aspect = this.camera.aspect
    const baseFov = aspect > 0.8 ? 52 : 66
    const tf = baseFov + speedF * 8 + (v.boost - 1) * 20
    this.fov += (tf - this.fov) * (1 - Math.exp(-dt * 3))
    const sh = v.shake
    const sx = sh ? (Math.sin(v.time * 61) + Math.sin(v.time * 37)) * 0.06 * sh : 0
    const sy = sh ? Math.sin(v.time * 53) * 0.05 * sh : 0
    let dz = 6.4 - speedF * 0.4
    const push = v.dead ? Math.min(1.2, v.deadT * 1.5) : 0
    this.camPush += (push - this.camPush) * (v.dead ? 1 : 1 - Math.exp(-dt * 4))
    dz -= this.camPush
    // a fall: the camera stays at the rim and looks down after him
    const fall = v.dead && v.deathKind === 'gap' ? Math.min(1, v.deadT * 1.4) : 0
    this.camera.position.set(this.camX + sx, this.camY + sy, rl.z * 0 + dz)
    this.lookT.set(rl.x * 0.5, 0.7 - fall * 3.5, -13 + fall * 8)
    this.camera.lookAt(this.lookT)
    this.camera.rotation.z += (this.runner.group.rotation.z || 0) * 0.15
    this.camera.fov = this.fov
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld(true)

    const op = THREE.MathUtils.clamp((v.speed - 24) / 16, 0, 1) * 0.22 + (v.boost - 1) * 0.7
    this.speedMat.opacity = v.idle || v.dead ? 0 : op
    this.speedLines.visible = this.speedMat.opacity > 0.01
    if (this.speedLines.visible) {
      this.speedLineState.forEach((l, i) => {
        l.z += v.speed * 2.2 * dt
        if (l.z > 2) {
          l.z = -40 - Math.random() * 10
          l.a = Math.random() * Math.PI * 2
          l.r = 2.2 + Math.random() * 4
        }
        this.tmpE.set(0, 0, l.a - Math.PI / 2)
        this.tmpQ.setFromEuler(this.tmpE)
        this.tmpM.compose(this.tmpV.set(Math.cos(l.a) * l.r, Math.sin(l.a) * l.r * 0.8, l.z), this.tmpQ, this.tmpS.set(1, 1, l.len * (0.6 + speedF)))
        this.speedLines.setMatrixAt(i, this.tmpM)
      })
      this.speedLines.instanceMatrix.needsUpdate = true
    }
  }

  /** Kept for the adaptive-quality loop (no planar reflections on the sky path). */
  reflEvery = 1

  render() {
    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  onContextRestored() {
    const had = !!this.composer
    this.disableComposer()
    if (had) this.enableComposer()
    this.warmup()
  }

  private probeRT: THREE.WebGLRenderTarget | null = null
  private probeBuf: Uint16Array | null = null
  probeNaN(): [number, number] {
    const W = 72
    const H = 156
    if (!this.probeRT) {
      this.probeRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType })
      this.probeBuf = new Uint16Array(W * H * 4)
    }
    const r = this.renderer
    const prev = r.getRenderTarget()
    r.setRenderTarget(this.probeRT)
    r.clear()
    r.render(this.scene, this.camera)
    r.setRenderTarget(prev)
    let a = 0
    try {
      r.readRenderTargetPixels(this.probeRT, 0, 0, W, H, this.probeBuf!)
      for (let i = 0; i < W * H * 4; i++) if ((this.probeBuf![i] & 0x7c00) === 0x7c00) a++
    } catch {
      /* readback unsupported */
    }
    return [a, 0]
  }

  dispose() {
    this.probeRT?.dispose()
    this.composer?.dispose()
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      const mats = Array.isArray(mat) ? mat : mat ? [mat] : []
      for (const mm of mats) {
        for (const val of Object.values(mm)) if (val instanceof THREE.Texture) val.dispose()
        mm.dispose()
      }
    })
    this.scene.environment?.dispose()
    this.renderer.dispose()
  }
}

const Z_AXIS = new THREE.Vector3(0, 0, 1)

export { PALETTE }
