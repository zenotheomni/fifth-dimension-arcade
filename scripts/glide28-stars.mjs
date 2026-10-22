// v28: share of star lines that are interactive (over a jump obstacle / under a slide), and lines on both options
import { build } from 'esbuild'
import { mkdtempSync } from 'fs'; import { tmpdir } from 'os'; import path from 'path'; import { pathToFileURL } from 'url'
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = path.join(mkdtempSync(path.join(tmpdir(), 's28-')), 'b.mjs')
await build({ stdin: { contents: "export { Track } from './src/arcade/fifthRun/sim/track'", resolveDir: root, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' })
const { Track } = await import(pathToFileURL(out).href)
let lines = 0, inter = 0, both = 0, rows = 0
for (let seed = 1; seed <= 30; seed++) {
  const t = new Track(String(seed)); const K = new Map(), O = new Map()
  for (let s = 200; s <= 8000; s += 50) { t.ensure(s); for (const k of t.keys) K.set(k.id, k); for (const o of t.obstacles) O.set(o.id, o) }
  const keys = [...K.values()].sort((a, b) => a.s - b.s), obs = [...O.values()]
  const js = obs.filter((o) => ['barrier', 'overhead', 'pipe', 'gap'].includes(o.kind))
  const onOb = (k) => js.some((o) => o.lane === k.lane && k.s > o.s - 8 && k.s < o.s + o.len + 8 && (o.kind === 'overhead' ? k.y < 0.6 : k.y > 1.3))
  // lines: consecutive keys within 7 m (any lane switch allowed)
  let cur = []
  const flush = () => { if (cur.length >= 3) { lines++; if (cur.some(onOb)) inter++; else if (globalThis.NI === undefined || globalThis.NI++ < 25) { globalThis.NI ??= 1; console.log(cur.length, Math.round(cur[0].s), Math.round(cur.at(-1).s), cur.map((k) => k.lane + (k.y !== 0.9 ? "y" + k.y : "")).join(""), obs.filter((o) => o.s > cur[0].s - 5 && o.s < cur.at(-1).s + 25).map((o) => o.kind[0] + o.lane + "@" + Math.round(o.s)).join(" ")) } } cur = [] }
  for (const k of keys) { if (cur.length && k.s - cur[cur.length - 1].s > 7) flush(); cur.push(k) }
  flush()
  // decision rows: jump/slide obstacle with stars on it AND stars in an open lane at the same s
  const byS = new Map(); for (const o of js) { if (!byS.has(o.s)) byS.set(o.s, []); byS.get(o.s).push(o) }
  for (const [s, os] of byS) {
    rows++
    const lanesOb = new Set(obs.filter((o) => Math.abs(o.s - s) < 0.5).map((o) => o.lane))
    const risky = keys.some((k) => os.some((o) => o.lane === k.lane) && Math.abs(k.s - s) < 6 && onOb(k))
    const safe = keys.some((k) => !lanesOb.has(k.lane) && Math.abs(k.s - s) < 4)
    if (risky && safe) both++
  }
}
console.log(JSON.stringify({ lines, interactivePct: +(100 * inter / lines).toFixed(1), decisionRows: rows, bothOptionsPct: +(100 * both / rows).toFixed(1) }))
