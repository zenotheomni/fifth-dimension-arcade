/**
 * Fifth Glide v11 screenshots + clip (390×844, deterministic manual stepping, mocked API — nothing hits prod).
 *   npm run build && npx vite preview --port 4183 &   PORT=4183 VIDEO=0 node scripts/glide5-shots.mjs
 *   Writes ${PREFIX:-glide5}-{howto,run,stars,logo,invincible,end}.png (+ -run.mp4 unless VIDEO=0) to $OUT.
 */
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

const OUT = process.env.OUT || '/workspace/arcade-shots'
const SEED = process.env.SEED || 'run:5d1959ca'
const Q = process.env.Q || 'high'
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
await page.goto(`http://127.0.0.1:${process.env.PORT || 4183}/arcade/fifth-glide?q=${Q}&seed=${encodeURIComponent(SEED)}`, { waitUntil: 'networkidle', timeout: 400000 })
await page.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 400000 })
await page.evaluate(() => { globalThis.__FR.setManual(true); globalThis.__FR.advance(900) })


const P = 'glide12'
const shot = (n) => page.screenshot({ path: path.join(OUT, `${P}-${n}.png`), timeout: 0 })
const adv = (ms) => page.evaluate((m) => globalThis.__FR.advance(m), ms)
await page.click('.fr-howto__start')
await page.evaluate(() => globalThis.__FR.setAutopilot('expert'))
await adv(6000)
await page.evaluate(() => { globalThis.__FR.run.threat = 0 })
await adv(2500)
await shot('run')
await shot('palms')
// turn approach readability
for (let i = 0; i < 200; i++) { const d = await page.evaluate(() => { const e = globalThis.__FR; const c = e.track.corners.find((c) => c.s > e.run.cDone); return c ? c.s - e.run.s : 999 }); if (d < 30 && d > 0) break; await adv(250) }
await shot('turn-approach')
await adv(1500)
// chaser up close after a hit
await page.evaluate(() => { const r = globalThis.__FR.run; r.threat = 0.75; r.slowT = 120; r.stumble = 54 })
await adv(500)
await shot('chaser-close')
await adv(5000)
// background UFO: put a flyer mid-sky for comparison
await page.evaluate(() => { const c = globalThis.__FR.view.cosmos; const u = c.saucers[0]; u.wait = 0; u.a.set(-25, 9, -40); u.b.set(25, 11, -45); u.t = u.dur * 0.45; u.g.visible = true })
await adv(34)
await shot('bg-ufo')
const vdir = fs.mkdtempSync('/tmp/g12v-')
for (let f = 0; f < 150; f++) {
  if (f === 70) await page.evaluate(() => { const r = globalThis.__FR.run; r.threat = 0.75 })
  await adv(1000 / 30)
  await page.screenshot({ path: path.join(vdir, `f${String(f).padStart(3, '0')}.png`), timeout: 0 })
}
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(vdir, 'f%03d.png'), '-vf', 'scale=780:1688:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart', path.join(OUT, `${P}-run.mp4`)])
await page.evaluate(() => { globalThis.__FR.run.invuln = 1e6 })
for (let i = 0; i < 60 && (await page.evaluate(() => globalThis.__FR.run.s)) < 1500; i++) await adv(1000)
await page.evaluate(() => { globalThis.__FR.run.invuln = 0 }); await adv(34)
await shot('space-run')
console.log('done')
await browser.close()
