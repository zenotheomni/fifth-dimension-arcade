import type { PointerEvent as ReactPointerEvent, MutableRefObject } from 'react'
import { track } from '../analytics'
import {
  MAX_PULL,
  MIN_POWER,
  NUDGE_IMPULSE,
  PERFECT_AIM_DEG,
  PERFECT_POWER_MAX,
  PERFECT_POWER_MIN,
  clamp,
  dist,
  type BallState,
  type Vec,
} from './constants'
import { playRelease, unlockAudio } from './sfx'
import type { Phase } from './types'

export type PointerDeps = {
  phaseRef: MutableRefObject<Phase>
  ballRef: MutableRefObject<BallState | null>
  pullRef: MutableRefObject<Vec | null>
  restRef: MutableRefObject<Vec>
  perfectReleaseRef: MutableRefObject<boolean>
  pointerIdRef: MutableRefObject<number | null>
  canvasRef: MutableRefObject<HTMLCanvasElement | null>
  started: boolean
  syncPhase: (p: Phase) => void
  setHint: (h: string) => void
}

export function makePointerHandlers(d: PointerDeps) {
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (d.phaseRef.current === 'ended' || !d.started) return
    unlockAudio()
    const canvas = d.canvasRef.current
    const ball = d.ballRef.current
    if (!canvas || !ball) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (d.phaseRef.current === 'flight') {
      if (!ball.nudged) {
        ball.nudged = true
        const dx = x - ball.pos.x
        ball.vel.x += clamp(dx / 40, -NUDGE_IMPULSE, NUDGE_IMPULSE)
        ball.vel.y -= 0.6
        d.setHint('Nudge used')
        track('arcade_court_vision_nudge')
      }
      return
    }

    if (d.phaseRef.current !== 'idle') return
    if (dist({ x, y }, ball.pos) > ball.radius * 3.2) return

    d.pointerIdRef.current = e.pointerId
    canvas.setPointerCapture(e.pointerId)
    d.pullRef.current = { x, y }
    d.syncPhase('aiming')
    d.setHint('Aim · power · release')
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (d.phaseRef.current !== 'aiming') return
    if (d.pointerIdRef.current !== e.pointerId) return
    const canvas = d.canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    let x = e.clientX - rect.left
    let y = e.clientY - rect.top
    const rest = d.restRef.current
    const dd = dist({ x, y }, rest)
    if (dd > MAX_PULL) {
      const s = MAX_PULL / dd
      x = rest.x + (x - rest.x) * s
      y = rest.y + (y - rest.y) * s
    }
    if (y < rest.y - 10) y = rest.y - 10
    d.pullRef.current = { x, y }
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (d.phaseRef.current !== 'aiming') return
    if (
      d.pointerIdRef.current !== null &&
      d.pointerIdRef.current !== e.pointerId
    )
      return
    const ball = d.ballRef.current
    const pull = d.pullRef.current
    if (!ball || !pull) {
      d.syncPhase('idle')
      return
    }

    const rest = d.restRef.current
    const pullDist = clamp(dist(pull, rest), 0, MAX_PULL)
    const power = Math.max(pullDist / MAX_PULL, MIN_POWER)
    const dx = rest.x - pull.x
    const dy = rest.y - pull.y
    const len = Math.hypot(dx, dy) || 1
    const nx = dx / len
    const ny = dy / len
    const speed = 8.5 + power * 14.5
    ball.vel.x = nx * speed
    ball.vel.y = Math.min(ny * speed, -speed * 0.55)
    ball.pos = { ...rest }

    const ang = Math.atan2(nx, -ny)
    const aimPerfect = Math.abs(ang) < (PERFECT_AIM_DEG * Math.PI) / 180
    d.perfectReleaseRef.current =
      power >= PERFECT_POWER_MIN &&
      power <= PERFECT_POWER_MAX &&
      aimPerfect

    d.pullRef.current = null
    d.pointerIdRef.current = null
    playRelease()
    d.syncPhase('flight')
    d.setHint(ball.nudged ? '' : 'Tap to nudge once')
  }

  return { onPointerDown, onPointerMove, onPointerUp }
}
