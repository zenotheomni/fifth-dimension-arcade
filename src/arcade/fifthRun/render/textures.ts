/** Fifth Run — procedural canvas textures (no external assets). */
import * as THREE from 'three'

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d')! }
}

function rand(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** Soft radial glow (additive sprites, key halos, light pools). */
export function glowTexture(): THREE.Texture {
  const { c, g } = canvas(128, 128)
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.18, 'rgba(255,255,255,0.75)')
  grd.addColorStop(0.45, 'rgba(255,255,255,0.22)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Blob shadow. */
export function blobTexture(): THREE.Texture {
  const { c, g } = canvas(128, 128)
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62)
  grd.addColorStop(0, 'rgba(0,0,0,0.85)')
  grd.addColorStop(0.55, 'rgba(0,0,0,0.45)')
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

/** Comet streak: bright head on the right, tapered tail to the left. */
export function streakTexture(): THREE.Texture {
  const { c, g } = canvas(512, 64)
  const grd = g.createLinearGradient(0, 0, 512, 0)
  grd.addColorStop(0, 'rgba(255,170,40,0)')
  grd.addColorStop(0.6, 'rgba(255,190,70,0.35)')
  grd.addColorStop(0.92, 'rgba(255,230,160,0.95)')
  grd.addColorStop(1, 'rgba(255,255,255,1)')
  g.fillStyle = grd
  g.beginPath()
  g.moveTo(0, 32)
  g.lineTo(488, 20)
  g.quadraticCurveTo(512, 32, 488, 44)
  g.closePath()
  g.fill()
  const head = g.createRadialGradient(492, 32, 0, 492, 32, 26)
  head.addColorStop(0, 'rgba(255,255,255,1)')
  head.addColorStop(1, 'rgba(255,220,120,0)')
  g.fillStyle = head
  g.fillRect(440, 0, 72, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Planet albedo: ocean blues + lighter continents + cloud wisps (equirect). */
export function planetTexture(): THREE.Texture {
  const W = 512
  const H = 256
  const { c, g } = canvas(W, H)
  const img = g.createImageData(W, H)
  const r = rand(1959)
  // value-noise lattice
  const N = 32
  const lat: number[] = []
  for (let i = 0; i < N * N; i++) lat.push(r())
  const vn = (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const s = (t: number) => t * t * (3 - 2 * t)
    const at = (a: number, b: number) => lat[(((b % N) + N) % N) * N + (((a % N) + N) % N)]
    const top = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * s(xf)
    const bot = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * s(xf)
    return top + (bot - top) * s(yf)
  }
  const fbm = (x: number, y: number) => {
    let a = 0
    let amp = 0.5
    let f = 1
    for (let o = 0; o < 5; o++) {
      a += amp * vn(x * f, y * f)
      amp *= 0.5
      f *= 2
    }
    return a
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x / W) * 8
      const v = (y / H) * 4
      const land = fbm(u, v)
      const cloud = fbm(u * 1.7 + 11, v * 2.4 + 3)
      let R = 18
      let G = 52
      let B = 128
      if (land > 0.52) {
        const k = Math.min(1, (land - 0.52) * 5)
        R = 40 + 70 * k
        G = 90 + 80 * k
        B = 150 + 50 * k
      } else {
        const d = land / 0.52
        R = 10 + 20 * d
        G = 30 + 40 * d
        B = 90 + 60 * d
      }
      if (cloud > 0.58) {
        const k = Math.min(1, (cloud - 0.58) * 4)
        R += (220 - R) * k * 0.7
        G += (235 - G) * k * 0.7
        B += (255 - B) * k * 0.7
      }
      const i = (y * W + x) * 4
      img.data[i] = R
      img.data[i + 1] = G
      img.data[i + 2] = B
      img.data[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Barrier face: coral / white chevrons. */
export function chevronTexture(): THREE.Texture {
  const { c, g } = canvas(256, 64)
  g.fillStyle = '#f4efe9'
  g.fillRect(0, 0, 256, 64)
  g.fillStyle = '#ff3d5a'
  for (let x = -64; x < 320; x += 48) {
    g.beginPath()
    g.moveTo(x, 64)
    g.lineTo(x + 24, 64)
    g.lineTo(x + 56, 0)
    g.lineTo(x + 32, 0)
    g.closePath()
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  return t
}

/** Load a brand image (emblem) as texture. */
export function loadTexture(url: string): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace
        resolve(t)
      },
      undefined,
      () => resolve(null),
    )
  })
}
