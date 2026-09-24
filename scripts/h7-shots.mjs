import { chromium, devices } from 'playwright'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'

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
  try { localStorage.setItem('fd_cv_flick_tutorial_done', '1') } catch {}
  s.dismissTutorial?.()
})
await page.waitForTimeout(500)

async function ready() {
  await page.waitForFunction(
    () => {
      const s = globalThis.__CV_SCENE
      return s && !s.flight && !s.respawning && s.phase === 'playing'
    },
    null,
    { timeout: 15000 },
  )
  await page.waitForTimeout(250)
}

// Idle
await ready()
await page.screenshot({ path: path.join(out, 'h7-idle.png') })
console.log('idle')

// Ball zoom — crop from idle
{
  const { execFileSync } = await import('child_process')
  // Use python for crop+scale
}

await page.evaluate(() => {
  // ensure tutorial gone for clean shots
  const s = globalThis.__CV_SCENE
  s.showTutorial = false
  s.tutorial?.setVisible(false)
})

async function captureSequence(name, speed, dx, count, delayMs) {
  await ready()
  await page.evaluate(({ speed, dx }) => globalThis.__CV_SCENE.debugFlick({ speed, dx }), {
    speed,
    dx,
  })
  const frames = []
  for (let i = 0; i < count; i++) {
    await page.waitForTimeout(delayMs)
    const pth = path.join(out, `${name}-f${String(i).padStart(2, '0')}.png`)
    await page.screenshot({ path: pth })
    frames.push(pth)
    const done = await page.evaluate(() => !globalThis.__CV_SCENE.flight)
    if (done && i > 6) break
  }
  return frames
}

// Swish sequence — pick keyframes for 1/2/3
const swishFrames = await captureSequence('h7-swish', 1.05, 0, 28, 45)
console.log('swish frames', swishFrames.length)

// Copy key frames: entering rim (~ mid arc end), mid-net stretch, whip back
function pick(frames, idxs, destNames) {
  for (let i = 0; i < destNames.length; i++) {
    const src = frames[Math.min(idxs[i], frames.length - 1)]
    fs.copyFileSync(src, path.join(out, destNames[i]))
  }
}
pick(
  swishFrames,
  [
    Math.floor(swishFrames.length * 0.42),
    Math.floor(swishFrames.length * 0.58),
    Math.floor(swishFrames.length * 0.72),
  ],
  ['h7-swish-1.png', 'h7-swish-2.png', 'h7-swish-3.png'],
)

// Rim-in
const rimFrames = await captureSequence('h7-rimin', 1.12, 18, 28, 45)
fs.copyFileSync(
  rimFrames[Math.min(Math.floor(rimFrames.length * 0.55), rimFrames.length - 1)],
  path.join(out, 'h7-rimin.png'),
)
console.log('rimin', rimFrames.length)

// Bank
const bankFrames = await captureSequence('h7-bank', 1.35, 0, 28, 45)
fs.copyFileSync(
  bankFrames[Math.min(Math.floor(bankFrames.length * 0.4), bankFrames.length - 1)],
  path.join(out, 'h7-bank.png'),
)
console.log('bank', bankFrames.length)

// GIFs
try {
  execSync(
    `convert -delay 7 -loop 0 ${swishFrames.join(' ')} ${path.join(out, 'h7-swish.gif')}`,
    { stdio: 'inherit' },
  )
  execSync(
    `convert -delay 7 -loop 0 ${rimFrames.join(' ')} ${path.join(out, 'h7-rimin.gif')}`,
    { stdio: 'inherit' },
  )
  console.log('gifs ok')
} catch (e) {
  console.log('gif err', e.message?.slice(0, 100))
}

await browser.close()
console.log('DONE shots')
