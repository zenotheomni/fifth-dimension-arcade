import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { PALETTE_HEX } from '../palette'

type PreviewKind = 'court' | 'runner' | 'pool' | 'drift'

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
    <mesh position={[0, 1.15, 0.49]}>
      <planeGeometry args={[1.08, 0.9]} />
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
            return 1.0 - smoothstep(r - 0.008, r + 0.008, length(p));
          }
          float segment(vec2 p, vec2 a, vec2 b, float w) {
            vec2 pa = p - a, ba = b - a;
            float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
            return 1.0 - smoothstep(0.0, w, length(pa - ba * h));
          }

          void main() {
            vec2 uv = vUv;
            vec3 col = mix(uVoid, uInk, 0.75);
            float t = uTime;

            if (uKind < 0.5) {
              // Court Vision — clear hoop + arcing ball
              vec2 hoop = vec2(0.5, 0.68);
              // backboard
              if (uv.x > 0.28 && uv.x < 0.72 && uv.y > 0.76 && uv.y < 0.94) {
                col = mix(col, uSoft * 0.5, 0.55);
                if (uv.x > 0.38 && uv.x < 0.62 && uv.y > 0.8 && uv.y < 0.9)
                  col = mix(col, vec3(0.4), 0.4);
              }
              // rim
              float ring = abs(length(uv - hoop) - 0.14);
              col = mix(col, uSignal * 1.5, (1.0 - smoothstep(0.0, 0.022, ring)) * 0.95);
              // net lines
              for (int i = 0; i < 6; i++) {
                float a = float(i) / 6.0 * 6.28318;
                vec2 top = hoop + vec2(cos(a), sin(a)) * 0.13;
                vec2 bot = hoop + vec2(cos(a)*0.35, -0.22 + sin(a)*0.05);
                col = mix(col, uSoft, segment(uv, top, bot, 0.008) * 0.55);
              }
              // pole
              col = mix(col, vec3(0.3), segment(uv, vec2(0.5, 0.55), vec2(0.5, 0.05), 0.012) * 0.5);
              // ball arc 3s loop
              float cycle = mod(t, 3.0);
              float p = clamp(cycle / 1.5, 0.0, 1.0);
              vec2 start = vec2(0.5, 0.12);
              vec2 apex = vec2(0.5 + sin(t*0.2)*0.04, 0.92);
              vec2 ball = mix(start, mix(apex, hoop + vec2(0.0, -0.02), smoothstep(0.0,1.0,p)), p);
              if (cycle > 1.5) {
                ball = vec2(0.5, mix(0.68, 0.35, clamp((cycle-1.5)/0.8, 0.0, 1.0)));
              }
              col = mix(col, uSignal * 1.7, circ(uv - ball, 0.055));
              // floor line
              col = mix(col, uSoft, segment(uv, vec2(0.15, 0.1), vec2(0.85, 0.1), 0.01) * 0.4);
              if (cycle > 1.45 && cycle < 2.1) {
                col = mix(col, uMint, 0.4 * (1.0 - abs(cycle - 1.75) * 2.5));
              }
            } else if (uKind < 1.5) {
              // Fifth Run — 3 lanes + runner body
              col = mix(col, vec3(0.05, 0.04, 0.1), 0.5);
              for (int i = 0; i < 3; i++) {
                float lx = 0.26 + float(i) * 0.24;
                col = mix(col, uMint * 0.8, (1.0 - smoothstep(0.0, 0.015, abs(uv.x - lx))) * 0.65);
              }
              // scrolling obstacles
              float scroll = uv.y + t * 0.45;
              for (int k = 0; k < 4; k++) {
                float yy = fract(scroll * 0.55 + float(k) * 0.25);
                float lx = 0.26 + mod(float(k), 3.0) * 0.24;
                if (abs(uv.x - lx) < 0.07 && abs(uv.y - yy) < 0.05 && uv.y > 0.35) {
                  col = mix(col, vec3(0.25), 0.7);
                }
              }
              // neon city windows
              col += uMint * 0.06 * (1.0 - uv.y) * step(0.05, fract(uv.x * 10.0 + t));
              // runner (capsule-ish)
              float lane = floor(mod(t * 0.9, 3.0));
              vec2 r = vec2(0.26 + lane * 0.24, 0.24);
              col = mix(col, uSignal * 1.4, circ(uv - r, 0.04));
              col = mix(col, uSignal, circ(uv - (r + vec2(0.0, 0.07)), 0.028));
              // legs
              col = mix(col, uSoft * 0.7, segment(uv, r + vec2(-0.02,-0.02), r + vec2(-0.03,-0.08), 0.01));
              col = mix(col, uSoft * 0.7, segment(uv, r + vec2(0.02,-0.02), r + vec2(0.03,-0.08), 0.01));
            } else if (uKind < 2.5) {
              if (uv.x > 0.12 && uv.x < 0.88 && uv.y > 0.18 && uv.y < 0.82)
                col = mix(col, vec3(0.04, 0.28, 0.14), 0.85);
              for (int i = 0; i < 6; i++) {
                float a = float(i) * 1.047 + t * 0.3;
                vec2 c = vec2(0.5) + vec2(cos(a), sin(a)) * 0.15;
                col = mix(col, mix(uSignal, uMint, float(i)/6.0), circ(uv - c, 0.038));
              }
            } else {
              if (abs(uv.x - 0.5) < 0.28) col = mix(col, vec3(0.12), 0.75);
              float dash = step(0.5, fract(uv.y * 10.0 - t * 2.5));
              col = mix(col, uSoft * 0.7, dash * step(abs(uv.x - 0.5), 0.012) * 0.7);
              vec2 car = vec2(0.5 + sin(t * 1.5) * 0.12, 0.32);
              col = mix(col, uSignal * 1.4, circ(uv - car, 0.055));
            }

            float scan = 0.05 * sin(uv.y * 220.0 + t * 8.0);
            col += vec3(scan) * uLit;
            float vig = smoothstep(1.0, 0.28, length(uv - 0.5) * 1.4);
            col *= vig;
            col *= 0.28 + 0.82 * uLit;
            float edge = smoothstep(0.02, 0.0, min(min(uv.x, 1.0-uv.x), min(uv.y, 1.0-uv.y)));
            col = mix(col, uMint * 0.35, edge * 0.3 * uLit);
            gl_FragColor = vec4(col, 0.96);
          }
        `}
      />
    </mesh>
  )
}
