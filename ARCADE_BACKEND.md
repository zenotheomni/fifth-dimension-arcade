# Fifth Floor Arcade — Backend

Supabase project: **PRODUCTION - 5D Landing Page** (`czqkpxxbqleoiicumneu`, us-east-2).

All arcade objects are prefixed `arcade_`. Existing landing-page tables (e.g. `waitlist`) are never modified.

## Migrations applied

1. `arcade_init` — tables, indexes, seed games, RLS
2. `arcade_rpcs` — helpers + `arcade_register_player` / `arcade_submit_score`
3. `arcade_leaderboard_rpcs` — challenges, leaderboards, grants
4. `arcade_advisor_fixes` — FK indexes, revoke direct SELECT, deny-all RLS policies

SQL copies live in `supabase/migrations/`.

## Tables

| Table | Purpose |
|-------|---------|
| `arcade_players` | Anonymous handle + `device_id`; optional `user_id` for future Auth |
| `arcade_games` | Data-driven registry (`court-vision`, `fifth-run`, …) |
| `arcade_scores` | Score events (mode, meta, optional challenge/contest) |
| `arcade_challenges` | Short-slug friend challenges |
| `arcade_contests` | Timed giveaway / drop windows |

## Security

- RLS enabled on every arcade table.
- **No** direct `SELECT`/`INSERT`/`UPDATE`/`DELETE` for `anon` / `authenticated`.
- Writes and leaderboard reads go through `SECURITY DEFINER` RPCs with `search_path` locked.
- Anti-cheat: per-game score caps, max 12 submits / device / minute.
- Client + Vercel use **publishable anon key only** (no service role).

### RPCs (EXECUTE granted to anon)

- `arcade_register_player(handle, device_id)`
- `arcade_submit_score(game_id, mode, score, meta, device_id, challenge_id, contest_id)`
- `arcade_create_challenge(game_id, mode, device_id, target_score, seed)`
- `arcade_get_challenge(id)`
- `arcade_leaderboard(game_id, window, mode, contest_id, limit)` — `weekly` (America/New_York ISO week), `alltime`, `contest`
- `arcade_personal_best(device_id, game_id, mode)`
- `arcade_list_games()`
- `arcade_list_active_contests(game_id)`

## HTTP API (Vercel)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/scores` | Registers handle if provided, then submits |
| POST | `/api/challenges` | Returns `{ id, url, challenge }` |
| GET | `/api/challenges/:id` | Challenge + attempts |
| GET | `/api/leaderboard?game=&window=&contest=&mode=` | Weekly / all-time / contest |
| GET | `/api/games` | Game registry |
| GET | `/api/personal-best?game=&deviceId=&mode=` | PB for device |

Challenge share URLs use `ARCADE_PUBLIC_BASE_URL` (default `https://5dimperial.com/arcade`) → `/challenge/<id>`.

## Env vars

See `.env.example`. Set on Vercel for Production + Preview:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `ARCADE_PUBLIC_BASE_URL`
- `VITE_ARCADE_PUBLIC_BASE_URL`

## Client data layer

- `src/arcade/core/{identity,scores,challenges,config}.ts`
- `src/arcade/leaderboard/` — `useLeaderboard`, `useChallenge`, `usePersonalBest`, `useArcadeGames`
