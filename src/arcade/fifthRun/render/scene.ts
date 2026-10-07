/**
 * Fifth Glide — three.js scene. On-foot 3-lane runner through Miami night → galaxy biomes.
 * Wet road reflections, oncoming traffic, 💫 stars, bloom. Over-shoulder chase cam.
 *
 * World convention: the runner stays at z = 0; track objects live in `world` at z = −s and the
 * group is translated by +runnerS each frame. Sky, planet, stars and skyline are camera-locked.
 */
import * as THREE from 'three'
import { BloomEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode } from 'postprocessing'
import { laneX } from '../sim/constants'
import { keyPos, obstacleS, type KeyItem, type Obstacle, type Pickup, type PowerKind } from '../sim/track'
import {
  buildBarrier,
  buildBlock,
  buildGantry,
  buildGap,
  buildGate,
  buildLamp,
  buildPickup,
  palmGeometry,
  palmMaterial,
} from './props'
import { DarkEnergy } from './darkEnergy'
import { RunnerFigure, type PoseInput, type RunnerView } from './runnerFigure'
import { loadHumanRunner } from './humanRunner'
import { neonEnvironment } from './env'
import { mergeStatic } from './merge'
import { glowMaterial, PALETTE, roadMaterial, skyMaterial, towerMaterial } from './shaders'
import { blobTexture, chevronTexture, glowTexture, planetTexture, shootingStarTexture, streakTexture } from './textures'
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
  stumble: number
  obstacles: Obstacle[]
  keys: KeyItem[]
  pickups: Pickup[]
  tick: number
  hz: number
  shake: number
}

const REFL = 1
const VIEW_AHEAD = 175
const rnd = (() => {
  let t = 12345
  return () => {
    t = (t * 1664525 + 1013904223) >>> 0
    return t / 4294967296
  }
})()

type Deco = { s: number; side: number; x: number; w: number; h: number; d: number; seed: number }

export class FrScene {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  tier: QualityTier
  composer: EffectComposer | null = null
  bloom: BloomEffect | null = null
  dprScale = 1
  /** Full device pixel ratio (phones are 2–3×); only the adaptive loop scales below this, as a last resort. */
  dprCap = 2.5
  /** Night grade: lower exposure keeps blacks deep and only real light sources hot. */
  static EXPOSURE = 0.8
  static BLOOM = 0.62
  width = 1
  height = 1
  runner: RunnerView
  private runnerLight: THREE.SpotLight | null = null

  private world = new THREE.Group()
  private skyGroup = new THREE.Group()
  private sky: THREE.Mesh
  private skyMat: THREE.ShaderMaterial
  private road: THREE.Mesh
  private roadMat: THREE.ShaderMaterial
  private reflRT: THREE.WebGLRenderTarget | null = null
  private mirrorCam = new THREE.PerspectiveCamera()
  private texMat = new THREE.Matrix4()
  private glow: THREE.Texture
  private stars!: THREE.Points
  private starMat!: THREE.ShaderMaterial
  private comets: { mesh: THREE.Mesh; t: number; dur: number; x: number; y: number; dx: number; dy: number; wait: number }[] = []
  private towers!: THREE.InstancedMesh
  private towerDeco: Deco[] = []
  private towerMat!: THREE.ShaderMaterial
  private farMat!: THREE.ShaderMaterial
  private palms!: THREE.InstancedMesh
  private palmDeco: Deco[] = []
  private lamps: { g: THREE.Group; s: number; side: number }[] = []
  private gates: { g: THREE.Group; s: number; tubes: THREE.MeshStandardMaterial[] }[] = []
  private keys!: THREE.InstancedMesh
  private keyHalos!: THREE.InstancedMesh
  private keyMat!: THREE.MeshBasicMaterial
  private pools: {
    barrier: { group: THREE.Group; lamp: THREE.MeshStandardMaterial }[]
    overhead: { group: THREE.Group }[]
    block: { group: THREE.Group; lamp: THREE.MeshStandardMaterial }[]
    gap: ReturnType<typeof buildGap>[]
  } = { barrier: [], overhead: [], block: [], gap: [] }
  dark: DarkEnergy
  private pickupPools: Record<PowerKind, ReturnType<typeof buildPickup>[]> = { hand: [] }
  private smashT = new Map<number, number>()
  private blob: THREE.Mesh
  private shieldMesh: THREE.Mesh
  private shieldMat: THREE.ShaderMaterial
  private fiveRing: THREE.Mesh
  private magnetRing: THREE.Mesh
  private speedLines!: THREE.InstancedMesh
  private speedLineState: { a: number; r: number; z: number; len: number }[] = []
  private speedMat!: THREE.MeshBasicMaterial
  private sparks!: THREE.Points
  private sparkData: { p: THREE.Vector3; v: THREE.Vector3; life: number; max: number }[] = []
  private sparkGeo!: THREE.BufferGeometry
  private darkFade = 1
  private camX = 0
  private camY = 3.35
  private fov = 62
  private tmpM = new THREE.Matrix4()
  private tmpQ = new THREE.Quaternion()
  private tmpV = new THREE.Vector3()
  private tmpS = new THREE.Vector3()
  private tmpE = new THREE.Euler()
  private lookT = new THREE.Vector3()

