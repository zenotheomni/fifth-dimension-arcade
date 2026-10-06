import * as THREE from 'three'
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing'
import { BOARD_CY, CAMERA, DIM, RIM_MAJOR } from '../sim/constants'
import { VerletNet } from './net'
import {
  makeBallTextures,
  makeBlobTexture,
  makeGlassRoughness,
  makeStreakTexture,
} from './textures'

const BASE = import.meta.env.BASE_URL
const ART = `${BASE}art/cv3d/`

/** Plate metadata (see scripts/build-cv3d-assets.py). */
const PLATE = { x0: 256, w: 768, y0: -300, h: 1120, horizonY: 459, baselineY: 540, centerX: 640 }

/** Sunset direction (from plate: sun at x≈200,y≈330 → behind-left of hoop). */
const SUN_DIR = new THREE.Vector3(-0.47, 0.16, -0.87).normalize()

export type QualityTier = 'high' | 'low'

async function loadTex(url: string, srgb = true): Promise<THREE.Texture> {
  const t = await new THREE.TextureLoader().loadAsync(url)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

async function supportsAvif(): Promise<boolean> {
  try {
    const img = new Image()
    img.src =
      'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A='
    await img.decode()
    return img.width > 0
  } catch {
    return false
  }
}

export class CourtScene {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  composer: EffectComposer | null = null
  bloom: BloomEffect | null = null
  hoop = new THREE.Group()
  ball!: THREE.Mesh
  ballShadow!: THREE.Mesh
  ballGhost!: THREE.Mesh
  net!: VerletNet
  rimMat!: THREE.MeshPhysicalMaterial
  backdrop!: THREE.Mesh
  backdropMat!: THREE.MeshBasicMaterial
  glassMat!: THREE.MeshPhysicalMaterial
  width = 1
  height = 1
  dprCap = 2
  dprScale = 1
  tier: QualityTier
  /** camera base pose (nudges are applied on top) */
  camBase = new THREE.Vector3(0, CAMERA.y, CAMERA.z)
  pitch = THREE.MathUtils.degToRad(CAMERA.pitchDeg)
  private disposables: { dispose: () => void }[] = []

  constructor(canvas: HTMLCanvasElement, tier: QualityTier) {
    this.tier = tier
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: tier === 'high',
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.setClearColor(0x1c1830, 1)
    this.camera = new THREE.PerspectiveCamera(CAMERA.fovPortrait, 0.46, 0.05, 140)
    this.camera.position.copy(this.camBase)
    this.camera.rotation.set(this.pitch, 0, 0)
    this.scene.add(this.camera)
  }

  async build() {
    const avif = await supportsAvif()
    const [plate, logo, envSrc] = await Promise.all([
      loadTex(`${ART}court-plate.${avif ? 'avif' : 'webp'}`),
      loadTex(`${ART}logo-decal.webp`),
      loadTex(`${ART}env-sunset.webp`),
    ])
    plate.minFilter = THREE.LinearMipmapLinearFilter
    plate.anisotropy = 2
    logo.anisotropy = 8
    logo.minFilter = THREE.LinearMipmapLinearFilter

    // ── Environment from the plate (PMREM) ──
    envSrc.mapping = THREE.EquirectangularReflectionMapping
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const envRT = pmrem.fromEquirectangular(envSrc)
    this.scene.environment = envRT.texture
    this.scene.environmentIntensity = 0.85
    pmrem.dispose()
    this.disposables.push(envRT, envSrc)

    // ── Backdrop plate (camera-locked, aligned to the 3D horizon/baseline) ──
    this.backdropMat = new THREE.MeshBasicMaterial({
      map: plate,
      depthWrite: false,
      depthTest: false,
      color: new THREE.Color(1.12, 1.1, 1.1),
    })
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.backdropMat)
    this.backdrop.renderOrder = -1000
    this.backdrop.frustumCulled = false
    this.camera.add(this.backdrop)

    // ── Lights: warm low sun from the sunset + soft fill ──
    const sun = new THREE.DirectionalLight(0xffa860, 2.4)
    sun.position.copy(SUN_DIR).multiplyScalar(30)
    this.scene.add(sun)
    const fill = new THREE.DirectionalLight(0xffc6b0, 1.15)
    fill.position.set(-2.5, 4.5, 10)
    this.scene.add(fill)
    const hemi = new THREE.HemisphereLight(0xc48ad8, 0x3a2622, 0.55)
    this.scene.add(hemi)

    this.scene.add(this.hoop)
    this.buildBoard(logo)
    this.buildRim()
    this.buildPole()
    this.buildBall()
    this.buildShadows()

    // ── Post: subtle bloom + ACES (merged pass) ──
    if (this.tier === 'high') this.enableComposer()
  }

  enableComposer() {
    if (this.composer) return
    const composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: 0,
    })
    composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new BloomEffect({
      intensity: 0.55,
      luminanceThreshold: 0.82,
      luminanceSmoothing: 0.25,
      mipmapBlur: true,
      radius: 0.62,
      levels: 5,
    })
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })
    composer.addPass(new EffectPass(this.camera, this.bloom, tone))
    this.composer = composer
    this.renderer.toneMapping = THREE.NoToneMapping
    composer.setSize(this.width, this.height)
  }

  disableComposer() {
    if (!this.composer) return
    this.composer.dispose()
    this.composer = null
    this.bloom = null
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
  }

  private buildBoard(logo: THREE.Texture) {
    const g = this.hoop
    const W = DIM.boardW
    const H = DIM.boardH
    const T = 0.014
    // Tempered glass: transmissive with env reflections and a visible green edge
    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xf4fbff,
      metalness: 0,
      roughness: 0.035,
      roughnessMap: makeGlassRoughness(),
      transmission: this.tier === 'high' ? 1 : 0,
      transparent: this.tier !== 'high',
      opacity: this.tier === 'high' ? 1 : 0.22,
      thickness: T,
      ior: 1.52,
      attenuationColor: new THREE.Color(0xd8f0ea),
      attenuationDistance: 0.6,
      specularIntensity: 1,
      clearcoat: 0.5,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.15,
    })
    const edgeMat = new THREE.MeshPhysicalMaterial({
      color: 0x9fd6c6,
      roughness: 0.15,
      metalness: 0,
      transparent: true,
      opacity: 0.9,
      envMapIntensity: 1.4,
    })
    const glass = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), [
      edgeMat,
      edgeMat,
      edgeMat,
      edgeMat,
      this.glassMat,
      this.glassMat,
    ])
    glass.position.set(0, BOARD_CY, -T / 2)
    glass.renderOrder = 2
    g.add(glass)

    // Black aluminium frame (behind the glass edge) + bottom padding
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.45, metalness: 0.6 })
    const fw = 0.035
    const fz = -T - 0.012
    const frame = [
      [W + fw, fw, 0, BOARD_CY + H / 2 + fw / 2 - 0.004],
      [W + fw, fw, 0, BOARD_CY - H / 2 - fw / 2 + 0.004],
      [fw, H + fw, -W / 2 - fw / 2 + 0.004, BOARD_CY],
      [fw, H + fw, W / 2 + fw / 2 - 0.004, BOARD_CY],
    ] as const
    for (const [w, h, x, y] of frame) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), frameMat)
      m.position.set(x, y, fz)
      g.add(m)
    }
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(W + 0.07, 0.075, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.85, metalness: 0 }),
    )
    pad.position.set(0, DIM.boardBottom - 0.03, -0.02)
    g.add(pad)

    // Painted white border + shooter's square on the front face
    const paint = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
      emissive: 0xffffff,
      emissiveIntensity: 0.32,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    })
    const strip = (w: number, h: number, x: number, y: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paint)
      m.position.set(x, y, 0.0012)
      m.renderOrder = 3
      g.add(m)
    }
    const bw = 0.045
    strip(W, bw, 0, BOARD_CY + H / 2 - bw / 2)
    strip(W, bw, 0, BOARD_CY - H / 2 + bw / 2)
    strip(bw, H, -W / 2 + bw / 2, BOARD_CY)
    strip(bw, H, W / 2 - bw / 2, BOARD_CY)
    const sw = 0.05
    const sqB = DIM.rimY
    const sqT = DIM.rimY + DIM.squareH
    strip(DIM.squareW, sw, 0, sqT - sw / 2)
    strip(DIM.squareW, sw, 0, sqB + sw / 2)
    strip(sw, DIM.squareH, -DIM.squareW / 2 + sw / 2, (sqB + sqT) / 2)
    strip(sw, DIM.squareH, DIM.squareW / 2 - sw / 2, (sqB + sqT) / 2)

    // Real wordmark decal, printed white above the square
    const top = DIM.boardBottom + H - bw - 0.03
    const bottom = sqT + 0.035
    const lh = top - bottom
    const img = logo.image as { width: number; height: number }
    const lw = (lh * img.width) / img.height
    const logoMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(lw, lh),
      new THREE.MeshBasicMaterial({
        map: logo,
        transparent: true,
        color: new THREE.Color(1.0, 0.97, 0.94),
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      }),
    )
    logoMesh.position.set(0, (top + bottom) / 2, 0.0016)
    logoMesh.renderOrder = 4
    g.add(logoMesh)

    // Support struts visible through the glass
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.5, metalness: 0.55 })
    const strut = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
      const len = a.distanceTo(b)
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), strutMat)
      m.position.copy(a).add(b).multiplyScalar(0.5)
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
      g.add(m)
    }
    const hub = new THREE.Vector3(0, 3.22, -0.42)
    strut(hub, new THREE.Vector3(-0.66, BOARD_CY + H / 2 - 0.06, -0.05), 0.022)
    strut(hub, new THREE.Vector3(0.66, BOARD_CY + H / 2 - 0.06, -0.05), 0.022)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, Math.abs(DIM.poleZ) - 0.05), strutMat)
    arm.position.set(0, 3.22, (DIM.poleZ - 0.05) / 2)
    g.add(arm)
    strut(new THREE.Vector3(0, 2.55, DIM.poleZ), new THREE.Vector3(0, 3.18, -0.5), 0.03)
  }

  private buildRim() {
    const g = this.hoop
    this.rimMat = new THREE.MeshPhysicalMaterial({
      color: 0xe2501a,
      metalness: 0.45,
      roughness: 0.32,
      clearcoat: 0.8,
      clearcoatRoughness: 0.2,
      emissive: 0xff5a1e,
      emissiveIntensity: 0,
      envMapIntensity: 1.3,
    })
    const ring = new THREE.Mesh(new THREE.TorusGeometry(RIM_MAJOR, DIM.rimTubeR, 14, 72), this.rimMat)
    ring.rotation.x = Math.PI / 2
    ring.position.set(0, DIM.rimY, DIM.rimZ)
    g.add(ring)
    // Lower net-hook ring (thin) + hooks
    const hookMat = this.rimMat
    const hooks = new THREE.InstancedMesh(new THREE.TorusGeometry(0.009, 0.0025, 4, 8), hookMat, 12)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      q.setFromEuler(new THREE.Euler(0, -a, 0))
      m.compose(
        new THREE.Vector3(Math.cos(a) * (RIM_MAJOR - 0.002), DIM.rimY - 0.012, DIM.rimZ + Math.sin(a) * (RIM_MAJOR - 0.002)),
        q,
        new THREE.Vector3(1, 1, 1),
      )
      hooks.setMatrixAt(i, m)
    }
    g.add(hooks)
    // Breakaway bracket: board plate + neck + support fins
    const bracketMat = new THREE.MeshPhysicalMaterial({ color: 0x1c1d22, metalness: 0.6, roughness: 0.4, clearcoat: 0.3 })
    const bplate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.085, 0.012), bracketMat)
    bplate.position.set(0, DIM.rimY - 0.04, 0.006)
    g.add(bplate)
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.16), this.rimMat)
    neck.position.set(0, DIM.rimY - 0.012, 0.085)
    g.add(neck)
    for (const sx of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.05, 0.12), this.rimMat)
      fin.position.set(sx * 0.04, DIM.rimY - 0.035, 0.08)
      fin.rotation.x = -0.45
      g.add(fin)
    }

    // Net
    const netMat = new THREE.MeshStandardMaterial({
      color: 0xf4f1ea,
      roughness: 0.75,
      metalness: 0,
      emissive: 0x2a2420,
      emissiveIntensity: 0.4,
    })
    this.net = new VerletNet(netMat)
    this.scene.add(this.net.mesh)
  }

  private buildPole() {
    const g = this.hoop
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x1a1b1f, roughness: 0.55, metalness: 0.5 })
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.17, 3.3, 0.17), poleMat)
    pole.position.set(0, 1.65, DIM.poleZ)
    g.add(pole)
    // Padded protector (vinyl), rounded via bevel-ish segments
    const padMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.92, metalness: 0 })
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.75, 0.34, 1, 1, 1), padMat)
    pad.position.set(0, 0.875, DIM.poleZ)
    g.add(pad)
    const seam = new THREE.Mesh(
      new THREE.BoxGeometry(0.346, 0.02, 0.346),
      new THREE.MeshStandardMaterial({ color: 0x26272c, roughness: 0.7 }),
    )
    seam.position.set(0, 1.2, DIM.poleZ)
    g.add(seam)
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.05, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.6, metalness: 0.4 }),
    )
    base.position.set(0, 0.025, DIM.poleZ)
    g.add(base)
  }

  private buildBall() {
    const { map, normalMap } = makeBallTextures(1024)
    const mat = new THREE.MeshPhysicalMaterial({
      map,
      normalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughness: 0.62,
      metalness: 0,
      sheen: 0.35,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color(0xffb27a),
      clearcoat: 0.08,
      clearcoatRoughness: 0.5,
      envMapIntensity: 0.9,
    })
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(DIM.ballR, 64, 40), mat)
    this.ball.rotation.set(0.25, 0.6, 0.15)
    this.scene.add(this.ball)
    const gmat = mat.clone()
    gmat.transparent = true
    gmat.depthWrite = false
    this.ballGhost = new THREE.Mesh(this.ball.geometry, gmat)
    this.ballGhost.visible = false
    this.scene.add(this.ballGhost)
  }

  private buildShadows() {
    const blob = makeBlobTexture(128)
    this.ballShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, color: 0x000000, opacity: 0.6 }),
    )
    this.ballShadow.rotation.x = -Math.PI / 2
    this.ballShadow.renderOrder = 1
    this.scene.add(this.ballShadow)

    // Pole base contact + long golden-hour streak toward camera-right
    const baseShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9),
      new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, color: 0x000000, opacity: 0.55 }),
    )
    baseShadow.rotation.x = -Math.PI / 2
    baseShadow.position.set(0, 0.002, DIM.poleZ)
    this.hoop.add(baseShadow)
    const streak = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 9),
      new THREE.MeshBasicMaterial({
        map: makeStreakTexture(),
        transparent: true,
        depthWrite: false,
        color: 0x000000,
        opacity: 0.42,
      }),
    )
    streak.geometry.translate(0, -4.5, 0)
    streak.rotation.x = -Math.PI / 2
    // shadow points away from the sun (toward +x,+z)
    const away = Math.atan2(-SUN_DIR.x, -SUN_DIR.z)
    streak.rotation.z = away
    streak.position.set(0, 0.003, DIM.poleZ)
    this.hoop.add(streak)
  }

  /** Framing + backdrop alignment for the current viewport. */
  resize(w: number, h: number) {
    this.width = w
    this.height = h
    const aspect = w / h
    const a0 = 390 / 844
    const tHalf0 = Math.tan(THREE.MathUtils.degToRad(CAMERA.fovPortrait / 2))
    // Narrower than the reference: keep horizontal FOV so the board fits
    const tHalf = aspect < a0 ? (tHalf0 * a0) / aspect : tHalf0
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(tHalf))
    this.camera.fov = fov
    this.camera.aspect = aspect
    // Keep the rim in the upper third (≈28% from top)
    const rimEl = Math.atan((DIM.rimY - CAMERA.y) / (CAMERA.z - DIM.rimZ))
    this.pitch = rimEl - Math.atan(0.22 * 2 * tHalf)
    this.camera.rotation.set(this.pitch, 0, 0)
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld(true)

    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap) * this.dprScale
    this.renderer.setPixelRatio(Math.max(0.75, dpr))
    this.renderer.setSize(w, h, false)
    this.composer?.setSize(w, h)
    this.alignBackdrop()
  }

  /** Map plate rows: horizon row ↔ camera horizon, baseline row ↔ pole base. */
  alignBackdrop() {
    const cam = this.camera
    const saved = cam.position.clone()
    cam.position.copy(this.camBase)
    cam.updateMatrixWorld(true)
    const hz = new THREE.Vector3(0, CAMERA.y, -1e4).project(cam).y
    const pb = new THREE.Vector3(0, 0, DIM.poleZ).project(cam).y
    cam.position.copy(saved)
    cam.updateMatrixWorld(true)
    const aspect = this.width / this.height
    let sy = (hz - pb) / (PLATE.baselineY - PLATE.horizonY) // NDC-y per plate px
    let sx = sy / aspect // NDC-x per plate px (square pixels)
    // never show past the crop's sides
    const halfW = (PLATE.w / 2) * sx
    if (halfW < 1.01) {
      const k = 1.01 / halfW
      sy *= k
      sx *= k
    }
    const topNdc = hz + (PLATE.horizonY - PLATE.y0) * sy
    const botNdc = hz - (PLATE.y0 + PLATE.h - PLATE.horizonY) * sy
    const cxNdc = (PLATE.x0 + PLATE.w / 2 - PLATE.centerX) * sx
    const L = 100
    const th = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    const toY = L * th
    const toX = L * th * aspect
    this.backdrop.position.set(cxNdc * toX, ((topNdc + botNdc) / 2) * toY, -L)
    this.backdrop.scale.set(PLATE.w * sx * toX, (topNdc - botNdc) * toY, 1)
  }

  render() {
    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.composer?.dispose()
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      const mats = Array.isArray(mat) ? mat : mat ? [mat] : []
      for (const mm of mats) {
        for (const v of Object.values(mm)) if (v instanceof THREE.Texture) v.dispose()
        mm.dispose()
      }
    })
    for (const d of this.disposables) d.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}
