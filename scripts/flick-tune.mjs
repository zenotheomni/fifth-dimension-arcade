import { chromium, devices } from 'playwright'

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

await page.goto('http://127.0.0.1:4173/arcade/court-vision', {
  waitUntil: 'networkidle',
  timeout: 60000,
})
await page.waitForFunction(() => globalThis.__CV_SCENE, null, { timeout: 20000 })
await page.waitForTimeout(600)

// Switch to endless + freeze clock so harness can run
await page.evaluate(() => {
  const s = globalThis.__CV_SCENE
  s.mode = 'endless'
  s.timeLeft = 9999
  s.ended = false
  s.phase = 'playing'
})
// Click Endless button if present
const endless = page.getByRole('button', { name: /^Endless$/i })
if (await endless.count()) {
  await endless.click().catch(() => {})
  await page.waitForTimeout(900)
  await page.waitForFunction(() => globalThis.__CV_SCENE, null, { timeout: 15000 })
  await page.evaluate(() => {
    const s = globalThis.__CV_SCENE
    s.mode = 'endless'
    s.timeLeft = 9999
    s.ended = false
    s.phase = 'playing'
  })
}

async function waitReady() {
  await page.waitForFunction(
    () => {
      const s = globalThis.__CV_SCENE
      if (!s) return false
      if (s.ended) {
        s.ended = false
        s.phase = 'playing'
        s.timeLeft = 9999
      }
      if (s.respawning) return false
      if (s.flight) return false
      return s.phase === 'playing'
    },
    null,
    { timeout: 8000 },
  )
}

async function fire(opts) {
  await waitReady()
  const before = await page.evaluate(() => globalThis.__CV_SCENE.score)
  const shot = await page.evaluate((o) => {
    const s = globalThis.__CV_SCENE
    s.ended = false
    s.phase = 'playing'
    s.respawning = false
    const r = s.debugFlick(o)
    return r
      ? {
          power: +r.power.toFixed(3),
          perfect: r.perfect,
          angle: +r.angle.toFixed(3),
          err: +Math.hypot(r.targetX - s.hoopX, r.targetY - s.hoopY).toFixed(2),
          tyOff: +(r.targetY - s.hoopY).toFixed(1),
          txOff: +(r.targetX - s.hoopX).toFixed(1),
        }
      : null
  }, opts)
  if (!shot) {
    return { shot: null, made: false, delta: 0 }
  }
  // Wait until flight resolved and ball ready (or timeout)
  await page.waitForFunction(
    () => {
      const s = globalThis.__CV_SCENE
      return s && !s.flight
    },
    null,
    { timeout: 3000 },
  ).catch(() => {})
  await page.waitForTimeout(500) // respawn
  const after = await page.evaluate(() => globalThis.__CV_SCENE.score)
  return { shot, made: after > before, delta: after - before }
}

const suites = []

{
  let makes = 0
  const n = 20
  const details = []
  for (let i = 0; i < n; i++) {
    const speed = 0.95 + (i % 5) * 0.05
    const r = await fire({ speed, dx: 0 })
    if (r.made) makes++
    details.push({ speed, made: r.made, ...r.shot })
  }
  suites.push({ name: 'straight_medium', makes, n, rate: makes / n, details })
}

{
  let makes = 0
  const n = 10
  for (let i = 0; i < n; i++) {
    const dx = i % 2 === 0 ? 70 : -70
    const r = await fire({ speed: 1.05, dx })
    if (r.made) makes++
  }
  suites.push({ name: 'angled_wide', makes, n, rate: makes / n })
}

{
  let makes = 0
  const n = 10
  for (let i = 0; i < n; i++) {
    const r = await fire({ speed: 0.42, dx: 0 })
    if (r.made) makes++
  }
  suites.push({ name: 'weak_short', makes, n, rate: makes / n })
}

{
  let makes = 0
  const n = 10
  for (let i = 0; i < n; i++) {
    const r = await fire({ speed: 1.85, dx: 0 })
    if (r.made) makes++
  }
  suites.push({ name: 'strong_long', makes, n, rate: makes / n })
}

{
  let makes = 0
  const n = 24
  for (let i = 0; i < n; i++) {
    const speed = 0.78 + Math.random() * 0.5
    const dx = (Math.random() - 0.5) * 48
    const r = await fire({ speed, dx })
    if (r.made) makes++
  }
  suites.push({ name: 'decent_spread', makes, n, rate: makes / n })
}

console.log(JSON.stringify(suites.map(({ name, makes, n, rate }) => ({ name, makes, n, rate: +rate.toFixed(3) })), null, 2))
console.log('SUMMARY', Object.fromEntries(suites.map((s) => [s.name, +s.rate.toFixed(3)])))
console.log('DETAILS_MEDIUM', suites[0].details?.slice(0, 10))

await browser.close()
