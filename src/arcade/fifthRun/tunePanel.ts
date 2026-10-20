/**
 * Hidden live-tuning panel (v14). Open with ?tune=1 or five quick taps on the HUD.
 * Sliders write straight into CAM_TUNE / CHASER_TUNE; "Copy values" puts JSON on the clipboard.
 */
import { CAM_DEFAULTS, CAM_TUNE } from './render/scene'
import { CHASER_TUNE } from './render/ufo'

type Spec = { obj: Record<string, number>; key: string; label: string; min: number; max: number; step: number }
const SPECS: Spec[] = [
  { obj: CAM_TUNE, key: 'height', label: 'Camera height', min: 2, max: 7, step: 0.05 },
  { obj: CAM_TUNE, key: 'dist', label: 'Camera distance', min: 3.5, max: 11, step: 0.05 },
  { obj: CAM_TUNE, key: 'lookY', label: 'Pitch (look height)', min: -2, max: 3, step: 0.05 },
  { obj: CAM_TUNE, key: 'fov', label: 'FOV offset °', min: -15, max: 15, step: 0.5 },
  { obj: CAM_TUNE, key: 'turnS', label: 'Turn smoothing s', min: 0.06, max: 0.4, step: 0.005 },
  { obj: CAM_TUNE, key: 'lead', label: 'Turn lean on swipe', min: 0, max: 0.6, step: 0.02 },
  { obj: CAM_TUNE, key: 'fovKick', label: 'FOV kick ×', min: 0, max: 2, step: 0.05 },
  { obj: CAM_TUNE, key: 'shake', label: 'Shake ×', min: 0, max: 2, step: 0.05 },
  { obj: CHASER_TUNE, key: 'dist', label: 'Chaser distance ×', min: 0.5, max: 2, step: 0.02 },
  { obj: CHASER_TUNE, key: 'size', label: 'Chaser size ×', min: 0.4, max: 2.2, step: 0.02 },
  { obj: CHASER_TUNE, key: 'catchUp', label: 'Chaser catch-up ×', min: 0.3, max: 3, step: 0.05 },
]

let panel: HTMLDivElement | null = null

export function tuneValues() {
  return { camera: { ...CAM_TUNE }, chaser: { ...CHASER_TUNE } }
}

export function toggleTunePanel(force?: boolean) {
  const open = force ?? !panel
  if (!open) {
    panel?.remove()
    panel = null
    return
  }
  if (panel) return
  const p = document.createElement('div')
  p.className = 'fr-tune'
  p.style.cssText =
    'position:fixed;left:6px;right:6px;bottom:6px;z-index:9999;max-height:52vh;overflow:auto;background:rgba(8,6,20,.88);color:#e8e6ff;font:12px/1.3 system-ui,sans-serif;padding:8px 10px;border-radius:10px;border:1px solid rgba(160,140,255,.4);touch-action:pan-y'
  const head = document.createElement('div')
  head.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px'
  head.innerHTML = '<b style="flex:1">Tuning</b>'
  const mk = (t: string, fn: () => void) => {
    const b = document.createElement('button')
    b.textContent = t
    b.style.cssText = 'background:#3b2f7a;color:#fff;border:0;border-radius:6px;padding:5px 9px;font:inherit'
    b.onclick = fn
    head.appendChild(b)
    return b
  }
  const copy = mk('Copy values', async () => {
    const txt = JSON.stringify(tuneValues(), null, 2)
    try {
      await navigator.clipboard.writeText(txt)
      copy.textContent = 'Copied ✓'
    } catch {
      window.prompt('Copy these values', txt)
    }
    setTimeout(() => (copy.textContent = 'Copy values'), 1400)
  })
  mk('Reset', () => {
    Object.assign(CAM_TUNE, CAM_DEFAULTS)
    Object.assign(CHASER_TUNE, { dist: 1, size: 1, catchUp: 1 })
    toggleTunePanel(false)
    toggleTunePanel(true)
  })
  mk('✕', () => toggleTunePanel(false))
  p.appendChild(head)
  for (const sp of SPECS) {
    const row = document.createElement('label')
    row.style.cssText = 'display:grid;grid-template-columns:9.5em 1fr 3.4em;gap:6px;align-items:center;margin:3px 0'
    const name = document.createElement('span')
    name.textContent = sp.label
    const r = document.createElement('input')
    r.type = 'range'
    r.min = String(sp.min)
    r.max = String(sp.max)
    r.step = String(sp.step)
    r.value = String(sp.obj[sp.key])
    const val = document.createElement('span')
    val.style.cssText = 'text-align:right;font-variant-numeric:tabular-nums'
    val.textContent = (+sp.obj[sp.key]).toFixed(2)
    r.oninput = () => {
      sp.obj[sp.key] = +r.value
      val.textContent = (+r.value).toFixed(2)
    }
    row.append(name, r, val)
    p.appendChild(row)
  }
  document.body.appendChild(p)
  panel = p
}

/** five taps on the HUD within 2 s toggles the panel */
let taps: number[] = []
export function hudTap() {
  const now = performance.now()
  taps = taps.filter((t) => now - t < 2000)
  taps.push(now)
  if (taps.length >= 5) {
    taps = []
    toggleTunePanel()
  }
}

export function maybeOpenTuneFromUrl() {
  try {
    if (new URLSearchParams(location.search).get('tune') === '1') toggleTunePanel(true)
  } catch {
    /* ignore */
  }
}
