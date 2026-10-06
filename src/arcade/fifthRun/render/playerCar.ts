/**
 * Fifth Gear — procedural photoreal-ish player car (’59 Cadillac brand vibes).
 * Pearl/chrome land yacht facing −Z; wheel spin, bank, hop, slide squat, crash tumble.
 * Slightly undersized vs traffic for lane readability under a higher chase cam.
 */
import * as THREE from 'three'
import { buildCar, type CarParts } from './props'
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

  constructor() {
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

    // Pearl champagne Cadillac — clearcoat PBR
    const paint = this.parts.paint as THREE.MeshPhysicalMaterial
    paint.color.set('#f4eee4')
    paint.metalness = 0.62
    paint.roughness = 0.2
    paint.envMapIntensity = 1.45
    if ('clearcoat' in paint) {
      paint.clearcoat = 1
      paint.clearcoatRoughness = 0.1
    }
    paint.emissive = new THREE.Color('#2a2018')
    paint.emissiveIntensity = 0.06
    this.hoodieMat = this.parts.paint

    // Player headlights always on (facing into the run)
    this.parts.head.emissiveIntensity = 4.2
    this.parts.head.emissive = new THREE.Color('#fff6dc')
    this.parts.tail.emissiveIntensity = 3.4

    // Subtle teal accent stripe (brand)
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.03, 4.4),
      new THREE.MeshStandardMaterial({
        color: '#00c8c4',
        emissive: new THREE.Color('#00c8c4'),
        emissiveIntensity: 1.7,
        metalness: 0.75,
        roughness: 0.22,
      }),
    )
    stripe.position.set(0, 0.76, 0.05)
    this.parts.group.add(stripe)

    // Hood ornament / crest
    const crest = new THREE.Mesh(
      new THREE.ConeGeometry(0.032, 0.12, 6),
      new THREE.MeshPhysicalMaterial({ color: '#d4af37', metalness: 1, roughness: 0.18, clearcoat: 0.6 }),
    )
    crest.position.set(0, 0.94, -2.45)
    this.parts.group.add(crest)

    // Player-readable rear accents (no slab fins — base mesh already has tapered fins)
    const chromeFin = new THREE.MeshPhysicalMaterial({
      color: '#eef2fa',
      metalness: 1,
      roughness: 0.1,
      envMapIntensity: 1.6,
      clearcoat: 0.55,
    })
    for (const side of [-1, 1] as const) {
      const spear = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.55, 4, 8), chromeFin)
      spear.rotation.x = Math.PI / 2
      spear.position.set(side * 0.84, 1.18, 2.35)
      this.parts.group.add(spear)
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), chromeFin)
      tip.position.set(side * 0.84, 1.28, 2.62)
      this.parts.group.add(tip)
      const tipLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 10, 8),
        new THREE.MeshStandardMaterial({
          color: '#ff2030',
          emissive: new THREE.Color('#ff1a2a'),
          emissiveIntensity: 6,
          roughness: 0.2,
        }),
      )
      tipLight.position.set(side * 0.84, 1.18, 2.72)
      this.parts.group.add(tipLight)
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.045, 0.65), chromeFin)
    deck.position.set(0, 0.9, 2.1)
    this.parts.group.add(deck)

    this.group.add(this.parts.group)
    // Scene owns the player contact blob — hide mesh shadow from buildCar
    if (this.parts.shadow) this.parts.shadow.visible = false
    // Slightly smaller than traffic for lane clarity under raised camera
    this.parts.group.scale.setScalar(0.84)

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
        if (Math.abs(m.position.y - 0.38) < 0.06 && Math.abs(Math.abs(m.position.x) - 0.86) < 0.08) {
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
