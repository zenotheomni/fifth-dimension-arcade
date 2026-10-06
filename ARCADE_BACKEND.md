# Fifth Floor Arcade — Backend

Supabase project: **PRODUCTION - 5D Landing Page** (`czqkpxxbqleoiicumneu`, us-east-2).

All arcade objects are prefixed `arcade_`. Existing landing-page tables (`waitlist`, `stream_sessions`, auth/storage) are never touched.

## Migrations applied

1. `arcade_init` — tables, indexes, seed games, RLS
2. `arcade_rpcs` — helpers + `arcade_register_player` / `arcade_submit_score`
3. `arcade_leaderboard_rpcs` — challenges, leaderboards, grants
4. `arcade_advisor_fixes` — FK indexes, revoke direct SELECT, deny-all RLS policies
5. `arcade_identity_tokens` — device token auth, case-insensitive handles, reserved handles + one-time claim codes
6. `arcade_rivals_alerts_tables` — boards, challenge entries, rivalries, seed tickets, alerts, push subscriptions/log, server keys
7. `arcade_rivals_alerts_rpcs` — session/claim/board/run/challenge/rivals/inbox/push RPCs
8. `arcade_revoke_legacy_rpcs` — revoke client EXECUTE on token-less legacy RPCs (`arcade_register_player`, `arcade_submit_score`, `arcade_create_challenge`, `arcade_get_challenge`, `arcade_personal_best`)
9. `arcade_contests_v2_tables` — giveaway columns on `arcade_contests` (prize image, rules, how-to-claim, winner count, auto-announce, test flag, end/announce timestamps), `arcade_contest_winners`, `arcade_admin_log`, `contest_won` alert kind
10. `arcade_contests_v2_rpcs` — contest status/board/ticker/score-card RPCs, winner announce + finalize, admin-key-gated admin RPCs

SQL copies live in `supabase/migrations/`. Data rows that carry secrets' hashes (the GoForNow reservation, the push and admin server-key hashes) were inserted directly and are intentionally not in the repo.

## Tables

| Table | Purpose |
|-------|---------|
| `arcade_players` | Handle (unique on `lower(handle)`) + `device_id`; `is_guest` for auto `RookieNNNN` handles |
| `arcade_player_secrets` | sha256 of the per-device player token |
| `arcade_reserved_handles` | System-reserved handles + claimable reservations (`claim_code_hash`, one-time) |
| `arcade_games` | Data-driven registry (`court-vision`, `fifth-run`, …) |
| `arcade_boards` | Per-game leaderboard config (modes counted, size = 5, label) |
| `arcade_scores` | Every score event (all kept; boards show one best per player). `run_id` makes submits idempotent |
| `arcade_challenges` | Short-slug challenges; `opponent_player_id` for directed rematches, `parent_challenge_id` chains |
| `arcade_challenge_entries` | Per-player challenge state: started → finished, result win/loss/tie |
| `arcade_rivalries` | One row per player pair + game: wins/ties, last result, last played |
| `arcade_seed_tickets` | Server-issued sway/wind seeds for set-the-bar + rematch runs |
| `arcade_alerts` | Inbox: `rival_started`, `rival_finished`, `your_turn`, `contest_won` (+ push status) |
| `arcade_push_subscriptions` / `arcade_push_log` | Web Push endpoints + per-send log |
| `arcade_server_keys` | sha256 of server-only keys (`push`: push dequeue/report + contest finalize; `admin`: admin RPCs) |
| `arcade_contests` | Giveaways: game, window, prize (+ image), rules, how-to-claim, winner count, `is_active` (= published), `auto_announce`, `is_test` |
| `arcade_contest_winners` | Announced winners: place, handle snapshot, score, one-time claim code, contacted / admin note |
| `arcade_admin_log` | Admin actions (create / update / end / announce / winner update) |

## Security

- RLS enabled on every arcade table with restrictive deny-all policies; table grants revoked from `anon`/`authenticated`.
- All writes go through `SECURITY DEFINER` RPCs (`search_path` locked) that verify the player token (`device_id` + token, sha256 compared).
- Handles: 3–16 chars `[A-Za-z0-9_]`, case-insensitive unique, reserved list, basic profanity filter (leet-normalized).
- Rate limits: 12 runs/min/player, 20 challenges/hr, 30 seed tickets/hr, 40 challenge starts/hr, 60 new players/min global, 6 pushes/recipient/hr, 5 push subscriptions/player.
- Per-game score caps; challenge runs use the 60s cap. Duplicate `run_id` → no double count.
- Client + Vercel use the **publishable anon key only**. Push dequeue/report RPCs require `ARCADE_PUSH_SERVER_KEY`.
- Handles are **device-bound** (token in localStorage) until real accounts/native app exist.

### Public RPCs (EXECUTE granted to anon)

`arcade_session`, `arcade_set_handle`, `arcade_claim_handle`, `arcade_board`, `arcade_issue_ticket`, `arcade_challenge_from_score`, `arcade_challenge_start`, `arcade_submit_run`, `arcade_challenge_view`, `arcade_rivals`, `arcade_inbox`, `arcade_inbox_read`, `arcade_push_subscribe`, `arcade_push_unsubscribe`, `arcade_push_dequeue`*, `arcade_push_report`* (*server-key gated), plus read-only `arcade_leaderboard`, `arcade_list_games`, `arcade_list_active_contests`, `arcade_contests_public`, `arcade_contest_board`, `arcade_ticker`, `arcade_score_card`; server-key gated `arcade_contest_finalize`*; admin-key gated `arcade_admin_contests`, `arcade_admin_contest_save`, `arcade_admin_contest_end`, `arcade_admin_contest_announce`, `arcade_admin_contest_board`, `arcade_admin_winner_update`.

