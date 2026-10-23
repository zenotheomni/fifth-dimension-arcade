/**
 * FIFTH FRAME — Neon Paradise environment (Fifth Floor quality bar).
 * Ingredients (not checklist): sunset→space sky, magenta palms in teal planters,
 * gold-grid reflective lane, coastal megacity, UFO, Circle 5 portal branding.
 * Composition: Court Vision scale — huge ball foreground, readable pins, lane fills width.
 */
import { FifthFrameEngine, VIEW, project } from './engine'

const EMBLEM_SRC = `${import.meta.env.BASE_URL}art/emblem-neon-sign.webp`
let emblem: HTMLImageElement | null = null
let emblemFailed = false

function ensureEmblem() {
  if (emblem || emblemFailed) return
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => {
    emblem = img
  }
  img.onerror = () => {
    emblemFailed = true
  }
  img.src = EMBLEM_SRC
}

export function paintWorld(ctx: CanvasRenderingContext2D, W: number, H: number, e: FifthFrameEngine, t: number) {
  ensureEmblem()
  drawSky(ctx, W, H, t)
  drawHorizonCity(ctx, W, H, t)
  drawOcean(ctx, W, H, t)
  drawUfo(ctx, W, H, t)
  drawPalms(ctx, W, H, t)
  drawGutters(ctx, W, H)
  drawLane(ctx, W, H, e, t)
  drawApproach(ctx, W, H)
  drawRails(ctx, W, H, t)
  drawPortal(ctx, W, H, t)
  drawFoulAndArrows(ctx, W, H)

  const pins = [...e.pins].sort((a, b) => b.z - a.z)
  for (const pin of pins) drawPin(ctx, W, H, pin)

  if (e.phase === 'aim' && e.aimPower > 0.05) {
    const steps = 16
    for (let i = 1; i <= steps; i++) {
      const z = 0.08 + (0.78 * i) / steps
      const x = e.ball.x + e.aimX * (z - 0.04) * 0.9
      const p = project(x, z, W, H)
      ctx.fillStyle = `rgba(255, 200, 80, ${0.06 + (1 - i / steps) * 0.28})`
      ctx.beginPath()
      ctx.arc(p.cx, p.cy, 3.4 * p.scale, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  drawBall(ctx, W, H, e, t)
}

function drawSky(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  // Deep space → violet → peach/pink sunset (Glide Neon Paradise)
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.72)
  g.addColorStop(0, '#050218')
  g.addColorStop(0.18, '#1a0a3a')
  g.addColorStop(0.42, '#5a1a6a')
  g.addColorStop(0.62, '#c45a7a')
  g.addColorStop(0.78, '#f0a078')
  g.addColorStop(1, '#ffd0a0')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // Stars (upper sky)
  ctx.save()
  for (let i = 0; i < 55; i++) {
    const sx = ((i * 97) % 1000) / 1000 * W
    const sy = ((i * 53) % 1000) / 1000 * H * 0.38
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.1 + i))
    ctx.fillStyle = `rgba(255,255,255,${0.15 + tw * 0.55})`
    ctx.beginPath()
    ctx.arc(sx, sy, 0.6 + (i % 3) * 0.35, 0, Math.PI * 2)
    ctx.fill()
  }
  // Shooting star
  const shoot = (t * 0.08) % 1
  ctx.strokeStyle = `rgba(255,220,180,${0.55 * (1 - shoot)})`
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(W * (0.1 + shoot * 0.7), H * (0.05 + shoot * 0.12))
  ctx.lineTo(W * (0.05 + shoot * 0.7), H * (0.08 + shoot * 0.12))
  ctx.stroke()
  ctx.restore()

  // Ringed planet / moon (upper right)
  const px = W * 0.78
  const py = H * 0.12
  const pr = Math.min(W, H) * 0.07
  ctx.save()
  const pg = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.3, pr * 0.1, px, py, pr)
  pg.addColorStop(0, '#fff0d8')
  pg.addColorStop(0.5, '#e8c8a0')
  pg.addColorStop(1, '#c09070')
  ctx.fillStyle = pg
  ctx.shadowColor = 'rgba(255,200,150,0.45)'
  ctx.shadowBlur = 18
  ctx.beginPath()
  ctx.arc(px, py, pr, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(180,220,255,0.55)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(px, py, pr * 1.55, pr * 0.35, -0.25, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawHorizonCity(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  const baseY = H * 0.42
  const pulse = 0.7 + 0.3 * Math.sin(t * 1.4)
  ctx.save()
  // Soft haze over city
  const haze = ctx.createLinearGradient(0, baseY - H * 0.08, 0, baseY + H * 0.06)
  haze.addColorStop(0, 'rgba(255,160,120,0.15)')
  haze.addColorStop(1, 'rgba(40,20,80,0.35)')
  ctx.fillStyle = haze
  ctx.fillRect(0, baseY - H * 0.1, W, H * 0.18)

  // Intentional skyline silhouettes (not random noise)
  const buildings = [
    { x: 0.05, w: 0.06, h: 0.09 },
    { x: 0.12, w: 0.04, h: 0.14 },
    { x: 0.18, w: 0.07, h: 0.11 },
    { x: 0.28, w: 0.05, h: 0.16 },
    { x: 0.35, w: 0.08, h: 0.1 },
    { x: 0.46, w: 0.045, h: 0.18 },
    { x: 0.52, w: 0.06, h: 0.12 },
    { x: 0.6, w: 0.05, h: 0.15 },
    { x: 0.68, w: 0.07, h: 0.09 },
    { x: 0.78, w: 0.05, h: 0.14 },
    { x: 0.86, w: 0.08, h: 0.11 },
  ]
  for (const b of buildings) {
    const bx = W * b.x
    const bw = W * b.w
    const bh = H * b.h
    ctx.fillStyle = '#0a0618'
    ctx.fillRect(bx, baseY - bh, bw, bh)
    // Neon edges
    ctx.strokeStyle = `rgba(80, 220, 255, ${0.35 * pulse})`
    ctx.lineWidth = 1.2
    ctx.strokeRect(bx + 0.5, baseY - bh + 0.5, bw - 1, bh - 1)
    // Window dots
    ctx.fillStyle = `rgba(255, 180, 100, ${0.35 + 0.25 * pulse})`
    for (let wy = 3; wy < bh - 4; wy += 5) {
      for (let wx = 3; wx < bw - 3; wx += 4) {
        if ((wx + wy) % 7 !== 0) continue
        ctx.fillRect(bx + wx, baseY - bh + wy, 1.5, 1.5)
      }
    }
  }
  // Bridge / pier accent
  ctx.strokeStyle = `rgba(0, 230, 210, ${0.4 * pulse})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(W * 0.2, baseY - 2)
  ctx.quadraticCurveTo(W * 0.5, baseY - H * 0.04, W * 0.8, baseY - 2)
  ctx.stroke()
  ctx.restore()
}

function drawOcean(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  const top = H * 0.42
  const bot = H * 0.58
  const g = ctx.createLinearGradient(0, top, 0, bot)
  g.addColorStop(0, 'rgba(40, 80, 140, 0.55)')
  g.addColorStop(0.4, 'rgba(20, 40, 90, 0.75)')
  g.addColorStop(1, 'rgba(8, 12, 40, 0.95)')
  ctx.fillStyle = g
  ctx.fillRect(0, top, W, bot - top)
  // Neon reflections on water
  ctx.save()
  ctx.globalAlpha = 0.35
  for (let i = 0; i < 12; i++) {
    const x = ((i * 0.09 + t * 0.02) % 1) * W
    const y = top + 8 + (i % 5) * 6
    ctx.strokeStyle = i % 2 ? 'rgba(255,100,180,0.5)' : 'rgba(0,230,210,0.45)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 18 + (i % 4) * 8, y)
    ctx.stroke()
  }
  ctx.restore()
}

function drawUfo(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  const ux = W * (0.22 + 0.03 * Math.sin(t * 0.35))
  const uy = H * (0.16 + 0.01 * Math.cos(t * 0.5))
  const s = Math.min(W, H) * 0.035
  ctx.save()
  ctx.translate(ux, uy)
  // Beam
  const beam = ctx.createLinearGradient(0, 0, 0, H * 0.2)
  beam.addColorStop(0, 'rgba(80,200,255,0.25)')
  beam.addColorStop(1, 'rgba(80,200,255,0)')
  ctx.fillStyle = beam
  ctx.beginPath()
  ctx.moveTo(-s * 0.4, s * 0.3)
  ctx.lineTo(s * 0.4, s * 0.3)
  ctx.lineTo(s * 1.8, H * 0.18)
  ctx.lineTo(-s * 1.8, H * 0.18)
  ctx.closePath()
  ctx.fill()
  // Saucer
  ctx.fillStyle = '#c8d0e0'
  ctx.beginPath()
  ctx.ellipse(0, 0, s * 1.6, s * 0.45, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#8ab4ff'
  ctx.beginPath()
  ctx.ellipse(0, -s * 0.25, s * 0.7, s * 0.4, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(0,230,210,0.9)'
  ctx.shadowColor = 'rgba(0,230,210,0.8)'
  ctx.shadowBlur = 8
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath()
    ctx.arc(i * s * 0.45, s * 0.15, s * 0.12, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawPalm(ctx: CanvasRenderingContext2D, x: number, baseY: number, scale: number, t: number, side: number) {
  const sway = Math.sin(t * 1.2 + side) * 0.04
  ctx.save()
  ctx.translate(x, baseY)
  ctx.rotate(sway)
  // Teal planter
  const pw = 14 * scale
  const ph = 10 * scale
  const pg = ctx.createLinearGradient(-pw, 0, pw, 0)
  pg.addColorStop(0, '#0a6868')
  pg.addColorStop(0.5, '#1ad4c8')
  pg.addColorStop(1, '#0a6868')
  ctx.fillStyle = pg
  ctx.shadowColor = 'rgba(0,230,210,0.55)'
  ctx.shadowBlur = 10 * scale
  ctx.beginPath()
  ctx.moveTo(-pw, 0)
  ctx.lineTo(pw, 0)
  ctx.lineTo(pw * 0.75, ph)
  ctx.lineTo(-pw * 0.75, ph)
  ctx.closePath()
  ctx.fill()
  ctx.shadowBlur = 0
  // Trunk
  ctx.strokeStyle = '#3a2818'
  ctx.lineWidth = 3.2 * scale
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(side * 8 * scale, -40 * scale, side * 4 * scale, -90 * scale)
  ctx.stroke()
  // Magenta fronds
  const tipX = side * 4 * scale
  const tipY = -90 * scale
  ctx.strokeStyle = '#ff2ea6'
  ctx.shadowColor = 'rgba(255,46,166,0.75)'
  ctx.shadowBlur = 12 * scale
  ctx.lineWidth = 2.2 * scale
  ctx.lineCap = 'round'
  for (let i = 0; i < 7; i++) {
    const a = -1.2 + i * 0.35
    ctx.beginPath()
    ctx.moveTo(tipX, tipY)
    ctx.quadraticCurveTo(
      tipX + Math.cos(a) * 28 * scale,
      tipY + Math.sin(a) * 18 * scale - 10 * scale,
      tipX + Math.cos(a) * 42 * scale,
      tipY + Math.sin(a) * 32 * scale,
    )
    ctx.stroke()
  }
  ctx.restore()
}

function drawPalms(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  // Near palms frame the lane like Glide corridor trees
  drawPalm(ctx, W * 0.08, H * 0.72, 1.15, t, -1)
  drawPalm(ctx, W * 0.92, H * 0.72, 1.15, t, 1)
  drawPalm(ctx, W * 0.14, H * 0.58, 0.75, t, -1)
  drawPalm(ctx, W * 0.86, H * 0.58, 0.75, t, 1)
  drawPalm(ctx, W * 0.2, H * 0.48, 0.45, t, -1)
  drawPalm(ctx, W * 0.8, H * 0.48, 0.45, t, 1)
}

function drawGutters(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const gHalf = VIEW.LANE_HALF + 0.085
  const nearGL = project(-gHalf, 0.0, W, H)
  const nearGR = project(gHalf, 0.0, W, H)
  const farGL = project(-gHalf, 1.05, W, H)
  const farGR = project(gHalf, 1.05, W, H)
  const nearL = project(-VIEW.LANE_HALF, 0.0, W, H)
  const nearR = project(VIEW.LANE_HALF, 0.0, W, H)
  const farL = project(-VIEW.LANE_HALF, 0.74, W, H)
  const farR = project(VIEW.LANE_HALF, 0.74, W, H)

  ctx.beginPath()
  ctx.moveTo(nearGL.cx, nearGL.cy)
  ctx.lineTo(nearL.cx, nearL.cy)
  ctx.lineTo(farL.cx, farL.cy)
  ctx.lineTo(farGL.cx, farGL.cy)
  ctx.closePath()
  const lg = ctx.createLinearGradient(nearGL.cx, 0, nearL.cx, 0)
  lg.addColorStop(0, '#060818')
  lg.addColorStop(0.55, '#0c1830')
  lg.addColorStop(1, '#081018')
  ctx.fillStyle = lg
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(nearR.cx, nearR.cy)
  ctx.lineTo(nearGR.cx, nearGR.cy)
  ctx.lineTo(farGR.cx, farGR.cy)
  ctx.lineTo(farR.cx, farR.cy)
  ctx.closePath()
  const rg = ctx.createLinearGradient(nearR.cx, 0, nearGR.cx, 0)
  rg.addColorStop(0, '#081018')
  rg.addColorStop(0.45, '#0c1830')
  rg.addColorStop(1, '#060818')
  ctx.fillStyle = rg
  ctx.fill()
}

function drawLane(ctx: CanvasRenderingContext2D, W: number, H: number, e: FifthFrameEngine, t: number) {
  const nearL = project(-VIEW.LANE_HALF, 0.0, W, H)
  const nearR = project(VIEW.LANE_HALF, 0.0, W, H)
  const farL = project(-VIEW.LANE_HALF, 0.74, W, H)
  const farR = project(VIEW.LANE_HALF, 0.74, W, H)

  ctx.beginPath()
  ctx.moveTo(nearL.cx, nearL.cy)
  ctx.lineTo(nearR.cx, nearR.cy)
  ctx.lineTo(farR.cx, farR.cy)
  ctx.lineTo(farL.cx, farL.cy)
  ctx.closePath()

  // Dark polished resin base with warm undertone
  const wood = ctx.createLinearGradient(0, nearL.cy, 0, farL.cy)
  wood.addColorStop(0, '#2a1c14')
  wood.addColorStop(0.25, '#1a1410')
  wood.addColorStop(0.55, '#121018')
  wood.addColorStop(1, '#0a0c18')
  ctx.fillStyle = wood
  ctx.fill()

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(nearL.cx, nearL.cy)
  ctx.lineTo(nearR.cx, nearR.cy)
  ctx.lineTo(farR.cx, farR.cy)
  ctx.lineTo(farL.cx, farL.cy)
  ctx.closePath()
  ctx.clip()

  // Gold grid (Glide path language) — luminous lane markings
  ctx.strokeStyle = 'rgba(255, 200, 80, 0.22)'
  ctx.lineWidth = 1.2
  for (let i = 1; i < 10; i++) {
    const x = -VIEW.LANE_HALF + (VIEW.LANE_HALF * 2 * i) / 10
    const a = project(x, 0.01, W, H)
    const b = project(x, 1.04, W, H)
    ctx.beginPath()
    ctx.moveTo(a.cx, a.cy)
    ctx.lineTo(b.cx, b.cy)
    ctx.stroke()
  }
  for (let z = 0.06; z < 1.0; z += 0.08) {
    const a = project(-VIEW.LANE_HALF * 0.95, z, W, H)
    const b = project(VIEW.LANE_HALF * 0.95, z, W, H)
    ctx.strokeStyle = `rgba(255, 190, 70, ${0.08 + (z % 0.16) * 0.12})`
    ctx.beginPath()
    ctx.moveTo(a.cx, a.cy)
    ctx.lineTo(b.cx, b.cy)
    ctx.stroke()
  }

  // Specular polish
  const gloss = ctx.createLinearGradient(W * 0.5, nearL.cy, W * 0.5, farL.cy)
  gloss.addColorStop(0, 'rgba(255, 240, 220, 0.38)')
  gloss.addColorStop(0.15, 'rgba(255, 255, 255, 0.22)')
  gloss.addColorStop(0.4, 'rgba(255, 160, 200, 0.12)')
  gloss.addColorStop(0.7, 'rgba(0, 230, 210, 0.16)')
  gloss.addColorStop(1, 'rgba(120, 60, 200, 0.12)')
  ctx.fillStyle = gloss
  ctx.fillRect(0, 0, W, H)

  // Sky reflection wash
  const skyRef = ctx.createLinearGradient(0, farL.cy - 40, 0, farL.cy + 60)
  skyRef.addColorStop(0, 'rgba(255,140,100,0.18)')
  skyRef.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = skyRef
  ctx.fillRect(0, 0, W, H)

  // Pin reflections
  for (const pin of e.pins) {
    if (!pin.up) continue
    const p = project(pin.x, pin.z, W, H)
    ctx.save()
    ctx.globalAlpha = 0.2
    ctx.translate(p.cx, p.cy + 8 * p.scale)
    ctx.scale(1, -0.4)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath()
    ctx.ellipse(0, 0, 4 * p.scale, 11 * p.scale, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  void t
  ctx.restore()
}

function drawApproach(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const foulL = project(-VIEW.LANE_HALF, 0.1, W, H)
  const foulR = project(VIEW.LANE_HALF, 0.1, W, H)
  const y0 = H * 0.98
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(W * 0.05, y0)
  ctx.lineTo(W * 0.95, y0)
  ctx.lineTo(foulR.cx, foulR.cy)
  ctx.lineTo(foulL.cx, foulL.cy)
  ctx.closePath()
  const g = ctx.createLinearGradient(0, y0, 0, foulL.cy)
  g.addColorStop(0, '#1a1418')
  g.addColorStop(0.55, '#141018')
  g.addColorStop(1, '#100e16')
  ctx.fillStyle = g
  ctx.fill()
  ctx.restore()
}

function drawRails(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  const pulse = 0.75 + 0.25 * Math.sin(t * 2.2)
  const drawOne = (x: number, color: string) => {
    const a = project(x, 0.0, W, H)
    const b = project(x, 1.06, W, H)
    ctx.save()
    ctx.strokeStyle = 'rgba(20, 24, 40, 0.95)'
    ctx.lineWidth = 10
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(a.cx, a.cy)
    ctx.lineTo(b.cx, b.cy)
    ctx.stroke()
    ctx.strokeStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = 18
    ctx.lineWidth = 5
    ctx.globalAlpha = 0.45 * pulse
    ctx.beginPath()
    ctx.moveTo(a.cx, a.cy)
    ctx.lineTo(b.cx, b.cy)
    ctx.stroke()
    ctx.globalAlpha = 0.95 * pulse
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.moveTo(a.cx, a.cy)
    ctx.lineTo(b.cx, b.cy)
    ctx.stroke()
    ctx.restore()
  }
  drawOne(-VIEW.LANE_HALF, 'rgba(0, 240, 210, 1)')
  drawOne(VIEW.LANE_HALF, 'rgba(255, 80, 180, 1)')
}

function drawPortal(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  const deck = project(0, 0.72, W, H)
  const left = project(-VIEW.LANE_HALF * 1.15, 0.72, W, H)
  const right = project(VIEW.LANE_HALF * 1.15, 0.72, W, H)
  const pulse = 0.7 + 0.3 * Math.sin(t * 2.0)

  // Dimensional arch behind pin deck
  const archTop = deck.cy - H * 0.22
  ctx.save()
  ctx.strokeStyle = `rgba(0, 230, 210, ${0.55 * pulse})`
  ctx.shadowColor = 'rgba(0, 230, 210, 0.7)'
  ctx.shadowBlur = 16
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(left.cx, deck.cy + 4)
  ctx.lineTo(left.cx + 8, archTop + 20)
  ctx.quadraticCurveTo(W * 0.5, archTop - 18, right.cx - 8, archTop + 20)
  ctx.lineTo(right.cx, deck.cy + 4)
  ctx.stroke()
  // Magenta outer arch
  ctx.strokeStyle = `rgba(255, 80, 180, ${0.4 * pulse})`
  ctx.shadowColor = 'rgba(255, 80, 180, 0.55)'
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.moveTo(left.cx - 10, deck.cy + 6)
  ctx.lineTo(left.cx - 2, archTop + 12)
  ctx.quadraticCurveTo(W * 0.5, archTop - 28, right.cx + 2, archTop + 12)
  ctx.lineTo(right.cx + 10, deck.cy + 6)
  ctx.stroke()
  ctx.restore()

  // Circle 5 emblem — intentional portal badge (not giant logo spam)
  const ex = W * 0.5
  const ey = archTop + H * 0.02
  const er = Math.min(W, H) * 0.055
  ctx.save()
  ctx.shadowColor = `rgba(0, 230, 210, ${0.7 * pulse})`
  ctx.shadowBlur = 14
  ctx.strokeStyle = `rgba(0, 240, 220, ${0.85 * pulse})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(ex, ey, er * 1.05, 0, Math.PI * 2)
  ctx.stroke()
  if (emblem && emblem.complete && emblem.naturalWidth > 0) {
    const size = er * 2
    ctx.beginPath()
    ctx.arc(ex, ey, er * 0.95, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(emblem, ex - size / 2, ey - size / 2, size, size)
  } else {
    ctx.fillStyle = '#0a0614'
    ctx.beginPath()
    ctx.arc(ex, ey, er * 0.92, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f4f0ea'
    ctx.font = `800 ${Math.round(er * 1.15)}px Inter, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('5', ex, ey + 1)
  }
  ctx.restore()

  // Subtle wordmark under arch
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const fs = Math.max(11, Math.round(H * 0.018))
  ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`
  ctx.fillStyle = `rgba(242,240,234,${0.55 + 0.25 * pulse})`
  ctx.shadowColor = 'rgba(0,230,210,0.4)'
  ctx.shadowBlur = 8
  ctx.fillText('FIFTH DIMENSION', ex, ey + er + 6)
  ctx.restore()

  // Pin deck light strip
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 200, 80, 0.5)'
  ctx.shadowColor = 'rgba(255, 200, 80, 0.6)'
  ctx.shadowBlur = 8
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(left.cx + 6, deck.cy + 2)
  ctx.lineTo(right.cx - 6, deck.cy + 2)
  ctx.stroke()
  ctx.restore()
}

function drawFoulAndArrows(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const foulL = project(-VIEW.LANE_HALF, 0.1, W, H)
  const foulR = project(VIEW.LANE_HALF, 0.1, W, H)
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 200, 80, 0.65)'
  ctx.shadowColor = 'rgba(255, 200, 80, 0.35)'
  ctx.shadowBlur = 6
  ctx.lineWidth = 2.2
  ctx.beginPath()
  ctx.moveTo(foulL.cx, foulL.cy)
  ctx.lineTo(foulR.cx, foulR.cy)
  ctx.stroke()
  ctx.restore()
  for (let i = 0; i < 5; i++) {
    const x = -0.2 + i * 0.1
    const p = project(x, 0.16, W, H)
    ctx.fillStyle = 'rgba(0, 220, 200, 0.4)'
    ctx.beginPath()
    ctx.moveTo(p.cx, p.cy - 5 * p.scale)
    ctx.lineTo(p.cx - 4 * p.scale, p.cy + 3 * p.scale)
    ctx.lineTo(p.cx + 4 * p.scale, p.cy + 3 * p.scale)
    ctx.closePath()
    ctx.fill()
  }
}

function drawPin(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  pin: { x: number; z: number; up: boolean; angle: number; vx: number; vz: number },
) {
  const p = project(pin.x, pin.z, W, H)
  const s = p.scale
  const h = Math.min(W, H) * 0.26 * s
  const bellyW = h * 0.175
  const neckW = h * 0.068
  const headW = h * 0.095

  ctx.save()
  ctx.translate(p.cx, p.cy)
  if (!pin.up) {
    const ang = pin.angle || Math.atan2(pin.vz, pin.vx) || 0.9
    ctx.rotate(ang)
    ctx.globalAlpha = 0.55
  }

  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(0, h * 0.48, bellyW * 0.95, bellyW * 0.28, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.shadowColor = 'rgba(255, 200, 180, 0.3)'
  ctx.shadowBlur = 8 * s

  const body = ctx.createLinearGradient(-bellyW, 0, bellyW, 0)
  body.addColorStop(0, '#cfc6ba')
  body.addColorStop(0.35, '#f7f2ea')
  body.addColorStop(0.55, '#ffffff')
  body.addColorStop(0.78, '#efe6da')
  body.addColorStop(1, '#b9aea0')
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.moveTo(0, -h)
  ctx.bezierCurveTo(headW, -h, headW * 1.05, -h * 0.82, headW * 0.85, -h * 0.72)
  ctx.bezierCurveTo(neckW * 1.1, -h * 0.62, neckW, -h * 0.48, neckW * 1.05, -h * 0.38)
  ctx.bezierCurveTo(bellyW * 0.75, -h * 0.22, bellyW, -h * 0.05, bellyW, h * 0.12)
  ctx.bezierCurveTo(bellyW * 0.98, h * 0.28, bellyW * 0.7, h * 0.4, bellyW * 0.35, h * 0.46)
  ctx.lineTo(0, h * 0.5)
  ctx.lineTo(-bellyW * 0.35, h * 0.46)
  ctx.bezierCurveTo(-bellyW * 0.7, h * 0.4, -bellyW * 0.98, h * 0.28, -bellyW, h * 0.12)
  ctx.bezierCurveTo(-bellyW, -h * 0.05, -bellyW * 0.75, -h * 0.22, -neckW * 1.05, -h * 0.38)
  ctx.bezierCurveTo(-neckW, -h * 0.48, -neckW * 1.1, -h * 0.62, -headW * 0.85, -h * 0.72)
  ctx.bezierCurveTo(-headW * 1.05, -h * 0.82, -headW, -h, 0, -h)
  ctx.closePath()
  ctx.fill()

  ctx.shadowBlur = 0
  const spec = ctx.createLinearGradient(-bellyW * 0.5, -h * 0.75, bellyW * 0.35, h * 0.25)
  spec.addColorStop(0, 'rgba(255,255,255,0.75)')
  spec.addColorStop(0.2, 'rgba(255,255,255,0.35)')
  spec.addColorStop(0.45, 'rgba(255,255,255,0.08)')
  spec.addColorStop(0.6, 'rgba(255,255,255,0)')
  ctx.fillStyle = spec
  ctx.beginPath()
  ctx.ellipse(-bellyW * 0.28, -h * 0.15, bellyW * 0.28, h * 0.38, -0.15, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#d32f2f'
  ctx.beginPath()
  ctx.ellipse(0, -h * 0.4, neckW * 1.55, Math.max(2.2 * s, neckW * 0.75), 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#b71c1c'
  ctx.beginPath()
  ctx.ellipse(0, -h * 0.36, neckW * 1.45, Math.max(1.4 * s, neckW * 0.4), 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

function drawBall(ctx: CanvasRenderingContext2D, W: number, H: number, e: FifthFrameEngine, t: number) {
  const b = e.ball
  if (!b.alive && e.phase !== 'aim') return
  const p = project(b.x, b.z, W, H)
  const r = ((VIEW.BALL_R * W * 0.5 * p.scale) / VIEW.LANE_HALF) * 2.35

  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.beginPath()
  ctx.ellipse(p.cx, p.cy + r * 0.72, r * 1.05, r * 0.34, 0, 0, Math.PI * 2)
  ctx.fill()

  if (b.rolling) {
    ctx.strokeStyle = 'rgba(255, 80, 180, 0.3)'
    ctx.shadowColor = 'rgba(0, 230, 210, 0.4)'
    ctx.shadowBlur = 12
    ctx.lineWidth = Math.max(2, r * 0.22)
    const trail = project(b.x - b.vx * 0.055, b.z - b.vz * 0.055, W, H)
    ctx.beginPath()
    ctx.moveTo(trail.cx, trail.cy)
    ctx.lineTo(p.cx, p.cy)
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  const g = ctx.createRadialGradient(p.cx - r * 0.35, p.cy - r * 0.4, r * 0.05, p.cx, p.cy, r)
  g.addColorStop(0, '#3a4558')
  g.addColorStop(0.3, '#1a2030')
  g.addColorStop(0.65, '#0c1018')
  g.addColorStop(1, '#05060a')
  ctx.fillStyle = g
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 10
  ctx.beginPath()
  ctx.arc(p.cx, p.cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0

  const hl = ctx.createRadialGradient(p.cx - r * 0.32, p.cy - r * 0.38, 0, p.cx - r * 0.32, p.cy - r * 0.38, r * 0.5)
  hl.addColorStop(0, 'rgba(255,255,255,0.55)')
  hl.addColorStop(0.35, 'rgba(200, 220, 255, 0.18)')
  hl.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = hl
  ctx.beginPath()
  ctx.arc(p.cx, p.cy, r, 0, Math.PI * 2)
  ctx.fill()

  // Subtle Circle-5-inspired accent (not a giant logo)
  const spin = t * (b.rolling ? 5.5 : 0.4)
  ctx.save()
  ctx.beginPath()
  ctx.arc(p.cx, p.cy, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.strokeStyle = 'rgba(255, 80, 180, 0.45)'
  ctx.shadowColor = 'rgba(255, 80, 180, 0.55)'
  ctx.shadowBlur = 6
  ctx.lineWidth = Math.max(1.2, r * 0.055)
  ctx.beginPath()
  ctx.ellipse(p.cx, p.cy, r * 0.7, r * 0.36, spin * 0.35, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(0, 230, 210, 0.4)'
  ctx.shadowColor = 'rgba(0, 230, 210, 0.5)'
  ctx.beginPath()
  ctx.ellipse(p.cx, p.cy + r * 0.05, r * 0.52, r * 0.26, spin * 0.35 + 0.8, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  for (let i = 0; i < 3; i++) {
    const ang = -0.55 + i * 0.5
    const hx = p.cx + Math.cos(ang) * r * 0.2 - r * 0.08
    const hy = p.cy + Math.sin(ang) * r * 0.2 - r * 0.25
    ctx.beginPath()
    ctx.arc(hx, hy, Math.max(1.4, r * 0.08), 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.strokeStyle = 'rgba(0, 230, 210, 0.35)'
  ctx.lineWidth = Math.max(1.2, r * 0.05)
  ctx.beginPath()
  ctx.arc(p.cx, p.cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}
