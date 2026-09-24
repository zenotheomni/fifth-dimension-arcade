import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
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

function SideArt({ lit, side }: { lit: boolean; side: -1 | 1 }) {
  return (
    <group position={[side * 0.74, 1.0, 0]} rotation={[0, side * Math.PI / 2, 0]}>
      <mesh>
        <planeGeometry args={[0.8, 1.9]} />
        <meshStandardMaterial color={lit ? '#16101f' : '#0c0c10'} roughness={0.7} />
      </mesh>
      {[0.35, 0, -0.35].map((y, i) => (
        <mesh key={y} position={[0, y, 0.01]}>
          <planeGeometry args={[0.55, 0.08]} />
          <meshStandardMaterial
            color={i === 1 ? PALETTE.signal : i === 0 ? PALETTE.mint : PALETTE.muted}
            emissive={lit ? (i === 1 ? PALETTE_HEX.signal : i === 0 ? PALETTE_HEX.mint : 0x222) : 0}
            emissiveIntensity={lit ? 0.45 : 0}
            transparent
            opacity={lit ? 0.85 : 0.35}
          />
        </mesh>
      ))}
      <Text
        position={[0, -0.7, 0.02]}
        fontSize={0.09}
        color={lit ? PALETTE.soft : '#444'}
        fillOpacity={0.5}
        anchorX="center"
        rotation={[0, 0, Math.PI / 2]}
      >
        5D
      </Text>
    </group>
  )
}

