/**
 * v33 real-device perf telemetry. On with ?perf=1 in the URL (on-screen overlay, not remembered), or for a
 * 10% sample of runs (no overlay). Records every frame's dt + JS work time; long frames (>25 ms) with context;
 * on run end POSTs one compact summary to /api/arcade/perf (Supabase arcade_perf_logs).
 */
export const PERF_BUILD = 'v34'
const BUCKETS = [8.5, 12, 17.5, 25, 34, 50, 100, Infinity]
const LONG_MS = 25

export type PerfCtx = {
  runS: number
  speed: number
  boost: boolean
  turning: boolean
  chunks: number
  callout: string | null
  phase: string
}

type Long = (string | number)[]

function optedIn(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('perf')
    // v34: overlay only for the ?perf=1 URL itself, never remembered (players never see it)
    sessionStorage.removeItem('fr-perf')
    return q === '1'
  } catch {
    return false
  }
}

export class PerfLog {
  readonly opted = optedIn()
  readonly on = this.opted || Math.random() < 0.1
  private overlay: HTMLDivElement | null = null
  private hist = new Array(BUCKETS.length).fill(0)
  private jsHist = new Array(BUCKETS.length).fill(0)
  private n = 0
  private sumDt = 0
  private maxDt = 0
  private maxJs = 0
  private longs: Long[] = []
  private longN = 0
  private win: number[][] = [] // per 10 s of run: [frames, longs, maxMs, avgJs, dpr, calls, progs]
  private cur = [0, 0, 0, 0]
  private winT = 0
  private events: Long[] = []
  private lastAudio = 0
  private progs = 0
  private ovT = 0
  private ovFrames = 0
  private ovLong = 0
  private t0 = performance.now()
  private sent = false
  private onVis = () => this.event(document.hidden ? 'hidden' : 'visible')

  constructor(host: HTMLElement) {
    if (!this.on) return
    document.addEventListener('visibilitychange', this.onVis)
    if (this.opted) {
      const d = document.createElement('div')
      d.style.cssText =
        'position:fixed;left:4px;bottom:calc(env(safe-area-inset-bottom,0px) + 4px);z-index:99;pointer-events:none;' +
        'font:10px/1.25 ui-monospace,monospace;color:#9f9;background:rgba(0,0,0,.6);padding:2px 4px;border-radius:3px;white-space:pre'
      host.appendChild(d)
      this.overlay = d
    }
  }

  event(name: string) {
    if (!this.on || this.events.length >= 120) return
    this.events.push([Math.round(performance.now() - this.t0), name])
  }

  private audioCheck() {
    const log = (globalThis as { __ARCADE_MUSIC_LOG?: { to?: string }[] }).__ARCADE_MUSIC_LOG
    if (log && log.length !== this.lastAudio) {
      for (let i = this.lastAudio; i < log.length; i++) this.event(`audio:${log[i]?.to ?? '?'}`)
      this.lastAudio = log.length
    }
  }

  /** dtMs: rAF-to-rAF gap; jsMs: our own update+render work this frame. */
  frame(dtMs: number, jsMs: number, ctx: PerfCtx, info: () => (string | number)[]) {
    if (!this.on || this.sent) return
    let b = 0
    while (dtMs > BUCKETS[b]) b++
    this.hist[b]++
    let j = 0
    while (jsMs > BUCKETS[j]) j++
    this.jsHist[j]++
    this.n++
    this.sumDt += dtMs
    if (dtMs > this.maxDt) this.maxDt = dtMs
    if (jsMs > this.maxJs) this.maxJs = jsMs
    if ((this.n & 31) === 0) {
      this.audioCheck()
      const p = info()[3] as number
      if (p !== this.progs) {
        if (this.progs) this.event(`progs:${p}@${Math.round(ctx.runS * 10) / 10}`)
        this.progs = p
      }
    }
    const long = dtMs > LONG_MS && ctx.phase === 'playing'
    if (long) {
      this.longN++
      this.ovLong++
      // v34: first 150 long frames, then a rolling tail of the last 100 (v33 filled up in 19 s)
      if (this.longs.length >= 250) this.longs.splice(150, 1)
      this.longs.push([
          Math.round(ctx.runS * 10) / 10,
          Math.round(dtMs),
          Math.round(jsMs * 10) / 10,
          Math.round(ctx.speed),
          (ctx.boost ? 'B' : '') + (ctx.turning ? 'T' : '') + (ctx.callout ? 'C' : ''),
          ctx.chunks,
          ...info(),
        ])
    }
    if (ctx.phase === 'playing') {
      const c = this.cur
      c[0]++
      if (long) c[1]++
      if (dtMs > c[2]) c[2] = dtMs
      c[3] += jsMs
      if (ctx.runS - this.winT >= 10) {
        this.winT = ctx.runS
        const i = info()
        this.win.push([c[0], c[1], Math.round(c[2]), Math.round((c[3] / Math.max(1, c[0])) * 10) / 10, +i[0], +i[1], +i[3]])
        this.cur = [0, 0, 0, 0]
      }
    }
    if (this.overlay) {
      this.ovFrames++
      this.ovT += dtMs
      if (this.ovT >= 500) {
        const i = info()
        this.overlay.textContent = `${Math.round((this.ovFrames * 1000) / this.ovT)} fps · js ${jsMs.toFixed(1)} · long ${this.longN} (+${this.ovLong})\n${i.join(' ')}`
        this.ovT = 0
        this.ovFrames = 0
        this.ovLong = 0
      }
    }
  }

  /** Send the run summary once (run end, or page hide mid-run). */
  flush(extra: Record<string, unknown>) {
    if (!this.on || this.sent || this.n < 60) return
    this.sent = true
    this.audioCheck()
    const c = this.cur
    if (c[0]) this.win.push([c[0], c[1], Math.round(c[2]), Math.round((c[3] / c[0]) * 10) / 10])
    const scr = typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : ''
    const summary = {
      ...extra,
      frames: this.n,
      avgFps: Math.round((this.n * 1000) / Math.max(1, this.sumDt)),
      maxMs: Math.round(this.maxDt),
      maxJsMs: Math.round(this.maxJs),
      longN: this.longN,
      buckets: BUCKETS.map(String),
      hist: this.hist,
      jsHist: this.jsHist,
      win: this.win,
      longCols: ['runS', 'ms', 'jsMs', 'v', 'flags', 'chunks', 'dpr', 'calls', 'tris', 'progs', 'tex', 'geo'],
      longs: this.longs,
      events: this.events,
      dpr: devicePixelRatio,
      scr,
      vw: `${innerWidth}x${innerHeight}`,
    }
    const body = JSON.stringify({ gameId: 'fifth-run', build: PERF_BUILD, opted: this.opted, summary })
    try {
      void fetch("/api/arcade/perf", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: body.length < 60000,
      }).catch(() => {})
    } catch {
      /* ignore */
    }
    if (this.overlay) this.overlay.textContent += `\nsent ✓ ${this.longN} long / ${this.n} frames`
  }

  dispose() {
    document.removeEventListener('visibilitychange', this.onVis)
    this.overlay?.remove()
  }
}
