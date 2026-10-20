/**
 * Fifth Glide — 1959 Cadillac wreck (procedural): long low body, wraparound glass, chrome, the
 * famous twin-bullet tail fins. Faded flamingo paint with rust bloom, one flat tyre, a tail light
 * still glowing. ~5.6 m × 2.0 m footprint (OB.car), fins toward +Z (the runner).
 */
import * as THREE from 'three'

const W = 1.96

function extrude(pts: [number, number][], depth: number, bevel = 0.06, curveSegs = 6) {
  const sh = new THREE.Shape()
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)))
  sh.closePath()
  const g = new THREE.ExtrudeGeometry(sh, { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: curveSegs })
  g.translate(0, 0, -(depth - bevel * 2) / 2)
  return g
}

/** profile with smooth curves: list of points, densified by Catmull-Rom */
function smooth(pts: [number, number][], n = 6): [number, number][] {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal', 0.3)
  return c.getPoints(pts.length * n).map((p) => [p.x, p.y] as [number, number])
}

let paintMat: THREE.MeshStandardMaterial | null = null
function wreckPaint() {
  if (paintMat) return paintMat
  const m = new THREE.MeshStandardMaterial({ color: '#d77a92', metalness: 0.35, roughness: 0.42 })
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;')
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vOP;
        float rh(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float rn(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(rh(i), rh(i+vec3(1,0,0)), f.x), mix(rh(i+vec3(0,1,0)), rh(i+vec3(1,1,0)), f.x), f.y),
                     mix(mix(rh(i+vec3(0,0,1)), rh(i+vec3(1,0,1)), f.x), mix(rh(i+vec3(0,1,1)), rh(i+vec3(1,1,1)), f.x), f.y), f.z); }
        float rf(vec3 p){ return rn(p) * 0.5 + rn(p * 2.1) * 0.3 + rn(p * 4.7) * 0.2; }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float r = rf(vOP * 2.6);
        float rust = smoothstep(0.52, 0.66, r + (0.45 - vOP.y) * 0.35);
        float flake = smoothstep(0.62, 0.7, rn(vOP * 14.0)) * (1.0 - rust);
        vec3 rc = mix(vec3(0.24, 0.1, 0.05), vec3(0.45, 0.2, 0.08), rn(vOP * 9.0));
        diffuseColor.rgb = mix(diffuseColor.rgb * (0.85 + 0.25 * rn(vOP * 3.0)), rc, rust);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.72, 0.7), flake * 0.5);`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.92, rust);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.05, rust);')
  }
  return (paintMat = m)
}

export function buildCadillac(glow: THREE.Texture) {
  const group = new THREE.Group()
  const body = new THREE.Group()
  const paint = wreckPaint()
  const chrome = new THREE.MeshStandardMaterial({ color: '#d8dce4', metalness: 1, roughness: 0.18 })
  const darkChrome = new THREE.MeshStandardMaterial({ color: '#6b6f78', metalness: 0.9, roughness: 0.45 })
  const glass = new THREE.MeshStandardMaterial({ color: '#141a24', metalness: 0.6, roughness: 0.08, transparent: true, opacity: 0.86 })
  const tire = new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.92 })
  const interior = new THREE.MeshStandardMaterial({ color: '#2a1418', roughness: 0.8 })
  // length along +x (front 0 → rear 5.65), height y
  const lower = smooth([
    [0.02, 0.32],
    [0.0, 0.55],
    [0.08, 0.78],
    [0.6, 0.84],
    [1.7, 0.86],
    [2.4, 0.88],
    [3.9, 0.88],
    [5.1, 0.86],
    [5.62, 0.8],
    [5.66, 0.5],
    [5.55, 0.32],
    [4.82, 0.3],
    [4.38, 0.62],
    [3.92, 0.3],
    [1.5, 0.3],
    [1.06, 0.62],
    [0.6, 0.3],
  ])
  const shell = new THREE.Mesh(extrude(lower, W, 0.1, 4), paint)
  body.add(shell)
  // cabin: glass greenhouse + painted roof
  const cabin = new THREE.Mesh(
    extrude(
      [
        [1.95, 0.86],
        [2.5, 1.32],
        [3.5, 1.33],
        [3.95, 0.88],
      ],
      W - 0.26,
      0.04,
    ),
    glass,
  )
  body.add(cabin)
  const roof = new THREE.Mesh(
    extrude(
      [
        [2.42, 1.3],
        [2.5, 1.38],
        [3.52, 1.39],
        [3.6, 1.31],
      ],
      W - 0.24,
      0.04,
    ),
    paint,
  )
  body.add(roof)
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, W - 0.5), interior)
  seat.position.set(3.0, 0.98, 0)
  body.add(seat)
  // tail fins with twin bullet lights
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(
      extrude(
        smooth(
          [
            [3.95, 0.86],
            [4.9, 0.95],
            [5.5, 1.16],
            [5.66, 1.12],
            [5.62, 0.86],
          ],
          4,
        ),
        0.14,
        0.03,
      ),
      paint,
    )
    fin.position.z = side * (W / 2 - 0.08)
    body.add(fin)
    for (const dy of [0, 0.075]) {
      const bullet = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.035, 0.11, 4, 10),
        new THREE.MeshStandardMaterial({ color: '#400', emissive: new THREE.Color('#ff2020'), emissiveIntensity: side > 0 && dy === 0 ? 3.2 : 0.4, roughness: 0.3 }),
      )
      bullet.rotation.z = Math.PI / 2
      bullet.position.set(5.6, 1.02 + dy, side * (W / 2 - 0.08))
      body.add(bullet)
    }
  }
  // chrome bumpers, grille, side spear, quad headlights
  const bumper = (x: number) => {
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, W - 0.25, 4, 12), chrome)
    b.rotation.x = Math.PI / 2
    b.position.set(x, 0.42, 0)
    body.add(b)
  }
  bumper(-0.02)
  bumper(5.68)
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, W - 0.4), darkChrome)
  grille.position.set(0.0, 0.62, 0)
  body.add(grille)
  for (const side of [-1, 1]) {
    for (const dz of [0.2, 0.42]) {
      const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 16), new THREE.MeshStandardMaterial({ color: '#cfd6e0', metalness: 0.6, roughness: 0.2 }))
      hl.rotation.z = Math.PI / 2
      hl.position.set(0.02, 0.72, side * (W / 2 - dz))
      body.add(hl)
    }
    const spear = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.03, 0.02), chrome)
    spear.position.set(2.9, 0.55, side * (W / 2 + 0.005))
    body.add(spear)
  }
  // wheels (one flat, one missing its hubcap)
  const wheel = (x: number, side: number, flat: boolean) => {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.12, 10, 24), tire)
    t.position.set(x, flat ? 0.33 : 0.4, side * (W / 2 - 0.16))
    if (flat) t.scale.set(1, 0.82, 1)
    body.add(t)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20), x > 2 && side > 0 ? darkChrome : chrome)
    hub.rotation.x = Math.PI / 2
    hub.position.set(x, t.position.y, side * (W / 2 - 0.1))
    body.add(hub)
  }
  wheel(1.06, -1, false)
  wheel(1.06, 1, true)
  wheel(4.38, -1, false)
  wheel(4.38, 1, false)
  // fins toward +Z, centred on its length
  body.rotation.y = -Math.PI / 2
  body.position.z = -2.83
  group.add(body)
  // wreck pose: settled on the flat, slightly askew
  body.rotation.x = 0.03
  // soft contact shadow + the one glowing tail light's bloom halo
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 6.2),
    new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.5, depthWrite: false }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.01
  group.add(shadow)
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: glow, color: '#ff3030', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }))
  halo.position.set(-(W / 2 - 0.08), 1.04, 2.84)
  group.add(halo)
  return { group }
}
