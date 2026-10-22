/**
 * Scene music manager (v26).
 *
 * Two decks (A/B) so a scene change crossfades the outgoing song into the incoming one. Each deck has
 * ONE <audio> element and, once the song is decoded, ONE WebAudio AudioBufferSourceNode:
 *
 *  1. stream: the element starts the song fast (inside the first tap) through WebAudio gain;
 *  2. buffer: meanwhile the file is decoded; the deck then hands off (short crossfade, same position)
 *     to an AudioBufferSourceNode with loop=true and the element is paused for good.
 *
 * Why (iPhone): the old seamless loop crossfaded into a SECOND <audio> element at every wrap. iOS only
 * lets an element start inside a user gesture (or after one already started it), and an
 * element routed through WebAudio can go silent after interruptions while still "playing" — so after
 * the first loop the song went quiet and only the SFX (pure WebAudio) remained. A looping buffer
 * source never starts a new element, never needs a gesture to wrap and lives on the same
 * AudioContext as the SFX, so anything that silences the music silences the SFX too and is fixed by
 * the same context resume (every touch, visibilitychange, watchdog).
 *
 * Fifth Glide's rotation: buffer nodes don't loop there; when one ends the next song's buffer starts
 * (or the element streams it while it decodes). Volume always goes through WebAudio gain (iOS ignores
 * element.volume); element.volume is only used before any gesture (autoplay) or without WebAudio.
 */
import { getAudioContext, onGesture, onVisibility, peekAudioContext } from './audioContext'
import { MUSIC_FADE_IN_S, MUSIC_FADE_OUT_S, SCENE_PLAYLISTS, SCENE_TRACKS, type MusicScene, type MusicTrack } from './music'

type Deck = {
  el: HTMLAudioElement
  /** element → elGain → gain → destination; buffer node → bufGain → gain */
  elGain: GainNode | null
  bufGain: GainNode | null
  gain: GainNode | null
  routed: boolean
  track: MusicTrack | null
  mode: 'el' | 'buf'
  node: AudioBufferSourceNode | null
  /** ctx time at which buffer offset 0 would have played (for the current node) */
  nodeT0: number
  /** where to resume the buffer (s) when the node is restarted */
  offset: number
  pauseTimer: ReturnType<typeof setTimeout> | null
}

let decks: Deck[] = []
let active: Deck | null = null
let scene: MusicScene = 'none'
let ducked = false
let muted = false
let unlocked = false
let started = false
/** QA: never hand off to the buffer (element path only) — see __ARCADE_MUSIC_BREAK */
let noBuf = false

/** Scene-change log for tests / debugging: window.__ARCADE_MUSIC_LOG */
type LogEntry = { t: number; scene: MusicScene; from: string | null; to: string | null; path: string }
const sceneLog: LogEntry[] = []
if (typeof window !== 'undefined') (window as unknown as { __ARCADE_MUSIC_LOG?: LogEntry[] }).__ARCADE_MUSIC_LOG = sceneLog

function pickSrc(t: MusicTrack): string {
  const probe = document.createElement('audio')
  for (const s of t.sources) if (probe.canPlayType(s.type)) return s.src
  return t.sources[t.sources.length - 1].src
}

// ───────────────────────── decoded songs (max 2 kept: ~53 MB each) ─────────────────────────
const buffers = new Map<string, AudioBuffer>()
const loading = new Map<string, Promise<AudioBuffer | null>>()
const badTracks = new Set<string>()
const playedIds = new Set<string>()

function keepBuffers() {
  const keep = new Set(decks.map((d) => d.track?.id).filter(Boolean) as string[])
  for (const id of [...buffers.keys()]) if (buffers.size > 2 && !keep.has(id)) buffers.delete(id)
}

