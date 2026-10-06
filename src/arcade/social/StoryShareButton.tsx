import { useEffect, useRef, useState } from 'react'
import { track } from '../analytics'

type CardState = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Story-format (1080×1920) score card. Rendered server-side from the saved run id
 * (`/api/og?story=<scoreId>`), so it always matches what the board recorded. We
 * prefetch the PNG as soon as the run is saved so the share sheet opens inside the
 * tap gesture (iOS drops the gesture if we await a network request first).
 */
export default function StoryShareButton({ scoreId, score, className }: { scoreId: string | null; score: number; className?: string }) {
  const [state, setState] = useState<CardState>('idle')
  const [note, setNote] = useState<string | null>(null)
  const fileRef = useRef<File | null>(null)

  useEffect(() => {
    fileRef.current = null
    setNote(null)
    if (!scoreId) {
      setState('idle')
      return
    }
    let alive = true
    setState('loading')
    fetch(`/api/og?story=${encodeURIComponent(scoreId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`card_${res.status}`)
        const blob = await res.blob()
        if (!alive) return
        fileRef.current = new File([blob], `fifth-floor-arcade-${score}.png`, { type: 'image/png' })
        setState('ready')
      })
      .catch(() => alive && setState('error'))
    return () => {
      alive = false
    }
  }, [scoreId, score])

  const download = (file: File) => {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    setNote('Card saved — post it to your story.')
    track('arcade_story_card', { method: 'download' })
  }

  const share = async () => {
    const file = fileRef.current
    if (!file) return
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    const data: ShareData = { files: [file], title: 'Fifth Floor Arcade', text: `I scored ${score} on Fifth Floor Arcade` }
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share(data)
        setNote(null)
        track('arcade_story_card', { method: 'share' })
        return
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return
      }
    }
    download(file)
  }

  if (!scoreId) return null
  return (
    <>
      <button
        type="button"
        className={className ?? 'ffa-btn ffa-btn--secondary'}
        onClick={() => void share()}
        disabled={state !== 'ready'}
        aria-label="Share score card to your story"
      >
        {state === 'loading' ? 'Making your card…' : state === 'error' ? 'Card unavailable' : 'Share score'}
      </button>
      {note ? <p className="cvp-end__share">{note}</p> : null}
    </>
  )
}
