import { useFrame } from '@react-three/fiber'
import {
  EffectComposer,
  Bloom,
  Vignette,
} from '@react-three/postprocessing'
import { useCallback, useRef } from 'react'
import * as THREE from 'three'
import { PALETTE } from '../palette'
import { Arena } from './Arena'
import { Ball, type BallApi } from './Ball'
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
  const scored = useRef(false)
  const resolved = useRef(false)
  const fx = useRef({ swish: 0, rim: 0 })

  useFrame(({ camera }, dt) => {
    const base = new THREE.Vector3(0, 2.55, 5.35)
    if (shake > 0 && !reducedMotion) {
      base.x += (Math.random() - 0.5) * 0.07 * shake
      base.y += (Math.random() - 0.5) * 0.045 * shake
    }
    camera.position.lerp(base, 0.2)
    camera.lookAt(0, 1.55, -1.5)

    if (phase === 'aiming' && aimPos && ballApiRef.current) {
      ballApiRef.current.aimTo(aimPos)
    }

    fx.current.swish = Math.max(0, fx.current.swish - dt * 1.8)
    fx.current.rim = Math.max(0, fx.current.rim - dt * 2.2)

    if ((phase === 'idle' || phase === 'aiming') && resolved.current) {
      resolved.current = false
      scored.current = false
    }
  })

  const onMiss = useCallback(() => {
    if (resolved.current || scored.current) return
    resolved.current = true
    signalsRef.current.missed()
  }, [signalsRef])

  return (
    <>
      <color attach="background" args={[PALETTE.void]} />
      <fog attach="fog" args={['#0c0a12', 9, 22]} />

      <Arena mintFlash={mintFlash} fxRef={fx} />
      <Ball
        phase={phase}
        apiRef={ballApiRef}
        onSleepMiss={onMiss}
        onRimHit={() => {
          fx.current.rim = 1
        }}
        onArcScore={(swish, banked5d) => {
          if (resolved.current || scored.current) return
          scored.current = true
          resolved.current = true
          if (swish) fx.current.swish = 1
          signalsRef.current.scored(swish, banked5d)
        }}
      />

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={reducedMotion ? 0.4 : 0.95 + mintFlash * 1.3}
          luminanceThreshold={0.18}
          luminanceSmoothing={0.45}
          mipmapBlur
        />
        <Vignette offset={0.22} darkness={0.55} />
      </EffectComposer>
    </>
  )
}
