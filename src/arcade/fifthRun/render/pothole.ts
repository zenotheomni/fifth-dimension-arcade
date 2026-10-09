/**
 * Realistic potholes for the gap obstacle: an irregular, jagged opening (same shape function in the road
 * shader — `POT_GLSL` — and in the pit mesh here), dark earth / gravel walls going down 7 m with a faint
 * warm glow from far below, broken asphalt slabs and bent rebar around the rim, gravel debris.
 * Shapes are seeded per obstacle id and cached, so pooled meshes just swap geometry.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const POT_DEPTH = 7
/** lane-wide footprint of a pothole (m) */
export const POT_W = 1.98

/** per-obstacle shape seed (shared with the road shader) */
export const potSeed = (id: number) => ((id * 0.6180339887) % 1) * 100

/** Boundary radius (normalized to the half-extents) at angle th: rounded super-ellipse × jagged noise. */
export function potR(th: number, sd: number) {
  const c = Math.pow(Math.abs(Math.cos(th)), 3.5) + Math.pow(Math.abs(Math.sin(th)), 3.5)
  const rs = Math.pow(Math.max(c, 1e-4), -1 / 3.5)
  const j =
    0.885 +
    0.06 * Math.sin(3 * th + sd * 1.7) +
    0.035 * Math.sin(7 * th + sd * 4.1) +
    0.022 * Math.sin(13 * th + sd * 2.3) +
    0.014 * Math.sin(23 * th + sd * 5.9)
  return rs * Math.min(j, 0.985)
}

export const POT_GLSL = /* glsl */ `
float potR(float th, float sd){
  float c = pow(abs(cos(th)), 3.5) + pow(abs(sin(th)), 3.5);
  float rs = pow(max(c, 1e-4), -1.0 / 3.5);
  float j = 0.885 + 0.06*sin(3.0*th + sd*1.7) + 0.035*sin(7.0*th + sd*4.1) + 0.022*sin(13.0*th + sd*2.3) + 0.014*sin(23.0*th + sd*5.9);
  return rs * min(j, 0.985);
}
`

function mulberry(seed: number) {
  let a = Math.floor(seed * 1000) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pitMaterial = () =>
  new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vP;
      void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vP; uniform float uTime;
      float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
      void main(){
        float dm = max(0.0, -vP.y);
        float a = atan(vP.z, vP.x);
        vec2 q = vec2(a * 2.2, dm * 2.6);
        float n = vn(q * 2.0) * 0.6 + vn(q * 7.0) * 0.4;
        // strata: asphalt cut, gravel base, packed soil, rock
        vec3 asph = vec3(0.055, 0.053, 0.06);
        vec3 grav = vec3(0.085, 0.075, 0.062);
        vec3 soil = vec3(0.05, 0.034, 0.024);
        vec3 col = dm < 0.17 ? asph * (0.8 + 0.5 * n) : mix(grav, soil, smoothstep(0.35, 1.8, dm)) * (0.55 + 0.9 * n);
        col *= mix(1.0, 0.55, step(0.17, dm) * step(dm, 0.2)); // seam under the asphalt
        // street light falls off fast with depth: the pit goes dark…
        col *= exp(-dm * 1.1) + 0.03;
        // …until a faint warm glow from far below
        vec3 warm = vec3(1.0, 0.42, 0.13);
        float glow = smoothstep(2.5, ${POT_DEPTH.toFixed(1)}, dm);
        col += warm * (glow * glow * 0.22 + exp(-(${POT_DEPTH.toFixed(1)} - dm) * 1.4) * 0.18) * (0.75 + 0.5 * n);
        if (dm > ${(POT_DEPTH - 0.02).toFixed(2)}) col = warm * (0.16 + 0.22 * vn(vP.xz * 3.0 + uTime * 0.2));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })

type PotGeo = { pit: THREE.BufferGeometry; debris: THREE.BufferGeometry }

