/** True when the event target (or focus) is a text field — game keys must not steal A/W/S/D/etc. */
export function isTypingTarget(target: EventTarget | null | undefined): boolean {
  const el =
    (target instanceof Element ? target : null) ??
    (typeof document !== 'undefined' ? document.activeElement : null)
  if (!el || !(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return Boolean(el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))
}
