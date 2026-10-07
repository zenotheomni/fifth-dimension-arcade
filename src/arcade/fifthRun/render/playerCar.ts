/**
 * Fifth Glide (legacy traffic helper) — player sports coupe (pearl clearcoat).
 * Facing −Z; wheel spin, bank, hop, slide squat, crash tumble.
 * Slightly undersized vs traffic for lane readability under a higher chase cam.
 */
import * as THREE from 'three'
import { buildCar, type CarParts } from './props'
import { recolorPaint, setLightIntensity } from './carGltf'
import { glowTexture } from './textures'

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
  /** 🖐️ ghost / invisible */
  invisible?: boolean
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export class PlayerCar {
  group = new THREE.Group()
  meshes: THREE.Mesh[] = []
  /** Paint material — used for rim / ghost tint (replaces hoodieMat). */
  hoodieMat: THREE.MeshStandardMaterial
  private parts: CarParts
  private wheels: THREE.Mesh[] = []
  private spin = 0
  private bankS = 0
  private squat = 0
  private bodyY = 0

  constructor(parts?: CarParts) {
    if (parts) {
      this.parts = parts
    } else {
    const glow = glowTexture()
    const chrome = new THREE.MeshPhysicalMaterial({
      color: '#eef2fa',
      metalness: 1,
      roughness: 0.1,
      envMapIntensity: 1.55,
      clearcoat: 0.6,
      clearcoatRoughness: 0.15,
    })
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#0a1828',
      metalness: 0.15,
      roughness: 0.04,
      transmission: 0.4,
      transparent: true,
      opacity: 0.78,
      envMapIntensity: 2.4,
    })
    const tire = new THREE.MeshStandardMaterial({ color: '#0a0a0c', roughness: 0.92, metalness: 0.05 })
    const white = new THREE.MeshStandardMaterial({ color: '#f4f0e8', roughness: 0.5, metalness: 0.12 })
    this.parts = buildCar({ chrome, glass, tire, white, glow })
    }

    // Pearl champagne player paint
    recolorPaint(this.parts.paint, '#f4eee4')
    const paint = this.parts.paint
    paint.metalness = Math.max(paint.metalness, 0.55)
    paint.roughness = Math.min(paint.roughness, 0.28)
    if ('envMapIntensity' in paint) paint.envMapIntensity = 1.55
    if ('clearcoat' in paint) {
      ;(paint as THREE.MeshPhysicalMaterial).clearcoat = 1
      ;(paint as THREE.MeshPhysicalMaterial).clearcoatRoughness = 0.1
    }
    paint.emissive = new THREE.Color('#2a2018')
    paint.emissiveIntensity = 0.06
    this.hoodieMat = this.parts.paint

    // Player headlights always on (facing into the run)
    setLightIntensity(this.parts.head, 5.5, '#fff6dc')
    setLightIntensity(this.parts.tail, 4.0, '#ff1a2a')

    // Brand teal accent only on procedural mesh (GLTF already reads premium)
    if (!parts) {
      const stripe = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.02, 2.8, 3, 8),
        new THREE.MeshStandardMaterial({
          color: '#00c8c4',
          emissive: new THREE.Color('#00c8c4'),
          emissiveIntensity: 2.0,
          metalness: 0.7,
          roughness: 0.2,
        }),
      )
      stripe.rotation.z = Math.PI / 2
      stripe.position.set(0, 1.32, 0.05)
      this.parts.group.add(stripe)
    }

    this.group.add(this.parts.group)
    // Scene owns the player contact blob — hide mesh shadow from buildCar
    if (this.parts.shadow) this.parts.shadow.visible = false
    // Slightly smaller than traffic for lane clarity under raised camera
    this.parts.group.scale.setScalar(0.88)

    this.parts.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh
        this.meshes.push(m)
        const g = m.geometry
        if (g instanceof THREE.CylinderGeometry || g.type === 'CylinderGeometry') {
          this.wheels.push(m)
        }
      }
    })
    if (this.wheels.length < 4) {
      this.wheels = []
      this.parts.group.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh) return
        const m = o as THREE.Mesh
        if (Math.abs(m.position.y - 0.36) < 0.08 && Math.abs(Math.abs(m.position.x) - 0.82) < 0.1) {
          this.wheels.push(m)
        }
      })
    }
  }

  update(p: PoseInput) {
    const dt = p.dt
    const k = 1 - Math.exp(-dt * 12)
    this.bankS = lerp(this.bankS, p.bank, 1 - Math.exp(-dt * 10))
    this.squat = lerp(this.squat, p.sliding ? 1 : 0, 1 - Math.exp(-dt * 16))

    if (!p.dead && !p.idle) this.spin += dt * p.speed * 1.15
    else if (!p.dead) this.spin += dt * 2.2
    for (const w of this.wheels) {
      w.rotation.x = this.spin
    }

    this.group.rotation.z = -this.bankS * 0.18
    this.group.rotation.y = -this.bankS * 0.12

    const airT = p.air ? 1 : 0
    this.parts.group.rotation.x = lerp(this.parts.group.rotation.x, airT * (p.vy > 0 ? -0.12 : 0.18) - this.squat * 0.08, k)
    this.bodyY = lerp(this.bodyY, -this.squat * 0.12 + (p.air ? 0 : 0), k)
    this.parts.group.position.y = this.bodyY

    if (p.invisible) {
      this.parts.paint.opacity = 0.35
      this.parts.paint.transparent = true
      this.parts.paint.emissiveIntensity = 0.45
      this.parts.paint.emissive.set('#8a6cff')
    } else {
      this.parts.paint.opacity = 1
      this.parts.paint.transparent = false
      this.parts.paint.emissiveIntensity = 0.06
      this.parts.paint.emissive.set('#2a2018')
    }

    if (p.dead) {
      const t = Math.min(1, p.deadT / 0.55)
      const e = 1 - (1 - t) * (1 - t)
      if (p.deathKind === 'gap') {
        this.parts.group.rotation.x = lerp(this.parts.group.rotation.x, 0.8, e)
      } else {
        this.parts.group.rotation.x = lerp(0, 0.55, e)
        this.parts.group.rotation.z = lerp(0, 0.9 * (this.bankS >= 0 ? 1 : -1), e)
        this.parts.group.position.y = lerp(0, 0.35, e)
        this.parts.group.position.z = lerp(0, 0.8, e)
      }
    } else if (!p.air) {
      this.parts.group.position.z = lerp(this.parts.group.position.z, 0, k)
      if (Math.abs(this.parts.group.rotation.z) > 0.01) this.parts.group.rotation.z = lerp(this.parts.group.rotation.z, 0, k)
    }
  }

  setGhostRim(active: boolean) {
    void active
  }
}
