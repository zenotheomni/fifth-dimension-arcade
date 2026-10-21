/**
 * "Now Playing" tab: slides in when a scene's song starts (after the first tap, when sound can
 * actually play), stays ~4.5 s, then collapses to a small note button that re-opens it. Muted:
 * no slide-in, the button turns into a dim crossed note. Bottom-left, clear of every HUD.
 */
import { useEffect, useRef, useState } from 'react'
import './nowPlaying.css'
import { musicDebugState } from './sceneMusic'

const SHOW_MS = 4500

export default function NowPlaying({ title: sceneTitle, muted }: { title: string; muted: boolean }) {
  // the playlist can move on within a scene (Fifth Glide song 2): follow the player's announcements
  const [over, setOver] = useState<{ title: string; unlocked: boolean } | null>(null)
  useEffect(() => setOver(null), [sceneTitle])
  const title = over?.title ?? sceneTitle
  const unlocked = !!over?.unlocked
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shownFor = useRef('')

  // songs only start after the first gesture: wait for it before announcing
  useEffect(() => {
    if (armed) return
    const on = () => setArmed(true)
    window.addEventListener('pointerdown', on, { once: true, capture: true })
    window.addEventListener('keydown', on, { once: true, capture: true })
    window.addEventListener('arcade-music-autoplay', on, { once: true })
    // v25: autoplay may already be running (allowed before any gesture): arm as soon as it is
    const poll = setInterval(() => {
      if (musicDebugState().playing) on()
    }, 400)
    return () => {
      clearInterval(poll)
      window.removeEventListener('arcade-music-autoplay', on)
      window.removeEventListener('pointerdown', on, { capture: true })
      window.removeEventListener('keydown', on, { capture: true })
    }
  }, [armed])

  const show = (ms = SHOW_MS) => {
    setOpen(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(false), ms)
  }

  useEffect(() => {
    if (!armed || !title || muted || shownFor.current === title) return
    shownFor.current = title
    const t = setTimeout(() => show(unlocked ? 6000 : SHOW_MS), 450) // let the crossfade begin first
    return () => clearTimeout(t)
  }, [armed, title, muted, unlocked])

  // sit above any bottom bar on the page (lobby dock) instead of covering it
  const [lift, setLift] = useState(0)
  useEffect(() => {
    const measure = () => {
      let top = window.innerHeight
      for (const el of document.querySelectorAll<HTMLElement>('.ffa-dock, [data-np-avoid]')) {
        const r = el.getBoundingClientRect()
        if (r.height > 0 && r.bottom > window.innerHeight - 140) top = Math.min(top, r.top)
      }
      setLift(top < window.innerHeight ? window.innerHeight - top + 8 : 0)
    }
    measure()
    const id = setInterval(measure, 800)
    window.addEventListener('resize', measure)
    return () => {
      clearInterval(id)
      window.removeEventListener('resize', measure)
    }
  }, [])

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ title: string; unlocked: boolean }>).detail
      setOver(d)
    }
    window.addEventListener('arcade-music-track', on)
    return () => window.removeEventListener('arcade-music-track', on)
  }, [])

  useEffect(() => {
    if (muted) setOpen(false)
  }, [muted])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  if (!title || !armed) return null
  const [artist, song] = title.includes(' - ') ? [title.slice(0, title.indexOf(' - ')), title.slice(title.indexOf(' - ') + 3)] : ['', title]
  return (
    <div className={`fdnp${open ? ' is-open' : ''}${muted ? ' is-muted' : ''}${unlocked ? ' is-unlocked' : ''}`} data-testid="now-playing" style={lift ? { bottom: `${lift}px` } : undefined}>
      <button
        type="button"
        className="fdnp__btn"
        aria-label={muted ? `Sound off · ${title}` : `Now playing: ${title}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          if (open) setOpen(false)
          else show()
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="fdnp__icon" aria-hidden>
          {muted ? (
            <svg viewBox="0 0 24 24"><path d="M9 18V6l10-2v11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6.5" cy="18" r="2.5" fill="currentColor" /><path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          ) : (
            <span className="fdnp__bars"><i /><i /><i /><i /></span>
          )}
        </span>
        <span className="fdnp__text">
          <span className="fdnp__label">{muted ? 'Sound off' : unlocked ? '★ New song unlocked' : 'Now playing'}</span>
          <span className="fdnp__title">
            <b>{song}</b>
            {artist ? <span className="fdnp__artist">{artist}</span> : null}
          </span>
        </span>
      </button>
    </div>
  )
}
