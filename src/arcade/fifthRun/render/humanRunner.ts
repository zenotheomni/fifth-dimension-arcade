/**
 * Fifth Glide — rigged, skinned astronaut runner (GLB + AnimationMixer).
 *
 * Asset: `public/art/runner/astronaut.glb`, built from Microsoft Rocketbox (MIT): the Male_Adult_18
 * skinned body is re-skinned as an EVA suit (mesh inflated along normals, off-white fabric albedo
 * derived from the original cloth folds + normal map + roughness variation); a pressure helmet with a
 * metallic gold visor, PLSS backpack, chest control module, neck / wrist / arm bearing rings are
 * rigid parts parented to the Head / Spine2 / arm bones so they move with the mocap. Clips are
 * Rocketbox mocap (run_fast_01 → `run`, idle_neutral_01 → `idle`, crouch_idle → `crouch`).
 * meshopt + WebP, ~0.6 MB.
 *
 * Blending: run (time-scaled to game speed) · leap (run clip frozen at the split-stride frame) for
 * jumps · crouch for slides · idle on the start line. Bank / lean / crash tumble are applied on a
 * parent group so the mocap stays intact. Faces −Z (away from camera), feet at y = 0.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { addRim } from './shaders'
import type { PoseInput, RunnerView } from './runnerFigure'

/** Run clip: one full stride cycle (two steps) is 0.6 s at timeScale 1. */
const LEAP_T = 0.1
const HEIGHT = 1.86
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export async function loadHumanRunner(baseUrl = import.meta.env.BASE_URL): Promise<HumanRunner> {
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  const gltf = await loader.loadAsync(`${baseUrl}art/runner/astronaut.glb`)
  return new HumanRunner(gltf.scene, gltf.animations)
}

export class HumanRunner implements RunnerView {
  group = new THREE.Group()
  meshes: THREE.Mesh[] = []
  private tilt = new THREE.Group()
  private model: THREE.Object3D
  private mixer: THREE.AnimationMixer
  private run: THREE.AnimationAction
  private leap: THREE.AnimationAction
  private idle: THREE.AnimationAction
  private crouch: THREE.AnimationAction
  private mats: THREE.MeshStandardMaterial[] = []
  private rims: { uRimColor: { value: THREE.Color }; uRimStr: { value: number } }[] = []
  private blend = { air: 0, slide: 0, idle: 1 }
  private bankS = 0
  private crashT = 0

  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.model = model
    this.group.add(this.tilt)
    this.tilt.add(model)

    const seen = new Set<THREE.Material>()
    model.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.frustumCulled = false // skinned bounds lag the pose; runner is always on screen
      this.meshes.push(m)
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const mat of mats) {
        if (seen.has(mat)) continue
        seen.add(mat)
        const std = mat as THREE.MeshStandardMaterial
        this.mats.push(std)
        if (std.name === 'visor') std.envMapIntensity = 2.2
        else if (/metal|anodized/.test(std.name)) std.envMapIntensity = 1.4
        else std.envMapIntensity = 0.85
        if (std.name === 'suit' || std.name === 'shell' || std.name === 'pack') {
          // faint neon rim so the white suit separates from the night sky (kept subtle → still reads real)
          addRim(std, new THREE.Color('#ff4fd0'), 0.22, 3.6)
          this.rims.push(std.userData.rim)
        }
        std.needsUpdate = true
      }
    })

    const find = (n: string) => {
      const c = clips.find((x) => x.name === n)
      if (!c) throw new Error(`runner.glb missing clip ${n}`)
      return c
    }
    this.mixer = new THREE.AnimationMixer(model)
    const runClip = find('run')
    const leapClip = runClip.clone()
    leapClip.name = 'leap'
    this.run = this.mixer.clipAction(runClip)
    this.leap = this.mixer.clipAction(leapClip)
    this.idle = this.mixer.clipAction(find('idle'))
    this.crouch = this.mixer.clipAction(find('crouch'))
    for (const a of [this.run, this.leap, this.idle, this.crouch]) {
      a.play()
      a.setEffectiveWeight(0)
    }
    this.leap.time = LEAP_T
    this.leap.timeScale = 0
    this.crouch.time = 1.2
    this.crouch.timeScale = 0
    this.idle.setEffectiveWeight(1)
    this.mixer.update(0)

    // fit: height → HEIGHT, feet on y = 0, centred, facing −Z (asset faces +Z)
    model.rotation.y = Math.PI
    model.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(model)
    const h = Math.max(1e-3, box.max.y - box.min.y)
    model.scale.multiplyScalar(HEIGHT / h)
    model.updateMatrixWorld(true)
    const b2 = new THREE.Box3().setFromObject(model)
    const c = b2.getCenter(new THREE.Vector3())
    model.position.x -= c.x
    model.position.z -= c.z
    model.position.y -= b2.min.y
  }

  /** Reflection env (visor / metal / fabric sheen) — owned by the scene. */
  setEnv(env: THREE.Texture | null) {
    for (const m of this.mats) {
      m.envMap = env
      m.needsUpdate = true
    }
  }

  setRim(color: string) {
    for (const r of this.rims) r.uRimColor.value.set(color)
  }

  update(p: PoseInput) {
    const dt = p.dt
    const k = 1 - Math.exp(-dt * 14)
    this.blend.air = lerp(this.blend.air, p.air ? 1 : 0, p.air ? 1 - Math.exp(-dt * 20) : 1 - Math.exp(-dt * 16))
    this.blend.slide = lerp(this.blend.slide, p.sliding ? 1 : 0, 1 - Math.exp(-dt * 22))
    this.blend.idle = lerp(this.blend.idle, p.idle ? 1 : 0, k)
    this.bankS = lerp(this.bankS, p.bank, 1 - Math.exp(-dt * 12))
    const A = this.blend.air
    const S = this.blend.slide
    const I = this.blend.idle

    this.idle.setEffectiveWeight(I)
    this.run.setEffectiveWeight((1 - I) * (1 - A) * (1 - S))
    this.leap.setEffectiveWeight((1 - I) * A * (1 - S))
    this.crouch.setEffectiveWeight((1 - I) * S)
    // stride rate follows game speed (17 → 44 m/s maps to ~1.3× → 1.85×)
    this.run.timeScale = THREE.MathUtils.clamp(0.75 + p.speed * 0.025, 1, 1.9)

    if (p.dead) this.crashT = p.deadT
    else this.crashT = 0
    this.mixer.update(p.dead ? dt * Math.max(0, 1 - p.deadT * 4) : dt)

    // lean: forward into the run, tuck forward in the air, sit back slightly in the slide
    const lean = -0.06 * (1 - I) * (1 - S) - 0.1 * A + 0.12 * S
    this.tilt.rotation.x = lean
    this.tilt.position.set(0, 0, 0)
    this.group.rotation.z = -this.bankS * 0.16
    this.group.rotation.y = -this.bankS * 0.14

    if (p.dead && p.deathKind !== 'gap') {
      const t = Math.min(1, this.crashT / 0.55)
      const e = 1 - (1 - t) * (1 - t)
      // knocked back onto the road (pivot at the feet)
      this.tilt.rotation.x = lerp(lean, 1.42, e)
      this.tilt.position.y = 0.1 * e
      this.tilt.position.z = 0.35 * e
    } else if (p.dead) {
      this.tilt.rotation.x = lerp(lean, -0.5, Math.min(1, this.crashT / 0.5))
    }
  }

  dispose() {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.model)
  }
}
