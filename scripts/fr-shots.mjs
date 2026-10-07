/**
 * Fifth Glide screenshots + clip (390×844, deterministic manual stepping, mocked API — nothing hits prod).
 *   npx vite preview --port 4173 &   node scripts/fr-shots.mjs [idle run jump powerup crash end video]
 */
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

const OUT = process.env.OUT || '/workspace/arcade-shots'
const SEED = process.env.SEED || 'run:5d1959ca'
const Q = process.env.Q || 'high'
const ONLY = process.argv.slice(2)
const want = (n) => ONLY.length === 0 || ONLY.includes(n)
fs.mkdirSync(OUT, { recursive: true })

const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
let lastScore = 0
async function mockApi(ctx) {
  await ctx.route('**/api/**', async (route) => {
    const u = new URL(route.request().url())
    const action = u.pathname.replace(/^.*\/api\//, '')
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ...o }) })
    if (action.startsWith('og')) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG1 })
    if (action === 'arcade/session') return json({ player: { player_id: 'p-jenks', handle: 'jenks', is_guest: false, token: 'tok' } })
    if (action === 'arcade/run') {
      const body = JSON.parse(route.request().postData() || '{}')
      lastScore = body.score
      return json({
        run: {
          id: 'score-demo',
          mode: body.mode,
          score: body.score,
          player_id: 'p-jenks',
          handle: 'jenks',
          is_guest: false,
          personal_best: body.score,
          duplicate: false,
          board: { alltime: { rank: 2, score: body.score }, weekly: { rank: 1, score: body.score } },
        },
      })
    }
    if (action.startsWith('arcade/inbox')) return json({ alerts: [], unread: 0, latest_id: null })
    if (action.startsWith('arcade/rivals')) return json({ rivals: [], unread: 0 })
    if (action === 'arcade/board') return json({ board: { entries: [], me: null, modes: ['endless'] } })
    return json({})
  })
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
await mockApi(ctx)
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('console.' + m.type(), m.text().slice(0, 300)))
await page.goto(`http://127.0.0.1:4173/arcade/fifth-run?q=${Q}&seed=${encodeURIComponent(SEED)}`, { waitUntil: 'networkidle', timeout: 90000 })
await page.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 90000 })
await page.evaluate(() => {
  const s = globalThis.__FR
  s.setManual(true)
  s.advance(700)
})

const step = (ms) => page.evaluate((m) => globalThis.__FR.advance(m), ms)
const state = () =>
  page.evaluate(() => {
    const e = globalThis.__FR
    const r = e.run
    const near = e.track.obstacles.some((o) => !o.smashed && o.s + o.len > r.s - 3.5 && o.s < r.s + 7)
    const hurdle = e.track.obstacles.some((o) => o.lane === r.lane && (o.kind === 'barrier' || o.kind === 'gap') && o.s - r.s > 0.6 && o.s - r.s < 3.2)
    return { phase: e.phase, s: r.s, y: r.y, vy: r.vy, air: r.air, slide: r.slide, hand: r.hand, lives: r.lives, dead: r.dead, keys: r.keys, t: r.tick / 120, near, hurdle }
  })
async function until(pred, maxMs = 20000, stepMs = 1000 / 60) {
  for (let t = 0; t < maxMs; t += stepMs) {
    const st = await state()
    if (pred(st)) return st
    await step(stepMs)
  }
  return null
}
const settle = () => page.waitForTimeout(650) // CSS entrance animations run on wall clock
const shot = async (name) => {
  await page.screenshot({ path: path.join(OUT, name) })
  console.log('wrote', name)
}

if (want('idle')) {
  await settle()
  await shot('fr-idle.png')
}

// start the run with the autopilot driving
await page.evaluate(() => {
  globalThis.__FR.start(null)
  globalThis.__FR.setAutopilot('perfect')
})

if (want('video')) {
  const dir = path.join(OUT, 'glide-run-frames')
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  await step(7000) // get up to speed
  let f = 0
  for (let i = 0; i < 180; i++) {
    await page.screenshot({ path: path.join(dir, `f${String(f++).padStart(3, '0')}.png`) })
    await step(1000 / 30)
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, 'f%03d.png'), '-vf', 'scale=780:1688:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart', path.join(OUT, 'glide-run.mp4')])
  console.log('wrote glide-run.mp4 frames', f)
}

if (want('run')) {
  await until((s) => s.t > 22, 40000, 100)
  await until((s) => !s.air && s.slide === 0 && !s.near, 6000)
  await settle()
  await shot('glide-run.png')
}

if (want('jump')) {
  const st = await until((s) => s.air && s.y > 0.95 && s.hurdle, 40000)
  console.log('jump', st)
  await shot('fr-jump.png')
}

if (want('powerup')) {
  const st = await until((s) => s.hand > 0, 90000, 50)
  await step(400)
  await until((s) => !s.air && s.slide === 0 && !s.near, 3000)
  console.log('powerup', st)
  await settle()
  await shot('fr-powerup.png')
}

if (want('crash') || want('end')) {
  await page.evaluate(() => {
    globalThis.__FR.setAutopilot(false)
    // burn down to last life so one hit ends the run for the capture
    globalThis.__FR.run.lives = 1
  })
  const st = await until((s) => s.dead, 45000)
  await step(380)
  console.log('crash', st)
  await settle()
  if (want('crash')) await shot('fr-crash.png')
  await until((s) => s.phase === 'ended', 4000)
  await page.waitForSelector('.fr-end', { timeout: 10000 })
  await page.waitForTimeout(1200)
  if (want('end')) await shot('glide-end.png')
}

console.log('final', await state(), 'lastScore', lastScore)
await browser.close()
