import { MeshReflectorMaterial, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { cabinets } from '../core/cabinetConfig'
import { PALETTE } from '../palette'
import { ArcadeCabinet } from './ArcadeCabinet'

const SPACING = 2.6

export function LobbyScene({
  index,
  onSelectCabinet,
  reducedMotion,
  zooming,
}: {
  index: number
  onSelectCabinet: (i: number) => void
  reducedMotion: boolean
  zooming: boolean
}) {
  const rig = useRef<THREE.Group>(null)
  const camTarget = useRef(new THREE.Vector3(0, 1.35, 4.8))
  const particles = useMemo(() => {
    const n = 48
    const positions = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14
      positions[i * 3 + 1] = Math.random() * 4 + 0.2
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8 - 1
    }
    return positions
  }, [])

  useFrame(({ camera }, dt) => {
    if (!rig.current) return
    const targetX = -index * SPACING
    rig.current.position.x = THREE.MathUtils.damp(
      rig.current.position.x,
      targetX,
      4,
      dt,
    )

    if (zooming) {
      camTarget.current.set(0, 1.35, 2.2)
    } else {
      camTarget.current.set(0, 1.45, 4.9)
    }
    camera.position.x = THREE.MathUtils.damp(camera.position.x, 0, 3, dt)
    camera.position.y = THREE.MathUtils.damp(
      camera.position.y,
      camTarget.current.y,
      3,
      dt,
    )
    camera.position.z = THREE.MathUtils.damp(
      camera.position.z,
      camTarget.current.z,
      3,
      dt,
    )
    camera.lookAt(0, 1.2, 0)
  })

  return (
    <>
      <color attach="background" args={[PALETTE.void]} />
      <fog attach="fog" args={[PALETTE.void, 6, 16]} />

      <ambientLight intensity={0.25} />
      <directionalLight
        position={[2, 6, 4]}
        intensity={0.35}
        color={PALETTE.soft}
      />
      <pointLight
        position={[-3, 3, 2]}
        intensity={0.8}
        color={PALETTE.ink}
        distance={10}
      />
      <pointLight
        position={[3, 2.5, 1]}
        intensity={0.55}
        color={PALETTE.signal}
        distance={8}
      />

      {/* Neon ceiling sign */}
      <group position={[0, 3.35, -1.2]}>
        <Text
          fontSize={0.38}
          color={PALETTE.signal}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.12}
          fillOpacity={0.95}
        >
          THE FIFTH FLOOR
        </Text>
        <Text
          position={[0, 0, -0.02]}
          fontSize={0.42}
          color={PALETTE.signal}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.12}
          fillOpacity={0.25}
        >
          THE FIFTH FLOOR
        </Text>
        <pointLight
          position={[0, 0.2, 0.8]}
          color={PALETTE.signal}
          intensity={reducedMotion ? 1.2 : 2.4}
          distance={8}
        />
      </group>

      {/* Brand mark on carpet — low key */}
      <Text
        position={[0, 0.03, 2.2]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.55}
        color={PALETTE.soft}
        fillOpacity={0.08}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.2}
      >
        5D
      </Text>

      {/* Reflective floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[28, 18]} />
        <MeshReflectorMaterial
          blur={[300, 80]}
          resolution={reducedMotion ? 256 : 512}
          mixBlur={0.85}
          mixStrength={0.55}
          roughness={0.85}
          depthScale={0.6}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
          color="#0c0b10"
          metalness={0.55}
          mirror={0.35}
        />
      </mesh>

      {/* Back wall haze panel */}
      <mesh position={[0, 1.8, -3.2]}>
        <planeGeometry args={[20, 5]} />
        <meshBasicMaterial color={PALETTE.ink} transparent opacity={0.45} />
      </mesh>

      <group ref={rig}>
        {cabinets.map((cabinet, i) => (
          <group key={cabinet.id} position={[i * SPACING, 0, 0]}>
            <ArcadeCabinet
              cabinet={cabinet}
              selected={i === index}
              onSelect={() => onSelectCabinet(i)}
            />
          </group>
        ))}
      </group>

      {/* Haze particles */}
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[particles, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.035}
          color={PALETTE.mint}
          transparent
          opacity={0.35}
          depthWrite={false}
          sizeAttenuation
        />
      </points>

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={reducedMotion ? 0.45 : 0.95}
          luminanceThreshold={0.25}
          luminanceSmoothing={0.5}
          mipmapBlur
        />
        <Vignette offset={0.25} darkness={0.7} />
        {!reducedMotion ? (
          <ChromaticAberration
            blendFunction={BlendFunction.NORMAL}
            offset={new THREE.Vector2(0.0006, 0.0006)}
          />
        ) : null}
      </EffectComposer>
    </>
  )
}

