/** v32: deterministic per-frame CPU (sim + scene update + render submit) at top speed, boost on vs off.
 * Manual 60 Hz frames after 100 s of autopilot. PORT=4232 node scripts/glide32-boost2.mjs */
import { chromium } from 'playwright'
const BASE = `http://127.0.0.1:${process.env.PORT || 4232}/arcade`
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
for (const mode of (process.env.MODES || 'off,boost,off,boost').split(',')) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  await ctx.route('**/api/**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }))
  const p = await ctx.newPage()
  await p.goto(`${BASE}/fifth-glide?q=low`, { waitUntil: 'networkidle' })
  await p.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 300000 })
  await p.waitForTimeout(2000)
  await p.click('.fr-howto__start')
  const r = await p.evaluate((boost) => {
    const e = globalThis.__FR
    e.setAutopilot('perfect'); e.setManual(true)
    e.advance(100000) // 100 s, render skipped except last frame
    const acc = { vu: 0, vr: 0, en: 0, ev: 0 }, cnt = { burst: 0, chunk: 0, say: 0 }
    const wrap = (o, k, key) => { const f = o[k].bind(o); o[k] = (...a) => { const t = performance.now(); const r = f(...a); acc[key] += performance.now() - t; return r } }
    wrap(e.view, 'update', 'vu'); wrap(e.view, 'render', 'vr'); wrap(e.track, 'ensure', 'en'); wrap(e, 'onEvent', 'ev')
    const bu = e.view.burst.bind(e.view); e.view.burst = (...a) => { cnt.burst++; return bu(...a) }
    const uc = e.view.useChunk.bind(e.view); e.view.useChunk = (m, k, mk, pl) => uc(m, k, () => { cnt.chunk++; return mk() }, pl)
    const sy = e.say.bind(e); e.say = (...a) => { cnt.say++; return sy(...a) }
    const cpu = [], P = []
    for (let i = 0; i < 1200; i++) {
      if (boost) e.run.hand = Math.max(e.run.hand, 400)
      for (const k in acc) acc[k] = 0
      const a = performance.now(); e.update(1 / 60); e.view.render?.length; cpu.push(performance.now() - a); P.push({ ...acc })
    }
    const q = (a, x) => { const s = [...a].sort((m, n) => m - n); return +s[Math.min(s.length - 1, Math.floor(x * s.length))].toFixed(2) }
    const stat = (k) => ({ avg: +(P.reduce((a, x) => a + x[k], 0) / P.length).toFixed(2), p99: q(P.map((x) => x[k]), 0.99), max: q(P.map((x) => x[k]), 1) })
    return { med: q(cpu, 0.5), p95: q(cpu, 0.95), p99: q(cpu, 0.99), max: q(cpu, 1), over16: cpu.filter((x) => x > 16.7).length, vu: stat('vu'), vr: stat('vr'), en: stat('en'), ev: stat('ev'), cnt, obs: e.track.obstacles.length, keys: e.track.keys.length, chunks: e.view.chunks.size, kmh: Math.round(e.run.v * 3.6), alive: !e.run.dead }
  }, mode === 'boost')
  console.log(mode, JSON.stringify(r))
  await ctx.close()
}
await b.close()
