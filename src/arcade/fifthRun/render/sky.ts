/**
 * Fifth Glide — the void: Miami sunset at the start line, opening into deep space as distance grows.
 * Full-sphere sky (the path floats, so you see below the horizon too): sunset gradient + sun over a
 * dusk sea haze, crossfading (uSpace 0 → 1) to a nebula galaxy with dust lanes and a Milky-Way band.
 */
import * as THREE from 'three'

const NOISE3 = /* glsl */ `
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i+vec3(0,0,0)), h31(i+vec3(1,0,0)), f.x), mix(h31(i+vec3(0,1,0)), h31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i+vec3(0,0,1)), h31(i+vec3(1,0,1)), f.x), mix(h31(i+vec3(0,1,1)), h31(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * n3(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`

export function voidSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uSpace: { value: 0 },
      uSun: { value: new THREE.Vector3(0.25, 0.06, -1).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform float uTime;
      uniform float uSpace;
      uniform vec3 uSun;
      ${NOISE3}
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        // ── Miami sunset ──
        float sd = max(dot(d, uSun), 0.0);
        vec3 zen = vec3(0.035, 0.03, 0.11);
        vec3 hi = vec3(0.16, 0.06, 0.28);
        vec3 mid = vec3(0.62, 0.16, 0.36);
        vec3 hor = vec3(1.25, 0.42, 0.22);
        vec3 sunset = mix(hor, mid, smoothstep(0.0, 0.1, h));
        sunset = mix(sunset, hi, smoothstep(0.08, 0.35, h));
        sunset = mix(sunset, zen, smoothstep(0.3, 0.9, h));
        // thin cirrus streaks lit from below
        float cl = fbm3(vec3(d.x * 3.0, d.y * 14.0, d.z * 3.0) + vec3(uTime * 0.01, 0.0, 0.0));
        sunset += vec3(1.0, 0.45, 0.35) * smoothstep(0.55, 0.85, cl) * smoothstep(0.02, 0.1, h) * (1.0 - smoothstep(0.15, 0.4, h)) * 0.35;
        // below the horizon: warm haze over the dark sea, sun glitter
        vec3 sea = mix(vec3(0.5, 0.16, 0.2), vec3(0.03, 0.02, 0.07), smoothstep(-0.0, -0.35, h));
        sea += vec3(1.0, 0.5, 0.25) * pow(max(dot(normalize(vec3(d.x, -d.y, d.z)), uSun), 0.0), 60.0) * 0.6 * smoothstep(0.0, -0.05, h);
        sunset = h < 0.0 ? sea : sunset;
        // sun disc + glow (sinking into the horizon)
        sunset += vec3(1.4, 0.75, 0.35) * pow(sd, 18.0) * 0.9;
        sunset += vec3(2.4, 1.6, 0.9) * smoothstep(0.9993, 0.9996, sd) * step(-0.004, h);
        // ── deep space ──
        vec3 q = d * 2.2;
        float neb = fbm3(q + vec3(0.0, 0.0, uTime * 0.004));
        float neb2 = fbm3(q * 1.8 + 5.3);
        float dust = smoothstep(0.42, 0.7, fbm3(q * 3.1 + 19.0));
        // Milky-Way band around a tilted great circle
        float band = exp(-pow(dot(d, normalize(vec3(0.35, 0.82, 0.45))) * 3.2, 2.0));
        vec3 space = vec3(0.004, 0.003, 0.014);
        space += vec3(0.42, 0.12, 0.62) * pow(neb, 2.6) * 0.9;
        space += vec3(0.0, 0.45, 0.5) * pow(neb2, 3.5) * 0.7;
        space += vec3(1.0, 0.35, 0.28) * pow(neb * neb2, 2.4) * 0.8;
        space += vec3(0.75, 0.62, 0.85) * band * (0.08 + 0.25 * fbm3(d * 9.0)) ;
        space *= 1.0 - dust * 0.75;
        // fine star dust
        vec3 c = floor(d * 380.0);
        float st = h31(c);
        space += vec3(1.0, 0.95, 1.0) * step(0.9975, st) * (0.6 + 0.4 * sin(uTime * 2.0 + st * 80.0)) * 1.5;
        space += vec3(0.8, 0.85, 1.0) * step(0.985, st) * 0.12 * (0.3 + band);
        // below: darker abyss
        space *= mix(1.0, 0.55, smoothstep(0.0, -0.8, h));
        vec3 col = mix(sunset, space, uSpace);
        // dusk stars already in the upper sky at the start
        col += vec3(1.0) * step(0.9985, st) * smoothstep(0.25, 0.6, h) * (1.0 - uSpace) * 0.6;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
}
