import { build } from 'esbuild'
const root = process.cwd()
await build({ stdin: { contents: "export { buildHazard } from './src/arcade/fifthRun/render/hazards'\nexport * as THREE from 'three'\nexport { buildBarrier, buildPipe } from './src/arcade/fifthRun/render/props'", resolveDir: root, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: '/tmp/hzb.mjs', logLevel: 'error' })
globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) , set: () => true }), width: 0, height: 0 }) }
const { buildHazard, THREE } = await import('/tmp/hzb.mjs')
const g = new THREE.Texture()
for (const long of [false, true]) for (const k of ['meteor', 'crates', 'statue', 'holo', 'barricade']) {
  if (long && !['crates', 'holo', 'barricade'].includes(k)) continue
  const hs = []
  for (let s = 1; s < 6; s++) { const it = buildHazard(k, g, s, long); it.pose?.(s * 37, 0); it.group.updateMatrixWorld(true); const b = new THREE.Box3(); it.group.traverse((o) => { if (o.isMesh && !o.isSprite && !o.material.transparent) { o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)) } }); hs.push([b.min.y, b.max.y]) }
  console.log(long ? 'long' : 'short', k, 'minTop', Math.min(...hs.map((h) => h[1])).toFixed(2), 'maxTop', Math.max(...hs.map((h) => h[1])).toFixed(2))
}
