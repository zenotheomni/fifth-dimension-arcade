import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { PALETTE } from '../palette'
import { makeBasketballTextures } from './ballTexture'
import { COURT } from './courtMath'
import type { Phase } from '../courtVision/types'

export type BallApi = {
  aimTo: (pos: THREE.Vector3) => void
  shoot: (vx: number, vy: number, vz: number) => void
  reset: () => void
  getPosition: () => THREE.Vector3
  getAccuracy: () => number
}

export function Ball({
  phase,
  apiRef,
  onSleepMiss,
  onArcScore,
  onRimHit,
}: {
  phase: Phase
  apiRef: React.MutableRefObject<BallApi | null>
  onSleepMiss: () => void
  onArcScore: (swish: boolean, banked5d: boolean) => void
  onRimHit: () => void
}) {
  const group = useRef<THREE.Group>(null)
  const ballMesh = useRef<THREE.Mesh>(null)
  const shadow = useRef<THREE.Mesh>(null)
  const trail = useRef<THREE.Points>(null)
  const trailPos = useMemo(() => new Float32Array(28 * 3), [])
  const trailIdx = useRef(0)
  const spin = useRef(0)
  const squash = useRef(1)
  const missSent = useRef(false)
  const scoreSent = useRef(false)
  const accuracy = useRef(0.7)
  const banked = useRef(false)
  const rimHitSent = useRef(false)
  const pos = useRef(
    new THREE.Vector3(COURT.ballRest.x, COURT.ballRest.y, COURT.ballRest.z),
  )
  const vel = useRef(new THREE.Vector3())
  const flying = useRef(false)
  const flightStart = useRef(0)
  const textures = useMemo(() => {
    try {
      return makeBasketballTextures()
    } catch {
      return { map: null, bumpMap: null }
    }
  }, [])

  useEffect(() => {
    apiRef.current = {
      aimTo: (p) => {
        flying.current = false
        pos.current.copy(p)
        squash.current = 1
      },
      shoot: (vx, vy, vz) => {
        missSent.current = false
        scoreSent.current = false
        banked.current = false
        rimHitSent.current = false
        flying.current = true
        flightStart.current = performance.now()
        vel.current.set(vx, vy, vz)
        spin.current = 14
        squash.current = 1
        const toRim = new THREE.Vector3(
          COURT.rim.x - pos.current.x,
          COURT.rim.y + 0.2 - pos.current.y,
          COURT.rim.z - pos.current.z,
        ).normalize()
        const dir = vel.current.clone().normalize()
        accuracy.current = THREE.MathUtils.clamp(
          (dir.dot(toRim) - 0.55) / 0.45,
          0,
          1,
        )
      },
      reset: () => {
        missSent.current = false
        scoreSent.current = false
        flying.current = false
        spin.current = 0
        squash.current = 1
        vel.current.set(0, 0, 0)
        pos.current.set(COURT.ballRest.x, COURT.ballRest.y, COURT.ballRest.z)
      },
      getPosition: () => pos.current.clone(),
      getAccuracy: () => accuracy.current,
    }
  }, [apiRef])

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05)
    if (flying.current) {
      vel.current.y += COURT.gravity * step
      pos.current.x += vel.current.x * step
      pos.current.y += vel.current.y * step
      pos.current.z += vel.current.z * step

      const rim = COURT.rim
      const dx = pos.current.x - rim.x
      const dz = pos.current.z - rim.z
      const horiz = Math.hypot(dx, dz)

      if (
        !scoreSent.current &&
        Math.abs(pos.current.y - rim.y) < 0.18 &&
        horiz > COURT.rimRadius * 0.75 &&
        horiz < COURT.rimRadius * 1.25 &&
        vel.current.y < 0
      ) {
        vel.current.x *= -0.35
        vel.current.z *= -0.25
        vel.current.y = Math.abs(vel.current.y) * 0.35
        accuracy.current *= 0.55
        squash.current = 0.72
        if (!rimHitSent.current) {
          rimHitSent.current = true
          onRimHit()
        }
      }

      const bb = COURT.backboard
      if (
        pos.current.z < bb.z + 0.08 &&
        pos.current.z > bb.z - 0.2 &&
        Math.abs(pos.current.x - bb.x) < bb.w / 2 &&
        Math.abs(pos.current.y - bb.y) < bb.h / 2 &&
        vel.current.z < 0
      ) {
        vel.current.z *= -0.55
        squash.current = 0.78
        banked.current =
          pos.current.y >= COURT.logoZone.yMin &&
          pos.current.y <= COURT.logoZone.yMax &&
          Math.abs(pos.current.x) <= COURT.logoZone.xAbs
        if (banked.current) accuracy.current = Math.max(accuracy.current, 0.55)
      }

      // Floor bounce squash
      if (pos.current.y < COURT.ballRadius && vel.current.y < 0) {
        pos.current.y = COURT.ballRadius
        vel.current.y *= -0.22
        vel.current.x *= 0.55
        vel.current.z *= 0.55
        squash.current = 0.65
        if (Math.abs(vel.current.y) < 0.8) vel.current.y = 0
      }

      if (
        !scoreSent.current &&
        horiz < COURT.rimRadius * 1.15 &&
        pos.current.y < rim.y &&
        pos.current.y > rim.y - 0.65 &&
        vel.current.y < 0
      ) {
        scoreSent.current = true
        flying.current = false
        const swish = accuracy.current > 0.72 && !banked.current
        onArcScore(swish, banked.current)
      }

      const elapsed = performance.now() - flightStart.current
      const speed = vel.current.length()
      if (!scoreSent.current && !missSent.current) {
        if (
          pos.current.y <= COURT.ballRadius + 0.05 &&
          speed < 1.2 &&
          elapsed > 700
        ) {
          missSent.current = true
          flying.current = false
          onSleepMiss()
        } else if (elapsed > 2600) {
          missSent.current = true
          flying.current = false
          onSleepMiss()
        }
      }

      const i = (trailIdx.current++ % 28) * 3
      trailPos[i] = pos.current.x
      trailPos[i + 1] = pos.current.y
      trailPos[i + 2] = pos.current.z
      if (trail.current?.geometry.attributes.position) {
        trail.current.geometry.attributes.position.needsUpdate = true
      }
    }

    squash.current = THREE.MathUtils.damp(squash.current, 1, 8, step)

    if (group.current) {
      group.current.position.copy(pos.current)
      const sq = squash.current
      group.current.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq))
    }
    if (ballMesh.current) {
      ballMesh.current.rotation.x += spin.current * 0.045
      ballMesh.current.rotation.z += spin.current * 0.028
    }
    if (shadow.current) {
      shadow.current.position.set(pos.current.x, 0.02, pos.current.z)
      const s = THREE.MathUtils.clamp(
        0.42 / Math.max(pos.current.y, 0.25),
        0.4,
        1.35,
      )
      shadow.current.scale.setScalar(s)
      ;(shadow.current.material as THREE.MeshBasicMaterial).opacity =
        0.55 * THREE.MathUtils.clamp(1.2 / Math.max(pos.current.y, 0.4), 0.25, 1)
    }
  })

  return (
    <>
      <group
        ref={group}
        position={[COURT.ballRest.x, COURT.ballRest.y, COURT.ballRest.z]}
      >
        <mesh ref={ballMesh} castShadow>
          <sphereGeometry args={[COURT.ballRadius, 36, 36]} />
          <meshStandardMaterial
            map={textures.map ?? undefined}
            bumpMap={textures.bumpMap ?? undefined}
            bumpScale={0.04}
            roughness={0.48}
            metalness={0.1}
            color="#FF5A1F"
            emissive="#FF5A1F"
            emissiveIntensity={0.12}
          />
        </mesh>
      </group>

      <mesh
        ref={shadow}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[COURT.ballRest.x, 0.02, COURT.ballRest.z]}
      >
        <circleGeometry args={[0.28, 24]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>

      <points ref={trail}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[trailPos, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.08}
          color={PALETTE.mint}
          transparent
          opacity={phase === 'flight' ? 0.75 : 0}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </>
  )
}
