/**
 * Per-scene music slots. Exactly one track plays at a time; navigating between
 * scenes crossfades. A `null` slot means silence for that scene.
 *
 * Owner rule: "ZENO 5" (court-vision-theme) plays ONLY inside Court Vision.
 */
export type MusicScene = 'lobby' | 'court-vision' | 'fifth-run' | 'street-shift' | 'nova-slide' | 'nova-5' | 'fifth-frame' | 'none'

export type MusicTrack = {
  id: string
  title: string
  /** Candidate sources, best first; the first one the browser can play wins. */
  sources: { src: string; type: string }[]
  /** Gain while playing (tracks are normalized to about −16 LUFS). */
  level: number
  /** Gain under end screens / overlays. */
  duckedLevel: number
}

const BASE = import.meta.env.BASE_URL
/** v25: audio is served immutable (1 year) — bump AV whenever a song file changes */
const AV = '?v=25'

/** "ZENO 5" — Jenks / Fifth Dimension Imperial. Court Vision only. */
export const COURT_VISION_THEME: MusicTrack = {
  id: 'court-vision-theme',
  title: 'Jenks - Zeno 5',
  sources: [
    { src: `${BASE}audio/court-vision-theme.m4a${AV}`, type: 'audio/mp4; codecs="mp4a.40.2"' },
    { src: `${BASE}audio/court-vision-theme.mp3${AV}`, type: 'audio/mpeg' },
  ],
  level: 0.4,
  duckedLevel: 0.24,
}

/** Lobby / home screen — "We Outside" (Jenks / Fifth Dimension Imperial). */
export const LOBBY_THEME: MusicTrack = {
  id: 'lobby-theme',
  title: 'Jenks ft. Val Underwood - We Outside',
  sources: [
    { src: `${BASE}audio/lobby-theme.m4a${AV}`, type: 'audio/mp4; codecs="mp4a.40.2"' },
    { src: `${BASE}audio/lobby-theme.mp3${AV}`, type: 'audio/mpeg' },
  ],
  level: 0.35,
  // Fifth Glide ducks on its end screen; the lobby song keeps its level on the how-to.
  duckedLevel: 0.35,
}

/** Fifth Glide gameplay — "Thousand Yard Stare" (Jenks / Fifth Dimension Imperial). */
export const FIFTH_GLIDE_THEME: MusicTrack = {
  id: 'fifth-glide-theme',
  title: 'Jenks - Thousand Yard Stare',
  sources: [
    { src: `${BASE}audio/fifth-glide-theme.m4a${AV}`, type: 'audio/mp4; codecs="mp4a.40.2"' },
    { src: `${BASE}audio/fifth-glide-theme.mp3${AV}`, type: 'audio/mpeg' },
  ],
  level: 0.38,
  duckedLevel: 0.22,
}

/**
 * Fifth Glide song rotation — edit this list to add songs. The run starts on the first one; when a
 * run outlasts a song the next one "unlocks" (Now Playing toast) and the list keeps alternating.
 * A single entry just loops. Drop the file in public/audio/ and add an entry, e.g.:
 *   { id: 'fifth-glide-2', title: 'Jenks - <title>', file: 'fifth-glide-2' }  (needs .m4a + .mp3)
 */
const FIFTH_GLIDE_SONGS: { id: string; title: string; file: string }[] = [
  // song 2 (Oct 2026): "Wattup Yo" — unlocks when a run outlasts Thousand Yard Stare
  { id: 'fifth-glide-2', title: 'Jenks - Wattup Yo', file: 'fifth-glide-2' },
]

const fromFile = (x: { id: string; title: string; file: string }): MusicTrack => ({
  id: x.id,
  title: x.title,
  sources: [
    { src: `${BASE}audio/${x.file}.m4a${AV}`, type: 'audio/mp4; codecs="mp4a.40.2"' },
    { src: `${BASE}audio/${x.file}.mp3${AV}`, type: 'audio/mpeg' },
  ],
  level: FIFTH_GLIDE_THEME.level,
  duckedLevel: FIFTH_GLIDE_THEME.duckedLevel,
})



/** Nova 5 gameplay — "Eucalyptus Vibes" (Jenks / Fifth Dimension Imperial). */
export const STREET_SHIFT_THEME: MusicTrack = {
  id: 'street-shift-theme',
  title: 'Jenks - Eucalyptus Vibes',
  sources: [
    { src: `${BASE}audio/street-shift-theme.m4a${AV}`, type: 'audio/mp4; codecs="mp4a.40.2"' },
    { src: `${BASE}audio/street-shift-theme.mp3${AV}`, type: 'audio/mpeg' },
  ],
  level: 0.38,
  duckedLevel: 0.22,
}

/** per-scene rotations (a scene without one just loops its SCENE_TRACKS song) */
export const SCENE_PLAYLISTS: Partial<Record<MusicScene, MusicTrack[]>> = {
  'fifth-run': [FIFTH_GLIDE_THEME, ...FIFTH_GLIDE_SONGS.map(fromFile)],
}

export const SCENE_TRACKS: Record<MusicScene, MusicTrack | null> = {
  lobby: LOBBY_THEME,
  'court-vision': COURT_VISION_THEME,
  'fifth-run': FIFTH_GLIDE_THEME,
  'street-shift': STREET_SHIFT_THEME,
  'nova-slide': STREET_SHIFT_THEME,
  'nova-5': STREET_SHIFT_THEME,
  'fifth-frame': STREET_SHIFT_THEME,
  none: null,
}

export const MUSIC_FADE_IN_S = 1
export const MUSIC_FADE_OUT_S = 0.8

/**
 * v2: sound defaults ON. The old key ('fd_arcade_music_muted') is ignored so
 * anyone muted by an earlier build hears music again; only a deliberate mute
 * after this change is remembered.
 */
export const MUTE_STORAGE_KEY = 'fd_arcade_sound_muted_v2'
