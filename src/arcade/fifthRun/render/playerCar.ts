/**
 * Fifth Gear — procedural photoreal-ish player car (’59 Cadillac brand vibes).
 * Pearl/chrome land yacht facing −Z; wheel spin, bank, hop, slide squat, crash tumble.
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
    const chrome = new THREE.MeshStandardMaterial({ color: '#e8eef8', metalness: 1, roughness: 0.18, envMapIntensity: 1.1 })
    const glass = new THREE.MeshStandardMaterial({
      color: '#0c1828',
      metalness: 0.85,
      roughness: 0.08,
      envMapIntensity: 1.7,
    })
    const tire = new THREE.MeshStandardMaterial({ color: '#0a0a0c', roughness: 0.92, metalness: 0.05 })
    const white = new THREE.MeshStandardMaterial({ color: '#f4f0e8', roughness: 0.55, metalness: 0.1 })
    this.parts = buildCar({ chrome, glass, tire, white, glow })

    // Pearl white / champagne Cadillac — photoreal paint with strong metalness
    this.parts.paint.color.set('#f2ebe0')
    this.parts.paint.metalness = 0.72
    this.parts.paint.roughness = 0.22
    this.parts.paint.envMapIntensity = 1.15
    this.parts.paint.emissive = new THREE.Color('#2a2018')
    this.parts.paint.emissiveIntensity = 0.08
    this.hoodieMat = this.parts.paint

    // Player headlights always on (facing into the run)
    this.parts.head.emissiveIntensity = 3.2
    this.parts.head.emissive = new THREE.Color('#fff4d8')
    this.parts.tail.emissiveIntensity = 2.8

    // Subtle teal accent stripe (brand)
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.04, 4.8),
      new THREE.MeshStandardMaterial({
        color: '#00c8c4',
        emissive: new THREE.Color('#00c8c4'),
        emissiveIntensity: 1.4,
        metalness: 0.6,
        roughness: 0.3,
      }),
    )
    stripe.position.set(0, 0.72, 0.05)
    this.parts.group.add(stripe)

    // Hood ornament / crest
    const crest = new THREE.Mesh(
      new THREE.ConeGeometry(0.04, 0.14, 6),
      new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 1, roughness: 0.25 }),
    )
    crest.position.set(0, 0.92, -2.35)
    this.parts.group.add(crest)

    // Player-only taller fins + chrome tips (readable from chase cam)
    const chromeFin = new THREE.MeshStandardMaterial({ color: '#e8eef8', metalness: 1, roughness: 0.15, envMapIntensity: 1.2 })
    for (const side of [-1, 1] as const) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 1.4), this.parts.paint)
      fin.position.set(side * 0.88, 1.15, 2.0)
      fin.rotation.x = -0.35
      this.parts.group.add(fin)
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), chromeFin)
      tip.position.set(side * 0.88, 1.42, 2.55)
      this.parts.group.add(tip)
      const tipLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshStandardMaterial({ color: '#ff2030', emissive: new THREE.Color('#ff1a2a'), emissiveIntensity: 5, roughness: 0.3 }),
      )
      tipLight.position.set(side * 0.88, 1.28, 2.72)
      this.parts.group.add(tipLight)
    }
    // Rear deck chrome
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.8), chromeFin)
    deck.position.set(0, 0.9, 2.2)
    this.parts.group.add(deck)

    this.group.add(this.parts.group)
    this.parts.group.scale.setScalar(1.08)
    // Traffic cars sit with rear at +Z; player drives −Z — already correct.

    this.parts.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh
        this.meshes.push(m)
        // Approx wheel detection: cylinder-ish near ground
        const g = m.geometry
        if (g instanceof THREE.CylinderGeometry || (g.type === 'CylinderGeometry')) {
          this.wheels.push(m)
        }
      }
    })
    // Fallback: find meshes near wheel positions
    if (this.wheels.length < 4) {
      this.wheels = []
      this.parts.group.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh) return
        const m = o as THREE.Mesh
        if (Math.abs(m.position.y - 0.36) < 0.05 && Math.abs(Math.abs(m.position.x) - 0.84) < 0.05) {
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

    // Wheel spin from speed
    if (!p.dead && !p.idle) this.spin += dt * p.speed * 1.15
    else if (!p.dead) this.spin += dt * 2.2
    for (const w of this.wheels) {
      w.rotation.x = this.spin
    }

    // Banking into lane changes
    this.group.rotation.z = -this.bankS * 0.18
    this.group.rotation.y = -this.bankS * 0.12

    // Hop / air pitch
    const airT = p.air ? 1 : 0
    this.parts.group.rotation.x = lerp(this.parts.group.rotation.x, airT * (p.vy > 0 ? -0.12 : 0.18) - this.squat * 0.08, k)
    this.bodyY = lerp(this.bodyY, -this.squat * 0.12 + (p.air ? 0 : 0), k)
    this.parts.group.position.y = this.bodyY

    // Ghost / invisible paint
    if (p.invisible) {
      this.parts.paint.opacity = 0.35
      this.parts.paint.transparent = true
      this.parts.paint.emissiveIntensity = 0.45
      this.parts.paint.emissive.set('#8a6cff')
    } else {
      this.parts.paint.opacity = 1
      this.parts.paint.transparent = false
      this.parts.paint.emissiveIntensity = 0.08
      this.parts.paint.emissive.set('#2a2018')
    }

    // Crash tumble
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
    // no-op hook kept for scene compatibility; paint handled in update
    void active
  }
}
