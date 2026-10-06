import * as THREE from 'three'
import { mulberry32 } from '../../core/seededRandom'

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  return { c, ctx }
}

/** Seam field on the unit sphere: 0 on a seam, grows away from it. */
function seamDist(x: number, y: number, z: number): number {
  const a = Math.abs(y) // equator great circle
  const b = Math.abs(x) // meridian great circle
  // Two curved "side" seams wrapping the ±z poles
  const c = Math.abs(Math.abs(z) - (0.68 + 0.3 * (y * y - x * x)))
  return Math.min(a, b, c * 0.9)
}

/**
 * Leather basketball: albedo (orange + mottling + black seams) and a pebble
 * normal map, both equirect for SphereGeometry UVs. Procedural — no assets.
 */
export function makeBallTextures(size = 1024) {
  const W = size
  const H = size / 2
  const rnd = mulberry32(90210)

  // Height field: pebbles + seam grooves
  const height = new Float32Array(W * H)
  const peb = new Float32Array(W * H)
  const pebbles = Math.round(W * H * 0.05)
  for (let i = 0; i < pebbles; i++) {
    const v = rnd()
    const cy = v * H
    const lat = (0.5 - v) * Math.PI
    const sx = Math.min(5, 1 / Math.max(0.2, Math.cos(lat)))
    const cx = rnd() * W
    const r = 1.3 + rnd() * 0.9
    const rx = r * sx
    const x0 = Math.floor(cx - rx - 1)
    const x1 = Math.ceil(cx + rx + 1)
    const y0 = Math.max(0, Math.floor(cy - r - 1))
    const y1 = Math.min(H - 1, Math.ceil(cy + r + 1))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / rx
        const dy = (y - cy) / r
        const d2 = dx * dx + dy * dy
        if (d2 >= 1) continue
        const k = y * W + ((x % W) + W) % W
        const hgt = 1 - d2
        if (hgt > peb[k]) peb[k] = hgt
      }
    }
  }

  const { c: albedoC, ctx: actx } = canvas(W, H)
  const alb = actx.createImageData(W, H)
  const seamW = 0.016
  for (let j = 0; j < H; j++) {
    const lat = (0.5 - (j + 0.5) / H) * Math.PI
    const cl = Math.cos(lat)
    const sy = Math.sin(lat)
    for (let i = 0; i < W; i++) {
      const lon = ((i + 0.5) / W) * Math.PI * 2
      const x = cl * Math.cos(lon)
      const z = cl * Math.sin(lon)
      const d = seamDist(x, sy, z)
      const k = j * W + i
      const pb = peb[k]
      // groove: smooth dip around seams
      const groove = d < seamW * 2.2 ? Math.cos((Math.min(d, seamW * 2.2) / (seamW * 2.2)) * Math.PI * 0.5) : 0
      height[k] = pb * 0.5 - groove * 1.2
      // albedo
      const n = 0.92 + 0.08 * Math.sin(i * 0.37 + j * 0.21) * Math.sin(j * 0.13 - i * 0.05) + (pb - 0.3) * 0.07
      let r = 196 * n
      let g = 88 * n
      let b = 34 * n
      if (d < seamW) {
        const s = d / seamW
        const m = s < 0.75 ? 1 : 1 - (s - 0.75) / 0.25
        r = r * (1 - m) + 24 * m
        g = g * (1 - m) + 18 * m
        b = b * (1 - m) + 16 * m
      }
      alb.data[k * 4] = r
      alb.data[k * 4 + 1] = g
      alb.data[k * 4 + 2] = b
      alb.data[k * 4 + 3] = 255
    }
  }
  actx.putImageData(alb, 0, 0)

  const { c: normC, ctx: nctx } = canvas(W, H)
  const nimg = nctx.createImageData(W, H)
  const strength = 2.4
  for (let j = 0; j < H; j++) {
    const jm = Math.max(0, j - 1)
    const jp = Math.min(H - 1, j + 1)
    const lat = (0.5 - (j + 0.5) / H) * Math.PI
    const sx = Math.max(0.2, Math.cos(lat))
    for (let i = 0; i < W; i++) {
      const im = (i - 1 + W) % W
      const ip = (i + 1) % W
      const dx = (height[j * W + ip] - height[j * W + im]) * strength * sx
      const dy = (height[jp * W + i] - height[jm * W + i]) * strength
      const nz = 1
      const len = Math.hypot(dx, dy, nz)
      const k = (j * W + i) * 4
      nimg.data[k] = ((-dx / len) * 0.5 + 0.5) * 255
      nimg.data[k + 1] = ((dy / len) * 0.5 + 0.5) * 255
      nimg.data[k + 2] = ((nz / len) * 0.5 + 0.5) * 255
      nimg.data[k + 3] = 255
    }
  }
  nctx.putImageData(nimg, 0, 0)

  const map = new THREE.CanvasTexture(albedoC)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  const normalMap = new THREE.CanvasTexture(normC)
  normalMap.anisotropy = 4
  return { map, normalMap }
}

/** Soft radial blob (contact shadows). */
export function makeBlobTexture(size = 128, inner = 0.0, falloff = 1.0) {
  const { c, ctx } = canvas(size, size)
  const g = ctx.createRadialGradient(size / 2, size / 2, size * inner * 0.5, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(0,0,0,1)')
  g.addColorStop(0.35 * falloff, 'rgba(0,0,0,0.65)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c)
  return t
}

/** Long soft streak for the golden-hour pole shadow (fades with distance). */
export function makeStreakTexture() {
  const { c, ctx } = canvas(64, 256)
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, 'rgba(0,0,0,0.85)')
  g.addColorStop(0.5, 'rgba(0,0,0,0.35)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 256)
  const img = ctx.getImageData(0, 0, 64, 256)
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 64; x++) {
      const e = Math.abs(x - 31.5) / 32
      const soft = 1 - Math.min(1, Math.max(0, (e - 0.35 - (y / 256) * 0.3) / 0.35))
      img.data[(y * 64 + x) * 4 + 3] *= soft
    }
  }
  ctx.putImageData(img, 0, 0)
  return new THREE.CanvasTexture(c)
}

/** Subtle micro-scratch roughness for the glass (keeps reflections alive). */
export function makeGlassRoughness() {
  const { c, ctx } = canvas(256, 256)
  ctx.fillStyle = 'rgb(10,10,10)'
  ctx.fillRect(0, 0, 256, 256)
  const rnd = mulberry32(5150)
  ctx.strokeStyle = 'rgba(60,60,60,0.25)'
  for (let i = 0; i < 120; i++) {
    ctx.beginPath()
    const x = rnd() * 256
    const y = rnd() * 256
    ctx.moveTo(x, y)
    ctx.lineTo(x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 6)
    ctx.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}
