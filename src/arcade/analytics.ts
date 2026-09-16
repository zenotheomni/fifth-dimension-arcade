type TrackPayload = Record<string, string | number | boolean | undefined>

/**
 * Analytics stub (M1). Console-logs in dev; no-op network for now.
 * Swap for real sink in M6+ without changing call sites.
 *
 * Court Vision M2 events (call sites):
 * - arcade_court_vision_view
 * - arcade_court_vision_endless_view
 * - arcade_court_vision_run_start
 * - arcade_court_vision_shot
 * - arcade_court_vision_nudge
 * - arcade_court_vision_run_end
 * - arcade_court_vision_end_door
 */
export function track(event: string, payload: TrackPayload = {}): void {
  // eslint-disable-next-line no-console
  console.log('[arcade:track]', event, payload)
  // no-op sink placeholder
  void payload
}
