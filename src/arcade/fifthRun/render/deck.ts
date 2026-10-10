/**
 * Fifth Glide — the floating sky path.
 *
 * The deck is built in chunks (one straight piece of a segment) as a slab per lane, so gaps and missing
 * lanes are real holes over the void. Every exposed top edge gets a neon strip: brand teal / coral on
 * the outer rails, hot amber at hole edges so a gap reads from far off. The top is a dark polished
 * tile floor with inlaid brand-colour chevrons in the middle lane (corner squares carry big turn
 * chevrons); sides are dark metal with a seam, the underside is near-black with violet light seams.
 *
 * Geometry is in segment-local space: +X = right of the heading, −Z = forward, s = chunk start at z 0.
 */
import * as THREE from 'three'
import { LANE_W } from '../sim/constants'

export const DECK_T = 0.55
export const DECK_HALF = 3.2

type Hole = { lane: number; a: number; b: number }

/** kinds packed in aP.z */
const K_TOP = 0
const K_SIDE = 1
const K_BOTTOM = 2
const K_CORNER_L = 3
const K_CORNER_R = 4
const K_CORNER_T = 5

class Builder {
  pos: number[] = []
  nor: number[] = []
  ap: number[] = []
  // emissive strips
  epos: number[] = []
  ecol: number[] = []
  /** quad from 4 corners (counter-clockwise seen from the normal side) */
  quad(p: number[][], n: number[], aps: number[][]) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.pos.push(...p[i])
      this.nor.push(...n)
      this.ap.push(...aps[i])
    }
  }
  strip(p: number[][], c: THREE.Color) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.epos.push(...p[i])
      this.ecol.push(c.r, c.g, c.b)
    }
  }
  /** horizontal glow strip along a top edge from (x,za) to (x,zb), offset inward by `inward` */
  edgeX(x: number, za: number, zb: number, inward: number, c: THREE.Color) {
    const w = 0.07 * inward
    const y = 0.012
    this.strip(
      [
        [x, y, za],
        [x + w, y, za],
        [x + w, y, zb],
        [x, y, zb],
      ],
      c,
    )
    // and a band down the side face
    const o = -0.004 * inward
    this.strip(
      [
        [x + o, -0.02, za],
        [x + o, -0.02, zb],
        [x + o, -0.1, zb],
        [x + o, -0.1, za],
      ],
      c,
    )
  }
  edgeZ(z: number, xa: number, xb: number, inward: number, c: THREE.Color) {
    const w = 0.07 * inward
    const y = 0.012
    this.strip(
      [
        [xa, y, z],
        [xb, y, z],
        [xb, y, z + w],
        [xa, y, z + w],
      ],
      c,
    )
    const o = -0.004 * inward
    this.strip(
      [
        [xa, -0.02, z + o],
        [xa, -0.1, z + o],
        [xb, -0.1, z + o],
        [xb, -0.02, z + o],
      ],
      c,
    )
  }
  /** slab [x0,x1] × path [s0,s1] (z = −(s − sBase)) */
  slab(x0: number, x1: number, s0: number, s1: number, sBase: number, kindTop: number, faces: { l: boolean; r: boolean; n: boolean; f: boolean }) {
    const za = -(s0 - sBase)
    const zb = -(s1 - sBase)
    const T = DECK_T
    const ap = (x: number, s: number, k: number) => [x, s, k]
    // top (normal +y): points ordered so the face is front-facing from above
    this.quad(
      [
        [x0, 0, za],
        [x1, 0, za],
        [x1, 0, zb],
        [x0, 0, zb],
      ],
      [0, 1, 0],
      [ap(x0, s0, kindTop), ap(x1, s0, kindTop), ap(x1, s1, kindTop), ap(x0, s1, kindTop)],
    )
    // bottom
    this.quad(
      [
        [x0, -T, zb],
        [x1, -T, zb],
        [x1, -T, za],
        [x0, -T, za],
      ],
      [0, -1, 0],
      [ap(x0, s1, K_BOTTOM), ap(x1, s1, K_BOTTOM), ap(x1, s0, K_BOTTOM), ap(x0, s0, K_BOTTOM)],
    )
    if (faces.l)
      this.quad(
        [
          [x0, 0, zb],
          [x0, -T, zb],
          [x0, -T, za],
          [x0, 0, za],
        ],
        [-1, 0, 0],
        [ap(0, s1, K_SIDE), ap(T, s1, K_SIDE), ap(T, s0, K_SIDE), ap(0, s0, K_SIDE)],
      )
    if (faces.r)
      this.quad(
        [
          [x1, 0, za],
          [x1, -T, za],
          [x1, -T, zb],
          [x1, 0, zb],
        ],
        [1, 0, 0],
        [ap(0, s0, K_SIDE), ap(T, s0, K_SIDE), ap(T, s1, K_SIDE), ap(0, s1, K_SIDE)],
      )
    // near end (toward the runner, +z side at s0) and far end
    if (faces.n)
      this.quad(
        [
          [x0, 0, za],
          [x0, -T, za],
          [x1, -T, za],
          [x1, 0, za],
        ],
        [0, 0, 1],
        [ap(0, x0, K_SIDE), ap(T, x0, K_SIDE), ap(T, x1, K_SIDE), ap(0, x1, K_SIDE)],
      )
    if (faces.f)
      this.quad(
        [
          [x1, 0, zb],
          [x1, -T, zb],
          [x0, -T, zb],
          [x0, 0, zb],
        ],
        [0, 0, -1],
        [ap(0, x1, K_SIDE), ap(T, x1, K_SIDE), ap(T, x0, K_SIDE), ap(0, x0, K_SIDE)],
      )
  }
  geometry(): { deck: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
    const deck = new THREE.BufferGeometry()
    deck.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    deck.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    deck.setAttribute('aP', new THREE.Float32BufferAttribute(this.ap, 3))
    deck.computeBoundingSphere()
    const glow = new THREE.BufferGeometry()
    glow.setAttribute('position', new THREE.Float32BufferAttribute(this.epos, 3))
    glow.setAttribute('color', new THREE.Float32BufferAttribute(this.ecol, 3))
    glow.computeBoundingSphere()
    return { deck, glow }
  }
}

