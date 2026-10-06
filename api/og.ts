import { ImageResponse } from '@vercel/og'

/**
 * GET /api/og?id=<challengeId> — 1200×630 challenge card (handle, score, game, branding).
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
  'fifth-run': 'Fifth Run',
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
  const bodyText = `${line} Same court. 60 seconds. PTS`
  const [inter] = await Promise.all([loadFont('Inter:wght@600', bodyText)])
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
      h('div', { marginTop: 8, fontSize: 26, fontFamily: body, fontWeight: 600, color: 'rgba(242,240,234,0.82)' }, `${line} Same court. 60 seconds.`),
    ),
  )

  return new ImageResponse(root as unknown as ConstructorParameters<typeof ImageResponse>[0], {
    width: 1200,
    height: 630,
    fonts,
  })
}

/** Buffer the PNG so a render failure becomes an uncached 500 instead of a cached empty 200. */
export async function GET(req: Request): Promise<Response> {
  try {
    const buf = await (await render(req)).arrayBuffer()
    if (!buf.byteLength) throw new Error('empty_image')
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
      },
    })
  } catch (err) {
    console.error('[arcade-og] render failed', err)
    return new Response('og_error', { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
