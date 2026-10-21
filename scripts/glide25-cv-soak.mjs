/** v25: long Court Vision session — many shots, end screens, restarts, simulated iOS interruptions —
 *  checking ZENO 5 never stops. CVB=chromium|webkit MIN=5.5 PORT=4195 node scripts/glide25-cv-soak.mjs */
import { chromium, webkit } from 'playwright'
const BT = process.env.CVB === 'webkit' ? webkit : chromium
const MIN = +(process.env.MIN || 5.5)
const BASE = `http://127.0.0.1:${process.env.PORT || 4195}/arcade`
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

const b = await BT.launch(BT === chromium ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=document-user-activation-required'] } : {})
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: BT === chromium })
await mockApi(ctx)
const p = await ctx.newPage()
p.on('pageerror', (e) => console.log('PAGEERROR', e.message))
const m = () => p.evaluate(() => globalThis.__ARCADE_MUSIC?.())
await p.goto(`${BASE}/`, { waitUntil: 'load' })
await p.waitForTimeout(1500)
const first = await m()
await p.touchscreen.tap(195, 560)
await p.waitForTimeout(1500)
const lobby = await m()
console.log('lobby before tap', first?.track, first?.playing, '| after tap', lobby.track, lobby.playing, lobby.src?.split('/').pop())
// into Court Vision through the app (client-side nav keeps the audio state)
await p.evaluate(() => { history.pushState({}, '', '/arcade/court-vision'); dispatchEvent(new PopStateEvent('popstate')) })
await p.waitForSelector('.cv3-howto__start:not([disabled])', { timeout: 300000 })
const howto = await m()
console.log('how-to plays', howto.track)
await p.click('.cv3-howto__start')
const t0 = Date.now()
let roundAt = Date.now()
let lastAt = Date.now()
let shots = 0, rounds = 1, stalls = 0, maxGap = 0, last = null, lastMoveAt = Date.now(), interrupts = 0, notCv = 0
const log = []
while (Date.now() - t0 < MIN * 60000) {
  // shoot when possible
  const shot = await p.evaluate(() => globalThis.__CV3D?.debugFlick({ speed: 1.6 + Math.random() * 0.8, dx: (Math.random() - 0.5) * 30 }) ?? false).catch(() => false)
  if (shot) shots++
  // a tap like a real flick (gesture) now and then
  if (shots % 5 === 0) await p.touchscreen.tap(195, 700).catch(() => {})
  // end screen → run it back → tap to play
  // the 60 s round runs slower than real time on a software GPU: end each round after ~45 s
  if (Date.now() - roundAt > 45000) { roundAt = Date.now(); await p.evaluate(() => globalThis.__CV3D?.requestEnd?.()).catch(() => {}) }
  const btns = await p.$$('.cvp-end button')
  for (const bt of btns) {
    const tx = (await bt.textContent()) || ''
    if (/run it back|again/i.test(tx)) { await p.waitForTimeout(1500); await bt.click().catch(() => {}); rounds++; roundAt = Date.now(); await p.waitForTimeout(800); break }
  }
  const start = await p.$('.cv3-howto__start:not([disabled])')
  if (start) await start.click().catch(() => {})
  // every ~70 s: simulate an iOS interruption (system pauses the element + suspends the context)
  if ((Date.now() - t0) / 70000 > interrupts + 1) { interrupts++; await p.evaluate(() => globalThis.__ARCADE_MUSIC_INTERRUPT?.()) }
  const s = await m()
  if (s.track !== 'court-vision-theme') notCv++
  // stall = wall-clock time the song did NOT advance (a busy page just delays the sample, the song keeps
  // moving, so compare the song's own progress with the wall clock; loop wraps count as progress)
  const now = Date.now()
  if (last) {
    const wall = (now - lastAt) / 1000
    let adv = s.time - last.time
    if (adv < -1 && s.duration) adv += s.duration
    if (!s.playing) adv = 0
    const lost = wall - adv
    maxGap = Math.max(maxGap, lost * 1000)
    if (lost > 1.5) { stalls++; log.push(`silent ${lost.toFixed(1)}s at ${((now - t0) / 1000).toFixed(0)}s (wall ${wall.toFixed(1)}s, song +${adv.toFixed(1)}s)`) }
  }
  lastAt = now
  last = s
  await p.waitForTimeout(700)
}
const end = await m()
const stuckNow = 0
console.log(JSON.stringify({ browser: process.env.CVB || 'chromium', minutes: MIN, shots, rounds, interrupts, stalls, maxSilentMs: Math.max(maxGap, stuckNow), notCvSamples: notCv, end: { track: end.track, playing: end.playing, time: end.time, ctx: end.ctxState, watchdog: end.watchdog, src: end.src?.split('/').pop() }, log }))
await b.close()
