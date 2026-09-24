import { useCallback, useEffect, useState } from 'react'
import {
  fetchChallenge,
  fetchGames,
  fetchLeaderboard,
  fetchPersonalBest,
} from './api'
import type {
  ArcadeGame,
  ChallengePayload,
  LeaderboardPayload,
  LeaderboardWindow,
  PersonalBestPayload,
} from './types'

type AsyncState<T> = {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

function useAsync<T>(
  loader: () => Promise<T>,
  depsKey: string,
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    loader()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'error')
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tick, depsKey, loader])

  return { data, error, loading, reload }
}

export function useLeaderboard(opts: {
  game: string
  window?: LeaderboardWindow
  mode?: string
  contest?: string
  limit?: number
  enabled?: boolean
}): AsyncState<LeaderboardPayload> {
  const enabled = opts.enabled !== false
  const depsKey = [
    opts.game,
    opts.window ?? 'weekly',
    opts.mode ?? '',
    opts.contest ?? '',
    String(opts.limit ?? 25),
    String(enabled),
  ].join('|')

  const loader = useCallback(() => {
    if (!enabled || !opts.game) {
      return Promise.resolve({
        game_id: opts.game,
        window: opts.window ?? 'weekly',
        mode: opts.mode ?? null,
        entries: [],
      })
    }
    return fetchLeaderboard({
      game: opts.game,
      window: opts.window,
      mode: opts.mode,
      contest: opts.contest,
      limit: opts.limit,
    })
  }, [
    enabled,
    opts.game,
    opts.window,
    opts.mode,
    opts.contest,
    opts.limit,
  ])

  return useAsync(loader, depsKey)
}

export function usePersonalBest(opts: {
  game: string
  mode?: string
  enabled?: boolean
}): AsyncState<PersonalBestPayload> {
  const enabled = opts.enabled !== false
  const depsKey = [opts.game, opts.mode ?? '', String(enabled)].join('|')

  const loader = useCallback(() => {
    if (!enabled || !opts.game) {
      return Promise.resolve({
        found: false,
        game_id: opts.game,
        mode: opts.mode ?? null,
        score: 0,
      })
    }
    return fetchPersonalBest({ game: opts.game, mode: opts.mode })
  }, [enabled, opts.game, opts.mode])

  return useAsync(loader, depsKey)
}

export function useChallenge(
  id: string | null | undefined,
): AsyncState<ChallengePayload> {
  const depsKey = id ?? ''
  const loader = useCallback(() => {
    if (!id) {
      return Promise.reject(new Error('missing_id'))
    }
    return fetchChallenge(id)
  }, [id])

  return useAsync(loader, depsKey)
}

export function useArcadeGames(enabled = true): AsyncState<ArcadeGame[]> {
  const depsKey = String(enabled)
  const loader = useCallback(
    () => (enabled ? fetchGames() : Promise.resolve([])),
    [enabled],
  )
  return useAsync(loader, depsKey)
}
