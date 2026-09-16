import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { track } from '../analytics'
import {
  loadPersonalBest,
  streakMultiplier,
  type ShotResult,
} from './scoring'
import { unlockAudio } from './sfx'
import {
  type BallState,
  type HudFlash,
  type Layout,
  type Vec,
} from './constants'
import { attachCourtVisionLoop } from './attachCourtVisionLoop'
import { makePointerHandlers } from './courtVisionPointers'
import { makeLifecycle } from './scoringLifecycle'
import type { Phase, Toast } from './types'

export function useCourtVisionGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const phaseRef = useRef<Phase>('idle')
  const ballRef = useRef<BallState | null>(null)
  const layoutRef = useRef<Layout | null>(null)
  const pullRef = useRef<Vec | null>(null)
  const restRef = useRef<Vec>({ x: 0, y: 0 })
  const perfectReleaseRef = useRef(false)
  const scoreRef = useRef(0)
  const streakRef = useRef(0)
  const peakStreakRef = useRef(0)
  const shotsRef = useRef(0)
  const missesRef = useRef(0)
  const flashRef = useRef<HudFlash>({ mint: 0, shake: 0 })
  const toastIdRef = useRef(0)
  const firstMakeRef = useRef(false)
  const announcedX5 = useRef(false)
  const announcedX10 = useRef(false)
  const rafRef = useRef(0)
  const sizeRef = useRef({ w: 360, h: 640 })
  const pointerIdRef = useRef<number | null>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [pb, setPb] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [lastShot, setLastShot] = useState<ShotResult | null>(null)
  const [newPb, setNewPb] = useState(false)
  const [hint, setHint] = useState('Hold ball · pull aim · release')
  const [started, setStarted] = useState(false)

  const pushToast = useCallback((text: string, mint?: boolean) => {
    const id = ++toastIdRef.current
    setToasts((t) => [...t.slice(-3), { id, text, mint }])
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, 1800)
  }, [])

  const syncPhase = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  const { resetBall, resolveShot, endRun } = useMemo(() => makeLifecycle({
    phaseRef,
    ballRef,
    layoutRef,
    pullRef,
    restRef,
    perfectReleaseRef,
    scoreRef,
    streakRef,
    peakStreakRef,
    shotsRef,
    missesRef,
    flashRef,
    firstMakeRef,
    announcedX5,
    announcedX10,
    pb,
    syncPhase,
    setHint,
    setScore,
    setStreak,
    setPb,
    setNewPb,
    setLastShot,
    pushToast,
  }), [pb, pushToast, syncPhase])

  useEffect(() => {
    return attachCourtVisionLoop({
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
    })
  }, [resetBall, resolveShot, syncPhase])

  useEffect(() => {
    setPb(loadPersonalBest())
    track('arcade_court_vision_endless_view')
  }, [])

  const startRun = () => {
    unlockAudio()
    scoreRef.current = 0
    streakRef.current = 0
    peakStreakRef.current = 0
    shotsRef.current = 0
    missesRef.current = 0
    firstMakeRef.current = false
    announcedX5.current = false
    announcedX10.current = false
    setScore(0)
    setStreak(0)
    setLastShot(null)
    setNewPb(false)
    setStarted(true)
    resetBall()
    track('arcade_court_vision_run_start', { mode: 'endless' })
  }

  const { onPointerDown, onPointerMove, onPointerUp } = makePointerHandlers({
    phaseRef,
    ballRef,
    pullRef,
    restRef,
    perfectReleaseRef,
    pointerIdRef,
    canvasRef,
    started,
    syncPhase,
    setHint,
  })

  return {
    canvasRef: canvasRef as RefObject<HTMLCanvasElement>,
    wrapRef: wrapRef as RefObject<HTMLDivElement>,
    phase,
    score,
    streak,
    pb,
    toasts,
    lastShot,
    newPb,
    hint,
    started,
    mult: streakMultiplier(streak),
    startRun,
    endRun: () => void endRun(scoreRef.current),
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
