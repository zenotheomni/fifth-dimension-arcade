import { chromium } from '/workspace/deploy/fifth-dimension-arcade/node_modules/playwright/index.mjs'
import fs from 'fs'
const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] })
const p = await b.newPage()
p.on('console', m=>{ if(!/GPU stall/.test(m.text())) console.log('>', m.text().slice(0,300))}); p.on('pageerror', e=>console.log('ERR', e.message))
await p.goto('http://127.0.0.1:8777/glide-assets/convert2.html' + (process.argv[3] || ''))
await p.waitForFunction(()=>window.done, null, {timeout:120000})
const er = await p.evaluate(()=>window.err); if (er) { console.log('PAGE ERR', er); process.exit(1) }
console.log(JSON.stringify(await p.evaluate(()=>window.info), null, 1).slice(0,6000))
fs.writeFileSync(process.argv[2], Buffer.from(await p.evaluate(()=>window.glb), 'base64'))
await b.close()
