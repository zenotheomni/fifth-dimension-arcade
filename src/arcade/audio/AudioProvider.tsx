import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { LOBBY_TRACK, MUTE_STORAGE_KEY } from './music'

type AudioCtx = {
  entered: boolean
  muted: boolean
  enterFloor: () => void
  toggleMute: () => void
  duck: (on: boolean) => void
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

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const duckRef = useRef(false)
  const [entered, setEntered] = useState(false)
  const [muted, setMuted] = useState(readMuted)

  useEffect(() => {
    const el = new Audio(LOBBY_TRACK.src)
    el.loop = true
    el.preload = 'auto'
    el.volume = LOBBY_TRACK.baseVolume
    audioRef.current = el
    return () => {
      el.pause()
      el.src = ''
      audioRef.current = null
    }
  }, [])

  const applyVolume = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    if (muted) {
      el.muted = true
      return
    }
    el.muted = false
    el.volume = duckRef.current
      ? LOBBY_TRACK.duckedVolume
      : LOBBY_TRACK.baseVolume
  }, [muted])

  useEffect(() => {
    applyVolume()
  }, [applyVolume])

  const enterFloor = useCallback(() => {
    setEntered(true)
    const el = audioRef.current
    if (!el) return
    applyVolume()
    void el.play().catch(() => {
      /* autoplay blocked until another gesture */
    })
  }, [applyVolume])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m
      try {
        localStorage.setItem(MUTE_STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const duck = useCallback(
    (on: boolean) => {
      duckRef.current = on
      applyVolume()
    },
    [applyVolume],
  )

  useEffect(() => {
    if (!entered || muted) return
    const el = audioRef.current
    if (el && el.paused) void el.play().catch(() => {})
  }, [entered, muted])

  const value = useMemo(
    () => ({
      entered,
      muted,
      enterFloor,
      toggleMute,
      duck,
      trackTitle: LOBBY_TRACK.title,
    }),
    [entered, muted, enterFloor, toggleMute, duck],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useArcadeAudio(): AudioCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useArcadeAudio requires AudioProvider')
  return ctx
}
