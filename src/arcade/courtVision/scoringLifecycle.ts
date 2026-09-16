import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { track } from '../analytics'
import { COURT_VISION_COPY } from '../copyLocks'
import { postScore } from '../core/scores'
import { getOrCreatePlayerId } from '../core/identity'
import {
  savePersonalBest,
  scoreShot,
  type ShotResult,
} from './scoring'
import {
  playBounce5d,
  playMake,
  playMiss,
  playSwish,
} from './sfx'
import type { BallState, HudFlash, Layout, Vec } from './constants'
import type { Phase } from './types'

export type LifecycleDeps = {
  phaseRef: MutableRefObject<Phase>
  ballRef: MutableRefObject<BallState | null>
  layoutRef: MutableRefObject<Layout | null>
  pullRef: MutableRefObject<Vec | null>
  restRef: MutableRefObject<Vec>
  perfectReleaseRef: MutableRefObject<boolean>
  scoreRef: MutableRefObject<number>
  streakRef: MutableRefObject<number>
  flashRef: MutableRefObject<HudFlash>
  firstMakeRef: MutableRefObject<boolean>
  announcedX5: MutableRefObject<boolean>
  announcedX10: MutableRefObject<boolean>
  pb: number
  syncPhase: (p: Phase) => void
  setHint: (h: string) => void
  setScore: Dispatch<SetStateAction<number>>
  setStreak: Dispatch<SetStateAction<number>>
  setPb: Dispatch<SetStateAction<number>>
  setNewPb: Dispatch<SetStateAction<boolean>>
  setLastShot: Dispatch<SetStateAction<ShotResult | null>>
  pushToast: (text: string, mint?: boolean) => void
}

export function makeLifecycle(d: LifecycleDeps) {
  const resetBall = () => {
    const L = d.layoutRef.current
    if (!L) return
    d.restRef.current = { ...L.rest }
    d.ballRef.current = {
      pos: { ...L.rest },
      vel: { x: 0, y: 0 },
      radius: L.ballR,
      spinning: 0,
      nudged: false,
      hitRim: false,
      hitBackboard: false,
      hitLogoZone: false,
      scored: false,
      throughNet: false,
    }
    d.pullRef.current = null
    d.perfectReleaseRef.current = false
    d.syncPhase('idle')
    d.setHint('Hold ball · pull aim · release')
  }

  const endRun = async (finalScore: number) => {
    d.syncPhase('ended')
    const prevPb = d.pb
    const best = savePersonalBest(finalScore)
    const isNew = finalScore > 0 && finalScore > prevPb
    d.setPb(best)
    d.setNewPb(isNew)
    if (isNew) d.pushToast(COURT_VISION_COPY.NEW_PB, true)
    track('arcade_court_vision_run_end', {
      score: finalScore,
      streak: d.streakRef.current,
      pb: best,
      newPb: isNew,
    })
    try {
      await postScore({
        game: 'court-vision',
        mode: 'endless',
        score: finalScore,
        meta: {
          playerId: getOrCreatePlayerId(),
          streakPeak: d.streakRef.current,
          pb: best,
        },
      })
    } catch {
      /* stub may 501 */
    }
  }

  const resolveShot = (
    kind: 'make' | 'swish' | 'miss',
    banked5d: boolean,
  ) => {
    const result = scoreShot({
      kind,
      streakBefore: d.streakRef.current,
      perfectRelease: d.perfectReleaseRef.current && kind !== 'miss',
      banked5d: banked5d && kind !== 'miss',
    })
    d.setLastShot(result)

    if (kind === 'miss') {
      playMiss()
      d.streakRef.current = 0
      d.setStreak(0)
      d.pushToast('Miss — run over')
      void endRun(d.scoreRef.current)
      return
    }

    d.scoreRef.current += result.points
    d.streakRef.current = result.streakAfter
    d.setScore(d.scoreRef.current)
    d.setStreak(result.streakAfter)

    if (kind === 'swish') {
      playSwish()
      d.flashRef.current.mint = 1
      d.flashRef.current.shake = 3
    } else {
      playMake()
    }
    if (banked5d) {
      playBounce5d()
      d.flashRef.current.mint = Math.max(d.flashRef.current.mint, 0.85)
      d.pushToast('5D bounce', true)
    }

    if (!d.firstMakeRef.current) {
      d.firstMakeRef.current = true
      d.pushToast(COURT_VISION_COPY.FIRST_MAKE, true)
    }
    if (result.streakAfter === 5 && !d.announcedX5.current) {
      d.announcedX5.current = true
      d.pushToast(COURT_VISION_COPY.STREAK_X5, true)
    }
    if (result.streakAfter === 10 && !d.announcedX10.current) {
      d.announcedX10.current = true
      d.pushToast(COURT_VISION_COPY.STREAK_X10, true)
    }
    if (result.perfectBonus) d.pushToast('Perfect +1', true)

    track('arcade_court_vision_shot', {
      kind,
      points: result.points,
      streak: result.streakAfter,
      swish: kind === 'swish',
      banked5d,
      perfect: result.perfectBonus > 0,
    })

    window.setTimeout(() => {
      if (d.phaseRef.current === 'ended') return
      resetBall()
    }, 650)
  }

  return { resetBall, endRun, resolveShot }
}
