import { ImageResponse } from '@vercel/og'

/**
 * GET /api/og?id=<challengeId> — 1200×630 challenge card (handle, score, game, branding).
 * GET /api/og?story=<scoreId>  — 1080×1920 story score card (IG/TikTok stories).
 * Node.js runtime (the Edge runtime outside Next.js blocks @vercel/og's wasm compile).
 * Written with plain element objects (no JSX) so it needs no TSX config.
 */

type El = { type: string; props: Record<string, unknown> }
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): El => ({
  type,
  props: { style: { display: 'flex', ...style }, children: children.length === 1 ? children[0] : children },
})

type ChallengeView = {
  id: string
  target_score: number
  creator_handle: string
  game_id: string
  expired?: boolean
}

const GAME_TITLES: Record<string, string> = {
  'court-vision': 'Court Vision',
  'fifth-run': 'Fifth Glide',
}

async function loadChallenge(id: string): Promise<ChallengeView | null> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key || !/^[a-zA-Z0-9_-]{6,16}$/.test(id)) return null
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' }
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`
  try {
    const r = await fetch(`${url}/rest/v1/rpc/arcade_challenge_view`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_id: id }),
    })
    if (!r.ok) return null
    return (await r.json()) as ChallengeView
  } catch {
    return null
  }
}

async function loadFont(family: string, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`)
    ).text()
    const m = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)
    if (!m) return null
    const r = await fetch(m[1])
    return r.ok ? await r.arrayBuffer() : null
  } catch {
    return null
  }
}

