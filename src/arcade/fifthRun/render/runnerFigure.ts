/**
 * Fifth Glide — procedural low-poly hooded runner. Lightweight FALLBACK only: shown instantly while
 * the rigged human (`humanRunner.ts`, runner.glb) streams in, and kept if that load fails.
 * Joint hierarchy animated procedurally: run cycle, jump tuck, slide, lane-change bank, crash tumble.
 * Faces −Z (away from the camera), feet at y = 0.
 */
import * as THREE from 'three'
import { addRim } from './shaders'

export type PoseInput = {
  dt: number
  speed: number
  air: boolean
  vy: number
  sliding: boolean
  /** lateral velocity sign/size (-1..1) */
  bank: number
  dead: boolean
  deadT: number
  deathKind: string | null
  idle: boolean
}

/** Common surface the scene drives (procedural fallback + rigged GLB runner). */
export interface RunnerView {
  group: THREE.Group
  meshes: THREE.Mesh[]
  update(p: PoseInput): void
  setRim(color: string): void
  dispose?(): void
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function capsule(r: number, len: number, mat: THREE.Material, seg = 8) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, seg), mat)
  m.position.y = -(len / 2 + r * 0.6)
  return m
}

export class RunnerFigure implements RunnerView {
  group = new THREE.Group()
  private body = new THREE.Group()
  private spine = new THREE.Group()
  private head = new THREE.Group()
  private shL = new THREE.Group()
  private shR = new THREE.Group()
  private elL = new THREE.Group()
  private elR = new THREE.Group()
  private hipL = new THREE.Group()
  private hipR = new THREE.Group()
  private knL = new THREE.Group()
  private knR = new THREE.Group()
  private anL = new THREE.Group()
  private anR = new THREE.Group()
  phase = 0
  private blend = { air: 0, slide: 0, idle: 1 }
  private bankS = 0
  meshes: THREE.Mesh[] = []
  hoodieMat: THREE.MeshStandardMaterial

