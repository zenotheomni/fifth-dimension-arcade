import { Text } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COURT_VISION_PLACEMENT } from '../brandPlacement'
import { PALETTE, PALETTE_HEX } from '../palette'
import { COURT } from './courtMath'

function CrowdSilhouettes() {
  const meshes = useMemo(() => {
    const items: { x: number; z: number; s: number; h: number }[] = []
    for (let i = 0; i < 22; i++) {
      const side = i % 2 === 0 ? -1 : 1
      items.push({
        x: side * (3.2 + (i % 5) * 0.35),
        z: -1.5 - (i % 7) * 0.55,
        s: 0.85 + (i % 4) * 0.08,
        h: 1.4 + (i % 5) * 0.12,
      })
    }
    return items
  }, [])

  return (
    <group>
      {meshes.map((m, i) => (
        <group key={i} position={[m.x, 0, m.z]} scale={[m.s, m.s, m.s]}>
          <mesh position={[0, m.h * 0.35, 0]}>
            <capsuleGeometry args={[0.18, m.h * 0.45, 4, 8]} />
            <meshStandardMaterial color="#0d0d12" roughness={1} />
          </mesh>
          <mesh position={[0, m.h * 0.78, 0]}>
            <sphereGeometry args={[0.16, 8, 8]} />
            <meshStandardMaterial color="#0d0d12" roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Net() {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime
    ref.current.children.forEach((child, i) => {
      child.position.x = Math.sin(t * 2.2 + i * 0.7) * 0.012
      child.rotation.z = Math.sin(t * 1.8 + i) * 0.04
    })
  })

  const strands = useMemo(() => {
    const arr: number[] = []
    for (let i = 0; i < 12; i++) arr.push((i / 12) * Math.PI * 2)
    return arr
  }, [])

  return (
    <group ref={ref} position={[COURT.rim.x, COURT.rim.y - 0.05, COURT.rim.z]}>
      {strands.map((a, i) => (
        <mesh
          key={i}
          position={[Math.cos(a) * 0.22, -0.22, Math.sin(a) * 0.22]}
        >
          <cylinderGeometry args={[0.008, 0.004, 0.45, 4]} />
          <meshStandardMaterial
            color="#f2f0ea"
            emissive={PALETTE_HEX.soft}
            emissiveIntensity={0.08}
            transparent
            opacity={0.75}
          />
        </mesh>
      ))}
    </group>
  )
}

export function Arena({ mintFlash }: { mintFlash: number }) {
  const rim = COURT.rim
  const bb = COURT.backboard

  return (
    <group>
      {/* Court floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 18]} />
        <meshStandardMaterial color="#16141e" roughness={0.9} metalness={0.1} />
      </mesh>
      {/* Key paint */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -2.8]}>
        <planeGeometry args={[2.2, 3.2]} />
        <meshStandardMaterial
          color="#1a1028"
          roughness={0.85}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Center-court 5D mark */}
      <Text
        position={[0, 0.02, 1.2]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.9}
        color={PALETTE.soft}
        fillOpacity={COURT_VISION_PLACEMENT.centerCourtOpacity}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.15}
      >
        {COURT_VISION_PLACEMENT.centerCourtMark}
      </Text>

      {/* Sideline banners */}
      <Text
        position={[-3.4, 1.6, -2]}
        rotation={[0, Math.PI / 2, 0]}
        fontSize={0.22}
        color={PALETTE.signal}
        fillOpacity={0.55}
        anchorX="center"
      >
        FIFTH DIMENSION
      </Text>
      <Text
        position={[3.4, 1.6, -2]}
        rotation={[0, -Math.PI / 2, 0]}
        fontSize={0.22}
        color={PALETTE.mint}
        fillOpacity={0.4}
        anchorX="center"
      >
        FLOW STATE
      </Text>

      {/* Backboard — faint geometry ONLY */}
      <mesh position={[bb.x, bb.y, bb.z]}>
        <boxGeometry args={[bb.w, bb.h, bb.d]} />
        <meshStandardMaterial
          color="#c8c4bc"
          roughness={0.35}
          metalness={0.15}
          transparent
          opacity={0.55}
        />
      </mesh>
      {/* Inner square geometry */}
      <mesh position={[bb.x, bb.y - 0.05, bb.z + 0.03]}>
        <boxGeometry args={[0.45, 0.35, 0.01]} />
        <meshBasicMaterial color="#8a8680" transparent opacity={0.35} />
      </mesh>

      {/* Rim */}
      <mesh position={[rim.x, rim.y, rim.z]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[COURT.rimRadius, 0.03, 10, 28]} />
        <meshStandardMaterial
          color={PALETTE.signal}
          emissive={PALETTE_HEX.signal}
          emissiveIntensity={0.75 + mintFlash * 1.5}
          metalness={0.7}
          roughness={0.25}
        />
      </mesh>
      {/* Rim plate mark */}
      <Text
        position={[0, rim.y - 0.22, rim.z + 0.15]}
        fontSize={0.1}
        color={PALETTE.mint}
        fillOpacity={0.7}
        anchorX="center"
      >
        5D
      </Text>

      {/* Pole / support */}
      <mesh position={[0, 1.6, -4.75]}>
        <cylinderGeometry args={[0.07, 0.09, 3.2, 8]} />
        <meshStandardMaterial color="#2a2a32" metalness={0.6} roughness={0.4} />
      </mesh>

      <Net />
      <CrowdSilhouettes />

      {/* Neon rim light atmosphere */}
      <pointLight
        position={[0, 3.2, -4]}
        color={PALETTE.signal}
        intensity={2.5 + mintFlash * 4}
        distance={8}
      />
      <pointLight
        position={[-2, 2.5, 1]}
        color={PALETTE.ink}
        intensity={1.2}
        distance={10}
      />
      <pointLight
        position={[2, 2, 2]}
        color={PALETTE.mint}
        intensity={0.35 + mintFlash}
        distance={7}
      />
      <spotLight
        position={[0, 6, 2]}
        angle={0.55}
        penumbra={0.6}
        intensity={1.1}
        color={PALETTE.soft}
        castShadow={false}
      />
    </group>
  )
}
