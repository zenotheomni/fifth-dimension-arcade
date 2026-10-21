/**
 * Scene music manager: two decks (A/B) so a scene change crossfades the
 * outgoing track into the incoming one. Only one track is ever audible as the
 * "current" scene; the other deck only exists to fade out.
 *
 * Volume always goes through WebAudio gain (iOS ignores element.volume). If
 * WebAudio routing is unavailable we fall back to element.volume.
 */
import { getAudioContext, onGesture, onVisibility, peekAudioContext } from './audioContext'
import { MUSIC_FADE_IN_S, MUSIC_FADE_OUT_S, SCENE_PLAYLISTS, SCENE_TRACKS, type MusicScene, type MusicTrack } from './music'

type Deck = {
  /** the element currently carrying the song (one of `els`) */
  el: HTMLAudioElement
  /** two copies of the song: at the end the playing one crossfades into the other (gapless loop) */
  els: [HTMLAudioElement, HTMLAudioElement]
  sub: [GainNode | null, GainNode | null]
  primed: boolean
  warm?: boolean
  swapping: boolean
  gain: GainNode | null
  routed: boolean
  track: MusicTrack | null
  pauseTimer: ReturnType<typeof setTimeout> | null
}

let decks: Deck[] = []
let active: Deck | null = null
let scene: MusicScene = 'none'
let ducked = false
let muted = false
let unlocked = false
let started = false
/** QA: crossfade path disabled (see __ARCADE_MUSIC_BREAK) */
let noTwin = false

/** Scene-change log for tests / debugging: window.__ARCADE_MUSIC_LOG */
type LogEntry = { t: number; scene: MusicScene; from: string | null; to: string | null; path: string }
const sceneLog: LogEntry[] = []
if (typeof window !== 'undefined') (window as unknown as { __ARCADE_MUSIC_LOG?: LogEntry[] }).__ARCADE_MUSIC_LOG = sceneLog

function pickSrc(t: MusicTrack): string {
  const probe = document.createElement('audio')
  for (const s of t.sources) if (probe.canPlayType(s.type)) return s.src
  return t.sources[t.sources.length - 1].src
}

/** crossfade length when a song wraps around to its start */
const LOOP_XF_S = 1.2

function makeEl() {
  const el = document.createElement('audio')
  // native loop stays on as the fallback if the twin can't start (unrouted / blocked)
  el.loop = true
  el.preload = 'auto'
  el.setAttribute('playsinline', '')
  return el
}

function makeDeck(): Deck {
  const els: [HTMLAudioElement, HTMLAudioElement] = [makeEl(), makeEl()]
  els[1].preload = 'none'
  const d: Deck = { el: els[0], els, sub: [null, null], primed: false, swapping: false, gain: null, routed: false, track: null, pauseTimer: null }
  // v24: every song must keep going. iOS can fire 'ended' even with loop on (WebAudio-routed element),
  // and the twin crossfade can fail: whatever happens, an ended song restarts / moves to the next one.
  for (const e of els) {
    e.addEventListener('ended', () => onEnded(d, e))
    // v25: iOS can pause / stall a routed element on its own (audio-session interruptions, SFX bursts,
    // network hiccups). Any stop of the CURRENT song while it should be playing is recovered at once.
    for (const ev of ['pause', 'stalled', 'suspend', 'waiting', 'emptied'] as const)
      e.addEventListener(ev, () => {
        if (e === d.el && d === active && shouldPlay()) setTimeout(() => watchdog(true), ev === 'pause' ? 60 : 1000)
      })
  }
  return d
}

function onEnded(d: Deck, e: HTMLAudioElement) {
  if (d !== active || e !== d.el || muted || !unlocked || document.hidden) return
  const next = nextTrack(d)
  if (next && next !== d.track) return hardNext(d, e)
  e.currentTime = 0
  void e.play().catch(() => {})
}

