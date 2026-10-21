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
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto(`http://127.0.0.1:${process.env.PORT || 4183}/arcade/fifth-glide?q=high&seed=${encodeURIComponent(SEED)}`, { waitUntil: 'networkidle', timeout: 400000 })
await page.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 400000 })
await page.evaluate(() => {
  const e = globalThis.__FR
  e.setManual(true)
  e.advance(900)
  // close-up helper: after a normal sim+render step, re-render from a hand-placed camera
  globalThis.__close = (which, opt = {}) => {
    const v = e.view
    const cam = v.camera
    const T = globalThis.THREE_V || cam.position.constructor
    const camPos = cam.position.clone()
    const toCam = (p) => { const d = camPos.clone().sub(p); d.y = 0; return d.normalize() }
    let target = null
    let from = null
    const wp = (o) => { o.updateWorldMatrix(true, false); return new T().setFromMatrixPosition(o.matrixWorld) }
    if (which === 'backpack') {
      let patch = null
      v.runner.group.traverse((o) => { if (o.material && o.material.name === 'patch') patch = o })
      target = wp(patch)
      const d = toCam(target)
      from = target.clone().addScaledVector(d, 0.75).add(new T(0, 0.04, 0))
    } else if (which === 'powerup') {
      let best = null
      v.scene.traverse((o) => { if (o.visible && o.material && o.material.map && String(o.material.map.image?.src || '').includes('5d-logo-exact') && !v.runner.group.getObjectById(o.id)) { const p = wp(o); const dd = p.distanceTo(camPos); if (!best || dd < best[1]) best = [p, dd, o] } })
      target = best[0]
      globalThis.__pu = best[2]
      const d = toCam(target)
      from = target.clone().addScaledVector(d, 4.2).add(new T(0, 0.1, 0))
    } else if (which === 'rocket') {
      let best = null
      for (const it of v.pools.block) if (it.group.visible) { const p = wp(it.group); const dd = p.distanceTo(camPos); if (dd > 3 && (!best || dd < best[1])) best = [p, dd] }
      target = best[0].add(new T(0, opt.ty ?? 0.75, 0))
      const d = toCam(target).applyAxisAngle(new T(0, 1, 0), opt.az ?? 0.5)
      from = target.clone().addScaledVector(d, opt.dist ?? 4.2).add(new T(0, opt.up ?? 0.6, 0))
    } else if (which === 'ufo') {
      target = wp(v.dark.group)
      const d = toCam(target).applyAxisAngle(new T(0, 1, 0), opt.az ?? 0.9)
      from = target.clone().addScaledVector(d, opt.dist ?? 3.4).add(new T(0, opt.up ?? -0.5, 0))
    }
    if (which === 'powerup') globalThis.__pu.lookAt(from)
    const fov = cam.fov
    cam.position.copy(from)
    cam.lookAt(target)
    cam.fov = opt.fov ?? 40
    cam.updateProjectionMatrix()
    v.render()
    cam.fov = fov
    cam.updateProjectionMatrix()
    return [target.toArray(), from.toArray()]
  }
})
const adv = (ms) => page.evaluate((m) => globalThis.__FR.advance(m), ms)
const shot = async (n) => { await page.screenshot({ path: path.join(OUT, n) }); console.log('shot', n) }
await page.click('.fr-howto__start')
await page.evaluate(() => { globalThis.__FR.setAutopilot('expert'); globalThis.__FR.run.invuln = 1e6 })
await adv(3500)
// star placements: look ahead for each bait type and shoot the normal game view when it's 14-30 m out
const want = { arc: 'glide17-stars-jump-arc.png', truss: 'glide17-stars-under-truss.png', palm: 'glide17-stars-by-palm.png', hole: 'glide17-stars-by-hole.png', trail: 'glide17-stars-trail.png' }
const done = new Set()
let palmDone = false
for (let i = 0; i < 900 && (done.size < 5 || !palmDone); i++) {
  await adv(200)
  const found = await page.evaluate(() => {
    const e = globalThis.__FR
    e.run.invuln = 1e6
    const s = e.run.s
    const ahead = (x, a = 8, b = 18) => x.s - s > a && x.s - s < b
    const keys = e.track.keys.filter((k) => k.state === 0 && ahead(k))
    const obs = e.track.obstacles.filter((o) => ahead(o, 8, 22))
    const types = []
    for (const o of obs) {
      const inLane = keys.filter((k) => k.lane === o.lane && Math.abs(k.s - (o.s + o.len / 2)) < 8)
      if ((o.kind === 'barrier' || o.kind === 'pipe' || o.kind === 'gap') && inLane.some((k) => k.y > 2)) types.push('arc')
      if (o.kind === 'overhead' && inLane.some((k) => k.y < 0.6)) types.push('truss')
      const before = keys.filter((k) => k.lane === o.lane && o.s - k.s > 0 && o.s - k.s < 9)
      if (o.kind === 'block' && before.length >= 2) types.push('palm')
      if (o.kind === 'void' && before.length >= 2) types.push('hole')
    }
    const lanes = new Set(keys.filter((k) => k.s - s < 26).map((k) => k.lane))
    if (lanes.size >= 3 && !obs.length) types.push('trail')
    return { types, block: e.track.obstacles.some((o) => o.kind === 'block' && o.s - s > 10 && o.s - s < 24) }
  })
  for (const t of found.types) if (!done.has(t)) {
    done.add(t)
    await shot(want[t])
    break
  }
  if (!palmDone && found.block && (await page.evaluate(() => globalThis.__FR.run.s)) > 300) {
    console.log(await page.evaluate(() => globalThis.__close('rocket', { az: 0.35, dist: 7.5, up: 0.4, ty: 2.1, fov: 45 })))
    await shot('glide17-palm-close.png')
    palmDone = true
  }
}
console.log('done', [...done])
await browser.close()
