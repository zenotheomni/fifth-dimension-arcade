import { chromium, devices } from 'playwright'
import fs from 'fs'
import path from 'path'

const out = '/workspace/arcade-shots'
fs.mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext({
  ...devices['iPhone 14'],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
})
const page = await context.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 400))
})

await page.goto('http://127.0.0.1:4173/arcade/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(1500)
const enter = page.getByRole('button', { name: /Enter the Fifth Floor/i })
if (await enter.count()) {
  await enter.click()
  await page.waitForTimeout(4000)
}
await page.screenshot({ path: path.join(out, '01-lobby-default.png'), fullPage: false })
console.log('saved 01')

await page.locator('.lobby3d-dot').nth(1).click({ force: true })
await page.waitForTimeout(1800)
await page.screenshot({ path: path.join(out, '02-lobby-swiped.png'), fullPage: false })
console.log('saved 02')

await page.goto('http://127.0.0.1:4173/arcade/court-vision', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.screenshot({ path: path.join(out, '03-court-idle-overlay.png'), fullPage: false })
console.log('saved 03')

const run = page.getByRole('button', { name: /Run it/i })
if (await run.count()) {
  await run.click()
  await page.waitForTimeout(3000)
}
await page.screenshot({ path: path.join(out, '04-court-idle.png'), fullPage: false })
console.log('saved 04')

const stage = page.locator('.cv3d-stage')
const box = await stage.boundingBox()
if (box) {
  const cx = box.x + box.width * 0.5
  const cy = box.y + box.height * 0.78
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 8, cy + 170, { steps: 18 })
  await page.mouse.up()
  await page.waitForTimeout(2500)
}
await page.screenshot({ path: path.join(out, '05-court-after-shot.png'), fullPage: false })
console.log('saved 05')

const scoreText = await page.locator('.cv3d-hud__score').textContent().catch(() => '?')
const toast = await page.locator('.cv3d-toast').allTextContents().catch(() => [])
const hint = await page.locator('.cv3d-hint').textContent().catch(() => '')
console.log('SCORE', scoreText, 'TOASTS', toast, 'HINT', hint)

await browser.close()
console.log('DONE')
