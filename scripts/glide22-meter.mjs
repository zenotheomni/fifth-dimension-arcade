/** v22: combo alert placement comparison (?meter=bottom|ufo) at 390 / 430 px. PORT=4192 node scripts/glide22-meter.mjs */
import { chromium } from 'playwright'
const OUT = process.env.OUT || '/workspace/arcade-shots'
const W = +(process.env.W || 390)
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
for (const meter of (process.env.M || 'bottom,ufo').split(',')) {
  const ctx = await browser.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }))
  const page = await ctx.newPage()
  await page.goto(`http://127.0.0.1:${process.env.PORT || 4192}/arcade/fifth-glide?q=high&seed=run:5d1959ca&meter=${meter}`, { waitUntil: 'networkidle', timeout: 400000 })
  await page.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 400000 })
  await page.evaluate(() => { const e = globalThis.__FR; e.setManual(true); e.advance(900) })
  await page.click('.fr-howto__start')
  await page.evaluate(() => { const e = globalThis.__FR; e.setAutopilot('expert'); e.run.invuln = 1e6 })
  await page.evaluate(() => globalThis.__FR.advance(14000))
  await page.evaluate(() => { const e = globalThis.__FR; e.run.invuln = 0; e.run.combo = Math.max(e.run.combo, 20); e.say('20 streak · +60 m', 'gold', 30); e.advance(400); e.emitHud?.(true) })
  await page.waitForTimeout(800)
  const info = await page.evaluate(() => {
    const v = globalThis.__FR.view; const g = v.dark.group; g.updateWorldMatrix(true, true)
    const box = new (v.camera.position.constructor.prototype.constructor === undefined ? Object : Object)()
    const pts = []; g.traverse((o) => { if (o.isMesh && o.visible) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) { const p = v.camera.position.clone().set(x, y, z).applyMatrix4(o.matrixWorld).project(v.camera); pts.push(p) } } })
    const H = innerHeight, Wd = innerWidth
    const ys = pts.map((p) => (1 - p.y) / 2 * H), xs = pts.map((p) => (p.x + 1) / 2 * Wd)
    const c = document.querySelector('.fr-callout')?.getBoundingClientRect()
    return { ufo: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(Math.round), callout: c && [c.left, c.top, c.right, c.bottom].map(Math.round) }
  })
  console.log(meter, W, JSON.stringify(info))
  await page.screenshot({ path: `${OUT}/glide22-meter-${meter === 'ufo' ? 'under-ufo' : 'bottom'}${W === 390 ? '' : '-' + W}.png` })
  await ctx.close()
}
await browser.close()
