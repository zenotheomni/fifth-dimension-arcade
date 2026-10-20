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
for (let i = 0; i < N; i++) {
  const seed = `fuzz:${i}`
  const tr = new Track(seed)
  tr.ensure(M + 200)
  const r = validateObstacles(tr.obstacles, tr.corners, speedAt, M)
  rows += r.rows
  repairs += tr.repairs ?? 0
  if (r.fails.length) { fails += r.fails.length; badSeeds++; if (ex.length < 5) ex.push(`${seed}@${r.fails[0]}`) }
}
console.log(JSON.stringify({ seeds: N, metres: M, rows, fails, badSeeds, repairs, examples: ex }))
process.exit(fails ? 1 : 0)
