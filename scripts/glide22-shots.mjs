/** v22: straight pre-turn view, cliff run-off fall, streak alert (bottom) with UFO. PORT=4192 node scripts/glide22-shots.mjs */
import { chromium } from 'playwright'
const OUT = process.env.OUT || '/workspace/arcade-shots'
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }))
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto(`http://127.0.0.1:${process.env.PORT || 4192}/arcade/fifth-glide?q=high&seed=run:5d1959ca`, { waitUntil: 'networkidle', timeout: 400000 })
await page.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 400000 })
await page.evaluate(() => { const e = globalThis.__FR; e.setManual(true); e.advance(900) })
await page.click('.fr-howto__start')
await page.evaluate(() => { const e = globalThis.__FR; e.setAutopilot('expert'); e.run.invuln = 1e6 })
const adv = (ms) => page.evaluate((m) => globalThis.__FR.advance(m), ms)
const shot = (n) => page.screenshot({ path: `${OUT}/${n}` }).then(() => console.log('shot', n))
await adv(6000)
// streak alert at the bottom (default placement) with the UFO in view
await page.evaluate(() => { const e = globalThis.__FR; e.run.combo = Math.max(e.run.combo, 20); e.say('20 streak · +60 m', 'gold', 30); e.advance(400) })
await page.waitForTimeout(700)
await shot('glide22-combo-ufo.png')
await page.evaluate(() => { const e = globalThis.__FR; e.say('', 'gold', 0.01); e.advance(200) })
// next corner ~14 m ahead: camera must still look straight down the track
const nextC = () => page.evaluate(() => { const e = globalThis.__FR; const c = e.track.corners.find((c) => c.s > e.run.cDone); return c ? c.s - e.run.s : 1e9 })
for (let i = 0; i < 400; i++) { const d = await nextC(); if (d > 10 && d < 18) break; await adv(d > 60 ? 600 : 50) }
await page.evaluate(() => { const e = globalThis.__FR; e.run.turnQ = 0 })
await shot('glide22-preturn-straight.png')
// now miss it on purpose: autopilot off, run straight off the cliff
await page.evaluate(() => { const e = globalThis.__FR; e.setAutopilot(false); e.run.turnQ = 0; e.run.invuln = 0 })
for (let i = 0; i < 200; i++) { const dn = await page.evaluate(() => globalThis.__FR.run.down); if (dn > 0) break; await adv(30) }
await adv(130)
await shot('glide22-cliff-fall-1.png')
await adv(330)
await shot('glide22-cliff-fall-2.png')
console.log(await page.evaluate(() => { const r = globalThis.__FR.run; return JSON.stringify({ lives: r.lives, down: r.down, cause: r.downKind }) }))
await browser.close()
