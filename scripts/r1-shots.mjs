/** r1 screenshots + make clip (deterministic manual stepping). */
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const OUT = process.env.OUT || '/workspace/arcade-shots'
const ONLY = process.argv.slice(2)
const want = (n) => ONLY.length === 0 || ONLY.includes(n)
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

async function makePage(w = 390, h = 844) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await page.goto('http://127.0.0.1:4173/arcade/court-vision?q=high', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForFunction(() => globalThis.__CV3D?.ready, null, { timeout: 60000 })
  await page.evaluate(() => {
    const s = globalThis.__CV3D
    s.setManual(true)
    s.mode = 'endless'
    s.timeLeft = 9999
    s.advance(400)
  })
  return { ctx, page }
}

const step = (page, ms) => page.evaluate((m) => globalThis.__CV3D.advance(m), ms)

async function waitIdle(page) {
  for (let i = 0; i < 400; i++) {
    const idle = await page.evaluate(() => {
      const s = globalThis.__CV3D
      return !s.shot && s.respawnT >= 1
    })
    if (idle) return
    await step(page, 50)
  }
}

/** Fire a flick and step frame-by-frame until pred(state) is true. */
async function flickUntil(page, speed, dx, pred, maxMs = 4000) {
  await waitIdle(page)
  await step(page, 200)
  await page.evaluate(({ speed, dx }) => globalThis.__CV3D.debugFlick({ speed, dx }), { speed, dx })
  return advanceUntil(page, pred, maxMs)
}

async function advanceUntil(page, pred, maxMs = 4000) {
  let t = 0
  while (t < maxMs) {
    const st = await page.evaluate(() => {
      const s = globalThis.__CV3D
      const b = s.shot?.b
      return b
        ? { t: b.t, y: b.p.y, z: b.p.z, through: b.through, scored: b.scored, board: b.boardHits, rim: b.rimHits, floor: b.floorHits }
        : null
    })
    if (st && pred(st)) return st
    await step(page, 1000 / 60)
    t += 1000 / 60
  }
  return null
}

const shots = {}
const { page } = await makePage()

if (want('idle')) {
  await page.screenshot({ path: path.join(OUT, 'r1-idle.png') })
  console.log('idle ok')
}
if (want('flight')) {
  const st = await flickUntil(page, 1.05, 0, (s) => s.t >= 0.5)
  await page.screenshot({ path: path.join(OUT, 'r1-flight.png') })
  console.log('flight', st)
}
if (want('swish')) {
  const st = await flickUntil(page, 1.05, 0, (s) => s.through && s.y < 3.0)
  await page.screenshot({ path: path.join(OUT, 'r1-swish-1.png') })
  await step(page, 260)
  await page.waitForTimeout(800) // let the CSS callout entrance settle (wall clock)
  await page.screenshot({ path: path.join(OUT, 'r1-swish-2.png') })
  console.log('swish', st, await page.evaluate(() => globalThis.__CV3D.lastShotMeta))
}
if (want('bank')) {
  const st = await flickUntil(page, 1.33, 0, (s) => s.board > 0)
  await step(page, 50)
  await page.screenshot({ path: path.join(OUT, 'r1-bank.png') })
  await advanceUntil(page, (s) => s.scored || s.floor > 0)
  console.log('bank', st, await page.evaluate(() => globalThis.__CV3D.lastShotMeta))
}
if (want('rim')) {
  const st = await flickUntil(page, 0.94, -22, (s) => s.rim > 0)
  await step(page, 70)
  await page.screenshot({ path: path.join(OUT, 'r1-rim.png') })
  await advanceUntil(page, (s) => s.scored || s.floor > 0)
  console.log('rim', st, await page.evaluate(() => globalThis.__CV3D.lastShotMeta))
}
if (want('video')) {
  const dir = path.join(OUT, 'r1-make-frames')
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  await waitIdle(page)
  await step(page, 300)
  let f = 0
  const snap = async () => page.screenshot({ path: path.join(dir, `f${String(f++).padStart(3, '0')}.png`) })
  for (let i = 0; i < 8; i++) {
    await snap()
    await step(page, 1000 / 30)
  }
  await page.evaluate(() => globalThis.__CV3D.debugFlick({ speed: 1.05, dx: 0 }))
  for (let i = 0; i < 78; i++) {
    await snap()
    await step(page, 1000 / 30)
  }
  console.log('video frames', f)
}
if (want('r2')) {
  const ready = () => page.evaluate(() => globalThis.__CV3D.lastReady)
  // make: fresh ball ready while net still swinging
  await waitIdle(page)
  await step(page, 200)
  await page.evaluate(() => globalThis.__CV3D.debugFlick({ speed: 1.05, dx: 0 }))
  await advanceUntil(page, () => false, 0)
  for (let i = 0; i < 300; i++) {
    const r = await ready()
    if (r && r.cause === 'make' && r.poppedAfterMs != null) break
    await step(page, 1000 / 60)
  }
  await step(page, 40)
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(OUT, 'r2-respawn-make.png') })
  console.log('make ready', await ready(), await page.evaluate(() => ({ canShoot: globalThis.__CV3D.canShoot(), ghost: !!globalThis.__CV3D.ghost })))
  // miss: front rim clank
  await waitIdle(page)
  await step(page, 200)
  await page.evaluate(() => globalThis.__CV3D.debugFlick({ speed: 1.05, dx: 70 }))
  for (let i = 0; i < 300; i++) {
    const r = await ready()
    if (r && r.cause === 'miss' && r.poppedAfterMs != null) break
    await step(page, 1000 / 60)
  }
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(OUT, 'r2-respawn-miss.png') })
  console.log('miss ready', await ready(), await page.evaluate(() => globalThis.__CV3D.lastShotMeta))
  // flick the new ball mid-fade: allowed
  await page.evaluate(() => globalThis.__CV3D.debugFlick({ speed: 0.6, dx: 0 }))
  for (let i = 0; i < 300; i++) {
    const r = await ready()
    if (r && r.cause === 'miss' && r.poppedAfterMs == null) break
    await step(page, 1000 / 60)
  }
  const flickedDuringFade = await page.evaluate(() => {
    const s = globalThis.__CV3D
    s.advance(60)
    return { ghost: !!s.ghost, shotFired: s.debugFlick({ speed: 1.05, dx: 0 }) }
  })
  console.log('flick during fade', flickedDuringFade)
}
if (want('tall')) {
  const { page: p2 } = await makePage(430, 932)
  await p2.screenshot({ path: path.join(OUT, 'r1-idle-tall.png') })
  console.log('tall ok')
}
await browser.close()
