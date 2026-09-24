import { chromium, devices } from 'playwright'
import path from 'path'
import fs from 'fs'

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
await context.addInitScript(() => {
  try { localStorage.removeItem('fd_cv_flick_tutorial_done') } catch {}
})
const page = await context.newPage()
await page.goto('http://127.0.0.1:4173/arcade/court-vision', {
  waitUntil: 'networkidle',
  timeout: 60000,
})
await page.waitForFunction(() => globalThis.__CV_SCENE, null, { timeout: 20000 })
await page.waitForTimeout(1000)

// Idle — ball centered + hint + tutorial
await page.screenshot({ path: path.join(out, 'f5-idle.png') })
console.log('idle')

// Mid-flight via debug flick, screenshot mid-way
await page.evaluate(() => {
  const s = globalThis.__CV_SCENE
  s.debugFlick({ speed: 1.05, dx: 0 })
})
await page.waitForTimeout(280)
await page.screenshot({ path: path.join(out, 'f5-flight.png') })
console.log('flight')

// Wait for settle then swish shot
await page.waitForFunction(() => !globalThis.__CV_SCENE.flight && !globalThis.__CV_SCENE.respawning, null, { timeout: 5000 })
await page.waitForTimeout(450)
await page.evaluate(() => {
  const s = globalThis.__CV_SCENE
  s.debugFlick({ speed: 1.05, dx: 0 })
})
// Capture near rim / swish moment
await page.waitForTimeout(520)
await page.screenshot({ path: path.join(out, 'f5-swish.png') })
console.log('swish')

// Also real mouse swipe for sanity
await page.waitForFunction(() => !globalThis.__CV_SCENE.flight && !globalThis.__CV_SCENE.respawning, null, { timeout: 5000 })
await page.waitForTimeout(500)
const box = await page.locator('canvas').first().boundingBox()
if (box) {
  const x = box.x + box.width * 0.5
  const y = box.y + box.height * 0.58
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 4, y - 40, { steps: 4 })
  await page.mouse.move(x + 6, y - 120, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(out, 'f5-mouse-swipe.png') })
  console.log('mouse-swipe')
}

await browser.close()
console.log('DONE')
