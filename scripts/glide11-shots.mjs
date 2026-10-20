/**
 * Fifth Glide v11 screenshots + clip (390×844, deterministic manual stepping, mocked API — nothing hits prod).
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
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('console.' + m.type(), m.text().slice(0, 300)))
await page.goto(`http://127.0.0.1:${process.env.PORT || 4183}/arcade/fifth-glide?q=${Q}&seed=${encodeURIComponent(SEED)}`, { waitUntil: 'networkidle', timeout: 400000 })
await page.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 400000 })
await page.evaluate(() => { globalThis.__FR.setManual(true); globalThis.__FR.advance(900) })

const P = 'glide11'
const shot = (n, clip) => page.screenshot({ path: path.join(OUT, `${P}-${n}.png`), timeout: 0, ...(clip ? { clip } : {}) })
const adv = (ms) => page.evaluate((m) => globalThis.__FR.advance(m), ms)
const probe = () => page.evaluate(() => { const e = globalThis.__FR; const g = e.view.runner.group; const p = g.getWorldPosition(new g.position.constructor()); const c = e.track.corners.find((c) => c.s > e.run.cDone); return { s: e.run.s, x: e.run.x, y: e.run.y, air: e.run.air, turns: e.run.turns, wx: p.x, wy: p.y, wz: p.z, toCorner: c ? c.s - e.run.s : null } })
await shot('howto')
await page.click('.fr-howto__start')
await page.evaluate(() => globalThis.__FR.setAutopilot('expert'))
await adv(3000)
await shot('hud', { x: 0, y: 0, width: 390, height: 150 })
// ── turn sequence: step to ~22 m before the next corner, then 1 frame / 33 ms through it ──
for (let i = 0; i < 200; i++) { const p = await probe(); if (p.toCorner !== null && p.toCorner < 24 && p.toCorner > 0) break; await adv(250) }
const t0 = (await probe()).turns
const log = []
const vdir = fs.mkdtempSync('/tmp/g11v-')
let f = 0
for (let i = 0; i < 40; i++) {
  await adv(1000 / 30)
  const p = await probe()
  log.push(p)
  await page.screenshot({ path: path.join(vdir, `f${String(f++).padStart(3, '0')}.png`), timeout: 0 })
}
const ti = log.findIndex((p) => p.turns > t0)
console.log('turn frame index', ti)
for (const [k, j] of [[1, ti - 6], [2, ti - 1], [3, ti], [4, ti + 4]]) fs.copyFileSync(path.join(vdir, `f${String(Math.max(0, j)).padStart(3, '0')}.png`), path.join(OUT, `${P}-turn${k}.png`))
// position continuity: runner world step per frame vs expected (speed / 30), and feet height
let worst = 0
for (let i = 1; i < log.length; i++) { const a = log[i - 1], b = log[i]; const d = Math.hypot(b.wx - a.wx, b.wz - a.wz); worst = Math.max(worst, d) }
console.log('turn log', JSON.stringify(log.slice(Math.max(0, ti - 3), ti + 4).map((p) => ({ s: +p.s.toFixed(2), x: +p.x.toFixed(2), y: +p.y.toFixed(3), air: p.air, wy: +p.wy.toFixed(3), turns: p.turns }))))
console.log('max world step/frame', worst.toFixed(3), 'max feet y', Math.max(...log.map((p) => p.wy)).toFixed(3))
// ── slide gate ahead in the runner's lane ──
await page.evaluate(() => { const e = globalThis.__FR; e.setAutopilot(false); const s = e.run.s + 13; for (const o of e.track.obstacles) if (o.s > e.run.s && o.s < s + 8) o.smashed = true; const obs = e.track.obstacles; const i = obs.findIndex((o) => o.s > s); obs.splice(i < 0 ? obs.length : i, 0, { id: 88888, kind: 'overhead', lane: e.run.lane, s, len: 0.45, vs: 0, variant: 0, smashed: false }); e.run.invuln = 600 })
await adv(120)
await shot('slide')
await adv(250)
await page.evaluate(() => globalThis.__FR.input('slide'))
await adv(200)
await shot('slide-under')
// ── UFO rush after a hit ──
await page.evaluate(() => { const e = globalThis.__FR; e.setAutopilot('expert'); e.run.threat = 0.75; e.run.slowT = 120; e.run.stumble = 54 })
await adv(450)
await shot('ufo-hit')
await adv(5500)
await shot('ufo-drift')
// ── deep space: run on (autopilot, invulnerable) ──
await page.evaluate(() => { globalThis.__FR.run.invuln = 1e6 })
for (let i = 0; i < 80 && (await probe()).s < 1500; i++) await adv(1000)
await page.evaluate(() => { globalThis.__FR.run.invuln = 0 }); await adv(34); await shot('space1'); await page.evaluate(() => { globalThis.__FR.run.invuln = 1e6 })
await adv(4000)
await page.evaluate(() => { globalThis.__FR.run.invuln = 0 }); await adv(34); await shot('space2'); await page.evaluate(() => { globalThis.__FR.run.invuln = 1e6 })
await adv(6000)
await page.evaluate(() => { globalThis.__FR.run.invuln = 0 }); await adv(34); await shot('space3'); await page.evaluate(() => { globalThis.__FR.run.invuln = 1e6 })
// mp4: the turn sequence + a stretch of deep space
for (let i = 0; i < 90; i++) { await adv(1000 / 30); await page.screenshot({ path: path.join(vdir, `f${String(f++).padStart(3, '0')}.png`), timeout: 0 }) }
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(vdir, 'f%03d.png'), '-vf', 'scale=780:1688:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart', path.join(OUT, `${P}-run.mp4`)])
console.log('done', await probe())
await browser.close()
