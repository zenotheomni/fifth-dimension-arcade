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

await page.goto(`${BASE}/fifth-glide?q=high`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 400000 })
await page.click('.fr-howto__start')
await wait(1500)
console.log('start', JSON.stringify(await music()))
for (const round of [1, 2]) {
  await page.waitForFunction(() => globalThis.__ARCADE_MUSIC?.().duration > 0, null, { timeout: 60000 })
  await page.evaluate(() => globalThis.__ARCADE_MUSIC_SEEK(-6))
  let got = null
  for (let i = 0; i < 40; i++) {
    await wait(400)
    const m = await music()
    const cls = await page.evaluate(() => (document.querySelector('.fdnp')?.className || '') + ' | ' + (document.querySelector('.fdnp__label')?.textContent || '') + ' | ' + (document.querySelector('.fdnp__title b')?.textContent || ''))
    if (round === 1 && cls.includes('is-unlocked') && cls.includes('is-open')) { got = cls; await page.evaluate(() => globalThis.__FR.setManual(true)); await shot('glide17-unlock-toast.png'); await page.evaluate(() => globalThis.__FR.setManual(false)); break }
    if (round === 2 && m.track === 'fifth-glide-theme') { got = cls + ' track=' + m.track; break }
  }
  console.log('round', round, got, JSON.stringify(await music()))
}
console.log('done')
await browser.close()
