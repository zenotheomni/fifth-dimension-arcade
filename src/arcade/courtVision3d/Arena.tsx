import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { COURT_VISION_PLACEMENT } from '../brandPlacement'
import { PALETTE, PALETTE_HEX } from '../palette'
import { makeWoodFloorTexture } from './ballTexture'
import { COURT } from './courtMath'

function CrowdRows() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const count = 64
  const bob = useRef(Float32Array.from({ length: count }, () => Math.random() * Math.PI * 2))

  useFrame(({ clock }) => {
    const m = mesh.current
    if (!m) return
    const dummy = new THREE.Object3D()
    let i = 0
    for (let row = 0; row < 4; row++) {
      for (let side = -1; side <= 1; side += 2) {
        for (let n = 0; n < 8; n++) {
          if (i >= count) break
          const x = side * (3.6 + row * 0.35 + (n % 3) * 0.08)
          const z = -0.4 - n * 0.55 - row * 0.15
          const h = 1.35 + (n % 4) * 0.08
          const y =
            0.55 +
            row * 0.42 +
            Math.sin(clock.elapsedTime * 1.4 + bob.current[i]) * 0.025
          dummy.position.set(x, y, z)
          dummy.scale.set(0.9, h, 0.9)
          dummy.rotation.set(0, -side * 0.15, 0)
          dummy.updateMatrix()
          m.setMatrixAt(i, dummy.matrix)
          i++
        }
      }
    }
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <capsuleGeometry args={[0.16, 0.55, 3, 6]} />
      <meshStandardMaterial color="#0c0b10" roughness={1} metalness={0} />
    </instancedMesh>
  )
}

export function Net({
  swishPulseRef,
}: {
  swishPulseRef: React.MutableRefObject<{ swish: number; rim: number }>
}) {
  const group = useRef<THREE.Group>(null)
  const strands = useMemo(() => {
    const arr: { a: number; len: number }[] = []
    for (let i = 0; i < 16; i++) {
      arr.push({ a: (i / 16) * Math.PI * 2, len: 0.42 + (i % 3) * 0.02 })
    }
    return arr
  }, [])

  useFrame(({ clock }) => {
    if (!group.current) return
    const t = clock.elapsedTime
    const punch = swishPulseRef.current.swish * 0.08
    let si = 0
    group.current.children.forEach((child) => {
      if (!(child as THREE.Group).isGroup) return
      if (si >= strands.length) return
      const s = Math.sin(t * 3.2 + si * 0.85) * (0.014 + punch)
      const a = strands[si].a
      child.position.x = Math.cos(a) * (0.2 + punch * 2) + s
      child.position.z = Math.sin(a) * (0.2 + punch * 2)
      child.rotation.z = Math.sin(t * 2.5 + si) * (0.05 + punch * 3)
      child.scale.y = 1 + punch * Math.sin(t * 20 + si)
      si++
    })
  })

  return (
    <group ref={group} position={[COURT.rim.x, COURT.rim.y - 0.02, COURT.rim.z]}>
      {/* Top ring bar for net attachment */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <torusGeometry args={[COURT.rimRadius * 0.92, 0.006, 6, 24]} />
        <meshStandardMaterial color={PALETTE.soft} roughness={0.6} />
      </mesh>
      {strands.map((s, i) => (
        <group key={i}>
          <mesh position={[Math.cos(s.a) * 0.2, -s.len * 0.45, Math.sin(s.a) * 0.2]}>
            <cylinderGeometry args={[0.01, 0.004, s.len, 5]} />
            <meshStandardMaterial
              color={PALETTE.soft}
              emissive={PALETTE_HEX.soft}
              emissiveIntensity={0.12}
              roughness={0.7}
            />
          </mesh>
          {/* Cross links every other */}
          {i % 2 === 0 ? (
            <mesh
              position={[
                Math.cos(s.a + 0.2) * 0.16,
                -0.18,
                Math.sin(s.a + 0.2) * 0.16,
              ]}
              rotation={[0, s.a, 0.4]}
            >
              <cylinderGeometry args={[0.004, 0.004, 0.14, 4]} />
              <meshStandardMaterial color="#d8d4cc" roughness={0.8} />
            </mesh>
          ) : null}
        </group>
      ))}
      {/* Bottom gather */}
      <mesh position={[0, -0.48, 0]}>
        <torusGeometry args={[0.07, 0.008, 6, 16]} />
        <meshStandardMaterial color={PALETTE.soft} roughness={0.65} />
      </mesh>
    </group>
  )
}

function CourtLines() {
  const mat = (
    <meshBasicMaterial color="#cfc8b8" transparent opacity={0.28} depthWrite={false} />
  )
  return (
    <group position={[0, 0.015, 0]}>
      {/* Key */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -2.6]}>
        <ringGeometry args={[0, 0.01]} />
      </mesh>
      {/* Paint rect */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -2.7]}>
        <planeGeometry args={[2.35, 3.3]} />
        <meshStandardMaterial
          color="#241833"
          roughness={0.85}
          transparent
          opacity={0.55}
        />
      </mesh>
      {/* Free-throw arc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, -1.05]}>
        <ringGeometry args={[1.15, 1.19, 48, 1, 0, Math.PI]} />
        {mat}
      </mesh>
      {/* Three-point-ish arc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, -2.2]}>
        <ringGeometry args={[3.2, 3.26, 64, 1, 0.35, Math.PI - 0.7]} />
        {mat}
      </mesh>
      {/* Sideline strips */}
      {[-1, 1].map((s) => (
        <mesh key={s} rotation={[-Math.PI / 2, 0, 0]} position={[s * 4.2, 0, -1]}>
          <planeGeometry args={[0.04, 10]} />
          {mat}
        </mesh>
      ))}
    </group>
  )
}

