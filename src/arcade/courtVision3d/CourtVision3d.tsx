import { Canvas } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as THREE from 'three'
import { track } from '../analytics'
import { useArcadeAudio } from '../audio/AudioProvider'
import { END_DOORS } from '../brandPlacement'
import { COPY, COURT_VISION_COPY } from '../copyLocks'
import { postScore } from '../core/scores'
import { getOrCreatePlayerId } from '../core/identity'
import {
  loadPersonalBest,
  savePersonalBest,
  scoreShot,
  streakMultiplier,
  type ShotResult,
} from '../courtVision/scoring'
import {
  playBounce5d,
  playMake,
  playMiss,
  playRelease,
  playSwish,
  unlockAudio,
} from '../courtVision/sfx'
import type { Phase, Toast } from '../courtVision/types'
import { useReducedMotion } from '../useReducedMotion'
import type { BallApi } from './Ball'
import { CourtVisionScene, type ShotSignals } from './CourtVisionScene'
import { COURT, isPerfectRelease, pullToVelocity } from './courtMath'
import './courtVision3d.css'

export default function CourtVision3d() {
  const reducedMotion = useReducedMotion()
  const audio = useArcadeAudio()
  const ballApiRef = useRef<BallApi | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const phaseRef = useRef<Phase>('idle')
  const pullStart = useRef<THREE.Vector3 | null>(null)
  const aiming = useRef(false)
  const perfectRef = useRef(false)
  const scoreRef = useRef(0)
  const streakRef = useRef(0)
  const peakStreak = useRef(0)
  const shotsRef = useRef(0)
  const missesRef = useRef(0)
  const firstMake = useRef(false)
  const announcedX5 = useRef(false)
  const announcedX10 = useRef(false)
  const toastId = useRef(0)
  const resolveLock = useRef(false)
  const aimPosRef = useRef<THREE.Vector3 | null>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [pb, setPb] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [lastShot, setLastShot] = useState<ShotResult | null>(null)
  const [newPb, setNewPb] = useState(false)
  const [started, setStarted] = useState(false)
  const [hint, setHint] = useState('Hold ball · pull aim · release')
  const [mintFlash, setMintFlash] = useState(0)
  const [shake, setShake] = useState(0)
  const [aimPos, setAimPos] = useState<THREE.Vector3 | null>(null)
  const [arcGuide, setArcGuide] = useState<{ power: number; aim: number } | null>(
    null,
  )

  const syncPhase = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  const pushToast = useCallback((text: string, mint?: boolean) => {
    const id = ++toastId.current
    setToasts((t) => [...t.slice(-3), { id, text, mint }])
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, 1800)
  }, [])

  useEffect(() => {
    setPb(loadPersonalBest())
  }, [])

  useEffect(() => {
    if (mintFlash <= 0) return
    const id = requestAnimationFrame(() =>
      setMintFlash((m) => Math.max(0, m - 0.08)),
    )
    return () => cancelAnimationFrame(id)
  }, [mintFlash])

  useEffect(() => {
    if (shake <= 0) return
    const id = window.setTimeout(() => setShake(0), 50)
    return () => clearTimeout(id)
  }, [shake])

  const resetBall = useCallback(() => {
    resolveLock.current = false
    ballApiRef.current?.reset()
    aimPosRef.current = null
    setAimPos(null)
    setArcGuide(null)
    perfectRef.current = false
    syncPhase('idle')
    setHint('Hold ball · pull aim · release')
  }, [syncPhase])

  const endRun = useCallback(async () => {
    if (phaseRef.current === 'ended') return
    syncPhase('ended')
    audio.duck(false)
    const finalScore = scoreRef.current
    const prevPb = pb
    const best = savePersonalBest(finalScore)
    const isNew = finalScore > 0 && finalScore > prevPb
    setPb(best)
    setNewPb(isNew)
    if (isNew) pushToast(COURT_VISION_COPY.NEW_PB, true)
    track('arcade_court_vision_run_end', {
      score: finalScore,
      streak: streakRef.current,
      streakPeak: peakStreak.current,
      shots: shotsRef.current,
      misses: missesRef.current,
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
          streakPeak: peakStreak.current,
          shots: shotsRef.current,
          misses: missesRef.current,
          pb: best,
        },
      })
    } catch {
      /* stub may 501 */
    }
  }, [audio, pb, pushToast, syncPhase])

  const resolveShot = useCallback(
    (kind: 'make' | 'swish' | 'miss', banked5d: boolean) => {
      if (resolveLock.current) return
      resolveLock.current = true
      syncPhase('resolve')
      audio.duck(true)
      window.setTimeout(() => audio.duck(false), 400)

      const result = scoreShot({
        kind,
        streakBefore: streakRef.current,
        perfectRelease: perfectRef.current && kind !== 'miss',
        banked5d: banked5d && kind !== 'miss',
      })
      setLastShot(result)
      shotsRef.current += 1

      if (kind === 'miss') {
        playMiss()
        streakRef.current = 0
        missesRef.current += 1
        setStreak(0)
        pushToast('Miss · multiplier reset')
        track('arcade_court_vision_shot', {
          kind,
          points: 0,
          streak: 0,
          swish: false,
          banked5d: false,
          perfect: false,
        })
        window.setTimeout(() => {
          if (phaseRef.current === 'ended') return
          resetBall()
        }, 650)
        return
      }

      scoreRef.current += result.points
      streakRef.current = result.streakAfter
      peakStreak.current = Math.max(peakStreak.current, result.streakAfter)
      setScore(scoreRef.current)
      setStreak(result.streakAfter)

      if (kind === 'swish') {
        playSwish()
        setMintFlash(1)
        if (!reducedMotion) setShake(3)
      } else {
        playMake()
      }
      if (banked5d) {
        playBounce5d()
        setMintFlash((m) => Math.max(m, 0.85))
        pushToast('5D bounce +2', true)
      }
      if (!firstMake.current) {
        firstMake.current = true
        pushToast(COURT_VISION_COPY.FIRST_MAKE, true)
      }
      if (result.streakAfter === 5 && !announcedX5.current) {
        announcedX5.current = true
        pushToast(COURT_VISION_COPY.STREAK_X5, true)
      }
      if (result.streakAfter === 10 && !announcedX10.current) {
        announcedX10.current = true
        pushToast(COURT_VISION_COPY.STREAK_X10, true)
      }
      if (result.perfectBonus) pushToast('Perfect +1', true)

      track('arcade_court_vision_shot', {
        kind,
        points: result.points,
        streak: result.streakAfter,
        swish: kind === 'swish',
        banked5d,
        perfect: result.perfectBonus > 0,
      })

      window.setTimeout(() => {
        if (phaseRef.current === 'ended') return
        resetBall()
      }, 650)
    },
    [audio, pushToast, reducedMotion, resetBall, syncPhase],
  )

  const signalsRef = useRef<ShotSignals>({
    scored: () => {},
    missed: () => {},
  })
  signalsRef.current = {
    scored: (swish, banked5d) =>
      resolveShot(swish ? 'swish' : 'make', banked5d),
    missed: () => resolveShot('miss', false),
  }

  const clientToCourt = (clientX: number, clientY: number) => {
    const el = wrapRef.current
    if (!el) return new THREE.Vector3(...Object.values(COURT.ballRest))
    const rect = el.getBoundingClientRect()
    const nx = (clientX - rect.left) / rect.width
    const ny = (clientY - rect.top) / rect.height
    // Map screen to thumb-zone plane near ball rest
    const x = (nx - 0.5) * 1.8
    const y = COURT.ballRest.y + (0.78 - ny) * 1.2
    const z = COURT.ballRest.z + (ny - 0.78) * 1.4
    return new THREE.Vector3(
      THREE.MathUtils.clamp(x, -1.2, 1.2),
      Math.max(0.4, y),
      THREE.MathUtils.clamp(z, 1.6, 4.2),
    )
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!started || phaseRef.current === 'ended') return
    if (phaseRef.current !== 'idle') return
    unlockAudio()
    if (!audio.entered) audio.enterFloor()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    aiming.current = true
    const pos = clientToCourt(e.clientX, e.clientY)
    pullStart.current = pos.clone()
    aimPosRef.current = pos
    setAimPos(pos)
    syncPhase('aiming')
    setHint('Pull back · release to shoot')
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!aiming.current || phaseRef.current !== 'aiming') return
    const pos = clientToCourt(e.clientX, e.clientY)
    aimPosRef.current = pos
    setAimPos(pos)
    if (pullStart.current) {
      const pull = {
        x: pos.x - COURT.ballRest.x,
        y: pos.y - COURT.ballRest.y,
        z: pos.z - COURT.ballRest.z,
      }
      const v = pullToVelocity(pull)
      setArcGuide({ power: v.power01, aim: v.aimDeg })
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!aiming.current) return
    aiming.current = false
    const releasePos = aimPosRef.current
    if (phaseRef.current !== 'aiming' || !releasePos) {
      resetBall()
      return
    }
    const pull = {
      x: releasePos.x - COURT.ballRest.x,
      y: releasePos.y - COURT.ballRest.y,
      z: releasePos.z - COURT.ballRest.z,
    }
    const v = pullToVelocity(pull)
    perfectRef.current = isPerfectRelease(v.power01, v.aimDeg)
    playRelease()
    audio.duck(true)
    ballApiRef.current?.shoot(v.vx, v.vy, v.vz)
    aimPosRef.current = null
    setAimPos(null)
    setArcGuide(null)
    syncPhase('flight')
    setHint(perfectRef.current ? 'Perfect release' : 'In flight…')
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
  }

  const startRun = () => {
    unlockAudio()
    if (!audio.entered) audio.enterFloor()
    scoreRef.current = 0
    streakRef.current = 0
    peakStreak.current = 0
    shotsRef.current = 0
    missesRef.current = 0
    firstMake.current = false
    announcedX5.current = false
    announcedX10.current = false
    setScore(0)
    setStreak(0)
    setNewPb(false)
    setLastShot(null)
    setStarted(true)
    resetBall()
    track('arcade_court_vision_run_start', { mode: 'endless' })
  }

  const mult = streakMultiplier(streak)

  return (
    <div className="cv3d-root">
      <div className="cv3d-hud" aria-live="polite">
        <div className="cv3d-hud__left">
          <Link to="/" className="cv3d-hud__back">
            ← Floor
          </Link>
          {started && phase !== 'ended' ? (
            <button type="button" className="cv3d-hud__end" onClick={() => void endRun()}>
              End run
            </button>
          ) : (
            <span className="cv3d-hud__mode">Endless</span>
          )}
        </div>
        <div className="cv3d-hud__scoreblock">
          <span className="cv3d-hud__score">{score}</span>
          <span className="cv3d-hud__meta">
            x{streak || 0}
            {mult > 1 ? ` · ${mult}x` : ''}
          </span>
        </div>
        <div className="cv3d-hud__right">
          <button
            type="button"
            className="cv3d-hud__mute"
            aria-label={audio.muted ? 'Unmute' : 'Mute'}
            onClick={audio.toggleMute}
          >
            {audio.muted ? '🔇' : '🔊'}
          </button>
          <div className="cv3d-hud__pb">PB {pb}</div>
        </div>
      </div>

      <div
        className="cv3d-stage"
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={
          mintFlash > 0.2
            ? { boxShadow: `inset 0 0 ${60 * mintFlash}px rgba(125,255,195,0.35)` }
            : undefined
        }
      >
        <Canvas
          dpr={[1, 1.75]}
          gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
          camera={{ position: [0, 2.55, 5.35], fov: 42, near: 0.1, far: 50 }}
          style={{ touchAction: 'none' }}
        >
          <Suspense fallback={null}>
            <CourtVisionScene
              phase={phase}
              mintFlash={mintFlash}
              shake={shake}
              reducedMotion={reducedMotion}
              ballApiRef={ballApiRef}
              signalsRef={signalsRef}
              aimPos={aimPos}
            />
          </Suspense>
        </Canvas>

        {arcGuide ? (
          <div
            className="cv3d-arc"
            style={{
              opacity: 0.35 + arcGuide.power * 0.5,
              transform: `translateX(${arcGuide.aim * 1.2}px) scaleY(${0.6 + arcGuide.power})`,
            }}
          />
        ) : null}

        <div className="cv3d-toasts" aria-live="polite">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={t.mint ? 'cv3d-toast cv3d-toast--mint' : 'cv3d-toast'}
            >
              {t.text}
            </div>
          ))}
        </div>

        {!started ? (
          <div className="cv3d-overlay">
            <p className="arcade-ticket">Court Vision</p>
            <h1 className="cv3d-overlay__title">Endless</h1>
            <p className="cv3d-overlay__copy">
              Hold the ball, pull to aim and power, release. Misses reset your
              multiplier. End the run whenever you&apos;re ready.
            </p>
            <button type="button" className="arcade-soft-cta" onClick={startRun}>
              Run it
            </button>
            <p className="cv3d-overlay__whisper">{COPY.FLOW_STATE}</p>
          </div>
        ) : null}

        {phase === 'ended' ? (
          <div className="cv3d-overlay cv3d-overlay--end">
            <p className="arcade-ticket">Run complete</p>
            <h1 className="cv3d-overlay__title">{score}</h1>
            {newPb ? (
              <p className="cv3d-overlay__whisper">{COURT_VISION_COPY.NEW_PB}</p>
            ) : (
              <p className="cv3d-overlay__copy">
                {lastShot?.kind === 'miss'
                  ? COPY.ALMOST_REARRANGE
                  : COPY.RUN_IT_BACK}
              </p>
            )}
            <div className="cv3d-end-doors">
              {END_DOORS.courtVision.map((door) =>
                door.id === 'challenge' ? (
                  <Link
                    key={door.id}
                    to="/challenge/new"
                    className="arcade-soft-cta"
                    onClick={() =>
                      track('arcade_court_vision_end_door', { door: door.id })
                    }
                  >
                    {door.label}
                  </Link>
                ) : (
                  <button
                    key={door.id}
                    type="button"
                    className="arcade-soft-cta"
                    onClick={() => {
                      track('arcade_court_vision_end_door', { door: door.id })
                      track('arcade_dock_tap', { dock: 'boutique' })
                    }}
                  >
                    {door.label}
                  </button>
                ),
              )}
              <button
                type="button"
                className="arcade-soft-cta arcade-soft-cta--ghost"
                onClick={startRun}
              >
                {COPY.RUN_IT_BACK}
              </button>
              <Link to="/" className="arcade-back">
                ← Back to The Fifth Floor
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      {started && phase !== 'ended' ? (
        <p className="cv3d-hint">{hint}</p>
      ) : null}
    </div>
  )
}
