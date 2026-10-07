/**
 * Fifth Glide — quick bot survival check (no oracle). Used to iterate the difficulty curve.
 *   node scripts/fr-quick.mjs [--seeds N] [--skills rookie,novice,decent]
 */
import { build } from 'esbuild'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import { createHash } from 'crypto'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = path.join(mkdtempSync(path.join(tmpdir(), 'frq-')), 'sim.mjs')
await build({ entryPoints: [path.join(root, 'scripts/fr-harness-entry.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' })
const { Track, newRun, step, RuleBot, SKILLS, FR_HZ, speedAt, FR_DT } = await import(pathToFileURL(out).href)
const argv = process.argv.slice(2)
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d)
const N = Number(arg('--seeds', 60))
const skills = arg('--skills', 'rookie,novice,decent').split(',')
const seeds = Array.from({ length: N }, (_, i) => {
  const h = createHash('sha1').update(`bot${i}`).digest('hex').slice(0, 12)
  return i % 3 === 0 ? `sway:${h}` : i % 3 === 1 ? `still:${h}` : `run:${h}`
})
const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * (a.length - 1) + 0.5))]
for (const name of skills) {
  const sk = SKILLS[name] ?? (process.env.SKILL_JSON ? { name, ...JSON.parse(process.env.SKILL_JSON) } : undefined)
  if (!sk) { console.log('no skill', name); continue }
  const ts = []
  const firstHit = []
  const dists = []
  seeds.forEach((sd, i) => {
    const tr = new Track(sd)
    const st = newRun()
    const bot = new RuleBot(sk, 1000 + i)
    let lives = st.lives
    let fh = null
    while (!st.dead && st.tick < 400 * FR_HZ) {
      tr.ensure(st.s + 250)
      bot.update(st, tr)
      step(st, tr, { full: true, events: [] })
      if (fh === null && st.lives < lives) fh = st.tick / FR_HZ
    }
    ts.push(st.tick / FR_HZ)
    dists.push(st.s)
    firstHit.push(fh ?? st.tick / FR_HZ)
  })
  const r1 = (x) => Math.round(x * 10) / 10
  console.log(name.padEnd(8), JSON.stringify({ n: N, medianT: r1(pct(ts, 0.5)), p25T: r1(pct(ts, 0.25)), p75T: r1(pct(ts, 0.75)), under30: ts.filter((t) => t < 30).length, under60: ts.filter((t) => t < 60).length, medianFirstHitT: r1(pct(firstHit, 0.5)), hitBefore30: firstHit.filter((t) => t < 30).length, medianDist: Math.round(pct(dists, 0.5)) }))
}
let s = 0
const sp = []
for (let t = 0; t <= 120; t += FR_DT) { s += speedAt(s) * FR_DT; if (Math.abs(t - Math.round(t)) < FR_DT / 2 && Math.round(t) % 15 === 0) sp.push(`${Math.round(t)}s:${Math.round(s)}m@${speedAt(s).toFixed(1)}`) }
console.log('speed', sp.join(' '))
