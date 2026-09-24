/**
 * Minimal unstyled debug view for leaderboard wiring.
 * Not used in production lobby — safe to import from a debug route later.
 */
import { useLeaderboard } from './hooks'

export function DebugLeaderboard(props: {
  game: string
  window?: 'weekly' | 'alltime' | 'contest'
}) {
  const { data, error, loading, reload } = useLeaderboard({
    game: props.game,
    window: props.window ?? 'weekly',
  })

  if (loading) return <pre>loading…</pre>
  if (error) return <pre>error: {error}</pre>
  return (
    <div>
      <button type="button" onClick={reload}>
        reload
      </button>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}
