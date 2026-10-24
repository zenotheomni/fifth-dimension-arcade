import { chromium } from 'playwright'
const BASE = process.env.BASE || 'http://127.0.0.1:4195/arcade'
const OUT = '/workspace/arcade-shots'
const P = process.env.P || 'ff3d'
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
for (const v of ['hero', 'pins', 'ball']) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  const p = await c.newPage()
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  p.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()))
  await p.goto(`${BASE}/fifth-frame/preview?view=${v}${v === 'hero' ? '' : '&clean=1'}&still=1`, { waitUntil: 'networkidle', timeout: 120000 })
  await p.waitForFunction(() => globalThis.__FF3D?.ready, null, { timeout: 120000 })
  await p.waitForTimeout(2500)
  await p.screenshot({ path: `${OUT}/${P}-${v}.png` })
  console.log('wrote', v)
  await c.close()
}
await b.close()