export function Arena({
  mintFlash,
  fxRef,
}: {
  mintFlash: number
  fxRef: React.MutableRefObject<{ swish: number; rim: number }>
}) {
  const rim = COURT.rim
  const bb = COURT.backboard
  const floorMap = useMemo(() => makeWoodFloorTexture(), [])
  const rimRef = useRef<THREE.Group>(null)
  const haze = useMemo(() => {
    const n = 60
    const p = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      p[i * 3] = (Math.random() - 0.5) * 10
      p[i * 3 + 1] = 0.4 + Math.random() * 4
      p[i * 3 + 2] = -4 + Math.random() * 7
    }
    return p
  }, [])

  useFrame(({ clock }) => {
    if (!rimRef.current) return
    const w = fxRef.current.rim
    rimRef.current.rotation.z = Math.sin(clock.elapsedTime * 28) * w * 0.04
    rimRef.current.rotation.x = Math.cos(clock.elapsedTime * 22) * w * 0.025
  })

  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.5]} receiveShadow>
        <planeGeometry args={[16, 20]} />
        <meshStandardMaterial
          map={floorMap}
          color="#4a3a55"
          roughness={0.45}
          metalness={0.22}
        />
      </mesh>
      {/* Soft floor reflection plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, -1.5]}>
        <planeGeometry args={[10, 12]} />
        <meshStandardMaterial
          color="#1a1028"
          roughness={0.25}
          metalness={0.55}
          transparent
          opacity={0.35}
        />
      </mesh>

      <CourtLines />

      {/* Center-court mark — small, on floor, ~17% opacity */}
      <Text
        position={[0, 0.02, 0.9]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.38}
        color={PALETTE.soft}
        fillOpacity={COURT_VISION_PLACEMENT.centerCourtOpacity}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.18}
      >
        {COURT_VISION_PLACEMENT.centerCourtMark}
      </Text>

      {/* Sideline banners on walls */}
      <mesh position={[-4.6, 1.7, -2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[5.5, 1.1]} />
        <meshStandardMaterial color="#120e18" roughness={0.8} />
      </mesh>
      <Text
        position={[-4.55, 1.75, -2]}
        rotation={[0, Math.PI / 2, 0]}
        fontSize={0.28}
        color={PALETTE.signal}
        fillOpacity={0.7}
        anchorX="center"
        letterSpacing={0.14}
      >
        FIFTH DIMENSION
      </Text>
      <mesh position={[4.6, 1.7, -2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[5.5, 1.1]} />
        <meshStandardMaterial color="#120e18" roughness={0.8} />
      </mesh>
      <Text
        position={[4.55, 1.75, -2]}
        rotation={[0, -Math.PI / 2, 0]}
        fontSize={0.28}
        color={PALETTE.mint}
        fillOpacity={0.55}
        anchorX="center"
        letterSpacing={0.14}
      >
        FLOW STATE
      </Text>

      {/* Stands platforms */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 4.0, 0.9, -1.2]} rotation={[0, 0, s * 0.08]}>
          <boxGeometry args={[1.4, 1.8, 8]} />
          <meshStandardMaterial color="#0e0c12" roughness={0.95} />
        </mesh>
      ))}

      <CrowdRows />

      {/* Glass backboard */}
      <mesh position={[bb.x, bb.y, bb.z]}>
        <boxGeometry args={[bb.w, bb.h, bb.d]} />
        <meshStandardMaterial
          color="#c8c4bc"
          roughness={0.12}
          metalness={0.25}
          transparent
          opacity={0.55}
        />
      </mesh>
      {/* Faint geometry only */}
      <mesh position={[bb.x, bb.y - 0.08, bb.z + 0.04]}>
        <planeGeometry args={[0.5, 0.4]} />
        <meshBasicMaterial color="#9a958c" transparent opacity={0.4} />
      </mesh>
      <mesh position={[bb.x, bb.y - 0.08, bb.z + 0.045]}>
        <planeGeometry args={[0.42, 0.32]} />
        <meshBasicMaterial color="#6a6660" wireframe transparent opacity={0.35} />
      </mesh>
      {/* Backboard frame */}
      <mesh position={[bb.x, bb.y, bb.z - 0.02]}>
        <boxGeometry args={[bb.w + 0.08, bb.h + 0.08, 0.03]} />
        <meshStandardMaterial color="#2a2a32" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Rim group with wobble */}
      <group ref={rimRef} position={[rim.x, rim.y, rim.z]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[COURT.rimRadius, 0.032, 12, 36]} />
          <meshStandardMaterial
            color="#FF6A2B"
            emissive={PALETTE_HEX.signal}
            emissiveIntensity={0.55 + mintFlash * 1.8}
            metalness={0.85}
            roughness={0.22}
          />
        </mesh>
        {/* Rim plate */}
        <mesh position={[0, -0.04, 0.18]}>
          <boxGeometry args={[0.28, 0.06, 0.14]} />
          <meshStandardMaterial color="#2a2a30" metalness={0.6} roughness={0.35} />
        </mesh>
        <Text
          position={[0, -0.04, 0.26]}
          fontSize={0.07}
          color={PALETTE.mint}
          fillOpacity={0.85}
          anchorX="center"
          anchorY="middle"
        >
          5D
        </Text>
      </group>

      <Net swishPulseRef={fxRef} />

      {/* Support pole + padding */}
      <mesh position={[0, 1.55, bb.z - 0.22]}>
        <cylinderGeometry args={[0.08, 0.1, 3.1, 10]} />
        <meshStandardMaterial color="#3a3a44" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, 2.55, bb.z - 0.22]}>
        <cylinderGeometry args={[0.12, 0.12, 0.55, 10]} />
        <meshStandardMaterial color="#1a1a22" roughness={0.9} />
      </mesh>
      {/* Arm */}
      <mesh position={[0, 3.2, bb.z - 0.1]} rotation={[0.15, 0, 0]}>
        <boxGeometry args={[0.1, 0.08, 0.45]} />
        <meshStandardMaterial color="#3a3a44" metalness={0.65} roughness={0.35} />
      </mesh>

      {/* Haze particles */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[haze, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.04}
          color={PALETTE.mint}
          transparent
          opacity={0.22}
          depthWrite={false}
          sizeAttenuation
        />
      </points>

      {/* Lights */}
      <ambientLight intensity={0.42} />
      <hemisphereLight args={['#3a2858', '#0a0a0c', 0.45]} />
      <spotLight
        position={[0, 7.5, -1]}
        angle={0.42}
        penumbra={0.55}
        intensity={4.2}
        distance={22}
        color="#f2f0ea"
      />
      <spotLight
        position={[0, 6.5, -3.2]}
        angle={0.32}
        penumbra={0.45}
        intensity={3.4 + mintFlash * 2.5}
        distance={16}
        color={PALETTE.signal}
      />
      <pointLight
        position={[0, rim.y + 0.3, rim.z]}
        color={PALETTE.signal}
        intensity={3.5 + mintFlash * 5}
        distance={7}
      />
      <pointLight
        position={[2.5, 2.2, 1]}
        color={PALETTE.mint}
        intensity={0.7 + mintFlash * 1.2}
        distance={8}
      />
      <pointLight position={[-2.5, 2.5, 0]} color={PALETTE.ink} intensity={1.4} distance={10} />
    </group>
  )
}
