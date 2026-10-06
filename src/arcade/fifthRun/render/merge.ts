/**
 * Collapse a static prop hierarchy into one mesh per material (draw-call diet for mobile).
 * Material objects are preserved, so per-frame material tweaks (paint colour, light intensity) still work.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const KEEP = new Set(['position', 'normal', 'uv'])

export function mergeStatic(root: THREE.Object3D): THREE.Object3D {
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const rel = new THREE.Matrix4()
  const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; renderOrder: number }>()
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || !m.visible) return
    let g = m.geometry.clone()
    rel.multiplyMatrices(inv, m.matrixWorld)
    g.applyMatrix4(rel)
    if (g.index) g = g.toNonIndexed()
    for (const name of Object.keys(g.attributes)) if (!KEEP.has(name)) g.deleteAttribute(name)
    if (!g.attributes.normal) g.computeVertexNormals()
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    g.morphAttributes = {}
    g.clearGroups()
    const b = buckets.get(m.material) ?? { geos: [], renderOrder: m.renderOrder }
    b.geos.push(g)
    buckets.set(m.material, b)
  })
  for (const c of [...root.children]) root.remove(c)
  for (const [mat, b] of buckets) {
    const merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false)
    if (!merged) continue
    merged.computeBoundingSphere()
    const mesh = new THREE.Mesh(merged, mat)
    mesh.renderOrder = b.renderOrder
    root.add(mesh)
    for (const g of b.geos) if (g !== merged) g.dispose()
  }
  return root
}
