import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { MUTE_STORAGE_KEY, SCENE_TRACKS, type MusicScene } from './music'
import { setMusicDucked, setMusicMuted, setMusicScene, unlockMusic } from './sceneMusic'

type AudioCtx = {
  entered: boolean
  muted: boolean
  enterFloor: () => void
  toggleMute: () => void
  duck: (on: boolean) => void
  /**
   * A mounted game claims its music scene (overrides the route default, e.g.
   * Court Vision inside /challenge/:id). Pass null to release.
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

/** Default music scene for a route (relative to the /arcade basename). */
function sceneForPath(path: string): MusicScene {
  if (path === '/' || path === '') return 'lobby'
  if (path.startsWith('/court-vision')) return 'court-vision'
  if (path.startsWith('/fifth-run') || path.startsWith('/fifth-glide')) return 'fifth-run'
  // challenge pages: the mounted game claims its scene; admin/claim/key stay quiet
  return 'none'
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [entered, setEntered] = useState(false)
  const [muted, setMuted] = useState(readMuted)
  const [claimed, setClaimed] = useState<MusicScene | null>(null)
  const scene: MusicScene = claimed ?? sceneForPath(pathname)

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
  const claimScene = useCallback((s: MusicScene | null) => setClaimed(s), [])

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
