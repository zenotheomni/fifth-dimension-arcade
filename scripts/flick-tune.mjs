/**
 * Court Vision 3D — headless flick harness.
 * Bundles the deterministic sim (no rendering) and runs the tuning suites.
 *   node scripts/flick-tune.mjs [--json]
 */
import { build } from 'esbuild'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = path.join(mkdtempSync(path.join(tmpdir(), 'cv3d-')), 'sim.mjs')
await build({
  entryPoints: [path.join(root, 'scripts/harness-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'silent',
})
const sim = await import(pathToFileURL(out).href)
const { simulateShot, DIM, courtVisionSeedConfig, hoopPoseAt, mulberry32 } = sim

const BALL = { x: 0, y: DIM.ballR, z: DIM.ballRestZ }
const baseCtx = { ball: BALL, hoop: { x: 0, y: 0 }, windBias: 0 }

/** Mirror the in-game debug flick: speed px/ms + dx px over 100ms. */
function flick(speed, dx = 0) {
  const dist = speed * 100
  const angle = Math.abs(dx) > 1 ? Math.atan2(dx, dist) : 0
  return { speed, angle }
}

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)

function run(name, shots, ctxFn = () => baseCtx, hoopFn) {
  let cutOff = 0
  const res = shots.map((s, i) => {
    const ctx = ctxFn(i)
    const hf = hoopFn ? (t) => hoopFn(i, t) : undefined
    const r = simulateShot(flick(s.speed, s.dx), ctx, hf)
    // early miss decisions must never cut off a ball that would still drop
    const legacy = simulateShot(flick(s.speed, s.dx), ctx, hf, { legacyResolve: true })
    if (legacy.outcome.made !== r.outcome.made) cutOff++
    return r
  })
  const n = res.length
  const c = (f) => res.filter(f).length
  return {
    name,
    n,
    makeRate: +(c((r) => r.outcome.made) / n).toFixed(3),
    swish: c((r) => r.outcome.kind === 'swish'),
    rimIn: c((r) => r.outcome.kind === 'rim_in'),
    bank: c((r) => r.outcome.kind === 'bank'),
    penetrate: c((r) => r.outcome.penetration > 0),
    over: c((r) => r.outcome.overBoard),
    boardHit: c((r) => r.outcome.boardHits > 0),
    rimHit: c((r) => r.outcome.rimHits > 0),
    makeDecideS: +(avg(res.filter((r) => r.outcome.made).map((r) => r.outcome.steps / 240))).toFixed(2),
    missDecideS: +(avg(res.filter((r) => !r.outcome.made).map((r) => r.outcome.steps / 240))).toFixed(2),
    cutOff,
    misses: Object.entries(
      res
        .filter((r) => !r.outcome.made)
        .reduce((a, r) => ((a[r.outcome.missKind] = (a[r.outcome.missKind] || 0) + 1), a), {}),
    )
      .map(([k, v]) => `${k}:${v}`)
      .join(' '),
  }
}

const rnd = mulberry32(1337)
const suites = []
suites.push(run('straight_medium', Array.from({ length: 16 }, (_, i) => ({ speed: 0.95 + (i % 5) * 0.05, dx: 0 }))))
suites.push(run('angled_wide', Array.from({ length: 10 }, (_, i) => ({ speed: 1.05, dx: i % 2 ? -70 : 70 }))))
suites.push(run('weak_front', Array.from({ length: 10 }, (_, i) => ({ speed: 0.55 + (i % 5) * 0.06, dx: 0 }))))
suites.push(run('strong_bank', Array.from({ length: 12 }, (_, i) => ({ speed: 1.3 + (i % 3) * 0.06, dx: (i % 2) * 8 - 4 }))))
suites.push(run('extreme_over', Array.from({ length: 10 }, (_, i) => ({ speed: 2.1 + (i % 5) * 0.08, dx: (i % 3) * 6 - 6 }))))
suites.push(
  run(
    'decent_spread',
    Array.from({ length: 400 }, () => ({ speed: 0.78 + rnd() * 0.5, dx: (rnd() - 0.5) * 48 })),
  ),
)
// Full random sweep incl. extremes: penetration must stay 0
suites.push(
  run(
    'chaos_sweep',
    Array.from({ length: 600 }, () => ({ speed: 0.35 + rnd() * 2.3, dx: (rnd() - 0.5) * 220 })),
  ),
)
// Seeded challenges: sway + wind
const seeds = ['alpha', 'jenks', 'fifth-floor', 'cv-42-x', 'zeno5', 'miami']
const cfgs = seeds.map((s) => courtVisionSeedConfig(s))
suites.push(
  run(
    'seeded_decent',
    Array.from({ length: 300 }, () => ({ speed: 0.85 + rnd() * 0.3, dx: (rnd() - 0.5) * 30 })),
    (i) => {
      const cfg = cfgs[i % cfgs.length]
      const t0 = (i * 0.37) % 6
      return { ball: { ...BALL, x: cfg.ballHomeOffsetX * 0.45 * 0.004 }, hoop: hoopPoseAt(cfg, t0), windBias: cfg.windBias }
    },
    (i, t) => hoopPoseAt(cfgs[i % cfgs.length], ((i * 0.37) % 6) + t),
  ),
)

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(suites, null, 2))
} else {
  console.table(suites)
}
const get = (n) => suites.find((s) => s.name === n)
const checks = [
  ['penetration 0 (all suites)', suites.every((s) => s.penetrate === 0)],
  ['early miss never cuts off a make', suites.every((s) => s.cutOff === 0)],
  ['straight_medium ~100%', get('straight_medium').makeRate >= 0.95],
  ['decent_spread 60–75%', get('decent_spread').makeRate >= 0.6 && get('decent_spread').makeRate <= 0.75],
  ['weak_front misses', get('weak_front').makeRate <= 0.2],
  ['angled_wide misses', get('angled_wide').makeRate === 0],
  ['strong_bank uses glass', get('strong_bank').boardHit >= 10],
  ['strong_bank never over', get('strong_bank').over === 0],
  ['extreme mostly over', get('extreme_over').over >= 8],
  ['over only on extreme', ['straight_medium', 'decent_spread', 'weak_front', 'strong_bank', 'angled_wide', 'seeded_decent'].every((n) => get(n).over === 0)],
]
let fail = 0
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) fail++
}
process.exitCode = fail ? 1 : 0