/** v28: decode hold — no fetch + decodeAudioData (big main-thread copy / GC) while a run is starting */
let holdUntil = 0
let holdTimer = 0
const held: (() => void)[] = []
function afterHold(fn: () => void): boolean {
  const wait = holdUntil - performance.now()
  if (wait <= 0) return false
  held.push(fn)
  if (!holdTimer)
    holdTimer = window.setTimeout(() => {
      holdTimer = 0
      for (const f of held.splice(0)) f()
    }, wait + 50)
  return true
}
/** hold background song decodes for ms (call at run start) */
export function holdMusicDecode(ms: number) {
  holdUntil = Math.max(holdUntil, performance.now() + ms)
}
/** decode a scene's first song now (call on a how-to / intro screen, before gameplay starts) */
export function prepareSceneMusic(scene: MusicScene) {
  const t = SCENE_TRACKS[scene]
  if (!t || noBuf || typeof window === 'undefined') return
  void loadBuffer(t)
}

function loadBuffer(t: MusicTrack): Promise<AudioBuffer | null> {
  const have = buffers.get(t.id)
  if (have) return Promise.resolve(have)
  const busy = loading.get(t.id)
  if (busy) return busy
  const ctx = peekAudioContext()
  if (!ctx || noBuf) return Promise.resolve(null)
  const p = fetch(pickSrc(t))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((ab) => new Promise<AudioBuffer>((res, rej) => ctx.decodeAudioData(ab, res, rej)))
    .then((b) => {
      buffers.set(t.id, b)
      keepBuffers()
      return b
    })
    .catch(() => null)
    .finally(() => loading.delete(t.id))
  loading.set(t.id, p)
  return p
}

// ───────────────────────── decks ─────────────────────────
function makeDeck(): Deck {
  const el = document.createElement('audio')
  el.loop = true
  el.preload = 'auto'
  el.setAttribute('playsinline', '')
  const d: Deck = { el, elGain: null, bufGain: null, gain: null, routed: false, track: null, mode: 'el', node: null, nodeT0: 0, offset: 0, pauseTimer: null }
  el.addEventListener('ended', () => onEnded(d))
  // iOS can pause / stall the element on its own: recover at once (stream phase only)
  for (const ev of ['pause', 'stalled', 'suspend', 'waiting', 'emptied'] as const)
    el.addEventListener(ev, () => {
      if (d === active && d.mode === 'el' && shouldPlay()) setTimeout(() => watchdog(true), ev === 'pause' ? 60 : 1000)
    })
  return d
}

function route(d: Deck) {
  if (d.routed) return
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    d.gain = ctx.createGain()
    d.gain.gain.value = 0
    d.gain.connect(ctx.destination)
    d.elGain = ctx.createGain()
    d.elGain.connect(d.gain)
    d.bufGain = ctx.createGain()
    d.bufGain.gain.value = 0
    d.bufGain.connect(d.gain)
    ctx.createMediaElementSource(d.el).connect(d.elGain)
    d.routed = true
    d.el.volume = 1
  } catch {
    d.routed = false
  }
}

function level(d: Deck): number {
  if (!d.track || muted) return 0
  return ducked ? d.track.duckedLevel : d.track.level
}

function isLoopTrack(d: Deck) {
  return nextTrack(d) === d.track
}

function nextTrack(d: Deck): MusicTrack | null {
  const list = (SCENE_PLAYLISTS[scene] ?? []).filter((x) => !badTracks.has(x.id))
  if (!d.track || list.length < 2) return d.track
  const i = list.findIndex((x) => x.id === d.track!.id)
  return i < 0 ? d.track : list[(i + 1) % list.length]
}

function announce(t: MusicTrack, unlocked: boolean) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('arcade-music-track', { detail: { title: t.title, unlocked } }))
}

function curTime(d: Deck): number {
  const ctx = peekAudioContext()
  if (d.mode === 'buf') {
    const b = d.track ? buffers.get(d.track.id) : null
    if (!d.node || !ctx || !b) return d.offset
    const t = ctx.currentTime - d.nodeT0
    return d.node.loop ? t % b.duration : Math.min(t, b.duration)
  }
  return d.el.currentTime
}

