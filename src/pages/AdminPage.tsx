import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Contest } from '../arcade/core/arcadeApi'
import '../arcade/admin/admin.css'

type AdminWinner = {
  place: number
  player_id: string
  handle: string
  handle_at_win: string
  is_guest: boolean
  score: number
  claim_code: string
  contacted_at: string | null
  admin_note: string | null
}
type AdminContest = Omit<Contest, 'winners'> & {
  published: boolean
  auto_announce: boolean
  entrants: number
  winners: AdminWinner[]
}
type AdminList = { server_now: string; games: { id: string; title: string; label: string }[]; contests: AdminContest[] }
type BoardRow = { rank: number; player_id: string; handle: string; is_guest: boolean; score: number; created_at: string }

const KEY_STORE = 'fd_arcade_admin_key'
const TZ = 'America/New_York'

function readKey(): string {
  try {
    return sessionStorage.getItem(KEY_STORE) ?? localStorage.getItem(KEY_STORE) ?? ''
  } catch {
    return ''
  }
}

async function adminApi<T>(key: string, action: string, init: { body?: unknown; query?: Record<string, string> } = {}) {
  const qs = init.query ? `?${new URLSearchParams(init.query).toString()}` : ''
  const res = await fetch(`/api/arcade/${action}${qs}`, {
    method: init.body !== undefined ? 'POST' : 'GET',
    headers: { 'X-Arcade-Admin': key, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  }).catch(() => null)
  if (!res) return { ok: false as const, error: 'network_error', status: 0 }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || json.ok === false) return { ok: false as const, error: String(json.error ?? `http_${res.status}`), status: res.status }
  return { ok: true as const, data: json as T }
}

// ── Eastern-time helpers for <input type="datetime-local"> ──
function etParts(ms: number) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second }
}
function toEtInput(iso: string): string {
  const p = etParts(Date.parse(iso))
  const z = (n: number) => String(n).padStart(2, '0')
  return `${p.y}-${z(p.mo)}-${z(p.d)}T${z(p.h)}:${z(p.mi)}`
}
function fromEtInput(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v)
  if (!m) return null
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  let t = wall
  for (let i = 0; i < 2; i++) {
    const p = etParts(t)
    const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s)
    t = wall - (asUtc - t)
  }
  return new Date(t).toISOString()
}
const etLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET'

const STATUS_LABEL: Record<string, string> = { upcoming: 'Upcoming', live: 'Live', ended: 'Ended', winners_announced: 'Winners announced' }
const ERRORS: Record<string, string> = {
  forbidden: 'Wrong admin key.',
  misconfigured: 'Admin key is not configured on the server.',
  invalid_title: 'Name must be 3–80 characters.',
  invalid_game: 'Pick a game.',
  invalid_dates: 'End must be after start (max 120 days).',
  invalid_prize: 'Prize is required (≤200 chars).',
  invalid_prize_image: 'Prize image must be an https:// URL.',
  invalid_rules: 'Rules are too long.',
  invalid_winner_count: 'Winners must be 1–5.',
  contest_locked: 'Winners are announced (or the contest started) — the window, game and winner count are locked.',
  contest_not_started: 'The contest hasn’t started yet.',
  contest_not_ended: 'The contest hasn’t ended yet.',
  contest_already_announced: 'Winners were already announced.',
  network_error: 'Network error — try again.',
}
const errText = (e: string) => ERRORS[e] ?? `Error: ${e}`

type Draft = {
  id?: string
  title: string
  game_id: string
  starts: string
  ends: string
  prize_text: string
  prize_image_url: string
  rules_text: string
  how_to_claim: string
  winner_count: number
  auto_announce: boolean
  published: boolean
  is_test: boolean
}

function newDraft(games: AdminList['games']): Draft {
  const start = Date.now() + 3600_000
  return {
    title: '',
    game_id: games[0]?.id ?? 'court-vision',
    starts: toEtInput(new Date(Math.ceil(start / 3600_000) * 3600_000).toISOString()),
    ends: toEtInput(new Date(Math.ceil(start / 3600_000) * 3600_000 + 7 * 86400_000).toISOString()),
    prize_text: '',
    prize_image_url: '',
    rules_text: '',
    how_to_claim: '',
    winner_count: 1,
    auto_announce: true,
    published: true,
    is_test: false,
  }
}
function draftOf(c: AdminContest): Draft {
  return {
    id: c.id,
    title: c.title,
    game_id: c.game_id,
    starts: toEtInput(c.starts_at),
    ends: toEtInput(c.ends_at),
    prize_text: c.prize_text,
    prize_image_url: c.prize_image_url ?? '',
    rules_text: c.rules_text,
    how_to_claim: c.how_to_claim,
    winner_count: c.winner_count,
    auto_announce: c.auto_announce,
    published: c.published,
    is_test: c.is_test,
  }
}

