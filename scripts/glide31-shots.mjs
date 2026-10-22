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
      for (const it of (opt.key ? v.hz.get(opt.key) : v.pools[opt.pool ?? 'block'])) if (it.group.visible) { const p = wp(it.group); const dd = p.distanceTo(camPos); if (dd > 3 && (!best || dd < best[1])) best = [p, dd] }
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
await adv(3000)
for (let i = 0; i < 900; i++) {
  await adv(100)
  const ok = await page.evaluate(() => { const e = globalThis.__FR; e.run.invuln = 1e6; e.run.hand = 0; const s = e.run.s; return e.track.obstacles.some((o) => (o.kind === 'block' || o.kind === 'car') && !o.smashed && o.s - s > 9 && o.s - s < 16) })
  if (ok) break
}
await page.evaluate(() => globalThis.__FR.setManual(true))
// v31: each obstacle class, (a) game camera with the runner for scale, (b) side close-up with a cyan bar at
// the runner's FEET at jump apex (1.8 m) and a magenta bar at his HEAD at jump apex (3.55 m)
const items = ['s:meteor', 's:crates', 's:statue', 's:holo', 's:barricade', 'l:crates', 'l:holo', 'l:barricade', 'p:barrier', 'p:pipe', 'p:overhead']
for (const id of items) for (const mode of ['game', 'side']) {
  const r = await page.evaluate(([id, mode]) => {
    const v = globalThis.__FR.view
    let anchor = null
    for (const arr of v.hz.values()) for (const it of arr) if (it.group.visible && !anchor) anchor = it
    if (!anchor) return 'no anchor'
    const [p, k] = id.split(':')
    const item = p === 'p' ? v.pools[k][0] : v.hz.get(id)[1]
    const pos = anchor.group.position.clone(), rot = anchor.group.rotation.clone()
    const hidden = []
    const hide = (g) => { if (g.visible) { g.visible = false; hidden.push(g) } }
    for (const arr of v.hz.values()) for (const it of arr) hide(it.group)
    for (const arr of Object.values(v.pools)) for (const it of arr) hide(it.group)
    hide(v.keys); hide(v.keyHalos)
    item.group.visible = true
    item.group.position.copy(pos); item.group.rotation.copy(rot); item.group.scale.setScalar(1)
    item.pose?.(7, v.lastT ?? 3.3)
    const cam = v.camera
    const T = cam.position.constructor
        const marks = []
    if (mode === 'side') {
      let box = null
      v.world.traverse((o) => { if (!box && o.isMesh && o.geometry?.type === 'BoxGeometry') box = o })
      for (const [y, c] of [[1.8, 0x00e5ff], [3.55, 0xff2bd6]]) {
        if (!box) break
        const m = new box.constructor(new box.geometry.constructor(2.6, 0.05, 0.05), box.material.clone())
        m.material.color?.setHex(c); m.material.emissive?.setHex(c); m.material.map = null
        m.position.set(0, y, 0); m.scale.set(1, 1, 1); item.group.add(m); marks.push(m)
      }
    }
    v.world.updateMatrixWorld(true)
    const p0 = cam.position.clone(), q0 = cam.quaternion.clone(), f0 = cam.fov
    if (mode === 'side') {
      const target = new T().setFromMatrixPosition(item.group.matrixWorld).add(new T(0, 1.6, 0))
      const d = cam.position.clone().sub(target); d.y = 0; d.normalize().applyAxisAngle(new T(0, 1, 0), 1.2)
      cam.position.copy(target).addScaledVector(d, 8.5).add(new T(0, 0.3, 0))
      cam.lookAt(target); cam.fov = 45; cam.updateProjectionMatrix()
    }
    v.render()
    globalThis.__restore = () => { for (const m of marks) item.group.remove(m); cam.position.copy(p0); cam.quaternion.copy(q0); cam.fov = f0; cam.updateProjectionMatrix(); item.group.visible = false; for (const g of hidden) g.visible = true }
    return 'ok' + (mode === 'side' && !marks.length ? ' (no markers)' : '')
  }, [id, mode])
  if (!r.startsWith('ok')) { console.log('skip', id, r); continue }
  await shot(`glide31-${id.replace(':', '-')}-${mode}.png`)
  await page.evaluate(() => globalThis.__restore())
}
await browser.close()