## Giveaway contests

- Status is derived: `upcoming` → `live` (inside `[starts_at, ends_at)`) → `ended` → `winners_announced`.
- Contest board = best run per player whose `created_at` falls inside the window (board modes only, e.g. Court Vision 60s).
- Winner reveal: when a contest with `auto_announce` ends, the next `contests` / `admin-contests` call (or the daily `contest-tick` cron backstop, 13:00 UTC) runs `arcade_contest_finalize`: top *N* get a `contest_won` alert (in-app + Web Push) carrying a one-time claim code `FF-XXXXXXXX`, and the menu banner flips to "Winner: <handle>". Players have no contact info, so the claim code is the proof of win — admin sees the same code.
- `is_test` contests are hidden from players unless the request has `preview=1` (the app sets it after visiting `/arcade/?preview=contests`; `?preview=off` clears it). Use them for QA instead of real contests.
- Admin UI: `/arcade/admin` (noindex). Key sent as `X-Arcade-Admin`; the API compares it against `ARCADE_ADMIN_KEY` (sha256, constant time) and the RPCs re-check it against the sha256 in `arcade_server_keys` (`admin`). The key value is never in code or the DB.
- Story score card: `/api/og?story=<scoreId>` renders a 1080×1920 PNG server-side from the saved run (handle, score, game, best streak, top-5 rank, live-contest rank) — it can't be forged from the client.

## HTTP API (Vercel)

All in one function: `/api/arcade/:action` (rewritten to `api/arcade.ts?action=`). Auth headers: `X-Arcade-Device`, `X-Arcade-Token`.

| Method | Action | Notes |
|--------|--------|-------|
| POST | `session` | Create/resume device player → `{player:{player_id, handle, is_guest, token?}}` |
| POST | `handle` / `claim` | Set handle / claim reserved handle with `{code}` |
| GET | `board?game=&window=alltime\|weekly\|contest&contest=&playerId=` | Top 5 + `me` rank (`window=contest` needs `contest=<id>`) |
| GET | `contests?playerId=` | Live/upcoming/recent giveaways (finalizes due ones first) |
| GET | `ticker` | Best-per-player weekly/all-time top 5 per game + the featured contest |
| GET | `contest-tick` | Cron backstop: announce due contests |
| GET | `admin-contests`, `admin-board?id=` | Admin (header `X-Arcade-Admin`) |
| POST | `admin-save` `{contest}`, `admin-end` `{id}`, `admin-announce` `{id}`, `admin-winner` `{contestId, place, contacted, note}` | Admin |
| POST | `run` | Submit any run (normal, challenge, ticket). Returns board ranks, match result, created challenge |
| POST | `ticket` | Seeded set-the-bar / rematch (`rivalPlayerId`, `parentChallengeId`) |
| POST | `challenge-from-score` | Turn a fresh 60s score into a shareable challenge |
| GET | `challenge?id=&viewer=` | Challenge + entries + head-to-head |
| POST | `challenge-start` | Mark started → alerts the creator |
| GET | `rivals` / `inbox?after=` | Rivals with records + turn status / alerts |
| POST | `inbox-read`, `push-subscribe`, `push-unsubscribe` | |
| GET | `push-config` | VAPID public key |

Other routes: `/api/og?id=` (1200×630 challenge card), `/api/og?story=<scoreId>` (1080×1920 story card), `/arcade/challenge/:id` → `api/challenge-page.ts` (index.html + OG/Twitter meta), `/api/leaderboard`, `/api/games` (lobby ticker).

## Alerts

- In-app: `AlertsCenter` polls the inbox every 20s while visible → toasts + Rivals badge.
- Web Push: `public/sw.js` (scope `/arcade/`), VAPID keys in Vercel env. RPCs queue alerts; the API flushes them (`api/_lib/push.ts`) right after a state change. Permission is requested only after sending/accepting a challenge.
- iOS/iPadOS: push only when installed to the Home Screen (16.4+); the app shows an "Add to Home Screen" tip.

## Env vars

See `.env.example`. Production + Preview:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `ARCADE_PUBLIC_BASE_URL`, `VITE_ARCADE_PUBLIC_BASE_URL`
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (secret), `VAPID_SUBJECT`
- `ARCADE_PUSH_SERVER_KEY` (secret; its sha256 is in `arcade_server_keys`)
- `ARCADE_ADMIN_KEY` (secret; unlocks `/arcade/admin`; its sha256 is in `arcade_server_keys` as `admin`). Rotate by setting a new value in Vercel and updating the hash row.
- optional `ARCADE_PUSH_DRY_RUN=1`

## Challenge public base URL

Until `5dimperial.com/arcade` is proxied to this Vercel project, `ARCADE_PUBLIC_BASE_URL` / `VITE_ARCADE_PUBLIC_BASE_URL` = `https://fifth-dimension-arcade.vercel.app/arcade`. Flip both via env once DNS/proxy is live.
