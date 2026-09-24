/**
 * ZENO RELOADED — track 01 "ZENO 5" (Jenks / Fifth Dimension Imperial)
 * Source: https://5dimperial.com homepage preview
 * Cached at public/audio/zeno-5.mp3 → /arcade/audio/zeno-5.mp3
 */
export const LOBBY_TRACK = {
  id: 'zeno-5',
  title: 'ZENO 5',
  album: 'ZENO RELOADED',
  /** Same-origin copy */
  src: `${import.meta.env.BASE_URL}audio/zeno-5.mp3`,
  /** Original Shopify theme asset */
  sourceUrl:
    'https://5dimperial.com/cdn/shop/t/6/assets/fd-preview-zeno-reloaded-01.mp3?v=140947369589967382371789499542',
  baseVolume: 0.32,
  duckedVolume: 0.14,
} as const

export const MUTE_STORAGE_KEY = 'fd_arcade_music_muted'
