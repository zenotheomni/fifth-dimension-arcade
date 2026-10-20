/**
 * Fifth Glide — deep-space set dressing: planets that pass by during the run (Earth, Saturn with
 * rings, Jupiter, Mars, Neptune, the Moon), spiral galaxies, black holes with glowing accretion discs,
 * and the occasional UFO flying across the sky. All procedural shaders (smooth, no blocky geometry).
 *
 * Everything lives in the sky group (centred on the camera, world-yaw frame). Bodies are placed by a
 * world azimuth so a 90° turn swings them naturally; as you run they drift outward and behind you,
 * then recycle ahead with the next body.
 */
import * as THREE from 'three'

const NOISE = /* glsl */ `
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i), h31(i+vec3(1,0,0)), f.x), mix(h31(i+vec3(0,1,0)), h31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i+vec3(0,0,1)), h31(i+vec3(1,0,1)), f.x), mix(h31(i+vec3(0,1,1)), h31(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * n3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
`

export type PlanetKind = 'earth' | 'saturn' | 'jupiter' | 'mars' | 'neptune' | 'moon' | 'mercury' | 'venus' | 'uranus' | 'pluto' | 'io' | 'europa'
const KIND_ID: Record<PlanetKind, number> = { earth: 0, saturn: 1, jupiter: 2, mars: 3, neptune: 4, moon: 5, mercury: 6, venus: 7, uranus: 8, pluto: 9, io: 10, europa: 11 }

