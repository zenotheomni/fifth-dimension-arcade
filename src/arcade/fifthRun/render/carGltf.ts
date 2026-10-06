/**
 * Load the sports-car GLTF (three.js Ferrari sample, Draco) and stamp out CarParts clones.
 * Fitted so rear faces +Z, length ~4.4 m — matches sim hitbox.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { blobTexture } from './textures'
import type { CarParts } from './props'

export type CarTemplate = {
  root: THREE.Object3D
  paintMats: THREE.MeshStandardMaterial[]
  headMats: THREE.MeshStandardMaterial[]
  tailMats: THREE.MeshStandardMaterial[]
}

let _template: CarTemplate | null = null
let _loading: Promise<CarTemplate> | null = null

function isPaintName(n: string) {
  return /body_color|body colour|car_paint|carpaint|paint/.test(n)
}
function isHeadName(mesh: string, mat: string) {
  return /projector|headlight|head_light|lights(?!_red)/.test(mat) || /^(lights|leds)$/.test(mesh)
}
function isTailName(mesh: string, mat: string) {
  return /taillight|tail_light|brake.?light|stop.?light/.test(mat) || /lights_red|brakes$/.test(mesh)
}

function collectMats(root: THREE.Object3D) {
  const paint: THREE.MeshStandardMaterial[] = []
  const head: THREE.MeshStandardMaterial[] = []
  const tail: THREE.MeshStandardMaterial[] = []
  const seen = new Set<THREE.Material>()
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    const meshName = (m.name || '').toLowerCase()
    for (const mat of mats) {
      if (!mat || seen.has(mat)) continue
      seen.add(mat)
      const std = mat as THREE.MeshStandardMaterial
      if (!('color' in std)) continue
      const matName = (mat.name || '').toLowerCase()
      if (isPaintName(matName) || meshName === 'body') paint.push(std)
      else if (isTailName(meshName, matName)) tail.push(std)
      else if (isHeadName(meshName, matName)) head.push(std)
    }
  })
  // Ensure Body_Color is paint even if mesh naming differs
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    for (const mat of mats) {
      const std = mat as THREE.MeshStandardMaterial
      if (!std || !('color' in std)) continue
      if (isPaintName((mat.name || '').toLowerCase()) && !paint.includes(std)) paint.push(std)
    }
  })
  return { paint, head, tail }
}

/** Normalize model so length≈4.4 along Z, wheels on y=0, rear toward +Z. */
function fitToTrack(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  root.position.sub(center)
  root.updateMatrixWorld(true)
  if (size.x > size.z) {
    root.rotation.y = Math.PI / 2
    root.updateMatrixWorld(true)
  }
  const box2 = new THREE.Box3().setFromObject(root)
  const size2 = box2.getSize(new THREE.Vector3())
  const scale = 4.4 / Math.max(0.001, size2.z)
  root.scale.multiplyScalar(scale)
  root.updateMatrixWorld(true)
  const box3 = new THREE.Box3().setFromObject(root)
  const c3 = box3.getCenter(new THREE.Vector3())
  root.position.x -= c3.x
  root.position.z -= c3.z
  root.position.y -= box3.min.y
  // Ferrari faces −Z by default in the sample → rear (+Z) toward camera when parked ahead
  root.rotation.y += Math.PI
}