function stopNode(d: Deck, keepOffset = true) {
  if (!d.node) return
  if (keepOffset) d.offset = curTime(d)
  const n = d.node
  d.node = null
  n.onended = null
  try {
    n.stop()
  } catch {
    /* already stopped */
  }
  n.disconnect()
}

function startNode(d: Deck, offset: number, at = 0) {
  const ctx = peekAudioContext()
  const b = d.track ? buffers.get(d.track.id) : null
  if (!ctx || !b || !d.bufGain) return false
  stopNode(d, false)
  const n = ctx.createBufferSource()
  n.buffer = b
  n.loop = isLoopTrack(d)
  n.connect(d.bufGain)
  const off = ((offset % b.duration) + b.duration) % b.duration
  const when = Math.max(ctx.currentTime, at)
  n.start(when, off)
  d.nodeT0 = when - off
  d.node = n
  d.offset = off
  n.onended = () => {
    if (d.node !== n) return
    d.node = null
    d.offset = 0
    if (d === active && !muted) nextSong(d)
  }
  started = true
  return true
}

/** the stream (element) has the song; once decoded, move it onto a looping buffer node */
function handoff(d: Deck) {
  if (noBuf || !d.routed || !d.track) return
  const id = d.track.id
  // v28: not decoded yet and a run just started — stream for now, decode once the hot window is over
  if (!buffers.has(id) && afterHold(() => handoff(d))) return
  void loadBuffer(d.track).then((b) => {
    const ctx = peekAudioContext()
    if (!b || !ctx || d.mode !== 'el' || d.track?.id !== id || !d.bufGain || !d.elGain) return
    if (d.el.paused) {
      // not playing right now (scene faded out / hidden): just switch, kick() starts the node
      d.offset = d.el.currentTime
      d.mode = 'buf'
      d.elGain.gain.value = 0
      d.bufGain.gain.value = 1
      return
    }
    const lead = 0.08
    if (!startNode(d, d.el.currentTime + lead, ctx.currentTime + lead)) return
    const now = ctx.currentTime + lead
    const xf = 0.35
    d.bufGain.gain.cancelScheduledValues(0)
    d.bufGain.gain.setValueAtTime(0, now)
    d.bufGain.gain.linearRampToValueAtTime(1, now + xf)
    d.elGain.gain.cancelScheduledValues(0)
    d.elGain.gain.setValueAtTime(1, now)
    d.elGain.gain.linearRampToValueAtTime(0, now + xf)
    d.mode = 'buf'
    setTimeout(() => {
      if (d.mode === 'buf') d.el.pause()
    }, (lead + xf) * 1000 + 120)
  })
}

/** element ended (native loop failed, or a playlist song finished) */
function onEnded(d: Deck) {
  if (d !== active || d.mode !== 'el' || muted || !unlocked || document.hidden) return
  if (isLoopTrack(d)) {
    d.el.currentTime = 0
    void d.el.play().catch(() => {})
  } else nextSong(d)
}

/** playlist: move on to the next song on the same deck (buffer if decoded, else stream it) */
function nextSong(d: Deck) {
  const next = nextTrack(d)
  if (!next) return
  if (next !== d.track) {
    const seen = playedIds.has(next.id)
    playedIds.add(next.id)
    d.track = next
    announce(next, !seen)
  }
  if (buffers.has(next.id) && d.routed) {
    d.mode = 'buf'
    startNode(d, 0)
  } else {
    d.mode = 'el'
    if (d.elGain && d.bufGain) {
      d.elGain.gain.value = 1
      d.bufGain.gain.value = 0
    }
    d.el.src = pickSrc(next)
    d.el.loop = isLoopTrack(d)
    void d.el.play().catch(() => {})
    handoff(d)
  }
  // decode the one after this in the background so the next change is gapless-ish
  const after = nextTrack(d)
  if (after && after !== d.track && !afterHold(() => void loadBuffer(after))) void loadBuffer(after)
}