function pauseDeck(d: Deck) {
  for (const e of d.els) e.pause()
  d.swapping = false
}

/** iOS: let the twin element play later without a gesture by starting it silently inside one */
function prime(d: Deck) {
  // v24: don't fight the first download — the twin is only unlocked once the song itself is buffered
  // (a later tap does it; until then the native loop / 'ended' fallback covers the wrap)
  if (d.primed || !d.routed || d.el.readyState < 3) return
  const t = d.els.find((e) => e !== d.el)!
  if (!t.src && d.el.src) t.src = d.el.src
  if (!t.src) return
  d.primed = true
  t.muted = true
  void t.play().then(() => { t.pause(); t.muted = false }).catch(() => { t.muted = false; d.primed = false })
}

/** gapless loop: shortly before the end, start the twin at 0 and crossfade (WebAudio-routed decks only).
 *  The playing copy keeps its native loop until the twin is really running, so a slow start can only
 *  ever fall back to the plain loop — never silence or a doubled intro. */
const badTracks = new Set<string>()
const playedIds = new Set<string>()
function nextTrack(d: Deck): MusicTrack | null {
  const list = (SCENE_PLAYLISTS[scene] ?? []).filter((x) => !badTracks.has(x.id))
  if (!d.track || list.length < 2) return d.track
  const i = list.findIndex((x) => x.id === d.track!.id)
  return i < 0 ? d.track : list[(i + 1) % list.length]
}
function announce(t: MusicTrack, unlocked: boolean) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('arcade-music-track', { detail: { title: t.title, unlocked } }))
}

/** fallback when the crossfade didn't run: the song ended → start the next one on the same element */
function hardNext(d: Deck, e: HTMLAudioElement) {
  e.onended = null
  if (d.el !== e || d !== active) return
  const next = nextTrack(d)
  if (!next || next === d.track) {
    e.currentTime = 0
    void e.play().catch(() => {})
    return
  }
  const seen = playedIds.has(next.id)
  playedIds.add(next.id)
  d.track = next
  e.src = pickSrc(next)
  e.loop = true
  void e.play().catch(() => {})
  d.warm = false
  announce(next, !seen)
}

/** v25: the active song should be audible right now */
function shouldPlay(): boolean {
  const a = active
  return Boolean(a && a.track && started && unlocked && !muted && !document.hidden && !a.swapping && !a.pauseTimer)
}

/** v25 watchdog: paused, or currentTime not advancing for > 1 s, while it should play → resume the
 *  AudioContext and the element (and, if the routed path stays stuck, fall back to the element alone). */
let wdLast = -1
let wdStuckAt = 0
let wdFix = 0
const wdStats = { resumes: 0, ctxResumes: 0, reloads: 0 }
function watchdog(now = false) {
  const a = active
  if (!a || !shouldPlay()) {
    wdStuckAt = 0
    return
  }
  const ctx = peekAudioContext()
  if (ctx && a.routed && ctx.state !== 'running') {
    wdStats.ctxResumes++
    void ctx.resume().catch(() => {})
  }
  const e = a.el
  const t = performance.now()
  const moving = !e.paused && e.currentTime !== wdLast
  wdLast = e.currentTime
  if (moving) {
    wdStuckAt = 0
    wdFix = 0
    return
  }
  if (!wdStuckAt) wdStuckAt = t
  if (!now && t - wdStuckAt < 1000) return
  if (t - wdFix < 900) return
  wdFix = t
  wdStats.resumes++
  if (e.ended || (isFinite(e.duration) && e.currentTime >= e.duration - 0.05)) e.currentTime = 0
  // stuck > 4 s while "playing" (dead decoder / network): reload the source at the same spot
  if (!e.paused && t - wdStuckAt > 4000 && e.src) {
    wdStats.reloads++
    const at = e.currentTime
    e.load()
    e.currentTime = at
  }
  void e.play().then(() => rampTo(a, level(a), 0.4)).catch(() => {
    /* needs a gesture: the next tap (onGesture → kick) resumes it */
  })
}