function buildPit(sd: number, hw: number, hl: number): THREE.BufferGeometry {
  const N = 64
  const rings = [
    { y: -0.005, k: 1.03, j: 0 },
    { y: -0.17, k: 1.0, j: 0.015 },
    { y: -0.55, k: 0.97, j: 0.05 },
    { y: -1.4, k: 0.93, j: 0.07 },
    { y: -3.2, k: 0.9, j: 0.06 },
    { y: -POT_DEPTH, k: 0.86, j: 0.05 },
  ]
  const rnd = mulberry(sd + 3.3)
  const pos: number[] = []
  const idx: number[] = []
  for (const r of rings) {
    for (let i = 0; i < N; i++) {
      const th = (i / N) * Math.PI * 2
      const R = potR(th, sd) * (r.k + (rnd() - 0.5) * 2 * r.j)
      pos.push(Math.cos(th) * R * hw, r.y + (r.y < 0 && r.y > -POT_DEPTH ? (rnd() - 0.5) * 0.08 : 0), Math.sin(th) * R * hl)
    }
  }
  for (let ri = 0; ri < rings.length - 1; ri++) {
    for (let i = 0; i < N; i++) {
      const a = ri * N + i
      const b = ri * N + ((i + 1) % N)
      const c = (ri + 1) * N + i
      const d = (ri + 1) * N + ((i + 1) % N)
      idx.push(a, c, b, b, c, d)
    }
  }
  // floor fan
  const base = (rings.length - 1) * N
  const ci = pos.length / 3
  pos.push(0, -POT_DEPTH, 0)
  for (let i = 0; i < N; i++) idx.push(ci, base + ((i + 1) % N), base + i)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  return g
}

const colorize = (g: THREE.BufferGeometry, top: THREE.Color, side: THREE.Color) => {
  const p = g.getAttribute('position')
  const n = g.getAttribute('normal')
  const c = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const up = n ? Math.max(0, n.getY(i)) : 0.5
    const col = side.clone().lerp(top, up)
    c[i * 3] = col.r
    c[i * 3 + 1] = col.g
    c[i * 3 + 2] = col.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  return g
}