export async function loadCarTemplate(baseUrl = import.meta.env.BASE_URL): Promise<CarTemplate> {
  if (_template) return _template
  if (_loading) return _loading
  _loading = (async () => {
    const draco = new DRACOLoader()
    draco.setDecoderPath(`${baseUrl}draco/`)
    const loader = new GLTFLoader()
    loader.setDRACOLoader(draco)
    const gltf = await loader.loadAsync(`${baseUrl}art/cars/sports.glb`)
    const root = gltf.scene
    fitToTrack(root)

    // Sanitize materials: kill stray emissives, boost body clearcoat feel
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      const meshName = (m.name || '').toLowerCase()
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial
        if (!std || !('color' in std)) continue
        const matName = (mat.name || '').toLowerCase()
        const isLight = isHeadName(meshName, matName) || isTailName(meshName, matName)
        if (!isLight) {
          std.emissive = new THREE.Color(0x000000)
          std.emissiveIntensity = 0
        }
        if (isPaintName(matName) || meshName === 'body') {
          std.metalness = 0.55
          std.roughness = 0.22
          if ('envMapIntensity' in std) std.envMapIntensity = 1.7
          if ('clearcoat' in std) {
            ;(std as THREE.MeshPhysicalMaterial).clearcoat = 1
            ;(std as THREE.MeshPhysicalMaterial).clearcoatRoughness = 0.12
          }
        } else if (/chrome|metal/.test(matName)) {
          std.metalness = 1
          std.roughness = 0.15
          if ('envMapIntensity' in std) std.envMapIntensity = 1.8
        } else if (/glass|projector|taillight/.test(matName)) {
          std.metalness = 0.1
          std.roughness = 0.05
          if ('envMapIntensity' in std) std.envMapIntensity = 2.2
        } else if (/tire/.test(matName)) {
          std.metalness = 0.05
          std.roughness = 0.92
        }
        std.needsUpdate = true
      }
    })

    const mats = collectMats(root)
    // Seed light materials with sensible emissive colors
    for (const h of mats.head) {
      h.emissive = new THREE.Color('#fff2d0')
      h.emissiveIntensity = 0
      h.color.set('#fff8e8')
    }
    for (const t of mats.tail) {
      t.emissive = new THREE.Color('#ff1a2a')
      t.emissiveIntensity = 2.5
      t.color.set('#ff2040')
    }
    _template = { root, paintMats: mats.paint, headMats: mats.head, tailMats: mats.tail }
    draco.dispose()
    return _template
  })()
  try {
    return await _loading
  } catch (e) {
    _loading = null
    throw e
  }
}

export function instantiateGltfCar(template: CarTemplate): CarParts {
  const group = new THREE.Group()
  const model = template.root.clone(true)
  group.add(model)

  const paintClones: THREE.MeshStandardMaterial[] = []
  const headClones: THREE.MeshStandardMaterial[] = []
  const tailClones: THREE.MeshStandardMaterial[] = []
  const map = new Map<THREE.Material, THREE.Material>()

  model.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const srcMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const out = srcMats.map((mat) => {
      if (!mat) return mat
      let cloned = map.get(mat)
      if (!cloned) {
        cloned = mat.clone()
        map.set(mat, cloned)
        if (template.paintMats.includes(mat as THREE.MeshStandardMaterial)) paintClones.push(cloned as THREE.MeshStandardMaterial)
        if (template.headMats.includes(mat as THREE.MeshStandardMaterial)) headClones.push(cloned as THREE.MeshStandardMaterial)
        if (template.tailMats.includes(mat as THREE.MeshStandardMaterial)) tailClones.push(cloned as THREE.MeshStandardMaterial)
      }
      return cloned
    })
    mesh.material = out.length === 1 ? out[0] : out
  })

  const paint =
    paintClones[0] ||
    new THREE.MeshPhysicalMaterial({
      color: '#e11d48',
      metalness: 0.55,
      roughness: 0.22,
      clearcoat: 1,
      envMapIntensity: 1.7,
    })
  const head =
    headClones[0] ||
    new THREE.MeshStandardMaterial({ color: '#fff8e8', emissive: new THREE.Color('#fff2d0'), emissiveIntensity: 0 })
  const tail =
    tailClones[0] ||
    new THREE.MeshStandardMaterial({ color: '#ff2040', emissive: new THREE.Color('#ff1a2a'), emissiveIntensity: 3 })

  const shadowMat = new THREE.MeshBasicMaterial({
    map: blobTexture(),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  })
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.5), shadowMat)
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.01
  shadow.renderOrder = -1
  group.add(shadow)

  ;(paint as THREE.MeshStandardMaterial & { __all?: THREE.MeshStandardMaterial[] }).__all = paintClones
  ;(head as THREE.MeshStandardMaterial & { __all?: THREE.MeshStandardMaterial[] }).__all = headClones
  ;(tail as THREE.MeshStandardMaterial & { __all?: THREE.MeshStandardMaterial[] }).__all = tailClones

  return { group, paint, head, tail, shadow }
}

export function recolorPaint(paint: THREE.MeshStandardMaterial, hex: string) {
  const all = (paint as THREE.MeshStandardMaterial & { __all?: THREE.MeshStandardMaterial[] }).__all
  if (all?.length) for (const m of all) m.color.set(hex)
  else paint.color.set(hex)
}

export function setLightIntensity(mat: THREE.MeshStandardMaterial, intensity: number, emissiveHex?: string) {
  const all = (mat as THREE.MeshStandardMaterial & { __all?: THREE.MeshStandardMaterial[] }).__all
  const apply = (m: THREE.MeshStandardMaterial) => {
    m.emissiveIntensity = intensity
    if (emissiveHex) m.emissive.set(emissiveHex)
  }
  if (all?.length) for (const m of all) apply(m)
  else apply(mat)
}
