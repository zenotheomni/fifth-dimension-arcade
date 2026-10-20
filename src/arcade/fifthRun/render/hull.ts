/**
 * Procedural PBR hull textures (canvas, generated once, mipmapped): brushed / polished metal albedo
 * with panel seams, rivet rows and soot, plus a matching bump + roughness map. Laid out for lathe
 * UVs (u around the hull, v along the profile).
 */
import * as THREE from 'three'

type Opt = { base: string; brush: number; panelsU: number; panelsV: number; rivets: boolean; soot: number; seed: number; size?: number }

const cache = new Map<string, { map: THREE.CanvasTexture; bump: THREE.CanvasTexture; rough: THREE.CanvasTexture }>()

function rng(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export function hullTextures(key: string, o: Opt) {
  const hit = cache.get(key)
  if (hit) return hit
  const S = o.size ?? 1024
  const R = rng(o.seed)
  const mk = () => {
    const c = document.createElement('canvas')
    c.width = S
    c.height = S
    return [c, c.getContext('2d')!] as const
  }
  const [cA, a] = mk()
  const [cB, b] = mk()
  const [cR, r] = mk()
  // albedo: base + brushed streaks along u
  a.fillStyle = o.base
  a.fillRect(0, 0, S, S)
  b.fillStyle = '#808080'
  b.fillRect(0, 0, S, S)
  r.fillStyle = '#5a5a5a'
  r.fillRect(0, 0, S, S)
  for (let i = 0; i < 2600 * o.brush; i++) {
    const y = R() * S
    const l = 40 + R() * 260
    const x = R() * S
    const v = R() < 0.5 ? 255 : 0
    a.strokeStyle = `rgba(${v},${v},${v},${0.03 + R() * 0.05})`
    a.lineWidth = 0.6 + R() * 1.2
    a.beginPath()
    a.moveTo(x, y)
    a.lineTo(x + l, y + (R() - 0.5) * 2)
    a.stroke()
    r.strokeStyle = `rgba(${v},${v},${v},0.07)`
    r.beginPath()
    r.moveTo(x, y)
    r.lineTo(x + l, y)
    r.stroke()
  }
  // panels: slightly different tone per panel, recessed seams, rivets along seams
  const pw = S / o.panelsU
  const ph = S / o.panelsV
  for (let i = 0; i < o.panelsU; i++)
    for (let j = 0; j < o.panelsV; j++) {
      const off = (j % 2) * pw * 0.5
      const x = i * pw + off
      const y = j * ph
      const t = (R() - 0.5) * 26
      a.fillStyle = t > 0 ? `rgba(255,255,255,${t / 255})` : `rgba(0,0,0,${-t / 255})`
      a.fillRect(x, y, pw, ph)
      r.fillStyle = `rgba(${R() < 0.5 ? 255 : 0},0,0,0.06)`
      r.fillRect(x, y, pw, ph)
      for (const [ctx, col, w] of [[a, 'rgba(10,10,14,0.85)', 3], [b, '#202020', 4]] as const) {
        ctx.strokeStyle = col
        ctx.lineWidth = w
        ctx.strokeRect(x + 1, y + 1, pw - 2, ph - 2)
      }
      if (o.rivets) {
        const n = Math.max(3, Math.round(pw / 22))
        for (let k = 0; k < n; k++)
          for (const yy of [y + 7, y + ph - 7]) {
            const xx = x + ((k + 0.5) / n) * pw
            a.fillStyle = 'rgba(255,255,255,0.35)'
            a.beginPath()
            a.arc(xx, yy, 2.2, 0, Math.PI * 2)
            a.fill()
            b.fillStyle = '#d8d8d8'
            b.beginPath()
            b.arc(xx, yy, 2.6, 0, Math.PI * 2)
            b.fill()
          }
      }
    }
  // vents / hatch details
  for (let i = 0; i < 10; i++) {
    const x = R() * S
    const y = R() * S
    const w = 30 + R() * 60
    for (let k = 0; k < 5; k++) {
      a.fillStyle = 'rgba(0,0,0,0.6)'
      a.fillRect(x, y + k * 6, w, 3)
      b.fillStyle = '#303030'
      b.fillRect(x, y + k * 6, w, 3)
    }
  }
  // soot / scorch (fades along v from 0)
  if (o.soot > 0) {
    for (let i = 0; i < 900 * o.soot; i++) {
      const y = Math.pow(R(), 1.6) * S * 0.75
      const x = R() * S
      const rad = 6 + R() * 40
      const g = a.createRadialGradient(x, y, 0, x, y, rad)
      g.addColorStop(0, `rgba(12,8,6,${0.25 + 0.3 * (1 - y / S)})`)
      g.addColorStop(1, 'rgba(12,8,6,0)')
      a.fillStyle = g
      a.fillRect(x - rad, y - rad, rad * 2, rad * 2)
      r.fillStyle = 'rgba(255,255,255,0.05)'
      r.fillRect(x - rad / 2, y - rad / 2, rad, rad)
    }
  }
  const tex = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
    t.generateMipmaps = true
    t.minFilter = THREE.LinearMipmapLinearFilter
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    return t
  }
  const out = { map: tex(cA, true), bump: tex(cB, false), rough: tex(cR, false) }
  cache.set(key, out)
  return out
}

/** low-cost dent: push lathe vertices in along their normal with a few smooth bumps */
export function dentGeometry(g: THREE.BufferGeometry, seed: number, amount: number) {
  const R = rng(seed)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const dents = Array.from({ length: 5 }, () => ({ a: R() * Math.PI * 2, y: R(), r: 0.12 + R() * 0.2, d: amount * (0.5 + R()) }))
  let ymin = Infinity
  let ymax = -Infinity
  for (let i = 0; i < pos.count; i++) {
    ymin = Math.min(ymin, pos.getY(i))
    ymax = Math.max(ymax, pos.getY(i))
  }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const y = pos.getY(i)
    const rr = Math.hypot(x, z)
    if (rr < 1e-4) continue
    const ang = Math.atan2(z, x)
    const yn = (y - ymin) / (ymax - ymin || 1)
    let k = 0
    for (const d of dents) {
      const da = Math.atan2(Math.sin(ang - d.a), Math.cos(ang - d.a))
      const dist = Math.hypot(da * 0.5, yn - d.y)
      k += d.d * Math.exp(-(dist * dist) / (d.r * d.r))
    }
    const s = Math.max(0.6, 1 - k / rr)
    pos.setX(i, x * s)
    pos.setZ(i, z * s)
  }
  g.computeVertexNormals()
  return g
}
