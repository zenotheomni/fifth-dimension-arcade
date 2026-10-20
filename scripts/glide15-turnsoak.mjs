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
// Long-run turn soak: 120 Hz frames with 50/100 ms spikes, expert autopilot + invulnerable so the run
// lasts MINUTES game-time; logs every turn's camera behaviour (snap / origin jump / missed swing).
const MIN = Number(process.env.MIN || 6)
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto(`http://127.0.0.1:${process.env.PORT || 4183}/arcade/fifth-glide?q=low&seed=${encodeURIComponent(SEED)}`, { waitUntil: 'networkidle', timeout: 400000 })
await page.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 400000 })
await page.evaluate(() => { globalThis.__FR.setManual(true); globalThis.__FR.advance(900) })
await page.click('.fr-howto__start')
const res = await page.evaluate((MIN) => {
  const e = globalThis.__FR
  e.setAutopilot('perfect')
  const v = e.view
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
  const turns = []
  let cur = null
  const origTurn = v.onTurn.bind(v)
  v.onTurn = (id, dir, corners, snap) => { origTurn(id, dir, corners, snap); if (!snap) { cur = { id, t: e.clock, s: e.run.s, y0: v.camYaw, pending: !!v.pendingTurn, maxStep: 0, maxOff: 0, frames: 0 }; turns.push(cur) } }
  let prevYaw = v.camYaw, prevOx = null, f = 0, worstOriginJump = 0
  const end = MIN * 60
  while (e.clock < end && !e.run.dead && e.phase === 'playing') {
    e.run.invuln = 1e6
    const dt = f % 97 === 50 ? 0.1 : f % 41 === 20 ? 0.05 : 1 / 120
    e.update(dt, true)
    f++
    const dy = Math.abs(wrap(v.camYaw - prevYaw))
    prevYaw = v.camYaw
    // camera position in fixed path-world coords: should move ≈ v·dt per frame; more = a visible jump
    v.world.updateMatrixWorld(true)
    const cw = v.world.worldToLocal(v.camera.position.clone())
    if (prevOx) { const j = Math.hypot(cw.x - prevOx.x, cw.z - prevOx.z) - e.run.v * dt * 1.25 - 0.05; worstOriginJump = Math.max(worstOriginJump, j); if (cur && cur.frames < 120) cur.maxOff = Math.max(cur.maxOff, j) }
    prevOx = { x: cw.x, z: cw.z }
    // yaw jump that isn't explained by the spring (> 1100°/s)
    if (cur && cur.frames < 120 && dy / dt > 19) cur.yawSnap = true
    if (cur && cur.frames < 120) { cur.maxStep = Math.max(cur.maxStep, dy / dt); cur.frames++ }
  }
  const bad = turns.filter((t) => !t.pending || t.maxOff > 0.5 || t.yawSnap)
  const big = turns.map((t, n) => ({ n, t: +t.t.toFixed(1), off: +t.maxOff.toFixed(1) })).filter((x) => x.off > 2)
  return { big, gameMin: +(e.clock / 60).toFixed(2), dist: Math.round(e.run.s + e.run.sBank), speed: +e.run.v.toFixed(1), turns: turns.length, bad: bad.length, firstBad: bad.slice(0, 6).map((t) => ({ n: turns.indexOf(t), t: +t.t.toFixed(1), pending: t.pending, snap: !!t.yawSnap, maxOff: +t.maxOff.toFixed(2) })), worstOriginJump: +worstOriginJump.toFixed(2), segs: v.layout.segs.length }
}, MIN)
console.log('soak', JSON.stringify(res))
await browser.close()
