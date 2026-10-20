import { build } from 'esbuild'
await build({ entryPoints: ['scripts/fr-harness-entry.ts'], bundle: true, format: 'esm', platform: 'node', outfile: '/tmp/frsim2.mjs', logLevel: 'silent' })
const { Track } = await import('/tmp/frsim2.mjs')
const t = new Track('run:glide10'); t.ensure(5000)
const k = {}; for (const o of t.obstacles) k[o.kind] = (k[o.kind] || 0) + 1
console.log(k, 'corners', t.corners.length, t.corners.slice(0, 6).map(c => c.kind + Math.round(c.s)).join(' '), 'voids', t.obstacles.filter(o => o.kind === 'void').slice(0, 5).map(o => Math.round(o.s)).join(' '))
