// v32 diag: what the bots hit (stumbles / lives) by obstacle kind and minute
import { build } from 'esbuild'
import { mkdtempSync } from 'fs'; import { tmpdir } from 'os'; import path from 'path'; import { pathToFileURL } from 'url'
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = path.join(mkdtempSync(path.join(tmpdir(), 'fr-')), 'sim.mjs')
await build({ entryPoints: [path.join(root, 'scripts/fr-harness-entry.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' })
const { Track, newRun, step, RuleBot, SKILLS, FR_HZ } = await import(pathToFileURL(out).href)
for (const name of (process.env.SK || 'decent,expert').split(',')) {
  const by = {}, ts = []
  for (let i = 0; i < 12; i++) {
    const tr = new Track('h' + i), st = newRun(), bot = new RuleBot(SKILLS[name], 1000 + i), ev = []
    while (!st.dead && st.tick < 400 * FR_HZ) { tr.ensure(st.s + 250); bot.update(st, tr); ev.length = 0; step(st, tr, { full: true, events: ev })
      for (const e of ev) if (e.type === 'stumble' || e.type === 'dead' || e.type === 'life') { const k = e.type + ':' + (e.kind ?? e.cause); by[k] = (by[k] || 0) + 1 } }
    ts.push(Math.round(st.tick / FR_HZ))
  }
  console.log(name, JSON.stringify(by), ts.join(' '))
}
