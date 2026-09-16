type TrackPayload = Record<string, string | number | boolean | undefined>;

/**
 * Analytics stub (M1). Console-logs in development; no-op network for now.
 * Swap for a real sink in M6+ without changing call sites.
 */
export function track(event: string, payload: TrackPayload = {}): void {
  if (process.env.NODE_ENV === "development") {
    console.log("[arcade:track]", event, payload);
  }
}
