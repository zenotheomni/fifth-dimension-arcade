/** v25: lobby song from first load — autoplay where allowed, else the first touch anywhere. PORT=4195 node scripts/glide25-autoplay.mjs */
import { chromium } from 'playwright'
let lastScore = 0
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
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

for (const policy of ['no-user-gesture-required', 'document-user-activation-required']) {
  const b = await chromium.launch({ args: [`--autoplay-policy=${policy}`] })
  const bc = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
  await mockApi(bc)
  const p = await bc.newPage()
  const t0 = Date.now()
  await p.goto(`http://127.0.0.1:${process.env.PORT || 4195}/arcade/`, { waitUntil: 'commit' })
  const wait = async () => { for (let i = 0; i < 60; i++) { const m = await p.evaluate(() => globalThis.__ARCADE_MUSIC?.()).catch(() => null); if (m?.playing && m.time > 0) return true; await p.waitForTimeout(50) } return false }
  let ok = await wait(), how = 'autoplay'
  if (!ok) { await p.waitForTimeout(500); const t1 = Date.now(); await p.touchscreen.tap(40, 300); ok = await wait(); how = `first touch (top-left, not the Enter button) → ${Date.now() - t1} ms` }
  await p.waitForTimeout(900)
  const np = await p.evaluate(() => document.querySelector('.fdnp')?.textContent || '(none)')
  console.log(policy, '|', ok ? 'PLAYING' : 'SILENT', 'via', how, '| first audio at', Date.now() - t0 - 900, 'ms | Now Playing:', np)
  // then the first tap routes the (already playing) element into WebAudio: it must keep playing
  await p.touchscreen.tap(200, 500)
  await p.waitForTimeout(1200)
  const m = await p.evaluate(() => globalThis.__ARCADE_MUSIC())
  console.log('  after first tap:', m.playing ? 'playing' : 'STOPPED', 'routed', m.routed, 'gain', m.gain, 't', m.time)
  await b.close()
}
