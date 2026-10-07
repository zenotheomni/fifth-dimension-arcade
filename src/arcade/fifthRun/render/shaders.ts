/** Fifth Glide — custom materials: sky dome, wet neon road (planar reflection), instanced towers. */
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

export function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTime: { value: 0 }, uBiome: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform float uTime;
      uniform float uBiome;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        float b = clamp(uBiome, 0.0, 1.0);
        // Miami night
        vec3 zen0 = vec3(0.004,0.006,0.022);
        vec3 up0  = vec3(0.015,0.020,0.055);
        vec3 mid0 = vec3(0.030,0.016,0.062);
        vec3 hor0 = vec3(0.095,0.028,0.060);
        // Cosmic / nebula highway
        vec3 zen1 = vec3(0.01,0.002,0.04);
        vec3 up1  = vec3(0.04,0.01,0.12);
        vec3 mid1 = vec3(0.12,0.03,0.22);
        vec3 hor1 = vec3(0.05,0.12,0.28);
        // Deep galaxy
        vec3 zen2 = vec3(0.002,0.001,0.012);
        vec3 up2  = vec3(0.02,0.005,0.08);
        vec3 mid2 = vec3(0.08,0.02,0.18);
        vec3 hor2 = vec3(0.25,0.04,0.35);
        vec3 zen = mix(mix(zen0, zen1, min(1.0, b*2.0)), zen2, smoothstep(0.5, 1.0, b));
        vec3 up  = mix(mix(up0, up1, min(1.0, b*2.0)), up2, smoothstep(0.5, 1.0, b));
        vec3 mid = mix(mix(mid0, mid1, min(1.0, b*2.0)), mid2, smoothstep(0.5, 1.0, b));
        vec3 hor = mix(mix(hor0, hor1, min(1.0, b*2.0)), hor2, smoothstep(0.5, 1.0, b));
        vec3 col;
        if (h > 0.0) {
          col = mix(hor, mid, smoothstep(0.0, 0.07, h));
          col = mix(col, up, smoothstep(0.05, 0.22, h));
          col = mix(col, zen, smoothstep(0.22, 0.75, h));
        } else {
          col = mix(hor*0.7, vec3(0.03,0.01,0.05), smoothstep(0.0, 0.25, -h));
        }
        float vp = max(dot(d, normalize(vec3(0.0, 0.03, -1.0))), 0.0);
        // city warm glow fades → cosmic teal/magenta beam
        vec3 cityGlow = vec3(1.0,0.55,0.35) * pow(vp, 90.0) * 0.32 + vec3(0.25,0.7,0.75) * pow(vp, 12.0) * 0.04;
        vec3 spaceGlow = vec3(0.4,0.2,1.0) * pow(vp, 40.0) * 0.7 + vec3(0.1,0.9,0.85) * pow(vp, 10.0) * 0.25;
        col += mix(cityGlow, spaceGlow, b);
        col += mix(vec3(0.85,0.35,0.25), vec3(0.5,0.15,0.85), b) * exp(-abs(h)*48.0) * 0.045;
        // nebula wisps in space biomes
        float n = sin(d.x * 8.0 + uTime * 0.05) * cos(d.z * 6.0 - uTime * 0.03);
        col += vec3(0.35,0.1,0.55) * max(0.0, n) * b * 0.12 * max(0.0, h);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
}