function pauseDeck(d: Deck) {
  stopNode(d)
  d.el.pause()
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

function deckPlaying(d: Deck) {
  return d.mode === 'buf' ? Boolean(d.node) : !d.el.paused
}

/** Try to (re)start the active deck. Safe to call often; must be in a gesture the first time on iOS. */
function kick() {
  const d = active
  if (d && d.track && !muted && !unlocked && !document.hidden) return tryAutoplay(d)
  if (!d || !d.track || muted || !unlocked || document.hidden) return
  route(d)
  if (!deckPlaying(d)) {
    if (d.routed && d.gain) {
      const ctx = peekAudioContext()
      if (ctx) {
        d.gain.gain.cancelScheduledValues(ctx.currentTime)
        d.gain.gain.setValueAtTime(0, ctx.currentTime)
      }
    } else d.el.volume = 0
    if (d.mode === 'buf' && startNode(d, d.offset)) {
      /* buffer running */
    } else {
      d.mode = 'el'
      if (d.elGain && d.bufGain) {
        d.elGain.gain.value = 1
        d.bufGain.gain.value = 0
      }
      d.el.loop = isLoopTrack(d)
      const p = d.el.play()
      started = true
      void p?.catch(() => {
        /* blocked — the next tap retries via onGesture */
      })
    }
  }
  if (d.mode === 'el') handoff(d)
  rampTo(d, level(d), MUSIC_FADE_IN_S)
}

/** before any gesture, try plain (unrouted) autoplay — desktop / Android with engagement allow it */
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

// ───────────────────────── watchdog ─────────────────────────
function shouldPlay(): boolean {
  const a = active
  return Boolean(a && a.track && started && unlocked && !muted && !document.hidden && !a.pauseTimer)
}

let wdLast = -1
let wdStuckAt = 0
let wdFix = 0
const wdStats = { resumes: 0, ctxResumes: 0, reloads: 0, nodeRestarts: 0 }
/** should play but: context not running → resume it; buffer node gone → restart it at its offset;
 *  element paused / not advancing for > 1 s → play it (reload if stuck > 4 s) */
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
  if (a.mode === 'buf') {
    if (!a.node) {
      wdStats.nodeRestarts++
      startNode(a, a.offset)
      rampTo(a, level(a), 0.4)
    }
    return
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
  if (!e.paused && t - wdStuckAt > 4000 && e.src) {
    wdStats.reloads++
    const at = e.currentTime
    e.load()
    e.currentTime = at
  }
  void e.play().then(() => rampTo(a, level(a), 0.4)).catch(() => {})
}

function tick() {
  watchdog()
  // stream phase of a playlist song: no native loop, 'ended' moves on
  const a = active
  if (a && a.mode === 'el') a.el.loop = isLoopTrack(a)
}

function ensureDecks() {
  if (!decks.length && typeof document !== 'undefined') {
    decks = [makeDeck(), makeDeck()]
    onGesture(onTap)
    onVisibility(onVis)
    setInterval(tick, 150)
    const g = globalThis as unknown as Record<string, unknown>
    // QA: jump the playing song to t (negative = from the end) to test the loop / playlist seam
    g.__ARCADE_MUSIC_SEEK = (t: number) => {
      const a = active
      if (!a) return
      if (a.mode === 'buf') {
        const b = a.track ? buffers.get(a.track.id) : null
        if (b) startNode(a, t < 0 ? b.duration + t : t)
      } else a.el.currentTime = t < 0 ? a.el.duration + t : t
    }
    g.__ARCADE_MUSIC = musicDebugState
    // QA: stay on the element path (no buffer hand-off) and disable its native loop → 'ended' fallback
    g.__ARCADE_MUSIC_BREAK = () => {
      noBuf = true
      for (const d of decks) {
        if (d.mode === 'buf' && d.node) {
          const off = curTime(d)
          stopNode(d)
          d.mode = 'el'
          if (d.elGain && d.bufGain) {
            d.elGain.gain.value = 1
            d.bufGain.gain.value = 0
          }
          d.el.currentTime = off
          void d.el.play().catch(() => {})
        }
        d.el.loop = false
      }
      // keep it broken: tick() would turn the loop back on
      setInterval(() => decks.forEach((d) => (d.el.loop = false)), 50)
    }
    // QA: simulate an iOS interruption — the system kills playback and suspends the context
    g.__ARCADE_MUSIC_INTERRUPT = () => {
      const a = active
      if (!a) return
      if (a.node) {
        a.offset = curTime(a)
        const n = a.node
        a.node = null
        n.onended = null
        try {
          n.stop()
        } catch {
          /* */
        }
      }
      a.el.pause()
      void peekAudioContext()?.suspend()
    }
  }
}

function onTap() {
  unlocked = true
  getAudioContext()
  kick()
}

function onVis(hidden: boolean) {
  if (hidden) {
    for (const d of decks) if (deckPlaying(d)) rampTo(d, 0, 0.12, true)
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
  // the playlist may have moved the active deck on to song 2: same scene → keep it
  if (active && track && (SCENE_PLAYLISTS[next] ?? []).some((x) => x.id === active!.track?.id)) {
    kick()
    return
  }
  const outgoing = active
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('arcade-music-scene', { detail: { scene: next, title: track?.title ?? '' } }))
  sceneLog.push({ t: Math.round(performance.now()), scene: next, from: outgoing?.track?.id ?? null, to: track?.id ?? null, path: location.pathname })
  if (outgoing && deckPlaying(outgoing)) rampTo(outgoing, 0, MUSIC_FADE_OUT_S, true)
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
    d.offset = 0
    d.mode = buffers.has(track.id) && d.routed ? 'buf' : 'el'
    if (d.elGain && d.bufGain) {
      d.elGain.gain.value = d.mode === 'el' ? 1 : 0
      d.bufGain.gain.value = d.mode === 'buf' ? 1 : 0
    }
    d.el.src = pickSrc(track)
  }
  ducked = false
  active = d
  playedIds.add(track.id)
  keepBuffers()
  kick()
}

