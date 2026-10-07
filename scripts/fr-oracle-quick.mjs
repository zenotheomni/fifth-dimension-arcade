/** Survivability spot-check: node scripts/fr-oracle-quick.mjs [N] [seconds] */
import { build } from 'esbuild'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import { createHash } from 'crypto'
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = path.join(mkdtempSync(path.join(tmpdir(), 'fro-')), 'sim.mjs')
await build({ entryPoints: [path.join(root, 'scripts/fr-harness-entry.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' })
const { Track, newRun, oracle, speedAt, FR_DT } = await import(pathToFileURL(out).href)
const N = Number(process.argv[2] || 10), T = Number(process.argv[3] || 120)
let s = 0
for (let t = 0; t < T; t += FR_DT) s += speedAt(s) * FR_DT
let ok = 0
const fails = []
for (let i = 0; i < N; i++) {
  const h = createHash('sha1').update(`oracle${i}`).digest('hex').slice(0, 12)
  const sd = i % 3 === 0 ? `sway:${h}` : i % 3 === 1 ? `still:${h}` : `run:${h}`
  let r = oracle(new Track(sd), newRun(), s, 6, 72)
  if (!r.ok) r = oracle(new Track(sd), newRun(), s, 6, 0)
  if (r.ok) ok++
  else fails.push([sd, Math.round(r.s)])
}
console.log(`${ok}/${N} survivable to ${Math.round(s)} m`, JSON.stringify(fails))