const TEAL = new THREE.Color('#00e8d8').multiplyScalar(2.2)
const CORAL = new THREE.Color('#ff4d5e').multiplyScalar(2.2)
const AMBER = new THREE.Color('#ff9a2a').multiplyScalar(2.6)
const VIOLET = new THREE.Color('#9a5cff').multiplyScalar(1.8)

/** subtract intervals `cut` from [a,b] */
function minus(a: number, b: number, cut: [number, number][]): [number, number][] {
  let out: [number, number][] = [[a, b]]
  for (const [c0, c1] of cut) {
    const next: [number, number][] = []
    for (const [x, y] of out) {
      if (c1 <= x || c0 >= y) next.push([x, y])
      else {
        if (c0 > x) next.push([x, c0])
        if (c1 < y) next.push([c1, y])
      }
    }
    out = next
  }
  return out.filter(([x, y]) => y - x > 0.02)
}

const laneSpan = (l: number): [number, number] => {
  const c = (l - 1) * LANE_W
  return [l === 0 ? -DECK_HALF : c - LANE_W / 2, l === 2 ? DECK_HALF : c + LANE_W / 2]
}

/**
 * One straight deck chunk covering path [s0, s1] (z 0 at s0). `openNear` / `openFar`: the chunk end
 * touches the corner square / segment end (draw an end face and edge there).
 */
