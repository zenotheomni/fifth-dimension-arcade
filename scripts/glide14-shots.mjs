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
const P = 'glide14'
const PORT = process.env.PORT || 4183
async function openGame(extra = '') {
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await page.goto(`http://127.0.0.1:${PORT}/arcade/fifth-glide?q=${Q}&seed=${encodeURIComponent(SEED)}${extra}`, { waitUntil: 'networkidle', timeout: 400000 })
  await page.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 400000 })
  await page.evaluate(() => { globalThis.__FR.setManual(true); globalThis.__FR.advance(900) })
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${P}-${n}.png`), timeout: 0 })
  const adv = (ms, f) => page.evaluate(([m, fr]) => globalThis.__FR.advance(m, fr), [ms, f ?? 1000 / 60])
  return { page, shot, adv }
}
const only = (process.env.ONLY || 'open,turn,ufo,tune,video').split(',')

// ── 1. opening cinematic (frames + clip) ──
if (only.includes('open')) {
  const { page, shot, adv } = await openGame('&ufo=v13')
  await shot('howto')
  await page.click('.fr-howto__start')
  await page.evaluate(() => globalThis.__FR.setAutopilot('expert'))
  const vdir = fs.mkdtempSync('/tmp/g14o-')
  for (let f = 0; f < 96; f++) {
    await adv(1000 / 30)
    await page.screenshot({ path: path.join(vdir, `f${String(f).padStart(3, '0')}.png`), timeout: 0 })
    if (f === 6) fs.copyFileSync(path.join(vdir, 'f006.png'), path.join(OUT, `${P}-open-1.png`))
    if (f === 27) fs.copyFileSync(path.join(vdir, 'f027.png'), path.join(OUT, `${P}-open-2.png`))
    if (f === 46) fs.copyFileSync(path.join(vdir, 'f046.png'), path.join(OUT, `${P}-open-3-run.png`))
    if (f === 80) fs.copyFileSync(path.join(vdir, 'f080.png'), path.join(OUT, `${P}-open-4-blend.png`))
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(vdir, 'f%03d.png'), '-vf', 'scale=780:1688:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart', path.join(OUT, `${P}-opening.mp4`)])
  // tap-skip check
  const { page: p2, adv: a2 } = await openGame('&ufo=v13')
  await p2.click('.fr-howto__start')
  await a2(300)
  await p2.touchscreen.tap(195, 600)
  await a2(400)
  const skipped = await p2.evaluate(() => globalThis.__FR.openT >= 2.6 && globalThis.__FR.view.openK > 0.97)
  console.log('tap-skip', skipped)
  await p2.close()
  await page.close()
}

// ── 2. turn at 120 Hz with dt spikes: camera yaw per frame ──
if (only.includes('turn')) {
  const { page, shot, adv } = await openGame('&ufo=v13')
  await page.click('.fr-howto__start')
  await page.evaluate(() => globalThis.__FR.setAutopilot('expert'))
  await adv(4000)
  for (let i = 0; i < 400; i++) {
    const d = await page.evaluate(() => { const e = globalThis.__FR; const c = e.track.corners.find((c) => c.s > e.run.cDone); return c ? c.s - e.run.s : 999 })
    if (d < 40 && d > 0) break
    await adv(100)
  }
  const log = await page.evaluate(() => {
    const e = globalThis.__FR
    const out = []
    let k = 0
    for (let f = 0; f < 150; f++) {
      const spike = f % 9 === 4 ? (f % 18 === 4 ? 0.1 : 0.05) : 1 / 120
      e.advance(spike * 1000, spike * 1000)
      out.push({ f, t: e.clock, dt: spike, yaw: e.view.camYaw, lead: !!e.view.lead, turnQ: e.run.turnQ, s: e.run.s })
      k++
    }
    return out
  })
  let maxRate = 0, firstLead = -1, firstTurn = -1, overshoot = 0, jumps = 0
  const y0 = log[0].yaw
  const yEnd = log[log.length - 1].yaw
  const total = Math.atan2(Math.sin(yEnd - y0), Math.cos(yEnd - y0))
  for (let i = 1; i < log.length; i++) {
    const dy = Math.atan2(Math.sin(log[i].yaw - log[i - 1].yaw), Math.cos(log[i].yaw - log[i - 1].yaw))
    if (Math.abs(dy) > 0.5) jumps++
    maxRate = Math.max(maxRate, Math.abs(dy) / log[i].dt)
    if (firstLead < 0 && log[i].lead) firstLead = i
    if (firstTurn < 0 && Math.abs(Math.atan2(Math.sin(log[i].yaw - y0), Math.cos(log[i].yaw - y0))) > 0.01) firstTurn = i
    const prog = Math.atan2(Math.sin(log[i].yaw - y0), Math.cos(log[i].yaw - y0)) / (total || 1)
    overshoot = Math.max(overshoot, prog - 1)
  }
  const report = { frames: log.length, totalYawDeg: +(total * 180 / Math.PI).toFixed(1), leanStartsFrame: firstLead, yawMovesFrame: firstTurn, maxYawRateDegPerS: +(maxRate * 180 / Math.PI).toFixed(0), overshootPct: +(overshoot * 100).toFixed(2), jumpsOver30deg: jumps }
  fs.writeFileSync(path.join(OUT, `${P}-turn120.json`), JSON.stringify({ report, log }, null, 1))
  console.log('turn120', JSON.stringify(report))
  // turn sequence shots at 60 Hz
  for (let i = 0; i < 400; i++) {
    const d = await page.evaluate(() => { const e = globalThis.__FR; const c = e.track.corners.find((c) => c.s > e.run.cDone); return c ? c.s - e.run.s : 999 })
    if (d < 22 && d > 0) break
    await adv(50)
  }
  for (let k = 0; k < 6; k++) { await shot(`turn-${k}`); await adv(80) }
  await page.close()
}

// ── 3. chaser variants ──
if (only.includes('ufo')) {
  for (const v of ['a', 'b', 'c']) {
    const { page, shot, adv } = await openGame(`&ufo=${v}`)
    await page.click('.fr-howto__start')
    await page.evaluate(() => globalThis.__FR.setAutopilot('expert'))
    await adv(6500)
    await page.evaluate(() => { globalThis.__FR.run.threat = 0.25 })
    await adv(1500)
    await shot(`ufo-${v}`)
    await page.evaluate(() => { const r = globalThis.__FR.run; r.threat = 0.75; r.slowT = 120; r.stumble = 54 })
    await adv(450)
    await shot(`ufo-${v}-stumble`)
    await page.close()
  }
  // localStorage memory: no ?ufo now → last pick (c)
  const { page } = await openGame('')
  console.log('remembered', await page.evaluate(() => globalThis.__FR.view.dark.variant))
  await page.close()
}

// ── 4. tuning panel (5 taps on the HUD) ──
if (only.includes('tune')) {
  const { page, shot, adv } = await openGame('&ufo=v13')
  await page.click('.fr-howto__start')
  await page.evaluate(() => globalThis.__FR.setAutopilot('expert'))
  await adv(3500)
  for (let i = 0; i < 5; i++) { await page.touchscreen.tap(200, 70); await page.waitForTimeout(60) }
  await adv(100)
  console.log('panel', await page.evaluate(() => !!document.querySelector('.fr-tune')))
  await shot('tune')
  await page.close()
}

// ── 5. gameplay clip (default chaser) ──
if (only.includes('video')) {
  const { page, adv } = await openGame('&ufo=v13')
  await page.click('.fr-howto__start')
  await page.evaluate(() => globalThis.__FR.setAutopilot('expert'))
  const vdir = fs.mkdtempSync('/tmp/g14v-')
  for (let f = 0; f < 270; f++) {
    if (f === 200) await page.evaluate(() => { globalThis.__FR.run.threat = 0.75 })
    await adv(1000 / 30)
    await page.screenshot({ path: path.join(vdir, `f${String(f).padStart(3, '0')}.png`), timeout: 0 })
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(vdir, 'f%03d.png'), '-vf', 'scale=780:1688:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart', path.join(OUT, `${P}-run.mp4`)])
  await page.close()
}
console.log('done')
await browser.close()
