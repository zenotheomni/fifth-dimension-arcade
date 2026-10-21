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
// v18 frame-by-frame turn trace: per-frame camera yaw / runner heading / runner + camera position
// deltas through every turn (steady 120 Hz frames, plus 50 / 100 ms spikes elsewhere), and the
// update cost (ms) of corner frames vs ordinary frames.
const MIN = Number(process.env.MIN || 4)
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
  let turnF = -1
  const origTurn = v.onTurn.bind(v)
  v.onTurn = (id, dir, corners, snap) => { origTurn(id, dir, corners, snap); if (!snap) turnF = 0 }
  const W = { camYawRate: 0, camYawRateStep: 0, runYawStep: 0, runPosAcc: 0, camPosAcc: 0 }
  const S = { camYawRate: 0, camYawRateStep: 0, runYawStep: 0, runPosAcc: 0, camPosAcc: 0 }
  let pCam = null, pRun = null, pCamV = null, pRunV = null, pYaw = null, pRY = null, pRate = null
  const prof = { view: 0, ensure: 0, sync: 0, t: 0 }
  const wrapT = (o, k, key) => { const f0 = o[k].bind(o); o[k] = (...a) => { const t = performance.now(); const r = f0(...a); prof[key] = Math.max(prof[key], (performance.now() - t) * (turnF >= 0 && turnF < 90 ? 1 : 0)); return r } }
  wrapT(v, 'update', 'view'); wrapT(e.track, 'ensure', 'ensure'); wrapT(v.layout, 'sync', 'sync')
  let f = 0, turns = 0, costTurn = 0, costPlain = 0, nPlain = 0, sumPlain = 0
  const end = MIN * 60
  while (e.clock < end && !e.run.dead && e.phase === 'playing') {
    e.run.invuln = 1e6
    const inTurn = turnF >= 0 && turnF < 90
    // spikes only away from turns, so turn frames are a clean 120 Hz trace
    const dt = !inTurn && f % 97 === 50 ? 0.1 : !inTurn && f % 41 === 20 ? 0.05 : 1 / 120
    const t0 = performance.now()
    e.update(dt, true)
    const cost = performance.now() - t0
    if (turnF === 0) turns++
    f++
    v.world.updateMatrixWorld(true)
    const cam = v.world.worldToLocal(v.camera.position.clone())
    const run = v.runner.group.position.clone()
    const yaw = v.camYaw
    const ry = v.runYaw
    const camV = pCam ? { x: (cam.x - pCam.x) / dt, z: (cam.z - pCam.z) / dt } : null
    const runV = pRun ? { x: (run.x - pRun.x) / dt, z: (run.z - pRun.z) / dt } : null
    const rate = pYaw != null ? wrap(yaw - pYaw) / dt : null
    const T = turnF >= 0 && turnF < 90 ? W : S
    if (dt === 1 / 120 && (turnF < 0 || turnF > 0)) {
      if (rate != null) T.camYawRate = Math.max(T.camYawRate, Math.abs(rate))
      if (rate != null && pRate != null) T.camYawRateStep = Math.max(T.camYawRateStep, Math.abs(rate - pRate))
      if (pRY != null) T.runYawStep = Math.max(T.runYawStep, Math.abs(wrap(ry - pRY)))
      if (runV && pRunV) { const q = Math.hypot(runV.x - pRunV.x, runV.z - pRunV.z) / dt; if (q > T.runPosAcc) T.at = turnF; T.runPosAcc = Math.max(T.runPosAcc, q) }
      if (camV && pCamV) T.camPosAcc = Math.max(T.camPosAcc, Math.hypot(camV.x - pCamV.x, camV.z - pCamV.z) / dt)
    }
    if (inTurn || turnF === 0) costTurn = Math.max(costTurn, cost)
    else { nPlain++; sumPlain += cost }
    pCam = cam; pRun = run; pCamV = camV; pRunV = runV; pYaw = yaw; pRY = ry; pRate = rate
    if (turnF >= 0) turnF++
    if (turnF > 400) turnF = -1
  }
  const r = (o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, +x.toFixed(3)]))
  return { gameMin: +(e.clock / 60).toFixed(2), turns, speed: +e.run.v.toFixed(1), turn: r(W), straight: r(S), updateMsMaxTurn: +costTurn.toFixed(2), prof, updateMsMeanPlain: +(sumPlain / Math.max(1, nPlain)).toFixed(3) }
}, MIN)
console.log('trace', JSON.stringify(res))
await browser.close()
