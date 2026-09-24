import { CuboidCollider, RigidBody, CylinderCollider } from '@react-three/rapier'
import { COURT } from './courtMath'

/** Static rim segments + backboard + score sensor */
export function HoopColliders({
  onScoreSensor,
  onBackboard,
  onRim,
}: {
  onScoreSensor: () => void
  onBackboard: (hitLogo: boolean) => void
  onRim: () => void
}) {
  const rim = COURT.rim
  const bb = COURT.backboard

  return (
    <>
      <RigidBody
        type="fixed"
        colliders={false}
        position={[bb.x, bb.y, bb.z]}
        onCollisionEnter={({ manifold }) => {
          const pt = manifold?.solverContactPoint(0)
          const y = pt?.y ?? bb.y
          const x = Math.abs(pt?.x ?? 0)
          const hitLogo =
            y >= COURT.logoZone.yMin &&
            y <= COURT.logoZone.yMax &&
            x <= COURT.logoZone.xAbs
          onBackboard(hitLogo)
        }}
      >
        <CuboidCollider
          args={[bb.w / 2, bb.h / 2, bb.d / 2]}
          restitution={0.65}
        />
      </RigidBody>

      {Array.from({ length: 10 }).map((_, i) => {
        const a = (i / 10) * Math.PI * 2
        const x = rim.x + Math.cos(a) * COURT.rimRadius
        const z = rim.z + Math.sin(a) * COURT.rimRadius
        return (
          <RigidBody
            key={i}
            type="fixed"
            colliders={false}
            position={[x, rim.y, z]}
            onCollisionEnter={() => onRim()}
          >
            <CuboidCollider
              args={[0.04, 0.025, 0.04]}
              restitution={0.4}
              friction={0.2}
            />
          </RigidBody>
        )
      })}

      <RigidBody
        type="fixed"
        colliders={false}
        position={[rim.x, rim.y - 0.22, rim.z]}
        onIntersectionEnter={() => onScoreSensor()}
      >
        <CylinderCollider
          args={[0.14, COURT.rimRadius * 0.7]}
          sensor
        />
      </RigidBody>
    </>
  )
}
