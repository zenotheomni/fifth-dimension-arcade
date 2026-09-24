import { chromium, devices } from 'playwright'
import fs from 'fs'
import path from 'path'

const out = '/workspace/arcade-shots'
fs.mkdirSync(out, { recursive: true })

async function shot(name, page) {
  const p = path.join(out, name)
  await page.screenshot({ path: p, fullPage: false })
  console.log('saved', name)
}

async function runViewport(width, height, tag) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  })
  const context = await browser.newContext({
    ...devices['iPhone 14'],
    viewport: { width, height },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))

  // Title after intro sting (~2s)
  await page.goto('http://127.0.0.1:4173/arcade/', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2200)
  await shot(`p3-title-${tag}.png`, page)

  // Enter select
  await page.locator('.ffa-title').click({ force: true }).catch(() => {})
  await page.waitForTimeout(900)
  await shot(`p3-select-${tag}.png`, page)

  // Court Vision
  await page.goto('http://127.0.0.1:4173/arcade/court-vision', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  await shot(`p3-court-idle-${tag}.png`, page)

  // Flick shot from ball home (~ bottom center)
  const canvas = page.locator('canvas').first()
  await canvas.waitFor({ timeout: 15000 })
  const box = await canvas.boundingBox()
  if (box) {
    const cx = box.x + box.width * 0.5
    const cy = box.y + box.height * 0.78
    // mid-flight: start pull and screenshot mid
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 6, cy + 40, { steps: 6 })
    await page.waitForTimeout(80)
    await page.mouse.move(cx + 10, cy + 160, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(280)
    await shot(`p3-court-flight-${tag}.png`, page)
    await page.waitForTimeout(900)
    await shot(`p3-court-swish-${tag}.png`, page)

    // Build streak with a few more makes for fire
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(400)
      const b = await canvas.boundingBox()
      if (!b) break
      const x = b.x + b.width * 0.5
      const y = b.y + b.height * 0.78
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 8, y + 150, { steps: 12 })
      await page.mouse.up()
      await page.waitForTimeout(900)
    }
    await page.waitForTimeout(200)
    // one more in flight for fire
    const b2 = await canvas.boundingBox()
    if (b2) {
      const x = b2.x + b2.width * 0.5
      const y = b2.y + b2.height * 0.78
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 10, y + 155, { steps: 12 })
      await page.mouse.up()
      await page.waitForTimeout(250)
      await shot(`p3-court-fire-${tag}.png`, page)
    }
  }

  await browser.close()
}

await runViewport(390, 844, '390')
await runViewport(430, 932, '430')
console.log('ALL DONE')