function loopTick() {
  watchdog()
  const ctx = peekAudioContext()
  // v24 watchdog: the active song ended / stopped on its own (missed 'ended', failed crossfade)
  const a = active
  if (a && started && a.el.ended && !a.swapping) onEnded(a, a.el)
  for (const d of decks) {
    if (noTwin || !d.routed || !ctx || d.swapping || d.el.paused) continue
    const e = d.el
    const dur = e.duration
    if (!isFinite(dur) || dur < LOOP_XF_S * 4) continue
    const left0 = dur - e.currentTime
    const i = d.els.indexOf(e)
    const t = d.els[1 - i]
    const gi = d.sub[i]!
    const gt = d.sub[1 - i]!
    // what comes after this song: the next track in the scene's playlist, else the same song again
    const next = nextTrack(d)
    const nextSrc = next === d.track ? e.src : new URL(pickSrc(next!), location.href).href
    // v24: only fetch the twin / next song in the last ~25 s (it used to download with the first copy)
    if (t.src !== nextSrc && left0 < LOOP_XF_S + 25) {
      t.src = nextSrc
      t.onerror = () => {
        // a playlist file that can't load (missing song 2): drop it from the rotation for this session
        if (next && next !== d.track) badTracks.add(next.id)
        t.onerror = null
      }
    }
    // playlist: the song must not loop on its own — if the crossfade can't happen, 'ended' switches
    if (next !== d.track) {
      e.loop = false
      // ('ended' → onEnded() → hardNext() is wired once per element in makeDeck)
    }
    // warm the twin's decoder a few seconds ahead (silent: its sub-gain is 0)
    if (left0 < LOOP_XF_S + 4 && left0 > LOOP_XF_S + 1.5 && !d.warm) {
      d.warm = true
      gt.gain.setValueAtTime(0, ctx.currentTime)
      t.currentTime = 0
      void t.play().then(() => { t.pause(); t.currentTime = 0 }).catch(() => {})
      continue
    }
    if (left0 > LOOP_XF_S + 0.4) continue
    d.swapping = true
    t.loop = true
    t.currentTime = 0
    gt.gain.setValueAtTime(0, ctx.currentTime)
    const wrapsBefore = e.currentTime
    void t
      .play()
      .then(() => {
        if (e.currentTime < wrapsBefore - 1 || e.paused) {
          // the original already wrapped on its own: keep it, drop the twin
          t.pause()
          d.swapping = false
          d.warm = false
          return
        }
        e.loop = false
        const now = ctx.currentTime
        const left = Math.max(0.15, Math.min(LOOP_XF_S, e.duration - e.currentTime))
        gt.gain.cancelScheduledValues(now)
        gt.gain.setValueAtTime(0, now)
        gt.gain.linearRampToValueAtTime(1, now + left)
        gi.gain.cancelScheduledValues(now)
        gi.gain.setValueAtTime(1, now)
        gi.gain.linearRampToValueAtTime(0, now + left)
        d.el = t
        if (next && next !== d.track) {
          const seen = playedIds.has(next.id)
          playedIds.add(next.id)
          d.track = next
          announce(next, !seen)
        }
        e.onended = null
        setTimeout(() => {
          e.pause()
          e.loop = true
          e.currentTime = 0
          d.swapping = false
          d.warm = false
        }, left * 1000 + 150)
      })
      .catch(() => {
        d.swapping = false
      })
  }
}

function route(d: Deck) {
  if (d.routed) return
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    d.gain = ctx.createGain()
    d.gain.gain.value = 0
    d.gain.connect(ctx.destination)
    d.els.forEach((e, i) => {
      const g = ctx.createGain()
      g.gain.value = e === d.el ? 1 : 0
      g.connect(d.gain!)
      ctx.createMediaElementSource(e).connect(g)
      d.sub[i] = g
    })
    d.routed = true
    for (const e of d.els) e.volume = 1
  } catch {
    d.routed = false
  }
}

