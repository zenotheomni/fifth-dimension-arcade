import { useSyncExternalStore } from 'react'

type State = { unread: number; nonce: number }
let state: State = { unread: 0, nonce: 0 }
const subs = new Set<() => void>()

export function setUnread(n: number) {
  if (n === state.unread) return
  state = { ...state, unread: n }
  subs.forEach((s) => s())
}

/** Ask the AlertsCenter to poll now (after sending/accepting a challenge, etc.). */
export function requestAlertsRefresh() {
  state = { ...state, nonce: state.nonce + 1 }
  subs.forEach((s) => s())
}

function subscribe(cb: () => void) {
  subs.add(cb)
  return () => subs.delete(cb)
}

export function useAlertStore(): State {
  return useSyncExternalStore(subscribe, () => state, () => state)
}
