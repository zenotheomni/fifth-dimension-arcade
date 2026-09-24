import { useFrame } from '@react-three/fiber'
import {
  EffectComposer,
  Bloom,
  Vignette,
} from '@react-three/postprocessing'
import { Physics } from '@react-three/rapier'
import { useCallback, useRef } from 'react'
import * as THREE from 'three'
import { PALETTE } from '../palette'
import { Arena } from './Arena'
import { Ball, type BallApi } from './Ball'
import { HoopColliders } from './HoopColliders'
import { COURT } from './courtMath'
import type { Phase } from '../courtVision/types'

export type ShotSignals = {
  scored: (swish: boolean, banked5d: boolean) => void
  missed: () => void
}

export function CourtVisionScene({
  phase,
  mintFlash,
  shake,
  reducedMotion,
  ballApiRef,
  signalsRef,
  aimPos,
}: {
  phase: Phase
  mintFlash: number
  shake: number
  reducedMotion: boolean
  ballApiRef: React.MutableRefObject<BallApi | null>
  signalsRef: React.MutableRefObject<ShotSignals>
  aimPos: THREE.Vector3 | null
}) {
  const hitRim = useRef(false)
  const hitBoard = useRef(false)
  const hitLogo = useRef(false)
  const scored = useRef(false)
  const resolved = useRef(false)

  useFrame(({ camera }) => {
    const base = new THREE.Vector3(0, 2.4, 5.2)
    if (shake > 0 && !reducedMotion) {
      base.x += (Math.random() - 0.5) * 0.06 * shake
      base.y += (Math.random() - 0.5) * 0.04 * shake
    }
    camera.position.lerp(base, 0.2)
    camera.lookAt(0, 1.4, -1.2)

    if (phase === 'aiming' && aimPos && ballApiRef.current) {
      ballApiRef.current.aimTo(aimPos)
    }

    // Manual score / miss probe from ball position (more reliable than sensors alone)
    if (phase === 'flight' && ballApiRef.current && !resolved.current) {
      const p = ballApiRef.current.getPosition()
      const rim = COURT.rim
      const dx = p.x - rim.x
      const dz = p.z - rim.z
      const horizontal = Math.hypot(dx, dz)
      // Through the hoop: near rim center, below rim, falling
      if (
        horizontal < COURT.rimRadius * 1.15 &&
        p.y < rim.y + 0.05 &&
        p.y > rim.y - 0.7
      ) {
        scored.current = true
        resolved.current = true
        const swish = !hitRim.current && !hitBoard.current
        signalsRef.current.scored(swish, hitLogo.current)
      }
    }
  })

  const resetFlags = useCallback(() => {
    hitRim.current = false
    hitBoard.current = false
    hitLogo.current = false
    scored.current = false
    resolved.current = false
  }, [])

  useFrame(() => {
    if ((phase === 'idle' || phase === 'aiming') && resolved.current) {
      resetFlags()
    }
  })

  const tryResolveScore = useCallback(() => {
    if (resolved.current || scored.current) return
    if (phase !== 'flight') return
    scored.current = true
    resolved.current = true
    const swish = !hitRim.current && !hitBoard.current
    signalsRef.current.scored(swish, hitLogo.current)
  }, [phase, signalsRef])

  const onMiss = useCallback(() => {
    if (resolved.current || scored.current) return
    resolved.current = true
    signalsRef.current.missed()
  }, [signalsRef])

  return (
    <>
      <color attach="background" args={[PALETTE.void]} />
      <fog attach="fog" args={[PALETTE.void, 10, 24]} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#2a1a3a', '#0a0a0c', 0.55]} />

      <Physics gravity={[0, COURT.gravity, 0]} timeStep="vary">
        <Arena mintFlash={mintFlash} />
        <HoopColliders
          onRim={() => {
            if (phase === 'flight') hitRim.current = true
          }}
          onBackboard={(logo) => {
            if (phase !== 'flight') return
            hitBoard.current = true
            if (logo) hitLogo.current = true
          }}
          onScoreSensor={() => {
            if (phase === 'flight') tryResolveScore()
          }}
        />
        <Ball
          phase={phase}
          apiRef={ballApiRef}
          onSleepMiss={onMiss}
          onArcScore={(swish, banked5d) => {
            if (resolved.current || scored.current) return
            scored.current = true
            resolved.current = true
            signalsRef.current.scored(swish, banked5d)
          }}
        />
      </Physics>

      {/* Always-on rest marker so thumb zone never feels empty before physics wakes */}
      {phase === 'idle' ? (
        <mesh position={[COURT.ballRest.x, COURT.ballRest.y, COURT.ballRest.z]}>
          <sphereGeometry args={[COURT.ballRadius * 1.05, 24, 24]} />
          <meshBasicMaterial color={PALETTE.signal} toneMapped={false} />
        </mesh>
      ) : null}

      <EffectComposer multisampling={0} enabled={!reducedMotion}>
        <Bloom
          intensity={0.85 + mintFlash * 1.1}
          luminanceThreshold={0.22}
          luminanceSmoothing={0.4}
          mipmapBlur
        />
        <Vignette offset={0.28} darkness={0.6} />
      </EffectComposer>
    </>
  )
}
