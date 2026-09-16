import {
  GRAVITY,
  MAX_PULL,
  MIN_POWER,
  PERFECT_AIM_DEG,
  PERFECT_POWER_MAX,
  PERFECT_POWER_MIN,
  clamp,
  dist,
  layout,
  type BallState,
  type HudFlash,
  type Layout,
  type Vec,
} from './constants'
import { drawAim, drawBall, drawCourt } from './render'
import type { Phase } from './types'

export type CourtVisionLoopRefs = {
  canvasRef: { current: HTMLCanvasElement | null }
  wrapRef: { current: HTMLDivElement | null }
  phaseRef: { current: Phase }
  ballRef: { current: BallState | null }
  layoutRef: { current: Layout | null }
  pullRef: { current: Vec | null }
  restRef: { current: Vec }
  flashRef: { current: HudFlash }
  sizeRef: { current: { w: number; h: number } }
  rafRef: { current: number }
  resetBall: () => void
  resolveShot: (kind: 'make' | 'swish' | 'miss', banked5d: boolean) => void
  syncPhase: (p: Phase) => void
}

/** Canvas resize + rAF game loop. Returns cleanup. */
export function attachCourtVisionLoop(deps: CourtVisionLoopRefs): () => void {
  const {
    canvasRef,
    wrapRef,
    phaseRef,
    ballRef,
    layoutRef,
    pullRef,
    restRef,
    flashRef,
    sizeRef,
    rafRef,
    resetBall,
    resolveShot,
    syncPhase,
  } = deps

  const canvas = canvasRef.current
  const wrap = wrapRef.current
  if (!canvas || !wrap) return () => undefined

  const resize = () => {
    const rect = wrap.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(280, Math.floor(rect.width))
    const h = Math.max(420, Math.floor(rect.height))
    sizeRef.current = { w, h }
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    layoutRef.current = layout(w, h)
    if (!ballRef.current || phaseRef.current === 'idle') resetBall()
  }

  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(wrap)

  const tick = () => {
    const ctx = canvas.getContext('2d')
    const L = layoutRef.current
    const { w, h } = sizeRef.current
    if (!ctx || !L) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    const flash = flashRef.current
    if (flash.mint > 0) flash.mint = Math.max(0, flash.mint - 0.06)
    if (flash.shake > 0) flash.shake -= 1

    ctx.save()
    if (flash.shake > 0) {
      ctx.translate((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5)
    }

    drawCourt(ctx, w, h, L, flash)

    const ball = ballRef.current
    const phaseNow = phaseRef.current

    if (phaseNow === 'aiming' && pullRef.current && ball) {
      const pull = pullRef.current
      const pullDist = clamp(dist(pull, restRef.current), 0, MAX_PULL)
      const power = pullDist / MAX_PULL
      const dx = restRef.current.x - pull.x
      const dy = restRef.current.y - pull.y
      const ang = Math.atan2(dx, -dy)
      const aimPerfect = Math.abs(ang) < (PERFECT_AIM_DEG * Math.PI) / 180
      const perfect =
        power >= PERFECT_POWER_MIN &&
        power <= PERFECT_POWER_MAX &&
        aimPerfect
      drawAim(ctx, restRef.current, pull, Math.max(power, MIN_POWER), perfect)
    }

    if (ball && phaseNow === 'flight') {
      ball.vel.y += GRAVITY
      ball.pos.x += ball.vel.x
      ball.pos.y += ball.vel.y
      ball.spinning += ball.vel.x * 0.04

      const bb = L.backboard
      if (
        ball.pos.y - ball.radius < bb.y + bb.h &&
        ball.pos.y + ball.radius > bb.y &&
        ball.pos.x > bb.x &&
        ball.pos.x < bb.x + bb.w &&
        ball.vel.y < 0
      ) {
        const nearFace = ball.pos.y - ball.radius <= bb.y + bb.h * 0.85
        if (nearFace && ball.pos.y < bb.y + bb.h) {
          const lz = L.logoZone
          if (
            ball.pos.x > lz.x &&
            ball.pos.x < lz.x + lz.w &&
            ball.pos.y > lz.y &&
            ball.pos.y < lz.y + lz.h
          ) {
            ball.hitLogoZone = true
          }
          ball.hitBackboard = true
          ball.vel.y *= -0.55
          ball.vel.x *= 0.85
          ball.pos.y = bb.y + bb.h + ball.radius + 1
        }
      }

      const rimPoints = [
        { x: L.rimCx - L.rimR * 0.92, y: L.rimCy },
        { x: L.rimCx + L.rimR * 0.92, y: L.rimCy },
      ]
      for (const rp of rimPoints) {
        const d = dist(ball.pos, rp)
        const minD = ball.radius + 4
        if (d < minD && d > 0.001) {
          ball.hitRim = true
          const nx = (ball.pos.x - rp.x) / d
          const ny = (ball.pos.y - rp.y) / d
          const dot = ball.vel.x * nx + ball.vel.y * ny
          if (dot < 0) {
            ball.vel.x -= 1.6 * dot * nx
            ball.vel.y -= 1.6 * dot * ny
            ball.vel.x *= 0.9
            ball.vel.y *= 0.9
          }
          ball.pos.x = rp.x + nx * minD
          ball.pos.y = rp.y + ny * minD
        }
      }

      const inRimX = Math.abs(ball.pos.x - L.rimCx) < L.rimR * 0.72
      const crossingNet =
        ball.pos.y > L.rimCy &&
        ball.pos.y < L.rimCy + L.rimR * 0.85 &&
        ball.vel.y > 0 &&
        inRimX

      if (crossingNet && !ball.scored) {
        ball.scored = true
        ball.throughNet = true
        syncPhase('resolve')
        const swish = !ball.hitRim && !ball.hitBackboard
        const banked5d = ball.hitLogoZone && ball.hitBackboard
        const kind = swish ? 'swish' : 'make'
        window.setTimeout(() => resolveShot(kind, banked5d), 40)
      }

      if (
        !ball.scored &&
        (ball.pos.y > h + 40 ||
          ball.pos.x < -60 ||
          ball.pos.x > w + 60 ||
          (ball.pos.y > h * 0.92 &&
            Math.abs(ball.vel.y) < 0.8 &&
            ball.vel.y >= 0))
      ) {
        syncPhase('resolve')
        window.setTimeout(() => resolveShot('miss', false), 40)
      }
    }

    if (ball) drawBall(ctx, ball)

    if (phaseNow === 'idle' && ball) {
      ctx.save()
      ctx.strokeStyle = 'rgba(242,240,234,0.12)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(
        L.rest.x,
        L.rest.y,
        L.ballR * 2.2,
        L.ballR * 1.2,
        0,
        0,
        Math.PI * 2,
      )
      ctx.stroke()
      ctx.restore()
    }

    ctx.restore()
    rafRef.current = requestAnimationFrame(tick)
  }

  rafRef.current = requestAnimationFrame(tick)
  return () => {
    ro.disconnect()
    cancelAnimationFrame(rafRef.current)
  }
}