export function setMusicDucked(on: boolean) {
  ducked = on
  if (active && deckPlaying(active)) rampTo(active, level(active), 0.5)
}

export function setMusicMuted(m: boolean) {
  muted = m
  if (m) {
    for (const d of decks) if (deckPlaying(d)) rampTo(d, 0, 0.15, true)
  } else {
    kick()
  }
}

export function musicDebugState() {
  const a = active
  const b = a?.track ? buffers.get(a.track.id) : null
  return {
    scene,
    track: a?.track?.id ?? null,
    mode: a?.mode ?? null,
    src: a?.el.currentSrc || null,
    playing: Boolean(a && deckPlaying(a)),
    routed: a?.routed ?? false,
    gain: a?.gain ? Number(a.gain.gain.value.toFixed(3)) : null,
    ducked,
    muted,
    unlocked,
    started,
    ctxState: peekAudioContext()?.state ?? null,
    decksPlaying: decks.filter((d) => deckPlaying(d)).map((d) => d.track?.id ?? null),
    time: a ? Number(curTime(a).toFixed(2)) : null,
    duration: b ? b.duration : a && isFinite(a.el.duration) ? a.el.duration : null,
    decoded: [...buffers.keys()],
    watchdog: { ...wdStats },
  }
}

/** Warm the HTTP cache for a song that may play next (card highlighted) — silent, low priority,
 *  never touches playback. */
const prefetched = new Set<string>()
export function prefetchSceneMusic(next: MusicScene) {
  const t = SCENE_TRACKS[next]
  if (!t || typeof window === 'undefined') return
  const src = pickSrc(t)
  if (prefetched.has(src) || active?.track?.id === t.id) return
  prefetched.add(src)
  try {
    void fetch(src, { priority: 'low' } as RequestInit).then((r) => r.arrayBuffer()).catch(() => prefetched.delete(src))
  } catch {
    /* ignore */
  }
}