export function roadMaterial(reflTex: THREE.Texture | null) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uScroll: { value: 0 },
      uTime: { value: 0 },
      uRefl: { value: reflTex },
      uReflOn: { value: reflTex ? 1 : 0 },
      uTexMat: { value: new THREE.Matrix4() },
      uCam: { value: new THREE.Vector3() },
      uFog: { value: PALETTE.fog.clone() },
      uBoost: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform mat4 uTexMat;
      varying vec4 vReflUv;
      varying vec3 vWorld;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vWorld = wp.xyz;
        vReflUv = uTexMat * wp;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uScroll; uniform float uTime; uniform sampler2D uRefl; uniform float uReflOn;
      uniform vec3 uCam; uniform vec3 uFog; uniform float uBoost;
      varying vec4 vReflUv; varying vec3 vWorld;
      ${NOISE}
      float band(float x, float c, float w, float aa){ return 1.0 - smoothstep(w, w + aa, abs(x - c)); }
      void main(){
        float x = vWorld.x;
        float s = uScroll - vWorld.z;
        float ax = abs(x);
        float aa = fwidth(x) * 0.9 + 0.0015;
        float dist = length(vWorld - uCam);

        // asphalt with aggregate grain
        float g1 = vnoise(vec2(x*2.2, s*2.2));
        float g2 = vnoise(vec2(x*9.0, s*9.0));
        float g3 = h21(floor(vec2(x*70.0, s*70.0)));
        float grainFade = 1.0 - smoothstep(10.0, 60.0, dist);
        vec3 col = vec3(0.035,0.032,0.040) * (0.82 + 0.25*g1 + (0.18*g2 + 0.14*g3) * grainFade);
        // patched slabs
        float slab = vnoise(vec2(floor(x/3.0), floor(s/14.0)) * 3.1);
        col *= 0.92 + slab * 0.14;

        // sidewalk / curb
        if (ax > 4.45) {
          vec2 t = vec2(ax - 4.45, s) / 1.6;
          vec2 f = abs(fract(t) - 0.5);
          float grout = smoothstep(0.47, 0.5, max(f.x, f.y));
          col = vec3(0.050,0.040,0.075) * (0.85 + 0.3*h21(floor(t))) * (1.0 - grout*0.5);
        }
        float curb = band(ax, 4.45, 0.12, aa);
        col = mix(col, vec3(0.16,0.14,0.2), curb);

        vec3 emis = vec3(0.0);
        // dashed lane dividers (white-lavender)
        float fs = fwidth(s/9.0) + 0.002;
        float dash = smoothstep(0.0, fs, fract(s/9.0)) * (1.0 - smoothstep(0.42 - fs, 0.42, fract(s/9.0)));
        emis += vec3(0.95,0.92,1.08) * band(ax, 1.0, 0.05, aa) * dash * 0.85;
        // neon edge pairs: left teal + coral, right coral + purple (box art)
        vec3 teal = vec3(0.0,0.95,0.85), coral = vec3(1.0,0.28,0.36), purp = vec3(0.6,0.3,1.0);
        float li = band(x, -3.25, 0.07, aa), lo = band(x, -3.62, 0.05, aa);
        float ri = band(x,  3.25, 0.07, aa), ro = band(x,  3.62, 0.05, aa);
        emis += teal * li * 1.35 + coral * lo * 0.95 + coral * ri * 1.35 + purp * ro * 1.05;
        // curb neon strip (purple), pulsing segments
        emis += purp * band(ax, 4.38, 0.03, aa) * (0.45 + 0.25*step(0.5, fract(s/6.0 - uTime*0.0)));
        // coloured light spill on the wet surface
        vec3 spill = teal * exp(-abs(x + 3.3) * 2.2) + coral * exp(-abs(x - 3.3) * 2.2);
        spill += vec3(0.7,0.65,1.0) * exp(-abs(ax - 1.0) * 6.0) * dash * 0.12;

        // wetness: puddles + overall damp sheen
        float wetN = vnoise(vec2(x*0.45, s*0.11)) * 0.65 + vnoise(vec2(x*1.6, s*0.5)) * 0.35;
        float wet = mix(0.42, 1.0, smoothstep(0.42, 0.62, wetN));
        if (ax > 4.45) wet *= 0.45;

        vec3 refl = vec3(0.0);
        if (uReflOn > 0.5) {
          vec4 r = vReflUv;
          float rip = (vnoise(vec2(x*3.0, s*0.6)) - 0.5) * (1.1 - wet);
          r.x += rip * 0.012 * r.w;
          vec3 a = texture2DProj(uRefl, r).rgb;
          vec4 r2 = r; r2.y -= 0.012 * r.w;
          vec4 r3 = r; r3.y -= 0.028 * r.w;
          refl = (a * 0.5 + texture2DProj(uRefl, r2).rgb * 0.3 + texture2DProj(uRefl, r3).rgb * 0.2) * 0.62;
        } else {
          refl = mix(vec3(0.5,0.15,0.4), vec3(0.08,0.03,0.15), smoothstep(40.0, 4.0, dist));
        }
        vec3 V = normalize(uCam - vWorld);
        float fres = 0.05 + 0.95 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
        float rk = mix(0.28, 0.95, fres) * wet;
        col = col * (1.0 - rk * 0.5) + refl * rk + spill * (0.05 + 0.12*wet) + emis * (1.0 + uBoost * 0.6);

        col = mix(col, uFog, smoothstep(90.0, 380.0, dist) * 0.85);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
}

/** Instanced towers: procedural window grid + neon trims, distance fog. Box geometry base at y=0. */
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
