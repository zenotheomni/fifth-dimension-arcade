import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { MUTE_STORAGE_KEY, SCENE_TRACKS, type MusicScene } from './music'
import { setMusicDucked, setMusicMuted, setMusicScene, unlockMusic } from './sceneMusic'

type AudioCtx = {
  entered: boolean
  muted: boolean
  enterFloor: () => void
  toggleMute: () => void
  duck: (on: boolean) => void
  /**
   * Call from the tap that starts gameplay to swap the lobby song for the
   * game's song (no-op for games without a track). Pass null to release
   * (e.g. on unmount) and crossfade back to the lobby song.
   */
  claimScene: (scene: MusicScene | null) => void
  /** Title of the track for the current scene ('' when the slot is empty). */
  trackTitle: string
}

const Ctx = createContext<AudioCtx | null>(null)

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Every route defaults to the lobby song — including game routes (loading,
 * how-to) and challenge links. A game swaps in its own song only when play
 * actually starts, by calling claimScene(<game>) from the start tap.
 */
const DEFAULT_SCENE: MusicScene = 'lobby'

/** Games with no track of their own keep the lobby song. */
function resolveScene(claimed: MusicScene | null): MusicScene {
  if (claimed && SCENE_TRACKS[claimed]) return claimed
  return DEFAULT_SCENE
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const [entered, setEntered] = useState(false)
  const [muted, setMuted] = useState(readMuted)
  const [claimed, setClaimed] = useState<MusicScene | null>(null)
  const scene = resolveScene(claimed)

  useEffect(() => {
    setMusicMuted(muted)
  }, [muted])

  useEffect(() => {
    setMusicScene(scene)
  }, [scene])

  const enterFloor = useCallback(() => {
    setEntered(true)
    unlockMusic()
  }, [])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m
      try {
        localStorage.setItem(MUTE_STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      // apply now, inside the tap, so iOS lets the unmute start playback
      setMusicMuted(next)
      return next
    })
  }, [])

  const duck = useCallback((on: boolean) => setMusicDucked(on), [])
  const claimScene = useCallback((s: MusicScene | null) => {
    // apply synchronously so a claim made inside a tap can start playback on iOS
    setMusicScene(resolveScene(s))
    setClaimed(s)
  }, [])

  const value = useMemo(
    () => ({
      entered,
      muted,
      enterFloor,
      toggleMute,
      duck,
      claimScene,
      trackTitle: SCENE_TRACKS[scene]?.title ?? '',
    }),
    [entered, muted, enterFloor, toggleMute, duck, claimScene, scene],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useArcadeAudio(): AudioCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useArcadeAudio requires AudioProvider')
  return ctx
}
