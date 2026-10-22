/** v28 (webkit-capable, CVB=webkit): frame times for the first 10 s of a Fifth Glide run (rAF deltas + long tasks). PORT=4194 node scripts/glide24-frames.mjs */
import { chromium, webkit } from 'playwright'
const BASE = `http://127.0.0.1:${process.env.PORT || 4194}/arcade`
const RUNS = +(process.env.RUNS || 3)
const b = process.env.CVB === 'webkit' ? await webkit.launch() : await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const out = []
for (let r = 0; r < RUNS; r++) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true })
  await ctx.route('**/api/**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }))
  const p = await ctx.newPage()
  await p.goto(`${BASE}/fifth-glide?q=${process.env.Q || 'low'}`, { waitUntil: 'networkidle' })
  await p.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 300000 })
  await p.waitForTimeout(4000) // sitting on the how-to (where pre-warm runs)
  await p.evaluate(() => {
    const e = globalThis.__FR
    const info = e.view.renderer.info
    globalThis.__P0 = { programs: info.programs.length, tex: info.memory.textures, geo: info.memory.geometries }
    // CPU cost of each engine frame (sim + scene update + render submit, incl. any sync shader compile / upload)
    const cpu = (globalThis.__CPU = [])
    const acc = (globalThis.__ACC = { vu: 0, vr: 0, en: 0 })
    const wrap = (o, k, key) => { const f = o[k].bind(o); o[k] = (...a) => { const t = performance.now(); const r = f(...a); acc[key] += performance.now() - t; return r } }
    wrap(e.view, 'update', 'vu'); wrap(e.view, 'render', 'vr'); wrap(e.track, 'ensure', 'en'); for (const k of ['onEvent', 'emitHud', 'fireRun', 'say', 'crash']) if (e[k]) { acc[k] = 0; wrap(e, k, k) }
    globalThis.__SPK = []
    const up = e.update.bind(e)
    e.update = (dt, skip) => { const a = performance.now(); const r = up(dt, skip); const c = performance.now() - a; cpu.push(c); if (c > 30) globalThis.__SPK.push({ i: cpu.length, ms: Math.round(c), ...Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, Math.round(v)])), prog: e.view.renderer.info.programs.length, geo: e.view.renderer.info.memory.geometries }); for (const k in acc) acc[k] = 0; return r }
    const d = (globalThis.__FD = [])
    let last = performance.now()
    const t0 = last
    const tick = (now) => { d.push(now - last); last = now; if (now - t0 < 10000) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  const cdp = process.env.PROF ? await ctx.newCDPSession(p) : null
  if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start') }
  await p.click('.fr-howto__start')
  await p.waitForTimeout(10600)
  if (cdp) {
    const { profile } = await cdp.send('Profiler.stop')
    const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n]))
    const dt = profile.timeDeltas; for (let i = 0; i < profile.samples.length; i++) { const n = byId.get(profile.samples[i]); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0) / 1000) }
    console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${v.toFixed(0)}ms ${k}`).join('\n'))
  }
  const fd = await p.evaluate(() => globalThis.__FD)
  const mus = await p.evaluate(() => { try { const m = globalThis.__ARCADE_MUSIC?.(); return { mode: m?.mode, decoded: m?.decoded, track: m?.track } } catch { return null } })
  const fs = [...fd].sort((a, b) => a - b)
  console.log('raf', JSON.stringify({ n: fd.length, median: +fs[fs.length >> 1].toFixed(1), p95: +fs[Math.floor(fs.length * 0.95)].toFixed(1), max: +fs[fs.length - 1].toFixed(1), over50: fd.filter((x) => x > 50).length, over100: fd.filter((x) => x > 100).length, maxFirst3s: +Math.max(...fd.slice(0, 120)).toFixed(1), big: fd.map((x, i) => [i, Math.round(x)]).filter(([, x]) => x > 80), mus }))
  const d = await p.evaluate(() => globalThis.__CPU)
  const res = await p.evaluate(() => { const i = globalThis.__FR.view.renderer.info; return { p0: globalThis.__P0, p1: { programs: i.programs.length, tex: i.memory.textures, geo: i.memory.geometries } } })
  const s = [...d].sort((a, b) => a - b)
  const q = (x) => s[Math.min(s.length - 1, Math.floor(x * s.length))]
  const first2 = d.slice(0, 30)
  out.push({ n: d.length, median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1), over33: d.filter((x) => x > 33.4).length, over50: d.filter((x) => x > 50).length, maxFirst2s: +Math.max(...first2).toFixed(1), newPrograms: res.p1.programs - res.p0.programs, newTex: res.p1.tex - res.p0.tex, newGeo: res.p1.geo - res.p0.geo })
  console.log('spikes', JSON.stringify(await p.evaluate(() => globalThis.__SPK)))
  await ctx.close()
}
console.log(JSON.stringify(out))
await b.close()
