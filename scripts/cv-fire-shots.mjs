import { chromium } from 'playwright'
import { mkdirSync, rmSync } from 'fs'
import { execSync } from 'child_process'
const dir = '/workspace/arcade-shots'
const fr = `${dir}/cv-fire-frames`
rmSync(fr, { recursive: true, force: true }); mkdirSync(fr, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto('http://127.0.0.1:4173/arcade/court-vision?q=high', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForFunction(() => globalThis.__CV3D?.ready, null, { timeout: 60000 })
await page.waitForTimeout(400)
await page.screenshot({ path: `${dir}/cv-howto.png` })
await page.getByRole('button', { name: /tap to play/i }).click()
const ms = +(process.argv[2] || 380)
await page.evaluate(() => { const s = globalThis.__CV3D; s.setManual(true); s.mode = 'endless'; s.phase = 'playing'; s.streak = 5; s.announcedX5 = true; s.advance(600) })
await page.evaluate(() => globalThis.__CV3D.debugFlick({ speed: 1.02, dx: 0 }))
await page.evaluate((m) => globalThis.__CV3D.advance(m), ms)
await page.screenshot({ path: `${dir}/cv-fire-ball.png` })
if (process.argv[3] === 'video') {
  await page.evaluate(() => globalThis.__CV3D.advance(1500))
  let f = 0
  const snap = async (n) => { for (let i = 0; i < n; i++) { await page.evaluate(() => globalThis.__CV3D.advance(1000 / 30)); await page.screenshot({ path: `${fr}/${String(f++).padStart(4, '0')}.png` }) } }
  const flick = (sp, dx) => page.evaluate(([a, b]) => globalThis.__CV3D.debugFlick({ speed: a, dx: b }), [sp, dx])
  await snap(10); await flick(1.0, 0); await snap(55)
  await page.evaluate(() => { globalThis.__CV3D.streak = 9 })
  await flick(1.04, 2); await snap(55)
  await flick(0.6, 0); await snap(60)
  console.log('after miss', await page.evaluate(() => globalThis.__CV3D.streak))
  execSync(`ffmpeg -y -loglevel error -framerate 30 -i ${fr}/%04d.png -vf scale=780:-2 -pix_fmt yuv420p -c:v libx264 -crf 20 ${dir}/cv-fire.mp4`)
}
console.log(await page.evaluate(() => ({ streak: globalThis.__CV3D.streak, score: globalThis.__CV3D.score, callout: globalThis.__CV3D.callout })))
await browser.close()
