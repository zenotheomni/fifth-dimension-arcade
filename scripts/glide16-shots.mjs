/**
 * Fifth Glide v16 screenshots + clip (390×844, deterministic manual stepping, mocked API — nothing hits prod).
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
const P = 'glide16'
const PORT = process.env.PORT || 4183
async function openGame(width = 390) {
  const c = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  await mockApi(c)
  const page = await c.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await page.goto(`http://127.0.0.1:${PORT}/arcade/fifth-glide?q=${Q}&seed=${encodeURIComponent(SEED)}`, { waitUntil: 'networkidle', timeout: 400000 })
  await page.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 400000 })
  await page.evaluate(() => { globalThis.__FR.setManual(true); globalThis.__FR.advance(900) })
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${P}-${n}.png`), timeout: 0 })
  const adv = (ms) => page.evaluate((m) => globalThis.__FR.advance(m), ms)
  await page.click('.fr-howto__start')
  await page.evaluate(() => globalThis.__FR.setAutopilot('expert'))
  return { page, shot, adv, c }
}
const aheadOf = (page, pred) => page.evaluate((src) => { const e = globalThis.__FR; const f = new Function('o', 'return ' + src); const o = e.track.obstacles.find((o) => o.s > e.run.s + 2 && f(o)); return o ? o.s - e.run.s : 999 }, pred)

// HUD layout check at 390 and 430
for (const w of [390, 430]) {
  const { page, adv, c } = await openGame(w)
  await adv(6000)
  const r = await page.evaluate(() => {
    const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom } }
    const lives = box('.fr-lives'), dist = box('.fr-cell--main .fr-cell__value'), board = box('.fr-board'), combo = box('.fr-chip--combo'), main = box('.fr-cell--main')
    const hit = (a, b) => a && b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b
    return { lives, board, combo, overlapDistance: hit(lives, dist), overlapBoard: hit(lives, board), overlapCombo: hit(lives, combo), centredOff: lives && main ? +(((lives.x + lives.r) / 2) - ((main.x + main.r) / 2)).toFixed(1) : null, gapBelowBoard: lives && board ? +(lives.y - board.b).toFixed(1) : null }
  })
  console.log('hud', w, JSON.stringify(r))
  await page.screenshot({ path: path.join(OUT, `${P}-hud-${w}.png`), clip: { x: 0, y: 0, width: w, height: 230 } })
  await c.close()
}

{
  const { page, shot, adv, c } = await openGame(390)
  await adv(7000)
  await page.evaluate(() => { globalThis.__FR.run.threat = 0 })
  await adv(1200)
  await shot('run')
  await page.evaluate(() => { const r = globalThis.__FR.run; r.slowT = 130; r.stumble = 54 })
  await adv(500)
  await shot('hit')
  await adv(2500)
  // crashed rocket ahead
  for (let i = 0; i < 400; i++) { const d = await aheadOf(page, "o.kind === 'block'"); if (d > 4.5 && d < 9) break; await adv(60) }
  await shot('rocket')
  // centre hole (missing middle lane / pothole) ahead
  await page.evaluate(() => { globalThis.__FR.run.invuln = 1e6 })
  for (let i = 0; i < 900; i++) { const d = await aheadOf(page, "o.kind === 'void' && o.lane === 1 && !globalThis.__FR.track.obstacles.some((q) => q.kind === 'void' && q.lane !== 1 && Math.abs(q.s - o.s) < 1)"); if (d > 10 && d < 24) break; await adv(200) }
  await page.evaluate(() => { globalThis.__FR.run.invuln = 0 })
  await adv(34)
  await shot('center-holes')
  await c.close()
}
{
  const { page, adv, c } = await openGame(390)
  await adv(5000)
  const vdir = fs.mkdtempSync('/tmp/g16v-')
  for (let f = 0; f < 240; f++) {
    if (f === 100) await page.evaluate(() => { const r = globalThis.__FR.run; r.slowT = 130; r.stumble = 54 })
    await adv(1000 / 30)
    await page.screenshot({ path: path.join(vdir, `f${String(f).padStart(3, '0')}.png`), timeout: 0 })
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(vdir, 'f%03d.png'), '-vf', 'scale=780:1688:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart', path.join(OUT, `${P}-run.mp4`)])
  await c.close()
}
console.log('done')
await browser.close()
