/** Fifth Glide — shared materials: palette, instanced skyline towers, rim light, additive glows. */
import * as THREE from 'three'

export const PALETTE = {
  teal: new THREE.Color('#00e0d0'),
  coral: new THREE.Color('#ff4d5e'),
  purple: new THREE.Color('#8a4dff'),
  red: new THREE.Color('#dc283c'),
  gold: new THREE.Color('#ffc83c'),
  fog: new THREE.Color('#0c0a16'),
  horizon: new THREE.Color('#a04060'),
}

const NOISE = /* glsl */ `
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y);
}
`

export function towerMaterial(fogNear: number, fogFar: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFog: { value: PALETTE.fog.clone() },
      uFogNear: { value: fogNear },
      uFogFar: { value: fogFar },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      varying vec3 vLocal; varying vec3 vN; varying vec3 vWorld; varying float vSeed; varying vec3 vScale;
      void main(){
        vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vScale = sc;
        vLocal = (position + vec3(0.5, 0.0, 0.5)) * sc;
        vN = normal;
        vSeed = aSeed;
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform float uTime;
      varying vec3 vLocal; varying vec3 vN; varying vec3 vWorld; varying float vSeed; varying vec3 vScale;
      ${NOISE}
      void main(){
        float sd = vSeed;
        vec3 n = normalize(vN);
        float top = vScale.y;
        vec3 facade = mix(vec3(0.018,0.016,0.042), vec3(0.040,0.024,0.068), fract(sd*7.31));
        vec3 col = facade * (0.55 + 0.45 * smoothstep(0.0, top, vLocal.y));
        vec3 emis = vec3(0.0);
        if (n.y < 0.5) {
          vec2 uv = abs(n.x) > 0.5 ? vec2(vLocal.z, vLocal.y) : vec2(vLocal.x, vLocal.y);
          float fh = 3.2, cw = mix(1.8, 3.2, fract(sd*3.7));
          vec2 cell = floor(uv / vec2(cw, fh));
          vec2 cuv = uv / vec2(cw, fh);
          vec2 f = fract(cuv);
          vec2 fw = fwidth(cuv) * 0.75 + 1e-4;
          float wx = smoothstep(0.16 - fw.x, 0.16 + fw.x, f.x) * (1.0 - smoothstep(0.84 - fw.x, 0.84 + fw.x, f.x));
          float wy = smoothstep(0.22 - fw.y, 0.22 + fw.y, f.y) * (1.0 - smoothstep(0.78 - fw.y, 0.78 + fw.y, f.y));
          // sub-pixel cells resolve to their average coverage instead of shimmering
          float win = mix(wx * wy, 0.38, smoothstep(0.35, 0.8, max(fw.x, fw.y)));
          // mullion: thin dark frame split inside each lit pane
          win *= 1.0 - 0.55 * (1.0 - smoothstep(0.0, fw.x * 2.0 + 0.01, abs(f.x - 0.5))) * (1.0 - smoothstep(0.35, 0.8, max(fw.x, fw.y)));
          float density = mix(0.28, 0.62, fract(sd*11.3));
          float lit = step(1.0 - density, h21(cell + sd*91.7 + (abs(n.x) > 0.5 ? 13.0 : 0.0)));
          vec3 warm = vec3(1.0, 0.72, 0.38), cool = vec3(0.65, 0.8, 1.0), neonA = vec3(0.1, 1.0, 0.9), neonB = vec3(1.0, 0.35, 0.8);
          float pick = fract(sd*5.13);
          vec3 wc = pick < 0.45 ? warm : pick < 0.75 ? cool : pick < 0.88 ? neonA : neonB;
          wc *= 0.6 + 0.6 * h21(cell*1.7 + sd);
          float ground = step(vLocal.y, 4.0);
          emis += wc * win * lit * (1.0 - ground) * 1.05;
          // neon crown + vertical edge strips
          float crownOn = step(0.55, fract(sd*2.71));
          vec3 crownC = fract(sd*9.1) < 0.5 ? vec3(0.0,1.0,0.9) : (fract(sd*9.1) < 0.8 ? vec3(1.0,0.3,0.55) : vec3(0.65,0.35,1.0));
          emis += crownC * crownOn * (smoothstep(top - 1.2, top - 0.9, vLocal.y) - smoothstep(top - 0.6, top - 0.3, vLocal.y)) * 1.5;
          float w = abs(n.x) > 0.5 ? vScale.z : vScale.x;
          float edge = min(uv.x, w - uv.x);
          emis += crownC * crownOn * (1.0 - smoothstep(0.05, 0.14, edge)) * 0.6;
          // street-level storefront glow
          float sign = step(2.6, vLocal.y) * step(vLocal.y, 3.3);
          float shop = step(0.4, vLocal.y) * step(vLocal.y, 2.4) * step(0.18, fract(uv.x / 3.0)) * step(fract(uv.x / 3.0), 0.92);
          vec3 sc = mix(vec3(1.0,0.3,0.6), vec3(0.15,0.9,1.0), fract(sd*4.4));
          emis += (sc * sign * 1.0 + vec3(1.0,0.62,0.4) * shop * 0.07) * step(0.3, fract(sd*6.2));
        } else {
          col = vec3(0.02, 0.015, 0.04);
          // antenna beacon dot
        }
        col += emis;
        float d = length(vWorld - cameraPosition);
        col = mix(col, uFog, smoothstep(uFogNear, uFogFar, d) * 0.8);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
}

/** Fresnel rim light on a standard material (box-art neon outline). */
export function addRim(mat: THREE.MeshStandardMaterial, color: THREE.Color, strength = 1.4, power = 2.6) {
  const uniforms = { uRimColor: { value: color }, uRimStr: { value: strength }, uRimPow: { value: power } }
  mat.userData.rim = uniforms
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor; uniform float uRimStr; uniform float uRimPow;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), uRimPow);
        totalEmissiveRadiance += uRimColor * rimF * uRimStr;`,
      )
  }
  return mat
}

/** Additive unlit glow material. */
export function glowMaterial(tex: THREE.Texture, color: THREE.Color | string, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    map: tex,
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  })
}
