/**
 * Small PMREM reflection environment for the astronaut (visor / metal / suit sheen): night-sky
 * gradient, magenta + teal neon strips at street level, warm overhead key so the visor reads gold.
 * Used only on runner materials (the rest of the scene keeps its own lighting).
 */
import * as THREE from 'three'

export function neonEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const sc = new THREE.Scene()
  const geo = new THREE.SphereGeometry(50, 32, 16)
  const p = geo.attributes.position
  const top = new THREE.Color('#2a3366')
  const hor = new THREE.Color('#8a4a8a')
  const gnd = new THREE.Color('#141019')
  const c = new THREE.Color()
  const col: number[] = []
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 50
    if (y > 0) c.copy(hor).lerp(top, Math.pow(y, 0.6))
    else c.copy(hor).lerp(gnd, Math.pow(-y, 0.4))
    col.push(c.r, c.g, c.b)
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })))
  const strip = (color: THREE.Color, x: number, y: number, z: number, w: number, h: number, ry: number, rx = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }))
    m.position.set(x, y, z)
    m.rotation.set(rx, ry, 0)
    sc.add(m)
  }
  strip(new THREE.Color(3.6, 1.0, 2.8), -30, 5, -20, 30, 3, 0.9)
  strip(new THREE.Color(0.7, 3.2, 3.1), 30, 4, -15, 26, 2.5, -0.9)
  strip(new THREE.Color(4.2, 3.6, 2.8), 0, 42, 0, 46, 46, 0, Math.PI / 2) // warm overhead softbox
  strip(new THREE.Color(1.6, 1.7, 2.2), 0, 10, 42, 50, 10, 0) // cool fill from behind (camera side)
  strip(new THREE.Color(2.4, 1.6, 0.8), 0, 14, -44, 40, 8, 0) // warm city glow ahead
  const pm = new THREE.PMREMGenerator(renderer)
  const rt = pm.fromScene(sc, 0.02)
  pm.dispose()
  sc.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
  })
  return rt.texture
}
