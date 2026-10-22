/** v30: frame times + camera FOV/speed continuity around speed steps (perfect autopilot, invulnerable). PORT CVB=webkit SEC=60 */
import { chromium, webkit } from 'playwright'
const SEC = +(process.env.SEC || 60)
const b = process.env.CVB === 'webkit' ? await webkit.launch() : await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true })
await ctx.route('**/api/**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }))
const p = await ctx.newPage()
await p.goto(`http://127.0.0.1:${process.env.PORT}/arcade/fifth-glide?q=low&seed=steps`, { waitUntil: 'networkidle' })
await p.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 300000 })
await p.waitForTimeout(3000)
await p.click('.fr-howto__start')
const r = await p.evaluate(async (SEC) => {
  const e = globalThis.__FR
  e.setAutopilot('perfect')
  const rows = []
  const up = e.update.bind(e)
  e.update = (dt, skip) => { e.run.invuln = 1e6; const a = performance.now(); const x = up(dt, skip); rows.push({ t: e.clock, cpu: performance.now() - a, v: e.run.v, fov: e.view.camera.fov, dpr: e.view.dprScale }); return x }
  const raf = []
  let last = performance.now()
  await new Promise((res) => { const t0 = last; const tick = (n) => { raf.push([n - t0, n - last]); last = n; if (n - t0 < SEC * 1000) requestAnimationFrame(tick); else res() }; requestAnimationFrame(tick) })
  return { rows, raf }
}, SEC)
// speed steps: frames where v crosses a new 4.5 band start
const steps = []
for (let i = 1; i < r.rows.length; i++) if (r.rows[i].v - r.rows[i - 1].v > 0.0005 && !(r.rows[i - 1].v - (r.rows[i - 2]?.v ?? 0) > 0.0005)) steps.push(r.rows[i].t)
const near = (t) => steps.some((s) => t >= s - 0.5 && t <= s + 2.5)
const st = (a) => { const s = [...a].sort((x, y) => x - y); return a.length ? { n: a.length, med: +s[s.length >> 1].toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), max: +s[s.length - 1].toFixed(1) } : null }
let fovJump = 0, dprChanges = 0
for (let i = 1; i < r.rows.length; i++) { const dt = r.rows[i].t - r.rows[i - 1].t; if (dt > 0) fovJump = Math.max(fovJump, Math.abs(r.rows[i].fov - r.rows[i - 1].fov) / dt); if (r.rows[i].dpr !== r.rows[i - 1].dpr) dprChanges++ }
const t0 = r.rows[0].t
console.log(JSON.stringify({ steps: steps.map((s) => +(s - t0).toFixed(1)), cpuNearSteps: st(r.rows.filter((x) => near(x.t)).map((x) => x.cpu)), cpuElse: st(r.rows.filter((x) => !near(x.t)).map((x) => x.cpu)), maxFovDegPerS: +fovJump.toFixed(1), dprChanges, rafAll: st(r.raf.map((x) => x[1])), rafFirst3s: st(r.raf.filter((x) => x[0] < 3000).map((x) => x[1])) }))
await b.close()
