import { useState } from 'react'
import { ensureSession, getCachedPlayer, handleErrorCopy, setHandle } from '../core/session'
import './social.css'

/** Quick, skippable "who's shooting?" prompt. Skip = play as an auto Rookie#### guest. */
export default function HandlePrompt({
  title = 'Who’s shooting?',
  subtitle,
  cta = 'Let’s go',
  onDone,
  compact = false,
}: {
  title?: string
  subtitle?: string
  cta?: string
  onDone: (handle: string | null) => void
  compact?: boolean
}) {
  const cached = getCachedPlayer()
  const [draft, setDraft] = useState(cached && !cached.is_guest ? cached.handle : '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const h = draft.trim().replace(/[^A-Za-z0-9_]/g, '').slice(0, 16)
    if (h.length < 3) {
      setErr('3–16 letters, numbers, or _')
      return
    }
    setBusy(true)
    setErr(null)
    const existing = getCachedPlayer()
    if (existing && existing.handle === h) {
      setBusy(false)
      onDone(h)
      return
    }
    if (!existing) {
      const p = await ensureSession(h)
      if (p && p.handle.toLowerCase() === h.toLowerCase()) {
        setBusy(false)
        onDone(p.handle)
        return
      }
    }
    const r = await setHandle(h)
    setBusy(false)
    if (!r.ok) {
      setErr(handleErrorCopy(r.error))
      return
    }
    onDone(r.player.handle)
  }

  const skip = async () => {
    setBusy(true)
    const p = await ensureSession()
    setBusy(false)
    onDone(p?.handle ?? null)
  }

  return (
    <form
      className={`soc-handle${compact ? ' soc-handle--compact' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <label className="soc-handle__label" htmlFor="soc-handle-input">
        {title}
      </label>
      {subtitle ? <p className="soc-handle__sub">{subtitle}</p> : null}
      <input
        id="soc-handle-input"
        className="soc-handle__input"
        maxLength={16}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="Your handle"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      {err ? <p className="soc-handle__err">{err}</p> : <p className="soc-handle__hint">3–16 · letters, numbers, _</p>}
      <div className="soc-handle__row">
        <button type="submit" className="ffa-btn ffa-btn--primary" disabled={busy}>
          {busy ? '…' : cta}
        </button>
        <button type="button" className="soc-handle__skip" onClick={() => void skip()} disabled={busy}>
          Skip
        </button>
      </div>
    </form>
  )
}
