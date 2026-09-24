import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { PALETTE_HEX } from '../palette'

type PreviewKind = 'court' | 'runner' | 'pool' | 'drift'

/** Animated mini-loop on cabinet glass (~3s cycle). */
export function ScreenPreview({
  kind,
  lit,
}: {
  kind: PreviewKind
  lit: boolean
}) {
  const mat = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uLit: { value: lit ? 1 : 0 },
      uKind: {
        value:
          kind === 'court' ? 0 : kind === 'runner' ? 1 : kind === 'pool' ? 2 : 3,
      },
      uSignal: { value: new THREE.Color(PALETTE_HEX.signal) },
      uMint: { value: new THREE.Color(PALETTE_HEX.mint) },
      uInk: { value: new THREE.Color(PALETTE_HEX.ink) },
      uVoid: { value: new THREE.Color(PALETTE_HEX.void) },
      uSoft: { value: new THREE.Color(PALETTE_HEX.soft) },
    }),
    [kind, lit],
  )

  useFrame((_, dt) => {
    if (!mat.current) return
    mat.current.uniforms.uTime.value += dt
    mat.current.uniforms.uLit.value = lit ? 1 : 0.2
  })

  return (
    <mesh position={[0, 1.15, 0.48]}>
      <planeGeometry args={[1.1, 0.92]} />
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        transparent
        toneMapped={false}
        depthWrite={false}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          precision mediump float;
          uniform float uTime;
          uniform float uLit;
          uniform float uKind;
          uniform vec3 uSignal;
          uniform vec3 uMint;
          uniform vec3 uInk;
          uniform vec3 uVoid;
          uniform vec3 uSoft;
          varying vec2 vUv;

          float circ(vec2 p, float r) {
            return 1.0 - smoothstep(r - 0.01, r + 0.01, length(p));
          }

          void main() {
            vec2 uv = vUv;
            vec3 col = mix(uVoid, uInk, 0.7);
            float t = uTime;

            if (uKind < 0.5) {
              // Court Vision loop
              vec2 hoop = vec2(0.5, 0.70);
              float ring = abs(length(uv - hoop) - 0.13);
              col = mix(col, uSignal * 1.4, (1.0 - smoothstep(0.0, 0.025, ring)) * 0.95);
              // board
              if (uv.x > 0.30 && uv.x < 0.70 && uv.y > 0.78 && uv.y < 0.94) {
                col = mix(col, uSoft * 0.45, 0.55);
              }
              float cycle = mod(t, 3.0);
              float p = clamp(cycle / 1.55, 0.0, 1.0);
              vec2 start = vec2(0.5, 0.14);
              vec2 apex = vec2(0.5, 0.92);
              vec2 ball = mix(start, mix(apex, hoop, p), p);
              if (cycle > 1.55) {
                ball = vec2(0.5, 0.70 - (cycle - 1.55) * 0.22);
              }
              col = mix(col, uSignal * 1.6, circ(uv - ball, 0.055));
              if (cycle > 1.5 && cycle < 2.15) {
                col = mix(col, uMint, 0.45 * (1.0 - abs(cycle - 1.8) * 3.0));
              }
              // court line
              if (abs(uv.y - 0.18) < 0.008 && uv.x > 0.2 && uv.x < 0.8) col = mix(col, uSoft, 0.35);
            } else if (uKind < 1.5) {
              // Fifth Run
              for (int i = 0; i < 3; i++) {
                float lx = 0.28 + float(i) * 0.22;
                col = mix(col, uMint * 0.7, (1.0 - smoothstep(0.0, 0.018, abs(uv.x - lx))) * 0.55);
              }
              float scroll = fract(uv.y + t * 0.4);
              if (mod(floor(scroll * 5.0) + floor(uv.x * 10.0), 3.0) < 1.0 && uv.y > 0.35) {
                col = mix(col, vec3(0.25), 0.55);
              }
              float lane = floor(mod(t * 0.85, 3.0));
              vec2 runner = vec2(0.28 + lane * 0.22, 0.26);
              col = mix(col, uSignal * 1.5, circ(uv - runner, 0.055));
              col += uMint * 0.12 * (1.0 - uv.y);
            } else if (uKind < 2.5) {
              if (uv.x > 0.12 && uv.x < 0.88 && uv.y > 0.18 && uv.y < 0.82) {
                col = mix(col, vec3(0.04, 0.28, 0.14), 0.8);
              }
              for (int i = 0; i < 6; i++) {
                float a = float(i) * 1.047 + t * 0.25;
                vec2 c = vec2(0.5, 0.5) + vec2(cos(a), sin(a)) * 0.14;
                vec3 bc = mix(uSignal, uMint, float(i) / 6.0);
                col = mix(col, bc, circ(uv - c, 0.04));
              }
            } else {
              if (abs(uv.x - 0.5) < 0.28) col = mix(col, vec3(0.14), 0.7);
              float dash = step(0.5, fract(uv.y * 10.0 - t * 2.5));
              col = mix(col, uSoft * 0.7, dash * step(abs(uv.x - 0.5), 0.012) * 0.7);
              vec2 car = vec2(0.5 + sin(t * 1.4) * 0.12, 0.32);
              col = mix(col, uSignal * 1.4, circ(uv - car, 0.06));
            }

            float scan = 0.06 * sin(uv.y * 220.0 + t * 8.0);
            col += vec3(scan) * uLit;
            float vig = smoothstep(1.05, 0.3, length(uv - 0.5) * 1.35);
            col *= vig;
            col *= 0.25 + 0.85 * uLit;
            // glass edge
            float edge = smoothstep(0.02, 0.0, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
            col = mix(col, uMint * 0.4, edge * 0.35 * uLit);
            gl_FragColor = vec4(col, 0.95);
          }
        `}
      />
    </mesh>
  )
}