  constructor(canvas: HTMLCanvasElement, tier: QualityTier, emblem: THREE.Texture | null, logo: THREE.Texture | null = null) {
    this.tier = tier
    this.runner = new RunnerFigure()
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: tier === 'high', powerPreference: 'high-performance', alpha: false })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = FrScene.EXPOSURE
    if (tier === 'low') this.dprCap = 2
    this.camera = new THREE.PerspectiveCamera(64, 1, 0.1, 1600)
    this.camera.layers.enable(REFL)
    this.mirrorCam.layers.set(REFL)
    this.scene.add(this.camera)
    this.scene.background = new THREE.Color('#0a0c14')
    this.glow = glowTexture()

    // ── sky / env ──
    this.skyMat = skyMaterial()
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.skyMat)
    this.sky.frustumCulled = false
    this.sky.renderOrder = -10
    this.sky.layers.enable(REFL)
    this.scene.add(this.sky)
    this.scene.add(this.skyGroup)
    this.buildEnv()
    this.buildStars()
    this.buildPlanet()
    this.buildComets()
    this.buildSkyline()

    // ── lights ──
    const hemi = new THREE.HemisphereLight('#7a8aba', '#1a1018', 0.45)
    const key = new THREE.DirectionalLight('#ffe8d0', 1.35)
    key.position.set(-4, 12, -8)
    const back = new THREE.DirectionalLight('#ff6aa0', 0.55)
    back.position.set(4, 5, 10)
    const fill = new THREE.DirectionalLight('#25cfc4', 0.35)
    fill.position.set(2, 3, 6)
    for (const l of [hemi, key, back, fill]) {
      l.layers.enable(REFL)
      this.scene.add(l)
    }

    // ── road + reflections ──
    if (tier === 'high') {
      this.reflRT = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace })
    }
    this.roadMat = roadMaterial(this.reflRT?.texture ?? null)
    this.road = new THREE.Mesh(new THREE.PlaneGeometry(80, 440, 1, 1), this.roadMat)
    this.road.rotation.x = -Math.PI / 2
    this.road.position.set(0, 0, -190)
    this.scene.add(this.road)

    this.scene.add(this.world)
    this.buildTowers()
    this.buildPalms()
    this.buildLampsAndGates(emblem)
    this.buildPools(logo ?? emblem)
    this.dark = new DarkEnergy(tier === 'high' ? 4 : 3)
    this.scene.add(this.dark.group)
    this.buildKeys()

    // ── runner + fx ──
    for (const m of this.runner.meshes) m.layers.enable(REFL)
    this.scene.add(this.runner.group)
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.55 }))
    this.blob.rotation.x = -Math.PI / 2
    this.blob.position.y = 0.012
    this.scene.add(this.blob)
    this.shieldMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader:
        'uniform float uTime; uniform float uAlpha; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 4.2); float band = 0.5 + 0.5*sin(vN.y*18.0 - uTime*2.5); gl_FragColor = vec4(vec3(0.7,0.5,1.0) * (f*(1.1 + band*0.35)) * uAlpha, 1.0); }',
    })
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(0.95, 28, 18), this.shieldMat)
    this.shieldMesh.scale.set(0.92, 1.2, 0.85)
    this.scene.add(this.shieldMesh)
    this.fiveRing = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), glowMaterial(this.glow, '#ffc83c', 0.9))
    this.fiveRing.rotation.x = -Math.PI / 2
    this.fiveRing.position.y = 0.03
    this.scene.add(this.fiveRing)
    this.magnetRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.025, 6, 40),
      new THREE.MeshBasicMaterial({ color: '#ff4060', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    this.magnetRing.rotation.x = Math.PI / 2
    this.scene.add(this.magnetRing)
    this.buildSpeedLines()
    this.buildSparks()

    if (tier === 'high') this.enableComposer()
    this.applyAnisotropy()
  }

  // ───────────────────────── builders ─────────────────────────
  private buildEnv() {
    const env = new THREE.Scene()
    const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), skyMaterial())
    env.add(sky)
    const panel = (c: string, x: number, y: number, z: number, w: number, h: number, k = 3) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide }))
      m.position.set(x, y, z)
      m.lookAt(0, 0, 0)
      env.add(m)
    }
    panel('#00e0d0', -30, 4, -20, 12, 4, 4)
    panel('#ff3d8a', 30, 6, -16, 14, 4, 4)
    panel('#ffc83c', 0, 14, -30, 20, 5, 3)
    panel('#8a4dff', 0, 25, 10, 32, 12, 2.2)
    panel('#ff6a3c', -10, 3, 30, 16, 5, 2.5)
    panel('#ffffff', 0, 18, 25, 22, 8, 1.8)
    const pm = new THREE.PMREMGenerator(this.renderer)
    const rt = pm.fromScene(env, 0.02)
    this.scene.environment = rt.texture
    pm.dispose()
  }

  private buildStars() {
    const N = 900
    const pos = new Float32Array(N * 3)
    const ph = new Float32Array(N)
    const sz = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const az = (rnd() - 0.5) * Math.PI * 1.2
      const el = 0.05 + Math.pow(rnd(), 0.7) * 1.25
      const r = 800
      pos[i * 3] = Math.sin(az) * Math.cos(el) * r
      pos[i * 3 + 1] = Math.sin(el) * r
      pos[i * 3 + 2] = -Math.cos(az) * Math.cos(el) * r
      ph[i] = rnd() * 6.28
      sz[i] = rnd() < 0.08 ? 3.2 : 1.2 + rnd() * 1.4
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1))
    this.starMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPx: { value: 1 } },
      vertexShader:
        'attribute float aPh; attribute float aSize; uniform float uTime; uniform float uPx; varying float vA; void main(){ vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p; vA = 0.55 + 0.45*sin(uTime*1.7 + aPh*3.0); gl_PointSize = aSize * uPx; }',
      fragmentShader:
        'varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vec3(1.0,0.92,1.0)*a*vA*1.4, 1.0); }',
    })
    this.stars = new THREE.Points(g, this.starMat)
    this.stars.frustumCulled = false
    this.skyGroup.add(this.stars)
  }

  private buildPlanet() {
    const tex = planetTexture()
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uLight: { value: new THREE.Vector3(-0.8, 0.35, 0.55).normalize() } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; uniform vec3 uLight; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){
          vec3 albedo = texture2D(uTex, vUv).rgb;
          float l = clamp(dot(vN, uLight) * 0.9 + 0.25, 0.0, 1.0);
          float rim = pow(1.0 - clamp(dot(vN, vV), 0.0, 1.0), 2.5);
          vec3 col = albedo * vec3(0.55, 0.78, 1.25) * l * 0.42 + vec3(0.2, 0.45, 1.0) * rim * 0.5;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
    const planet = new THREE.Mesh(new THREE.SphereGeometry(96, 48, 32), mat)
    const dir = new THREE.Vector3(0.2, 0.3, -1).normalize()
    planet.position.copy(dir.multiplyScalar(620))
    planet.rotation.set(0.3, -0.6, 0.2)
    planet.layers.enable(REFL)
    this.skyGroup.add(planet)
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(330, 330), glowMaterial(this.glow, '#5a8cff', 0.3))
    halo.position.copy(planet.position).multiplyScalar(1.02)
    halo.lookAt(0, 0, 0)
    this.skyGroup.add(halo)
  }

  private buildComets() {
    const tex = streakTexture()
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(170, 7), glowMaterial(tex, '#ffd27a', 1))
      m.visible = false
      m.layers.enable(REFL)
      this.skyGroup.add(m)
      this.comets.push({ mesh: m, t: 0, dur: 1.4, x: 0, y: 0, dx: -1, dy: -0.5, wait: 0.4 + i * 1.3 })
    }
  }

  private buildSkyline() {
    const geo = new THREE.BoxGeometry(1, 1, 1)
    geo.translate(0, 0.5, 0)
    this.farMat = towerMaterial(350, 1200)
    const N = 120
    const mesh = new THREE.InstancedMesh(geo, this.farMat, N)
    const seeds = new Float32Array(N)
    let i = 0
    while (i < N) {
      const x = (rnd() - 0.5) * 900
      const z = -380 - rnd() * 320
      const ax = Math.abs(x)
      if (ax < 16) continue
      const center = Math.exp(-ax / 140)
      const h = 20 + rnd() * 55 + center * 95 * rnd()
      const w = 14 + rnd() * 26
      this.tmpM.compose(this.tmpV.set(x, -8, z), this.tmpQ.identity(), this.tmpS.set(w, h, w * (0.7 + rnd() * 0.6)))
      mesh.setMatrixAt(i, this.tmpM)
      seeds[i] = rnd()
      i++
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
    mesh.frustumCulled = false
    mesh.layers.enable(REFL)
    this.skyGroup.add(mesh)
    // vanishing-point glow
    const vg = new THREE.Mesh(new THREE.PlaneGeometry(260, 120), glowMaterial(this.glow, '#ff7ad8', 0.22))
    vg.position.set(0, 4, -360)
    vg.layers.enable(REFL)
    this.skyGroup.add(vg)
  }

  private newTower(d: Deco, s: number) {
    d.s = s
    const near = rnd() < 0.45
    d.w = 6 + rnd() * 9
    d.d = 8 + rnd() * 10
    d.h = near ? 6 + rnd() * 10 : rnd() < 0.15 ? 40 + rnd() * 30 : 16 + rnd() * 24
    d.x = d.side * ((near ? 11 : 20 + rnd() * 14) + d.w / 2)
    d.seed = rnd()
  }

  private buildTowers() {
    const geo = new THREE.BoxGeometry(1, 1, 1)
    geo.translate(0, 0.5, 0)
    this.towerMat = towerMaterial(70, 340)
    const N = 64
    this.towers = new THREE.InstancedMesh(geo, this.towerMat, N)
    const seeds = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const side = i % 2 ? 1 : -1
      const d: Deco = { s: 0, side, x: 0, w: 1, h: 1, d: 1, seed: 0 }
      this.newTower(d, -20 + Math.floor(i / 2) * 12 + rnd() * 5)
      this.towerDeco.push(d)
      seeds[i] = d.seed
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
    this.towers.frustumCulled = false
    this.towers.layers.enable(REFL)
    this.world.add(this.towers)
    this.writeTowers(true)
  }

  private writeTowers(all: boolean, runnerS = 0) {
    const seedAttr = this.towers.geometry.getAttribute('aSeed') as THREE.InstancedBufferAttribute
    let dirty = all
    const span = 32 * 12
    for (let i = 0; i < this.towerDeco.length; i++) {
      const d = this.towerDeco[i]
      if (!all && d.s > runnerS - 25) continue
      if (!all) this.newTower(d, d.s + span)
      this.tmpM.compose(this.tmpV.set(d.x, 0, -d.s), this.tmpQ.identity(), this.tmpS.set(d.w, d.h, d.d))
      this.towers.setMatrixAt(i, this.tmpM)
      seedAttr.setX(i, d.seed)
      dirty = true
    }
    if (dirty) {
      this.towers.instanceMatrix.needsUpdate = true
      seedAttr.needsUpdate = true
    }
  }

  private buildPalms() {
    const N = 30
    this.palms = new THREE.InstancedMesh(palmGeometry(), palmMaterial(), N)
    for (let i = 0; i < N; i++) {
      const side = i % 2 ? 1 : -1
      this.palmDeco.push({ s: -10 + Math.floor(i / 2) * 22 + (side > 0 ? 11 : 0), side, x: side * 6.4, w: 0.85 + rnd() * 0.35, h: 0, d: 0, seed: rnd() * 6.28 })
    }
    this.palms.frustumCulled = false
    this.palms.layers.enable(REFL)
    this.world.add(this.palms)
    this.writePalms(true)
  }

  private writePalms(all: boolean, runnerS = 0) {
    let dirty = all
    for (let i = 0; i < this.palmDeco.length; i++) {
      const d = this.palmDeco[i]
      if (!all && d.s > runnerS - 15) continue
      if (!all) {
        d.s += 15 * 22
        d.w = 0.85 + rnd() * 0.35
        d.seed = rnd() * 6.28
      }
      // lean outward, random spin
      this.tmpE.set(0, d.side > 0 ? Math.PI + d.seed * 0.2 : d.seed * 0.2, 0)
      this.tmpQ.setFromEuler(this.tmpE)
      this.tmpM.compose(this.tmpV.set(d.x, 0, -d.s), this.tmpQ, this.tmpS.set(d.w, d.w, d.w))
      this.palms.setMatrixAt(i, this.tmpM)
      dirty = true
    }
    if (dirty) this.palms.instanceMatrix.needsUpdate = true
  }

  private buildLampsAndGates(emblem: THREE.Texture | null) {
    const metal = new THREE.MeshStandardMaterial({ color: '#2a2438', metalness: 0.7, roughness: 0.35 })
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1
      const g = mergeStatic(buildLamp(this.glow, metal, side)) as THREE.Group
      g.position.x = side * 5.1
      g.traverse((o) => o.layers.enable(REFL))
      this.world.add(g)
      this.lamps.push({ g, s: 12 + Math.floor(i / 2) * 28 + (side > 0 ? 14 : 0), side })
    }
    for (let i = 0; i < 3; i++) {
      const { group, tubes } = buildGate(this.glow, i % 3 === 0 ? emblem : null, metal)
      mergeStatic(group)
      group.traverse((o) => o.layers.enable(REFL))
      this.world.add(group)
      this.gates.push({ g: group, s: 60 + i * 70, tubes })
    }
  }

  private buildPools(emblem: THREE.Texture | null) {
    const chev = chevronTexture()
    const metal = new THREE.MeshStandardMaterial({ color: '#3a3448', metalness: 0.8, roughness: 0.3 })
    for (let i = 0; i < 12; i++) {
      const b = buildBarrier(chev, metal)
      mergeStatic(b.group)
      b.group.visible = false
      b.group.traverse((o) => o.layers.enable(REFL))
      this.world.add(b.group)
      this.pools.barrier.push(b)
      const o = buildGantry(chev, metal, this.glow)
      mergeStatic(o.group)
      o.group.visible = false
      o.group.traverse((x) => x.layers.enable(REFL))
      this.world.add(o.group)
      this.pools.overhead.push(o)
    }
    for (let i = 0; i < 16; i++) {
      const c = buildBlock(chev, metal)
      mergeStatic(c.group)
      c.group.visible = false
      c.group.traverse((o) => o.layers.enable(REFL))
      this.world.add(c.group)
      this.pools.block.push(c)
    }
    for (let i = 0; i < 9; i++) {
      const g = buildGap(this.glow)
      g.group.visible = false
      this.world.add(g.group)
      this.pools.gap.push(g)
    }
    for (const k of ['hand'] as PowerKind[]) {
      for (let i = 0; i < 2; i++) {
        const p = buildPickup(k, this.glow, emblem)
        p.group.visible = false
        p.spin.traverse((o) => o.layers.enable(REFL))
        this.world.add(p.group)
        this.pickupPools[k].push(p)
      }
    }
  }

  private buildKeys() {
    // Billboard shooting stars (💫) — crisp at phone size on the neon highway
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
    let made = 0
    for (const sp of this.sparkData) {
      if (sp.life > 0) continue
      sp.p.set(laneX(lane), y, -s)
      sp.v.set((Math.random() - 0.5) * 5, 1.5 + Math.random() * 4, (Math.random() - 0.5) * 5)
      sp.max = 0.35 + Math.random() * 0.3
      sp.life = sp.max
      if (++made >= n) break
    }
  }

  /** Max anisotropic filtering on every sampled texture (road signs, cars, suit) — sharp at grazing angles. */
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
    // MSAA on the HDR scene buffer (WebGL2), SMAA after tone mapping for the remaining shader edges.
    const samples = Math.min(4, this.renderer.capabilities.maxSamples || 0)
    const composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: samples })
    composer.addPass(new RenderPass(this.scene, this.camera))
    // High threshold: only emissive sources (lamps, tail lights, rails, stars) bloom; the lit scene stays crisp.
    this.bloom = new BloomEffect({ intensity: FrScene.BLOOM, luminanceThreshold: 0.86, luminanceSmoothing: 0.12, mipmapBlur: true, radius: 0.55, levels: 5 })
    composer.addPass(new EffectPass(this.camera, this.bloom, new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })))
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
    if (this.reflRT) this.reflRT.setSize(Math.max(64, Math.round((w * pr) / 2)), Math.max(64, Math.round((h * pr) / 2)))
    this.starMat.uniforms.uPx.value = pr
    ;(this.sparks.material as THREE.ShaderMaterial).uniforms.uPx.value = pr * (h / 844) * 1.4
  }

  // ───────────────────────── per-frame ─────────────────────────
  update(v: ViewState, dt: number) {
    const t = v.time
    const S = v.s
    this.world.position.z = S

    // runner
    this.runner.group.position.set(v.x, v.y, 0)
    const pose: PoseInput = {
      dt,
      speed: v.speed,
      air: v.air,
      vy: v.vy,
      sliding: v.sliding,
      bank: THREE.MathUtils.clamp((v.x - this.runner.group.userData.prevX || 0) / Math.max(dt, 1e-3) / 14, -1, 1),
      dead: v.dead,
      deadT: v.deadT,
      deathKind: v.deathKind,
      idle: v.idle,
    }
    this.runner.group.userData.prevX = v.x
    this.runner.update(pose)
    if (this.runnerLight) {
      this.runnerLight.position.set(v.x * 0.7 - 0.6, v.y + 4.2, 4.6)
      this.runnerLight.target.position.set(v.x, v.y + 1.0, 0)
      this.runnerLight.target.updateMatrixWorld()
    }
    if (v.dead && v.deathKind === 'gap') this.runner.group.position.y = -Math.min(6, v.deadT * v.deadT * 9)
    // post-hit i-frames flicker; the 5D invincibility keeps the runner solid (shell + rim show it)
    const flick = v.invuln && !v.invisible ? (Math.floor(t * 18) % 2 ? 0.35 : 1) : 1
    this.runner.group.visible = flick > 0.5
    this.blob.position.set(v.x, 0.012, 0.05)
    const bs = Math.max(0.35, 1 - v.y * 0.35)
    this.blob.scale.set(bs, bs, bs)
    this.blob.visible = !(v.dead && v.deathKind === 'gap')

    // power-up fx — 5D logo = faint violet fresnel shell + violet rim while invincible (subtle)
    this.shieldMesh.visible = v.invisible && !v.dead
    this.shieldMesh.position.set(v.x, v.y + 0.92 - (v.sliding ? 0.4 : 0), 0)
    this.shieldMat.uniforms.uTime.value = t
    // last 2 s: pulse faster so the player knows it is about to end
    const ending = v.hand > 0 && v.hand < 2
    this.shieldMat.uniforms.uAlpha.value = ending ? 0.08 + 0.12 * Math.max(0, Math.sin(t * 14)) : 0.17 + 0.05 * Math.sin(t * 5)
    this.fiveRing.visible = false
    this.magnetRing.visible = false
    this.runner.setRim(v.invisible ? '#ffd36a' : '#ff4fd0')

    // decor recycling
    this.writeTowers(false, S)
    this.writePalms(false, S)
    for (const l of this.lamps) {
      if (l.s < S - 12) l.s += 7 * 28
      l.g.position.z = -l.s
    }
    for (const g of this.gates) {
      if (g.s < S - 15) g.s += 3 * 70
      g.g.position.z = -g.s
      g.tubes.forEach((m, i) => (m.emissiveIntensity = 1.5 + 0.7 * Math.max(0, Math.sin(t * 3 - i * 1.2 + g.s))))
    }

    this.updateObstacles(v)
    this.updateKeys(v, dt)
    this.updatePickups(v)
    this.updateSparks(dt)
    this.updateSky(v, dt)
    this.updateCamera(v, dt)
    this.darkFade += ((v.invisible || v.idle ? 0 : 1) - this.darkFade) * (1 - Math.exp(-dt * (v.invisible ? 1.5 : 2.5)))
    this.dark.update(t, dt, v.dead && v.deathKind === 'caught' ? 1.25 : v.threat, v.x, v.idle ? 0.55 : Math.max(0.0, this.darkFade))

    this.roadMat.uniforms.uScroll.value = S
    this.roadMat.uniforms.uTime.value = t
    this.roadMat.uniforms.uCam.value.copy(this.camera.position)
    this.roadMat.uniforms.uBoost.value = v.invisible ? 0.2 : 0
    this.towerMat.uniforms.uTime.value = t
  }

  /** Swap the procedural fallback for the rigged GLB human (keeps the fallback if the load fails). */
  async loadGltfRunner() {
    try {
      const human = await loadHumanRunner()
      const old = this.runner
      human.group.userData.prevX = old.group.userData.prevX
      this.scene.remove(old.group)
      old.group.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) m.geometry?.dispose?.()
      })
      for (const m of human.meshes) m.layers.enable(REFL)
      human.setEnv(neonEnvironment(this.renderer))
      this.runner = human
      this.scene.add(human.group)
      // soft white chase light from behind/above the camera so the suit reads white, not neon-tinted
      const chase = new THREE.SpotLight('#eef2ff', 20, 14, 0.42, 0.85, 1.6)
      chase.position.set(0, 0, 0)
      this.runnerLight = chase
      this.scene.add(chase)
      this.scene.add(chase.target)
      return true
    } catch (e) {
      console.warn('[fifth-glide] runner GLB failed, keeping procedural fallback', e)
      return false
    }
  }

  private updateObstacles(v: ViewState) {
    const S = v.s
    const idx = { barrier: 0, overhead: 0, block: 0, gap: 0 }
    const now = v.time
    for (const o of v.obstacles) {
      // Oncoming cars sit ahead of their meet-point — look further by o.s before breaking
      if (o.s > S + VIEW_AHEAD + 90) break
      const liveS = obstacleS(o, S)
      // passed props would otherwise fill the foreground between camera and runner
      const behind = o.kind === 'gap' || v.dead ? 12 : o.kind === 'block' ? 3.5 : 2.6
      if (liveS + o.len < S - behind) continue
      if (liveS > S + VIEW_AHEAD + 25) continue
      let scale = 1
      let lift = 0
      if (o.smashed) {
        if (!this.smashT.has(o.id)) {
          this.smashT.set(o.id, now)
          this.burst(o.lane, liveS, 0.8, 18)
        }
        const k = (now - this.smashT.get(o.id)!) / 0.35
        if (k >= 1) continue
        scale = 1 - k
        lift = k * 2
      }
      const x = laneX(o.lane)
      if (o.kind === 'barrier') {
        const b = this.pools.barrier[idx.barrier++]
        if (!b) continue
        b.group.visible = true
        b.group.position.set(x, lift, -(liveS + o.len / 2))
        b.group.scale.setScalar(scale)
        b.lamp.emissiveIntensity = Math.floor(now * 3 + o.id) % 2 ? 3.2 : 0.5
      } else if (o.kind === 'overhead') {
        const g = this.pools.overhead[idx.overhead++]
        if (!g) continue
        g.group.visible = true
        g.group.position.set(x, lift, -(liveS + o.len / 2))
        g.group.scale.setScalar(scale)
      } else if (o.kind === 'block') {
        const c = this.pools.block[idx.block++]
        if (!c) continue
        c.group.visible = true
        c.group.position.set(x, lift, -(liveS + o.len / 2))
        c.group.rotation.y = ((o.variant % 7) - 3) * 0.02
        c.group.scale.setScalar(scale)
        c.lamp.emissiveIntensity = Math.floor(now * 2 + o.id) % 2 ? 3.5 : 0.6
      } else {
        const g = this.pools.gap[idx.gap++]
        if (!g) continue
        g.group.visible = true
        g.group.position.set(x, 0, 0)
        g.hole.scale.set(1.98, o.len, 1)
        g.hole.position.z = -(liveS + o.len / 2)
        g.near.scale.x = 1.98
        g.near.position.set(0, 0.02, -liveS)
        g.far.scale.x = 1.98
        g.far.position.set(0, 0.02, -(liveS + o.len))
        g.nearGlow.scale.x = 1.6
        g.nearGlow.position.z = -liveS + 0.3
      }
    }
    for (const k of ['barrier', 'overhead', 'block', 'gap'] as const) {
      const pool = this.pools[k] as { group: THREE.Group }[]
      for (let i = idx[k]; i < pool.length; i++) pool[i].group.visible = false
    }
    if (this.smashT.size > 40) this.smashT.clear()
  }

  private updateKeys(v: ViewState, dt: number) {
    void dt
    const S = v.s
    let n = 0
    const t = v.time
    const fiveBoost = v.invisible ? 1.12 : 1
    for (const k of v.keys) {
      if (k.s < S - 3 && k.state !== 1) continue
      if (k.s > S + VIEW_AHEAD) break
      if (k.state === 2) continue
      const kp = keyPos(k, k.state === 1 ? k.s : S)
      let x = kp.x
      let y = kp.y + 0.05 + Math.sin(t * 3 + k.id) * 0.06
      let z = -k.s
      let sc = 1
      if (k.state === 1) {
        const age = (v.tick - k.takenTick) / v.hz
        const dur = k.magnet ? 0.22 : 0.18
        if (age > dur || age < 0) continue
        const f = age / dur
        if (k.magnet) {
          x = x + (v.x - x) * f
          y = y + (v.y + 1.0 - y) * f
          z = z + (-S - z) * f
          sc = 1 - f * 0.6
        } else {
          y += f * 0.8
          sc = 1 + f * 0.6
          if (f > 0.5) sc *= 1 - (f - 0.5) * 2
        }
      }
      if (n >= 160) break
      // Face +Z (toward camera) with a gentle Z wobble so the 💫 trail stays readable
      this.tmpE.set(0, 0, Math.sin(t * 2.2 + k.id) * 0.12)
      this.tmpQ.setFromEuler(this.tmpE)
      const s = sc * fiveBoost
      this.tmpM.compose(this.tmpV.set(x, y, z), this.tmpQ, this.tmpS.set(s, s, 1))
      this.keys.setMatrixAt(n, this.tmpM)
      this.tmpM.compose(this.tmpV.set(x, y, z + 0.04), this.tmpQ.identity(), this.tmpS.set(s * 0.95, s * 0.95, 1))
      this.keyHalos.setMatrixAt(n, this.tmpM)
      n++
    }
    this.keys.count = n
    this.keyHalos.count = n
    this.keys.instanceMatrix.needsUpdate = true
    this.keyHalos.instanceMatrix.needsUpdate = true
    this.keyMat.color.set(v.invisible ? '#ffffff' : '#ffe08a')
    this.keyMat.opacity = v.invisible ? 1 : 0.95
  }

  private updatePickups(v: ViewState) {
    const idx: Record<PowerKind, number> = { hand: 0 }
    const t = v.time
    for (const p of v.pickups) {
      if (p.s < v.s - 3) continue
      if (p.s > v.s + VIEW_AHEAD) break
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
      item.group.position.set(laneX(p.lane), 0, -p.s)
      item.spin.rotation.y = t * 2.2
      item.spin.position.y = 1.35 + Math.sin(t * 3 + p.id) * 0.12
      item.ring.scale.setScalar(1 + 0.18 * Math.sin(t * 5))
      // pulse so it reads from far away; billboard the glows to the camera
      const pulse = 1 + 0.22 * Math.sin(t * 6)
      if (!p.taken) item.halo.scale.setScalar(pulse)
      item.flare.scale.setScalar(0.85 + 0.3 * Math.abs(Math.sin(t * 2.4)))
      item.halo.quaternion.copy(this.camera.quaternion)
      item.flare.quaternion.copy(this.camera.quaternion)
    }
    for (const k of ['hand'] as PowerKind[]) for (let i = idx[k]; i < this.pickupPools[k].length; i++) this.pickupPools[k][i].group.visible = false
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
    this.sky.position.copy(this.camera.position)
    this.skyGroup.position.set(this.camera.position.x * 0.9, 0, this.camera.position.z)
    this.starMat.uniforms.uTime.value = v.time
    this.skyMat.uniforms.uTime.value = v.time
    // Galaxy run biomes: Miami (0) → cosmic (1) → deep space (2)
    const s = v.s
    let targetBiome = 0
    let blend = 0
    if (s < 600) {
      targetBiome = 0
      blend = s / 600
    } else if (s < 1600) {
      targetBiome = 1
      blend = (s - 600) / 1000
    } else {
      targetBiome = 2
      blend = Math.min(1, (s - 1600) / 1400)
    }
    if (this.skyMat.uniforms.uBiome) {
      const biomeU = targetBiome === 0 ? blend * 0.35 : targetBiome === 1 ? 0.35 + blend * 0.45 : 0.8 + blend * 0.2
      this.skyMat.uniforms.uBiome.value += (biomeU - this.skyMat.uniforms.uBiome.value) * Math.min(1, dt * 1.2)
    }
    // Fade city towers/palms as we leave Earth
    const cityFade = targetBiome === 0 ? 1 - blend * 0.4 : targetBiome === 1 ? 0.55 - blend * 0.45 : Math.max(0.02, 0.1 - blend * 0.08)
    if (this.towers) this.towers.visible = cityFade > 0.05
    if (this.palms) this.palms.visible = cityFade > 0.15
    // denser star field opacity in deep space
    this.starMat.transparent = true
    const starBoost = targetBiome === 0 ? 1 : targetBiome === 1 ? 1.4 + blend * 0.4 : 1.9 + blend * 0.5
    // fog / road tint toward cosmic
    if (this.roadMat.uniforms.uFog) {
      const fog = this.roadMat.uniforms.uFog.value as THREE.Color
      if (targetBiome === 0) fog.setRGB(0.047, 0.039, 0.086)
      else if (targetBiome === 1) fog.setRGB(0.04 + blend * 0.02, 0.02, 0.12 + blend * 0.08)
      else fog.setRGB(0.02, 0.01, 0.06 + blend * 0.04)
    }
    // denser bloom into deep space
    if (this.bloom) {
      const add = targetBiome === 0 ? blend * 0.08 : targetBiome === 1 ? 0.12 + blend * 0.15 : 0.28 + blend * 0.2
      this.bloom.intensity = FrScene.BLOOM + add * 0.6 * Math.min(1.2, starBoost * 0.5)
    }
    for (const c of this.comets) {
      if (c.wait > 0) {
        c.wait -= dt
        c.mesh.visible = false
        if (c.wait <= 0) {
          c.t = 0
          c.dur = 1.1 + Math.random() * 0.8
          c.x = -60 + Math.random() * 260
          c.y = 150 + Math.random() * 160
          const ang = Math.PI + 0.32 + Math.random() * 0.25
          c.dx = Math.cos(ang)
          c.dy = Math.sin(ang)
        }
        continue
      }
      c.t += dt
      const f = c.t / c.dur
      if (f >= 1) {
        c.wait = 0.6 + Math.random() * 2.6
        c.mesh.visible = false
        continue
      }
      c.mesh.visible = true
      const travel = 230 * f
      c.mesh.position.set(c.x + c.dx * travel, c.y + c.dy * travel, -600)
      c.mesh.rotation.z = Math.atan2(c.dy, c.dx)
      ;(c.mesh.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.PI * Math.min(1, f * 1.15))
    }
  }

  private updateCamera(v: ViewState, dt: number) {
    const k = 1 - Math.exp(-dt * 7)
    this.camX += (v.x * 0.62 - this.camX) * k
    // Over-shoulder chase — runner fills lower third, lanes readable for swipes
    const ty = 3.4 + Math.max(0, v.y) * 0.32 - (v.sliding ? 0.25 : 0)
    this.camY += (ty - this.camY) * (1 - Math.exp(-dt * 5))
    const speedF = THREE.MathUtils.clamp((v.speed - 16) / 34, 0, 1)
    const aspect = this.camera.aspect
    const baseFov = aspect > 0.8 ? 52 : 64
    const tf = baseFov + speedF * 13 + (v.boost - 1) * 22
    this.fov += (tf - this.fov) * (1 - Math.exp(-dt * 3))
    const sh = v.shake
    const sx = sh ? (Math.sin(v.time * 61) + Math.sin(v.time * 37)) * 0.06 * sh : 0
    const sy = sh ? Math.sin(v.time * 53) * 0.05 * sh : 0
    let dz = 6.8 - speedF * 0.55
    if (v.dead) dz -= Math.min(1.2, v.deadT * 1.5)
    this.camera.position.set(this.camX + sx, this.camY + sy, dz)
    this.lookT.set(v.x * 0.5, 1.15, -14)
    this.camera.lookAt(this.lookT)
    this.camera.rotation.z += (this.runner.group.rotation.z || 0) * 0.15
    this.camera.fov = this.fov
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld(true)

    // speed lines
    const op = THREE.MathUtils.clamp((v.speed - 20) / 18, 0, 1) * 0.26 + (v.boost - 1) * 0.7
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

  private renderReflection() {
    if (!this.reflRT) return
    const cam = this.camera
    const m = this.mirrorCam
    m.fov = cam.fov
    m.aspect = cam.aspect
    m.near = cam.near
    m.far = cam.far
    m.position.set(cam.position.x, -cam.position.y, cam.position.z)
    m.up.set(0, -1, 0)
    m.lookAt(this.lookT.x, -this.lookT.y, this.lookT.z)
    m.updateProjectionMatrix()
    m.updateMatrixWorld(true)
    this.texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
    this.texMat.multiply(m.projectionMatrix).multiply(m.matrixWorldInverse)
    this.roadMat.uniforms.uTexMat.value.copy(this.texMat)
    const r = this.renderer
    const prevTarget = r.getRenderTarget()
    const prevTM = r.toneMapping
    r.toneMapping = THREE.NoToneMapping
    this.road.visible = false
    r.setRenderTarget(this.reflRT)
    r.clear()
    r.render(this.scene, m)
    r.setRenderTarget(prevTarget)
    r.toneMapping = prevTM
    this.road.visible = true
  }

  /** Render the planar reflection every Nth frame (adaptive quality step; it is blurred anyway). */
  reflEvery = 1
  private frameNo = 0

  render() {
    if (this.frameNo++ % this.reflEvery === 0) this.renderReflection()
    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.composer?.dispose()
    this.reflRT?.dispose()
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

export { PALETTE }
