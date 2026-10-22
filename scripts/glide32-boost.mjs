/** v32: frame cost while the 5D boost (x1.75) is on vs off. PORT=4232 node scripts/glide32-boost.mjs */
import { chromium } from 'playwright'
const BASE = `http://127.0.0.1:${process.env.PORT || 4232}/arcade`
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const res = {}
for (const mode of ['off', 'boost', 'off', 'boost']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true })
  await ctx.route('**/api/**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }))
  const p = await ctx.newPage()
  await p.goto(`${BASE}/fifth-glide?q=low`, { waitUntil: 'networkidle' })
  await p.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 300000 })
  await p.waitForTimeout(3000)
  await p.click('.fr-howto__start')
  await p.evaluate(() => globalThis.__FR.setAutopilot('perfect'))
  await p.waitForTimeout(6000)
  await p.evaluate((boost) => {
    const e = globalThis.__FR
    const acc = { vu: 0, vr: 0, en: 0, ev: 0, hud: 0, say: 0 }, cnt = { ev: 0, say: 0, hud: 0, burst: 0, chunk: 0 }
    const wrap = (o, k, key, c) => { const f = o[k].bind(o); o[k] = (...a) => { const t = performance.now(); const r = f(...a); acc[key] += performance.now() - t; if (c) cnt[c]++; return r } }
    wrap(e.view, 'update', 'vu'); wrap(e.view, 'render', 'vr'); wrap(e.track, 'ensure', 'en'); wrap(e, 'onEvent', 'ev', 'ev'); wrap(e, 'emitHud', 'hud'); wrap(e, 'say', 'say', 'say')
    const bu = e.view.burst.bind(e.view); e.view.burst = (...a) => { cnt.burst++; return bu(...a) }
    const uc = e.view.useChunk.bind(e.view); e.view.useChunk = (m, k, mk, pl) => uc(m, k, () => { cnt.chunk++; return mk() }, pl)
    const hudf = e.bridge.onHud; e.bridge.onHud = (s) => { cnt.hud++; return hudf(s) }
    const cpu = (globalThis.__CPU = []), parts = (globalThis.__PARTS = [])
    const up = e.update.bind(e)
    e.update = (dt, skip) => { if (boost) e.run.hand = Math.max(e.run.hand, 200); for (const k in acc) acc[k] = 0; const a = performance.now(); const r = up(dt, skip); cpu.push(performance.now() - a); parts.push({ ...acc }); return r }
    const fd = (globalThis.__FD = []); let last = performance.now(); const t0 = last
    const tick = (now) => { fd.push(now - last); last = now; if (now - t0 < 8000) requestAnimationFrame(tick) }
    requestAnimationFrame(tick); globalThis.__CNT = cnt
  }, mode === 'boost')
  await p.waitForTimeout(8500)
  const r = await p.evaluate(() => {
    const q = (a, x) => { const s = [...a].sort((m, n) => m - n); return +s[Math.min(s.length - 1, Math.floor(x * s.length))].toFixed(1) }
    const c = globalThis.__CPU, P = globalThis.__PARTS, fd = globalThis.__FD
    const avg = {}; for (const k of Object.keys(P[0])) avg[k] = +(P.reduce((a, x) => a + x[k], 0) / P.length).toFixed(2)
    const mx = {}; for (const k of Object.keys(P[0])) mx[k] = +Math.max(...P.map((x) => x[k])).toFixed(1)
    return { frames: fd.length, rafMed: q(fd, 0.5), rafP95: q(fd, 0.95), rafMax: q(fd, 1), cpuMed: q(c, 0.5), cpuP95: q(c, 0.95), cpuP99: q(c, 0.99), cpuMax: q(c, 1), avg, mx, cnt: globalThis.__CNT, speed: Math.round(globalThis.__FR.run.v * 3.6), alive: !globalThis.__FR.run.dead }
  })
  ;(res[mode] ||= []).push(r)
  console.log(mode, JSON.stringify(r))
  await ctx.close()
}
await b.close()