function ensureDecks() {
  if (!decks.length && typeof document !== 'undefined') {
    decks = [makeDeck(), makeDeck()]
    onGesture(onTap)
    onVisibility(onVis)
    setInterval(loopTick, 150)
    // QA: jump the playing song near its end to hear / test the loop seam
    ;(globalThis as unknown as { __ARCADE_MUSIC_SEEK?: (t: number) => void }).__ARCADE_MUSIC_SEEK = (t: number) => {
      if (active) active.el.currentTime = t < 0 ? active.el.duration + t : t
    }
    ;(globalThis as unknown as { __ARCADE_MUSIC?: unknown }).__ARCADE_MUSIC = musicDebugState
    // QA (v24): simulate the iOS failure — no twin crossfade and no native loop — to test the 'ended' fallback
    ;(globalThis as unknown as { __ARCADE_MUSIC_BREAK?: () => void }).__ARCADE_MUSIC_BREAK = () => {
      noTwin = true
      for (const d of decks) for (const e of d.els) e.loop = false
    }
    // QA (v25): simulate an iOS interruption — the system pauses the song and suspends the context
    ;(globalThis as unknown as { __ARCADE_MUSIC_INTERRUPT?: () => void }).__ARCADE_MUSIC_INTERRUPT = () => {
      active?.el.pause()
      void peekAudioContext()?.suspend()
    }
  }
}

function level(d: Deck): number {
  if (!d.track || muted) return 0
  return ducked ? d.track.duckedLevel : d.track.level
}

function rampTo(d: Deck, to: number, seconds: number, pauseAfter = false) {
  if (d.pauseTimer) {
    clearTimeout(d.pauseTimer)
    d.pauseTimer = null
  }
  const ctx = peekAudioContext()
  if (d.routed && d.gain && ctx) {
    const g = d.gain.gain
    const now = ctx.currentTime
    g.cancelScheduledValues(now)
    g.setValueAtTime(g.value, now)
    g.linearRampToValueAtTime(to, now + seconds)
  } else {
    d.el.volume = Math.max(0, Math.min(1, to))
  }
  if (pauseAfter) {
    d.pauseTimer = setTimeout(() => {
      d.pauseTimer = null
      if (d !== active || muted || document.hidden) pauseDeck(d)
    }, seconds * 1000 + 80)
  }
}

/** Try to (re)start the active deck. Safe to call often; must be in a gesture the first time on iOS. */
function kick() {
  const d = active
  if (d && d.track && !muted && !unlocked && !document.hidden) return tryAutoplay(d)
  if (!d || !d.track || muted || !unlocked || document.hidden) return
  route(d)
  prime(d)
  if (d.el.paused) {
    if (d.routed && d.gain) {
      const ctx = peekAudioContext()
      if (ctx) {
        d.gain.gain.cancelScheduledValues(ctx.currentTime)
        d.gain.gain.setValueAtTime(0, ctx.currentTime)
      }
    } else d.el.volume = 0
    const p = d.el.play()
    started = true
    void p?.catch(() => {
      /* blocked — the next tap retries via onGesture */
    })
  }
  rampTo(d, level(d), MUSIC_FADE_IN_S)
}

/** v25: before any gesture, try plain (unrouted) autoplay — desktop / Android with engagement allow it.
 *  Blocked (iOS): nothing happens and the very first touch / pointer / key anywhere starts it. */
let autoTried = ''
function tryAutoplay(d: Deck) {
  if (d.routed || !d.el.paused || autoTried === d.el.src) return
  autoTried = d.el.src
  d.el.volume = level(d)
  void d.el
    .play()
    .then(() => {
      started = true
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('arcade-music-autoplay'))
    })
    .catch(() => {
      autoTried = ''
    })
}