async function render(req: Request): Promise<ImageResponse> {
  const { searchParams } = new URL(req.url)
  const id = (searchParams.get('id') ?? '').slice(0, 16)
  const c = id ? await loadChallenge(id) : null

  const handle = c?.creator_handle ?? 'Fifth Floor'
  const score = c ? String(c.target_score) : '—'
  const game = GAME_TITLES[c?.game_id ?? 'court-vision'] ?? 'Court Vision'
  const line = c ? `${handle} scored ${score} in ${game}.` : 'Step onto the Fifth Floor.'

  const bungeeText = `FIFTH FLOOR ARCADE${game.toUpperCase()}${handle.toUpperCase()}${score}CAN YOU BEAT IT?CHALLENGE VS 0123456789`
  const bungee = await loadFont('Bungee', bungeeText)
  const tagline = c?.game_id === 'fifth-run' ? 'Same run. Outrun the dark.' : 'Same court. 60 seconds.'
  const bodyText = `${line} ${tagline} PTS`
  const host = publicArcadeHost()
  const [inter, logo] = await Promise.all([
    loadFont('Inter:wght@600', `${bodyText} Play free at ${host}`),
    loadImageDataUrl(`${new URL(req.url).origin}/arcade/art/5d-logo-color.png`),
  ])
  const fonts: { name: string; data: ArrayBuffer; weight: 600 | 400; style: 'normal' }[] = []
  if (bungee) fonts.push({ name: 'Bungee', data: bungee, weight: 400, style: 'normal' })
  if (inter) fonts.push({ name: 'Body', data: inter, weight: 600, style: 'normal' })
  const body = inter ? 'Body' : 'sans-serif'
  const display = bungee ? 'Bungee' : 'sans-serif'

  const sunStripes = [0, 1, 2, 3, 4].map((i) =>
    h('div', { position: 'absolute', left: 0, right: 0, bottom: 18 + i * 26, height: 8 + i * 3, background: '#1a0b2e' }),
  )
  const gridLines = [0, 1, 2, 3, 4, 5].map((i) =>
    h('div', {
      position: 'absolute', left: 0, right: 0, top: 470 + i * i * 6 + i * 12, height: 2,
      background: 'rgba(255, 64, 160, 0.55)',
    }),
  )

  const root = h(
    'div',
    {
      width: '100%', height: '100%', position: 'relative', flexDirection: 'column',
      background: 'linear-gradient(180deg, #120624 0%, #2a0b45 45%, #5b1a5e 62%, #1a0b2e 63%, #0a0a12 100%)',
      color: '#f2f0ea', fontFamily: display, overflow: 'hidden',
    },
    // sun
    h(
      'div',
      {
        position: 'absolute', left: 760, top: 150, width: 340, height: 340, borderRadius: 340,
        background: 'linear-gradient(180deg, #ffd34d 0%, #ff8a3d 45%, #ff3d8b 100%)', overflow: 'hidden',
        boxShadow: '0 0 80px rgba(255, 90, 140, 0.6)',
      },
      ...sunStripes,
    ),
    ...gridLines,
    h('div', { position: 'absolute', left: 0, right: 0, top: 466, height: 4, background: '#00e5ff', boxShadow: '0 0 24px #00e5ff' }),
    // content
    h(
      'div',
      { position: 'absolute', left: 64, top: 52, right: 64, bottom: 48, flexDirection: 'column' },
      h('div', { fontSize: 30, letterSpacing: 6, color: '#ffc83c' }, 'FIFTH FLOOR ARCADE'),
      h(
        'div',
        { marginTop: 10, fontSize: 26, letterSpacing: 4, color: '#00e5ff', alignItems: 'center' },
        h('div', { padding: '4px 14px', border: '3px solid #00e5ff', borderRadius: 6, marginRight: 16 }, 'CHALLENGE'),
        game.toUpperCase(),
      ),
      h(
        'div',
        {
          marginTop: 36, fontSize: handle.length > 10 ? 64 : 80, color: '#ff4fa3', letterSpacing: 2,
          textShadow: '0 0 18px rgba(255, 79, 163, 0.85), 4px 4px 0 #1a0b2e',
        },
        handle.toUpperCase(),
      ),
      h(
        'div',
        { alignItems: 'flex-end', marginTop: 4 },
        h(
          'div',
          { fontSize: 168, lineHeight: 1, color: '#ffd34d', textShadow: '0 0 30px rgba(255, 200, 60, 0.7), 6px 6px 0 #3a1260' },
          score,
        ),
        h('div', { fontSize: 34, marginLeft: 18, marginBottom: 26, color: '#f2f0ea', fontFamily: body, fontWeight: 600 }, 'PTS'),
      ),
      h(
        'div',
        { marginTop: 'auto', fontSize: 40, color: '#ffffff', letterSpacing: 2, textShadow: '0 0 14px rgba(0,229,255,0.8)' },
        c ? 'CAN YOU BEAT IT?' : 'TAP TO PLAY',
      ),
      h('div', { marginTop: 8, fontSize: 26, fontFamily: body, fontWeight: 600, color: 'rgba(242,240,234,0.82)' }, `${line} ${tagline}`),
      h('div', { marginTop: 6, fontSize: 24, fontFamily: body, fontWeight: 600, color: '#00e5ff' }, `Play free at ${host}`),
    ),
    // brand badge (logo + wordmark) so shared links are recognisable
    h(
      'div',
      // One centred column: logo + wordmark share a centre line; width > wordmark so it never wraps.
      { position: 'absolute', right: 28, bottom: 26, width: 260, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
      logo
        ? h('div', { width: 112, height: 112, borderRadius: 56, boxShadow: '0 0 16px 3px rgba(255,200,60,0.4)', backgroundImage: 'radial-gradient(circle, rgba(255,244,222,0.72) 0%, rgba(255,226,160,0.5) 42%, rgba(255,200,60,0.2) 62%, rgba(255,200,60,0) 71%)' }, { type: 'img', props: { src: logo, width: 112, height: 112 } })
        : h('div', { height: 112 }),
      // paddingLeft = letterSpacing offsets the trailing letter-space so the glyphs sit optically centred.
      h('div', { marginTop: 8, fontSize: 17, letterSpacing: 2, paddingLeft: 2, whiteSpace: 'nowrap', justifyContent: 'center', textAlign: 'center', color: '#ffc83c', textShadow: '0 0 10px rgba(0,0,0,0.9)' }, 'FIFTH FLOOR ARCADE'),
    ),
  )

  return new ImageResponse(root as unknown as ConstructorParameters<typeof ImageResponse>[0], {
    width: 1200,
    height: 630,
    fonts,
  })
}


// ───────────────────────── story score card (1080×1920) ─────────────────────────

export type ScoreCard = {
  id: string
  handle: string
  score: number
  game_id: string
  game_title: string
  mode: string
  best_streak: number | null
  alltime_rank: number | null
  weekly_rank: number | null
  contest: { id: string; title: string; rank: number } | null
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' }
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`
  try {
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) })
    return r.ok ? ((await r.json()) as T) : null
  } catch {
    return null
  }
}

async function loadImageDataUrl(src: string): Promise<string | null> {
  try {
    const r = await fetch(src)
    if (!r.ok) return null
    const b = Buffer.from(await r.arrayBuffer())
    return `data:${r.headers.get('content-type') || 'image/png'};base64,${b.toString('base64')}`
  } catch {
    return null
  }
}

function publicArcadeHost(): string {
  const base = process.env.ARCADE_PUBLIC_BASE_URL || 'https://fifth-dimension-arcade.vercel.app/arcade'
  return base.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

async function renderStory(req: Request, scoreId: string): Promise<ImageResponse | null> {
  if (!/^[0-9a-f-]{36}$/i.test(scoreId)) return null
  const card = await rpc<ScoreCard>('arcade_score_card', { p_score_id: scoreId })
  if (!card) return null
  return renderStoryCard(card, new URL(req.url).origin)
}

/** Pure renderer (card data → 1080×1920 PNG); exported for local layout checks. */
export async function renderStoryCard(card: ScoreCard, origin: string): Promise<ImageResponse> {

  const handle = card.handle.toUpperCase()
  const score = String(card.score)
  const game = (card.game_title || GAME_TITLES[card.game_id] || 'Fifth Floor').toUpperCase()
  const modeLabel = card.mode === 'endless' ? 'ENDLESS' : card.mode === 'challenge' ? 'CHALLENGE' : '60 SECONDS'
  const chips: { text: string; color: string }[] = []
  if (card.contest) chips.push({ text: `#${card.contest.rank} IN CONTEST`, color: '#ffd34d' })
  if (card.alltime_rank) chips.push({ text: `#${card.alltime_rank} ALL-TIME`, color: '#ff4fa3' })
  else if (card.weekly_rank) chips.push({ text: `#${card.weekly_rank} THIS WEEK`, color: '#ff4fa3' })
  if (card.best_streak && card.best_streak > 1) chips.push({ text: `BEST COMBO ${card.best_streak}`, color: '#00e5ff' })
  const host = publicArcadeHost()

  const displayText = `FIFTH FLOOR ARCADE${game}${modeLabel}${handle}${score}${chips.map((c) => c.text).join('')}CAN YOU BEAT IT?PTS·0123456789`
  const [bungee, inter, emblem] = await Promise.all([
    loadFont('Bungee', displayText),
    loadFont('Inter:wght@600', `Play free at ${host} PTS`),
    loadImageDataUrl(`${origin}/arcade/art/5d-logo-color.png`),
  ])
  const fonts: { name: string; data: ArrayBuffer; weight: 600 | 400; style: 'normal' }[] = []
  if (bungee) fonts.push({ name: 'Bungee', data: bungee, weight: 400, style: 'normal' })
  if (inter) fonts.push({ name: 'Body', data: inter, weight: 600, style: 'normal' })
  const display = bungee ? 'Bungee' : 'sans-serif'
  const body = inter ? 'Body' : 'sans-serif'

  const HORIZON = 1330
  const sunD = 640
  const stripes = [0, 1, 2, 3, 4, 5].map((i) =>
    h('div', { position: 'absolute', left: 0, right: 0, top: sunD * 0.5 - 40 - i * 46, height: 10 + i * 4, background: '#1a0b2e' }),
  )
  const floorLines = [1, 2, 3, 4, 5, 6, 7, 8].map((i) =>
    h('div', {
      position: 'absolute', left: 0, right: 0, top: HORIZON + Math.round(i * i * 9 + i * 14), height: 3,
      background: 'rgba(255, 64, 160, 0.55)',
    }),
  )
  const rays = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((i) =>
    h('div', {
      position: 'absolute', left: 540 - 1, top: HORIZON, width: 3, height: 1100,
      background: 'rgba(255, 64, 160, 0.45)', transformOrigin: 'top center', transform: `rotate(${i * 11}deg)`,
    }),
  )
  const handleSize = handle.length > 12 ? 92 : handle.length > 9 ? 110 : 128
  const scoreSize = score.length > 4 ? 250 : score.length > 3 ? 300 : 360

  const root = h(
    'div',
    {
      width: '100%', height: '100%', position: 'relative', flexDirection: 'column', alignItems: 'center',
      background: `linear-gradient(180deg, #0c0418 0%, #1d0838 30%, #3d1158 55%, #6b1d63 ${Math.round((HORIZON / 1920) * 100)}%, #12081f ${Math.round((HORIZON / 1920) * 100) + 0.3}%, #07070c 100%)`,
      color: '#f2f0ea', fontFamily: display, overflow: 'hidden',
    },
    // stars
    ...[[120, 260], [930, 210], [210, 520], [860, 600], [80, 900], [990, 980], [470, 120], [700, 380]].map(([x, y], i) =>
      h('div', { position: 'absolute', left: x, top: y, width: i % 3 ? 6 : 9, height: i % 3 ? 6 : 9, borderRadius: 9, background: 'rgba(255,255,255,0.75)' }),
    ),
    // sun (upper half above the horizon)
    h(
      'div',
      { position: 'absolute', left: 540 - sunD / 2, top: HORIZON - sunD / 2, width: sunD, height: sunD / 2, overflow: 'hidden' },
      h(
        'div',
        {
          position: 'absolute', left: 0, top: 0, width: sunD, height: sunD, borderRadius: sunD,
          background: 'linear-gradient(180deg, #ffd34d 0%, #ff8a3d 35%, #ff3d8b 60%, #a1288a 100%)', overflow: 'hidden',
        },
        ...stripes,
      ),
    ),
    ...rays,
    ...floorLines,
    h('div', { position: 'absolute', left: 0, right: 0, top: HORIZON - 3, height: 6, background: '#00e5ff', boxShadow: '0 0 30px #00e5ff' }),
    // content column
    h(
      'div',
      { position: 'absolute', left: 60, right: 60, top: 150, bottom: 0, flexDirection: 'column', alignItems: 'center' },
      emblem
        ? h('div', { width: 260, height: 260, borderRadius: 130, boxShadow: '0 0 36px 6px rgba(255,200,60,0.4)', backgroundImage: 'radial-gradient(circle, rgba(255,244,222,0.72) 0%, rgba(255,226,160,0.5) 42%, rgba(255,200,60,0.2) 62%, rgba(255,200,60,0) 71%)' }, { type: 'img', props: { src: emblem, width: 260, height: 260 } })
        : h('div', { height: 260 }),
      h('div', { marginTop: 18, fontSize: 52, letterSpacing: 10, paddingLeft: 10, whiteSpace: 'nowrap', justifyContent: 'center', textAlign: 'center', color: '#ffc83c', textShadow: '0 0 20px rgba(255,200,60,0.6)' }, 'FIFTH FLOOR ARCADE'),
      h(
        'div',
        {
          marginTop: 26, fontSize: 40, letterSpacing: 6, color: '#00e5ff', padding: '10px 28px',
          border: '4px solid #00e5ff', borderRadius: 12, textShadow: '0 0 16px rgba(0,229,255,0.7)',
        },
        `${game} · ${modeLabel}`,
      ),
      h(
        'div',
        {
          marginTop: 44, fontSize: handleSize, letterSpacing: 3, color: '#ff4fa3',
          textShadow: '0 0 30px rgba(255, 79, 163, 0.85), 6px 6px 0 #1a0b2e',
        },
        handle,
      ),
      h(
        'div',
        { alignItems: 'flex-end', marginTop: 0 },
        h(
          'div',
          { fontSize: scoreSize, lineHeight: 1, color: '#ffd34d', textShadow: '0 0 50px rgba(255, 200, 60, 0.75), 10px 10px 0 #3a1260' },
          score,
        ),
        h('div', { fontSize: 52, marginLeft: 22, marginBottom: 46, color: '#f2f0ea', fontFamily: body, fontWeight: 600 }, 'PTS'),
      ),
    ),
    // chips on the floor
    h(
      'div',
      { position: 'absolute', left: 40, right: 40, top: HORIZON + (chips.length > 2 ? 46 : 70), justifyContent: 'center', flexWrap: 'wrap' },
      ...chips.map((c) =>
        h(
          'div',
          {
            // three chips wrap to two rows → compact so they clear the footer
            margin: chips.length > 2 ? '0 8px 12px' : '0 12px 18px',
            padding: chips.length > 2 ? '10px 22px' : '14px 30px',
            fontSize: chips.length > 2 ? 32 : 40,
            letterSpacing: 3, color: c.color,
            background: 'rgba(10, 6, 20, 0.82)', border: `4px solid ${c.color}`, borderRadius: 14,
          },
          c.text,
        ),
      ),
    ),
    // footer (kept above the bottom ~250px that story UIs cover)
    h(
      'div',
      { position: 'absolute', left: 0, right: 0, top: 1560, flexDirection: 'column', alignItems: 'center' },
      h('div', { fontSize: 66, color: '#ffffff', letterSpacing: 4, textShadow: '0 0 22px rgba(0,229,255,0.9)' }, 'CAN YOU BEAT IT?'),
      h('div', { marginTop: 14, fontSize: 34, fontFamily: body, fontWeight: 600, color: '#00e5ff' }, `Play free at ${host}`),
    ),
  )

  return new ImageResponse(root as unknown as ConstructorParameters<typeof ImageResponse>[0], {
    width: 1080,
    height: 1920,
    fonts,
  })
}

/** Buffer the PNG so a render failure becomes an uncached 500 instead of a cached empty 200. */
export async function GET(req: Request): Promise<Response> {
  try {
    const storyId = new URL(req.url).searchParams.get('story')
    let img: ImageResponse | null
    if (storyId) {
      img = await renderStory(req, storyId.slice(0, 40))
      if (!img) return new Response('not_found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
    } else {
      img = await render(req)
    }
    const buf = await img.arrayBuffer()
    if (!buf.byteLength) throw new Error('empty_image')
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        // Story cards carry live ranks → short CDN life; challenge cards are effectively static.
        'Cache-Control': storyId
          ? 'public, max-age=30, s-maxage=60, stale-while-revalidate=300'
          : 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
      },
    })
  } catch (err) {
    console.error('[arcade-og] render failed', err)
    return new Response('og_error', { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