function planetMaterial(kind: PlanetKind) {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uKind: { value: KIND_ID[kind] }, uA: { value: 0 }, uTime: { value: 0 }, uLight: { value: new THREE.Vector3(-0.55, 0.35, 0.75).normalize() } },
    vertexShader: /* glsl */ `varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform int uKind; uniform float uA; uniform float uTime; uniform vec3 uLight; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      ${NOISE}
      void main(){
        vec3 p = normalize(vP);
        vec3 col; vec3 atmo = vec3(0.0);
        if (uKind == 0) {
          float land = smoothstep(0.52, 0.56, fbm(p * 2.6 + 3.0));
          float ice = smoothstep(0.82, 0.9, abs(p.y));
          vec3 ocean = mix(vec3(0.02, 0.09, 0.28), vec3(0.04, 0.2, 0.42), fbm(p * 6.0));
          vec3 ground = mix(vec3(0.12, 0.3, 0.08), vec3(0.45, 0.36, 0.2), fbm(p * 5.0 + 9.0));
          col = mix(ocean, ground, land);
          col = mix(col, vec3(0.9), ice);
          float cl = smoothstep(0.5, 0.75, fbm(p * 4.0 + vec3(uTime * 0.01, 0.0, 0.0)));
          col = mix(col, vec3(0.95), cl * 0.85);
          atmo = vec3(0.3, 0.6, 1.0);
        } else if (uKind == 1) {
          float b = fbm(vec3(p.y * 18.0, p.y * 3.0, 0.5)) ;
          col = mix(vec3(0.75, 0.62, 0.42), vec3(0.92, 0.82, 0.6), b);
          atmo = vec3(0.9, 0.75, 0.5) * 0.4;
        } else if (uKind == 2) {
          float w = fbm(vec3(p.x * 3.0, p.y * 2.0, p.z * 3.0)) * 0.6;
          float b = sin((p.y + w * 0.12) * 34.0);
          col = mix(vec3(0.62, 0.42, 0.28), vec3(0.93, 0.85, 0.74), 0.5 + 0.5 * b);
          col *= 0.85 + 0.3 * fbm(p * 8.0);
          float spot = 1.0 - smoothstep(0.08, 0.13, length(vec2((p.x - 0.55) * 0.7, p.y + 0.32)));
          col = mix(col, vec3(0.72, 0.28, 0.16), spot * step(0.0, p.z));
          atmo = vec3(0.9, 0.7, 0.5) * 0.3;
        } else if (uKind == 3) {
          float t = fbm(p * 3.5 + 1.0);
          col = mix(vec3(0.45, 0.14, 0.05), vec3(0.78, 0.36, 0.16), t);
          col = mix(col, vec3(0.92, 0.88, 0.85), smoothstep(0.9, 0.95, p.y));
          atmo = vec3(1.0, 0.5, 0.3) * 0.25;
        } else if (uKind == 4) {
          float b = fbm(vec3(p.y * 10.0, p.x * 2.0, p.z * 2.0));
          col = mix(vec3(0.08, 0.22, 0.65), vec3(0.25, 0.48, 0.9), b);
          atmo = vec3(0.4, 0.6, 1.0) * 0.6;
        } else if (uKind == 6) {
          float cr = smoothstep(0.5, 0.6, fbm(p * 7.0)) * 0.4;
          col = mix(vec3(0.5, 0.46, 0.42), vec3(0.3, 0.28, 0.26), cr + fbm(p * 15.0) * 0.3);
        } else if (uKind == 7) {
          float w = fbm(vec3(p.x * 2.0 + p.y * 3.0, p.y * 5.0, p.z * 2.0) + vec3(uTime * 0.005));
          col = mix(vec3(0.85, 0.66, 0.36), vec3(1.0, 0.9, 0.66), w);
          atmo = vec3(1.0, 0.8, 0.5) * 0.5;
        } else if (uKind == 8) {
          col = mix(vec3(0.55, 0.82, 0.86), vec3(0.68, 0.9, 0.92), 0.5 + 0.5 * sin(p.y * 14.0) * 0.3);
          atmo = vec3(0.6, 0.95, 1.0) * 0.5;
        } else if (uKind == 9) {
          float heart = 1.0 - smoothstep(0.25, 0.32, length(vec2(p.x - 0.2, p.y + 0.1)));
          col = mix(vec3(0.55, 0.45, 0.38), vec3(0.85, 0.78, 0.68), max(heart * step(0.0, p.z), fbm(p * 6.0) * 0.4));
        } else if (uKind == 10) {
          float sp = smoothstep(0.6, 0.66, fbm(p * 9.0));
          col = mix(vec3(0.9, 0.78, 0.3), vec3(0.95, 0.55, 0.15), fbm(p * 4.0));
          col = mix(col, vec3(0.25, 0.12, 0.05), sp);
        } else if (uKind == 11) {
          float cr = smoothstep(0.02, 0.0, abs(fbm(p * 5.0) - 0.5));
          col = mix(vec3(0.88, 0.86, 0.82), vec3(0.55, 0.32, 0.2), cr);
        } else {
          float cr = smoothstep(0.55, 0.62, fbm(p * 5.0)) * 0.35;
          col = mix(vec3(0.62), vec3(0.4), cr + fbm(p * 12.0) * 0.25);
        }
        float l = clamp(dot(vN, uLight) * 1.15 + 0.03, 0.0, 1.0);
        float rim = pow(1.0 - clamp(dot(vN, vV), 0.0, 1.0), 2.5);
        vec3 c = col * l + atmo * rim * (0.25 + l * 1.2);
        gl_FragColor = vec4(c, uA);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
}

function ringMaterial(inner: number, outer: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: { uA: { value: 0 }, uIn: { value: inner }, uOut: { value: outer } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: /* glsl */ `uniform float uA; uniform float uIn; uniform float uOut; varying vec3 vP;
      void main(){ float t = (length(vP.xy) - uIn) / (uOut - uIn);
        float b = 0.55 + 0.25 * sin(t * 90.0) + 0.2 * sin(t * 23.0);
        float gap = 1.0 - 0.85 * (1.0 - smoothstep(0.0, 0.03, abs(t - 0.62)));
        float a = smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.9, t) * b * gap * 0.85;
        gl_FragColor = vec4(vec3(0.95, 0.83, 0.62) * a * 1.15, a * uA); }`,
  })
}

/** Spiral galaxy billboard (tilted disc, log-spiral arms, warm core). */
function galaxyMaterial(seed: number, tint: THREE.Color) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uA: { value: 0 }, uSeed: { value: seed }, uTint: { value: tint }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: /* glsl */ `uniform float uA; uniform float uSeed; uniform vec3 uTint; uniform float uTime; varying vec2 vUv;
      ${NOISE}
      void main(){
        vec2 q = (vUv - 0.5) * 2.0;
        float r = length(q); float th = atan(q.y, q.x);
        float arms = pow(0.5 + 0.5 * cos(2.0 * (th - log(r + 0.02) * 2.4 - uTime * 0.01 + uSeed)), 3.0);
        float dust = fbm(vec3(q * 6.0, uSeed));
        float disc = exp(-r * 3.2);
        float core = exp(-r * 18.0);
        vec3 c = uTint * arms * disc * (0.6 + 0.8 * dust) * 1.6 + vec3(1.0, 0.85, 0.6) * core * 2.2 + uTint * disc * 0.25;
        c *= smoothstep(1.0, 0.7, r);
        gl_FragColor = vec4(c * uA, 1.0);
      }`,
  })
}

/** Black hole billboard: event horizon, photon ring, tilted accretion disc (Doppler-bright side), lensing halo. */
function blackHoleMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uA: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: /* glsl */ `uniform float uA; uniform float uTime; varying vec2 vUv;
      ${NOISE}
      void main(){
        vec2 q = (vUv - 0.5) * 2.0;
        float r = length(q);
        // accretion disc: ellipse (tilted ~75°) in front + lensed arc over the top
        vec2 e = vec2(q.x, q.y / 0.26);
        float er = length(e);
        float ring = smoothstep(0.32, 0.4, er) * smoothstep(0.95, 0.5, er);
        float sw = fbm(vec3(atan(e.y, e.x) * 3.0 - uTime * 0.6, er * 8.0, 1.0));
        float dop = 0.55 + 0.6 * smoothstep(-0.8, 0.8, -q.x);
        vec3 hot = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.92, 0.75), sw);
        vec3 c = hot * ring * (0.5 + sw) * dop * 1.8;
        // lensed back side of the disc arcing over the shadow
        float arc = smoothstep(0.06, 0.0, abs(r - 0.36)) * smoothstep(-0.05, 0.25, q.y);
        c += hot * arc * 1.2;
        float photon = smoothstep(0.025, 0.0, abs(r - 0.3));
        c += vec3(1.0, 0.8, 0.6) * photon * 1.6;
        c += vec3(0.6, 0.3, 0.9) * exp(-r * 3.5) * 0.25;
        // event horizon: occludes the disc behind it (only the front band crosses it)
        float front = step(0.0, -q.y) * ring;
        float shadow = 1.0 - smoothstep(0.27, 0.29, r);
        float a = max(shadow * (1.0 - front), max(max(ring, arc), photon) * 0.95);
        c = mix(c, vec3(0.0), shadow * (1.0 - front));
        // gravitational lensing: a thin bright Einstein ring and a soft bluish halo of bent starlight
        float ein = smoothstep(0.035, 0.0, abs(r - 0.52)) * (0.7 + 0.3 * sin(atan(q.y, q.x) * 7.0 + uTime));
        c += vec3(0.75, 0.85, 1.0) * ein * 0.9 + vec3(0.35, 0.45, 0.9) * exp(-abs(r - 0.55) * 9.0) * 0.35;
        a = max(a, ein * 0.8);
        a = max(a, smoothstep(1.0, 0.3, r) * 0.15);
        gl_FragColor = vec4(c, a * uA);
      }`,
  })
}

type Body = {
  g: THREE.Object3D
  mats: THREE.ShaderMaterial[]
  /** world azimuth (rad), elevation (rad), distance */
  az: number
  el: number
  dist: number
  /** scale multiplier for this pass (close flybys are huge) */
  big?: number
  /** −1 / 1: the side of the heading it drifts toward */
  side: number
  rate: number
  live: boolean
  billboard: boolean
}

function makeSaucer() {
  const g = new THREE.Group()
  const prof = [new THREE.Vector2(0, -0.12), new THREE.Vector2(0.45, -0.1), new THREE.Vector2(0.92, -0.03), new THREE.Vector2(1, 0), new THREE.Vector2(0.9, 0.05), new THREE.Vector2(0.5, 0.1), new THREE.Vector2(0, 0.11)]
  g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 40), new THREE.MeshStandardMaterial({ color: '#c8ccd8', metalness: 0.7, roughness: 0.3, emissive: new THREE.Color('#1f2944'), emissiveIntensity: 1 })))
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#b8c4d0', emissive: new THREE.Color('#6a8090'), emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.3 }))
  dome.position.y = 0.08
  g.add(dome)
  const lightMat = new THREE.MeshBasicMaterial({ color: '#d8dce6' })
  for (let i = 0; i < 10; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), lightMat)
    const a = (i / 10) * Math.PI * 2
    b.position.set(Math.cos(a), 0, Math.sin(a))
    g.add(b)
  }
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 24),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying vec2 vUv; void main(){ float r = length(vUv-0.5)*2.0; float g = 1.0 - smoothstep(0.0,1.0,r); gl_FragColor = vec4(vec3(0.35,0.4,0.5)*g*g, 1.0); }',
    }),
  )
  glow.rotation.x = Math.PI / 2
  glow.position.y = -0.14
  g.add(glow)
  g.traverse((o) => (o.frustumCulled = false))
  return g
}

/** Sleek starship: tapered hull, swept wings, cockpit glint, twin engine glows + a fading trail. */
function makeShip(tint: string) {
  const g = new THREE.Group()
  const hullMat = new THREE.MeshStandardMaterial({ color: '#9aa3b4', metalness: 0.85, roughness: 0.28, emissive: new THREE.Color('#141a2a'), emissiveIntensity: 1 })
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.32, 3.2, 10), hullMat)
  hull.rotation.x = -Math.PI / 2 // nose along −Z
  g.add(hull)
  const wingGeo = new THREE.BufferGeometry()
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.4, 1.9, 0, 1.2, 0, 0, 1.3, 0, 0, -0.4, 0, 0, 1.3, -1.9, 0, 1.2], 3))
  wingGeo.computeVertexNormals()
  g.add(new THREE.Mesh(wingGeo, new THREE.MeshStandardMaterial({ color: '#6d7588', metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide })))
  const cock = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: '#0a1a2a', emissive: new THREE.Color('#5fd8ff'), emissiveIntensity: 1.2, metalness: 0.3, roughness: 0.1 }))
  cock.scale.set(1, 0.7, 2)
  cock.position.set(0, 0.16, -0.5)
  g.add(cock)
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(3), toneMapped: false })
  for (const x of [-0.22, 0.22]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), glowMat)
    e.position.set(x, 0, 1.62)
    g.add(e)
  }
  const trail = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 7),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uC: { value: new THREE.Color(tint) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uC; varying vec2 vUv; void main(){ float a = pow(vUv.y, 2.0) * (1.0 - smoothstep(0.1, 0.5, abs(vUv.x-0.5))); gl_FragColor = vec4(uC * a * 1.6, 1.0); }',
    }),
  )
  trail.rotation.x = -Math.PI / 2
  trail.position.z = 5.1
  g.add(trail)
  g.traverse((o) => (o.frustumCulled = false))
  return g
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export class Cosmos {
  group = new THREE.Group()
  private planets: Body[] = []
  private holes: Body[] = []
  private galaxies: Body[] = []
  /** the sky changes gradually: the inner worlds first, the gas giants and the far dwarfs later on */
  private order: PlanetKind[] = ['moon', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'io', 'saturn', 'europa', 'uranus', 'neptune', 'pluto']
  private next = 0
  private lastS = 0
  private rng = 1
  private saucers: { g: THREE.Group; t: number; dur: number; wait: number; a: THREE.Vector3; b: THREE.Vector3; spin: number }[] = []
  private ships: { g: THREE.Group; t: number; dur: number; wait: number; a: THREE.Vector3; b: THREE.Vector3; spin: number }[] = []
  private tmp = new THREE.Vector3()
  private camPos = new THREE.Vector3()
  /** world-space flyby root (scene child, camera frame) */
  flyers = new THREE.Group()

  constructor() {
    for (const k of this.order) this.planets.push(this.makePlanet(k))
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blackHoleMaterial())
      this.holes.push(this.body(m, [m.material as THREE.ShaderMaterial], true))
    }
    const gt = ['#b48cff', '#7fd4ff', '#ffb8d8', '#9fffe0']
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), galaxyMaterial(i * 1.7, new THREE.Color(gt[i % 4])))
      const b = this.body(m, [m.material as THREE.ShaderMaterial], true)
      b.live = true
      b.az = (i / 8) * Math.PI * 2 + 0.25
      b.el = 0.16 + 0.12 * (i % 3)
      b.dist = 1300
      m.scale.set(230 + (i % 4) * 40, 140 + (i % 3) * 30, 1)
      m.userData.roll = i * 0.9
      this.galaxies.push(b)
    }
    const tints = ['#2de2e6', '#ff6f61', '#9d4dff', '#ffc94a', '#2de2e6']
    for (let i = 0; i < 5; i++) {
      const g = makeShip(tints[i])
      g.visible = false
      this.flyers.add(g)
      this.ships.push({ g, t: 0, dur: 3, wait: 2 + i * 2.6, a: new THREE.Vector3(), b: new THREE.Vector3(), spin: 0 })
    }
    for (let i = 0; i < 2; i++) {
      const g = makeSaucer()
      g.visible = false
      this.flyers.add(g)
      this.saucers.push({ g, t: 0, dur: 3, wait: 4 + i * 5, a: new THREE.Vector3(), b: new THREE.Vector3(), spin: 0 })
    }
  }

  private r() {
    // tiny LCG (visual only)
    this.rng = (this.rng * 16807) % 2147483647
    return this.rng / 2147483647
  }

  private body(g: THREE.Object3D, mats: THREE.ShaderMaterial[], billboard: boolean): Body {
    g.visible = false
    g.traverse((o) => (o.frustumCulled = false))
    this.group.add(g)
    return { g, mats, az: 0, el: 0, dist: 1000, side: 1, rate: 0, live: false, billboard }
  }

  private makePlanet(kind: PlanetKind): Body {
    const g = new THREE.Group()
    const mats: THREE.ShaderMaterial[] = []
    const pm = planetMaterial(kind)
    mats.push(pm)
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), pm)
    sphere.rotation.set(0.25, 0, 0.18)
    g.add(sphere)
    if (kind === 'saturn' || kind === 'uranus') {
      const rm = ringMaterial(1.3, 2.35)
      mats.push(rm)
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 2.35, 128, 1), rm)
      ring.rotation.set(kind === 'uranus' ? 0.2 : 1.25, 0.25, kind === 'uranus' ? 1.4 : 0.15)
      if (kind === 'uranus') ring.scale.setScalar(0.8)
      g.add(ring)
    }
    const size: Record<PlanetKind, number> = { earth: 70, saturn: 85, jupiter: 120, mars: 48, neptune: 62, moon: 36, mercury: 32, venus: 64, uranus: 66, pluto: 26, io: 30, europa: 30 }
    g.scale.setScalar(size[kind])
    g.userData.base = size[kind]
    return this.body(g, mats, false)
  }

  /** Spawn body `b` ahead of the heading (camYaw), off to one side. */
  private spawn(b: Body, camYaw: number, near: boolean) {
    b.side = this.r() < 0.5 ? -1 : 1
    // portrait view is only ~±0.3 rad wide: spawn inside it, a little off the path's vanishing point
    b.az = camYaw + b.side * (near ? 0.12 + this.r() * 0.08 : 0.05 + this.r() * 0.12)
    b.el = 0.1 + this.r() * 0.22
    // varied depths: a third pass HUGE and close (sweeping by fast), the rest mid or far and slow
    const roll = this.r()
    const close = !near && roll < 0.34
    b.dist = close ? 520 + this.r() * 120 : roll > 0.75 ? 1500 + this.r() * 300 : 900 + this.r() * 300
    b.big = close ? 2.6 + this.r() * 1.4 : roll > 0.75 ? 0.7 : 1
    if (close) b.az = camYaw + b.side * (0.16 + this.r() * 0.08)
    b.rate = close ? 0.0011 + this.r() * 0.0005 : 0.00035 + this.r() * 0.00025 // rad per metre run
    b.live = true
  }

  reset() {
    this.next = 0
    this.lastS = 0
    for (const b of [...this.planets, ...this.holes]) {
      b.live = false
      b.g.visible = false
    }
  }

  /**
   * @param s path distance (drives the drift) · camYaw heading · space 0..1 (sunset → deep space)
   */
  update(s: number, camYaw: number, space: number, time: number, dt: number, camera: THREE.Camera, active: boolean) {
    let ds = s - this.lastS
    if (ds < 0 || ds > 50) ds = 0
    this.lastS = s
    this.camPos.setFromMatrixPosition(camera.matrixWorld)
    this.group.updateMatrixWorld(true)
    const vis = THREE.MathUtils.smoothstep(space, 0.05, 0.45)
    // keep up to two planets and (deeper in) one black hole in the sky
    const want = space > 0.5 ? 3 : 2
    let live = 0
    for (const p of this.planets) if (p.live) live++
    if (active && live < want) {
      const p = this.planets[this.next % this.planets.length]
      if (!p.live) {
        this.spawn(p, camYaw, live === 0 && s < 50)
        // the second one goes the other side
        const other = this.planets.find((q) => q.live && q !== p)
        if (other) p.side = -other.side
        p.az = camYaw + p.side * Math.abs(wrap(p.az - camYaw))
        this.next++
      }
    }
    if (active && space > 0.2 && !this.holes.some((h) => h.live) && Math.floor(s / 400) % 2 === 1) {
      const h = this.holes[Math.floor(s / 800) % 2]
      this.spawn(h, camYaw, false)
      h.el = 0.2 + this.r() * 0.12
      h.az = camYaw - Math.sign(wrap(h.az - camYaw) || 1) * 0.08
      h.g.scale.setScalar(170 + this.r() * 60)
    }
    const place = (b: Body, alpha: number) => {
      const ce = Math.cos(b.el)
      this.tmp.set(-Math.sin(b.az) * ce, Math.sin(b.el), -Math.cos(b.az) * ce).multiplyScalar(b.dist)
      b.g.position.copy(this.tmp)
      if (b.billboard) {
        b.g.lookAt(this.camPos)
        b.g.rotateZ(b.g.userData.roll ?? 0.3)
      }
      for (const m of b.mats) {
        m.uniforms.uA.value = alpha
        if (m.uniforms.uTime) m.uniforms.uTime.value = time
      }
      b.g.visible = alpha > 0.01
    }
    for (const b of [...this.planets, ...this.holes]) {
      if (!b.live) continue
      const rel = wrap(b.az - camYaw)
      // drift outward (away from the heading), sinking slightly as it passes
      b.az += Math.sign(rel || b.side) * b.rate * ds
      b.el = Math.max(-0.05, b.el - b.rate * ds * 0.08)
      if (Math.abs(rel) > 0.55) {
        b.live = false
        b.g.visible = false
        continue
      }
      const fadeIn = 1
      const fadeOut = 1 - THREE.MathUtils.smoothstep(Math.abs(rel), 0.4, 0.55)
      if (!b.billboard && b.g.userData.base) b.g.scale.setScalar(b.g.userData.base * (b.big ?? 1))
      const base = this.holes.includes(b) ? vis : Math.max(0.75, vis)
      place(b, base * fadeIn * fadeOut)
    }
    for (const g of this.galaxies) place(g, vis * 0.9)
    void dt
  }

  /** Extra UFOs zipping across the sky (camera frame, not the chaser). */
  updateFlyers(dt: number, time: number, active: boolean) {
    // starships at varied depths: near ones streak by big, far ones crawl across small
    for (const u of this.ships) {
      if (u.wait > 0) {
        u.wait -= active ? dt : 0
        u.g.visible = false
        if (u.wait <= 0) {
          const depth = Math.random()
          const z = -30 - depth * depth * 380
          const span = 30 + -z * 0.7
          const dir = Math.random() < 0.5 ? -1 : 1
          const y = 5 + Math.random() * (10 + -z * 0.12)
          u.a.set(-dir * span, y, z + (Math.random() - 0.5) * 20)
          u.b.set(dir * span, y + (Math.random() - 0.5) * 8, z - 10 - Math.random() * 40)
          u.t = 0
          u.dur = 2.0 + depth * 6 + Math.random() * 1.5
          u.g.scale.setScalar(1.2 + depth * 4)
        }
        continue
      }
      u.t += dt
      const f = u.t / u.dur
      if (f >= 1) {
        u.wait = 1.5 + Math.random() * 5
        u.g.visible = false
        continue
      }
      u.g.visible = true
      u.g.position.lerpVectors(u.a, u.b, f)
      this.tmp.subVectors(u.b, u.a)
      u.g.rotation.set(0, Math.atan2(-this.tmp.x, -this.tmp.z), (u.b.x > u.a.x ? -1 : 1) * 0.35)
    }
    for (const u of this.saucers) {
      if (u.wait > 0) {
        u.wait -= active ? dt : 0
        u.g.visible = false
        if (u.wait <= 0) {
          const dir = Math.random() < 0.5 ? -1 : 1
          const z = -45 - Math.random() * 70
          const y = 7 + Math.random() * 16
          u.a.set(-dir * (40 + Math.random() * 25), y, z)
          u.b.set(dir * (40 + Math.random() * 25), y + (Math.random() - 0.5) * 10, z + (Math.random() - 0.3) * 40)
          u.t = 0
          u.dur = 2.2 + Math.random() * 1.6
          u.g.scale.setScalar(0.9 + Math.random() * 0.5)
        }
        continue
      }
      u.t += dt
      const f = u.t / u.dur
      if (f >= 1) {
        u.wait = 5 + Math.random() * 7
        u.g.visible = false
        continue
      }
      u.g.visible = true
      u.g.position.lerpVectors(u.a, u.b, f)
      u.g.position.y += Math.sin(f * Math.PI) * 4 + Math.sin(time * 6) * 0.3
      u.g.rotation.set(0.25 * Math.sin(time * 2), time * 4, (u.b.x > u.a.x ? -1 : 1) * 0.2)
    }
  }
}
