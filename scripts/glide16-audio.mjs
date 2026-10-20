/**
 * Fifth Glide v14 screenshots + clip (390×844, deterministic manual stepping, mocked API — nothing hits prod).
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
    // lobby data: read-only GETs go to production; every write stays mocked
    if (route.request().method() === 'GET' && /^arcade\/(contests|ticker|boards?|lobby|games|inbox|rivals)/.test(action)) {
      try {
        const r = await route.fetch({ url: 'https://fifth-dimension-arcade.vercel.app' + u.pathname + u.search })
        return route.fulfill({ response: r })
      } catch { /* fall through to mocks */ }
    }
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
    if (action.startsWith('arcade/contests')) return json({ contests: [], server_now: new Date().toISOString() })
    if (action === 'arcade/board') return json({ board: { entries: [], me: null, modes: ['endless'] } })
    return json({})
  })
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
})
const BASE = `http://127.0.0.1:${process.env.PORT || 4183}/arcade`
const W = Number(process.env.W || 390)
const ctx = await browser.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
await mockApi(ctx)
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
const shot = async (n) => { await page.screenshot({ path: path.join(OUT, n) }); console.log('shot', n) }
const music = () => page.evaluate(() => globalThis.__ARCADE_MUSIC?.())
const wait = (ms) => page.waitForTimeout(ms)
const sfx = process.env.SFX || ''

if (!process.env.GLIDE_ONLY) {
// ── lobby ──
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await wait(1500)
await page.touchscreen.tap(W / 2, 560)
await wait(1700)
console.log('lobby', JSON.stringify(await music()))
await shot(`glide16-np-lobby${sfx}.png`)
await wait(5200)
await shot(`glide16-np-lobby-collapsed${sfx}.png`)
// loop seam: jump to 2 s before the end, check it wraps onto the twin and keeps playing
await page.evaluate(() => globalThis.__ARCADE_MUSIC_SEEK(-6))
const seam = []
for (let i = 0; i < 22; i++) { const m = await music(); seam.push([m.time, m.loopEl, m.playing, m.decksPlaying.length]); await wait(400) }
console.log('lobby-seam', JSON.stringify(seam))
// tap the collapsed icon to re-open
await page.click('.fdnp__btn')
await wait(700)
await shot(`glide16-np-lobby-reopen${sfx}.png`)

// ── Court Vision ──
await page.goto(`${BASE}/court-vision`, { waitUntil: 'networkidle' })
await page.waitForSelector('.cv3-howto__start:not([disabled])', { timeout: 300000 })
await wait(500)
await page.click('.cv3-howto__start')
await wait(1800)
console.log('cv', JSON.stringify(await music()))
await shot(`glide16-np-court${sfx}.png`)
await page.evaluate(() => globalThis.__ARCADE_MUSIC_SEEK(-6))
const seam2 = []
for (let i = 0; i < 20; i++) { const m = await music(); seam2.push([m.time, m.loopEl, m.playing]); await wait(400) }
console.log('cv-seam', JSON.stringify(seam2))

}
// ── Fifth Glide ──
await page.goto(`${BASE}/fifth-glide?q=high`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 400000 })
await wait(400)
console.log('glide-howto', JSON.stringify(await music()))
await page.click('.fr-howto__start')
await wait(1400)
// freeze the (software-rendered) game so the screenshot lands while the tab is still open
await page.evaluate(() => { globalThis.__FR.setManual(true); globalThis.__FR.advance(16) })
await page.evaluate(() => { if (!document.querySelector('.fdnp.is-open')) document.querySelector('.fdnp__btn').click() })
await wait(700)
console.log('glide', JSON.stringify(await music()))
await shot(`glide16-np-glide${sfx}.png`)
await page.evaluate(() => globalThis.__FR.setManual(false))
await wait(5000)
await shot(`glide16-np-glide-collapsed${sfx}.png`)
await page.evaluate(() => globalThis.__ARCADE_MUSIC_SEEK(-6))
const seam3 = []
for (let i = 0; i < 20; i++) { const m = await music(); seam3.push([m.time, m.loopEl, m.playing]); await wait(400) }
console.log('glide-seam', JSON.stringify(seam3))

// ── muted ──
await page.evaluate(() => localStorage.setItem('fd_arcade_sound_muted_v2', '1'))
await page.goto(`${BASE}/fifth-glide?q=high`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 400000 })
await page.click('.fr-howto__start')
await wait(2600)
console.log('muted', JSON.stringify(await music()))
await shot(`glide16-np-muted${sfx}.png`)
await page.evaluate(() => localStorage.removeItem('fd_arcade_sound_muted_v2'))
console.log('done')
await browser.close()
