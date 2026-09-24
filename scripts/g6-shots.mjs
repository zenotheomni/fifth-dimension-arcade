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
const page = await context.newPage()
await page.goto('http://127.0.0.1:4173/arcade/court-vision', {
  waitUntil: 'networkidle',
  timeout: 60000,
})
await page.waitForFunction(() => globalThis.__CV_SCENE, null, { timeout: 20000 })
await page.waitForTimeout(600)

async function ready() {
  await page.waitForFunction(
    () => {
      const s = globalThis.__CV_SCENE
      return s && !s.flight && !s.respawning && s.phase === 'playing'
    },
    null,
    { timeout: 8000 },
  )
  await page.waitForTimeout(200)
}

// Bank — strong flick, capture at board contact
await ready()
await page.evaluate(() => globalThis.__CV_SCENE.debugFlick({ speed: 1.35, dx: 0 }))
const bankFrames = []
for (let i = 0; i < 18; i++) {
  await page.waitForTimeout(40)
  const pth = path.join(out, `g6-bank-f${String(i).padStart(2, '0')}.png`)
  await page.screenshot({ path: pth })
  bankFrames.push(pth)
  const done = await page.evaluate(() => !globalThis.__CV_SCENE.flight)
  if (done && i > 4) break
}
await page.screenshot({ path: path.join(out, 'g6-bank.png') })
console.log('bank')

// Front rim clank
await ready()
await page.evaluate(() => globalThis.__CV_SCENE.debugFlick({ speed: 0.58, dx: 0 }))
await page.waitForTimeout(420)
await page.screenshot({ path: path.join(out, 'g6-rim.png') })
console.log('rim')

// Swish
await ready()
await page.evaluate(() => globalThis.__CV_SCENE.debugFlick({ speed: 1.05, dx: 0 }))
await page.waitForTimeout(480)
await page.screenshot({ path: path.join(out, 'g6-swish.png') })
console.log('swish')

// Extreme over
await ready()
await page.evaluate(() => globalThis.__CV_SCENE.debugFlick({ speed: 2.25, dx: 0 }))
await page.waitForTimeout(380)
await page.screenshot({ path: path.join(out, 'g6-over.png') })
console.log('over')

// GIF from bank frames if convert available
const { execSync } = await import('child_process')
try {
  const frames = fs.readdirSync(out).filter((f) => f.startsWith('g6-bank-f')).sort()
  if (frames.length) {
    execSync(
      `convert -delay 8 -loop 0 ${frames.map((f) => path.join(out, f)).join(' ')} ${path.join(out, 'g6-bank.gif')}`,
      { stdio: 'inherit' },
    )
    console.log('gif ok', frames.length)
  }
} catch (e) {
  console.log('gif skip', e.message?.slice(0, 80))
}

await browser.close()
console.log('DONE')
