import { chromium, devices } from 'playwright'
import fs from 'fs'
import path from 'path'

const out = '/workspace/arcade-shots'
fs.mkdirSync(out, { recursive: true })
const CHAL_WIN = '6y6rz8b4' // target 120
const CHAL_LOSE = '9p7d1bcc' // target 50
const PROD = 'https://fifth-dimension-arcade.vercel.app'

async function shot(page, name) {
  const p = path.join(out, name)
  await page.screenshot({ path: p, fullPage: false })
  console.log('saved', name)
}

async function withProxy(context) {
  // Proxy /api to production so challenge fetch works on preview
  await context.route('**/api/**', async (route) => {
    const req = route.request()
    const url = req.url().replace(/https?:\/\/127\.0\.0\.1:\d+/, PROD)
    const headers = { ...req.headers(), host: new URL(PROD).host }
    const res = await route.fetch({ url, headers })
    await route.fulfill({ response: res })
  })
}

async function endRunWithScore(page, score) {
  await page.waitForFunction(() => globalThis.__CV_GAME, null, { timeout: 20000 })
  await page.evaluate((s) => {
    const g = globalThis.__CV_GAME
    const scene = g.scene.getScene('CourtVision')
    scene.score = s
    scene.streak = Math.max(1, Math.floor(s / 20))
    scene.endRun()
  }, score)
  await page.waitForTimeout(600)
}

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
await withProxy(context)
const page = await context.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))

// 1) Challenge landing
await page.goto(`http://127.0.0.1:4173/arcade/challenge/${CHAL_WIN}`, {
  waitUntil: 'networkidle',
  timeout: 60000,
})
await page.waitForSelector('.cvp-challenger__target', { timeout: 15000 })
await page.waitForTimeout(500)
await shot(page, 'c4-challenge-landing.png')

// 2) End screen with handle input (clear handle, play, end)
await context.clearCookies()
await page.addInitScript(() => {
  try {
    localStorage.removeItem('fd_arcade_handle')
    localStorage.removeItem('fd_arcade_device_id')
  } catch {}
})
await page.goto('http://127.0.0.1:4173/arcade/court-vision', {
  waitUntil: 'networkidle',
  timeout: 60000,
})
await page.waitForTimeout(2000)
await endRunWithScore(page, 42)
await page.waitForSelector('.cvp-handle__input', { timeout: 10000 })
await page.waitForTimeout(400)
await shot(page, 'c4-end-handle.png')

// 3) Challenge result WIN
await page.goto(`http://127.0.0.1:4173/arcade/challenge/${CHAL_LOSE}`, {
  waitUntil: 'networkidle',
  timeout: 60000,
})
await page.waitForSelector('text=Accept challenge', { timeout: 15000 })
await page.getByRole('button', { name: /Accept challenge/i }).click()
await page.waitForTimeout(2500)
await endRunWithScore(page, 80) // target 50 → win
await page.waitForSelector('.cvp-end', { timeout: 10000 })
await page.waitForTimeout(500)
await shot(page, 'c4-challenge-win.png')

// 4) Challenge result LOSE
await page.goto(`http://127.0.0.1:4173/arcade/challenge/${CHAL_WIN}`, {
  waitUntil: 'networkidle',
  timeout: 60000,
})
await page.waitForSelector('text=Accept challenge', { timeout: 15000 })
await page.getByRole('button', { name: /Accept challenge/i }).click()
await page.waitForTimeout(2500)
await endRunWithScore(page, 12) // target 120 → lose
await page.waitForSelector('.cvp-end', { timeout: 10000 })
await page.waitForTimeout(500)
await shot(page, 'c4-challenge-lose.png')

await browser.close()
console.log('ALL DONE')
