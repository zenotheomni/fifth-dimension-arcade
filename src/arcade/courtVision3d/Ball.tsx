import { useFrame } from '@react-three/fiber'
import {
  RapierRigidBody,
  RigidBody,
  BallCollider,
} from '@react-three/rapier'
import { RigidBodyType } from '@dimforge/rapier3d-compat'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { PALETTE, PALETTE_HEX } from '../palette'
import { COURT } from './courtMath'
import type { Phase } from '../courtVision/types'

export type BallApi = {
  aimTo: (pos: THREE.Vector3) => void
  shoot: (vx: number, vy: number, vz: number) => void
  reset: () => void
  getPosition: () => THREE.Vector3
  /** Peak horizontal accuracy 0..1 for scoring assist readouts */
  getAccuracy: () => number
}

export function Ball({
  phase,
  apiRef,
  onSleepMiss,
  onArcScore,
}: {
  phase: Phase
  apiRef: React.MutableRefObject<BallApi | null>
  onSleepMiss: () => void
  /** Called once when arcade arc reaches rim window */
  onArcScore: (swish: boolean, banked5d: boolean) => void
}) {
  const body = useRef<RapierRigidBody>(null)
  const group = useRef<THREE.Group>(null)
  const ballMesh = useRef<THREE.Mesh>(null)
  const shadow = useRef<THREE.Mesh>(null)
  const trail = useRef<THREE.Points>(null)
  const trailPos = useMemo(() => new Float32Array(20 * 3), [])
  const trailIdx = useRef(0)
  const spin = useRef(0)
  const missSent = useRef(false)
  const scoreSent = useRef(false)
  const accuracy = useRef(0.7)
  const banked = useRef(false)
  const pos = useRef(
    new THREE.Vector3(COURT.ballRest.x, COURT.ballRest.y, COURT.ballRest.z),
  )
  const vel = useRef(new THREE.Vector3())
  const flying = useRef(false)
  const flightStart = useRef(0)

  useEffect(() => {
    apiRef.current = {
      aimTo: (p) => {
        flying.current = false
        const b = body.current
        if (b) {
          b.setBodyType(RigidBodyType.KinematicPositionBased, true)
          b.setTranslation({ x: p.x, y: p.y, z: p.z }, true)
        }
        pos.current.copy(p)
      },
      shoot: (vx, vy, vz) => {
        missSent.current = false
        scoreSent.current = false
        banked.current = false
        flying.current = true
        flightStart.current = performance.now()
        vel.current.set(vx, vy, vz)
        spin.current = 10
        // Accuracy from how well velocity points at rim apex
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
        const b = body.current
        if (b) {
          b.setBodyType(RigidBodyType.KinematicPositionBased, true)
        }
      },
      reset: () => {
        missSent.current = false
        scoreSent.current = false
        flying.current = false
        spin.current = 0
        vel.current.set(0, 0, 0)
        pos.current.set(COURT.ballRest.x, COURT.ballRest.y, COURT.ballRest.z)
        const b = body.current
        if (b) {
          b.setBodyType(RigidBodyType.KinematicPositionBased, true)
          b.setLinvel({ x: 0, y: 0, z: 0 }, true)
          b.setTranslation({ ...COURT.ballRest }, true)
        }
      },
      getPosition: () => pos.current.clone(),
      getAccuracy: () => accuracy.current,
    }
  }, [apiRef])

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05)
    if (flying.current) {
      // Kinematic arcade integration (Rapier collider follows for sensors)
      vel.current.y += COURT.gravity * step
      pos.current.x += vel.current.x * step
      pos.current.y += vel.current.y * step
      pos.current.z += vel.current.z * step

      // Soft rim / backboard bounce for banks
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
        // glance rim
        vel.current.x *= -0.35
        vel.current.z *= -0.25
        vel.current.y = Math.abs(vel.current.y) * 0.35
        accuracy.current *= 0.55
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
        banked.current =
          pos.current.y >= COURT.logoZone.yMin &&
          pos.current.y <= COURT.logoZone.yMax &&
          Math.abs(pos.current.x) <= COURT.logoZone.xAbs
        if (banked.current) accuracy.current = Math.max(accuracy.current, 0.55)
      }

      // Score window — falling through rim cylinder
      if (
        !scoreSent.current &&
        horiz < COURT.rimRadius * 0.95 &&
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
      if (!scoreSent.current && !missSent.current) {
        if (pos.current.y < 0.12 && elapsed > 400) {
          missSent.current = true
          flying.current = false
          onSleepMiss()
        } else if (elapsed > 3200) {
          missSent.current = true
          flying.current = false
          onSleepMiss()
        }
      }

      const b = body.current
      if (b) {
        b.setTranslation(
          { x: pos.current.x, y: pos.current.y, z: pos.current.z },
          true,
        )
      }

      const i = (trailIdx.current++ % 20) * 3
      trailPos[i] = pos.current.x
      trailPos[i + 1] = pos.current.y
      trailPos[i + 2] = pos.current.z
      if (trail.current?.geometry.attributes.position) {
        trail.current.geometry.attributes.position.needsUpdate = true
      }
    }

    if (group.current) group.current.position.copy(pos.current)
    if (ballMesh.current) {
      ballMesh.current.rotation.x += spin.current * 0.03
      ballMesh.current.rotation.z += spin.current * 0.02
    }
    if (shadow.current) {
      shadow.current.position.set(pos.current.x, 0.025, pos.current.z)
      const s = THREE.MathUtils.clamp(
        0.35 / Math.max(pos.current.y, 0.3),
        0.35,
        1.2,
      )
      shadow.current.scale.setScalar(s)
    }
  })

  return (
    <>
      <RigidBody
        ref={body}
        position={[COURT.ballRest.x, COURT.ballRest.y, COURT.ballRest.z]}
        colliders={false}
        ccd
        type="kinematicPosition"
      >
        <BallCollider args={[COURT.ballRadius]} sensor />
      </RigidBody>

      <group
        ref={group}
        position={[COURT.ballRest.x, COURT.ballRest.y, COURT.ballRest.z]}
      >
        <mesh ref={ballMesh} castShadow>
          <sphereGeometry args={[COURT.ballRadius, 28, 28]} />
          <meshStandardMaterial
            color={PALETTE.signal}
            roughness={0.3}
            metalness={0.25}
            emissive={PALETTE_HEX.signal}
            emissiveIntensity={0.75}
            toneMapped={false}
          />
        </mesh>
        <mesh>
          <sphereGeometry args={[COURT.ballRadius * 1.45, 16, 16]} />
          <meshBasicMaterial
            color={PALETTE.signal}
            transparent
            opacity={0.22}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, 0, COURT.ballRadius * 0.95]}>
          <circleGeometry args={[0.028, 12]} />
          <meshBasicMaterial color={PALETTE.soft} transparent opacity={0.75} />
        </mesh>
      </group>

      <mesh
        ref={shadow}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.025, COURT.ballRest.z]}
      >
        <circleGeometry args={[0.24, 16]} />
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
          size={0.07}
          color={PALETTE.mint}
          transparent
          opacity={phase === 'flight' ? 0.7 : 0}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </>
  )
}
