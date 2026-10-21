/**
 * Fifth Glide v14 — fuzz the route validator over many seeds.
 *   node scripts/fr-validate.mjs [--seeds 5000] [--m 9000]
 * Rebuilds rows from each generated track and checks every row has a passable route (lane-switch
 * time at current speed, jump / slide timing, narrow & missing-lane stretches, row-to-row reach).
 */
import { build } from 'esbuild'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = path.join(mkdtempSync(path.join(tmpdir(), 'frv-')), 'v.mjs')
await build({ stdin: { contents: "export { Track } from './src/arcade/fifthRun/sim/track'\nexport { validateObstacles } from './src/arcade/fifthRun/sim/validate'\nexport { speedAt } from './src/arcade/fifthRun/sim/constants'", resolveDir: root, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' })
const { Track, validateObstacles, speedAt } = await import(pathToFileURL(out).href)
const a = process.argv.slice(2)
const arg = (k, d) => (a.indexOf(k) >= 0 ? Number(a[a.indexOf(k) + 1]) : d)
const N = arg('--seeds', 5000), M = arg('--m', 9000)
let rows = 0, fails = 0, badSeeds = 0, repairs = 0
const ex = []
// v18: coverage of the new features (every one of them is inside the validated rows above)
const feat = { pinch1: 0, edgeDrop: 0, centreHole: 0, chokepoint: 0, wideGap: 0, fullGap: 0 }
function countFeatures(obs) {
  const at = new Map()
  for (const o of obs) { const k = `${o.kind}@${o.s}`; at.set(k, (at.get(k) ?? 0) + 1) }
  const voids = new Map()
  for (const o of obs) if (o.kind === 'void') { const a = voids.get(o.s) ?? []; a.push(o.lane); voids.set(o.s, a) }
  for (const [s, lanes] of voids) {
    if (lanes.length === 2) feat.pinch1++
    else if (lanes[0] === 1) feat.centreHole++
    else feat.edgeDrop++
    const v = obs.find((o) => o.kind === 'void' && o.s === s)
    if (obs.some((o) => (o.kind === 'barrier' || o.kind === 'overhead' || o.kind === 'pipe') && o.s > s && o.s < s + v.len)) feat.chokepoint++
  }
  for (const [k, n] of at) if (k.startsWith('gap@')) { if (n === 3) feat.fullGap++; else if (n === 2) feat.wideGap++ }
}
for (let i = 0; i < N; i++) {
  const seed = `fuzz:${i}`
  const tr = new Track(seed)
  tr.ensure(M + 200)
  const r = validateObstacles(tr.obstacles, tr.corners, speedAt, M)
  countFeatures(tr.obstacles)
  rows += r.rows
  repairs += tr.repairs ?? 0
  if (r.fails.length) { fails += r.fails.length; badSeeds++; if (ex.length < 5) ex.push(`${seed}@${r.fails[0]}`) }
}
console.log(JSON.stringify({ seeds: N, metres: M, rows, fails, badSeeds, repairs, features: feat, examples: ex }))
process.exit(fails ? 1 : 0)
