import { MeshReflectorMaterial, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
  EffectComposer,
  Bloom,
  Vignette,
  ChromaticAberration,
} from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { cabinets } from '../core/cabinetConfig'
import { PALETTE } from '../palette'
import { ArcadeCabinet } from './ArcadeCabinet'

const SPACING = 2.15

function CeilingTubes() {
  return (
    <group position={[0, 3.6, 0.5]}>
      {[-2.2, 0, 2.2].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.04, 0.04, 3.2, 10]} />
            <meshStandardMaterial
              color={PALETTE.mint}
              emissive={PALETTE.mint}
              emissiveIntensity={0.55}
              roughness={0.3}
            />
          </mesh>
          <pointLight
            position={[0, -0.2, 0]}
            color={PALETTE.mint}
            intensity={0.55}
            distance={5}
          />
        </group>
      ))}
    </group>
  )
}

function BackgroundCabinets() {
  return (
    <group position={[0, 0, -2.8]}>
      {[-5.5, -3.2, 3.2, 5.5].map((x, i) => (
        <group key={x} position={[x, 0, -i * 0.1]} scale={[0.75, 0.75, 0.75]}>
          <mesh position={[0, 0.9, 0]}>
            <boxGeometry args={[1.3, 1.9, 0.7]} />
            <meshStandardMaterial color="#0c0c10" roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.1, 0.36]}>
            <planeGeometry args={[0.9, 0.7]} />
            <meshStandardMaterial
              color="#101018"
              emissive={i % 2 ? PALETTE.signal : PALETTE.mint}
              emissiveIntensity={0.12}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

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
  const camTarget = useRef(new THREE.Vector3(0, 1.65, 6.1))
  const { size } = useThree()
  const signScale = Math.min(1, size.width / 520)
  const particles = useMemo(() => {
    const n = 56
    const positions = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14
      positions[i * 3 + 1] = Math.random() * 3.8 + 0.2
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
      4.2,
      dt,
    )

    if (zooming) {
      camTarget.current.set(0, 1.35, 2.35)
    } else {
      // Pull camera back so neighboring cabinets + neon sign fit on phone
      camTarget.current.set(0, 1.65, 6.1)
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
    camera.lookAt(0, 1.15, 0)
  })

  return (
    <>
      <color attach="background" args={[PALETTE.void]} />
      <fog attach="fog" args={[PALETTE.void, 7, 18]} />

      <ambientLight intensity={0.22} />
      <directionalLight position={[2, 6, 4]} intensity={0.3} color={PALETTE.soft} />
      <pointLight position={[-3, 3, 2]} intensity={0.75} color={PALETTE.ink} distance={10} />
      <pointLight position={[3, 2.5, 1]} intensity={0.5} color={PALETTE.signal} distance={8} />

      <CeilingTubes />
      <BackgroundCabinets />

      {/* Neon ceiling sign — compact on phone */}
      <group position={[0, 3.25, -0.7]} scale={[signScale, signScale, 1]}>
        <Text
          fontSize={size.width < 420 ? 0.22 : 0.26}
          color={PALETTE.signal}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.12}
          fillOpacity={0.98}
          maxWidth={size.width < 420 ? 3.2 : 3.8}
          textAlign="center"
        >
          {size.width < 420 ? '5TH FLOOR' : 'THE FIFTH FLOOR'}
        </Text>
        <pointLight
          position={[0, 0.15, 0.7]}
          color={PALETTE.signal}
          intensity={reducedMotion ? 1.0 : 2.0}
          distance={7}
        />
      </group>

      {/* Carpet brand mark */}
      <Text
        position={[0, 0.03, 2.4]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.4}
        color={PALETTE.soft}
        fillOpacity={0.07}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.22}
      >
        5D
      </Text>
      {/* Carpet pattern strips */}
      {[-1.2, 0, 1.2].map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, z]}>
          <planeGeometry args={[12, 0.08]} />
          <meshBasicMaterial color="#1a1028" transparent opacity={0.5} />
        </mesh>
      ))}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[28, 18]} />
        <MeshReflectorMaterial
          blur={[280, 70]}
          resolution={reducedMotion ? 256 : 448}
          mixBlur={0.9}
          mixStrength={0.6}
          roughness={0.82}
          depthScale={0.55}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
          color="#0d0b12"
          metalness={0.5}
          mirror={0.32}
        />
      </mesh>

      <mesh position={[0, 1.8, -3.4]}>
        <planeGeometry args={[22, 5]} />
        <meshBasicMaterial color={PALETTE.ink} transparent opacity={0.5} />
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

      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particles, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.032}
          color={PALETTE.mint}
          transparent
          opacity={0.32}
          depthWrite={false}
          sizeAttenuation
        />
      </points>

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={reducedMotion ? 0.4 : 0.9}
          luminanceThreshold={0.22}
          luminanceSmoothing={0.5}
          mipmapBlur
        />
        <Vignette offset={0.22} darkness={0.68} />
        {!reducedMotion ? (
          <ChromaticAberration
            blendFunction={BlendFunction.NORMAL}
            offset={new THREE.Vector2(0.0005, 0.0005)}
          />
        ) : null}
      </EffectComposer>
    </>
  )
}
