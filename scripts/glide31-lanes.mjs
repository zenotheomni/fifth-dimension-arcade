// v31: star-lane changes per straight (between corners). Target: 0 straights with 0 changes; most with >= 2.
import { build } from 'esbuild'
import { mkdtempSync } from 'fs'; import { tmpdir } from 'os'; import path from 'path'; import { pathToFileURL } from 'url'
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = path.join(mkdtempSync(path.join(tmpdir(), 's31-')), 'b.mjs')
await build({ stdin: { contents: "export { Track } from './src/arcade/fifthRun/sim/track'", resolveDir: root, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' })
const { Track } = await import(pathToFileURL(out).href)
let segs = 0, z = 0, one = 0, two = 0, longS = 0, longOk = 0, maxRunM = 0, cov = 0, len = 0; const ex = []
for (let seed = 1; seed <= 40; seed++) {
  const t = new Track(String(seed)); const K = new Map()
  for (let s = 200; s <= 10000; s += 50) { t.ensure(s); for (const k of t.keys) K.set(k.id, k) }
  const keys = [...K.values()].sort((a, b) => a.s - b.s)
  const cs = t.corners.map((c) => c.s).filter((x) => x < 9800)
  for (let i = 0; i + 1 < cs.length; i++) {
    const a = cs[i] + 8, b = cs[i + 1] - 8
    const ks = keys.filter((k) => k.s > a && k.s < b); if (ks.length < 6) continue
    segs++
    let ch = 0, runStart = ks[0].s
    for (let j = 1; j < ks.length; j++) if (ks[j].lane !== ks[j - 1].lane) { ch++; maxRunM = Math.max(maxRunM, ks[j - 1].s - runStart); runStart = ks[j].s }
    maxRunM = Math.max(maxRunM, ks.at(-1).s - runStart)
    if (ch === 0) { z++; if (ex.length < 5) ex.push(seed + '@' + Math.round(a) + '-' + Math.round(b) + ':' + ks.length) } else if (ch === 1) one++; else two++
    if (b - a > 150) { longS++; if (ch >= 3) longOk++ }
    let c = 0; for (let j = 1; j < ks.length; j++) if (ks[j].s - ks[j - 1].s < 7) c += ks[j].s - ks[j - 1].s
    cov += c; len += b - a
  }
}
console.log(JSON.stringify({ straights: segs, zeroChange: z, oneChange: one, ge2ChangesPct: +(100 * two / segs).toFixed(1), longStraights: longS, longGe3Pct: +(100 * longOk / longS).toFixed(1), longestSingleLaneRunM: Math.round(maxRunM), starCoveragePct: +(100 * cov / len).toFixed(1), zeroExamples: ex }))