export function ArcadeCabinet({
  cabinet,
  selected,
  onSelect,
  dim = false,
}: {
  cabinet: Cabinet
  selected: boolean
  onSelect: () => void
  dim?: boolean
}) {
  const lit = cabinet.status === 'lit' && !dim
  const group = useRef<THREE.Group>(null)
  const glowIntensity = lit ? (selected ? 1.5 : 0.95) : 0.15
  const bodyColor = useMemo(
    () => new THREE.Color(lit ? 0x17131f : 0x0d0d12),
    [lit],
  )
  const accent = lit ? PALETTE_HEX.signal : PALETTE_HEX.muted
  const marqueeColor = lit ? PALETTE.signal : '#3a3a42'

  useFrame(() => {
    if (!group.current || !lit) return
    const pulse = 1 + Math.sin(performance.now() * 0.002) * 0.012
    group.current.scale.setScalar(selected ? 1.05 * pulse : pulse)
  })

  return (
    <group
      ref={group}
      onClick={(e) => {
        e.stopPropagation()
        if (!dim) onSelect()
      }}
      onPointerOver={() => {
        document.body.style.cursor = lit ? 'pointer' : 'default'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
      }}
    >
      {/* Body with slight bevel via stacked boxes */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[1.4, 2.05, 0.82]} />
        <meshStandardMaterial color={bodyColor} roughness={0.5} metalness={0.28} />
      </mesh>
      {/* Rounded top cap */}
      <mesh position={[0, 2.0, 0]}>
        <boxGeometry args={[1.42, 0.12, 0.84]} />
        <meshStandardMaterial color="#121018" roughness={0.4} metalness={0.35} />
      </mesh>

      {/* T-molding edge light strips */}
      {([-0.71, 0.71] as const).map((x) => (
        <mesh key={x} position={[x, 1.0, 0.42]}>
          <boxGeometry args={[0.03, 1.9, 0.02]} />
          <meshStandardMaterial
            color={lit ? PALETTE.signal : '#222'}
            emissive={lit ? PALETTE_HEX.signal : 0}
            emissiveIntensity={lit ? 0.7 : 0}
          />
        </mesh>
      ))}

      <SideArt lit={lit} side={-1} />
      <SideArt lit={lit} side={1} />

      {/* Bezel */}
      <mesh position={[0, 1.15, 0.43]}>
        <boxGeometry args={[1.22, 1.08, 0.07]} />
        <meshStandardMaterial color="#0a0a0e" roughness={0.35} metalness={0.45} />
      </mesh>
      {/* Inner bezel chrome */}
      <mesh position={[0, 1.15, 0.47]}>
        <boxGeometry args={[1.14, 1.0, 0.02]} />
        <meshStandardMaterial color="#2a2a32" metalness={0.7} roughness={0.3} />
      </mesh>

      <ScreenPreview kind={PREVIEW_KIND[cabinet.id] ?? 'court'} lit={lit} />

      {/* Marquee */}
      <mesh position={[0, 2.18, 0.12]}>
        <boxGeometry args={[1.48, 0.34, 0.52]} />
        <meshStandardMaterial
          color="#101018"
          emissive={accent}
          emissiveIntensity={glowIntensity * 0.4}
          roughness={0.3}
          metalness={0.55}
        />
      </mesh>
      <Text
        position={[0, 2.18, 0.4]}
        fontSize={0.12}
        color={marqueeColor}
        anchorX="center"
        anchorY="middle"
        maxWidth={1.3}
        textAlign="center"
        letterSpacing={0.07}
        fillOpacity={lit ? 1 : 0.4}
      >
        {cabinet.title.toUpperCase()}
      </Text>
      {lit ? (
        <pointLight
          position={[0, 2.25, 0.55]}
          color={PALETTE.signal}
          intensity={selected ? 2.4 : 1.2}
          distance={3.5}
          decay={2}
        />
      ) : null}

      {/* Control panel */}
      <mesh position={[0, 0.3, 0.52]} rotation={[-0.5, 0, 0]}>
        <boxGeometry args={[1.28, 0.42, 0.08]} />
        <meshStandardMaterial color="#14141a" roughness={0.45} metalness={0.35} />
      </mesh>

      {/* Joystick */}
      <mesh position={[-0.32, 0.44, 0.6]}>
        <cylinderGeometry args={[0.04, 0.05, 0.16, 10]} />
        <meshStandardMaterial color="#1a1a22" metalness={0.65} roughness={0.28} />
      </mesh>
      <mesh position={[-0.32, 0.54, 0.6]}>
        <sphereGeometry args={[0.055, 14, 14]} />
        <meshStandardMaterial
          color={lit ? PALETTE.signal : '#444'}
          emissive={lit ? PALETTE_HEX.signal : 0}
          emissiveIntensity={lit ? 0.7 : 0}
        />
      </mesh>

      {/* Buttons */}
      {[0.12, 0.32, 0.52].map((x, i) => (
        <mesh key={x} position={[x, 0.42, 0.58]}>
          <cylinderGeometry args={[0.05, 0.05, 0.035, 14]} />
          <meshStandardMaterial
            color={i === 0 ? PALETTE.mint : i === 1 ? PALETTE.signal : '#6b6b73'}
            emissive={
              lit
                ? i === 0
                  ? PALETTE_HEX.mint
                  : i === 1
                    ? PALETTE_HEX.signal
                    : 0x222222
                : 0
            }
            emissiveIntensity={lit ? 0.55 : 0}
          />
        </mesh>
      ))}

      {/* Coin door */}
      <mesh position={[0.35, 0.05, 0.43]}>
        <boxGeometry args={[0.35, 0.28, 0.04]} />
        <meshStandardMaterial color="#1a1a20" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0.35, 0.05, 0.46]}>
        <circleGeometry args={[0.04, 12]} />
        <meshStandardMaterial
          color={lit ? PALETTE.mint : '#333'}
          emissive={lit ? PALETTE_HEX.mint : 0}
          emissiveIntensity={lit ? 0.8 : 0}
        />
      </mesh>

      {/* Wear scratch */}
      <mesh position={[-0.5, 0.7, 0.42]} rotation={[0, 0, 0.3]}>
        <planeGeometry args={[0.25, 0.02]} />
        <meshBasicMaterial color="#000" transparent opacity={0.25} />
      </mesh>

      <Text
        position={[0, -0.18, 0.48]}
        fontSize={0.075}
        color={lit ? PALETTE.mint : PALETTE.muted}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.08}
      >
        {lit ? (cabinet.badge ?? 'LIT') : 'COMING UP'}
      </Text>

      <mesh position={[0, 0.02, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.95, 24]} />
        <meshBasicMaterial
          color={lit ? PALETTE.signal : '#1a1a22'}
          transparent
          opacity={lit ? 0.2 : 0.05}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
