/**
 * v23 lobby: Now Playing + selection follows swipe. PORT=4193 node scripts/glide23-lobby.mjs
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
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const BASE = `http://127.0.0.1:${process.env.PORT || 4193}/arcade`
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
await mockApi(ctx)
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
const shot = async (n) => { await page.screenshot({ path: path.join(OUT, n) }); console.log('shot', n) }
const music = () => page.evaluate(() => { const m = globalThis.__ARCADE_MUSIC?.(); return m && `${m.track} playing=${m.playing} gain=${m.gain} t=${m.time}` })
const active = () => page.evaluate(() => [...document.querySelectorAll('.ffa-card')].map((c) => (c.classList.contains('is-active') ? '[' : '') + c.querySelector('.ffa-card__title')?.textContent + (c.classList.contains('is-active') ? ']' : '')).join(' | '))
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
console.log('before tap', await music())
await page.touchscreen.tap(195, 560)
await page.waitForTimeout(1600)
console.log('after tap', await music(), 'np:', await page.evaluate(() => document.querySelector('.fdnp')?.textContent))
await shot('glide23-lobby-nowplaying.png')
console.log('cards', await active())
await page.waitForTimeout(5000)
// swipe the cabinet rail to Fifth Glide
const rail = await page.$('.ffa-cards')
const b = await rail.boundingBox()
await page.evaluate(() => { const r = document.querySelector('.ffa-cards'); const c = [...r.querySelectorAll('.ffa-card')].find((x) => /Fifth Glide/i.test(x.textContent)); r.scrollTo({ left: c.offsetLeft - (r.clientWidth - c.offsetWidth) / 2, behavior: 'smooth' }) })
await page.waitForTimeout(1200)
console.log('after swipe', await active(), void b)
await shot('glide23-lobby-fifth-glide.png')
console.log('music', await music())
await browser.close()
