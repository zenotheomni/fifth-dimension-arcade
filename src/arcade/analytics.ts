type TrackPayload = Record<string, string | number | boolean | undefined>

/**
 * Analytics stub (M1). Console-logs in dev; no-op network for now.
 * Swap for real sink in M6+ without changing call sites.
 */
export function track(event: string, payload: TrackPayload = {}): void {
  // eslint-disable-next-line no-console
  console.log('[arcade:track]', event, payload)
  // no-op sink placeholder
  void payload
}
