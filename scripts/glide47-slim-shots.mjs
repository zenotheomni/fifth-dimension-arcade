/**
 * v47 slim runway screenshots. Uses URL seed + __FR teleport.
 * Seeds must match seedFromUrl: /^[a-z]+:[0-9a-f]{6,32}$/
 */
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const OUT = process.env.OUT || '/workspace/arcade-shots'
const PORT = process.env.PORT || 4187
fs.mkdirSync(OUT, { recursive: true })

// stand ~28m before void so the slim strip (+ optional hurdle) is ahead in frame
const SHOTS = [
  { name: 'slim-mid.png', seed: 'slim:000000', voidS: 4862.8, midObS: null, lane: 1, note: 'slim mid strip' },
  { name: 'slim-right-jump.png', seed: 'slim:000001', voidS: 6033.57, midObS: 6044.98, lane: 2, note: 'slim right + barrier' },
  { name: 'slim-mid-jump.png', seed: 'slim:000007', voidS: 6014.37, midObS: 6023.15, lane: 1, note: 'slim mid + barrier' },
]

const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
async function mockApi(ctx) {
  await ctx.route('**/api/**', async (route) => {
    const u = new URL(route.request().url())
    const action = u.pathname.replace(/^.*\/api\//, '')
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ...o }) })
    if (action.startsWith('og')) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG1 })
    if (action === 'arcade/session') return json({ player: { player_id: 'p-jenks', handle: 'jenks', is_guest: false, token: 'tok' } })
    if (action === 'arcade/run') return json({ run: { id: 'x', mode: 'endless', score: 1, player_id: 'p-jenks', handle: 'jenks', is_guest: false, personal_best: 1, duplicate: false, board: { alltime: { rank: 1, score: 1 }, weekly: { rank: 1, score: 1 } } } })
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

for (const shot of SHOTS) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  await mockApi(ctx)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await page.goto(`http://127.0.0.1:${PORT}/arcade/fifth-glide?q=high&seed=${encodeURIComponent(shot.seed)}`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 120000 })
  await page.waitForSelector('.fr-howto__start:not([disabled])', { timeout: 120000 })
  // freeze BEFORE start so the run doesn't tick between click and teleport
  await page.evaluate(() => { globalThis.__FR.setManual(true) })
  await page.click('.fr-howto__start')
  await page.waitForTimeout(200)
  const standS = shot.voidS - 28
  const info = await page.evaluate(({ standS, lane, voidS }) => {
    const e = globalThis.__FR
    e.setManual(true)
    e.track.ensure(standS + 200)
    const LANE_W = 2
    // mark every corner behind us as taken so teleport doesn't 'miss' a turn
    let lastCorner = -1
    for (const c of e.track.corners) {
      if (c.s <= standS + 5) lastCorner = c.s
    }
    Object.assign(e.run, {
      invuln: 1e6,
      lives: 3,
      hand: 0,
      dead: false,
      deathKind: null,
      down: 0,
      downKind: null,
      downMax: 0,
      air: false,
      y: 0,
      vy: 0,
      slide: 0,
      stumble: 0,
      threat: 0,
      s: standS,
      lane,
      x: (lane - 1) * LANE_W,
      tx: (lane - 1) * LANE_W,
      vx: 0,
      v: 36,
      obCur: 0,
      keyCur: 0,
      pkCur: 0,
      edgeHold: 0,
      turnQ: 0,
      pendTurn: 0,
      pendCorner: -1,
      runV: 0,
      offS: 0,
      cDone: lastCorner,
    })
    // a couple render ticks without much travel
    e.advance(32)
    e.run.s = standS
    e.run.lane = lane
    e.run.x = (lane - 1) * LANE_W
    e.run.tx = (lane - 1) * LANE_W
    e.run.y = 0
    e.run.air = false
    e.run.down = 0
    e.run.dead = false
    e.advance(16)
    const near = e.track.obstacles.filter((o) => o.s > voidS - 2 && o.s < voidS + 45)
    return {
      seedUsed: e.bridge?.seed,
      phase: e.phase,
      s: e.run.s,
      lane: e.run.lane,
      down: e.run.down,
      dead: e.run.dead,
      deathKind: e.run.deathKind,
      near: near.map((o) => `${o.kind}@${o.lane}:${o.s.toFixed(1)}+${o.len.toFixed(1)}`),
    }
  }, { standS, lane: shot.lane, voidS: shot.voidS })
  console.log(shot.name, shot.note, info)
  await page.screenshot({ path: path.join(OUT, shot.name) })
  console.log('wrote', path.join(OUT, shot.name))
  await ctx.close()
}
await browser.close()
