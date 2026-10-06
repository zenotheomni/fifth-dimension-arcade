import type { VercelRequest, VercelResponse } from '@vercel/node'
import { challengePublicUrl } from './_lib/config.js'
import { str } from './_lib/http.js'
import { getSupabase } from './_lib/supabase.js'

/**
 * GET /arcade/challenge/:id (rewritten here) — serves the SPA shell with OG/Twitter meta
 * baked in so iMessage / WhatsApp / X previews show the challenge card. The SPA boots normally.
 */

let shellCache: { html: string; at: number } | null = null

async function getShell(origin: string): Promise<string> {
  if (shellCache && Date.now() - shellCache.at < 5 * 60_000) return shellCache.html
  const r = await fetch(`${origin}/arcade/index.html`, { headers: { 'x-arcade-shell': '1' } })
  if (!r.ok) throw new Error(`shell_${r.status}`)
  const html = await r.text()
  shellCache = { html, at: Date.now() }
  return html
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = str(req.query.id, 16) ?? ''
  const host = str(req.headers['x-forwarded-host'], 200) ?? str(req.headers.host, 200) ?? 'fifth-dimension-arcade.vercel.app'
  const proto = str(req.headers['x-forwarded-proto'], 8) ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  const origin = `${proto}://${host}`

  let handle: string | null = null
  let score: number | null = null
  if (/^[a-zA-Z0-9_-]{6,16}$/.test(id)) {
    try {
      const { data } = await getSupabase().rpc('arcade_challenge_view', { p_id: id })
      const c = data as { creator_handle?: string; target_score?: number } | null
      if (c?.creator_handle) {
        handle = c.creator_handle
        score = c.target_score ?? null
      }
    } catch {
      /* fall back to generic meta */
    }
  }

  const title = handle
    ? `${handle} scored ${score} in Court Vision. Can you beat it?`
    : 'Court Vision Challenge · Fifth Floor Arcade'
  const description = 'Same court, same sway, same wind. 60 seconds. Tap to play — no download.'
  const image = `${origin}/api/og?id=${encodeURIComponent(id)}${score != null ? `&s=${score}` : ''}`
  const url = id ? challengePublicUrl(id) : `${origin}/arcade`

  const meta = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Fifth Floor Arcade" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ].join('\n    ')

  try {
    let html = await getShell(origin)
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    html = html.replace('</head>', `    ${meta}\n  </head>`)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300')
    return res.status(200).send(html)
  } catch (e) {
    console.error('[challenge-page] shell fetch failed', (e as Error).message)
    // Minimal fallback that still unfurls and forwards to the SPA.
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res
      .status(200)
      .send(
        `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>\n    ${meta}\n<meta http-equiv="refresh" content="0;url=/arcade/"></head><body></body></html>`,
      )
  }
}
