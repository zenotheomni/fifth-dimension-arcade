// v28: share of star lines that are interactive (over a jump obstacle / under a slide), and lines on both options
import { build } from 'esbuild'
import { mkdtempSync } from 'fs'; import { tmpdir } from 'os'; import path from 'path'; import { pathToFileURL } from 'url'
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = path.join(mkdtempSync(path.join(tmpdir(), 's28-')), 'b.mjs')
await build({ stdin: { contents: "export { Track } from './src/arcade/fifthRun/sim/track'", resolveDir: root, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' })
const { Track } = await import(pathToFileURL(out).href)
let genRun3 = 0, genMax = 0, lwo = 0, lwoI = 0, lines = 0, inter = 0, both = 0, rows = 0, run = 0, prevL = -1, maxRun = 0, run3 = 0; const laneCnt = [0, 0, 0]; let segSkew = 0, segs = 0, postSame = 0, posts = 0
for (let seed = 1; seed <= 30; seed++) {
  const t = new Track(String(seed)); const K = new Map(), O = new Map()
  for (let s = 200; s <= 8000; s += 50) { t.ensure(s); for (const k of t.keys) K.set(k.id, k); for (const o of t.obstacles) O.set(o.id, o) }
  const keys = [...K.values()].sort((a, b) => a.s - b.s), obs = [...O.values()]
  const js = obs.filter((o) => ['barrier', 'overhead', 'pipe', 'gap'].includes(o.kind))
  const onOb = (k) => js.some((o) => o.lane === k.lane && k.s > o.s - 8 && k.s < o.s + o.len + 8 && (o.kind === 'overhead' ? k.y < 0.6 : k.y > 1.3))
  // lines: consecutive keys within 7 m (any lane switch allowed)
  let cur = []
  const flush = () => { if (cur.length >= 3) { lines++; const ln = cur[0].lane; laneCnt[ln]++; run = ln === prevL ? run + 1 : 1; prevL = ln; if (run > maxRun) maxRun = run; if (run === 3) { run3++; if (run3 < 0) console.log('R3', seed, Math.round(cur[0].s), cur.length, t.corners.filter((c) => Math.abs(c.s - cur[0].s) < 60).map((c) => Math.round(c.s))) } if (cur.some(onOb)) inter++; if (js.some((o) => o.kind !== 'gap' && o.s > cur[0].s && o.s < cur.at(-1).s)) { lwo++; if (cur.some(onOb)) lwoI++ } else if (globalThis.NI === undefined || globalThis.NI++ < 0) { globalThis.NI ??= 1; console.log(cur.length, Math.round(cur[0].s), Math.round(cur.at(-1).s), cur.map((k) => k.lane + (k.y !== 0.9 ? "y" + k.y : "")).join(""), obs.filter((o) => o.s > cur[0].s - 5 && o.s < cur.at(-1).s + 25).map((o) => o.kind[0] + o.lane + "@" + Math.round(o.s)).join(" ")) } } cur = [] }
  for (const k of keys) { if (cur.length && k.s - cur[cur.length - 1].s > 7) flush(); cur.push(k) }
  flush()
  { let r = 0, pl = -1; for (const l of t.lineLog) { r = l === pl ? r + 1 : 1; pl = l; if (r >= 3) genRun3++; if (r > genMax) genMax = r } }
  // per segment (between corners): share of stars in the most-used lane; post-turn lane vs pre-turn
  const cs = t.corners.map((c) => c.s).filter((x) => x < 8000)
  for (let i = 0; i + 1 < cs.length; i++) { const ks = keys.filter((k) => k.s > cs[i] && k.s < cs[i + 1]); if (ks.length < 10) continue; segs++; const c = [0, 1, 2].map((l) => ks.filter((k) => k.lane === l).length); if (Math.max(...c) / ks.length > 0.8) segSkew++
    const pre = keys.filter((k) => k.s < cs[i + 1] && k.s > cs[i + 1] - 20).at(-1), post = keys.find((k) => k.s > cs[i + 1]); if (pre && post) { posts++; if (pre.lane === post.lane) postSame++ } }
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
console.log(JSON.stringify({ genLinesMaxSameLane: genMax, genRunsOf3: genRun3, interactiveWhereObstaclePct: +(100 * lwoI / lwo).toFixed(1), laneSharePct: laneCnt.map((x) => +(100 * x / lines).toFixed(1)), maxSameLaneLines: maxRun, runsOf3: run3, segsOver80pctOneLane: segSkew + '/' + segs, postTurnSameLanePct: +(100 * postSame / posts).toFixed(1), lines, interactivePct: +(100 * inter / lines).toFixed(1), decisionRows: rows, bothOptionsPct: +(100 * both / rows).toFixed(1) }))
