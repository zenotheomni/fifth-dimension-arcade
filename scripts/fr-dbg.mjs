import { build } from 'esbuild'
const root = '/workspace/deploy/fda-turns'
await build({ entryPoints: [root + '/scripts/fr-harness-entry.ts'], bundle: true, format: 'esm', platform: 'node', outfile: '/tmp/frsim.mjs', logLevel: 'silent' })
const { Track, newRun, step, RuleBot, SKILLS, FR_HZ } = await import('/tmp/frsim.mjs?' + Date.now())
const skill = process.argv[2] || 'perfect'
const counts = {}
for (let i = 0; i < 12; i++) {
  const tr = new Track('run:dbg' + i), st = newRun(), bot = new RuleBot(SKILLS[skill], 1000 + i)
  while (!st.dead && st.tick < 300 * FR_HZ) {
    tr.ensure(st.s + 250); bot.update(st, tr); const ev = []
    step(st, tr, { full: true, events: ev })
    for (const e of ev) if (e.type === 'life' || e.type === 'dead' || e.type === 'stumble') {
      const near = tr.obstacles.filter(o => Math.abs(o.s - st.s) < 8).map(o => `${o.kind}@${o.lane}:${(o.s - st.s).toFixed(1)}`).join(' ')
      const c = tr.corners.find(c => Math.abs(c.s - st.s) < 12)
      const key = e.type + ':' + (e.cause || e.kind || '')
      counts[key] = (counts[key] || 0) + 1
      if (i < 4) console.log(i, (st.tick / FR_HZ).toFixed(1), e.type, e.cause || e.kind || '', 'lane', st.lane, 'x', st.x.toFixed(2), 'hand', st.hand, near, c ? `corner ${c.kind} d=${(c.s - st.s).toFixed(1)}` : '')
    }
  }
}
console.log(counts)
