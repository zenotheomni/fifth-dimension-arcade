import { challengePublicUrl } from './config'

export { challengePublicUrl }

const GAME_TITLES: Record<string, string> = { 'court-vision': 'Court Vision', 'fifth-run': 'Fifth Run' }

export function challengeShareText(handle: string, score: number, game = 'court-vision'): string {
  return `${handle} scored ${score} in ${GAME_TITLES[game] ?? 'Court Vision'}. Can you beat it?`
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

/** Web Share sheet (iOS/Android/desktop Safari) with a clipboard fallback. */
export async function shareOrCopy(text: string, url: string): Promise<ShareOutcome> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title: 'Fifth Floor Arcade challenge', text, url })
      return 'shared'
    }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return 'cancelled'
    /* NotAllowedError etc. — fall through to copy */
  }
  return (await copyText(`${text} ${url}`)) ? 'copied' : 'failed'
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