function onTap() {
  unlocked = true
  getAudioContext()
  kick()
}

function onVis(hidden: boolean) {
  if (hidden) {
    for (const d of decks) if (!d.el.paused) rampTo(d, 0, 0.12, true)
  } else {
    kick()
  }
}

/** Mark audio as user-unlocked (call inside a tap handler). */
export function unlockMusic() {
  ensureDecks()
  onTap()
}

/** Switch scenes; crossfades if the track changes. */
export function setMusicScene(next: MusicScene) {
  ensureDecks()
  if (!decks.length) return
  scene = next
  const track = SCENE_TRACKS[next]
  if (active && active.track?.id === track?.id) {
    kick()
    return
  }
  const outgoing = active
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('arcade-music-scene', { detail: { scene: next, title: track?.title ?? '' } }))
  sceneLog.push({
    t: Math.round(performance.now()),
    scene: next,
    from: outgoing?.track?.id ?? null,
    to: track?.id ?? null,
    path: location.pathname,
  })
  if (outgoing && !outgoing.el.paused) rampTo(outgoing, 0, MUSIC_FADE_OUT_S, true)
  if (!track) {
    active = null
    return
  }
  const d = decks.find((x) => x !== outgoing) ?? decks[0]
  if (d.pauseTimer) {
    clearTimeout(d.pauseTimer)
    d.pauseTimer = null
  }
  pauseDeck(d)
  if (d.track?.id !== track.id) {
    d.track = track
    const src = pickSrc(track)
    // restart on the first element at full sub-gain
    d.el = d.els[0]
    for (let i = 0; i < 2; i++) {
      if (i === 0) d.els[i].src = src
      d.sub[i]?.gain.setValueAtTime(i === 0 ? 1 : 0, peekAudioContext()?.currentTime ?? 0)
    }
    // v24: the twin stays empty until the loop point nears (no double download at start)
    d.els[1].removeAttribute('src')
    d.els[1].preload = 'none'
    d.primed = false
  }
  ducked = false
  active = d
  playedIds.add(track.id)
  kick()
}

export function setMusicDucked(on: boolean) {
  ducked = on
  if (active && !active.el.paused) rampTo(active, level(active), 0.5)
}

export function setMusicMuted(m: boolean) {
  muted = m
  if (m) {
    for (const d of decks) if (!d.el.paused) rampTo(d, 0, 0.15, true)
  } else {
    kick()
  }
}

export function musicDebugState() {
  const a = active
  return {
    scene,
    track: a?.track?.id ?? null,
    src: a?.el.currentSrc || null,
    playing: Boolean(a && !a.el.paused),
    routed: a?.routed ?? false,
    gain: a?.gain ? Number(a.gain.gain.value.toFixed(3)) : null,
    ducked,
    muted,
    unlocked,
    started,
    ctxState: peekAudioContext()?.state ?? null,
    decksPlaying: decks.filter((d) => !d.el.paused).map((d) => d.track?.id ?? null),
    time: a ? Number(a.el.currentTime.toFixed(2)) : null,
    duration: a && isFinite(a.el.duration) ? a.el.duration : null,
    loopEl: a ? a.els.indexOf(a.el) : null,
    watchdog: { ...wdStats },
  }
}

/** v24: warm the HTTP cache for a song that may play next (card highlighted) — silent, low priority,
 *  never touches playback. */
const prefetched = new Set<string>()
export function prefetchSceneMusic(next: MusicScene) {
  const t = SCENE_TRACKS[next]
  if (!t || typeof window === 'undefined') return
  const src = pickSrc(t)
  if (prefetched.has(src) || (active?.track?.id === t.id)) return
  prefetched.add(src)
  try {
    void fetch(src, { priority: 'low' } as RequestInit).then((r) => r.arrayBuffer()).catch(() => prefetched.delete(src))
  } catch {
    /* ignore */
  }
}
