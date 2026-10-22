// v32: average 5D logo spacing (m) over 40 seeds × 20 km
import { build } from 'esbuild'
import { mkdtempSync } from 'fs'; import { tmpdir } from 'os'; import path from 'path'; import { pathToFileURL } from 'url'
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = path.join(mkdtempSync(path.join(tmpdir(), 's32-')), 'b.mjs')
await build({ stdin: { contents: "export { Track } from './src/arcade/fifthRun/sim/track'", resolveDir: root, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' })
const { Track } = await import(pathToFileURL(out).href)
const gaps = [], firsts = []
for (let seed = 1; seed <= 40; seed++) {
  const t = new Track(String(seed)); const P = new Map()
  for (let s = 200; s <= 20000; s += 100) { t.ensure(s); for (const p of t.pickups) P.set(p.id, p.s) }
  const ss = [...P.values()].sort((a, b) => a - b); firsts.push(ss[0])
  for (let i = 1; i < ss.length; i++) gaps.push(ss[i] - ss[i - 1])
}
gaps.sort((a, b) => a - b)
const avg = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length)
console.log(JSON.stringify({ avgSpacingM: avg(gaps), medianM: Math.round(gaps[gaps.length >> 1]), p10: Math.round(gaps[Math.floor(gaps.length * 0.1)]), p90: Math.round(gaps[Math.floor(gaps.length * 0.9)]), firstAvgM: avg(firsts), perKm: +(1000 / avg(gaps)).toFixed(2) }))
