import { useState } from 'react'
import { challengeShareText, copyText, gameTitle, sameSeedCopy, shareOrCopy } from '../core/challenges'
import { track } from '../analytics'
import AlertsOptIn from './AlertsOptIn'
import './social.css'

export default function SharePanel({
  handle,
  score,
  url,
  game = 'court-vision',
  rivalHandle,
  autoShareLabel = 'Send challenge',
}: {
  handle: string
  score: number
  url: string
  game?: string
  rivalHandle?: string | null
  autoShareLabel?: string
}) {
  const [note, setNote] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const text = challengeShareText(handle, score, game)

  const onShare = async () => {
    const how = await shareOrCopy(text, url)
    if (how === 'shared' || how === 'copied') setSent(true)
    setNote(how === 'shared' ? 'Sent!' : how === 'copied' ? 'Link copied — paste it in a text' : how === 'cancelled' ? null : 'Copy the link below')
    track('arcade_challenge_share', { how, game })
  }
  const onCopy = async () => {
    const ok = await copyText(`${text} ${url}`)
    if (ok) setSent(true)
    setNote(ok ? 'Link copied' : 'Select and copy the link')
  }

  return (
    <div className="soc-share">
      <p className="soc-share__eyebrow">{rivalHandle ? `Rematch sent to ${rivalHandle}` : 'Challenge ready'}</p>
      <div className="soc-share__card">
        <span className="soc-share__game">{gameTitle(game)} · Challenge</span>
        <span className="soc-share__handle">{handle}</span>
        <span className="soc-share__score">{score}</span>
        <span className="soc-share__q">Can you beat it?</span>
      </div>
      <p className="soc-share__copy">
        {sameSeedCopy(game, rivalHandle)}
      </p>
      <div className="soc-share__btns">
        <button type="button" className="ffa-btn ffa-btn--primary" onClick={() => void onShare()}>
          {autoShareLabel}
        </button>
        <button type="button" className="ffa-btn ffa-btn--ghost ffa-btn--sm" onClick={() => void onCopy()}>
          Copy link
        </button>
      </div>
      <p className="soc-share__url" aria-label="Challenge link">{url}</p>
      {note ? <p className="soc-share__note">{note}</p> : null}
      {sent || rivalHandle ? <AlertsOptIn reason="sent" /> : null}
    </div>
  )
}
