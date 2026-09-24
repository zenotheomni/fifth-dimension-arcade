import { chromium, devices } from 'playwright'
import path from 'path'
import fs from 'fs'

const out = '/workspace/arcade-shots'
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

async function makePage(w=390, h=844) {
  const context = await browser.newContext({
    viewport: { width: w, height: h },
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
  await page.evaluate(() => {
    const s = globalThis.__CV_SCENE
    s.mode = 'endless'
    s.timeLeft = 9999
    s.ended = false
    s.phase = 'playing'
    s.dismissTutorial?.()
    s.showTutorial = false
    s.tutorial?.setVisible(false)
  })
  await page.waitForTimeout(400)
  return { context, page }
}

async function ready(page) {
  await page.waitForFunction(
    () => {
      const s = globalThis.__CV_SCENE
      return s && !s.flight && !s.respawning && s.phase === 'playing'
    },
    null,
    { timeout: 15000 },
  )
  await page.waitForTimeout(200)
}

const { context, page } = await makePage()
await ready(page)
await page.screenshot({ path: path.join(out, 'i8-idle.png') })
console.log('idle', await page.evaluate(() => ({
  ballY: globalThis.__CV_SCENE.ball.y,
  ballW: globalThis.__CV_SCENE.ball.displayWidth,
  hoopY: globalThis.__CV_SCENE.hoopY,
})))

async function seq(label, speed, dx) {
  await ready(page)
  await page.evaluate(({ speed, dx }) => globalThis.__CV_SCENE.debugFlick({ speed, dx }), { speed, dx })
  const frames = []
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(35)
    const pth = path.join(out, `${label}-f${String(i).padStart(2, '0')}.png`)
    await page.screenshot({ path: pth })
    frames.push(pth)
    const done = await page.evaluate(() => !globalThis.__CV_SCENE.flight)
    if (done && i > 8) break
  }
  return frames
}

const swish = await seq('i8-swish', 1.05, 0)
const pick = (frames, frac, dest) => {
  const i = Math.min(frames.length - 1, Math.max(0, Math.floor(frames.length * frac)))
  fs.copyFileSync(frames[i], path.join(out, dest))
  console.log(dest, i, '/', frames.length)
}
pick(swish, 0.38, 'i8-swish-1.png')
pick(swish, 0.55, 'i8-swish-2.png')
pick(swish, 0.72, 'i8-swish-3.png')

const rim = await seq('i8-rimin', 1.12, 16)
fs.copyFileSync(rim[Math.min(rim.length - 1, Math.floor(rim.length * 0.5))], path.join(out, 'i8-rimin.png'))

const bank = await seq('i8-bank', 1.35, 0)
fs.copyFileSync(bank[Math.min(bank.length - 1, Math.floor(bank.length * 0.35))], path.join(out, 'i8-bank.png'))

await context.close()

// Tall idle
const tall = await makePage(430, 932)
await ready(tall.page)
await tall.page.screenshot({ path: path.join(out, 'i8-idle-tall.png') })
await tall.context.close()

await browser.close()
console.log('shots done', swish.length)
