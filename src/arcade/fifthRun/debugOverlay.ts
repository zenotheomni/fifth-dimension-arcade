/**
 * `?debug=1` overlay for hunting the iPhone "black box": logs WebGL context loss / restore, every canvas
 * resize (applied or ignored, with the reason), DPR / quality changes, NaN / Inf pixels found by a small
 * periodic HDR probe render, long frames and visibility changes. Off (and never constructed) by default.
 */
export class DebugOverlay {
  private el: HTMLDivElement
  private live: HTMLDivElement
  private logEl: HTMLDivElement
  private lines: string[] = []
  private t0 = performance.now()
  counts = { lost: 0, resize: 0, ignored: 0, nanFrames: 0, longFrames: 0 }

  static enabled(): boolean {
    try {
      return new URLSearchParams(location.search).get('debug') === '1'
    } catch {
      return false
    }
  }

  constructor(host: HTMLElement) {
    this.el = document.createElement('div')
    this.el.className = 'fr-debug'
    this.el.setAttribute('aria-hidden', 'true')
    Object.assign(this.el.style, {
      position: 'absolute',
      left: '4px',
      bottom: '4px',
      zIndex: '60',
      maxWidth: '72%',
      padding: '4px 6px',
      font: '10px/1.25 ui-monospace, Menlo, monospace',
      color: '#9ff',
      background: 'rgba(0,0,0,0.55)',
      borderRadius: '4px',
      pointerEvents: 'none',
      whiteSpace: 'pre-wrap',
    } as CSSStyleDeclaration)
    this.live = document.createElement('div')
    this.live.style.color = '#ffd36a'
    this.logEl = document.createElement('div')
    this.el.append(this.live, this.logEl)
    host.appendChild(this.el)
    this.log(`debug on · ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 80)}`)
  }

  log(msg: string) {
    const t = ((performance.now() - this.t0) / 1000).toFixed(1)
    this.lines.push(`${t}s ${msg}`)
    if (this.lines.length > 14) this.lines.shift()
    this.logEl.textContent = this.lines.join('\n')
    console.info('[FR debug]', msg)
  }

  setLive(text: string) {
    this.live.textContent = text
  }

  destroy() {
    this.el.remove()
  }
}

/** Half-float bits → true if NaN or ±Inf. */
export function halfBad(h: number) {
  return (h & 0x7c00) === 0x7c00
}
