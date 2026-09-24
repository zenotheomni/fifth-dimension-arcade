import { Text } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Cabinet } from '../core/cabinetConfig'
import { PALETTE, PALETTE_HEX } from '../palette'
import { ScreenPreview } from './ScreenPreview'

const PREVIEW_KIND: Record<string, 'court' | 'runner' | 'pool' | 'drift'> = {
  'court-vision': 'court',
  'fifth-run': 'runner',
  'break-and-rack': 'pool',
  'lane-drift': 'drift',
}

export function ArcadeCabinet({
  cabinet,
  selected,
  onSelect,
}: {
  cabinet: Cabinet
  selected: boolean
  onSelect: () => void
}) {
  const lit = cabinet.status === 'lit'
  const group = useRef<THREE.Group>(null)
  const glowIntensity = lit ? (selected ? 1.4 : 0.9) : 0.2
  const bodyColor = useMemo(
    () => new THREE.Color(lit ? 0x16121f : 0x0e0e12),
    [lit],
  )
  const accent = lit ? PALETTE_HEX.signal : PALETTE_HEX.muted
  const marqueeColor = lit ? PALETTE.signal : '#3a3a42'

  useFrame(() => {
    if (!group.current || !lit) return
    const pulse = 1 + Math.sin(performance.now() * 0.002) * 0.015
    group.current.scale.setScalar(selected ? 1.04 * pulse : pulse)
  })

  return (
    <group
      ref={group}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onPointerOver={() => {
        document.body.style.cursor = lit ? 'pointer' : 'default'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
      }}
    >
      {/* Cabinet body */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[1.45, 2.1, 0.85]} />
        <meshStandardMaterial
          color={bodyColor}
          roughness={0.55}
          metalness={0.25}
        />
      </mesh>

      {/* Bezel */}
      <mesh position={[0, 1.15, 0.44]}>
        <boxGeometry args={[1.28, 1.15, 0.06]} />
        <meshStandardMaterial color="#0c0c10" roughness={0.4} metalness={0.4} />
      </mesh>

      <ScreenPreview kind={PREVIEW_KIND[cabinet.id] ?? 'court'} lit={lit} />

      {/* Marquee */}
      <mesh position={[0, 2.15, 0.15]}>
        <boxGeometry args={[1.5, 0.32, 0.5]} />
        <meshStandardMaterial
          color="#101018"
          emissive={accent}
          emissiveIntensity={glowIntensity * 0.35}
          roughness={0.35}
          metalness={0.5}
        />
      </mesh>
      <Text
        position={[0, 2.15, 0.42]}
        fontSize={0.13}
        color={marqueeColor}
        anchorX="center"
        anchorY="middle"
        maxWidth={1.35}
        textAlign="center"
        letterSpacing={0.06}
        fillOpacity={lit ? 1 : 0.45}
      >
        {cabinet.title.toUpperCase()}
      </Text>
      {lit ? (
        <pointLight
          position={[0, 2.2, 0.6]}
          color={PALETTE.signal}
          intensity={selected ? 2.2 : 1.1}
          distance={3.5}
          decay={2}
        />
      ) : null}

      {/* Control panel */}
      <mesh position={[0, 0.28, 0.55]} rotation={[-0.55, 0, 0]}>
        <boxGeometry args={[1.35, 0.45, 0.08]} />
        <meshStandardMaterial color="#121218" roughness={0.5} metalness={0.3} />
      </mesh>

      {/* Joystick */}
      <mesh position={[-0.35, 0.42, 0.62]}>
        <cylinderGeometry args={[0.04, 0.05, 0.18, 10]} />
        <meshStandardMaterial color="#1a1a22" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[-0.35, 0.52, 0.62]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial
          color={lit ? PALETTE.signal : '#444'}
          emissive={lit ? PALETTE_HEX.signal : 0x000000}
          emissiveIntensity={lit ? 0.6 : 0}
        />
      </mesh>

      {/* Buttons */}
      {[0.15, 0.35, 0.55].map((x, i) => (
        <mesh key={x} position={[x, 0.4, 0.6]}>
          <cylinderGeometry args={[0.055, 0.055, 0.04, 12]} />
          <meshStandardMaterial
            color={i === 0 ? PALETTE.mint : i === 1 ? PALETTE.signal : '#6b6b73'}
            emissive={
              lit
                ? i === 0
                  ? PALETTE_HEX.mint
                  : i === 1
                    ? PALETTE_HEX.signal
                    : 0x222222
                : 0x000000
            }
            emissiveIntensity={lit ? 0.5 : 0}
          />
        </mesh>
      ))}

      {/* Status / badge */}
      <Text
        position={[0, -0.2, 0.5]}
        fontSize={0.08}
        color={lit ? PALETTE.mint : PALETTE.muted}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.08}
      >
        {lit ? (cabinet.badge ?? 'LIT') : 'COMING UP'}
      </Text>

      {/* Soft floor glow blob */}
      <mesh position={[0, 0.02, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.95, 24]} />
        <meshBasicMaterial
          color={lit ? PALETTE.signal : '#1a1a22'}
          transparent
          opacity={lit ? 0.18 : 0.05}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
