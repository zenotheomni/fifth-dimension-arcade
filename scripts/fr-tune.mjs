/**
 * Fifth Run — headless track + bot harness.
 *   node scripts/fr-tune.mjs [--seeds N] [--oracle N] [--json]
 * Checks: determinism, every seeded track survivable (exhaustive search), difficulty ramp,
 * decent-player survival time.
 */
import { build } from 'esbuild'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import { createHash } from 'crypto'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = path.join(mkdtempSync(path.join(tmpdir(), 'fr-')), 'sim.mjs')
await build({ entryPoints: [path.join(root, 'scripts/fr-harness-entry.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' })
const sim = await import(pathToFileURL(out).href)
const { Track, newRun, step, queueAction, scoreOf, oracle, RuleBot, SKILLS, speedAt, levelAt, FR_HZ, FR_DT } = sim

const argv = process.argv.slice(2)
const arg = (k, d) => {
  const i = argv.indexOf(k)
  return i >= 0 ? Number(argv[i + 1]) : d
}
const N_SEEDS = arg('--seeds', 200)
const N_ORACLE = arg('--oracle', 100)
const ORACLE_SECONDS = arg('--oracle-s', 240)
const JSON_OUT = argv.includes('--json')

const seedList = (n, tag) =>
  Array.from({ length: n }, (_, i) => {
    const h = createHash('sha1').update(`${tag}${i}`).digest('hex').slice(0, 12)
    return i % 3 === 0 ? `sway:${h}` : i % 3 === 1 ? `still:${h}` : `run:${h}`
  })

/** distance reached after T seconds (speed is a function of distance only) */
function distAt(T) {
  let s = 0
  for (let t = 0; t < T; t += FR_DT) s += speedAt(s) * FR_DT
  return s
}

const layoutHash = (tr, upTo) =>
  createHash('sha1')
    .update(
      JSON.stringify([
        tr.obstacles.filter((o) => o.s < upTo).map((o) => [o.kind, o.lane, o.s, o.len, o.vs, o.variant]),
        tr.keys.filter((k) => k.s < upTo).map((k) => [k.lane, k.s, k.y]),
        tr.pickups.filter((p) => p.s < upTo).map((p) => [p.kind, p.lane, p.s]),
      ]),
    )
    .digest('hex')
    .slice(0, 16)

function runBot(seed, skill, maxT = 400, botSeed = 7) {
  const tr = new Track(seed)
  const st = newRun()
  const bot = new RuleBot(skill, botSeed)
  const maxTicks = maxT * FR_HZ
  const deaths = []
  let lastPrune = 0
  let powers = 0
  const ev = []
  while (!st.dead && st.tick < maxTicks) {
    tr.ensure(st.s + 250)
    bot.update(st, tr)
    ev.length = 0
    step(st, tr, { full: true, events: ev })
    for (const e of ev) if (e.type === 'power') powers++
    if (st.s - lastPrune > 400) {
      lastPrune = st.s
    }
  }
  return { seed, t: st.tick / FR_HZ, s: st.s, score: scoreOf(st), keys: st.keys, maxCombo: st.maxCombo, death: st.deathKind, dead: st.dead, powers, tr }
}

const pct = (a, p) => {
  const b = [...a].sort((x, y) => x - y)
  return b[Math.min(b.length - 1, Math.floor(p * (b.length - 1) + 0.5))]
}
const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
const r1 = (x) => Math.round(x * 10) / 10

const report = { checks: [] }
const check = (name, pass, detail) => {
  report.checks.push({ name, pass, detail })
  if (!JSON_OUT) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

// ── 1. determinism ──
{
  const seeds = seedList(20, 'det')
  let same = 0
  let indep = 0
  for (const sd of seeds) {
    const a = new Track(sd)
    a.ensure(4000)
    const b = new Track(sd)
    b.ensure(4000)
    if (layoutHash(a, 3800) === layoutHash(b, 3800)) same++
    // layout must not depend on how the player plays (incremental generation while a bot runs)
    const played = runBot(sd, SKILLS.expert, 200).tr
    played.ensure(4000)
    if (layoutHash(played, 3800) === layoutHash(a, 3800)) indep++
  }
  check('determinism: same seed → identical layout', same === seeds.length, `${same}/${seeds.length}`)
  check('layout independent of player inputs', indep === seeds.length, `${indep}/${seeds.length}`)
  const x = new Track('sway:aaaaaaaaaaaa')
  const y = new Track('sway:aaaaaaaaaaab')
  x.ensure(1000)
  y.ensure(1000)
  check('different seeds → different layouts', layoutHash(x, 900) !== layoutHash(y, 900))
}

// ── 2. structural: every row keeps a passable lane, spacing ≥ reaction floor ──
{
  let bad = 0
  let rows = 0
  let minGapT = 99
  for (const sd of seedList(N_SEEDS, 'struct')) {
    const tr = new Track(sd)
    tr.ensure(distAt(300))
    const byS = new Map()
    for (const o of tr.obstacles) {
      const k = o.s
      if (!byS.has(k)) byS.set(k, [])
      byS.get(k).push(o)
    }
    // group cars of a double into the row that started them
    const starts = [...byS.keys()].sort((a, b) => a - b)
    let prevEnd = -1
    for (const s of starts) {
      const os = byS.get(s)
      const solidCars = new Set(os.filter((o) => o.kind === 'car').map((o) => o.lane))
      if (prevEnd > s) continue // second car of a double
      rows++
      if (solidCars.size >= 3) bad++
      if (prevEnd > 0) minGapT = Math.min(minGapT, (s - prevEnd) / speedAt(s))
      prevEnd = Math.max(...os.map((o) => o.s + o.len + (o.kind === 'car' ? 5.7 : 0) * 0))
      // doubles: extend prevEnd to the second car
      for (const o of os) if (o.kind === 'car') prevEnd = Math.max(prevEnd, o.s + o.len)
    }
  }
  check('every row has a passable lane', bad === 0, `${rows} rows, ${bad} fully blocked`)
  report.minGapT = r1(minGapT * 100) / 100
}

// ── 3. survivability: exhaustive search ──
{
  const maxS = distAt(ORACLE_SECONDS)
  const seeds = seedList(N_ORACLE, 'oracle')
  let ok = 0
  const fails = []
  let maxF = 0
  const t0 = Date.now()
  for (const sd of seeds) {
    const tr = new Track(sd)
    let res = oracle(tr, newRun(), maxS, 6, 72)
    if (!res.ok) res = oracle(new Track(sd), newRun(), maxS, 6, 0)
    maxF = Math.max(maxF, res.maxFrontier)
    if (res.ok) ok++
    else fails.push({ seed: sd, s: Math.round(res.s) })
  }
  check(
    `every seeded track survivable (exhaustive search, ${ORACLE_SECONDS}s ≈ ${Math.round(maxS)} m)`,
    ok === seeds.length,
    `${ok}/${seeds.length} seeds, max frontier ${maxF}, ${((Date.now() - t0) / 1000).toFixed(1)}s` + (fails.length ? ` fails: ${JSON.stringify(fails.slice(0, 5))}` : ''),
  )
  report.oracle = { seeds: seeds.length, ok, fails, maxS: Math.round(maxS) }
}

// ── 4. bots ──
const bots = {}
for (const name of ['rookie', 'novice', 'decent', 'expert', 'perfect']) {
  const n = name === 'perfect' ? 40 : N_SEEDS
  const runs = seedList(n, 'bot').map((sd, i) => runBot(sd, SKILLS[name], name === 'perfect' ? 300 : 400, 1000 + i))
  const ts = runs.map((r) => r.t)
  const deaths = {}
  for (const r of runs) if (r.dead) deaths[r.death] = (deaths[r.death] || 0) + 1
  bots[name] = {
    n,
    medianT: r1(pct(ts, 0.5)),
    p25T: r1(pct(ts, 0.25)),
    p75T: r1(pct(ts, 0.75)),
    meanT: r1(avg(ts)),
    under30: runs.filter((r) => r.t < 30).length,
    survivedCap: runs.filter((r) => !r.dead).length,
    medianScore: Math.round(pct(runs.map((r) => r.score), 0.5)),
    p90Score: Math.round(pct(runs.map((r) => r.score), 0.9)),
    maxScore: Math.max(...runs.map((r) => r.score)),
    medianKeys: Math.round(pct(runs.map((r) => r.keys), 0.5)),
    medianMaxCombo: Math.round(pct(runs.map((r) => r.maxCombo), 0.5)),
    medianDist: Math.round(pct(runs.map((r) => r.s), 0.5)),
    deaths,
    runs,
  }
}
const pub = (b) => {
  const { runs, ...rest } = b
  void runs
  return rest
}
if (!JSON_OUT) {
  console.log('\nbots (survival seconds / score):')
  for (const [k, b] of Object.entries(bots)) console.log(k.padEnd(8), JSON.stringify(pub(b)))
}
const d = bots.decent
check('decent player lasts ~90–360 s (median, 3-life)', d.medianT >= 90 && d.medianT <= 360, `median ${d.medianT}s, IQR ${d.p25T}–${d.p75T}s`)
const rk = bots.rookie
check('first-timer (rookie bot) median ≥ 60 s, nobody out before 30 s', rk.medianT >= 60 && rk.under30 === 0, `median ${rk.medianT}s, IQR ${rk.p25T}–${rk.p75T}s, ${rk.under30} under 30 s`)
check('perfect-timing bot (info): survives 300 s', true, `${bots.perfect.survivedCap}/${bots.perfect.n}`)
check('scores fit server cap (500000)', Math.max(...Object.values(bots).map((b) => b.maxScore)) < 500000, `max ${Math.max(...Object.values(bots).map((b) => b.maxScore))}`)

// ── 5. difficulty ramp: per-30s buckets ──
{
  const buckets = []
  for (let t0 = 0; t0 < 240; t0 += 30) {
    const s0 = distAt(t0)
    const s1 = distAt(t0 + 30)
    let rows = 0
    let multi = 0
    for (const sd of seedList(40, 'ramp')) {
      const tr = new Track(sd)
      tr.ensure(s1 + 10)
      const starts = new Map()
      for (const o of tr.obstacles) if (o.s >= s0 && o.s < s1) {
        if (!starts.has(o.s)) starts.set(o.s, [])
        starts.get(o.s).push(o)
      }
      rows += starts.size
      for (const os of starts.values()) if (os.length >= 2 && os.some((o) => o.kind !== 'car')) multi++
    }
    // decent-bot hazard: deaths in bucket / alive at start
    const alive = d.runs.filter((r) => r.t >= t0).length
    const died = d.runs.filter((r) => r.dead && r.t >= t0 && r.t < t0 + 30).length
    buckets.push({
      t: `${t0}-${t0 + 30}s`,
      speed: r1(speedAt((s0 + s1) / 2)),
      level: Math.round(levelAt((s0 + s1) / 2) * 100) / 100,
      rowsPerSec: Math.round((rows / 40 / 30) * 100) / 100,
      mixedRowPct: Math.round((multi / Math.max(1, rows)) * 100),
      decentHazardPct: alive ? Math.round((died / alive) * 100) : null,
    })
  }
  report.ramp = buckets
  if (!JSON_OUT) {
    console.log('\nramp:')
    for (const b of buckets) console.log(' ', JSON.stringify(b))
  }
  const sp = buckets.map((b) => b.speed)
  const mono = sp.every((v, i) => i === 0 || v >= sp[i - 1])
  const hz = buckets.map((b) => b.decentHazardPct).filter((x) => x != null)
  check('difficulty ramps (speed monotonic, density + hazard rise)', mono && buckets[3].rowsPerSec >= buckets[0].rowsPerSec * 0.95 && (hz[3] ?? 100) >= hz[0], `speed ${sp[0]}→${sp[sp.length - 1]} m/s, hazard ${hz.join('/')}%`)
}

report.bots = Object.fromEntries(Object.entries(bots).map(([k, b]) => [k, pub(b)]))
if (JSON_OUT) console.log(JSON.stringify(report, null, 2))
const failed = report.checks.filter((c) => !c.pass).length
if (!JSON_OUT) console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks PASS')
process.exit(failed ? 1 : 0)
