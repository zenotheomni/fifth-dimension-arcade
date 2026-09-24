import * as THREE from 'three'
import { PALETTE } from '../palette'

/** Procedural pebbled orange basketball + seam canvas textures */
export function makeBasketballTextures() {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Base orange
  ctx.fillStyle = '#FF6B2C'
  ctx.fillRect(0, 0, size, size)

  // Pebble noise
  for (let i = 0; i < 14000; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = 0.6 + Math.random() * 1.8
    const shade = 180 + Math.floor(Math.random() * 55)
    ctx.fillStyle = `rgba(${shade}, ${70 + (Math.random() * 40) | 0}, ${20 + (Math.random() * 30) | 0}, ${0.25 + Math.random() * 0.35})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Soft vignette for roundness read
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.15, size / 2, size / 2, size * 0.65)
  g.addColorStop(0, 'rgba(255,140,60,0.15)')
  g.addColorStop(1, 'rgba(80,20,0,0.35)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  // Classic basketball seams (black channels) — UV sphere layout approximation
  ctx.strokeStyle = '#1a1210'
  ctx.lineWidth = 10
  ctx.lineCap = 'round'
  // equator
  ctx.beginPath()
  ctx.moveTo(0, size * 0.5)
  ctx.bezierCurveTo(size * 0.25, size * 0.42, size * 0.75, size * 0.58, size, size * 0.5)
  ctx.stroke()
  // vertical-ish seams
  for (const x of [0.25, 0.5, 0.75]) {
    ctx.beginPath()
    ctx.moveTo(size * x, 0)
    ctx.bezierCurveTo(
      size * (x - 0.08),
      size * 0.33,
      size * (x + 0.08),
      size * 0.66,
      size * x,
      size,
    )
    ctx.stroke()
  }
  // curved side seams
  ctx.beginPath()
  ctx.arc(size * 0.15, size * 0.5, size * 0.38, -1.1, 1.1)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(size * 0.85, size * 0.5, size * 0.38, Math.PI - 1.1, Math.PI + 1.1)
  ctx.stroke()

  // Micro 5D stamp near seam
  ctx.fillStyle = PALETTE.soft
  ctx.globalAlpha = 0.55
  ctx.font = `bold ${Math.floor(size * 0.045)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText('5D', size * 0.62, size * 0.48)
  ctx.globalAlpha = 1

  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  map.needsUpdate = true

  // Bump from luminance
  const bumpCanvas = document.createElement('canvas')
  bumpCanvas.width = size
  bumpCanvas.height = size
  const bctx = bumpCanvas.getContext('2d')!
  bctx.drawImage(canvas, 0, 0)
  const img = bctx.getImageData(0, 0, size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const l = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3
    img.data[i] = img.data[i + 1] = img.data[i + 2] = l
  }
  bctx.putImageData(img, 0, 0)
  // Extra pebble dots for bump
  for (let i = 0; i < 8000; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    bctx.fillStyle = Math.random() > 0.5 ? '#bbb' : '#666'
    bctx.fillRect(x, y, 1.5, 1.5)
  }
  const bumpMap = new THREE.CanvasTexture(bumpCanvas)
  bumpMap.needsUpdate = true

  return { map, bumpMap }
}

export function makeWoodFloorTexture() {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#2a2235'
  ctx.fillRect(0, 0, size, size)
  // Plank lines
  for (let y = 0; y < size; y += 32) {
    const shade = 36 + (Math.random() * 22) | 0
    ctx.fillStyle = `rgb(${shade + 8},${shade},${shade + 14})`
    ctx.fillRect(0, y, size, 30)
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.moveTo(0, y + 30)
    ctx.lineTo(size, y + 30)
    ctx.stroke()
    // grain
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = `rgba(255,200,150,${0.015 + Math.random() * 0.03})`
      ctx.beginPath()
      const gy = y + 4 + Math.random() * 22
      ctx.moveTo(0, gy)
      ctx.bezierCurveTo(size * 0.3, gy + 2, size * 0.7, gy - 2, size, gy)
      ctx.stroke()
    }
  }
  const map = new THREE.CanvasTexture(canvas)
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.repeat.set(4, 5)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  return map
}
