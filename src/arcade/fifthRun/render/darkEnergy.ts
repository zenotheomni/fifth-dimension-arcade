/**
 * Dark energy chaser — a wall of volumetric-looking black smoke behind the runner.
 * Stacked camera-facing slabs share one shader: domain-warped fbm smoke that billows up and
 * rolls toward the runner, dense near the ground and the lane edges (so the astronaut stays
 * readable), with faint violet energy filaments crackling inside. `threat` 0..1 pulls the wall in.
 */
import * as THREE from 'three'

const VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vW;
void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`

const FRAG = /* glsl */ `
uniform float uTime; uniform float uThreat; uniform float uLayer; uniform float uRunnerX; uniform float uFade;
varying vec2 vUv; varying vec3 vW;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){ s+=a*n(p); p=m*p; a*=0.5; } return s; }
void main(){
  float t = uTime;
  vec2 p = vec2(vW.x*1.3, vW.y*1.1) + vec2(uLayer*3.7, 0.0);
  // domain warp → billowing, curling smoke
  vec2 q = vec2(fbm(p + vec2(0.0, -t*0.55)), fbm(p + vec2(5.2, 1.3) - vec2(t*0.18, t*0.4)));
  float d = fbm(p*1.3 + q*1.8 + vec2(t*0.1, -t*0.7));
  // height falloff: thick at the ground, tendrils higher at the sides, clear lane around the runner
  float side = smoothstep(0.3, 1.35, abs(vW.x - uRunnerX));
  float top = mix(0.95, 4.2, side) + uThreat*0.9 + (d-0.5)*1.3;
  float hgt = 1.0 - smoothstep(top-0.8, top+0.2, vW.y);
  float dens = smoothstep(0.3, 0.72, d) * hgt;
  dens = clamp(dens*(1.0 + 0.4*uThreat) + hgt*(0.45*side + 0.15), 0.0, 0.97);
  // energy filaments: thin ridges of a second warped field
  float r = abs(fbm(p*2.1 - q*1.4 + vec2(-t*0.9, t*0.35)) - 0.5);
  float crack = (1.0 - smoothstep(0.0, 0.016, r)) * smoothstep(0.35, 0.8, dens);
  float flick = 0.55 + 0.45*sin(t*9.0 + vW.x*2.0 + uLayer*4.0);
  float lit = smoothstep(0.35, 0.9, fbm(p*2.6 + q*2.2 - vec2(0.0, t*0.9)));
  // smoky gray body (reads against the night) with dark churning cores
  float core = smoothstep(0.55, 0.85, d);
  vec3 smoke = mix(vec3(0.30,0.29,0.33), vec3(0.62,0.60,0.66), lit);
  smoke = mix(smoke, vec3(0.035,0.03,0.05), core*0.85);
  vec3 col = smoke + vec3(0.55,0.28,1.0) * crack * flick * (0.25 + 0.55*uThreat);
  // soft edges of the slab
  float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
  gl_FragColor = vec4(col, dens*edge*uFade);
}`

export class DarkEnergy {
  group = new THREE.Group()
  private mats: THREE.ShaderMaterial[] = []
  private z = 5

  constructor(layers = 4) {
    for (let i = 0; i < layers; i++) {
      const m = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uThreat: { value: 0 }, uLayer: { value: i }, uRunnerX: { value: 0 }, uFade: { value: 1 } },
        vertexShader: VERT,
        fragmentShader: FRAG,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(22, 7, 1, 1), m)
      mesh.position.set(0, 3.0, i * 0.7)
      mesh.renderOrder = 20 - i
      mesh.frustumCulled = false
      this.mats.push(m)
      this.group.add(mesh)
    }
  }

  /** threat 0..1 (1 = on your heels); fade 0 hides (logo surge leaves it behind). */
  update(time: number, dt: number, threat: number, runnerX: number, fade: number) {
    // distance behind the runner's feet: far edge of frame at 0 → right behind the heels at 1
    const target = 3.6 - threat * 2.8
    this.z += (target - this.z) * (1 - Math.exp(-dt * 4))
    this.group.position.z = this.z
    this.group.visible = fade > 0.01
    for (const m of this.mats) {
      m.uniforms.uTime.value = time
      m.uniforms.uThreat.value = threat
      m.uniforms.uRunnerX.value = runnerX
      m.uniforms.uFade.value = fade
    }
  }
}
