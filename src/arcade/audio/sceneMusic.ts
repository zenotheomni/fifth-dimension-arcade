/**
 * Scene music manager: two decks (A/B) so a scene change crossfades the
 * outgoing track into the incoming one. Only one track is ever audible as the
 * "current" scene; the other deck only exists to fade out.
 *
 * Volume always goes through WebAudio gain (iOS ignores element.volume). If
 * WebAudio routing is unavailable we fall back to element.volume.
 */
import { getAudioContext, onGesture, onVisibility, peekAudioContext } from './audioContext'
import { MUSIC_FADE_IN_S, MUSIC_FADE_OUT_S, SCENE_TRACKS, type MusicScene, type MusicTrack } from './music'

type Deck = {
  el: HTMLAudioElement
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

/** Scene-change log for tests / debugging: window.__ARCADE_MUSIC_LOG */
type LogEntry = { t: number; scene: MusicScene; from: string | null; to: string | null; path: string }
const sceneLog: LogEntry[] = []
if (typeof window !== 'undefined') (window as unknown as { __ARCADE_MUSIC_LOG?: LogEntry[] }).__ARCADE_MUSIC_LOG = sceneLog

function pickSrc(t: MusicTrack): string {
  const probe = document.createElement('audio')
  for (const s of t.sources) if (probe.canPlayType(s.type)) return s.src
  return t.sources[t.sources.length - 1].src
}

function makeDeck(): Deck {
  const el = document.createElement('audio')
  el.loop = true
  el.preload = 'auto'
  el.setAttribute('playsinline', '')
  return { el, gain: null, routed: false, track: null, pauseTimer: null }
}

function route(d: Deck) {
  if (d.routed) return
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    d.gain = ctx.createGain()
    d.gain.gain.value = 0
    d.gain.connect(ctx.destination)
    ctx.createMediaElementSource(d.el).connect(d.gain)
    d.routed = true
  } catch {
    d.routed = false
  }
}

function ensureDecks() {
  if (!decks.length && typeof document !== 'undefined') {
    decks = [makeDeck(), makeDeck()]
    onGesture(onTap)
    onVisibility(onVis)
    ;(globalThis as unknown as { __ARCADE_MUSIC?: unknown }).__ARCADE_MUSIC = musicDebugState
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
      if (d !== active || muted || document.hidden) d.el.pause()
    }, seconds * 1000 + 80)
  }
}

/** Try to (re)start the active deck. Safe to call often; must be in a gesture the first time on iOS. */
function kick() {
  const d = active
  if (!d || !d.track || muted || !unlocked || document.hidden) return
  route(d)
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
  d.el.pause()
  if (d.track?.id !== track.id) {
    d.track = track
    d.el.src = pickSrc(track)
  }
  ducked = false
  active = d
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
  }
}
