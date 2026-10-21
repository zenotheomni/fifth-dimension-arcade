/** v24: time-to-first-audio in the lobby on a throttled 4G profile (CDP). PORT=4194 [URL=...] node scripts/glide24-ttfa.mjs */
import { chromium } from 'playwright'
const URL0 = process.env.URL || `http://127.0.0.1:${process.env.PORT || 4194}/arcade/`
const RUNS = +(process.env.RUNS || 3)
// "4G" profile: 4 Mbps down / 3 Mbps up / 150 ms RTT (Chrome DevTools-style)
const NET = { offline: false, latency: 150, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8 }
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const res = []
for (let r = 0; r < RUNS; r++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  await ctx.route('**/api/**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"games":[],"contests":[],"alerts":[],"rivals":[]}' }))
  // iOS Safari behaviour: media never preloads before a user gesture (preload is ignored → 'none')
  await ctx.addInitScript(() => {
    const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'preload')
    Object.defineProperty(HTMLMediaElement.prototype, 'preload', { get() { return d.get.call(this) }, set() { d.set.call(this, 'none') }, configurable: true })
  })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', NET)
  const audio = new Map()
  cdp.on('Network.responseReceived', (e) => { if (/\/audio\//.test(e.response.url)) audio.set(e.requestId, { url: e.response.url.replace(/^.*\/audio\//, ''), status: e.response.status, bytes: 0 }) })
  cdp.on('Network.dataReceived', (e) => { const a = audio.get(e.requestId); if (a) a.bytes += e.encodedDataLength || e.dataLength })
  await page.goto(URL0, { waitUntil: 'load', timeout: 120000 })
  await page.waitForTimeout(1500)
  const t0 = Date.now()
  await page.touchscreen.tap(195, 560)
  let ttfa = null
  for (let i = 0; i < 600; i++) {
    const m = await page.evaluate(() => globalThis.__ARCADE_MUSIC?.())
    if (m && m.playing && m.time > 0.05) { ttfa = Date.now() - t0; break }
    await page.waitForTimeout(50)
  }
  const np = await page.evaluate(() => document.querySelector('.fdnp')?.textContent || '')
  const bytesAtStart = [...audio.values()].map((a) => `${a.url}:${a.status}:${Math.round(a.bytes / 1024)}KB`)
  res.push({ ttfa, np: np.slice(0, 40), audioReqs: bytesAtStart })
  await ctx.close()
}
console.log(JSON.stringify(res, null, 1))
const ok = res.map((x) => x.ttfa).filter((x) => x != null).sort((a, b) => a - b)
console.log('TTFA median ms', ok[ok.length >> 1], 'all', ok.join(','))
await browser.close()
