import { build } from 'esbuild'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = path.join(mkdtempSync(path.join(tmpdir(), 'slim-')), 's.mjs')
await build({
  stdin: { contents: `export { Track } from './src/arcade/fifthRun/sim/track'
export { speedAt, VOID, CAP_S } from './src/arcade/fifthRun/sim/constants'`, resolveDir: root, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
})
const { Track, speedAt, VOID, CAP_S } = await import(pathToFileURL(out).href)

function classify(obs) {
  // group voids by start s
  const by = new Map()
  for (const o of obs.filter((x) => x.kind === 'void')) {
    const k = Math.round(o.s * 100)
    if (!by.has(k)) by.set(k, { s: o.s, len: o.len, lanes: new Set() })
    by.get(k).lanes.add(o.lane)
    by.get(k).len = Math.max(by.get(k).len, o.len)
  }
  const stretches = []
  for (const v of by.values()) {
    const gone = [...v.lanes].sort()
    const open = [0, 1, 2].filter((l) => !gone.includes(l))
    let bias = 'other'
    if (open.length === 1 && open[0] === 1) bias = 'mid'
    else if (open.length === 1 && open[0] === 0) bias = 'left'
    else if (open.length === 1 && open[0] === 2) bias = 'right'
    else if (gone.length === 1) bias = 'edge'
    else if (gone.length === 1 && gone[0] === 1) bias = 'centreHole'
    // jumpable inside stretch?
    const jump = obs.some(
      (o) =>
        (o.kind === 'barrier' || o.kind === 'pipe' || o.kind === 'overhead') &&
        o.s > v.s + 0.5 &&
        o.s < v.s + v.len - 0.5 &&
        open.includes(o.lane),
    )
    const jumpKind = jump
      ? obs.find(
          (o) =>
            (o.kind === 'barrier' || o.kind === 'pipe' || o.kind === 'overhead') &&
            o.s > v.s + 0.5 &&
            o.s < v.s + v.len - 0.5,
        )?.kind
      : null
    stretches.push({ s: v.s, len: v.len, bias, open, jump, jumpKind })
  }
  return stretches
}

const counts = { mid: 0, left: 0, right: 0, edge: 0, other: 0, centreHole: 0 }
let total = 0, withJump = 0, barriers = 0, earlyBefore450 = 0
const examples = { mid: null, left: null, right: null, midJump: null }
const seeds = 120
const M = 8000
for (let i = 0; i < seeds; i++) {
  const tr = new Track('slim:' + i.toString(16).padStart(6,'0'))
  tr.ensure(M + 200)
  const ss = classify(tr.obstacles.filter((o) => o.s <= M))
  for (const s of ss) {
    if (s.len < VOID.minLen) continue // real slim only (skip H-potholes)
    total++
    counts[s.bias] = (counts[s.bias] || 0) + 1
    if (s.jump) {
      withJump++
      if (s.jumpKind === 'barrier') barriers++
    }
    if (s.s < VOID.startM) earlyBefore450++
    if (s.bias === 'mid' && !examples.mid) examples.mid = { seed: 'slim:' + i.toString(16).padStart(6,'0'), ...s }
    if (s.bias === 'left' && !examples.left) examples.left = { seed: 'slim:' + i.toString(16).padStart(6,'0'), ...s }
    if (s.bias === 'right' && !examples.right) examples.right = { seed: 'slim:' + i.toString(16).padStart(6,'0'), ...s }
    if (s.bias === 'mid' && s.jump && !examples.midJump) examples.midJump = { seed: 'slim:' + i.toString(16).padStart(6,'0'), ...s }
  }
}
const pct = (n) => +((100 * n) / total).toFixed(1)
console.log(JSON.stringify({
  VOID, CAP_S, seeds, M, total,
  biasPct: { mid: pct(counts.mid), left: pct(counts.left), right: pct(counts.right), edge: pct(counts.edge), other: pct(counts.other) },
  jumpPct: +((100 * withJump) / total).toFixed(1),
  barrierAmongJumpsPct: withJump ? +((100 * barriers) / withJump).toFixed(1) : 0,
  earlyBeforeStartM: earlyBefore450,
  examples,
}, null, 2))