export function buildDeckChunk(s0: number, s1: number, holes: Hole[], openNear: boolean, openFar: boolean) {
  const B = new Builder()
  const solid: [number, number][][] = []
  for (let l = 0; l < 3; l++) {
    const cut = holes.filter((h) => h.lane === l).map((h) => [h.a, h.b] as [number, number])
    solid.push(minus(s0, s1, cut))
  }
  const covered = (l: number, a: number, b: number) => {
    if (l < 0 || l > 2) return [] as [number, number][]
    return solid[l].map(([x, y]) => [Math.max(a, x), Math.min(b, y)] as [number, number]).filter(([x, y]) => y - x > 0.01)
  }
  for (let l = 0; l < 3; l++) {
    const [x0, x1] = laneSpan(l)
    for (const [a, b] of solid[l]) {
      const nearHole = a > s0 + 0.01
      const farHole = b < s1 - 0.01
      B.slab(x0, x1, a, b, s0, K_TOP, { l: false, r: false, n: nearHole || (openNear && a <= s0 + 0.01), f: farHole || (openFar && b >= s1 - 0.01) })
      // side faces + edges where the neighbour lane is missing (or the path edge)
      for (const side of [-1, 1]) {
        const x = side < 0 ? x0 : x1
        const nb = covered(l + side, a, b)
        const bare = minus(a, b, nb)
        const outer = (side < 0 && l === 0) || (side > 0 && l === 2)
        for (const [p, q] of bare) {
          const T = DECK_T
          const za = -(p - s0)
          const zb = -(q - s0)
          if (side < 0)
            B.quad(
              [
                [x, 0, zb],
                [x, -T, zb],
                [x, -T, za],
                [x, 0, za],
              ],
              [-1, 0, 0],
              [
                [0, q, K_SIDE],
                [T, q, K_SIDE],
                [T, p, K_SIDE],
                [0, p, K_SIDE],
              ],
            )
          else
            B.quad(
              [
                [x, 0, za],
                [x, -T, za],
                [x, -T, zb],
                [x, 0, zb],
              ],
              [1, 0, 0],
              [
                [0, p, K_SIDE],
                [T, p, K_SIDE],
                [T, q, K_SIDE],
                [0, q, K_SIDE],
              ],
            )
          B.edgeX(x, za, zb, -side, outer ? (side < 0 ? TEAL : CORAL) : AMBER)
        }
      }
      if (nearHole) B.edgeZ(-(a - s0), x0, x1, -1, AMBER)
      if (farHole) B.edgeZ(-(b - s0), x0, x1, 1, AMBER)
    }
  }
  // violet light seams on the underside (every 6 m)
  for (let s = Math.ceil(s0 / 6) * 6; s < s1; s += 6) {
    const z = -(s - s0)
    B.strip(
      [
        [-DECK_HALF + 0.3, -DECK_T - 0.005, z - 0.06],
        [DECK_HALF - 0.3, -DECK_T - 0.005, z - 0.06],
        [DECK_HALF - 0.3, -DECK_T - 0.005, z + 0.06],
        [-DECK_HALF + 0.3, -DECK_T - 0.005, z + 0.06],
      ].reverse(),
      VIOLET,
    )
  }
  return B.geometry()
}

/**
 * Corner square centred on the corner (local frame of the incoming segment), s = path distance at
 * the centre. `open` sides connect to the path: back (incoming) always, plus left / right / ahead.
 */
export function buildCornerSquare(sC: number, kind: 'L' | 'R' | 'T', open: { left: boolean; right: boolean; ahead: boolean }) {
  const B = new Builder()
  const H = DECK_HALF
  const k = kind === 'L' ? K_CORNER_L : kind === 'R' ? K_CORNER_R : K_CORNER_T
  void sC
  B.slab(-H, H, -H, H, 0, k, { l: !open.left, r: !open.right, n: false, f: !open.ahead })
  if (!open.left) B.edgeX(-H, H, -H, 1, TEAL)
  if (!open.right) B.edgeX(H, H, -H, -1, CORAL)
  if (!open.ahead) B.edgeZ(-H, -H, H, 1, kind === 'R' ? CORAL : TEAL)
  return B.geometry()
}