function buildDebris(sd: number, hw: number, hl: number): THREE.BufferGeometry {
  const rnd = mulberry(sd + 7.7)
  const parts: THREE.BufferGeometry[] = []
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const v = new THREE.Vector3()
  const s = new THREE.Vector3()
  const edge = (th: number, k: number) => {
    const R = potR(th, sd) * k
    return new THREE.Vector3(Math.cos(th) * R * hw, 0, Math.sin(th) * R * hl)
  }
  // broken asphalt slabs on / hanging over the rim (tilted down into the hole)
  const nSlab = 10 + Math.floor(rnd() * 5)
  for (let i = 0; i < nSlab; i++) {
    const th = rnd() * Math.PI * 2
    const k = 0.97 + rnd() * 0.16
    const p = edge(th, k)
    // irregular slab: a jittered, subdivided box (no faceted gem look)
    const g0 = new THREE.BoxGeometry(1, 1, 1, 2, 1, 2)
    const pa = g0.getAttribute('position')
    for (let vi = 0; vi < pa.count; vi++) {
      pa.setX(vi, pa.getX(vi) * (0.75 + rnd() * 0.5))
      pa.setZ(vi, pa.getZ(vi) * (0.75 + rnd() * 0.5))
      pa.setY(vi, pa.getY(vi) + (pa.getY(vi) > 0 ? (rnd() - 0.5) * 0.35 : 0))
    }
    const g = g0.toNonIndexed()
    g0.dispose()
    const w = 0.09 + rnd() * 0.16
    s.set(w, 0.035 + rnd() * 0.035, w * (0.6 + rnd() * 0.8))
    // tilt toward the hole centre (a slab cracked off the edge)
    const tilt = k < 1.02 ? 0.25 + rnd() * 0.45 : rnd() * 0.2
    e.set(Math.sin(th) * tilt, rnd() * Math.PI, -Math.cos(th) * tilt)
    q.setFromEuler(e)
    v.set(p.x, 0.018 + rnd() * 0.02 - (k < 1.0 ? 0.05 : 0), p.z)
    m.compose(v, q, s)
    g.applyMatrix4(m)
    g.computeVertexNormals()
    const tone = 0.032 + rnd() * 0.025
    parts.push(colorize(g, new THREE.Color(tone, tone * 0.97, tone * 1.02), new THREE.Color(0.07, 0.06, 0.05)))
  }
  // bent rebar sticking out of the broken edge over the hole
  const nBar = 3 + Math.floor(rnd() * 3)
  const rust = new THREE.Color(0.32, 0.13, 0.06)
  for (let i = 0; i < nBar; i++) {
    const th = rnd() * Math.PI * 2
    const p0 = edge(th, 1.06)
    const inward = new THREE.Vector3(-Math.cos(th) * hw, 0, -Math.sin(th) * hl).normalize()
    const len1 = 0.25 + rnd() * 0.35
    const p1 = p0.clone().addScaledVector(inward, len1).setY(-0.02 - rnd() * 0.08)
    const p2 = p1.clone().addScaledVector(inward, 0.12 + rnd() * 0.2).add(new THREE.Vector3((rnd() - 0.5) * 0.2, -0.15 - rnd() * 0.3, (rnd() - 0.5) * 0.2))
    for (const [a, b] of [
      [p0.clone().setY(0.0), p1],
      [p1, p2],
    ] as const) {
      const dir = b.clone().sub(a)
      const L = dir.length()
      const g = new THREE.CylinderGeometry(0.014, 0.014, L, 5, 1, false)
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
      m.compose(a.clone().add(b).multiplyScalar(0.5), q, s.set(1, 1, 1))
      g.applyMatrix4(m)
      parts.push(colorize(g.toNonIndexed(), rust, rust.clone().multiplyScalar(0.7)))
    }
  }
  // loose gravel / small chunks scattered on the road around it
  const nGr = 16
  for (let i = 0; i < nGr; i++) {
    const th = rnd() * Math.PI * 2
    const p = edge(th, 1.05 + rnd() * 0.5)
    const g = new THREE.TetrahedronGeometry(0.025 + rnd() * 0.035, 0).toNonIndexed()
    e.set(rnd() * 3, rnd() * 3, rnd() * 3)
    m.compose(v.set(p.x, 0.015, p.z), q.setFromEuler(e), s.set(1, 0.6, 1))
    g.applyMatrix4(m)
    g.computeVertexNormals()
    const t = 0.05 + rnd() * 0.04
    parts.push(colorize(g, new THREE.Color(t, t * 0.95, t * 0.9), new THREE.Color(t * 0.7, t * 0.65, t * 0.6)))
  }
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))
  parts.forEach((g) => g.dispose())
  return merged ?? new THREE.BufferGeometry()
}

/** Shape cache keyed by obstacle id (pooled meshes swap geometry; nothing rebuilt per frame). */
export class PotholeCache {
  private map = new Map<string, PotGeo>()
  get(id: number, len: number): PotGeo {
    const key = `${id}|${len.toFixed(2)}`
    let g = this.map.get(key)
    if (!g) {
      const sd = potSeed(id)
      g = { pit: buildPit(sd, POT_W / 2, len / 2), debris: buildDebris(sd, POT_W / 2, len / 2) }
      this.map.set(key, g)
      if (this.map.size > 40) {
        const [k0, g0] = this.map.entries().next().value as [string, PotGeo]
        g0.pit.dispose()
        g0.debris.dispose()
        this.map.delete(k0)
      }
    }
    return g
  }
}

export type PotholeParts = ReturnType<typeof buildPothole>

/** One pooled pothole: pit mesh + debris mesh (geometry swapped per obstacle) + faint warm haze. */
export function buildPothole(glowMat: THREE.Material, pitMat: THREE.ShaderMaterial, debrisMat: THREE.Material) {
  const group = new THREE.Group()
  const empty = new THREE.BufferGeometry()
  const pit = new THREE.Mesh(empty, pitMat)
  const debris = new THREE.Mesh(empty, debrisMat)
  pit.frustumCulled = false
  debris.frustumCulled = false
  // faint warm haze rising out of the hole (only noticeable from a distance on the dark road)
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMat)
  group.add(pit, debris, haze)
  return { group, pit, debris, haze, hazeMat: glowMat as THREE.MeshBasicMaterial, id: -1 }
}

export function potholeMaterials() {
  return {
    pit: pitMaterial(),
    debris: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, flatShading: true }),
  }
}
