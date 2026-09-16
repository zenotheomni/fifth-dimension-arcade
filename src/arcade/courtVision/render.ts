import { COURT_VISION_PLACEMENT } from '../brandPlacement'
import {
  PALETTE,
  clamp,
  type BallState,
  type HudFlash,
  type Layout,
  type Vec,
} from './constants'

export function drawCrowd(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  ctx.save()
  const baseY = h * 0.38
  for (let side = 0; side < 2; side++) {
    const dir = side === 0 ? 1 : -1
    const originX = side === 0 ? w * 0.04 : w * 0.96
    for (let i = 0; i < 7; i++) {
      const x = originX + dir * (i * w * 0.035 + (i % 2) * 4)
      const y = baseY + (i % 3) * 6
      const s = 10 + (i % 3) * 2
      ctx.fillStyle = i % 2 === 0 ? 'rgba(26,16,40,0.85)' : 'rgba(10,10,12,0.9)'
      ctx.beginPath()
      ctx.ellipse(x, y - s * 1.6, s * 0.55, s * 0.7, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillRect(x - s * 0.45, y - s * 1.1, s * 0.9, s * 1.4)
      ctx.fillStyle = 'rgba(255,90,31,0.35)'
      ctx.fillRect(x - s * 0.2, y - s * 0.4, s * 0.4, s * 0.15)
    }
  }
  ctx.restore()
}

export function drawCourt(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  L: Layout,
  flash: HudFlash,
) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, PALETTE.ink)
  g.addColorStop(0.45, PALETTE.void)
  g.addColorStop(1, '#050508')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  const floorTop = h * 0.42
  ctx.beginPath()
  ctx.moveTo(w * 0.12, h)
  ctx.lineTo(w * 0.28, floorTop)
  ctx.lineTo(w * 0.72, floorTop)
  ctx.lineTo(w * 0.88, h)
  ctx.closePath()
  const fg = ctx.createLinearGradient(0, floorTop, 0, h)
  fg.addColorStop(0, '#16121f')
  fg.addColorStop(1, '#0c0b10')
  ctx.fillStyle = fg
  ctx.fill()

  ctx.save()
  ctx.globalAlpha = COURT_VISION_PLACEMENT.centerCourtOpacity
  ctx.strokeStyle = PALETTE.soft
  ctx.lineWidth = 2
  const ccx = w * 0.5
  const ccy = h * 0.72
  const ccr = Math.min(w, h) * 0.11
  ctx.beginPath()
  ctx.ellipse(ccx, ccy, ccr * 1.2, ccr * 0.55, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.font = `600 ${Math.floor(ccr * 0.55)}px Oswald, Impact, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = PALETTE.soft
  ctx.fillText(COURT_VISION_PLACEMENT.centerCourtMark, ccx, ccy)
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = 0.35
  ctx.fillStyle = PALETTE.muted
  ctx.font = `500 ${Math.max(10, Math.floor(w * 0.028))}px Oswald, Impact, sans-serif`
  ctx.textAlign = 'left'
  ctx.fillText('COURT VISION', w * 0.06, h * 0.48)
  ctx.textAlign = 'right'
  ctx.fillText('ENDLESS', w * 0.94, h * 0.48)
  ctx.globalAlpha = 0.4
  ctx.fillStyle = PALETTE.signal
  ctx.font = `600 ${Math.max(9, Math.floor(w * 0.022))}px Oswald, Impact, sans-serif`
  ctx.textAlign = 'right'
  ctx.fillText(COURT_VISION_PLACEMENT.rimPlateMark, w * 0.94, h * 0.52)
  ctx.restore()

  drawCrowd(ctx, w, h)

  const bb = L.backboard
  // Faint geometry only — COURT_VISION_PLACEMENT.backboardBigLogo must stay false
  void COURT_VISION_PLACEMENT.backboardBigLogo
  ctx.save()
  ctx.fillStyle = 'rgba(242,240,234,0.08)'
  ctx.strokeStyle = 'rgba(242,240,234,0.28)'
  ctx.lineWidth = 1.5
  ctx.fillRect(bb.x, bb.y, bb.w, bb.h)
  ctx.strokeRect(bb.x, bb.y, bb.w, bb.h)
  ctx.strokeStyle = 'rgba(125,255,195,0.18)'
  ctx.strokeRect(bb.x + bb.w * 0.18, bb.y + bb.h * 0.2, bb.w * 0.64, bb.h * 0.55)
  ctx.beginPath()
  ctx.moveTo(bb.x + bb.w * 0.5, bb.y + bb.h * 0.22)
  ctx.lineTo(bb.x + bb.w * 0.72, bb.y + bb.h * 0.48)
  ctx.lineTo(bb.x + bb.w * 0.5, bb.y + bb.h * 0.72)
  ctx.lineTo(bb.x + bb.w * 0.28, bb.y + bb.h * 0.48)
  ctx.closePath()
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = PALETTE.signal
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.ellipse(L.rimCx, L.rimCy, L.rimR, L.rimR * 0.28, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(242,240,234,0.35)'
  ctx.lineWidth = 1
  for (let i = 0; i < 7; i++) {
    const t = i / 6
    const x0 = L.rimCx - L.rimR + t * L.rimR * 2
    ctx.beginPath()
    ctx.moveTo(x0, L.rimCy)
    ctx.quadraticCurveTo(
      L.rimCx + (x0 - L.rimCx) * 0.3,
      L.rimCy + L.rimR * 0.9,
      L.rimCx + (x0 - L.rimCx) * 0.15,
      L.rimCy + L.rimR * 1.35,
    )
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(242,240,234,0.75)'
  ctx.font = `700 ${Math.max(9, Math.floor(L.rimR * 0.28))}px Oswald, Impact, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(COURT_VISION_PLACEMENT.rimPlateMark, L.rimCx, L.rimCy + L.rimR * 0.02)
  ctx.restore()

  if (flash.mint > 0) {
    ctx.save()
    ctx.globalAlpha = clamp(flash.mint, 0, 1) * 0.35
    ctx.fillStyle = PALETTE.mint
    ctx.fillRect(0, 0, w, h)
  }

  // NOTE: incomplete - will fix
}