  constructor() {
    const hoodie = addRim(
      new THREE.MeshStandardMaterial({ color: '#2a2040', roughness: 0.82, metalness: 0.0 }),
      new THREE.Color('#ff3fc8'),
      1.25,
      3.0,
    )
    this.hoodieMat = hoodie
    const hoodieDark = addRim(new THREE.MeshStandardMaterial({ color: '#1e1730', roughness: 0.9 }), new THREE.Color('#ff3fc8'), 1.0, 3.0)
    const pants = addRim(new THREE.MeshStandardMaterial({ color: '#17141f', roughness: 0.78 }), new THREE.Color('#a84dff'), 1.2, 2.6)
    const shoe = addRim(new THREE.MeshStandardMaterial({ color: '#3b3150', roughness: 0.5 }), new THREE.Color('#ff3fc8'), 0.9, 2.6)
    const sole = new THREE.MeshStandardMaterial({ color: '#7a7090', roughness: 0.7 })
    const accent = new THREE.MeshStandardMaterial({ color: '#ff3d5a', roughness: 0.4, emissive: new THREE.Color('#ff3d5a'), emissiveIntensity: 0.6 })
    const glove = addRim(new THREE.MeshStandardMaterial({ color: '#2a2030', roughness: 0.7 }), new THREE.Color('#ff3fc8'), 1.0, 2.4)

    const g = this.group
    g.add(this.body)
    this.body.position.y = 0.95

    // pelvis
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), pants)
    pelvis.scale.set(1.25, 0.75, 0.9)
    this.body.add(pelvis)

    // torso (hoodie)
    this.body.add(this.spine)
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.3, 6, 12), hoodie)
    torso.scale.set(1.18, 1, 0.78)
    torso.position.y = 0.3
    this.spine.add(torso)
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 16), hoodieDark)
    hem.rotation.x = Math.PI / 2
    hem.scale.set(1.12, 0.82, 1)
    hem.position.y = 0.07
    this.spine.add(hem)
    // kangaroo pocket bulge (front, rarely seen) + back seam ridge for silhouette
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.04), hoodieDark)
    back.position.set(0, 0.32, 0.15)
    this.spine.add(back)

    // hood
    this.head.position.y = 0.62
    this.spine.add(this.head)
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.165, 16, 12), hoodie)
    hood.scale.set(1.0, 1.12, 1.12)
    hood.position.set(0, 0.06, 0.02)
    this.head.add(hood)
    const peak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 10), hoodie)
    peak.position.set(0, 0.13, 0.12)
    peak.rotation.x = -2.2
    this.head.add(peak)
    const opening = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14), new THREE.MeshBasicMaterial({ color: '#05030a' }))
    opening.position.set(0, 0.04, -0.175)
    opening.rotation.y = Math.PI
    this.head.add(opening)
    const neck = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 6, 14), hoodieDark)
    neck.rotation.x = Math.PI / 2
    neck.position.y = -0.06
    this.head.add(neck)

    // arms
    for (const [sh, el, side] of [
      [this.shL, this.elL, -1],
      [this.shR, this.elR, 1],
    ] as const) {
      sh.position.set(0.24 * side, 0.5, 0)
      this.spine.add(sh)
      const upper = capsule(0.068, 0.22, hoodie)
      sh.add(upper)
      const cuffless = upper
      void cuffless
      el.position.y = -0.31
      sh.add(el)
      el.add(capsule(0.06, 0.2, hoodie))
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.066, 0.05, 10), hoodieDark)
      cuff.position.y = -0.28
      el.add(cuff)
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), glove)
      hand.scale.set(0.9, 1.05, 1.1)
      hand.position.y = -0.34
      el.add(hand)
    }

    // legs
    for (const [hp, kn, an, side] of [
      [this.hipL, this.knL, this.anL, -1],
      [this.hipR, this.knR, this.anR, 1],
    ] as const) {
      hp.position.set(0.1 * side, -0.02, 0)
      this.body.add(hp)
      hp.add(capsule(0.088, 0.3, pants))
      kn.position.y = -0.44
      hp.add(kn)
      kn.add(capsule(0.072, 0.32, pants))
      an.position.y = -0.46
      kn.add(an)
      const upperShoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.27, 1, 1, 2), shoe)
      upperShoe.position.set(0, 0.0, -0.06)
      an.add(upperShoe)
      const soleM = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.035, 0.29), sole)
      soleM.position.set(0, -0.05, -0.06)
      an.add(soleM)
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.02, 0.16), accent)
      stripe.position.set(0, 0.0, -0.02)
      an.add(stripe)
      const heel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.04), accent)
      heel.position.set(0, 0.03, 0.07)
      an.add(heel)
    }

    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) this.meshes.push(o as THREE.Mesh)
    })
  }

  setRim(color: string) {
    const rim = this.hoodieMat.userData.rim as { uRimColor: { value: THREE.Color } } | undefined
    rim?.uRimColor.value.set(color)
  }

  update(p: PoseInput) {
    const dt = p.dt
    const k = 1 - Math.exp(-dt * 14)
    this.blend.air = lerp(this.blend.air, p.air ? 1 : 0, p.air ? 1 - Math.exp(-dt * 22) : k)
    this.blend.slide = lerp(this.blend.slide, p.sliding ? 1 : 0, 1 - Math.exp(-dt * 20))
    this.blend.idle = lerp(this.blend.idle, p.idle ? 1 : 0, k)
    this.bankS = lerp(this.bankS, p.bank, 1 - Math.exp(-dt * 12))

    const cadence = p.idle ? 1.6 : 1.35 + p.speed * 0.045 // cycles / s
    if (!p.dead) this.phase += dt * Math.PI * 2 * cadence
    const ph = this.phase
    const s = Math.sin(ph)
    const c = Math.cos(ph)
    const A = this.blend.air
    const S = this.blend.slide
    const I = this.blend.idle
    const run = (1 - A) * (1 - S)
    const amp = lerp(1, 0.35, I)

    // ── run cycle ──
    const thighL = 0.95 * s * amp
    const thighR = -0.95 * s * amp
    const kneeL = -(0.25 + 1.35 * Math.max(0, Math.sin(ph + 1.25)) * amp)
    const kneeR = -(0.25 + 1.35 * Math.max(0, Math.sin(ph + Math.PI + 1.25)) * amp)
    const ankL = 0.25 * Math.sin(ph - 0.6) * amp
    const ankR = 0.25 * Math.sin(ph + Math.PI - 0.6) * amp
    const armL = -0.95 * s * amp
    const armR = 0.95 * s * amp
    const elbow = 1.45

    // ── jump tuck (one knee drives up) ──
    const jThL = 1.35
    const jKnL = -1.9
    const jThR = -0.35
    const jKnR = -1.25
    const rising = p.vy > 0 ? 1 : 0.6

    // ── slide (lean back, legs forward) ──
    const sTh = 1.25
    const sKn = -0.25

    this.hipL.rotation.x = thighL * run + jThL * A * rising + sTh * S
    this.hipR.rotation.x = thighR * run + jThR * A + (sTh - 0.35) * S
    this.knL.rotation.x = kneeL * run + jKnL * A + sKn * S
    this.knR.rotation.x = kneeR * run + jKnR * A + (sKn - 0.6) * S
    this.anL.rotation.x = ankL * run + 0.4 * A
    this.anR.rotation.x = ankR * run + 0.3 * A
    this.shL.rotation.x = armL * run + -0.9 * A + 0.6 * S
    this.shR.rotation.x = armR * run + 1.6 * A + -0.4 * S
    this.shL.rotation.z = -0.12 - 0.5 * A - 0.3 * S
    this.shR.rotation.z = 0.12 + 0.35 * A + 0.9 * S
    this.elL.rotation.x = elbow * (1 - S * 0.6) + 0.2 * A
    this.elR.rotation.x = elbow * (1 - S * 0.4) - 0.3 * A

    // torso
    const bob = (0.055 * Math.abs(c) - 0.025) * amp * run
    this.spine.rotation.x = lerp(-0.28, -0.08, I) * run + -0.15 * A + 0.15 * S
    this.spine.rotation.y = 0.16 * s * amp * run
    this.head.rotation.x = 0.12 * run + 0.15 * S
    this.body.position.y = 0.95 + bob + -0.1 * A - 0.6 * S
    this.body.rotation.x = 1.05 * S + 0.08 * A
    this.body.position.z = 0.18 * S

    // lane-change bank
    this.group.rotation.z = -this.bankS * 0.22
    this.group.rotation.y = -this.bankS * 0.18

    // crash tumble
    if (p.dead) {
      const t = Math.min(1, p.deadT / 0.55)
      const e = 1 - (1 - t) * (1 - t)
      if (p.deathKind === 'gap') {
        this.body.rotation.x = lerp(this.body.rotation.x, -0.6, e)
        this.shL.rotation.x = lerp(this.shL.rotation.x, 2.8, e)
        this.shR.rotation.x = lerp(this.shR.rotation.x, 2.6, e)
      } else {
        this.body.rotation.x = lerp(0.1, 1.45, e)
        this.body.position.y = lerp(0.95, 0.28, e)
        this.body.position.z = lerp(0, 0.6, e)
        this.shL.rotation.x = lerp(this.shL.rotation.x, 2.4, e)
        this.shR.rotation.x = lerp(this.shR.rotation.x, 2.0, e)
        this.hipL.rotation.x = lerp(this.hipL.rotation.x, 0.4, e)
        this.hipR.rotation.x = lerp(this.hipR.rotation.x, -0.1, e)
      }
    }
  }
}