export default function AdminPage() {
  const [key, setKey] = useState(readKey)
  const [data, setData] = useState<AdminList | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [boardFor, setBoardFor] = useState<AdminContest | null>(null)
  const [board, setBoard] = useState<BoardRow[] | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Arcade admin · Fifth Floor'
    const m = document.createElement('meta')
    m.name = 'robots'
    m.content = 'noindex, nofollow'
    document.head.appendChild(m)
    return () => m.remove()
  }, [])

  const load = useCallback(async (k: string) => {
    setBusy(true)
    const r = await adminApi<AdminList>(k, 'admin-contests')
    setBusy(false)
    if (!r.ok) {
      setErr(errText(r.error))
      if (r.status === 403) {
        setKey('')
        sessionStorage.removeItem(KEY_STORE)
        localStorage.removeItem(KEY_STORE)
      }
      return false
    }
    setErr(null)
    setData(r.data)
    return true
  }, [])

  useEffect(() => {
    if (key) void load(key)
  }, [key, load])

  const say = (m: string) => {
    setFlash(m)
    window.setTimeout(() => setFlash(null), 3500)
  }

  if (!key || !data) {
    return <KeyGate busy={busy} error={err} onUnlock={async (k, remember) => {
      const ok = await load(k)
      if (!ok) return
      ;(remember ? localStorage : sessionStorage).setItem(KEY_STORE, k)
      setKey(k)
    }} />
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!draft) return
    const starts = fromEtInput(draft.starts)
    const ends = fromEtInput(draft.ends)
    if (!starts || !ends) return setErr('Pick a start and end time.')
    setBusy(true)
    const r = await adminApi<{ contest: AdminContest }>(key, 'admin-save', {
      body: {
        contest: {
          id: draft.id,
          title: draft.title.trim(),
          game_id: draft.game_id,
          starts_at: starts,
          ends_at: ends,
          prize_text: draft.prize_text.trim(),
          prize_image_url: draft.prize_image_url.trim() || null,
          rules_text: draft.rules_text,
          how_to_claim: draft.how_to_claim.trim(),
          winner_count: draft.winner_count,
          auto_announce: draft.auto_announce,
          published: draft.published,
          is_test: draft.is_test,
        },
      },
    })
    setBusy(false)
    if (!r.ok) return setErr(errText(r.error))
    setErr(null)
    setDraft(null)
    say(draft.id ? 'Contest updated.' : 'Contest created.')
    void load(key)
  }

  const act = async (action: 'admin-end' | 'admin-announce', c: AdminContest) => {
    const q = action === 'admin-end' ? `End "${c.title}" now? Runs after this won’t count.` : `Announce winners for "${c.title}"? Winners get an alert with their claim code.`
    if (!window.confirm(q)) return
    setBusy(true)
    const r = await adminApi<{ alerts_created?: number }>(key, action, { body: { id: c.id } })
    setBusy(false)
    if (!r.ok) return setErr(errText(r.error))
    setErr(null)
    say(r.data.alerts_created ? `Done — ${r.data.alerts_created} winner alert(s) sent.` : 'Done.')
    void load(key)
  }

  const openBoard = async (c: AdminContest) => {
    setBoardFor(c)
    setBoard(null)
    const r = await adminApi<{ entries: BoardRow[] }>(key, 'admin-board', { query: { id: c.id } })
    if (r.ok) setBoard(r.data.entries)
    else setErr(errText(r.error))
  }

  const updateWinner = async (c: AdminContest, w: AdminWinner, contacted: boolean, note: string | null) => {
    const r = await adminApi(key, 'admin-winner', { body: { contestId: c.id, place: w.place, contacted, note } })
    if (!r.ok) return setErr(errText(r.error))
    say(contacted ? `Marked ${w.handle_at_win} as contacted.` : 'Saved.')
    void load(key)
  }

  const gameTitle = (id: string) => data.games.find((g) => g.id === id)?.title ?? id

  return (
    <div className="adm">
      <header className="adm__bar">
        <div>
          <p className="adm__eyebrow">Fifth Floor Arcade</p>
          <h1>Giveaways</h1>
        </div>
        <div className="adm__bar-actions">
          <button type="button" className="adm-btn adm-btn--ghost" onClick={() => void load(key)} disabled={busy}>
            ↻
          </button>
          <button
            type="button"
            className="adm-btn adm-btn--ghost"
            onClick={() => {
              sessionStorage.removeItem(KEY_STORE)
              localStorage.removeItem(KEY_STORE)
              setKey('')
              setData(null)
            }}
          >
            Lock
          </button>
        </div>
      </header>

      {err ? (
        <p className="adm__err" role="alert" onClick={() => setErr(null)}>
          {err}
        </p>
      ) : null}
      {flash ? <p className="adm__flash">{flash}</p> : null}

      {draft ? (
        <form className="adm-card adm-form" onSubmit={save}>
          <h2>{draft.id ? 'Edit contest' : 'New contest'}</h2>
          <label>
            Name
            <input value={draft.title} maxLength={80} required onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Court Vision Fall Giveaway" />
          </label>
          <label>
            Game
            <select value={draft.game_id} onChange={(e) => setDraft({ ...draft, game_id: e.target.value })}>
              {data.games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </label>
          <div className="adm-form__two adm-form__dates">
            <label>
              Starts (ET)
              <input type="datetime-local" value={draft.starts} required onChange={(e) => setDraft({ ...draft, starts: e.target.value })} />
            </label>
            <label>
              Ends (ET)
              <input type="datetime-local" value={draft.ends} required onChange={(e) => setDraft({ ...draft, ends: e.target.value })} />
            </label>
          </div>
          <label>
            Prize
            <input value={draft.prize_text} maxLength={200} required onChange={(e) => setDraft({ ...draft, prize_text: e.target.value })} placeholder="Signed tee + $50 store credit" />
          </label>
          <label>
            Prize image URL <small>optional, https</small>
            <input type="url" value={draft.prize_image_url} maxLength={600} onChange={(e) => setDraft({ ...draft, prize_image_url: e.target.value })} placeholder="https://…" />
          </label>
          {draft.prize_image_url.startsWith('https://') ? <img className="adm-form__img" src={draft.prize_image_url} alt="Prize preview" /> : null}
          <label>
            Rules
            <textarea rows={4} value={draft.rules_text} maxLength={4000} onChange={(e) => setDraft({ ...draft, rules_text: e.target.value })} placeholder="One winner. Best single run in the window. No purchase necessary…" />
          </label>
          <label>
            How to claim <small>shown in the winner alert</small>
            <input value={draft.how_to_claim} maxLength={500} onChange={(e) => setDraft({ ...draft, how_to_claim: e.target.value })} placeholder="DM @fifthdimension your claim code within 7 days." />
          </label>
          <div className="adm-form__two">
            <label>
              Winners
              <select value={draft.winner_count} onChange={(e) => setDraft({ ...draft, winner_count: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    Top {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="adm-form__checks">
              <label className="adm-check">
                <input type="checkbox" checked={draft.published} onChange={(e) => setDraft({ ...draft, published: e.target.checked })} /> Published
              </label>
              <label className="adm-check">
                <input type="checkbox" checked={draft.auto_announce} onChange={(e) => setDraft({ ...draft, auto_announce: e.target.checked })} /> Auto-announce
              </label>
              <label className="adm-check">
                <input type="checkbox" checked={draft.is_test} onChange={(e) => setDraft({ ...draft, is_test: e.target.checked })} /> Test only
              </label>
            </div>
          </div>
          <p className="adm-form__hint">
            Test-only contests are hidden from players (preview with <code>/arcade/?preview=contests</code>). Auto-announce reveals the winner and sends their alert as soon as the contest ends.
          </p>
          <div className="adm-form__actions">
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="submit" className="adm-btn" disabled={busy}>
              {busy ? 'Saving…' : draft.id ? 'Save changes' : 'Create contest'}
            </button>
          </div>
        </form>
      ) : boardFor ? (
        <section className="adm-card">
          <div className="adm-card__head">
            <h2>{boardFor.title}</h2>
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setBoardFor(null)}>
              ← Back
            </button>
          </div>
          <p className="adm-muted">
            Best run per player · {etLabel(boardFor.starts_at)} → {etLabel(boardFor.ends_at)}
          </p>
          {!board ? (
            <p className="adm-muted">Loading…</p>
          ) : board.length === 0 ? (
            <p className="adm-muted">No runs in the window yet.</p>
          ) : (
            <ol className="adm-board">
              {board.map((r) => (
                <li key={r.player_id} className={r.rank <= boardFor.winner_count ? 'is-win' : ''}>
                  <span>{r.rank}</span>
                  <strong>
                    {r.handle}
                    {r.is_guest ? <em>guest</em> : null}
                  </strong>
                  <b>{r.score.toLocaleString()}</b>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : (
        <>
          <button type="button" className="adm-btn adm-btn--wide" onClick={() => setDraft(newDraft(data.games))}>
            + New contest
          </button>
          {data.contests.length === 0 ? <p className="adm-muted adm-center">No contests yet.</p> : null}
          {data.contests.map((c) => (
            <article key={c.id} className={`adm-card adm-contest adm-contest--${c.status}`}>
              <div className="adm-card__head">
                <h2>{c.title}</h2>
                <span className={`adm-chip adm-chip--${c.status}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
              </div>
              <p className="adm-tags">
                <span>{gameTitle(c.game_id)}</span>
                {c.is_test ? <span className="adm-tag--test">Test</span> : null}
                {!c.published ? <span className="adm-tag--draft">Hidden</span> : null}
                {c.ended_early ? <span>Ended early</span> : null}
                <span>{c.entrants} player{c.entrants === 1 ? '' : 's'}</span>
              </p>
              <p className="adm-muted">
                {etLabel(c.starts_at)} → {etLabel(c.ends_at)}
              </p>
              <p className="adm-prize">
                {c.prize_image_url ? <img src={c.prize_image_url} alt="" /> : null}
                <span>{c.prize_text}</span>
              </p>
              {c.winners.length ? (
                <ul className="adm-winners">
                  {c.winners.map((w) => (
                    <WinnerRow key={w.place} w={w} onChange={(contacted, note) => void updateWinner(c, w, contacted, note)} />
                  ))}
                </ul>
              ) : null}
              <div className="adm-actions">
                <button type="button" className="adm-btn adm-btn--ghost" onClick={() => void openBoard(c)}>
                  Board
                </button>
                <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setDraft(draftOf(c))}>
                  Edit
                </button>
                {c.status === 'live' ? (
                  <button type="button" className="adm-btn adm-btn--warn" onClick={() => void act('admin-end', c)} disabled={busy}>
                    End now
                  </button>
                ) : null}
                {c.status === 'ended' ? (
                  <button type="button" className="adm-btn" onClick={() => void act('admin-announce', c)} disabled={busy}>
                    Announce winners
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </>
      )}
    </div>
  )
}

function WinnerRow({ w, onChange }: { w: AdminWinner; onChange: (contacted: boolean, note: string | null) => void }) {
  const [note, setNote] = useState(w.admin_note ?? '')
  return (
    <li className={w.contacted_at ? 'is-done' : ''}>
      <div className="adm-winners__top">
        <span className="adm-winners__place">#{w.place}</span>
        <strong>{w.handle_at_win}</strong>
        <span>{w.score.toLocaleString()}</span>
        <code>{w.claim_code}</code>
      </div>
      {w.handle !== w.handle_at_win ? <p className="adm-muted">Now playing as {w.handle}</p> : null}
      {w.is_guest ? <p className="adm-muted">Guest account — verify by claim code.</p> : null}
      <div className="adm-winners__row">
        <label className="adm-check">
          <input type="checkbox" checked={Boolean(w.contacted_at)} onChange={(e) => onChange(e.target.checked, note || null)} /> Contacted
          {w.contacted_at ? <small> {etLabel(w.contacted_at)}</small> : null}
        </label>
        <input className="adm-winners__note" value={note} maxLength={500} placeholder="Note (shipping, DM handle…)" onChange={(e) => setNote(e.target.value)} />
        <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => onChange(Boolean(w.contacted_at), note || null)} disabled={note === (w.admin_note ?? '')}>
          Save
        </button>
      </div>
    </li>
  )
}

function KeyGate({ busy, error, onUnlock }: { busy: boolean; error: string | null; onUnlock: (k: string, remember: boolean) => void }) {
  const [k, setK] = useState('')
  const [remember, setRemember] = useState(false)
  return (
    <div className="adm adm--gate">
      <form
        className="adm-card adm-gate"
        onSubmit={(e) => {
          e.preventDefault()
          if (k.trim()) onUnlock(k.trim(), remember)
        }}
      >
        <p className="adm__eyebrow">Fifth Floor Arcade</p>
        <h1>Admin</h1>
        <label>
          Admin key
          <input type="password" autoComplete="current-password" value={k} onChange={(e) => setK(e.target.value)} autoFocus />
        </label>
        <label className="adm-check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember on this device
        </label>
        {error ? <p className="adm__err">{error}</p> : null}
        <button type="submit" className="adm-btn adm-btn--wide" disabled={busy || !k.trim()}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  )
}