/** Deck material: dark polished tiles, brand chevrons, metal sides, underside. */
export function deckMaterial(env: THREE.Texture | null) {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.2, envMap: env, envMapIntensity: 1.25, side: THREE.DoubleSide })
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 }
    mat.userData.shader = sh
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aP;\nvarying vec3 vP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = aP;')
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec3 vP;
        uniform float uTime;
        float dh(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
        float dn(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f);
          return mix(mix(dh(i),dh(i+vec2(1,0)),u.x),mix(dh(i+vec2(0,1)),dh(i+vec2(1,1)),u.x),u.y); }
        // filtered line: 1 on the line, AA by derivatives
        float aaLine(float d, float w){ float fw = max(fwidth(d), 1e-4); return 1.0 - smoothstep(w - fw, w + fw, abs(d)); }
        vec3 brand(float i){
          i = mod(i, 4.0);
          return i < 1.0 ? vec3(0.0,0.9,0.85) : i < 2.0 ? vec3(1.0,0.32,0.37) : i < 3.0 ? vec3(0.55,0.3,1.0) : vec3(0.86,0.16,0.24);
        }
        // chevron (V pointing toward -dir) distance in a cell; q.x lateral, q.y along
        float chevron(vec2 q, float w){ return aaLine(q.y + abs(q.x) * 0.9, w); }
        `,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float kind = floor(vP.z + 0.5);
        vec3 emis = vec3(0.0);
        float rough = 0.34;
        float metal = 0.2;
        if (kind == 0.0 || kind >= 3.0) {
          // ── top: polished dark stone tiles 1.07 m (3 per lane) with grout ──
          vec2 p = vec2(vP.x, vP.y);
          vec2 tile = p / vec2(0.6667, 1.0);
          vec2 ti = floor(tile);
          vec2 tf = fract(tile) - 0.5;
          float th = dh(ti + 7.0);
          float grout = max(aaLine(tf.x - 0.5, 0.012) , aaLine(tf.y - 0.5, 0.01));
          grout = max(grout, max(aaLine(tf.x + 0.5, 0.012), aaLine(tf.y + 0.5, 0.01)));
          float veins = dn(p * vec2(2.3, 1.1) + th * 9.0) * dn(p * 7.0);
          vec3 stone = mix(vec3(0.03, 0.028, 0.042), vec3(0.075, 0.065, 0.095), th * 0.6 + veins * 0.5);
          diffuseColor.rgb = mix(stone, vec3(0.02, 0.018, 0.03), grout);
          rough = mix(0.1 + th * 0.12 + veins * 0.1, 0.8, grout);
          metal = 0.15;
          float ax = abs(vP.x);
          // brass curb along the outer edge
          float curb = smoothstep(2.93, 2.96, ax);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.45, 0.2), curb);
          rough = mix(rough, 0.3, curb); metal = mix(metal, 0.95, curb);
          // lane seams: thin brass inlays at x = ±1
          float seam = aaLine(ax - 1.0, 0.03);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.24, 0.12), seam * 0.6);
          metal = mix(metal, 0.9, seam);
          if (kind == 0.0) {
            // inlaid chevrons every 6 m down the middle lane, cycling the brand colours
            float cell = floor(vP.y / 6.0);
            float yy = mod(vP.y, 6.0) - 3.0;
            float inLane = step(ax, 0.72);
            float ch = chevron(vec2(vP.x, yy * 1.0), 0.09) * inLane * step(abs(yy), 1.0);
            vec3 bc = brand(cell);
            diffuseColor.rgb = mix(diffuseColor.rgb, bc * 0.35, ch);
            emis += bc * ch * 0.55;
          } else {
            // corner square: big arrows toward the turn (both ways at a T)
            vec2 q = vec2(vP.x, vP.y);
            float lr = kind == 3.0 ? -1.0 : kind == 4.0 ? 1.0 : 0.0;
            float a = 0.0;
            for (int i = -1; i <= 1; i++) {
              float o = float(i) * 1.5;
              if (lr != 0.0) a = max(a, aaLine(-lr * (q.x - o) + abs(q.y) * 0.9 - 0.6, 0.13) * step(abs(q.y), 1.3));
              else a = max(a, max(aaLine((q.x - 1.6 - o * 0.5) + abs(q.y) * 0.9 - 0.4, 0.12), aaLine(-(q.x + 1.6 + o * 0.5) + abs(q.y) * 0.9 - 0.4, 0.12)) * step(abs(q.y), 1.1));
            }
            float pulse = 0.65 + 0.35 * sin(uTime * 7.0);
            vec3 ac = lr < 0.0 ? vec3(0.0, 0.95, 0.88) : lr > 0.0 ? vec3(1.0, 0.36, 0.4) : vec3(1.0, 0.78, 0.25);
            diffuseColor.rgb = mix(diffuseColor.rgb, ac * 0.4, a);
            emis += ac * a * 1.6 * pulse;
          }
        } else if (kind == 1.0) {
          // side / end faces: dark brushed metal with a seam
          float seam = aaLine(vP.x - 0.16, 0.012);
          diffuseColor.rgb = mix(vec3(0.07, 0.065, 0.09), vec3(0.02), seam);
          rough = 0.38; metal = 0.85;
        } else {
          // underside: near black, faint panel lines
          float pl = aaLine(fract(vP.y / 3.0) - 0.5, 0.01);
          diffuseColor.rgb = vec3(0.025, 0.022, 0.035) + pl * 0.02;
          rough = 0.7; metal = 0.6;
        }
        `,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = rough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = metal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += emis;')
  }
  return mat
}

export function glowStripMaterial() {
  return new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true, side: THREE.DoubleSide, fog: false })
}
