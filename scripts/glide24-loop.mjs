/** v24: loop checks — seek near the end (crossfade path) and with the crossfade + native loop broken ('ended' fallback). */
import { chromium } from 'playwright'
const BASE = `http://127.0.0.1:${process.env.PORT || 4194}/arcade`
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }))
const p = await ctx.newPage()
const m = () => p.evaluate(() => globalThis.__ARCADE_MUSIC())
const test = async (label) => {
  await p.evaluate(() => globalThis.__ARCADE_MUSIC_SEEK(-3))
  const tr = []
  for (let i = 0; i < 14; i++) { const x = await m(); tr.push(`${x.track}@${x.time}${x.playing ? '' : '(paused)'}`); await p.waitForTimeout(500) }
  const end = await m()
  console.log(label, end.playing && end.time < 9 ? 'LOOPED' : 'STOPPED', tr.filter((_, i) => i % 3 === 0).join(' '))
}
await p.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await p.touchscreen.tap(195, 560)
await p.waitForTimeout(2500)
await test('lobby crossfade')
await p.evaluate(() => globalThis.__ARCADE_MUSIC_BREAK())
await test('lobby ended-fallback')
await test('lobby ended-fallback x2')
// Court Vision: ZENO 5 must loop (crossfade + broken path)
await p.goto(`${BASE}/court-vision`, { waitUntil: 'networkidle' })
await p.waitForSelector('.cv3-howto__start:not([disabled])', { timeout: 300000 })
await p.click('.cv3-howto__start')
await p.waitForTimeout(2500)
await test('court-vision crossfade')
await p.evaluate(() => globalThis.__ARCADE_MUSIC_BREAK())
await test('court-vision ended-fallback')
// Fifth Glide: lobby song on the how-to, then the 2-song rotation
await p.goto(`${BASE}/fifth-glide?q=low`, { waitUntil: 'networkidle' })
await p.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 300000 })
await p.touchscreen.tap(195, 300)
await p.waitForTimeout(1500)
console.log('fifth-glide how-to plays', (await m()).track)
await p.click('.fr-howto__start')
await p.waitForTimeout(2500)
await test('fifth-glide song1 -> next')
await test('fifth-glide song2 -> next')
await p.evaluate(() => globalThis.__ARCADE_MUSIC_BREAK())
await test('fifth-glide ended-fallback')
await b.close()
