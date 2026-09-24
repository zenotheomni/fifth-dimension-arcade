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
await page.waitForTimeout(500)

const endless = page.getByRole('button', { name: /^Endless$/i })
if (await endless.count()) {
  await endless.click().catch(() => {})
  await page.waitForTimeout(900)
  await page.waitForFunction(() => globalThis.__CV_SCENE, null, { timeout: 15000 })
}
await page.evaluate(() => {
  const s = globalThis.__CV_SCENE
  s.mode = 'endless'
  s.timeLeft = 9999
  s.ended = false
  s.phase = 'playing'
})

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
      return !s.respawning && !s.flight && s.phase === 'playing'
    },
    null,
    { timeout: 15000 },
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
    // Sample penetration during flight
    s.__penSamples = []
    const r = s.debugFlick(o)
    return r
      ? {
          power: +r.power.toFixed(3),
          outcome: r.outcome,
          allowOver: r.allowOver,
          speed: +r.speed.toFixed(3),
        }
      : null
  }, opts)
  if (!shot) return { shot: null, made: false, meta: null }

  await page.waitForFunction(
    () => !globalThis.__CV_SCENE?.flight,
    null,
    { timeout: 6000 },
  ).catch(() => {})
  await page.waitForTimeout(700)
  const after = await page.evaluate(() => ({
    score: globalThis.__CV_SCENE.score,
    meta: globalThis.__CV_SCENE.lastShotMeta,
  }))
  return {
    shot,
    made: after.score > before,
    meta: after.meta,
  }
}

function summarize(name, results) {
  const n = results.length
  const makes = results.filter((r) => r.made).length
  const pen = results.filter((r) => r.meta?.penetratedBoard).length
  const over = results.filter((r) => r.meta?.overBoard).length
  const near = results.filter(
    (r) =>
      r.meta?.finishNearRim ||
      r.meta?.contactedBoard ||
      r.meta?.contactedRim,
  ).length
  const boardHit = results.filter((r) => r.meta?.contactedBoard).length
  return {
    name,
    n,
    makes,
    makeRate: +(makes / n).toFixed(3),
    penetrateRate: +(pen / n).toFixed(3),
    overRate: +(over / n).toFixed(3),
    nearRimRate: +(near / n).toFixed(3),
    boardContactRate: +(boardHit / n).toFixed(3),
  }
}

const suites = []

// straight medium
{
  const results = []
  for (let i = 0; i < 16; i++) {
    const speed = 0.95 + (i % 5) * 0.05
    results.push(await fire({ speed, dx: 0 }))
  }
  suites.push(summarize('straight_medium', results))
}

// angled wide
{
  const results = []
  for (let i = 0; i < 10; i++) {
    results.push(await fire({ speed: 1.05, dx: i % 2 === 0 ? 70 : -70 }))
  }
  suites.push(summarize('angled_wide', results))
}

// weak / front rim
{
  const results = []
  for (let i = 0; i < 10; i++) {
    results.push(await fire({ speed: 0.55, dx: 0 }))
  }
  suites.push(summarize('weak_front', results))
}

// strong / bank
{
  const results = []
  for (let i = 0; i < 12; i++) {
    results.push(await fire({ speed: 1.35 + (i % 3) * 0.05, dx: (i % 2) * 8 - 4 }))
  }
  suites.push(summarize('strong_bank', results))
}

// extreme over
{
  const results = []
  for (let i = 0; i < 10; i++) {
    results.push(await fire({ speed: 2.2, dx: 0 }))
  }
  suites.push(summarize('extreme_over', results))
}

// decent spread
{
  const results = []
  for (let i = 0; i < 24; i++) {
    const speed = 0.78 + Math.random() * 0.5
    const dx = (Math.random() - 0.5) * 48
    results.push(await fire({ speed, dx }))
  }
  suites.push(summarize('decent_spread', results))
}

console.log(JSON.stringify(suites, null, 2))
const assert = (cond, msg) => {
  if (!cond) console.error('ASSERT FAIL:', msg)
  else console.log('ASSERT OK:', msg)
}
for (const s of suites) {
  assert(s.penetrateRate === 0, `${s.name} penetrate=0 (got ${s.penetrateRate})`)
}
assert(suites.find((s) => s.name === 'strong_bank').overRate === 0, 'strong over=0')
assert(suites.find((s) => s.name === 'extreme_over').overRate > 0.5, 'extreme mostly over')
assert(suites.find((s) => s.name === 'straight_medium').makeRate >= 0.85, 'straight makes')
const decent = suites.find((s) => s.name === 'decent_spread')
assert(decent.makeRate >= 0.55 && decent.makeRate <= 0.9, `decent make ${decent.makeRate}`)
const nearAll =
  suites
    .filter((s) => s.name !== 'extreme_over')
    .reduce((a, s) => a + s.nearRimRate * s.n, 0) /
  suites.filter((s) => s.name !== 'extreme_over').reduce((a, s) => a + s.n, 0)
assert(nearAll >= 0.9, `near-rim ~95% (got ${nearAll.toFixed(3)})`)

await browser.close()
