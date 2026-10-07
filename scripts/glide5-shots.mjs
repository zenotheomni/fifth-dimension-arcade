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
const P = process.env.PREFIX || 'glide2'
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
await page.goto(`http://127.0.0.1:${process.env.PORT || 4183}/arcade/fifth-run?q=${Q}&seed=${encodeURIComponent(SEED)}`, { waitUntil: 'networkidle', timeout: 400000 })
await page.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 400000 })
await page.evaluate(() => { globalThis.__FR.setManual(true); globalThis.__FR.advance(900) })
const P3 = process.env.PREFIX || 'glide5'
const shot = (n) => page.screenshot({ path: path.join(OUT, `${P3}-${n}.png`), timeout: 0 })
const adv = (ms) => page.evaluate((m) => globalThis.__FR.advance(m), ms)
await shot('howto')
await page.click('.fr-howto__start')
await page.evaluate((sk) => globalThis.__FR.setAutopilot(sk), process.env.SKILL || 'expert')
await adv(7000)
// force a stumble-level threat so the smoke is pulled in for the capture
await page.evaluate(() => { const r = globalThis.__FR.run; r.threat = 0.62 })
await adv(500)
await shot('run')
await page.evaluate(() => { globalThis.__FR.run.threat = 0 })
await adv(1500)
await shot('stars')
// logo pickup ~38 m ahead in the runner's lane (autopilot off so it doesn't dodge the shot)
await page.evaluate(() => { const e = globalThis.__FR; const s = e.run.s + Number(process.env.LOGO_M || 20); const pk = e.track.pickups; const i = pk.findIndex((p) => p.s > s); pk.splice(i < 0 ? pk.length : i, 0, { id: 99999, kind: 'hand', lane: e.run.lane, s, y: 1, taken: false, takenTick: -1 }); for (const o of e.track.obstacles) if (o.lane === e.run.lane && o.s > e.run.s && o.s < s + 5) o.smashed = true })
await adv(250)
await shot('logo')
console.log('mv', await page.evaluate(() => { const e = globalThis.__FR; const c = [0,0,0,0]; for (const k of e.track.keys) if (k.s > e.run.s && k.s < e.run.s + 150) c[k.mv]++; return c }))
if (process.env.VIDEO !== '0') {
  const dir = fs.mkdtempSync('/tmp/g3v-')
  let f = 0
  await page.evaluate(() => { const r = globalThis.__FR.run; r.hand = 0; r.threat = 0.75 })
  for (let i = 0; i < 120; i++) {
    await adv(1000 / 30)
    if (i === 70) await page.evaluate(() => { const r = globalThis.__FR.run; r.hand = 1200 })
    await page.screenshot({ path: path.join(dir, `f${String(f++).padStart(3, '0')}.png`), timeout: 0 })
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, 'f%03d.png'), '-vf', 'scale=780:1688:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart', path.join(OUT, `${P3}-run.mp4`)])
}
await page.evaluate(() => { const r = globalThis.__FR.run; r.hand = 1200 })
await adv(1500)
await shot('invincible')
await page.evaluate(() => { const e = globalThis.__FR; e.setAutopilot(false); e.run.hand = 0; e.run.invuln = 0; e.run.lives = 1; e.run.threat = 0.9 })
for (let i = 0; i < 40 && (await page.evaluate(() => globalThis.__FR.phase)) !== 'ended'; i++) {
  await page.evaluate(() => { const e = globalThis.__FR; e.run.threat = Math.max(e.run.threat, 0.9) })
  await adv(500)
}
await adv(800)
await page.waitForTimeout(500)
await shot('end')
console.log(await page.evaluate(() => ({ phase: globalThis.__FR.phase, s: globalThis.__FR.run.s, kind: globalThis.__FR.run.deathKind })))
await browser.close()
