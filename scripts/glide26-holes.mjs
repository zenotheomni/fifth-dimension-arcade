// v26: measures hole-after-jump/slide spacing and same-side obstacle runs
import { build } from 'esbuild'
import { mkdtempSync } from 'fs'; import { tmpdir } from 'os'; import path from 'path'; import { pathToFileURL } from 'url'
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = path.join(mkdtempSync(path.join(tmpdir(), 'h26-')), 'b.mjs')
await build({ stdin: { contents: "export { Track } from './src/arcade/fifthRun/sim/track'\nexport { speedAt } from './src/arcade/fifthRun/sim/constants'", resolveDir: root, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' })
const { Track, speedAt } = await import(pathToFileURL(out).href)
let minAfter = 1e9, under = 0, holes = 0, maxRun = 0, runs3 = 0
for (let seed = 1; seed <= 40; seed++) {
  const t = new Track(seed); const all = new Map()
  for (let s = 200; s <= 10000; s += 50) { t.ensure(s); for (const o of t.obstacles) all.set(o.id, o) }
  const obs = [...all.values()].sort((a, b) => a.s - b.s)
  let lastBOP = -1e9
  const rows = new Map()
  for (const o of obs) {
    if (['gap', 'void'].includes(o.kind)) { holes++; const dt = (o.s - lastBOP) / speedAt(o.s); if (lastBOP > 0 && dt < minAfter) minAfter = dt; if (lastBOP > 0 && dt < 1.15) under++ }
    if (['barrier', 'overhead', 'pipe'].includes(o.kind)) lastBOP = Math.max(lastBOP, o.s + o.len)
    if (o.kind !== 'void') { if (!rows.has(o.s)) rows.set(o.s, new Set()); rows.get(o.s).add(o.lane) }
  }
  let prev = -2, run = 0, ps = -1e9
  for (const [rs, ls] of rows.entries()) { const far = rs - ps > 100; ps = rs; if (far) { prev = -2; run = 0 } if (ls.size === 3 || (ls.size === 2 && ls.has(0) && ls.has(2))) { prev = -2; run = 0; continue } const m = [...ls].reduce((a, b) => a + b, 0) / ls.size; const side = m < 1 ? 0 : m > 1 ? 2 : 1; run = side === prev ? run + 1 : 1; prev = side; if (run > maxRun) maxRun = run; if (run === 3) { runs3++; if (runs3 < 6) console.log(seed, [...rows.entries()].filter(([s]) => s <= [...rows.keys()].find((k) => rows.get(k) === ls)).slice(-3).map(([s, l]) => s + ":" + obs.filter((o) => o.s === s).map((o) => o.kind[0] + o.lane).join(","))) } }
}
console.log(JSON.stringify({ holes, holesUnder1_15s: under, minAfterS: +minAfter.toFixed(2), maxSameSideRun: maxRun, runsOf3: runs3 }))
